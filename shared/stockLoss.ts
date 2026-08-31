/* ── What actually arrived ────────────────────────────────────────────────────
   A transfer used to be received by clicking one button, and the system added
   the quantity that was SENT. If 100 bags left and 70 arrived, the destination
   was credited with 100 — so the 30 that vanished were never a shortage, they
   were a phantom 30 bags sitting on a shelf in the reports.

   That is the single biggest reason a location turns out to be ~30% short when
   it is finally emptied. The gap was never recorded on the day it happened.

   So receipt now takes a counted quantity per line, and the difference is a
   LOSS: a quantity AND a value, attributed to the two people at either end.

   The maths lives here, alone and pure, because two different things read it —
   the screen showing the shortage before you confirm, and the server writing it
   down afterwards. They must never disagree about the number.
──────────────────────────────────────────────────────────────────────────────*/

/** How a loss came to be recorded. One list, so every kind of loss can be
 *  totalled together and told apart in a report. */
export const LOSS_KINDS = [
  "transfer_shortage",   // sent 100, 70 arrived
  "count_variance",      // a stocktake found less than the system said
  "damage",              // broken, hardened, water-damaged
  "write_off",           // written off deliberately (e.g. closing a location)
  "swap_difference",     // one thing exchanged for another, and the two sides differed
] as const;
export type LossKind = (typeof LOSS_KINDS)[number];

export type SentLine = {
  id: number;
  productId: number | null;
  description: string;
  unit?: string | null;
  /** What left the source. */
  qty: number;
  /** Cost carried by the transfer line; 0 for a same-owner move. */
  linePrice?: number | null;
  /** The product's standing cost — used when the line carries no value. */
  productCost?: number | null;
};

export type CountedLine = { id: number; receivedQty: number | string };

export type ReconciledLine = {
  id: number;
  productId: number | null;
  description: string;
  unit: string | null;
  sent: number;
  received: number;
  /** Positive when less arrived than was sent. Never negative. */
  short: number;
  unitCost: number;
  lossValue: number;
};

export type Reconciliation = {
  lines: ReconciledLine[];
  totalSent: number;
  totalReceived: number;
  totalShort: number;
  lossValue: number;
  hasShortage: boolean;
  shortLines: number;
};

const round = (n: number, dp = 2) => Number(n.toFixed(dp));

/** A same-owner transfer is priced at zero, because moving your own stock
 *  between your own buildings earns nothing. But a bag lost on that trip cost
 *  exactly as much as one lost on a cross-owner trip, so the value falls back
 *  to what the product costs. */
export function lineUnitCost(line: SentLine): number {
  const priced = Number(line.linePrice ?? 0);
  if (Number.isFinite(priced) && priced > 0) return priced;
  const cost = Number(line.productCost ?? 0);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

/** Work out what is missing. `counted` may cover some lines, all of them, or
 *  none — a line nobody counted is taken as having arrived in full, which is
 *  what one-click receipt has always meant. */
export function reconcileReceipt(
  sent: SentLine[],
  counted?: CountedLine[] | null,
): Reconciliation {
  const byId = new Map<number, CountedLine>();
  for (const c of counted || []) {
    if (c && c.id != null) byId.set(Number(c.id), c);
  }

  const lines: ReconciledLine[] = (sent || []).map((s) => {
    const sentQty = Number(s.qty) || 0;
    const entry = byId.get(Number(s.id));

    let received = sentQty;
    if (entry !== undefined && entry.receivedQty !== null && entry.receivedQty !== undefined && entry.receivedQty !== "") {
      const n = Number(entry.receivedQty);
      if (!Number.isFinite(n)) {
        throw new Error(`How many of ${s.description} arrived? That is not a number.`);
      }
      if (n < 0) {
        throw new Error(`${s.description}: a received quantity cannot be less than none.`);
      }
      if (n > sentQty + 0.0001) {
        throw new Error(
          `${s.description}: ${n} cannot arrive when only ${sentQty} was sent. ` +
          `If more turned up, it belongs on its own transfer.`);
      }
      received = n;
    }

    const short = round(Math.max(0, sentQty - received), 4);
    const unitCost = lineUnitCost(s);
    return {
      id: Number(s.id),
      productId: s.productId ?? null,
      description: s.description,
      unit: s.unit ?? null,
      sent: sentQty,
      received: round(received, 4),
      short,
      unitCost: round(unitCost, 4),
      lossValue: round(short * unitCost),
    };
  });

  const sum = (f: (l: ReconciledLine) => number) => round(lines.reduce((a, l) => a + f(l), 0), 4);
  const totalShort = sum((l) => l.short);

  return {
    lines,
    totalSent: sum((l) => l.sent),
    totalReceived: sum((l) => l.received),
    totalShort,
    lossValue: round(lines.reduce((a, l) => a + l.lossValue, 0)),
    hasShortage: totalShort > 0.0001,
    shortLines: lines.filter((l) => l.short > 0.0001).length,
  };
}

/* ── A stocktake, priced ──────────────────────────────────────────────────────
   Counting a shelf produces a variance. Recorded as a quantity it is a note;
   recorded as money it is the difference between a real profit figure and a
   flattering one.

   A count can go BOTH ways. Finding 3 more than the system said is not a loss —
   it is usually an earlier mistake correcting itself, and pretending it never
   happened would overstate what material really costs the business. So a
   surplus is stored as a NEGATIVE loss and nets against the shortfalls, the way
   a credit nets against debits. The month's figure is then what actually went,
   not the sum of everything that ever looked wrong.
──────────────────────────────────────────────────────────────────────────────*/

export type Variance = {
  /** Signed: negative when less was found than the system said. */
  qty: number;
  unitCost: number;
  /** Signed the same way as qty. Positive = a real loss. */
  value: number;
  direction: "short" | "surplus" | "exact";
  /** True when there is anything at all to record. */
  recordable: boolean;
};

/** What a count found, in money. `before` is what the system claimed,
 *  `counted` is what the person counted. */
export function varianceLoss(before: number, counted: number, unitCost: number): Variance {
  const diff = round(Number(counted) - Number(before), 4);      // + found more, − found less
  const cost = Number.isFinite(Number(unitCost)) && Number(unitCost) > 0 ? Number(unitCost) : 0;
  const lost = round(-diff, 4);                                  // + is a loss, matching the ledger
  return {
    qty: lost,
    unitCost: round(cost, 4),
    value: round(lost * cost),
    direction: Math.abs(diff) < 0.0001 ? "exact" : diff < 0 ? "short" : "surplus",
    recordable: Math.abs(diff) >= 0.0001,
  };
}

/** Does this one need to reach the owner? A steady trickle of small variances is
 *  normal in a builders' yard; one big one is a question that needs asking today. */
export function shouldAlertLoss(value: number, threshold: number | string | null | undefined): boolean {
  const limit = Number(threshold);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return Math.abs(Number(value) || 0) >= limit;
}

/** Plain words for what a count found, for the movement log and the alert. */
export function describeVariance(v: Variance, before: number, counted: number): string {
  if (!v.recordable) return `Counted ${counted}; the system agreed`;
  const word = v.direction === "short" ? "short" : "more than expected";
  return `Counted ${counted}; system had ${before} — ${Math.abs(v.qty)} ${word}` +
    (v.unitCost > 0 ? ` (QAR ${Math.abs(v.value).toFixed(2)})` : "");
}

/** A shortage without a reason is just a smaller number — in six months nobody
 *  remembers whether it was breakage, a miscount, or a bag that never left. */
export function requireShortageReason(r: Reconciliation, reason?: string | null): void {
  if (!r.hasShortage) return;
  const text = String(reason ?? "").trim();
  if (text.length < 3) {
    throw new Error(
      `${r.totalShort} item(s) are missing, worth QAR ${r.lossValue.toFixed(2)}. ` +
      `Say what happened before confirming — that note is the only record there will be.`);
  }
}
