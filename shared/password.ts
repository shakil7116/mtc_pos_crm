/* ── Password rules ───────────────────────────────────────────────────────────
   The per-account lockout stops someone guessing at ONE account; these rules stop
   staff choosing a password that never needed guessing in the first place.

   They live in shared/ so the screen and the server apply the same ones. A rule
   that only exists on the server tells the owner "too weak" AFTER they clicked
   Create — by which point the form has already thrown their typing away. */

const WEAK_PASSWORDS = new Set([
  "test123", "test1234", "password", "password1", "passw0rd", "12345678", "123456789",
  "1234567890", "qwerty123", "11111111", "00000000", "abc12345", "admin123", "welcome1",
  "iloveyou", "letmein1", "changeme", "mtc12345",
]);

export const PASSWORD_MIN_LENGTH = 8;

/** What is wrong with this password, in words the owner can act on.
 *  null means it is acceptable. */
export function passwordProblem(rawPassword: string, username?: string): string | null {
  const p = String(rawPassword ?? "");
  if (p.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (WEAK_PASSWORDS.has(p.toLowerCase())) return "That password is too common — pick something harder to guess.";
  if (username && p.toLowerCase() === String(username).toLowerCase()) return "Password must be different from the username.";
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return "Password must include both letters and numbers.";
  return null;
}

/** Convenience for the places that just want a yes/no. */
export function isAcceptablePassword(rawPassword: string, username?: string): boolean {
  return passwordProblem(rawPassword, username) === null;
}
