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

---

## 2026-08-27 — Backups are self-hosted logical dumps, not pg_dump

**Context:** Supabase's own retention was the only copy of the entire financial
record. This machine has no PostgreSQL client tools installed — no `pg_dump`, no
`psql`, no Postgres install at all.

**Decision:** `scripts/backup-db.mjs` uses the `pg` driver the app already depends
on. It reads every table plus all 41 sequence positions and writes one verified
gzipped JSON file. `scripts/restore-db.mjs` reloads it, dry-run by default.

**Why not pg_dump:** it would make the backup depend on the owner installing and
maintaining PostgreSQL client tools. A backup procedure with a setup prerequisite is
a backup procedure that does not get run.

**Why sequences are captured separately:** they are not table data. Without them a
restore resets every id counter to 1 and new inserts collide with restored rows.
`document_counters` is an ordinary table so invoice numbering was already covered;
the 41 `*_id_seq` sequences were not.

**Why the backup self-verifies:** it reads the file back and compares row counts
before reporting success. A backup that was never read back is not a backup.

**Consequence:** `backups/` is gitignored — the repo is public and one of these
files is the whole business. It sits inside OneDrive, so each backup syncs to
different hardware automatically. Not yet scheduled: `BACKUP.md` carries the
`schtasks` command, which needs an Administrator terminal.

**Known limitation, stated plainly:** the restore has been VALIDATED (dry run passes
against production: 41/41 tables, 0 column mismatches, 0 FK cycles) but never
REHEARSED against a live target. That needs a scratch database. Until it is done, the
restore is a validated plan, not a proven procedure.

---

## 2026-08-27 — Go-live inventory model: count the few, register the many

**Context:** The shop carries ~4,000 products but only 30-40 sell regularly. The
owner could not count everything without closing, and the shop cannot close.

**Decision:** Four pieces, built together:

1. `products.track_stock` — counted vs not counted. An uncounted product has an
   UNKNOWN quantity, not zero: it always appears in the sales picker, bills with the
   correct cost, raises no low-stock alert, and is excluded from valuation.
2. Quick Goods Receipt — one screen for a delivery with no purchase order.
3. Stocktake (`setStockCount`) — type the counted total, not a delta. Records the
   variance against what the system believed.
4. CSV import — a BLANK quantity now means "not counted" rather than zero.

**Why:** counting the long tail costs more than knowing it is worth. Profit does not
need it — cost is recorded per sale, so gross profit is exact from the first invoice.
Only stock valuation needs a full count, and that can complete over weeks while the
shop trades.

**Why "set" and not "add":** a person at a shelf knows "there are 47", not "add 17".
Forcing the subtraction is what causes counting errors — an automated cleanup in this
very session posted a delta against the wrong product and put a real quantity to 0.
Both wrong quantities were later corrected THROUGH setStockCount, which left a proper
audit row.

**Consequence:** blank-vs-zero in the CSV now carries meaning, so the import had to
stop coercing blank to 0. An explicit `counted` column can override it. On UPDATE the
flag only changes when that column is present — a re-import must never silently
untrack something already counted.

---

## 2026-08-27 — Installable app (PWA), not a native rebuild

**Context:** The owner asked how to turn the web app into a mobile app, a desktop
app, or both.

**Decision:** Make it a PWA. Manifest, icons, service worker, offline page. No
React Native, no Electron.

**Why:** A native rebuild means rebuilding the entire interface — months — for
something that looks and behaves the same. A PWA installs to an Android/iOS home
screen and to Windows via Chrome or Edge, from the one codebase already written.

**The rule in the service worker: /api is NEVER cached.** Stock levels, prices,
customer balances and invoice numbers must be the live truth. A cached API
response is a wrong number wearing a convincing face — worse than an honest
error. Only the content-hashed build assets are cached, so a deploy can never
serve stale code either. When the network is down the app opens to an offline
page that says plainly it is not showing old numbers on purpose.

**Icons** are generated by `scripts/make-pwa-icons.mjs`, which writes real PNGs
using only `zlib` — no image library, nothing to install, and the brand colours
can be changed by editing two lines and re-running `npm run icons`.

**`sw.js` and the manifest are served no-cache** (server/static.ts). A browser
holding an old service worker keeps running it, so a bad worker could outlive the
deploy that fixed it.

**Consequence:** the service worker registers in PRODUCTION ONLY. In development
it sits between Vite and the browser and makes hot reload behave strangely.

---

## 2026-08-28 — Opening balances: owed yes, profit never

**Context:** Eleven years of trading on paper. Customers owe money on invoices the
system has never seen. The owner's question was whether collecting QAR 50,000
should book ~10% as profit, since roughly 90% of it was material cost.

**Decision:** None of it is profit. Not 100%, not 10%.

**Why:** the margin on those sales was earned years ago, when the goods were sold.
Booking any of it on collection counts the same profit twice, and makes any month
with heavy collections look like a strong trading month when it was only a good
collection month. Revenue is already reported by INVOICE DATE, so a 2023 invoice
lands in 2023 — the system was right, it only needed the profit exclusion.

**How:** `transactionMode: "opening"`, and the rule lives once in
`shared/transactionMode.ts` as two predicates rather than eleven scattered filters:
`countsForProfit` (opening NO) and `countsForBalance` (opening YES). The two
questions must never be collapsed into one.

`createOpeningBalance()` writes a plain unpaid invoice with the ORIGINAL paper
number and date — not through `createDocument()`, which would move stock, invent
cost, apply the credit-limit gate and burn a number from the counter. None of
those are wanted for a debt that already exists.

`collectOldestFirst()` fills the oldest invoice first and stops when the money runs
out, leaving the last one part-paid. Each allocation goes through `createPayment()`,
so the overpayment guard, the paid/partial ladder and the cash ledger all behave
normally. No parallel money path.

**Verified with the owner's own scenario:** 50,000 across three years raises the
balance by exactly 50,000 and profit by ZERO (it would have been 50,000 of fiction),
and paying 30,000 clears 2023 in full, part-pays 2024, and never touches 2025.

**Still open:** the same flow for suppliers (what the business owes on 30/60/90
terms), and marking old debt doubtful or written off — the owner has balances they
expect never to recover, and a receivables figure that includes them is a fiction.

---

## 2026-08-28 — Test data wiped; doubtful debt is marked, not guessed

**The wipe.** Two of my bugs made this take three attempts, both worth remembering:

1. `dotenv.config()` and the backup script path were resolved against the CURRENT
   DIRECTORY, so running from anywhere but the project root died on "DATABASE_URL
   is not set" or a misleading "Backup failed".
2. `products.supplier_id` blocked deleting suppliers while keeping products. The
   per-table "deleted N" lines print as they go, so the rollback looked like
   success. The owner correctly refused to believe it and checked the app.

Both fixed: paths resolve against the script's own location, blocking links are
found and cleared up front, and a rollback now prints an unmissable banner saying
nothing was deleted. **A destructive script whose failure looks like success is
the worst possible failure mode.**

Result verified directly in the database, not from the output: all transaction
tables empty, 49 products and 6 stores kept, one admin left, numbering back to 1.

**Collectability.** ~QAR 900,000 outstanding after eleven years, of which roughly
500,000 is realistically collectable. Reporting one confident 900,000 overstates
the business.

`customers.collectability` is normal / doubtful / written_off, and
`shared/collectability.ts` holds the split so client and server cannot disagree.
Marking changes REPORTING only — the debt stays, and a later payment lands against
the invoices normally.

**Two judgements baked into the design:**
- Size is not risk. A customer owing 50,000 who pays 40-60% every month is one of
  the best accounts there is; a customer owing 3,000 who stopped answering is the
  problem. The UI says this, because the instinct is to mark the big numbers.
- Anything other than "normal" REQUIRES a reason. In six months nobody remembers
  why an account was written off.

**Deliberately deferred, on the owner's own instinct:** mark from what happens over
the first month of live trading, not from what is feared now. Guessing up front
just moves the fiction somewhere else.

---

## 2026-08-29 — Deleting a location: hide by default, erase on purpose

**The problem.** An admin could not remove a store or warehouse that had anything
in it. The delete refused and explained why, which was correct for a live business
and useless during setup: the system is full of test warehouses holding test stock,
and they could not be got rid of.

**The decision — two speeds, not one.**

*Delete* (the everyday one) HIDES the location. `stores.deleted_at` is stamped, it
leaves every list in the system at once, and for one day it can be undone exactly
as it was — same id, same stock, same history. A store takes its warehouses with
it under a shared `delete_batch`, so one Undo brings the family back.

After the day: a location nobody ever used is cleared out for real. One that HAS
history stays hidden for good and is never erased — invoices, stock moves and
expenses name it, and erasing it would destroy the record of where those things
happened. Hidden costs nothing.

*Erase* (the deliberate one) removes the location AND its contents. This is the one
genuinely destructive button in the system, so it is fenced five ways:

1. a preview first — what goes, counted, table by table
2. the exact name has to be typed back
3. a full verified backup runs BEFORE anything is touched; if it fails, nothing is erased
4. one transaction — a failure half way leaves no mess
5. a cap: over 25,000 rows it is refused outright. That is a working location, not a test one

The rule for each table pointing at the location: **optional link → the row
survives with the link cleared** (an invoice keeps its money, it just no longer
names a place); **required link → the row goes with it** (the stock in that
warehouse). So erasing a test warehouse takes its stock and its shelves, and
leaves the invoices standing.

**Why a day.** A mistake is noticed the same working day — the wrong row clicked,
the wrong branch chosen. `shared/undo.ts` holds the maths alone so the countdown on
screen and the clean-up on the server can never disagree about when the day is up.

**Also.** A location is now a real place: short code, phone, email, CR number, TRN,
opening hours, map link, notes. Duplicate names are refused on create and rename —
two locations both called "Store 2" cannot be told apart on a stock list. Creating a
store offers to make its main warehouse in the same step.

Verified 24/24 against the live database, including the backup actually running
before an erase and the wrong name erasing nothing.

**Same day — "why can't I delete everything and start again?"** Fair question, and
two things were stopping it.

The last location could not be deleted ("the system needs at least one"). That rule
was wrong. A business setting this system up starts with **nothing** and creates its
own stores — an empty list is a real, working state, not a fault. Guard removed from
both delete and erase; the screen now says plainly what an empty system means.

Worse, the seed put six hard-coded locations back whenever the stores table was
empty — so clearing them and restarting the server undid the work silently. It now
seeds only on a database nobody has used yet (no staff accounts). After that, empty
means "the owner emptied it".

Also: restoring a location whose name has since been re-used comes back as
"<name> (restored)" rather than creating two locations that cannot be told apart.

---

## 2026-08-31 — Staff are listed by location, and the photo is not in the list

**Context:** Staff Management was one flat table of every account across both stores.
With two stores and more people coming, "who works at Store 2?" meant reading every
row. The owner asked for a location dropdown, the people separated by location, and
a photo on each person.

**Decision:** The staff list is now grouped into a block per location — store,
warehouse, and a final "Every location" block for the people not tied to one — with
a location dropdown, a search box and an active-only toggle above it. Each person is
a card with their photo, role and login status rather than a table row.

The photo is stored on the user row as a base64 data URL (`users.photo_url`), the
same way a scanned cheque is. The browser centre-crops and shrinks it to a 320px
square before uploading; the server refuses anything over ~300 KB.

**Why:** `/api/users` is loaded by the invoice editor, expenses, the task panel and
the dashboards. Inlining base64 photos there would put a megabyte of pictures into
screens that only want names. So the list sends `hasPhoto: true/false` and the
picture itself is served by `GET /api/users/:id/photo` as a real image, with an ETag.
The auth cookie rides along with the `<img>` request, and the browser re-downloads a
photo only when it actually changes.

**Consequence:** Adding a photo surface elsewhere means pointing an `<img>` at that
route, not re-embedding the data URL in a list response. Changing another admin's
photo still asks for your own password — the server's admin-on-admin rule covers
every field, and it was not worth carving out an exception for a picture.

---

## 2026-08-31 — Receiving a transfer with what actually arrived

**Where this came from.** The owner asked what happens when a store or warehouse
closes: the stock has to be sold off or moved, but roughly **30% of what the
system says is there cannot be found**. Not theft — mistakes, breakage, and
informal swaps (somebody needed white, exchanged it for white bought earlier,
same unit and same price, never went through the system).

A full audit of 23 building-materials scenarios followed. Eight were handled
properly, seven half, eight not at all — and they all reduced to one sentence:
**the system counts materials and never counts what the missing ones were worth.**

**The worst single hole, fixed first.** Receiving a transfer added the quantity
that was SENT. 100 bags leave, 70 arrive, the destination is credited with 100 —
so 30 phantom bags sit in the reports until somebody counts that shelf months
later and records a mystery variance with no money attached. This is the direct
manufacturing process for the 30%.

Receipt now counts. `lines: [{id, receivedQty}]`, only what arrived lands in
stock, and the difference becomes a row in the new `stock_losses` table: quantity,
unit cost, value, kind, mandatory reason, who received it, who sent it. An admin
is notified without opening the transfer list. A line nobody counted is taken as
arriving in full, so the ordinary case is still one click.

**Three judgements worth keeping:**

- **The value falls back to product cost.** A same-owner transfer is priced at
  zero — moving your own stock between your own buildings earns nothing. But a bag
  lost on that trip cost exactly as much as one lost on a cross-owner trip, so the
  loss is valued at `linePrice || productCost`, never zero.
- **No reason, no receipt.** A shortage with no note is just a smaller number. The
  message names the quantity AND the value, because "30 missing" and "QAR 420 gone"
  land differently.
- **More than was sent is refused.** If extra turned up it belongs on its own
  transfer — silently accepting it would invent stock.

`stock_losses` is append-only and deliberately generic: `kind` covers
`transfer_shortage`, `count_variance`, `damage` and `write_off`. Stock counts and
damage write into the same table next, which is what finally lets Finance say what
material losses cost this month.

Verified 23/23 against the live database, including that a full receipt still
behaves exactly as it did and invents no loss.

---

## 2026-08-31 — An admin sets up and recovers accounts. An admin does not log into them.

**Context:** Asked how an admin gets into a staff member's account. The answer the
owner gave is the right one: an admin is an account setter, a recovery agent and a
system maintainer — not someone who logs in as other people. No impersonation or
"view as" feature was built, and none should be.

But the question exposed two real holes.

**Hole 1 — the PIN was a master key stored in plain text.** `recoverPassword`
compared `u.pin` directly. A PIN plus a username is enough to set a new password on
that account. So anyone who could read the database could take over any account, and
anyone who watched a manager type their PIN at the counter could do the same — PINs
are typed openly to approve discounts.

**Decision:** PINs are bcrypt-scrambled like passwords (`users.pin_hash`), and the
plain `pin` column is emptied and never read again. Rules live in `shared/pin.ts`
(pure, tested); hashing in `server/pin.ts`, its own file because both `auth.ts` and
`storage.ts` need it and `auth.ts` already imports `storage.ts`.

**Consequence:** A PIN can no longer be looked up, only compared. Uniqueness
(`pinAlreadyTaken`) and supervisor override (`getManagerByPin`) now compare against
each candidate instead of querying. Both are fine — the staff list is small and
`getManagerByPin` narrows to admins/managers first. Nothing changed for staff: the
migration hashed the PINs people already use.

**Hole 2 — a single admin is a single point of failure.** With passwords AND PINs
both unreadable, the only admin losing both means nobody can get in without opening
the database by hand. Staff Management now carries a standing warning until a second
active admin exists, with a one-click path to create one. A second admin can always
reset the first (that path already existed and already demands the acting admin's
own password).

**Also fixed, found on the way:**

- Onboarding gave the first owner a random PIN they were never told, with
  `mustChangePin: false`. That owner could not approve a discount and — far worse —
  could not use "Forgot password?", which needs the PIN. Now `mustChangePin: true`,
  so the first admin sets a PIN they actually know.
- Changing a second admin's PIN was impossible: the confirmation POSTed to
  `/api/auth/login` with a `userId` and a `pin`, but that route wants a username and
  a PASSWORD, so it always failed. Added `POST /api/auth/verify-pin`, which checks
  the signed-in person's own PIN.
- The Login-access dialog greyed out Save with no explanation when nothing had
  changed, which read as "you must re-enter the password". It now says there is
  nothing to save, and states plainly that a password can only be replaced, never
  read back.

---

## 2026-08-31 (later) — Counting and damage, priced

Second half of the loss work. Transfers were made honest first; now the other two
ways material leaves without being sold.

**A stocktake variance is money.** `setStockCount` already worked out that the
system said 68 and the shelf holds 47. That "−21" was written to the movement log
and went no further. It is now also QAR 294, in `stock_losses`, with the counter's
name on it.

**Counts go both ways, so losses are signed.** Finding 3 MORE than expected is not
a gain to celebrate — it is an earlier mistake correcting itself. Recorded as a
NEGATIVE loss, it nets against the shortfalls, so the month's figure is what
actually went rather than the sum of everything that ever looked wrong. A shortfall
and a surplus of equal value cancel exactly.

**Damage finally has somewhere to live.** The damage screen that existed is for a
CUSTOMER complaining about an invoice; a pallet that fell in the yard could only be
recorded as an anonymous quantity change. `recordDamage` does both halves at once —
stock down, value written down — with a photo, a compulsory reason, and a refusal
if more is claimed than the location holds. Admin/manager only, because it removes
stock.

**One threshold, admin-editable.** `settings.stockLossAlertValue` (default QAR 250)
decides when a single loss tells the owner. A steady trickle of small variances is
normal in a builders' yard; one big one is a question that needs asking today.

**Profit now knows.** `getProfitDetail` carries `materialLosses` and
`realProfitAfterLosses` BESIDE the aggregates — gross profit is still exactly
item-level sales margin from `aggregateInvoiceProfit()`, one source, untouched.
The Profit page shows the three numbers together: gross profit, material lost,
what the period really made. That was the whole point of the audit.

Verified 22/22 against the live database, plus 30 unit assertions on the maths.
