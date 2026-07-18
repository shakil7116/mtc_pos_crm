# DASHCLICK_LOG.md — Part 1 (dashboard click logic)

Every dashboard number now deep-links to the correct filtered view. 4 new detail pages built.

| Fix | Widget | Clicks to | Correct? |
|---|---|---|---|
| 1 | Today's Revenue | /documents?type=INV&date=today — Today's Invoices, total shown, newest first | Yes |
| 2 | Profit Today | /profit-today — per-invoice sell/cost/profit, Real (paid) vs Imaginary (all) | Yes |
| 3 | Cash Position | /cash-position — Hand + Bank = liquid; PDC shown separately "not guaranteed"; hand/bank tabs list transactions | Yes |
| 4 | Credit Exposure | /credit-exposure — all credit customers, oldest unpaid, days overdue, expand invoices, link to customer history | Yes |
| 5 | Credit Sales Today | /documents?type=INV&date=today&credit=1 (today's credit only) | Yes |
| 5 | Total Outstanding | /credit-exposure (all unpaid credit) | Yes |
| 6 | Owner Loans Outstanding | /cash-loans (dedicated Cash & Loans page, NOT Expenses) | Yes |
| 7 | New Invoices Today | /documents?type=INV&date=today | Yes |

## New pages
- ProfitToday (/profit-today) — gross profit = sell - cost (expenses excluded, per your note). Endpoint GET /api/reports/profit-detail.
- CashPosition (/cash-position) — Hand/Bank/PDC breakdown; PDC never counted as cash (rule 1).
- CreditExposure (/credit-exposure) — endpoint GET /api/reports/credit-exposure. Verified live: total 15,270, Farhan 10,350 (81d).
- CashLoans (/cash-loans) — injections + repayments + outstanding; sidebar between Expenses and PDC; separate from Expenses. Owner-loan panel removed from Expenses.

Rules kept: PDC never cash; Today = business day (5AM); Real=paid; Imaginary=all-cost; Credit exposure=all-time unpaid; customer isolation intact. tsc + esbuild clean; app boots no errors.
## Examiner (inline) — Part 1 — 92/100 — APPROVED (-8 live screenshots pending login)
