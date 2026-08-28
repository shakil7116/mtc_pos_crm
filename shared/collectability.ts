// How likely a customer's debt is to be collected.
//
// Eleven years of trust-based trading with freelance contractors leaves balances
// that will never be recovered — people who left the country, one-man operations
// that folded. There is no security cheque to fall back on. Reporting all of it
// as an asset makes the business look richer than it is.
//
// THE JUDGEMENT IS ABOUT BEHAVIOUR, NOT SIZE. A customer owing QAR 50,000 who
// pays 40-60% of it every month is one of the best accounts there is. A customer
// owing QAR 3,000 who stopped answering two years ago is the problem. Never mark
// an account doubtful because the number is large.
//
// And mark it from what HAPPENED, not what is feared: a month of live trading
// tells you who pays. Guessing up front just moves the fiction somewhere else.

export type Collectability = "normal" | "doubtful" | "written_off";

export const COLLECTABILITY: Collectability[] = ["normal", "doubtful", "written_off"];

export const COLLECTABILITY_LABEL: Record<Collectability, string> = {
  normal: "Expected",
  doubtful: "Doubtful",
  written_off: "Written off",
};

export const COLLECTABILITY_HELP: Record<Collectability, string> = {
  normal: "Expected to be collected. Counts as money the business is owed.",
  doubtful: "Might never be collected. Still chased, but reported separately so the receivables figure stays honest.",
  written_off: "Gone. Left out of receivables entirely, but kept on the record — if they ever pay, it still lands correctly.",
};

export function normalizeCollectability(v?: string | null): Collectability {
  return (COLLECTABILITY as string[]).includes(v || "") ? (v as Collectability) : "normal";
}

/** Does this debt count as an asset the business expects to realise? */
export function countsAsReceivable(v?: string | null): boolean {
  return normalizeCollectability(v) === "normal";
}

/** Split a set of customer balances into what is expected, doubtful and written off. */
export function splitReceivables<T extends { balance: number; collectability?: string | null }>(
  rows: T[],
): {
  expected: number; doubtful: number; writtenOff: number; total: number;
  counts: { normal: number; doubtful: number; written_off: number };
} {
  let expected = 0, doubtful = 0, writtenOff = 0;
  const counts = { normal: 0, doubtful: 0, written_off: 0 };
  for (const r of rows) {
    const bal = Number(r.balance) || 0;
    const status = normalizeCollectability(r.collectability);
    counts[status]++;
    if (bal <= 0) continue;
    if (status === "normal") expected += bal;
    else if (status === "doubtful") doubtful += bal;
    else writtenOff += bal;
  }
  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    expected: r2(expected),
    doubtful: r2(doubtful),
    writtenOff: r2(writtenOff),
    total: r2(expected + doubtful + writtenOff),
    counts,
  };
}
