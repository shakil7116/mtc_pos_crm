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
import { hashPin, pinMatches } from "./pin";
import { passwordProblem } from "@shared/password";
import { normalizeUsername, ownerAccountProblem, suggestUsername } from "@shared/setup";

const COOKIE_BASE = "mtc_token";
const COOKIE = process.env.COOKIE_SUFFIX ? `${COOKIE_BASE}_${process.env.COOKIE_SUFFIX}` : COOKIE_BASE;
const SHIFT_HOURS = 8;          // normal shift token
const REMEMBER_DAYS = 30;       // "remember me"
const MAX_FAILS = 5;            // lock after N wrong passwords
const LOCK_MINUTES = 10;

// ── Password strength ────────────────────────────────────────────────────────
// The per-account lockout stops guessing a *specific* account; this stops staff
// from setting a weak/known password in the first place. Applied on every change.
// The rules themselves live in shared/password.ts so the setup and change-password
// SCREENS can apply exactly the same ones before they submit.
export function assertStrongPassword(pw: string, username?: string): void {
  const problem = passwordProblem(pw, username);
  if (problem) throw new Error(problem);
}

// ── Login rate limiter (per IP) ──────────────────────────────────────────────
// Complements the per-account lockout: blocks brute-force that rotates usernames
// from one source IP. In-memory sliding window — fine for a single instance.
const rlBuckets = new Map<string, number[]>();
export function loginRateLimit(maxAttempts = 30, windowMs = 15 * 60_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0];
    const ip = String(fwd || req.ip || (req.socket as any)?.remoteAddress || "unknown").trim();
    const now = Date.now();
    const hits = (rlBuckets.get(ip) || []).filter((t) => now - t < windowMs);
    if (hits.length >= maxAttempts) {
      res.status(429).json({ message: "Too many attempts from this device. Please wait a few minutes and try again." });
      return;
    }
    hits.push(now);
    rlBuckets.set(ip, hits);
    // Occasional GC so the map can't grow unbounded from one-off IPs.
    if (rlBuckets.size > 5000) rlBuckets.forEach((v, k) => { if (!v.some((t: number) => now - t < windowMs)) rlBuckets.delete(k); });
    next();
  };
}

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
  // NODE_ENV is checked as well as the flag: the comment above used to be the only
  // thing keeping this out of production. One mis-set env var and anyone could send
  // x-user-role: admin and be an admin. Now the code enforces what the comment claims.
  if (!req.user && process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_HEADERS === "1" && req.headers["x-user-role"]) {
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
      mustChangePin: !!u.mustChangePin,
    },
  };
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error("User not found");
  assertStrongPassword(newPassword, u.username || undefined);
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
  const [u] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!u) throw new Error("User not found");
  assertStrongPassword(newPassword, u.username || undefined);
  await db.update(users).set({
    passwordHash: bcrypt.hashSync(newPassword, 10),
    mustChangePassword: true,
    tokenVersion: (u.tokenVersion || 0) + 1,
    failedAttempts: 0, lockedUntil: null,
  }).where(eq(users.id, targetUserId));
}

/** Verify a user's own login password — used to re-auth an admin before they
 *  modify ANOTHER admin's credentials. Returns false if the user has no password. */
export async function verifyUserPassword(userId: number, password: string): Promise<boolean> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return !!(u?.passwordHash && bcrypt.compareSync(String(password || ""), u.passwordHash));
}

/** Bump on role change → forces re-login everywhere. */
export async function invalidateUserSessions(userId: number) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (u) await db.update(users).set({ tokenVersion: (u.tokenVersion || 0) + 1 }).where(eq(users.id, userId));
}

/** Recover password using username + PIN. Rate-limited via the same lockout logic. */
export async function recoverPassword(usernameRaw: string, pin: string, newPassword: string, res: Response) {
  const username = String(usernameRaw || "").trim().toLowerCase();
  const [u] = await db.select().from(users).where(eq(users.username, username));
  if (!u || u.active === false) return { ok: false as const, status: 401, message: "Account not found." };

  if (u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(u.lockedUntil).getTime() - Date.now()) / 60000);
    return { ok: false as const, status: 423, message: `Account locked. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  if (!pinMatches(String(pin), u.pinHash)) {
    const fails = (u.failedAttempts || 0) + 1;
    const patch: any = { failedAttempts: fails };
    if (fails >= MAX_FAILS) {
      patch.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      patch.failedAttempts = 0;
    }
    await db.update(users).set(patch).where(eq(users.id, u.id));
    return { ok: false as const, status: 401, message: "Incorrect PIN." };
  }

  if (String(newPassword || "").length < 8) return { ok: false as const, status: 400, message: "Password must be at least 8 characters." };

  await db.update(users).set({
    passwordHash: bcrypt.hashSync(newPassword, 10),
    mustChangePassword: false,
    failedAttempts: 0, lockedUntil: null,
    tokenVersion: (u.tokenVersion || 0) + 1,
  }).where(eq(users.id, u.id));

  const token = signToken({ id: u.id, role: u.role, storeId: u.storeId ?? null, tokenVersion: (u.tokenVersion || 0) + 1 });
  setTokenCookie(res, token);
  return {
    ok: true as const,
    user: { id: u.id, name: u.name, role: normalizeRole(u.role), storeId: u.storeId ?? null, mustChangePassword: false, mustChangePin: false },
  };
}

/** Register the very first admin account — the ONLY account that can be created
 *  without already being signed in as an admin.
 *
 *  Three things this has to get right, because a fresh install has nobody to ask:
 *
 *  1. It closes for good. The moment one admin exists this returns 409, so the
 *     open door on a brand-new copy is not an open door on a running business.
 *  2. The owner CHOOSES and IS TOLD their username. Sign-in is by username, not
 *     email. This used to derive one silently from the email and never show it,
 *     which locked the owner out of their own system the first time they logged
 *     out. The username comes back in the response so the screen can print it.
 *  3. The first admin gets the same password rules as everyone else. It is the
 *     most powerful account in the business; it was the only one exempt. */
export async function registerOwner(
  data: { name: string; email: string; username?: string; password: string },
  res: Response,
) {
  const existing = await db.select().from(users).where(eq(users.role, "admin"));
  if (existing.length > 0) return { ok: false as const, status: 409, message: "An admin account already exists. Ask that admin to create your account." };

  const name = String(data?.name ?? "").trim();
  const email = String(data?.email ?? "").trim().toLowerCase();
  const username = normalizeUsername(data?.username || suggestUsername(email));
  const password = String(data?.password ?? "");

  const problem = ownerAccountProblem({ name, email, username, password });
  if (problem) return { ok: false as const, status: 400, message: problem };

  const clash = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (clash.length) return { ok: false as const, status: 409, message: `Username "${username}" is already taken — choose another.` };

  let u;
  try {
    [u] = await db.insert(users).values({
      name,
      email,
      username,
      role: "admin",
      // The owner is given a random PIN they are never told, so it is useless to
      // them: they could not approve a discount with it and — worse — could not use
      // "Forgot password?", which needs the PIN. mustChangePin sends them straight
      // to the Set PIN screen so the very first admin has a PIN they actually know.
      pinHash: hashPin(String(Math.floor(1000 + Math.random() * 9000))),
      passwordHash: bcrypt.hashSync(password, 10),
      mustChangePassword: false,
      mustChangePin: true,
      tokenVersion: 0,
    }).returning();
  } catch (err) {
    // Two setup screens open at once, or a username that slipped past the check a
    // moment ago: the database's own unique index is the last word. Say what to do
    // rather than showing a raw constraint error.
    return { ok: false as const, status: 409, message: `Could not create that account — the username "${username}" may already be taken. Try another.` };
  }

  const token = signToken({ id: u.id, role: u.role, storeId: u.storeId ?? null, tokenVersion: u.tokenVersion }, false);
  setTokenCookie(res, token, false);
  return {
    ok: true as const,
    user: {
      id: u.id, name: u.name, username: u.username, role: u.role, storeId: u.storeId ?? null,
      mustChangePassword: false, mustChangePin: true,
    },
  };
}
