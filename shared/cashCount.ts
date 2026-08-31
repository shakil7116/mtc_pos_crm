/* ── Counting the drawer at close ─────────────────────────────────────────────
   The oldest hole in retail: a cash sale that never gets entered. No system can
   prevent it. What a system CAN do is make it visible — count the money in the
   drawer at close, compare it with what the day says was taken, and record the
   difference every single day.

   One day being QAR 30 short is nothing. The same till being short every day is
   the only evidence anybody will ever get, and it does not exist until somebody
   writes the number down.

   The maths lives here, alone and pure: the screen adds up the notes while the
   person counts, and the server checks the same arithmetic when it saves.
──────────────────────────────────────────────────────────────────────────────*/

/** Qatari riyal notes and coins, biggest first — the order a drawer is counted in. */
export const QAR_DENOMINATIONS = [500, 100, 50, 10, 5, 1, 0.5, 0.25] as const;

export type Denomination = (typeof QAR_DENOMINATIONS)[number];
/** How many of each note: { "500": 2, "100": 7, … } */
export type CashBreakdown = Record<string, number | string>;

const round = (n: number) => Number(n.toFixed(2));

/** Add up a drawer from its notes and coins. */
export function breakdownTotal(breakdown: CashBreakdown | null | undefined): number {
  if (!breakdown) return 0;
  let total = 0;
  for (const [value, count] of Object.entries(breakdown)) {
    const v = Number(value);
    const n = Number(count);
    if (!Number.isFinite(v) || !Number.isFinite(n) || n < 0) continue;
    total += v * n;
  }
  return round(total);
}

/** Only the denominations actually present, for the record. */
export function cleanBreakdown(breakdown: CashBreakdown | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [value, count] of Object.entries(breakdown || {})) {
    const n = Number(count);
    if (Number.isFinite(n) && n > 0) out[String(Number(value))] = n;
  }
  return out;
}

export type CashDifference = {
  expected: number;
  counted: number;
  /** Counted minus expected. Positive = more money than the day accounts for. */
  difference: number;
  direction: "over" | "short" | "exact";
};

/** What the drawer says against what the day says. */
export function cashDifference(counted: number | string, expected: number | string): CashDifference {
  const c = Number(counted) || 0;
  const e = Number(expected) || 0;
  const difference = round(c - e);
  return {
    expected: round(e), counted: round(c), difference,
    direction: Math.abs(difference) < 0.005 ? "exact" : difference > 0 ? "over" : "short",
  };
}

/** What the till should hold, from the day's movements. */
export function expectedCash(
  openingFloat: number | string, cashIn: number | string, cashOut: number | string,
): number {
  return round((Number(openingFloat) || 0) + (Number(cashIn) || 0) - (Number(cashOut) || 0));
}

/** Small differences happen — a rounded riyal, a tip in the tray. Past the
 *  tolerance somebody has to say what they think happened. */
export function needsExplanation(
  diff: CashDifference, tolerance: number | string | null | undefined,
): boolean {
  const limit = Number(tolerance);
  if (!Number.isFinite(limit) || limit < 0) return Math.abs(diff.difference) > 0;
  return Math.abs(diff.difference) > limit;
}

/** How much is left in the drawer for tomorrow, and how much goes to the bank. */
export function splitClose(
  counted: number | string, closingFloat: number | string,
): { keep: number; bank: number } {
  const c = Number(counted) || 0;
  const keep = Math.max(0, Math.min(Number(closingFloat) || 0, c));
  return { keep: round(keep), bank: round(c - keep) };
}

/** One line for the record and the alert. */
export function describeCashCount(diff: CashDifference, storeName?: string): string {
  const where = storeName ? ` at ${storeName}` : "";
  if (diff.direction === "exact") return `Till${where} counted exactly — QAR ${diff.counted.toFixed(2)}`;
  const word = diff.direction === "short" ? "SHORT" : "OVER";
  return `Till${where} ${word} by QAR ${Math.abs(diff.difference).toFixed(2)} — ` +
    `counted ${diff.counted.toFixed(2)}, expected ${diff.expected.toFixed(2)}`;
}
