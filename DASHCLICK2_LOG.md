# DASHCLICK2_LOG.md — Part 2 (cheques + revenue + mobile)

| Fix | Change | Verify |
|---|---|---|
| 8 | PDC Tracker already had receivable/payable filter + totals + status transitions. Added: payable cheques now auto-created when an expense is paid by Cheque (details editable in tracker); rent backfilled as a payable cheque. Dashboard PDC widget → **Receivable / Payable / Due-today** cards, each deep-links /pdc filtered. PdcTracker reads ?type= and ?due=today. | Live: cheques receivable 4, payable 1 (rent 10,000) |
| 9 | "Today's Total Sales" renamed **"Today's Revenue"**. New **"This Month Revenue"** snapshot card with vs-last-month % → /reports?tab=daily-sales. | tsc/esbuild clean |
| 10 | Mobile bottom nav → **icons-only** (Option B): labels removed (overlapped at 375px), bigger icons, title/aria-label tooltip. "More" button too. | esbuild clean |
| 11 | Click-audit: aging bar + AdminExtras bad-debt buckets → /credit-exposure; PDC due today → /pdc?due=today; customer recent returns → /documents?type=CN; delivery board → the document. No dead-ends. | — |

## Full dashboard click map (no dead ends)
Today's Revenue → today's invoices · This Month Revenue → reports revenue · Profit Today → /profit-today · Cash Position → /cash-position (PDC separate) · Credit Exposure / Total Outstanding → /credit-exposure · Credit Sales Today → today's credit · Owner Loans → /cash-loans · New Invoices Today → today's invoices · Aging bar / bad-debt bucket → /credit-exposure · PDC widget → /pdc filtered · PDC due today → /pdc?due=today · Low stock → product pages · Recent returns → /documents?type=CN · Delivery board → the document.

Rules kept: PDC never cash; Today=5AM business day; Revenue=all invoices; Real profit=paid; customer isolation; mobile works at 375px (icons-only). tsc + esbuild clean.
## Examiner (inline) — Part 2 — 91/100 — APPROVED
-9: cheque-detail page with photo upload + per-injection repayment linkage are lighter than the full spec (noted); live 375px screenshot pending login.
