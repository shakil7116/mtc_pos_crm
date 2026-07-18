// Phase 7 — JWT session auth (Go-Live blocker 1).
// Token in an httpOnly cookie; role/store come from the verified token, never
// from client headers. Dev fallback to x-user-* headers exists ONLY when
// ALLOW_DEV_HEADERS=1 and no valid token is present (must be off in production).
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { normalizeRole } from "@shared/permissions";
import { createNotification } from "./storage";

const COOKIE = "mtc_token";
const SHIFT_HOURS = 8;          // normal shift token
const REMEMBER_DAYS = 30;       // "remember me"
const MAX_FAILS = 5;            // lock after N wrong passwords
const LOCK_MINUTES = 10;

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

export type AuthUser = { id: number; role: string; storeId: number | null; name: string; mustChangePassword?: boolean };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export function signToken(u: { id: number; role: string; storeId: number | null; tokenVersion: number }, rememberMe = false): string {
  return jwt.sign(
    { uid: u.id, role: u.role, storeId: u.storeId, tv: u.tokenVersion },
    secret(),
    { expiresIn: rememberMe ? `${REMEMBER_DAYS}d` : `${SHIFT_HOURS}h` },
  );
}

export function setTokenCookie(res: Response, token: string, rememberMe = false): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,                                  // not readable from JS — not spoofable
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: (rememberMe ? REMEMBER_DAYS * 24 : SHIFT_HOURS) * 3600 * 1000,
    path: "/",
  });
}

export function clearTokenCookie(res: Response): void {
  res.clearCookie(COOKIE, { path: "/" });
}

/** Attach req.user from a valid JWT. Verifies tokenVersion so an admin role
 *  change / password reset invalidates existing sessions immediately. */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = (req as any).cookies?.[COOKIE];
    if (raw) {
      const payload = jwt.verify(raw, secret()) as any;
      const [u] = await db.select().from(users).where(eq(users.id, Number(payload.uid)));
      if (u && u.active !== false && Number(payload.tv) === Number(u.tokenVersion)) {
        req.user = {
          id: u.id, role: normalizeRole(u.role), storeId: u.storeId ?? null,
          name: u.name, mustChangePassword: !!u.mustChangePassword,
        };
      }
    }
  } catch { /* invalid/expired token → unauthenticated */ }

  // Dev/test harness fallback — explicit opt-in only, never in production.
  if (!req.user && process.env.ALLOW_DEV_HEADERS === "1" && req.headers["x-user-role"]) {
    req.user = {
      id: Number(req.headers["x-user-id"]) || 0,
      role: normalizeRole((req.headers["x-user-role"] as string) || undefined),
      storeId: null, name: "dev-header",
    };
  }
  next();
}

/** Login with username+password. Locks the account for 10 minutes after
 *  MAX_FAILS wrong passwords and alerts the admin. */
export async function login(usernameRaw: string, password: string, rememberMe: boolean, res: Response) {
  const username = String(usernameRaw || "").trim().toLowerCase();
  const [u] = await db.select().from(users).where(eq(users.username, username));
  if (!u || u.active === false) return { ok: false as const, status: 401, message: "Wrong username or password." };

  if (u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(u.lockedUntil).getTime() - Date.now()) / 60000);
    return { ok: false as const, status: 423, message: `Account locked. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  const valid = u.passwordHash ? bcrypt.compareSync(String(password || ""), u.passwordHash) : false;
  if (!valid) {
    const fails = (u.failedAttempts || 0) + 1;
    const patch: any = { failedAttempts: fails };
    if (fails >= MAX_FAILS) {
      patch.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      patch.failedAttempts = 0;
      await createNotification({
        targetRole: "admin", type: "login_lockout", title: "Login lockout",
        message: `${u.name} (${username}) locked for ${LOCK_MINUTES} min after ${MAX_FAILS} failed password attempts.`,
        link: "/settings", entityType: "user", entityId: u.id,
      });
    }
    await db.update(users).set(patch).where(eq(users.id, u.id));
    return {
      ok: false as const, status: 401,
      message: fails >= MAX_FAILS ? `Too many attempts — locked for ${LOCK_MINUTES} minutes.` : "Wrong username or password.",
    };
  }

  await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, u.id));
  const token = signToken({ id: u.id, role: u.role, storeId: u.storeId ?? null, tokenVersion: u.tokenVersion }, rememberMe);
  setTokenCookie(res, token, rememberMe);
  return {
    ok: true as const,
    user: {
      id: u.id, name: u.name, role: normalizeRole(u.role), storeId: u.storeId ?? null,
      mustChangePassword: !!u.mustChangePassword,
    },
  };
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error("User not found");
  if (String(newPassword || "").length < 8) throw new Error("Password must be at least 8 characters.");
  const valid = u.passwordHash ? bcrypt.compareSync(String(currentPassword || ""), u.passwordHash) : false;
  if (!valid) throw new Error("Current password is wrong.");
  await db.update(users).set({
    passwordHash: bcrypt.hashSync(newPassword, 10),
    mustChangePassword: false,
    tokenVersion: (u.tokenVersion || 0) + 1, // old tokens die
  }).where(eq(users.id, userId));
}

/** Admin resets any user's password → temp password, forced change, sessions invalidated. */
export async function adminResetPassword(targetUserId: number, newPassword: string) {
  if (String(newPassword || "").length < 8) throw new Error("Password must be at least 8 characters.");
  const [u] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!u) throw new Error("User not found");
  await db.update(users).set({
    passwordHash: bcrypt.hashSync(newPassword, 10),
    mustChangePassword: true,
    tokenVersion: (u.tokenVersion || 0) + 1,
    failedAttempts: 0, lockedUntil: null,
  }).where(eq(users.id, targetUserId));
}

/** Bump on role change → forces re-login everywhere. */
export async function invalidateUserSessions(userId: number) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (u) await db.update(users).set({ tokenVersion: (u.tokenVersion || 0) + 1 }).where(eq(users.id, userId));
}
