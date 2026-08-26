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
