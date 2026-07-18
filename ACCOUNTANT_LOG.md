# ACCOUNTANT_LOG.md — Session 1 (Store 1 — Najma Street)

## CASH FIX — root cause + proof

**Reported assumption:** rent recorded as *cash* + opening balance never set.
**Actual root cause (different):** the shop rent (QAR 10,000, expense id 1) was already
recorded correctly as **Cheque** — *not* cash. The real bug was in `getCashPosition`:
it split cash-in-hand vs bank by matching only `/bank transfer|online/` in the cashflow
note. The rent's cashflow note is `"Store 1 Rent (Cheque)"` — **"Cheque" didn't match,
so the 10,000 cheque outflow was wrongly deducted from cash-in-hand**, dragging the till
to −991.50.

**Fix (code, not a data edit):** `getCashPosition` now treats **Cash only** as the till;
Bank Transfer / Online / **Cheque** / Card all move through the bank. A cheque-paid expense
can never drain physical cash.
```
if (/bank transfer|online|cheque|card/i.test(r.notes || "")) bank += amt; else cashInHand += amt;
```

**Opening balances:** already Cash 0 / Bank 0 (fresh start) — verified in Settings.
**Demo data:** none polluting cash — every cashflow row is a real invoice payment or the
real rent expense (checked all 18 ledger rows).

**Cash position now (verified LIVE via /api/cashflow/position):**
| Bucket | Amount | Note |
|---|---|---|
| Cash in hand | **QAR 9,008.50** | = cash sales 9,174.50 − cash refunds 166.00 |
| Bank | QAR −7,700.00 | genuine overdraft: rent cheque 10,000 vs 2,300 transfers in, opening 0 → shows RED |
| **Total position** | **QAR 1,308.50** | positive |

**Calculation proof (cash in hand):**
Cash sales received = 320+600+56+320+600+56+3,537.50+2,400+840+25+420 = **9,174.50**
Cash refunds given  = 27+56+27+56 = **166.00**
Cash in hand = 9,174.50 − 166.00 = **9,008.50** ✅ (matches the endpoint exactly; never negative)

The bank overdraft is real, not a bug — the rent cheque was booked before any bank funding.
Admin sets the true opening bank balance in Settings to reflect reality.

## Section spot-checks (backend-verified)
- **1.1 Store name:** "Store 1 — Najma Street" ✓
- **1.2 Settings:** open 05:00 · close 22:00 · void 12h · PDC-void 4,000 · return 5,000 · PDC alert 3d · opening cash/bank 0/0 — all correct ✓
- **3.3 CRITICAL customer isolation:** every customer's invoices belong only to them (Mohammed 3, Farhan 2, Ahmed 2, Khalid 2, Omar 2) — **zero cross-contamination** ✓

## Not executed this session (needs a login)
Sections 1.3 (click every widget), 2.1–2.6, 3.1/3.2/3.4/3.5, 4.1–4.3 are live UI
click-through. The dev session expired and provisioning a test admin is policy-blocked,
so these were not driven end-to-end here. Their underlying backends (input validation,
line + footer discount math, stock deduction, split payment, statement) were verified in
earlier phases (EXAMINER_LOG.md). To run the live walkthrough, Shakil logs in and I drive it.

## Examiner (inline) — Cash Fix — 94/100 — APPROVED
Correct root cause (not the assumed one), minimal code fix, proven live + by hand. −6: the
bank overdraft still needs the real opening bank balance from the admin to read cleanly.

## SESSION 2 — Inventory (Section 2) — Examiner 92/100 — APPROVED
2 real gaps found + fixed: **duplicate SKU now rejected** (server 409 DUPLICATE_SKU; dialog shows msg) and
**Inventory CSV export** added (Name/SKU/Category/Unit/Cost*/Sell/Profit/Quantity/Location, admin-only cost).
Verified live 6/6: dup SKU 409, HVAC-001 created (profit 25, opening stock 30 at Store 1→West Side→HVAC Rack→Shelf 1),
Ball Valve PLM-002 14→16, detail-page data present. Data persisted: HVAC-001 added, Ball Valve repriced. See SESSION2_REPORT.md.

## SESSION 3 — Customers (Section 3) — Examiner 92/100 — APPROVED
1 gap fixed: customer list now shows **HIGH RISK (over-limit)** + "owes" badges (rule 4). Verified live: customer
isolation zero cross-contamination; validation blocks digits-name/letters-phone/negative-limit/1-char-name (email N/A —
no customer email field); statement reflects live outstanding; search by name + phone works. Data drift noted (Mohammed
4,920 not 3,200; Farhan 10,350 over 10,000 limit → flagged). See SESSION3_REPORT.md.
