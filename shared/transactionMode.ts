// What a document counts towards.
//
// THREE modes, and the difference between the last two is the whole point:
//
//   "real"      an ordinary trade. Counts for everything.
//
//   "demo"      practice. Counts for nothing, anywhere.
//
//   "opening"   a balance carried in from before the system existed. A customer
//               already owed QAR 5,000 on invoices raised on paper; a supplier is
//               already owed for goods delivered last month.
//
// An OPENING document must count towards what is OWED — it is real money and the
// customer really has to pay it — but must NOT count towards PROFIT. Nobody sold
// anything today. Those old invoices carry no cost lines, so counting them as
// profit would report the entire outstanding balance as pure margin and make
// every profit figure nonsense from day one.
//
// Two questions, two answers. Never collapse them into one filter.

export type TransactionMode = "real" | "demo" | "opening";

export interface HasTransactionMode {
  transactionMode?: string | null;
}

/** Did we actually sell something here? Profit, margin and COGS use this. */
export function countsForProfit(doc: HasTransactionMode): boolean {
  const m = doc.transactionMode;
  return m !== "demo" && m !== "opening";
}

/** Is this real money someone owes or is owed? Balances, receivables, payables,
 *  ageing and credit limits use this. Opening balances belong here. */
export function countsForBalance(doc: HasTransactionMode): boolean {
  return doc.transactionMode !== "demo";
}

/** A carried-in balance rather than a sale made in this system. */
export function isOpeningBalance(doc: HasTransactionMode): boolean {
  return doc.transactionMode === "opening";
}
