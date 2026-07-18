# BUGS.md — MTC POS & CRM Audit vs MTC_MASTER_SPEC.md

**Method:** 7 parallel module-group auditors, every finding grounded in `file:line` evidence.
**Date:** Phase 1 (Audit). No code changed — this is the gap list only.
**Legend:** P0 = crash / wrong money or inventory / data-integrity / security · P1 = blocks daily workflow · P2 = annoying but workable · P3 = cosmetic · MISSING = whole feature absent.

> **Headline:** This is not a "fix a few bugs" job. ~40% of the spec is **entirely unbuilt** (Expenses, Warehouse Maintenance, Delivery, PDC-payable, Notifications, Custom-Module Builder, 3 of 5 roles), and the spec's **#1 architectural requirement** — dynamic fields/modules with *zero schema migrations* — conflicts with the current fixed-`pgTable` design. See MISSING + P0-ARCH.

---

## P0 — CRITICAL (money / inventory / data-integrity / security)

| # | Module | Feature | Evidence | Impact |
|---|---|---|---|---|
| 1 | Inventory / PO | PO receipt never adds stock | `storage.ts:676-692` updateSupplierOrder sets status only; `supplierOrders` has no storeId (`schema.ts:279-288`); PUT `/api/supplier-orders/:id` `routes.ts:1013` | Inventory permanently understated — buying never grows stock |
| 2 | Inventory / Customers | CSV import 404s (dead) | `Settings.tsx:1557` `/api/products/import`, `:1589` `/api/customers/import` — no such routes | Bulk add/update entirely non-functional |
| 3 | Documents | Split payment impossible | `SaveInterceptorModal.tsx:31` single select (Cash/Credit/Partial Credit/PDC); no per-method amounts; createDocument records no payment rows `storage.ts:379-452` | Spec's core multi-tender (cash+card+PDC+credit) cannot be expressed |
| 4 | Documents | 12-hour void window absent; edit desyncs stock | No `/void` route; `updateDocument` `storage.ts:454-460` + PUT `routes.ts:592-605` never reverse/re-deduct inventory | No cancel/partial-refund path; editing silently corrupts stock |
| 5 | Documents | Refund-method rules absent | `routes.ts:947-959` refunds by raw method, no card→cash, no PDC≥4000, no split-per-portion; no `4000` constant anywhere | Wrong refund method → money loss |
| 6 | Documents | Payment status double-counts refunds | `storage.ts:499-507` sums ALL payment rows incl `isRefund` | A refund flips an invoice to "paid" |
| 7 | Documents | Credit Note processes with NO approval | POST `/api/returns` `routes.ts:902-965` restores stock + refunds instantly; `createReturn` hardcodes `status:'approved'` `storage.ts:587` | Spec mandates submit→admin approve→then process; none exists |
| 8 | Dashboard | "Real profit" math wrong | `routes.ts:1099-1106` buckets by `paymentType==='cash'` not money collected; partial payments ignored | Real/Imaginary profit both misstated |
| 9 | Finance | PDC payable side missing | `cheques` table has `customerId` only, no `type`/`supplierId` (`schema.ts:187-198`) | Cheques given TO suppliers can't be tracked — half the module gone |
| 10 | Finance | PDC bounce handling missing | No `bounced` status (`schema.ts:195`); no customer/supplier risk flag; no alert | A bounced cheque has no representation |
| 11 | Roles | Only 2 roles exist (need 5) | `schema.ts:57` `admin\|staff`; `auth.ts:6` | Manager/Warehouse/Salesman/Driver impossible → blocks dashboards, menus, notifications |
| 12 | Roles | No route/menu role gating | `App.tsx:28-52` zero role checks; every route reachable by any user; only Settings hidden (`Layout.tsx:142-144`) | Salesman sees financials, Driver sees everything |
| 13 | Dashboards | 5 role dashboards missing | `Dashboard.tsx` single generic view for all; only `isAdmin` locks 2 cards | Warehouse/Salesperson/Driver/Manager dashboards absent |
| 14 | Roles / Delivery | Driver dashboard missing (end-to-end) | No driver role/page/route, no delivery-assignment model, no "Mark Delivered" | Core driver flow absent |
| 15 | Notifications | No notifications model | No `notifications` table; no `/api/notifications`; `messagesLog` is outbound-WhatsApp only | Entire Module 13 (9 events × 5 roles) unbacked |
| 16 | **Architecture** | **Dynamic schema (custom fields/modules, zero migrations) missing** | `schema.ts` fixed pgTables only; no EAV/JSONB attribute bag, no field/module metadata tables | Spec's **#1 requirement**; custom fields + module-builder impossible without re-architecture |
| 17 | Settings 11C | Custom fields per module missing | No custom-field UI/routes anywhere; forms render hardcoded columns only | Cannot add e.g. "Brand"/"Project Site" without code |
| 18 | Settings 11D | Custom Module Builder missing | No module-builder UI; nav is hardcoded array `Layout.tsx:28-35` | Admin can't create new modules |

---

## P1 — BLOCKS DAILY WORKFLOW

| Module | Feature | Evidence | Note |
|---|---|---|---|
| Inventory | Stock-movement report (opening/received/sold/returned/current + date + location) | no endpoint; `Reports.tsx` InventoryTab is current-stock only | Go-Live reconciliation report absent |
| Inventory | Reports inventory tab broken data shape / crashes on search | `routes.ts:1250-1259` nests under `.product`; `Reports.tsx:1112` `r.name.toLowerCase()` → TypeError; storeId filter ignored | Blank names, QAR 0 stock value, tab crash on typing |
| Inventory | Opening stock per product/location + date | no schema field/UI | Reconciliation baseline impossible |
| Customers | Overdue **statement generator** (aging buckets, printable) | absent in `CustomerDetail.tsx` | Customer-360 requirement missing |
| Customers | Bad-debt auto-flag 30/60/90 + >90 high-risk | none; only flat >30d banner | Dashboard + record flag missing |
| Customers | Credit limit "admin only" not enforced | `Customers.tsx:246`, `CustomerDetail.tsx:304`, server `routes.ts:481` no role gate | Any user edits credit limits |
| Customers | Balance includes void/returned invoices | `storage.ts:235-253` no status filter | Overstates what customer owes |
| Suppliers | Supplier Returns (2 types, refund status, cash-in, PO-linked) | none anywhere | Entire feature absent |
| Suppliers | Supplier ledger (what you owe, by due date) | no amount fields on PO/supplier | No payables visibility |
| Suppliers | PO payment terms + supplier PDC payable | `supplierOrders` no payment fields; cheques customer-only | Can't record how a PO is paid |
| Documents | Cost-price column (on-screen only) | not rendered in `DocumentEditor` grid/`DocumentDetail` | Staff can't see margin at line |
| Documents | Per-line discount UI (QAR/%) | model exists, no input column; hardcoded 0 | Discount unreachable |
| Documents | Delivery method (3 options) | no `deliveryMethod` field/selector | Blocks DN auto-gen + delivery board |
| Documents | Credit-limit check + admin override | advisory dismissible banner only `DocumentEditor.tsx:369` | No blocking/override gate |
| Documents | DN auto-generate from Deliver-to-Site | DN is manual-only | Spec says auto-only |
| Documents | DN delivery status + driver confirm | no status field/action | Lifecycle absent |
| Documents | CN refund method (cash/online, PDC>4000, never card) | `routes.ts:947` no enforcement | Wrong refund possible |
| Documents | PO statuses Draft/Sent/PartiallyReceived/FullyReceived + receive | editor PO only draft/sent; no receive→inventory | Lifecycle absent |
| Finance | PDC status lifecycle (Deposited/Bounced) | only pending→cleared `routes.ts:885` | Can't record deposited/bounced |
| Finance | PDC 3-day alert to admin+manager (in-app+WhatsApp) | passive dashboard banner only; no scheduler/targeting | Alert not delivered |
| Finance | Split / partial-combination payments | single-method recording `routes.ts:627` | Multi-tender uncapturable |
| Finance | PDC threshold (QAR 4000) editable + enforced | no setting, no enforcement | — |
| Dashboards | Real-vs-Imaginary single box w/ brackets | two separate cards, no combined box | Format + math wrong |
| Dashboards | Credit exposure / bad-debt red / cash position / delivery board / location filter | none | Multiple 8C items absent |
| Roles | Audit trail (user+timestamp+**device**) | `editLog` doc-edits only, no device; logins/payments/adjustments unlogged | Partial |
| Notifications | 9×5 routing + in-app delivery UI | no model, no bell UI | Absent |
| Settings 11A | PDC threshold / void-window-hours / credit-terms editable | none in settings table/UI | Hardcoded, not configurable |
| Settings 11B | Product categories / units / roles-&-permissions add/edit/delete | free-text only, no managed lists, roles hardcoded | Not the dynamic lists spec requires |

---

## P2 — ANNOYING BUT WORKABLE

| Module | Feature | Evidence |
|---|---|---|
| Inventory | Profit column (Sale−Cost) not surfaced | `schema.ts:102-114`, no profit in UI |
| Inventory | Free-text sub-locations | no field/UI |
| Inventory | Dynamic category (managed list vs free-typed) | free Input, no Settings list |
| Inventory | Adjustments Log always empty | `Inventory.tsx:1483` `/api/stock-adjustments` 404 (data is written but unreadable) |
| Inventory | Stock transfer not atomic | two sequential POSTs `Inventory.tsx:292-318`; failed leg loses stock |
| Customers | Unified chronological ledger (interleaved) | separate tabs, no running-balance stream |
| Customers | Quotation not-converted **reason** | no capture |
| Suppliers | Two divergent PO systems (supplierOrders vs documents type PO) | `Suppliers.tsx` vs `PurchaseOrderEditor.tsx`; never reconcile |
| Suppliers | PO printable/downloadable (supplierOrders path) | WhatsApp text only |
| Documents | Void/Returned statuses display-only | no transition sets them |
| Documents | Invoice-list filters (payment-type, customer picker, delivery) | only status+date+text |
| Documents | CN result reads wrong field → shows `CN-??????` | `ReturnModal.tsx:249` reads `data.creditNote` but API returns `returnVoucher` |
| Documents | 7-day return gate contradicts "CN no time limit" | `DocumentDetail.tsx:466` |
| Finance | PDC/PO linkage (payable) | cheques invoice-only |
| Finance | Missing cheque date defaults to today | `routes.ts:649` |
| Dashboards | Outstanding supplier payments / today's expenses / recent returns panels | none (also blocked by missing modules) |
| Dashboards | Numbers drill-down (several non-clickable / generic links) | insights + cheque rows not clickable |
| Settings | Expense categories / sub-locations lists | none |
| Settings | WhatsApp API config / notification prefs | phone-only field; no API creds |

---

## P3 — COSMETIC

| Module | Feature | Evidence |
|---|---|---|
| Customers | Email field | no column/input |
| Customers | Cash-vs-Credit type dimension | enum is walk-in/contractor/corporate/gov |
| Customers | Credit-remaining shown as explicit value | only a % bar |
| Inventory | Configurable unit list | free-text |
| Documents | PO detail view lacks PO badge/receive UI | `DocumentDetail.tsx:96` type union excludes PO |
| Settings | Real-time (half the dashboard queries don't poll) | only summary polls 60s |
| Settings | Hardcoded values (doc counters, version, brands defaults) | `Settings.tsx:1029,1650`; `schema.ts:37-40` |
| Settings | Stale `Sidebar.tsx` (InvoicePro branding, dead code) | `Sidebar.tsx:21,46` |

---

## MISSING — ENTIRE FEATURES ABSENT (no model, no API, no UI)

| Spec | Feature | Note |
|---|---|---|
| Module 5 | **Expenses** — table, API, UI, categories, recurring flag, maintenance-link, >QAR10k cheque rule | zero `expense` matches anywhere |
| Module 6 | **Warehouse Maintenance** — issue model, urgency, flows, Manager-Override, status lifecycle | no maintenance table/page/route |
| Module 12 | **Delivery System** — 3 options, deliver-to-site trigger, driver confirm, delivery status, address/assignment | no delivery model at all |
| Module 7 | **PDC payable** (supplier cheques) + Deposited/Bounced states | cheques customer-only |
| Module 5 | **Recurring expenses** + scheduler | no cron/scheduler in server |
| Module 11C/D | **Custom fields + Custom Module Builder** (+ dynamic schema) | the #1 architectural gap |
| Module 13 | **Notifications** (model, routing, in-app center, status) | none |
| Module 11E | Per-user **activity log** (with device) | none |

---

## ✅ WHAT CURRENTLY WORKS (verified present + correct)

- **Sales deduct stock** at the correct location on INV create; customer returns / CN re-credit stock; `adjustStock` clamps ≥0 and writes an audit row (`storage.ts:427-449, 297-317`).
- **Per-product low-stock threshold** + Low-Stock tab + nav badge.
- **Customer/Supplier CRUD**, customer balance (invoices−payments), customer-360 tabs (invoices/quotes/payments/cheques), cheque tracking + Mark-Cleared.
- **Quotation→Invoice conversion** with bidirectional link; per-line editable sale price; doc-number auto-counters + validation; DN hides prices.
- **Receivable cheque tracking**: auto-create on cheque payment, overdue derivation, Reports cheque tab (grouped + CSV), dashboard due-this-week.
- **Settings**: company info, stores/warehouses CRUD, user CRUD (PIN, deactivate), doc settings, brands, social, messaging, per-entity CSV **export**, admin-only guard.
- **Dashboard** mobile responsive; `/api/dashboard/summary` live metrics (60s poll); admin-locked profit cards; premium invoice template.

---

## READINESS & RECOMMENDED BUILD ORDER

**Overall spec coverage today: ~45–50% (mostly the single-store sales/quote/customer/cheque core).** The multi-location logistics half (warehouses, delivery, drivers, expenses, maintenance, supplier payables, notifications) and the dynamic-architecture requirement are largely greenfield.

**Recommended sequence (matches spec Phase 2→6, dependency-ordered):**
1. **FOUNDATION (P0-ARCH):** decide the dynamic-data strategy (JSONB `customData` bag per entity + `field_definitions` + `module_definitions` metadata tables) — everything else layers on this. Then **5 roles + role-gated routes/menus** (unblocks dashboards + notifications).
2. **DATA-INTEGRITY P0s in existing code** (fast, high-value): refund double-count (#6), PO-receive→inventory (#1), CSV import routes (#2), balance excludes void/returned, void-window + edit stock-sync (#4).
3. **Documents money-rules:** split payment (#3), refund rules (#5), CN approval flow (#7), per-line discount + cost-price column, credit-limit override.
4. **New modules:** Expenses → PDC payable/bounce → Warehouse Maintenance → Delivery system (driver flow).
5. **Dashboards** (5 role variants, Real/Imaginary box, drill-down, location filter) + **Notifications**.
6. **Reports** (stock-movement, aging, business summary) + **Settings** dynamic lists/custom-fields/module-builder + CSV import.

**One decision needed from you before Phase 2:** the dynamic-schema requirement ("no migrations ever") is a genuine re-architecture. Recommend **JSONB attribute bags + metadata tables** (pragmatic, Supabase-friendly) rather than full EAV. Confirm and I'll build the foundation first.
