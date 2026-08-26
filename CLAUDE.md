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
npm test          # 109 assertions: vitest money suite + the three verifiers
npm run db:push   # push schema changes (drizzle-kit)
```

Narrower runs:

```bash
npm run test:unit     # vitest only (55 money assertions)
npm run test:verify   # the three parser/matching verifiers (54 assertions)
npm run test:watch    # vitest in watch mode
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

## Rules that must not be broken

**Money and profit.** Gross profit is *item-level*: `Σ(item.amount − item.cost × qty)`.
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

**Roles.** Five: `admin`, `manager`, `worker`, `salesman`, `driver`. Manager sees the
same dashboard as admin. Salesman and worker share `SalesmanDashboard.tsx`, store-scoped.
Store scope is enforced **server-side** via `lockedStoreId(req)` — never trust the client.
No day-off / attendance pay deduction. The owner removed it deliberately. Do not rebuild it.

**Product aliases are synonyms only.** A shower mixer is not a faucet. Size and spec
conflicts hard-block. Low confidence goes to human review — never auto-merge.

## Landmines

- **Restart the dev server after any server-side edit.** Hot reload does not pick it up.
  New routes 404 and old logic keeps running. This wastes hours if you forget.
- **`server/routes.ts` registers 8 paths twice** (`POST /api/customers`, `POST`/`PUT`/
  `DELETE /api/documents/:id`, `/convert`, `/payments`, `POST /api/returns`,
  `POST /api/settings`). Express silently runs only the FIRST handler. Pre-existing.
  Check which one is live before editing either.
- **`DATABASE_URL` must stay on the Supabase Session Pooler** (`...pooler.supabase.com`,
  IPv4). The direct `db.<ref>.supabase.co` host is IPv6-only and dies whenever the
  network has no IPv6 route. Symptom: every request 500s, boot log shows `❌ DB: host not found`.
- **`ALLOW_DEV_HEADERS=1` bypasses auth entirely.** Must stay `0` outside local dev.
- **The GitHub repo is public** (`shakil7116/mtc_pos_crm`). Never commit real business
  data — cost prices, customer records, store addresses, `.env`.

## Working agreements

- `npm run check` must pass before every commit. No exceptions.
- Ask me for screenshots rather than driving the browser to take them.
- New pages must be `React.lazy()` — do not revert to eager imports.
- List endpoints stay lean (base64 logos/photos nulled out). Detail endpoints keep them.
- Manual product entry may have price 0 (price-later workflow). CSV import may not.
- When a decision gets made, log it in `decisions/log.md`.
- Flag anything I do by hand more than twice as an automation candidate.

## Known open items

- No pagination on `/api/documents`.
- No COGS cost snapshot — profit recomputes against *current* cost, so historical
  margins silently drift when supplier prices change.
- `test123` still works as a password. Run `scripts/force-password-reset.mjs` at go-live.
