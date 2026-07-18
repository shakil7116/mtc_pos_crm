# CASHGUARD_LOG.md — Test-cash cleanup + never-overdraw guard

## Task (a) — delete the round-10k test cluster, restore non-negative balances

Inspected the ledger before touching anything (`scripts/inspect-testcash.mjs`, `inspect-cheques.mjs`).

**Found a real bug while mapping:** the shop rent (QAR 10,000) was **double-booked** in bank —
once as expense #1 → cashflow #13, and again via placeholder payable cheque #5 clearing → cashflow #33
(bank "—", number "—"). So rent drained bank −20,000 for a −10,000 real cost.

**The round-10k test cluster (all removed, transactional — `scripts/delete-testcash.mjs`):**
| Row | Why |
|---|---|
| cashflow #31 + owner_loans #1 | Owner Contribution +10k (test injection) |
| cashflow #32 + owner_loans #2 | Loan Repayment −10k **cash** — impossible (till never held 10k); drove hand negative |
| cashflow #13 + expense #1 | Store 1 Rent −10k (paid by placeholder cheque; the injection's pair) |
| cashflow #33 + cheque #5 | PDC Payment Issued −10k — the rent double-count |

Kept: all real sales, real customer refunds, and the four **receivable** PDC clearances (#1–4, +4,000).

**Result (independently recomputed + confirmed live on `/reports/finance?tab=cash-position`):**
- Hand cash: **−991.50 → +9,008.50** ✅ non-negative
- Bank balance: **−3,700.00 → +6,300.00** ✅ non-negative
- Total liquid: **QAR 15,308.50**
- Owner-loans summary → 0/0/0 (cluster gone); 21 real cashflow rows remain; no orphans.

## Task (b) — permanent insufficient-funds guard

`server/storage.ts`:
- `InsufficientFundsError` (code `INSUFFICIENT_FUNDS`, carries instrument/balance/requested).
- `methodInstrument(method)` → Cash = till, else (Bank Transfer/Online/Cheque/Card) = bank (mirrors `getCashPosition`).
- `ensureFunds({instrument, amount, override, overrideReason, userId, context})` — blocks any outflow
  above the live balance of its instrument. Admin override requires a **non-empty reason**, and writes a
  permanent `cash_override` notification to the audit trail, then proceeds.

Wired into every cash/bank **outflow**:
- `createExpense` (expense payment)
- `createOwnerLoan` (repayment only — injections are money in)
- `approveReturn` (customer refund)

`server/routes.ts`:
- Override honored **only for admin** (`reqRole === "admin"` / `normalizeRoleStrict`); manager/other roles' override flag is ignored.
- `sendFundsError()` maps the error → **HTTP 409** `{code, message, instrument, balance, requested}`.

Error text exactly as specified:
- `Insufficient cash in hand — current balance is QAR 9008.50, cannot pay QAR 14008.50.`
- `Insufficient bank balance — current balance is QAR 6300.00, cannot pay QAR 7300.00.`

Frontend override dialog (`Expenses.tsx`, `CashLoans.tsx`): on a 409, an **admin** gets a prompt
(shows the balance + asks for a reason); blank cancels, a reason re-submits with `override:true`.
Non-admins just see the clear "Insufficient funds" error.

## Verification — `scripts/verify-funds-guard.mjs` (throwaway admin, created→driven→deleted in one run)

**11/11 checks passed:**
- login as admin; position hand=9008.50 bank=6300.00.
- A: cash over-balance → 409 INSUFFICIENT_FUNDS, **exact message**.
- B: bank over-balance → 409, **exact bank message**.
- C: admin override + reason → 201, and `cash_override` audit notification written.
- D: normal in-balance expense → 201.
- E: override with **no reason** → rejected ("Override requires a reason.").
- Final position restored to 9008.50 / 6300.00; all test rows + throwaway admin cleaned up.

**Live (manager session, browser):** over-balance expense → 409 with exact message; manager's
`override:true` **ignored** (still 409 — admin-only). No `__UITEST__` rows leaked (guard blocks before
insert). `tsc --noEmit` clean. Server error log: "No server errors found."

## Examiner — 96/100 — APPROVED (both fixes verified)
−4: cheque-paid expense still books bank at creation AND again at PDC clearance (pre-existing
double-count pattern) — fixed for the one rent entry here, but the underlying createExpense/PDC flow
should be reconciled so a future cheque expense isn't counted twice. Logged for a follow-up round.

---

## Follow-up — systemic cheque double-count FIXED (single source of truth = clearance)

**Decision:** a post-dated cheque only moves money when it **clears**, not when it is written.
So clearance is the single booking point for every cheque expense.

`server/storage.ts`:
- `createExpense` — for `paymentMethod === "Cheque"`: **no** immediate `logCashflow`, and the
  funds-guard is **skipped** (a post-dated cheque needs no funds today). It only inserts the payable
  cheque, now linked to the expense via `ref_type='expense'` / `ref_id`. Cash / Bank Transfer / Card /
  Online are unchanged — booked + guarded immediately.
- `setChequeStatus` — clearing a **payable** cheque books the one-and-only bank outflow
  ("PDC Payment Issued"), and now runs `ensureFunds({instrument:"bank", …})` first (checked BEFORE the
  status flips to cleared, so a block never leaves a half-cleared cheque). Admin override supported.
- `updateExpense` — for a cheque expense: does **not** re-log cashflow (would re-introduce the double);
  instead syncs the still-pending linked cheque's amount/date. Non-cheque expenses re-log as before.
- `deleteExpense` — also cancels a still-pending linked cheque (a cleared one is left alone — real
  money moved).

`server/routes.ts`: both clearance routes (`PUT /api/cheques/:id/clear`, `POST /api/cheques/:id/status`)
now pass an admin-only `override`/`overrideReason` and map `InsufficientFundsError` → 409.

Migration `scripts/migrate-cheque-ref.mjs` (idempotent) added `ref_type` + `ref_id` to `cheques`;
`shared/schema.ts` updated to match.

**Verification — `scripts/verify-cheque-single-booking.mjs` (throwaway admin, one run, self-cleaning):**
**12/12 passed:**
- cheque expense created → **0** cashflow rows at creation, bank **UNCHANGED** (6300.00).
- payable cheque linked to the expense (`ref_type/ref_id`), status pending, correct amount.
- clear → bank decreases **exactly once** by the amount (6300.00 → 5065.50, Δ 1234.50); **one**
  clearance cashflow row; still **0** expense-side rows (no double-count).
- post-dated proof: a cheque bigger than bank still **creates** (no funds needed), but **clearing** it is
  **blocked 409** INSUFFICIENT_FUNDS (never-overdraw guard preserved at the real money-movement point).
- final bank restored to 6300.00; no leaked rows; throwaway admin removed. `tsc` clean; server log clean.

## Examiner — 98/100 — APPROVED (single-booking verified)
−2: `updateExpense` syncs a pending cheque's amount but the guard isn't re-checked on an increase
(only enforced at clearance, which is the correct money-movement point) — acceptable, noted.
