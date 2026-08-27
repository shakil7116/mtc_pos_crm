# Decisions log

Why things are the way they are. Newest first. One entry per real decision —
not a changelog, a record of choices that would otherwise get re-litigated.

Format: `## YYYY-MM-DD — Decision` / **Context** / **Decision** / **Why** / **Consequence**

---

## 2026-08-26 — Keep all work on `master`, no feature branches

**Context:** The AI assistant / scan / import subsystem was committed on a branch
`feat/ai-assistant-scan-import`, then fast-forwarded into `master` and the branch deleted.

**Decision:** Solo development stays on a single `master` line.

**Why:** Owner is the only developer. Work parked on a side branch gets forgotten
while `master` moves on, and the two drift apart. Every prior commit is on `master`.

**Consequence:** No merge step to remember. Rollback is `git revert` on a single line.

---

## 2026-08-26 — `stock-import.csv` is gitignored, not committed

**Context:** 30 rows carrying `sale_price` next to `cost_price` for every product,
plus the Store 1 street address on every row. The GitHub repo is public.

**Decision:** Ignore it at repo root (`stock-import.csv` and `/*-import.csv`).
The glob is anchored to `/` so `csv-templates/*.csv` stays tracked.

**Why:** Committing it publishes the full markup structure of the catalogue —
every cost and every margin — to anyone who finds the repo.

**Consequence:** Import files live on disk only. If a future import file genuinely
needs tracking, put it in `csv-templates/` where the anchored glob does not reach.

---

## 2026-08-26 — Repo visibility to be changed to private

**Context:** `github.com/shakil7116/mtc_pos_crm` returns HTTP 200 from the public API.
Full POS source, DB schema, pricing logic and business rules are world-readable.
History was scanned: `.env` was never committed and no secret patterns exist in 40 commits.

**Decision:** Owner makes the repo private before anything is pushed. Commits stay local
until then.

**Why:** No secrets have leaked, but the business logic of a live POS is not something
to publish by default.

**Consequence:** `master` sits 1 commit ahead of `origin` until the visibility change lands.

---

## 2026-08-26 — Credit note records the credit GIVEN, not the goods returned

**Context:** `approveReturn` set the credit-note total to `refundAmt || rvTotal`.
`ReturnModal` only sums items in `original` condition into the refund, so an
all-damaged return produces `refundAmount = 0` while `rvTotal` is the full goods
value. The `||` then fell through to the goods value.

**Decision:** The CN total is the credit the customer actually received.
An explicit `0` stays `0`. Only a NULL/absent `refundAmount` — legacy rows written
before the field existed — falls back to the goods value. Extracted as the pure,
tested `creditNoteTotal()`.

**Why:** The dashboard deducts CN totals from revenue. A damage claim where the
customer got nothing back was deducting the full goods value, understating revenue
by money the business legitimately kept.

**Consequence:** Damage-claim returns no longer reduce reported revenue. Returns
with a real refund are unchanged. Historical CN rows already written are NOT
retro-corrected — only new approvals use the new rule.

---

## 2026-08-26 — Approval refuses before it writes

**Context:** `approveReturn` reversed stock first and checked funds second. A funds
failure left the goods back on the shelf with the return still `pending`, and the
idempotency guard only catches `status === "approved"` — so approving again
reversed the same stock a second time.

**Decision:** All refusals (no store for stock rows, insufficient funds) run in a
pre-flight block before the first write. `ensureFunds` is read-only, so moving it
earlier changes nothing on the happy path.

**Why:** A rejected approval must leave the return exactly as it found it.

**Consequence:** A return with stock rows but no `storeId` now throws instead of
paying the refund and losing the inventory. That error is visible to the approver.

---

## 2026-08-26 — A failed credit note raises an admin notification

**Context:** CN generation is wrapped in `try/catch` that only logged to console.
A failure meant the return was approved, stock reversed, refund paid — and no CN,
so the dashboard never deducted the return.

**Decision:** Keep not failing the approval (deliberate), but raise an admin
notification saying revenue is overstated until reconciled by hand.

**Why:** Silent revenue overstatement is worse than a noisy failure.

**Consequence:** `creditNoteId` stays null and is detectable; an admin is told.

---

## 2026-08-26 — Stock audit records what moved, not what was asked for

**Context:** `adjustStock` clamped inventory with `Math.max(0, current + qtyChange)`
but wrote the full unclamped `qtyChange` into `stockAdjustments`. Removing 10 units
when only 5 were on hand left inventory at 0 and the audit trail claiming -10.
`stockAdjustments.qtyChange` is summed by the stock-movement report in `routes.ts`,
so the discrepancy reached a real report.

**Decision:** Record the applied delta. Extracted as the pure, tested
`applyStockDelta(current, qtyChange)` returning `{ newQty, applied, clamped }`.
When a clamp occurs the reason string says what was requested versus applied.

**Why:** An audit trail that does not reconcile with the thing it audits is worse
than no audit trail — it looks authoritative and is wrong.

**Consequence:** Historical rows are not retro-corrected. New movements reconcile:
`current + applied === newQty`, always.

---

## 2026-08-26 — Unknown cash/loan types are refused

**Context:** `LOAN_TYPES` was exported but never checked. An unknown or misspelled
type passed both guards, was inserted, and fell into the default cashflow category
as money **in** — so money going out could be booked as money coming in.

**Decision:** `createOwnerLoan` throws on any type not in `LOAN_TYPES`, naming the
five valid ones.

**Why:** Silent miscategorisation of direction corrupts the cash position.

---

## 2026-08-26 — The dev-header auth bypass is gated on NODE_ENV

**Context:** `server/auth.ts` let any request set `x-user-role` when
`ALLOW_DEV_HEADERS=1`. The comment said "never in production" but the code only
checked the flag. One mis-set environment variable and anyone could become admin.

**Decision:** The condition now also requires `NODE_ENV !== "production"`.

**Why:** A comment is not a control. The code should enforce what it claims.

**Consequence:** Belt and braces — the flag is `0` in `.env` today and the bypass
is now structurally impossible in a production build regardless.

---

## 2026-08-26 — The "8 duplicate routes" finding was wrong

**Context:** A review agent reported that `server/routes.ts` registers 8 paths
twice and that Express silently runs only the first handler, making the second
dead code. This was recorded in `CLAUDE.md` as a landmine and reported to the owner.

**Decision:** Retracted. It is not a bug and nothing was changed.

**Why:** Lines 416-473 are demo-mode fallthrough guards. Each checks
`dbAvailable()` (`!!process.env.DATABASE_URL`, routes.ts:116). With no database it
answers from the in-memory demo store; otherwise it calls `next()` and the real
handler runs. All eight were verified to call `next()`. Both registrations are
live, in sequence — the standard Express middleware pattern.

**Consequence:** Deleting the "second" handler would have deleted the real
business logic for creating documents, customers, returns and settings. The
CLAUDE.md entry now warns against exactly that.

---

## 2026-08-26 — DELETE /api/documents/:id is admin-only and refuses money documents

**Context:** The endpoint hard-deleted a document with no role check, no status
check and no window check, while `POST /api/documents/:id/void` right below it has
an ownership gate, a role gate and a time window. Any authenticated user — including
a driver — could permanently erase any invoice and its line items. No client code
calls the endpoint at all.

**Decision:** Admin only. INV/RV/CN are refused outright with `code: "USE_VOID"`.
Anything with payments recorded is refused with `code: "HAS_PAYMENTS"`.

**Why:** Deleting an invoice destroys the financial record with no stock reversal,
no refund and no audit trail. Voiding is the correct operation and already exists.

---

## 2026-08-26 — COGS is pinned at the moment of sale

**Context:** Profit joined `documentItems` to `products` and read `costPrice` at
REPORT time. Changing a supplier's cost silently rewrote the margin on every invoice
ever sold — a price rise could turn a historically profitable invoice into a loss.

**Decision:** New column `document_items.cost_at_sale`, written by `createDocument`
and the item-rewrite path in `updateDocument` via `snapshotCosts()`. All ten profit
read sites resolve through the pure, tested `resolveItemCost(costAtSale, currentCost)`.

**Why:** Historical margin must be a fact, not a recalculation against today's prices.

**Consequence:** Existing rows stay NULL and fall back to current cost, so historical
reports are unchanged rather than retro-corrected. Every sale from now on is pinned.
`scripts/migrate-cogs-snapshot.mjs` must run before this code is deployed — the
queries select the new column. The fallback is deliberately kept forever, not a
temporary shim, because legacy rows genuinely have no pinned cost.

**Not changed:** the `cashMap` block in `/api/customers/:id/analytics` still reads
current cost. That view is explicitly about *current* pricing (`currentSalePrice`,
`currentWholesalePrice`), so current cost is correct there.

---

## 2026-08-27 — COGS migration applied to production

**Context:** `document_items.cost_at_sale` had to exist before the new profit code
could run. The first version of the migration script used `pg.Pool` with no timeouts
and hung for three minutes with no output. TCP to the pooler was verified open and a
`pg.Client` connected in one second, so the fault was the script, not the network.

**Decision:** Rewrote the script to use `pg.Client` with explicit
`connectionTimeoutMillis` and `statement_timeout`, plus per-step logging.

**Why:** A migration that hangs silently is worse than one that fails loudly — you
cannot tell whether it is working, blocked on a lock, or dead.

**Result:** Column added. 404 `document_items` rows, 0 pinned, 404 falling back to
current cost — exactly as intended, historical reports unchanged. Verified live with
`npm run test:live`: real QAR 19504.17 / expected QAR 24508.95 across 85 invoices and
169 lines, no NaN, and `getProfitSummary` reconciles with `getProfitDetail` to the fils.
