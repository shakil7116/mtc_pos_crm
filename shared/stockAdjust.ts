/* ── Changing a quantity by hand ──────────────────────────────────────────────
   The most dangerous door in the system, and until now it had no lock on it at
   all: no role check, the staff name taken from the REQUEST rather than from
   who was signed in, an optional reason, and "transfer" as a reason code — two
   calls and stock moved between stores with no document, no approval and no
   receipt.

   Which meant the audit trail on every other control was not evidence. A person
   could remove 40 bags and file it under somebody else's name.

   The rules live here so the screen and the server enforce exactly the same
   ones. Nothing in this file touches the database; it only decides what is
   allowed and what it is worth.
──────────────────────────────────────────────────────────────────────────────*/

/** Why stock was added by hand. */
export const ADD_REASONS = ["purchase", "return", "correction", "add"] as const;

/** Why stock was taken off by hand. */
export const REMOVE_REASONS = ["damaged", "expired", "lost", "correction", "remove"] as const;

export type AddReason = (typeof ADD_REASONS)[number];
export type RemoveReason = (typeof REMOVE_REASONS)[number];

/** Reasons that mean material physically LEFT — these have to reach the loss
 *  ledger, or the value quietly disappears. "correction" does not: it means the
 *  figure was wrong, not that anything went anywhere. */
export const LOSING_REASONS: string[] = ["damaged", "expired", "lost", "remove"];

/** Moving stock between locations is a TRANSFER — a document, an approval and a
 *  receipt where somebody counts what arrived. Doing it as two hand adjustments
 *  skips all three, so it is refused here by name. */
export const FORBIDDEN_REASONS: string[] = ["transfer", "sale", "count"];

export type Adjustment = {
  direction: "add" | "remove";
  /** Always positive — how many. */
  qty: number;
  /** Signed for the stock ledger: negative takes stock away. */
  signed: number;
  reasonCode: string;
  /** |qty| × unit cost. What this is worth. */
  value: number;
  /** True when material is leaving and the loss must be recorded. */
  isLoss: boolean;
};

const round = (n: number, dp = 2) => Number(n.toFixed(dp));

/** Read a hand adjustment, or say plainly why it cannot be one.
 *
 *  Accepts either a signed `qtyChange` (what the screens have always sent) or a
 *  positive `qty` with a `direction`. When both are given they have to agree —
 *  a mismatch means somebody's form is wrong, and guessing which half to trust
 *  is how stock ends up moving the wrong way. */
export function readAdjustment(input: {
  qtyChange?: number | string | null;
  qty?: number | string | null;
  direction?: string | null;
  reasonCode?: string | null;
  unitCost?: number | string | null;
}): Adjustment {
  const code = String(input.reasonCode ?? "").trim().toLowerCase();
  if (!code) throw new Error("Choose a reason — a quantity change with no reason cannot be checked later.");
  if (FORBIDDEN_REASONS.includes(code)) {
    throw new Error(
      code === "transfer"
        ? "Moving stock between locations is a transfer, not a hand adjustment. " +
          "Use Transfer, so it gets a voucher, an approval, and somebody counting what arrives."
        : `"${code}" is not something you set by hand — it is written by the system when it happens.`);
  }

  const rawSigned = input.qtyChange === undefined || input.qtyChange === null || input.qtyChange === ""
    ? null : Number(input.qtyChange);
  const rawQty = input.qty === undefined || input.qty === null || input.qty === ""
    ? null : Number(input.qty);
  const dir = input.direction ? String(input.direction).toLowerCase() : null;

  if (rawSigned !== null && !Number.isFinite(rawSigned)) throw new Error("The quantity must be a number.");
  if (rawQty !== null && !Number.isFinite(rawQty)) throw new Error("The quantity must be a number.");
  if (rawSigned === null && rawQty === null) throw new Error("How many?");

  let signed: number;
  if (rawSigned !== null) {
    signed = rawSigned;
    if (dir === "add" && signed < 0) throw new Error("This says add, but the quantity is negative.");
    if (dir === "remove" && signed > 0) throw new Error("This says remove, but the quantity is positive.");
  } else {
    if (dir !== "add" && dir !== "remove") throw new Error("Is this adding stock or taking it off?");
    signed = dir === "remove" ? -Math.abs(rawQty!) : Math.abs(rawQty!);
  }

  if (Math.abs(signed) < 0.0001) throw new Error("A change of nothing is not a change.");

  const direction: "add" | "remove" = signed < 0 ? "remove" : "add";

  // The reason has to match the direction, or the movement log lies: "Customer
  // Return" against stock going OUT reads as a return that removed stock.
  const allowed: readonly string[] = direction === "add" ? ADD_REASONS : REMOVE_REASONS;
  if (!allowed.includes(code)) {
    throw new Error(
      `"${code}" is not a reason for ${direction === "add" ? "adding" : "removing"} stock. ` +
      `Pick one of: ${allowed.join(", ")}.`);
  }

  const cost = Number(input.unitCost ?? 0);
  const qty = round(Math.abs(signed), 4);

  return {
    direction, qty, signed: round(signed, 4), reasonCode: code,
    value: round(qty * (Number.isFinite(cost) && cost > 0 ? cost : 0)),
    isLoss: direction === "remove" && LOSING_REASONS.includes(code),
  };
}

/** Does this one need a second pair of eyes before it happens?
 *
 *  Only removals — adding stock you found does not destroy anything. Above the
 *  threshold it becomes a request in the approvals inbox instead of a change. */
export function needsSecondPerson(
  adj: Adjustment,
  threshold: number | string | null | undefined,
): boolean {
  if (adj.direction !== "remove") return false;
  const limit = Number(threshold);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return adj.value >= limit;
}

/** One line for the movement log and the approval request. */
export function describeAdjustment(adj: Adjustment, productName: string, storeName?: string): string {
  const where = storeName ? ` at ${storeName}` : "";
  const worth = adj.value > 0 ? ` (QAR ${adj.value.toFixed(2)})` : "";
  return `${adj.direction === "add" ? "Add" : "Remove"} ${adj.qty} × ${productName}${where}${worth}`;
}
