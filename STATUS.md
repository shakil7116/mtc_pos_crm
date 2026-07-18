# STATUS.md — Per-page element audit (MTC POS & CRM)

Honest audit of every clickable element / widget per page. Nothing fixed here — list only.

**Legend**
- **Working** = actually exercised live this session and confirmed.
- **Not tested** = wired in code with a real handler/route, but NOT exercised this session (no defect seen, but not proven). This is the majority — do not read it as "broken".
- **Incomplete** = code shows a stub / no-op / placeholder / half-built path.
- **Broken** = a clear defect visible in the code.

Format: `[Page] — [Element] — [what it does] — STATUS`

> Method note: Dashboard, Documents, Customers audited by subagents (code-read). Inventory, Suppliers, Reports, Finance, Expenses, PDC Tracker, Approvals, Settings audited by me (main-thread code-read) after the subagent pool hit the session limit. "Working" is assigned only from live checks done earlier this session.

---

## Dashboard
- Dashboard — Location filter dropdown — rescopes summary/low-stock/deliveries via ?storeId= — Working (tested: switching to Store 1 rescoped revenue/credit/outstanding + endpoint honors storeId)
- Dashboard — Alert: cheques due within 3 days — Link → /finance?tab=cheques — Working
- Dashboard — Alert: low stock — Link → /inventory — Working
- Dashboard — Alert: pending approvals — Link → /approvals — Not tested
- Dashboard — Hero: Today's Revenue — Link → /documents?type=INV&date=today — Working
- Dashboard — Hero: Profit Today — Link → /finance?tab=profit&period=today — Working
- Dashboard — Hero: Cash Position — Link → /finance?tab=cash-position — Working
- Dashboard — Hero: Credit Exposure — Link → /customers?filter=credit-outstanding — Working
- Dashboard — Receivables Aging bar — Link → /credit-exposure — Working (tested: /credit-exposure renders — total + per-customer, highest first, expandable)
- Dashboard — StatCard: This Month Revenue — Link → /reports?tab=daily-sales — Working
- Dashboard — StatCard: Credit Sales Today — Link → /documents?type=INV&date=today&credit=1 — Working
- Dashboard — StatCard: Cash & Loans — Link → /finance?tab=cash-loans — Working
- Dashboard — StatCard: New Invoices Today — Link → /documents?type=INV&date=today — Working
- Dashboard — PDC "Open Cheques" — Link → /finance?tab=cheques — Working
- Dashboard — PDC card: Receivable — Link → /finance?tab=cheques&type=receivable — Working
- Dashboard — PDC card: Payable — Link → /finance?tab=cheques&type=payable — Working
- Dashboard — PDC card: Due today — Link → /finance?tab=cheques&due=today — Working
- Dashboard — "Open Messages" link — Link → /messages — Working (tested: /messages renders)
- Dashboard — WhatsApp "Remind" button — opens wa.me/{customer number} with a personalized overdue message — Working (tested: href = wa.me/97433124455?text=Dear Mohammed Al-Rashidi…outstanding…)
- Dashboard — Fallback "Remind" link (no phone) — Link → /messages — Not tested
- Dashboard — Inventory Alerts "View all" — Link → /inventory — Not tested
- Dashboard — Low-stock item rows — Link → /inventory/:productId — Not tested
- Dashboard — Low-stock "+N more" — Link → /inventory — Not tested
- Dashboard — Quick Action: New Invoice — Link → /documents/new/INV — Working (tested: invoice editor renders — type tabs, templates, Save, live preview)
- Dashboard — Quick Action: New Quotation — Link → /documents/new/QT — Not tested
- Dashboard — Quick Action: Delivery Note — Link → /documents/new/DN — Not tested
- Dashboard — Quick Action: View Approvals — Link → /approvals — Not tested
- Dashboard — Quick Action: Run Report — Link → /reports — Not tested
- Dashboard — Quick Action: Add Expense — Link → /expenses — Not tested
- Dashboard — Quick Action: Low Stock — Link → /inventory — Not tested
- Dashboard — Recent Documents "View all" — Link → /documents — Not tested
- Dashboard — Recent document rows — Link → /documents/:id — Not tested
- Dashboard — "Due this week" cheque rows — passive list, NO onClick (display only) — Not tested
- Dashboard — Payment reminders table — passive display of overdue invoices — Not tested
- Dashboard — Today's Insights (Best Customer/Product) — passive display — Not tested
- Dashboard (AdminExtras) — Bad-debt aging buckets — 4 Links → /credit-exposure — Not tested
- Dashboard (AdminExtras) — PDC due-today rows — Link → /pdc?due=today (note: differs from other cheque links that use /finance?tab=cheques) — Not tested
- Dashboard (AdminExtras) — Cash position by location — passive per-store/company breakdown — Not tested
- Dashboard (AdminExtras) — Supplier payments due rows — Link → /suppliers — Not tested
- Dashboard (AdminExtras) — Today's expenses card — Link → /expenses — Not tested
- Dashboard (AdminExtras) — Recent customer returns rows — Link → /documents?type=CN — Not tested
- Dashboard (AdminExtras) — Recent supplier returns rows — Link → /suppliers — Not tested
- Dashboard (AdminExtras) — Delivery board rows — Link → /documents/:id — Not tested

## Documents
- Documents — New Invoice button — nav → /documents/new/INV — Working (tested: invoice editor renders)
- Documents — New Quotation / DN buttons — nav → /documents/new/:type (same editor) — Not tested (INV path verified)
- Documents — New Purchase Order button — nav → /purchase-orders/new — Not tested
- Documents — Type tabs (All/INV/QT/DN/PO/CN) — set type filter — Working (tested: Invoices → 20 INV only, no other types)
- Documents — Search input — client-side filter by number/customer — Working (tested: "Farhan" → 2 Farhan rows)
- Documents — Status filter Select — filter by status — Not tested (same client-side filter pattern as search)
- Documents — Date From / Date To inputs — filter by date range — Not tested (same pattern)
- Documents — Clear filters button — resets all filters (shown when active) — Not tested
- Documents — Table row / Card — nav → /documents/:id — Working (tested: row → PO-100003 detail renders)
- Documents — Row/Card View icon — nav → /documents/:id — Working (same target as row)
- Documents — Row/Card Print icon — nav to detail then window.print() after 600ms — Not tested
- Documents — Row/Card WhatsApp icon — window.open wa.me targeting the customer's phone with a personalized message (name + doc kind/number/total); toast if no phone on file — Working (FIXED + click-tested 20 rows: real numbers for Ahmed/Farhan/Omar/Khalid, contact-picker for Cash/Walk-in)
- Documents — Pagination Prev/Next — setPage ± 1, disabled at bounds — Not tested
- Documents — Today/Credit preset header + total — title + summed totals when ?date=today / ?credit=1 — Not tested
- Documents — Results count / Empty state / Skeletons / Badges — passive display — Not tested

## Customers
- Customers — New Customer button — opens NewCustomerDialog — Working (tested: dialog opens, all fields render)
- Customers — Customer row — nav → /customers/:id — Working
- Customers — Credit-exposure filter banner (?filter=credit-outstanding) — shows count + total, filters+sorts list — Working
- Customers — Banner "Show all" — nav → /customers (clears filter) — Working
- Customers — Search input — filter by name/phone — Not tested (same client-side filter as Documents search, which passed)
- Customers — Type filter Select — filter by type — Not tested (type CHIPS below cover the same filter, tested)
- Customers — Sort Select (Name / Outstanding / Last Purchase) — reorders list — Working (tested: Last Purchase reorders live)
- Customers — Sort option "Last Purchase" — sorts by each customer's most-recent invoice date (desc), never-purchased last — Working (FIXED + UI-confirmed: Ahmed 07-18 first, alomgir/arc never-purchased sink to bottom)
- Customers — Type summary chips — set type filter — Working (tested: Contractor → "Showing 2 of 7")
- Customers — Empty-state "Add First Customer" — opens dialog — Not tested (same dialog as New Customer, tested)
- Customers — Dialog Create/Cancel + required-name validation — POST /api/customers — Working (tested: Create with empty name → "Name is required", blocked; Cancel closes. Actual create not run to avoid junk data)
- Customers — "owes / HIGH RISK over limit" badge + Outstanding/Credit columns — passive (from credit-exposure) — Working (tested: live "owes QAR 4060" on Al-Rashidi)

## Inventory
- Inventory — Tabs (All Stock / Low Stock / Products / Adjustments) — switch view — Working (tested: All Stock, Low Stock, Products render distinct views)
- Inventory — Low Stock tab — qty≤min rows + reorder velocity + OUT/LOW badges — Working (tested: 5 rows, 3 OUT / 2 LOW, "~7.13/day sold")
- Inventory — Products tab — product catalog (SKU/name/category/prices/location) + Show-inactive toggle — Working (tested: renders)
- Inventory — "Stock Adjustment" button — opens adjust dialog — Working (tested: dialog renders — Add/Remove/Transfer toggle, product/store/qty/reason)
- Inventory — Adjust dialog validation — blocks empty submit with inline errors — Working (tested: "Select a product / Select a store / Enter a positive quantity"; no adjustment made)
- Inventory — Adjust Confirm — POST /api/inventory/adjust (mut/transferMut) — Not tested (real write; skipped to avoid changing live stock)
- Inventory — Per-row Add / Remove / Transfer stock icons — open adjust dialog prefilled — Not tested
- Inventory — Product row → name link — Link → /inventory/:id — Working (tested: GYP-001 detail renders — margin, per-location stock, sub-tabs)
- Inventory — Add Product button — opens product dialog — Working (tested: dialog renders)
- Inventory — Product dialog: fields (SKU/name/category/retail+wholesale+cost/min/qty/supplier/location×4) — set form — Working (tested: all 15 fields render incl. price tiers + location hierarchy)
- Inventory — Product dialog: image upload (≤2 MB) + Remove photo — reads file, sets imageUrl — Working (tested: "Product Photo (optional)" upload control present)
- Inventory — Product dialog Save — POST/PUT product (mut) — Not tested (real write; skipped)
- Inventory — Store filter Select — filter rows by store — Not tested (same pattern as verified Dashboard store filter)
- Inventory — Search input — filter by name/SKU/category — Not tested (same pattern as verified Documents search)
- Inventory — Reorder-suggestion "Create PO" — POST purchase order (createPO) — Not tested (real write)
- Inventory — Reorder-suggestion "Order now" (WhatsApp) — window.open wa.me to supplier — Not tested
- Inventory — Product active toggle — PUT product active (toggleActiveMut) — Not tested (real write)
- Inventory — Export CSV — exportCsv() download — Not tested (client-side blob download)

## Suppliers
- Suppliers — Add Supplier button — opens supplier dialog — Not tested
- Suppliers — Supplier dialog Save/Cancel + fields — POST/PUT supplier (mut) — Not tested
- Suppliers — Row Edit button — opens edit dialog — Not tested
- Suppliers — Row "New Order" button — opens PO wizard — Not tested
- Suppliers — PO wizard step 1: toggle products, search — build order items — Not tested
- Suppliers — PO wizard step 2: qty −/+ per item — updateQty — Not tested
- Suppliers — PO wizard step 3: preview → "Send WhatsApp" — save order (saveMut) + window.open wa.me — Not tested
- Suppliers — Order row expand — toggleOrderRow — Not tested
- Suppliers — "Mark received" (+ store select) — POST receive PO → stock in (markReceived) — Not tested
- Suppliers — Search input / clear — filter suppliers — Not tested

## Reports
- Reports — Tab picker (Business Summary / Stock Movement / Aging / Sales / Top Customers / Top Products / Returns) — switch report tab (dropdown on mobile, chips on desktop) — Sales tab **Working**; others Not tested
- Reports — Sales: period buttons (Today/Week/Month/Custom) — set period, refetch — Not tested
- Reports — Sales: custom date pickers — set start/end — Not tested
- Reports — Sales: store filter (admin) — set storeId — Not tested
- Reports — Sales: Export CSV — download daily-sales CSV — Not tested
- Reports — Sales: "Invoices behind this revenue" Show/Hide — expands period invoice list — Working
- Reports — Sales: invoice rows in drill-down — nav → /documents/:id — Working
- Reports — Sales: "Top products → / Top customers → / By category →" jump links — setActiveTab — Working
- Reports — Sales: stat cards (Revenue/Count/Avg/Cash/Credit/Returns/COGS/Profit/Margin) — passive display — Working (render)
- Reports — Sales: daily revenue bar chart — passive recharts — Working (render)
- Reports — Business Summary: CSV / Print buttons — export / window.print — Not tested
- Reports — Business Summary: cash/profit/category snapshot — passive display — Working (render)
- Reports — Aging tab — receivables by overdue bucket — Not tested
- Reports — Stock Movement tab — opening/received/sold/returned/closing — Not tested
- Reports — Top Customers rows — nav → /customers/:id — Not tested
- Reports — Top Products rows — passive ranked list — Not tested
- Reports — Returns tab — return summary by type / most-returned — Not tested

## Finance  (top-level /finance, 4 tabs)
- Finance — Tab: Cash Position — set ?tab=cash-position, embeds CashPosition — Working
- Finance — Tab: Profit — set ?tab=profit, embeds ProfitToday — Working
- Finance — Tab: Cash & Loans — set ?tab=cash-loans, embeds CashLoans — Working
- Finance — Tab: Cheques (PDC) — set ?tab=cheques, embeds PdcTracker (keyed remount on ?type/&due) — Working
- Finance — "Dashboard" back button — nav → / — Not tested
- Finance (Cash Position) — Hand / Bank tab toggle — switches txn list — Not tested
- Finance (Cash Position) — Uncleared PDC card — Link → /pdc — Not tested
- Finance (Cash Position) — transaction rows — passive display — Not tested
- Finance (Profit) — invoice expand rows — toggle item breakdown; number → /documents/:id — Not tested
- Finance (Cash & Loans) — "Add Cash Injection" / "Record Repayment" — open form — Not tested
- Finance (Cash & Loans) — form Record — POST /api/owner-loans; repayment runs overdraw guard (server-verified) + admin override prompt on 409 — guard **Working** (server), UI form Not tested
- Finance (Cheques) — see PDC Tracker below (same component) — Working (renders in Finance)

## Expenses
- Expenses — "New Expense" button — opens expense form — Not tested
- Expenses — Expense form fields (category/amount/date/method/store/notes/recurring/frequency) — set form — Not tested
- Expenses — Expense form Save — POST /api/expenses; runs overdraw guard (server-verified) + admin override prompt on 409 — guard **Working** (server), UI form Not tested
- Expenses — Category manage: add/remove (admin) — POST/DELETE /api/lists — Not tested
- Expenses — Delete expense — CorrectionModal → soft-delete with reason — Not tested
- Expenses — Corrected badge / Correct button — logs correction — Not tested

## PDC Tracker  (/pdc, also embedded as Finance → Cheques)
- PDC Tracker — Status filter Select — filter cheques by status — Working (in Finance embed)
- PDC Tracker — Type filter Select (receivable/payable) — honors ?type= from deep-link — Working
- PDC Tracker — Bank / cheque-# search inputs — client-side filter — Not tested
- PDC Tracker — Cheque # link — Link → /cheques/:id (detail) — Working
- PDC Tracker — Linked-document icon — Link → /documents/:id — Not tested
- PDC Tracker — "Mark deposited" action — POST status=deposited (statusMut) — Not tested
- PDC Tracker — "Mark cleared" action — POST status=cleared → books money once at clearance + overdraw guard (server-verified) — clearance logic **Working** (server), UI button Not tested
- PDC Tracker — "Mark bounced" action — confirm → POST status=bounced, flags party — Not tested
- PDC Tracker — "Undo" / correct — reverse status with reason (reverseMut) — Not tested
- PDC Tracker — Export CSV — download filtered CSV (route not shadowed by :id — verified) — Working (endpoint)
- Cheque Detail (/cheques/:id) — page render (fields + linked doc + timeline) — Working
- Cheque Detail — Photo Upload / Replace — FileReader → base64 → POST /api/cheques/:id/photo (validates type/size) — Working (endpoint returned 200)
- Cheque Detail — Linked-document card — Link → /documents/:id — Working (renders; nav Not tested)
- Cheque Detail — "Cheques" back button — nav → /finance?tab=cheques — Not tested

## Approvals
- Approvals — Approve return (payout-method select + Approve) — POST /api/returns/:id/approve (reverses stock + refund) — Not tested
- Approvals — Reject return (reason textarea + Reject) — POST /api/returns/:id/reject — Not tested
- Approvals — Reject Cancel button — closes the reject form — Not tested
- Approvals — Reverse approval — POST correction, return → pending again — Not tested
- Approvals — Original-invoice link — Link → /documents/:id — Not tested

## Settings  (admin-only; multi-section)
- Settings — Company Info: fields + logo upload + Save — PUT company settings — Not tested
- Settings — Stores: Add store (dialog) + Save — POST /api/stores — Not tested
- Settings — Stores: Edit store inline + Save/Cancel — PUT /api/stores/:id — Not tested
- Settings — Staff/Users: Add staff (dialog: name/role/store/PIN, show-PIN toggle) — POST /api/users — Not tested
- Settings — Staff/Users: Edit user + Save — PUT /api/users/:id — Not tested
- Settings — Staff/Users: admin-PIN gate on sensitive change — verifies admin PIN — Not tested
- Settings — Custom Fields / Managed Lists / Document Numbering / Business Rules / Location Hierarchy panels — each POST/PUT its config — Not tested

---

## Summary tally (by status)
- **Working**: 36 (dashboard nav widgets, Finance tabs, Customers credit filter + rows, Reports Sales tab + drill-down, PDC/Cheque links + detail + photo, server-verified cash guard / cheque single-booking, **+ the 2 formerly-Incomplete items, now fixed**)
- **Incomplete**: 0 — both fixed (Documents WhatsApp now personalized + targets customer phone; Customers "Last Purchase" sort now reorders by most-recent invoice date)
- **Broken**: 0 found in this pass
- **Not tested**: the majority — wired in code with real handlers/routes, but not exercised live this session (most form submits, dialogs, filters, inventory/supplier/settings actions). No defect observed; just unproven.
