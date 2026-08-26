# INTEGRATION_TEST.md — Phase 9 Daily Workflow (Store 1 — Najma Street)

Full-day workflow run against the live server (JWT auth, real Singapore DB, real products/customers). Discount math, business-day boundary, footer discount, smart reports all exercised.

| Time | Action | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| 08:00 | Admin/manager login → dashboard | cash position, receivables, aging, today's activity load | all widgets load, clickable | ✅ Pass |
| 08:00 | Warehouse keeper login | deliveries today + low stock w/ location | dashboard scoped to their location | ✅ Pass |
| 08:00 | Salesman login | store dashboard, prominent New Invoice | forced password-change on first login (by design) | ✅ Pass |
| 09:00 | **Cash sale: 100 Black Cement ×15, QAR 1 disc/bag** | line total **1,400** (not 1,499) | **1,400.00** | ✅ Pass |
| 09:00 | + 50 White Cement ×45, 5% disc | line total **2,137.50** | **2,137.50** | ✅ Pass |
| 09:00 | Invoice grand total | **3,537.50** | **3,537.50** | ✅ Pass |
| 09:00 | Stock deducts, cash payment recorded | correct | Store-1 stock −qty, Cash logged | ✅ Pass |
| 11:00 | Manager applies grand-total discount 2500→2400 | footer discount logged, total 2400, **not printed** | total 2400, `footer_discount_by` set, editLog entry, templates show net Subtotal=Total | ✅ Pass |
| 13:00 | Credit sale Mohammed Al-Rashidi | unpaid, balance up, imaginary profit up, real unchanged | verified (Phase 8 REALTEST) | ✅ Pass |
| 14:00 | Delivery invoice Farhan → driver | driver sees it, pricing stripped, mark delivered → auto DN | verified (Phase 8 REALTEST S7) | ✅ Pass |
| 16:00 | Partial return → manager approve | **cash refund, no PDC** | Cash, 0 PDC cheques (Phase 8 REALTEST S5) | ✅ Pass |
| 21:30 | Admin runs Business Summary report | real vs imaginary profit, **top/worst products**, **recommended actions** | 6 recommended actions, top 10 / worst 5 products, top customers | ✅ Pass |
| 21:30 | Aging report | Mohammed's invoice bucketed by days overdue | buckets correct (Phase 8) | ✅ Pass |
| 21:30 | PDC tracker | cheques due shown | receivable/payable, due alerts | ✅ Pass |
| 21:45 | Expense logged (staff meals 150) | appears on today's expenses | logged + cashflow-out | ✅ Pass |
| 04:00 | (Business-day) sale before 05:00 open | belongs to **previous** business day | `businessDate()` rolls at 05:00, dashboard "today" uses it | ✅ Pass |

**Business corrections verified:**
- Store hours configurable in Settings (open 05:00 / close 22:00, admin-editable). ✅
- "Today" on dashboards = business day (opens 05:00), not midnight — a 04:00 sale counts to the previous day. ✅
- Retail + wholesale both served: fast cash walk-in (Scenario S1) and flexible credit/PDC/split/delivery bulk (S2/S3/S7). ✅

**Result: all daily-workflow checks pass.** Discount P0 fixed and confirmed with the exact spec numbers.
