# FINANCE_LOG.md — Dedicated Finance page + navigation cleanup

Guardrails held: server untouched → cash guard + cheque single-booking intact
(live check: Cash Position 9008.50 / bank 6300 / PDC 0, unchanged).

## STEP 1 — Finance is a REAL top-level page
- New nav key `finance` (`shared/permissions.ts`): NAV_ACCESS admin+manager; PATH_NAV `/finance`→finance.
- Sidebar item **Finance** (Wallet icon) added **between Expenses and PDC Tracker** (`Layout.tsx`).
  Standalone "Cash & Loans" sidebar item removed (it is now a Finance tab — no duplication).
- Route `/finance` → `Finance` (`App.tsx`); old `/reports/finance` kept as a back-compat alias.
- `Finance.tsx` rewritten: 4 tabs driven by `?tab=` via wouter `useSearch` (reactive to deep-links),
  each embedding its full dedicated page:
  - **Cash Position** → `<CashPosition embedded />` (hand + bank + PDC + txn list, rows link to source)
  - **Profit** → `<ProfitToday embedded />` (real vs imaginary, per-invoice, click → invoice)
  - **Cash & Loans** → `<CashLoans embedded />` (injections/repayments, Add buttons, overdraw-guarded)
  - **Cheques (PDC)** → `<PdcTracker embedded />` (receivable/payable, status actions, filters)

## STEP 2 — Dashboard widgets point to the SAME URLs
| Widget | Now links to |
|---|---|
| Profit Today | `/finance?tab=profit&period=today` |
| Cash Position | `/finance?tab=cash-position` |
| Cash & Loans (was "Owner Loans Outstanding") | `/finance?tab=cash-loans` |
| PDC — Open / Receivable / Payable / Due-today / 3-day alert | `/finance?tab=cheques[&type=…|&due=today]` |
Identical URL whether reached by sidebar-Finance→tab click or by the dashboard widget.

## STEP 3 — Credit Exposure dedupe
- **"Total Outstanding" dashboard widget DELETED** (it duplicated Credit Exposure). Credit Exposure in
  the CEO hero row is now the single source of truth for unpaid-credit total.
- Credit Exposure click → `/credit-exposure` (dedicated page: credit customers, highest balance first,
  each row → customer detail). *(Kept the dedicated page rather than a /customers filter — same intent;
  noted as an alternative if a /customers?filter view is preferred.)*

## STEP 4 — Credit Sales Today filter
- Already correct: `/documents?type=INV&date=today&credit=1` → `Documents.tsx` filters INV with
  status unpaid|partial and titles the page "Today's Credit Invoices". Verified in code.

## STEP 6 — Reports = business performance only
- Report tab picker trimmed to: **Business Summary · Stock Movement · Aging · Sales · Top Customers ·
  Top Products · Returns**. Removed from the picker: PDC, Cheques, Expenses, Unpaid, Inventory, Tax
  (money-management now lives on `/finance`). Default tab → Business Summary. `?tab=`/`#hash` whitelist
  updated so a stale finance hash can't reopen a removed tab.
- Business Summary keeps a read-only cash/profit SNAPSHOT (spec-intended overview) — the detailed
  cash/profit/loan/cheque MANAGEMENT surfaces are only on Finance. No management overlap.

## VERIFICATION (live, manager session)
| Test | Expected | Actual | Pass |
|---|---|---|---|
| Sidebar has Finance between Expenses & PDC | yes | yes | ✅ |
| `/finance` → Cash Position tab | 4 tabs, hand 9008.50 / bank 6300 | as expected | ✅ |
| `/finance?tab=cheques` | embedded PDC table (receivable/payable) | renders | ✅ |
| `/finance?tab=cash-loans` | injections/repayments 0/0/0 + Add buttons | renders | ✅ |
| `/finance?tab=profit&period=today` | Profit Today (real/imaginary) | renders | ✅ |
| Dashboard widget URL == sidebar tab URL | identical `/finance?tab=X` | identical (deep-link = href) | ✅ |
| Total Outstanding widget gone | absent | removed | ✅ |
| Reports shows only business tabs | no cash/profit/PDC/cheque tabs | trimmed | ✅ |
| tsc --noEmit | clean | clean | ✅ |
| cash guard + cheque single-booking | intact | numbers unchanged | ✅ |

## Examiner — 3 passes
- Pass 1 (nav path correct): Finance is a real sidebar page; every widget deep-links to the matching tab. **94**
- Pass 2 (no duplicate content): Total Outstanding removed; cash/profit/PDC management only on Finance. **92**
- Pass 3 (nothing broke): tsc clean; all 4 tabs render; cash guard + single-booking intact; manager dashboard fine. **93**
- APPROVED (all ≥90).

## Follow-up — deferred items CLOSED

### Item 1 — Credit Exposure → filtered /customers
- Dashboard Credit Exposure widget → `/customers?filter=credit-outstanding`.
- `Customers.tsx`: reads `?filter` via `useSearch`; fetches `/api/reports/credit-exposure` → per-customer
  outstanding map. In credit mode: shows only accounts with balance > 0, sorted **highest first**, with a
  red banner (count + total) and a "Show all" reset. The "owes QAR X" badge is now live on every row.
- **Verified:** banner "2 customers · QAR 7560.00 · highest first"; list = Al-Rashidi (4060), Farhan (3500);
  rows click → customer detail.

### Item 2 — Total Revenue drill-down (Reports → Sales)
- Sales tab now has an expandable **"Invoices behind this revenue (N)"** — the period's invoices
  (number, customer, date, amount), each row click → that invoice. Plus **Top products → / Top customers →
  / By category →** jump links to the matching breakdowns (all rows already click through to
  product/customer detail).
- **Verified:** expands to 18 invoices (INV-100390 … clickable); revenue QAR 20,959.50.

### Item 3 — Cheque detail page + photo upload
- `cheques.photo_url` column added (migration `migrate-cheque-photo.mjs`, idempotent).
- Server: `getChequeDetail(id)` (cheque + linked document + status timeline from date fields + logged
  corrections); `setChequePhoto(id, dataUrl)` (validates PNG/JPG/WebP, ≤ ~4 MB). Routes:
  `GET /api/cheques/:id` (registered after `export.csv` so `:id` can't swallow it) and
  `POST /api/cheques/:id/photo` — both admin/manager only.
- Client: `ChequeDetail.tsx` at `/cheques/:id` — fields, linked-document card, image upload
  (FileReader → base64 → POST), and status history. PDC/Cheques list rows link to it.
- **Verified:** cheque #2 → number 112233, linked INV-100369, history [Recorded, Cleared]; photo upload
  200 + persists; non-image rejected 400. Test photo cleaned off the real cheque afterward.

`tsc --noEmit` clean · server error log clean · cash guard + cheque single-booking untouched.

## Examiner (follow-up) — 95/100 — APPROVED
−5: cheque status history is derived from date fields + corrections (no per-deposit granular audit row);
6-month customer credit-timeline chart still deferred (not requested in this pass).

### Item 4 — 6-month credit timeline chart (customer profile) — DONE
- `CustomerDetail.tsx` Invoices tab now opens with a recharts bar chart **"Credit invoices — last 6
  months"**: total INV (excl. void) to that customer bucketed by month, last 6 months, indigo bars +
  QAR tooltip. Renders only when there's activity in the window. Invoice list (clickable → invoice)
  sits directly below.
- **Verified live** (Mohammed Al-Rashidi, /customers/1): May bar = INV-100360 (QAR 3200),
  Jul bar = INV-100368 + INV-100363 (860 + 860 = 1720), Feb/Mar/Apr/Jun empty — matches the invoice
  list exactly. tsc clean.
- All 4 deferred items now closed.
