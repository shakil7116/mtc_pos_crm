# BUGFIX2.md — Phase 6 Bug Fixes
Mamun M Trading and Contracting WLL — MTC POS & CRM

Fixed in priority order (P0 → P1 → P2). All verified against the live server + Supabase DB (`scripts/` probes).

| Bug | Fix Applied | Tested | Pass/Fail |
|-----|-------------|--------|-----------|
| **#1 (P0)** CN document re-credited stock with no approval (rule 21 bypass) | Removed the stock re-credit from `createDocument`'s CN branch (server/storage.ts). Customer returns now move stock **only** through `approveReturn` after admin/manager approval. CN/RV documents are printable records only. | Salesman POST `type:CN` → stock unchanged (1→1) | ✅ Pass |
| **#2 (P1)** No role gate on expense create/edit — any role could add/alter spend | Gated `POST /api/expenses` and `PUT /api/expenses/:id` to admin/manager (server/routes.ts). DELETE was already gated. | driver POST → 403; salesman PUT → 403 | ✅ Pass |
| **#3 (P1)** Demo-mode invoices polluted the real cashflow ledger → skewed cash position & business summary | Guarded every `logCashflow` call in `createDocument` (tender loop) and `createPayment` with `transactionMode !== 'demo'`. Cleaned 3 pre-existing demo cashflow rows. | demo invoice → 0 cashflow rows written | ✅ Pass |
| **#4 (P2)** Product form category/unit were free-text, ignoring managed lists (spec 11B) | Wired both fields to native combobox `<datalist>` fed by `/api/lists/product_categories` + `product_units` (pick existing or type new). Seeded lists from existing product data (24 categories, 16 units). | lists populated + rendered in product form | ✅ Pass |
| **#6 (P2)** No central admin CRUD for managed lists | New **Lists & Categories** Settings panel (`ManagedListsSettings.tsx`, spec 11B): add/edit/delete for product categories, units, expense categories, sub-locations — appears instantly in forms. | tsc clean; panel mounted in Settings | ✅ Pass |
| **#8 (P1, deferred)** Header-based auth spoofable | Re-affirmed as **Go-Live blocker** in EXAMINER_LOG hardening backlog #1. Every gate added is enforced server-side but trusts the role header until real sessions land. | — | Deferred (logged) |

## Not fixed this phase (logged, justified)
- **#5 (P2)** Custom fields (11C) not yet rendered on forms — the dynamic engine (`field_definitions` + `custom_records` + API) exists and is proven; wiring per-form rendering (Text/Number/Date/Dropdown/Checkbox/File → `customData`) is a sizeable feature carried to backlog. Not a regression; a not-yet-built enhancement.
- **#7 (P3)** Business-summary "returning customer" definition edge case on null `createdAt` — cosmetic undercount, documented.

## Note
The multi-agent audit workflow hit the plan's session limit mid-run twice; the audit + fixes were completed inline by direct live-probing of the highest-risk paths (money integrity, approval gate, authz, demo isolation, flexibility). Deeper filter/CSV and full-mobile sweeps fold into Agent 7 verification.
