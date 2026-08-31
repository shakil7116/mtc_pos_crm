# CLAUDE.md — MTC POS & CRM operating manual

Bilingual (EN/AR) POS + CRM for a Qatar building-materials business. Real money,
real stock, real customers. Two stores. Live system, not a demo.

## How to talk to me

Simple, everyday language. I am the business owner, not a career developer.
Explain the *why* in plain words before the technical detail. Action first,
status second. If I ask for something risky, say so in one sentence and then do
it — do not lecture.

## Commands

```bash
npm run dev       # dev server, port 5050
npm run build     # client (vite) + server (esbuild) → dist/
npm run start     # run the production build
npm run check     # tsc typecheck (covers tests too) — MUST be clean before any commit
npm test          # THE GATE: tsc + 142 assertions. Must pass before every commit.
npm run db:push   # push schema changes (drizzle-kit)
```

Narrower runs:

```bash
npm run test:unit     # vitest only (88 money assertions)
npm run test:verify   # the three parser/matching verifiers (54 assertions)
npm run test:watch    # vitest in watch mode
npm run test:live     # read-only smoke test against the REAL db (not in the gate)
npm run backup        # full verified backup -> backups/ (see BACKUP.md)
npm run backup:restore-check   # dry-run a restore; writes nothing
```

Tests never touch the database. `tests/setup.ts` deletes `DATABASE_URL`, so an
accidental query hits the localhost placeholder and fails fast instead of
reaching live Supabase. Money logic is tested through the pure helpers
(`netCollected`, `remainingBalance`, `isOverpayment`, `paymentStatusFor`,
`aggregateInvoiceProfit`) — add new money maths as a pure helper so it stays
testable.

## Layout

- `client/src/pages/` — one file per route. All routes are `React.lazy` code-split.
- `client/src/components/` — shared UI (shadcn/ui + Radix + Tailwind).
- `server/routes.ts` — every HTTP route (5.2k lines).
- `server/storage.ts` — every DB query + business math (4.8k lines).
- `server/auth.ts` — JWT, login lockout, role normalisation.
- `shared/schema.ts` — Drizzle tables, single source of truth for types.
- `shared/permissions.ts` — nav access + role gates. Client and server both read it.
- `scripts/` — one-off migrations (`*.mjs`) and verifiers (`verify-*.ts`).
- `tests/` — vitest suites. Never touch the DB.

Documentation:

- `CLAUDE.md` — this file. Conventions and landmines. Read first.
- `connections.md` — every external system, what breaks without it.
- `BACKUP.md` — how to back up and restore the database. Read it BEFORE you need it.
- `decisions/log.md` — why things are the way they are. Log decisions here.
- `references/` — the master spec, per-page status audit, go-live checklist.
- `archives/` — Jul 2026 session logs. History only, NOT current truth.

## Rules that must not be broken

**Money and profit.** Gross profit is *item-level*: `Σ(item.amount − item.cost × qty)`,
where `item.cost` is `resolveItemCost(costAtSale, products.costPrice)` — the cost PINNED
at the moment of sale, falling back to current cost only for rows written before
`document_items.cost_at_sale` existed. Never read `products.costPrice` directly in a
profit calculation or supplier price changes will rewrite history again.
Never `total − COGS`. `aggregateInvoiceProfit()` in `server/storage.ts` is the only
source — Finance, Reports and Dashboard all read it so they cannot disagree.
Real profit = PAID invoices only. Expected profit = all non-void.
Demo rows (`documents.transactionMode === "demo"`) are excluded **everywhere**.
Any new profit surface reads these aggregates or it will drift.

**Overpayment is blocked, not stored.** `createPayment` throws `OverpaymentError`
(HTTP 400) if net collected would exceed the invoice total. There is no customer
credit ledger, so excess money has nowhere to live. Refunds and void/returned
invoices are exempt. Do not remove this guard.

**Returns are documents.** Invoice "Return" opens `ReturnModal` → `POST /api/returns`
→ created **pending**. Nothing moves until an admin/manager approves in `/approvals`.
`approveReturn` reverses stock, issues the refund, and generates a linked Credit Note
(`type: "CN"`). The dashboard deducts RV/CN document totals. The legacy `returns`
table still serves the read-only audit list — dual model, do not delete it.

**Print CSS is duplicated on purpose.** The `@media print` `<style>` block exists
verbatim in BOTH `client/src/pages/DocumentDetail.tsx` (saved docs — this is the real
print path) and `client/src/pages/DocumentEditor.tsx` (editor preview). Change one,
mirror the other. `min-height: 272mm` + `height: auto` + `@page { size: A4 }` is what
pins the totals block to the bottom of the page. Do not "simplify" it.

**A transfer is received with what ARRIVED, and shortages are money.**
`receiveTransfer` takes `lines: [{id, receivedQty}]` and adds ONLY that to the
destination. It used to add the quantity sent, which turned every short delivery
into phantom stock — the reason a location comes out ~30% short when emptied. The
gap is written to `stock_losses` (quantity AND value, at `linePrice || productCost`,
since a same-owner transfer is priced at 0 but a lost bag still cost money), with a
mandatory reason, the receiver and the sender, and an admin notification. A line
with no counted quantity means "arrived in full", so one-click receipt still works.
`shared/stockLoss.ts` holds the maths — screen and server both read it, and they
must never disagree. `stock_losses` is append-only: correct a loss by recording the
opposite, never by editing. Stock counts and damage are meant to write here too.

**Deleting a location hides it; erasing is a separate, fenced action.**
`DELETE /api/stores/:id` stamps `deleted_at` — the row stays, leaves every list, and
is undoable for one day (`shared/undo.ts`, `POST /api/stores/:id/restore`). A store
takes its warehouses with it under a shared `delete_batch`. `getStores()` filters
deleted rows out by default — pass `{ includeDeleted: true }` to see them, and never
add a store read that skips it. `purgeExpiredStores()` only ever hard-deletes a
location with ZERO references; one with history stays hidden for good.
`POST /api/stores/:id/erase` is the destructive path: preview → typed name → an
automatic backup → one transaction → a 25,000-row cap. Optional links are cleared,
required links go with the row. Do not loosen any of those five gates.

**Roles.** Five: `admin`, `manager`, `worker`, `salesman`, `driver`. Manager sees the
same dashboard as admin. Salesman and worker share `SalesmanDashboard.tsx`, store-scoped.
Store scope is enforced **server-side** via `lockedStoreId(req)` — never trust the client.
No day-off / attendance pay deduction. The owner removed it deliberately. Do not rebuild it.

**Product aliases are synonyms only.** A shower mixer is not a faucet. Size and spec
conflicts hard-block. Low confidence goes to human review — never auto-merge.

## Landmines

- **Restart the dev server after any server-side edit.** Hot reload does not pick it up.
  New routes 404 and old logic keeps running. This wastes hours if you forget.
- **Eight paths appear registered twice in `server/routes.ts` — this is NOT a bug.**
  Lines 416-473 are demo-mode fallthrough guards: if `dbAvailable()` is false
  (`DATABASE_URL` unset) they serve from the in-memory demo store, otherwise they
  call `next()` and the REAL handler further down runs. Both handlers are live, in
  sequence. Do not "clean up" the second one — you would delete the real logic.
  Affected: `POST /api/documents`, `PUT`/`DELETE /api/documents/:id`, `/convert`,
  `/payments`, `POST /api/customers`, `POST /api/returns`, `POST /api/settings`.
- **`DATABASE_URL` must stay on the Supabase Session Pooler** (`...pooler.supabase.com`,
  IPv4). The direct `db.<ref>.supabase.co` host is IPv6-only and dies whenever the
  network has no IPv6 route. Symptom: every request 500s, boot log shows `❌ DB: host not found`.
- **`ALLOW_DEV_HEADERS=1` bypasses auth** in non-production. It is now also gated on
  `NODE_ENV !== "production"`, so it cannot be switched on in prod by mistake. Still keep it `0`.
- **The GitHub repo is public** (`shakil7116/mtc_pos_crm`). Never commit real business
  data — cost prices, customer records, store addresses, `.env`.

## Working agreements

- `npm test` must pass before every commit. No exceptions. It runs the typecheck
  first, so a green test run cannot hide a type error (that mistake has been made).
- Ask me for screenshots rather than driving the browser to take them.
- New pages must be `React.lazy()` — do not revert to eager imports.
- List endpoints stay lean (base64 logos/photos nulled out). Detail endpoints keep them.
- Manual product entry may have price 0 (price-later workflow). CSV import may not.
- When a decision gets made, log it in `decisions/log.md`.
- Flag anything I do by hand more than twice as an automation candidate.

## Known open items


- No pagination on `/api/documents`.
- `test123` still works as a password. Run `scripts/force-password-reset.mjs` at go-live.
