/* ── First run: the very first admin account ──────────────────────────────────
   A fresh copy of this app — downloaded, cloned, or restored onto a new machine —
   has no accounts in it at all. Somebody has to be able to walk up to it ONCE and
   become the owner. After that the owner creates everybody else from Settings, and
   this door closes: registerOwner refuses the moment an admin exists.

   The rules live here, not in the server, because the setup screen has to apply the
   SAME ones while the owner types. A username rule that only exists on the server
   tells them "already taken" after they clicked Create, with the password fields
   already wiped.

   The one that matters most: THE OWNER SIGNS IN WITH A USERNAME, NOT AN EMAIL.
   The first version of this screen derived the username silently from the email and
   never showed it, so the owner finished setup, logged out, and could not get back
   in — they had never been told what to type. So the username is chosen, shown, and
   repeated on the final screen. */

import { passwordProblem } from "./password";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

/** Lowercase, strip anything that is not a letter, digit, dot, dash or underscore.
 *  Usernames are typed at a counter, often on a phone — spaces and capitals are
 *  the two things people get wrong, so neither is allowed to exist. */
export function normalizeUsername(raw: string): string {
  return String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

/** A first suggestion from whatever the owner has already typed — the part of the
 *  email before the @, falling back to their name. Only ever a suggestion: it is
 *  put in the field for them to accept or replace. */
export function suggestUsername(emailOrName: string): string {
  const raw = String(emailOrName ?? "").trim();
  const base = raw.includes("@") ? raw.split("@")[0] : raw.split(/\s+/)[0];
  return normalizeUsername(base).slice(0, USERNAME_MAX_LENGTH);
}

/** What is wrong with this username, in words. null means it is fine. */
export function usernameProblem(raw: string): string | null {
  const u = String(raw ?? "").trim();
  if (!u) return "Choose a username — this is what you type to sign in.";
  if (/\s/.test(u)) return "Username cannot contain spaces.";
  if (u !== u.toLowerCase()) return "Username must be all lowercase.";
  if (!/^[a-z0-9._-]+$/.test(u)) return "Username can use letters, numbers, dot, dash and underscore only.";
  if (u.length < USERNAME_MIN_LENGTH) return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
  if (u.length > USERNAME_MAX_LENGTH) return `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

export function emailProblem(raw: string): string | null {
  const e = String(raw ?? "").trim();
  if (!e) return "Enter an email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  return null;
}

export type OwnerAccountInput = {
  name?: string;
  email?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
};

/** Every rule for the first admin account, in the order the owner reads the form.
 *  Returns the FIRST problem so one message points at one field. null = good to go.
 *
 *  confirmPassword is only checked when it is supplied — the server never receives
 *  it, so it is the screen's own check, run through the same function. */
export function ownerAccountProblem(input: OwnerAccountInput): string | null {
  if (!String(input.name ?? "").trim()) return "Enter your full name.";
  const email = emailProblem(String(input.email ?? ""));
  if (email) return email;

  const username = String(input.username ?? "").trim();
  const uname = usernameProblem(username);
  if (uname) return uname;

  const pw = passwordProblem(String(input.password ?? ""), username);
  if (pw) return pw;

  if (input.confirmPassword !== undefined && input.password !== input.confirmPassword) {
    return "Passwords don't match.";
  }
  return null;
}
