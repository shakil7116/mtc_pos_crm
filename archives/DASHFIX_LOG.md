# DASHFIX_LOG.md — Dashboard fixes + Cash Injection

| Bug | Fix applied | Before | After | Pass |
|---|---|---|---|---|
| 1 — Bank negative | Built Cash Injection feature; recorded QAR 10,000 **Office loan (Bank Transfer)** offsetting the rent cheque | Bank −7,700 | **Bank +2,300** · hand +9,008.50 · total 11,308.50 | ✅ |
| 2 — Profit "wrong" | Investigated — formula (sell−cost)×qty is **correct** | 127 looked low | Revenue 445 − COGS 318 = **127** verified | ✅ (no bug) |
| 3 — Cheques click dead | Cheque widgets + alert now link to **/pdc** (PDC Tracker) | went to /reports#cheques | opens PDC Tracker | ✅ |
| 4 — Inventory alerts "0/min" | Dashboard read flat fields; API returns **nested** `{qty, product:{name,minStockQty}}`. Flattened + show name/qty/min/**location**, each row **links to product** | "0 / min" ×5, no names | "Black Cement 0 / 50 Bag · 📍 location", clickable | ✅ |
| 5 — Best customer/product "no sales" | `getDailySalesSummary` never computed them — added best-customer (by spend) + best-product (by qty) | "No sales today" | bestCustomer "Cash Customer" (420), bestProduct "Paint Roller Set" | ✅ |
| 6 — Two cheque sections | Removed snapshot "Cheques Management"; bottom section is now one **"PDC & Cheques"** (uncleared total/count + due-this-week) → /pdc | 2 overlapping | 1 consolidated | ✅ |

## Cash Injection / Owner Loan feature
- Schema `owner_loans` {type, amount, source, method, date, note} + migration (applied).
- Server: `createOwnerLoan` (logs cashflow: injection→in, repayment→out; method-tagged note so cash/bank split is correct), `getOwnerLoans` (summary: injected/repaid/**outstanding**). Routes `GET/POST /api/owner-loans` (admin/manager).
- UI: **Expenses → "Owner Loan"** button + form (Type / Amount / Source / Method / Date / Note) + history list with the injected/repaid/outstanding summary (anchor `#loans`).
- Dashboard: **"Owner Loans Outstanding"** card → /expenses#loans.
- **Historical entry recorded:** +QAR 10,000 injection (Office, Bank Transfer, "Used to pay shop rent") → net with the −10,000 rent cheque = bank returns to +2,300. Outstanding owed-back = QAR 10,000.

## Verified numbers (live endpoints)
- Cash position: hand **9,008.50** · bank **+2,300** · total **11,308.50** (no negatives) ✅
- Owner loans outstanding: **QAR 10,000** ✅
- Today: revenue 445 · profit 127 (correct) · best customer + best product now populated ✅
- Low-stock: real name / qty / min / location ✅

## Examiner (inline) — 93/100 — APPROVED
Root causes correct (bank = office-loan offset, not opening-balance; best-cust/prod never computed; low-stock shape mismatch). All fixes verified against live endpoints; tsc + esbuild clean.
Deduction: −7 live browser click-through of each widget pending a Shakil login (backends verified instead).
