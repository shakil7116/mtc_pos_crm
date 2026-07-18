# GO_LIVE_CHECKLIST.md — Store 1, Najma Street (Doha)
Mamun M Trading and Contracting W.L.L · MTC POS & CRM

Status legend: ✅ done in-system · ⚙️ config step (do at install) · 🔴 blocker.

## SECURITY
- ✅ **JWT authentication** — server-issued signed token in an httpOnly cookie; role/store read from the verified token, never from client headers. (Phase 7)
- ✅ Role gates server-enforced — no token → every gate fails closed (403). Verified: salesman token + forged `x-user-role: admin` header → still 403 (token wins).
- ✅ Login lockout — 5 wrong passwords → 10-minute lock + admin alert.
- ✅ First-login forced password change; min 8 chars; admin password reset; role change invalidates existing sessions.
- 🔴 **Before production: remove `ALLOW_DEV_HEADERS=1` from `.env`** (dev/test escape hatch). Set `NODE_ENV=production` so the cookie is `secure`. Rotate `JWT_SECRET`.
- 🔴 Rotate the Supabase DB password (was shared in chat earlier) and keep `.env` out of version control.

## DATA
- ⚙️ **Purge demo/test data** — run `scripts/purge-demo.mjs` (below) to soft-remove `transactionMode='demo'` docs, `NJ *` / `PHASE*_SEED` / `P0/AUDIT/CF Test` rows. Keep numbering intact (never reused).
- ✅ Real inventory entered — 19 real products across Gypsum/Plumbing/Electrical/Painting/Safety/Power Tools/Chemicals, each with cost, sell, min-stock and full 4-level location path (`scripts/seed-phase7-real.mjs`).
- ✅ Real customers entered — 5 (Mohammed Al-Rashidi, Ahmed Construction WLL, Farhan Trading [HIGH RISK], Omar Hassan, Khalid Al-Marri) with credit limits + opening balances (aging verified: Farhan 75d→61-90, Mohammed 45d→31-60).
- ⚙️ Real suppliers — add via Suppliers page (at least the gypsum/paint/electrical suppliers).
- ⚙️ Opening stock per location — confirm quantities with a physical count, adjust via Inventory → Stock Adjustment.
- ⚙️ **Document starting numbers** — Settings → Document Numbering: set each type's next number to continue from the last handwritten book (INV/QT/DN/CN/PO).

## STAFF SETUP
- ✅ User accounts + usernames + default passwords generated (`Mtc@2026-<id>`, `mustChangePassword=true`).
- ⚙️ Create real staff (1 salesman, 1 warehouse keeper, 1 driver, 1 manager) via Settings → Users; assign roles + store/warehouse.
- ⚙️ Each salesman → Store 1; each keeper → their warehouse; driver account created.
- ⚙️ All staff log in once and change their password (forced).
- ⚙️ Train each role on their dashboard (salesman invoice+payment, keeper receive+deliver+Log Issue, driver Mark Delivered, admin approvals+corrections+reports).

## SETTINGS
- ⚙️ Business name/address (already "Store 1 — Najma Street, in front of Famous Restaurant, Doha") + upload logo.
- ✅ Business rules configurable: void window hours, **void PDC threshold QAR 4,000**, **return PDC threshold QAR 5,000**, PDC alert days, maintenance cheque threshold, credit terms.
- ✅ Product categories / units / expense categories / locations / sub-locations — all admin-editable (Settings → Lists & Categories + Location Hierarchy).
- ✅ Custom fields per module (Settings → Custom Fields) render instantly on the forms.

## DOCUMENTS
- ✅ 5 print templates; ⚙️ select the invoice + quotation template in Settings.
- ✅ Document numbers sequential, no duplicates (PUT dup → rejected), void kept as VOID.
- ✅ Cost price never in the customer document payload/print (verified).
- ✅ Discount at line level only — never in the footer (all templates).
- ⚙️ Print one real invoice on the store printer and confirm layout/quality.

## FINAL SMOKE (verified this phase — DOCTEST.md 9/9)
- ✅ Cash invoice (stock −qty, paid, sequential #).
- ✅ Credit invoice (limit checked, unpaid, aging).
- ✅ Split cash + PDC (partial, cheque in tracker).
- ✅ Delivery invoice → auto Delivery Note on driver confirm.
- ✅ Quotation (no stock move) → convert to invoice (manager, online transfer).
- ✅ Return < QAR 5,000 → **cash refund** (never forced PDC), manager-approved.
- ✅ Void within window (stock reversed, VOID kept, cash refund).
- ✅ Reports run (Business Summary / Stock Movement / Aging / PDC / Expenses) with CSV + print.

## OUTSTANDING (non-blocking, post-launch)
- Custom-field values in CSV export + list-view columns (values save + show on forms/detail now).
- Server-side enforcement of *required* custom fields (client enforces today).
- Custom module builder (11D) nav auto-registration for admin-created modules.
- WhatsApp API wiring for live PDC/approval/delivery notifications (in-app works today).
