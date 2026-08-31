/* ── PIN storage ──────────────────────────────────────────────────────────────
   PINs used to sit in the users table as plain digits. Two consequences the owner
   never agreed to:

     1. Anyone who could open the database read every PIN in the business.
     2. A PIN plus a username is enough to reset that person's password through
        "Forgot password?" — so anyone who watched a manager type their PIN at the
        counter could take over that account.

   They are now scrambled with bcrypt, exactly like passwords, and nothing reads
   one back. Verification compares; it never decrypts, because it cannot.

   This lives in its own file rather than in auth.ts because storage.ts needs it
   too, and auth.ts already imports from storage.ts — putting it in either one
   would make the two files import each other. */

import bcrypt from "bcryptjs";

/** Scramble a PIN for storage. One-way: there is no matching "read it back". */
export function hashPin(pin: string): string {
  return bcrypt.hashSync(String(pin).trim(), 10);
}

/** Does this PIN match the stored scramble? False when nothing is stored yet,
 *  so an account with no PIN can never be opened by guessing. */
export function pinMatches(pin: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  return bcrypt.compareSync(String(pin ?? "").trim(), storedHash);
}
