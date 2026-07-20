// Invoice type — TWO types only, computed from actual payment data. There is no
// third type; PDC is a payment method under Credit Invoice, never its own type.
//
//   CASH INVOICE   — paid in FULL using ONLY Cash/Card/Online Transfer, zero PDC,
//                    zero remaining balance.
//   CREDIT INVOICE — everything else: any remaining balance (unpaid/partial), OR
//                    ANY PDC cheque involved in any amount (an uncleared cheque
//                    means payment has not truly been received).
//
// Recalculation (this runs live on every read, so no stored/stale value):
//   • A Credit Invoice settled later via cash/card/online only (no PDC ever) →
//     relabels to Cash Invoice.
//   • ANY PDC ever involved → Credit Invoice PERMANENTLY — even after the cheque
//     clears (type reflects HOW it was paid, not just current settled status).
//   • A PDC cheque that bounces → stays Credit Invoice with an open balance.

export type InvoiceTypeLabel = "Cash Invoice" | "Credit Invoice";

export interface TenderForLabel { method: string; amount: number | string; isRefund?: boolean | null; }
export interface ChequeForLabel { amount: number | string; status: string; type?: string | null; }

const num = (v: any): number => Number(v) || 0;

export function computeInvoiceType(
  total: number | string,
  payments: TenderForLabel[] = [],
  cheques: ChequeForLabel[] = [],
): InvoiceTypeLabel {
  // PDC ever involved → Credit forever. A linked receivable cheque (any status,
  // incl. cleared/bounced) proves a cheque was used; a "Cheque" payment row is the
  // same signal for defensiveness.
  const pdcEver =
    cheques.some((c) => (c.type || "receivable") !== "payable") ||
    payments.some((p) => p.method === "Cheque" && !p.isRefund);
  if (pdcEver) return "Credit Invoice";

  // Non-PDC: was it fully collected now via Cash/Card/Online (net of refunds)?
  // (Pure "Credit" tenders create no payment row → they surface as remaining balance.)
  let cashLike = 0;
  for (const p of payments) {
    if (p.method === "Cheque" || p.method === "Credit") continue;
    cashLike += num(p.amount) * (p.isRefund ? -1 : 1);
  }
  if (num(total) - cashLike > 0.005) return "Credit Invoice"; // any balance remains
  return "Cash Invoice";                                       // fully paid, zero PDC
}

// ── Footer terms (customer-facing) ──────────────────────────────────────────
export interface ChequeForTerms { amount: number | string; status: string; type?: string | null; chequeNumber?: string | null; chequeDate?: string | null; }
export interface InvoiceTerms {
  isCredit: boolean;
  chequeDue: { number: string; dueDate: string }[]; // uncleared PDC cheques → their due dates
  standardDue: string | null;                        // due date for a non-PDC open balance (invoice date + term)
}

const addDaysISO = (iso: string, n: number): string => {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Due-date structure for the invoice footer. Cash Invoice → none (return policy only).
 * Credit Invoice → each uncleared PDC cheque's due date, PLUS a standard credit due date
 * for any remaining balance NOT covered by a cheque (invoice date + the customer's term).
 */
export function computeInvoiceTerms(opts: {
  total: number | string;
  date: string;
  invoiceType: InvoiceTypeLabel;
  payments: TenderForLabel[];
  cheques: ChequeForTerms[];
  termDays: number;
}): InvoiceTerms {
  const { total, date, invoiceType, payments, cheques, termDays } = opts;
  if (invoiceType !== "Credit Invoice") return { isCredit: false, chequeDue: [], standardDue: null };

  let cashLike = 0;
  for (const p of payments) {
    if (p.method === "Cheque" || p.method === "Credit") continue;
    cashLike += num(p.amount) * (p.isRefund ? -1 : 1);
  }
  const recv = cheques.filter((c) => (c.type || "receivable") !== "payable");
  const activeAmt = recv
    .filter((c) => ["pending", "deposited", "cleared"].includes(c.status))
    .reduce((s, c) => s + num(c.amount), 0);
  const chequeDue = recv
    .filter((c) => ["pending", "deposited"].includes(c.status))
    .map((c) => ({ number: c.chequeNumber || "", dueDate: c.chequeDate || "" }));
  const nonChequeOpen = num(total) - cashLike - activeAmt;
  const standardDue = nonChequeOpen > 0.005 ? addDaysISO(date, termDays) : null;
  return { isCredit: true, chequeDue, standardDue };
}
