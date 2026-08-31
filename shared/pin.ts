/* ── PIN rules ────────────────────────────────────────────────────────────────
   A PIN is not a convenience code. It authorises a discount at the counter and,
   through "Forgot password?", it is what lets someone set a new password on their
   own account. So it is a credential, and it is treated like one: stored scrambled
   (see server/pin.ts), never returned to the browser, and unique per person.

   Unique matters because a supervisor override is looked up BY PIN. Two people
   sharing one makes every approval unattributable — you could never say which of
   them approved the discount.

   The rules themselves live here, with no database and no bcrypt, so they can be
   tested directly. */

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

/** Obvious PINs. Someone watching over a shoulder guesses these first. */
const WEAK_PINS = new Set([
  "1234", "12345", "123456",
  "0123", "01234", "012345",
  "4321", "54321", "654321",
]);

/** Returns a human-readable reason the PIN is not acceptable, or null if it is.
 *  The message is shown to the person choosing the PIN, so it says what to do
 *  rather than just what is wrong. */
export function pinProblem(rawPin: string): string | null {
  const pin = String(rawPin ?? "").trim();

  if (!new RegExp(`^[0-9]{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin)) {
    return `PIN must be ${PIN_MIN_LENGTH} to ${PIN_MAX_LENGTH} digits.`;
  }
  if (WEAK_PINS.has(pin) || new Set(pin).size === 1) {
    return "Choose a less obvious PIN — not a sequence like 1234 or the same digit repeated.";
  }
  return null;
}

/** Convenience wrapper for the places that just want a yes/no. */
export function isAcceptablePin(rawPin: string): boolean {
  return pinProblem(rawPin) === null;
}
