import { type Role, normalizeRole } from '@shared/permissions';

// Phase 7: the session lives in an httpOnly JWT cookie the browser can't read.
// The client keeps a NON-authoritative cache of the current user (from /api/auth/me)
// only for UI rendering. All authorization is enforced server-side from the token.
const SESSION_KEY = 'mtc_session';

export type SessionUser = {
  id: number;
  name: string;
  role: Role;
  storeId: number | null;
  mustChangePassword?: boolean;
};

export function getCachedUser(): SessionUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const u = JSON.parse(raw);
    return { ...u, role: normalizeRole(u.role) };
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function setCachedUser(user: {
  id: number; name: string; role: string; storeId: number | null; mustChangePassword?: boolean;
}): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, role: normalizeRole(user.role) }));
}

export function clearCachedUser(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** Ask the server who we are (verifies the cookie). Refreshes the UI cache. */
export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) { clearCachedUser(); return null; }
    const { user } = await res.json();
    if (!user) { clearCachedUser(); return null; }
    const su: SessionUser = { ...user, role: normalizeRole(user.role) };
    setCachedUser(su);
    return su;
  } catch {
    return getCachedUser(); // offline: fall back to the cached identity
  }
}

// Back-compat aliases (older imports).
export const getSession = getCachedUser;
export const clearSession = clearCachedUser;
export const setSession = setCachedUser;

export function isAdmin(): boolean {
  return getCachedUser()?.role === 'admin';
}
