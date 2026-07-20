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
