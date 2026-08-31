/* ── One thing swapped for another ────────────────────────────────────────────
   The owner's own example: a customer needs white, and somebody hands over the
   white bought earlier instead — same size, same price, never went through the
   system. Nothing was sold, so nothing was recorded.

   Months later a count shows one product short and another over, and nobody
   alive can connect the two. Two wrong shelves instead of one honest swap, and
   the reorder buys the wrong colour.

   So a swap becomes a single action with both halves in it: what went out, what
   came in, and the difference in value between them. Doing it properly has to be
   FASTER than not doing it, or people will keep swapping quietly.

   The difference is the only part that can hide a loss — swapping cement for a
   tin of paint would be theft with extra steps — so that is what is checked, not
   the act itself.
──────────────────────────────────────────────────────────────────────────────*/

export type SwapInput = {
  outProductId: number;
  outName?: string;
  outQty: number | string;
  outCost?: number | string | null;
  outUnit?: string | null;
  inProductId: number;
  inName?: string;
  inQty: number | string;
  inCost?: number | string | null;
  inUnit?: string | null;
};

export type Swap = {
  outQty: number;
  inQty: number;
  outValue: number;
  inValue: number;
  /** Out minus in. POSITIVE = the business gave away more than it got back. */
  difference: number;
  /** How far apart the two sides are, as a share of the bigger one. */
  driftPct: number;
  even: boolean;
};

const round = (n: number, dp = 2) => Number(n.toFixed(dp));
const num = (v: any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Read a swap, or say plainly why it is not one. */
export function readSwap(input: SwapInput): Swap {
  const outId = Number(input.outProductId);
  const inId = Number(input.inProductId);
  if (!outId || !inId) throw new Error("A swap needs both sides — what went out, and what came in.");
  if (outId === inId) {
    throw new Error(
      "Both sides are the same product. If the quantity is simply wrong, count the " +
      "shelf instead — that is a correction, not a swap.");
  }

  const outQty = Number(input.outQty);
  const inQty = Number(input.inQty);
  if (!Number.isFinite(outQty) || !Number.isFinite(inQty)) throw new Error("Both quantities must be numbers.");
  if (outQty <= 0 || inQty <= 0) throw new Error("Both sides of a swap need a quantity greater than zero.");

  const outValue = round(outQty * num(input.outCost));
  const inValue = round(inQty * num(input.inCost));
  const difference = round(outValue - inValue);
  const biggest = Math.max(outValue, inValue);
  const driftPct = biggest > 0 ? round((Math.abs(difference) / biggest) * 100, 1) : 0;

  return {
    outQty: round(outQty, 4), inQty: round(inQty, 4),
    outValue, inValue, difference, driftPct,
    even: Math.abs(difference) < 0.005,
  };
}

/** A swap where both sides are worth about the same is what staff already do all
 *  day, and it should take one screen. A swap with a big gap between the sides is
 *  where value can disappear, so that one waits for somebody else to agree. */
export function swapNeedsApproval(
  swap: Swap,
  threshold: number | string | null | undefined,
): boolean {
  const limit = Number(threshold);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return Math.abs(swap.difference) >= limit;
}

/** One line for the movement log, the approval request and the notification. */
export function describeSwap(
  swap: Swap, outName: string, inName: string, storeName?: string,
): string {
  const where = storeName ? ` at ${storeName}` : "";
  const gap = swap.even
    ? "same value"
    : swap.difference > 0
      ? `QAR ${swap.difference.toFixed(2)} down`
      : `QAR ${Math.abs(swap.difference).toFixed(2)} up`;
  return `${swap.outQty} × ${outName} out, ${swap.inQty} × ${inName} in${where} (${gap})`;
}
