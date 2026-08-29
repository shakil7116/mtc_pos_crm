/* ── The one-day undo window ──────────────────────────────────────────────────
   Deleting a store or a warehouse does not erase it. It is hidden, and for one
   day it can be brought back exactly as it was.

   Why a day: a mistake is noticed the same working day — the wrong row clicked,
   the wrong branch chosen. After that, a location nobody has used is genuinely
   rubbish and is cleared out. A location that HAS been used is never erased at
   all: invoices, stock moves and expenses point at it, and erasing it would
   destroy the record of where those things happened. It simply stays hidden.

   The maths lives here, alone and pure, so the countdown on screen and the
   clean-up on the server can never disagree about when the day is up.
──────────────────────────────────────────────────────────────────────────────*/

export const UNDO_WINDOW_HOURS = 24;
export const UNDO_WINDOW_MS = UNDO_WINDOW_HOURS * 60 * 60 * 1000;

const toMs = (t: Date | string | number): number =>
  t instanceof Date ? t.getTime() : typeof t === "number" ? t : new Date(t).getTime();

/** The moment the undo runs out, as a timestamp. */
export function undoDeadline(deletedAt: Date | string | number): number {
  return toMs(deletedAt) + UNDO_WINDOW_MS;
}

/** Milliseconds of undo left. Never negative — once it is up, it is 0. */
export function undoMsLeft(
  deletedAt: Date | string | number,
  now: number = Date.now(),
): number {
  const left = undoDeadline(deletedAt) - now;
  return left > 0 ? left : 0;
}

/** Can this still be brought back by the one-day rule? */
export function isUndoable(
  deletedAt: Date | string | number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!deletedAt) return false;
  const ms = toMs(deletedAt);
  if (!Number.isFinite(ms)) return false;
  return undoMsLeft(ms, now) > 0;
}

/** Plain words for the countdown: "23h 40m left", "18m left", "time is up". */
export function formatUndoLeft(
  deletedAt: Date | string | number,
  now: number = Date.now(),
): string {
  const ms = undoMsLeft(deletedAt, now);
  if (ms <= 0) return "time is up";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m left`;
  return "less than a minute left";
}
