// Invoice type label — the qualifier shown on the invoice document (staff view AND
// printed customer copy), computed from how the invoice was actually paid. Exhaustive
// rules (no other variants):
//   Rule A "Cash Invoice"  — paid in full using ONLY Cash/Card/Online Transfer, zero PDC.
//   Rule B "Invoice"       — paid in full using PDC cheque(s) ONLY (no cash/card/online).
//   Rule C "Credit Invoice"— any remaining balance (unpaid OR partial), OR paid in full
//                            through a MIXED combination that includes PDC + Cash/Card/Online.
// Negative override of nothing here — this is purely payment-composition based, and it
// auto-updates because it is recomputed from live payments + cheques on every read
// (e.g. a Credit Invoice paid off by cash → Cash Invoice; a PDC-only Invoice whose
// cheque bounces → Credit Invoice, since the balance is unpaid again).

export type InvoiceTypeLabel = "Cash Invoice" | "Invoice" | "Credit Invoice";

export interface TenderForLabel { method: string; amount: number | string; isRefund?: boolean | null; }
export interface ChequeForLabel { amount: number | string; status: string; type?: string | null; }

const num = (v: any): number => Number(v) || 0;

export function computeInvoiceType(
  total: number | string,
  payments: TenderForLabel[] = [],
  cheques: ChequeForLabel[] = [],
): InvoiceTypeLabel {
  // Immediately-collected, non-cheque money: Cash / Credit Card / Bank Transfer.
  // (PDC is stored as method "Cheque" and tracked via the cheques table below, so it is
  // excluded here to avoid double-counting; pure "Credit" tenders create no payment row.)
  let cashLike = 0;
  for (const p of payments) {
    if (p.method === "Cheque" || p.method === "Credit") continue;
    cashLike += num(p.amount) * (p.isRefund ? -1 : 1);
  }

  // Active PDC coverage: receivable cheques still standing (pending/deposited/cleared).
  // Bounced/cancelled cheques no longer cover the invoice.
  let pdcActive = 0;
  for (const c of cheques) {
    if ((c.type || "receivable") === "payable") continue;
    if (["pending", "deposited", "cleared"].includes(c.status)) pdcActive += num(c.amount);
  }

  const remaining = num(total) - cashLike - pdcActive;
  if (remaining > 0.005) return "Credit Invoice";           // Rule C — any balance remains

  const pdcInvolved = pdcActive > 0.005;
  const cashInvolved = cashLike > 0.005;
  if (pdcInvolved && cashInvolved) return "Credit Invoice"; // Rule C — mixed PDC + other
  if (pdcInvolved) return "Invoice";                        // Rule B — PDC-only, full
  return "Cash Invoice";                                    // Rule A — cash/card/online only, full
}
