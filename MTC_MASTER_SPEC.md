# MTC POS & CRM — Master Specification & Claude Code Audit Instructions
**Company:** Mamun M Trading and Contracting WLL (Doha, Qatar)
**Business:** Building Materials Retail & Logistics
**Scale:** 2 Stores + 3 Warehouses
**System Type:** Web App + Mobile-responsive (works from anywhere with internet)

---

## INSTRUCTIONS FOR CLAUDE CODE

You are the lead engineer on this POS & CRM system. Your job is:

1. **Read this entire document first** before touching any code
2. **Audit the existing codebase** against every requirement listed here
3. **Create a BUGS.md file** listing every gap, missing feature, and bug found — sorted by severity (P0 → P3)
4. **Fix everything** systematically, module by module, starting from P0
5. **Use the existing skills** already available in this project (UI/UX, design, logic skills) for all visual and functional work
6. **Spawn sub-agents** as needed — assign one agent per module if beneficial. Agents must communicate findings to each other so nothing is duplicated or missed
7. **After each module fix** — run through the core flow of that module manually to verify no regressions
8. **The dashboard must be fully interactive** — not static numbers, real-time data, clickable, filterable

### Severity definitions:
- **P0** — Data integrity issue, crash, or money/inventory calculation error. Fix immediately.
- **P1** — Blocks daily business workflow. Fix before any P2.
- **P2** — Annoying but workable. Fix after P0+P1 are clear.
- **P3** — Cosmetic. Fix last, in bulk.

### Golden Rule:
The system supports the workflow — it never gates it. Manual entry by admin/manager must always be possible for anything that happened outside the system. Never build a flow that forces staff to go through the system in real time if the business context doesn't allow it.

---

## MODULE 1: INVENTORY

### Fields per product:
- Serial Number (auto or manual)
- Product Name / Description
- SKU / Code
- Category (dynamic — admin adds/edits/deletes from Settings)
- Product Unit (bag, pcs, metre, kg, roll, gallon, etc. — configurable)
- Quantity (per location)
- Cost Price (buy price — visible during invoicing to staff, never printed on customer documents)
- Sale Price (default selling price — editable per invoice line)
- Profit (auto-calculated: Sale Price - Cost Price)

### Location structure:
- Every product has stock tracked per location separately
- Locations: Store 1, Store 2, Warehouse 1, Warehouse 2, Warehouse 3
- Sub-locations inside each location are fully custom free-text (e.g. "Ground Floor → North Rack → Shelf 3") — not hardcoded
- Admin can add/edit/delete locations and sub-locations from Settings

### Categories:
Current known categories (all dynamic, not hardcoded):
Gypsum, Plumbing, Electrical, HVAC, Painting, Chemicals, Safety Equipment, Power Tools, Plywood/Wood + Other
Admin can add any new category at any time from Settings without touching code.

### Bulk operations:
- CSV import: bulk add or update products
- CSV export: full inventory list with all fields
- Bulk edit supported via CSV re-import

### Opening stock:
- Admin can set opening stock quantity per product per location with a specific date
- This is used for Go-Live reconciliation — not a recurring feature

### Stock movement:
- Every sale deducts from the correct location's stock automatically
- Every purchase receipt (against a PO) adds to the correct location's stock
- Every customer return adds stock back in
- Every supplier return deducts stock

### Reports needed from inventory:
- Stock movement report: filter by product + date range + location
- Shows: product name, total quantity sold/received/returned in that period, per-invoice breakdown
- Export to CSV
- Low stock alert: admin sets minimum quantity threshold per product — system flags when below threshold

---

## MODULE 2: CUSTOMERS

### Fields:
- Name, Contact Number, Email (optional)
- Customer Type: Cash Customer / Credit Account Customer
- Credit Limit (editable by admin only)
- Running Balance / Ledger (auto-updated on every invoice and payment)
- Notes field

### Bulk import:
- CSV import for adding customers in bulk

### Customer 360 view (clicking into a customer shows):
- All invoices (filterable by status, payment type, date)
- All quotations sent (with conversion status — converted to invoice or not, and why if not)
- Current credit balance, credit limit, credit remaining
- Full ledger: every transaction (invoice, payment, return, credit note)
- Overdue statement generator:
  - Filter unpaid invoices by aging bucket (30+ days, 60+ days, 90+ days, or all unpaid)
  - Generate printable/downloadable statement of account
  - Statement shows: invoice number, date, amount, days overdue, total outstanding

### Bad debt flagging:
- Any credit customer with unpaid invoices beyond their agreed credit term (30/60/90 days) gets automatically flagged as overdue
- After 90 days with no payment → system flags as high risk / bad debt
- Visible on admin dashboard and customer record

---

## MODULE 3: SUPPLIERS

### Fields:
- Name, Contact, Payment Terms (30/60/90 days default, editable per PO)
- Running Ledger: what you owe, by due date

### Purchase Order flow:
1. Select supplier → select products + quantities needed → generate PO document
2. PO sent to supplier (printable, downloadable)
3. When goods arrive → staff receives against PO → inventory updates per location
4. Payment terms recorded: full cash / full credit / partial cash + partial credit / PDC

### Supplier payment methods:
- Full cash, full credit, partial cash + partial credit
- PDC (post-dated cheque) to supplier — cheque number, date, bank, amount tracked
- Credit terms: 30 / 60 / 90 days
- Supplier ledger auto-updates on every PO receipt and payment

### Supplier returns:
- "Return Items" button on every PO
- Staff selects which items and how many to return
- Two types (staff selects at time of return):
  - **You initiate** — slow moving/unwanted stock being sent back
  - **Supplier rejected on delivery inspection** — goods sent back, never properly entered stock
- On confirmation:
  - Inventory deducted from correct location (only for "you initiate" type — rejected delivery never entered stock)
  - Supplier ledger adjusted (reduces what you owe, or logs supplier owes you)
- Refund status tracking: Pending Supplier Confirmation → Confirmed → Refund Received
- When refund received: logged as cash-in entry in cash flow under "Supplier Refund" category
- Linked to original PO for full traceability

---

## MODULE 4: DOCUMENTS

### 4A. INVOICE

**Line items table (per line):**
| # | Description | SKU | Qty | Unit | Cost Price* | Sale Price | Discount | Line Total |

*Cost Price: visible to staff on screen only. Never printed on customer-facing document.

- Sale Price defaults from inventory but is editable per line
- Discount: optional, can be amount (QAR) or percentage — staff enters at line level
- Staff sees cost price to make informed discount decisions

**Delivery method (on invoice):**
Three options — staff selects one:
- Pick up from Store
- Pick up from Warehouse
- Deliver to Site

If "Deliver to Site" selected:
- Delivery notification appears on driver/warehouse staff dashboard automatically
- Driver presses "Delivered" when done → system updates invoice status → delivery document generated
- Delivery is manual confirmation — no GPS tracking required now

**Payment methods — full split payment support:**
Any combination of:
- Cash
- Card
- Online Transfer
- PDC (post-dated cheque) — requires: cheque number, cheque date, bank name, amount
- Credit (30 / 60 / 90 days — select term)
- Partial combinations: cash + PDC, cash + credit, credit + PDC, cash + card + credit, etc.

**Credit limit check:**
- When credit or PDC portion is selected, system checks customer's remaining credit limit
- If amount exceeds limit → warning shown, admin override required to proceed

**Invoice statuses:**
Paid / Unpaid / Partially Paid / Returned / Void

**Void window (12-hour shift rule):**
- Any invoice can be fully cancelled or partially edited within 12 hours of creation — no approval needed
- Full cancel → full refund processed, inventory reverses automatically
- Partial edit → difference refunded, inventory adjusted
- After 12 hours → void option locked, must use Credit Note process instead

**Refund payment rules (within void window):**
- Originally paid cash → refund cash
- Originally paid online transfer → refund online transfer
- Originally paid by card → refund cash or online transfer (NEVER back to card — card settlement takes 3 days)
- PDC threshold: amounts QAR 4,000 and above → refund by PDC only
- Split payment → refund each portion back to its original method, except card (card portion → cash)

**Filters on invoice list:**
- Status: Paid / Unpaid / Partially Paid / Returned / Void
- Payment type: Cash / Credit / PDC / Card / Online Transfer / any partial combination
- Date range
- Customer
- Delivery method

### 4B. QUOTATION

- Same line item structure as invoice (with cost price visible to staff, discount field)
- Every quotation has a conversion status: Converted to Invoice / Not Converted
- If not converted: staff can add a reason note (price too high, customer chose competitor, etc.)
- Quotation linked to invoice if converted — visible on both records
- Quotation list filterable by: conversion status, customer, date range

### 4C. DELIVERY NOTE

- Not a manually created document
- Auto-generated from invoice when "Deliver to Site" is selected
- Contains same line items as the invoice
- Has a delivery status field: Pending → In Transit → Delivered
- Driver confirms delivery by pressing "Delivered" in the system from their phone
- Printable

### 4D. CREDIT NOTE / RETURN INVOICE

- Created when customer returns materials (after 12-hour void window)
- Links to original invoice (mandatory — staff searches and selects original invoice)
- Staff logs: which items returned, quantities, reason
- Requires approval before processing:
  - Staff submits return request
  - Admin/manager gets instant notification (push + WhatsApp if available)
  - Admin/manager taps Approve or Reject from phone
  - Only on approval does system process the return
- On approval:
  - Inventory reverses in automatically to correct location
  - Customer ledger updated:
    - Credit account customer → return amount deducted from what they owe
    - Cash customer → refund owed to them
- Refund method for cash customers:
  - Cash or online transfer (preferred)
  - PDC if amount above QAR 4,000
  - Never card refund
- Credit Note is a printable document sent to customer showing: items returned, amounts, settlement method
- Can happen weeks or months after original sale — no time restriction on credit notes (only void window is time-restricted)

### 4E. PURCHASE ORDER

- Select supplier → add line items (product, quantity, expected unit cost)
- Printable / downloadable document sent to supplier
- PO status: Draft → Sent → Partially Received → Fully Received
- When goods arrive: staff receives against PO → inventory updates
- "Return Items" button available on every PO (see Supplier Returns above)

---

## MODULE 5: EXPENSES

### Expense entry fields:
- Category (fully dynamic — admin adds/edits/deletes from Settings)
- Amount
- Date
- Payment method: Cash / Cheque / Bank Transfer
- Location (which store/warehouse this expense belongs to — optional)
- Notes / attachment
- Recurring flag: Yes/No — if Yes, set frequency (weekly/monthly) so system auto-reminds

### Default categories (all editable, deletable, new ones addable):
- Store 1 Rent
- Store 2 Rent
- Warehouse 1 Rent
- Warehouse 2 Rent
- Warehouse 3 Rent
- Staff Salaries
- Daily Staff Meals
- Medical / Insurance
- Software / Subscriptions
- Maintenance (links to warehouse issue if applicable)
- Other (free text)

### Maintenance expenses:
- When a warehouse maintenance issue is resolved, the payment to the maintenance worker is logged as an expense under "Maintenance" category
- Expense record links to the source warehouse issue for traceability
- External maintenance worker payment: cash (small amounts) or cheque (large amounts, typically above QAR 10,000) or bank transfer

---

## MODULE 6: WAREHOUSE MAINTENANCE

### Issue logging:
- Warehouse keeper or any staff logs an issue: description, urgency level, location
- Urgency: Critical / Normal / Low
- Admin or manager can also manually enter issues after the fact (if handled by phone call outside the system)

### Flow (non-urgent):
1. Staff logs issue → manager gets notification
2. Manager approves → arranges maintenance worker
3. Job done → logged as expense (Maintenance category)
4. Issue status updated: Open → Approved → In Progress → Resolved

### Flow (critical/urgent):
- Worker calls manager directly — no system involvement
- After the fact: admin or manager manually enters the issue + expense into system to keep records accurate
- Logged as "Manager Override — entered after resolution"

### Cheque payments above QAR 10,000 to maintenance workers must be issued by cheque, not cash.

---

## MODULE 7: PDC TRACKER

### Fields per PDC entry:
- Linked document (invoice number or PO number)
- Cheque number
- Cheque date (date to be deposited)
- Bank name
- Amount
- Type: Receivable (customer gave us PDC) / Payable (we gave supplier PDC)
- Status: Pending → Deposited → Cleared → Bounced

### Alerts:
- 3 days before cheque date → automatic alert to admin and manager
- Alert method: in-app notification + WhatsApp (when integrated)
- If cheque bounces → flag on customer/supplier record, alert to admin

---

## MODULE 8: DASHBOARDS

### 8A. Warehouse Caretaker Dashboard
- Incoming deliveries expected today (from invoices with "Deliver to Site" or POs being received)
- Low stock alerts for their warehouse (items below minimum threshold)
- Pending maintenance issues (Open + In Progress)
- Issue status tracker: Open / Approved / In Progress / Resolved
- Pending deliveries to confirm ("Delivered" button)

### 8B. Store Salesperson Dashboard
- Today's total sales (their store only)
- Best customer today and this week
- Best selling product today and this week
- Low stock alerts for their store
- Profit display (single box):
  - **Real Profit**: from paid/cash invoices only — money actually collected
  - **Imaginary Profit** (shown in brackets): Real Profit + uncollected credit invoice value — what you'd have if all credit customers paid
- Their own shift invoice list

### 8C. Admin / Owner / Manager Dashboard
- Company-wide sales today (all locations combined)
- Real Profit vs Imaginary Profit (company level, same single-box format)
- **Total credit exposure**: total uncollected amount across all credit customers
- **Bad debt alerts**: customers overdue beyond their agreed credit term — flagged red
- **PDC cheques due today** (both receivable and payable)
- Cash position across all locations
- **Pending approvals** (one section, all in one place):
  - Return/Credit Note requests awaiting approval
  - Invoice edit requests (after 12-hour window)
  - Maintenance issue approvals
  - Warehouse issue reports
- Outstanding supplier payments by due date
- Today's total expenses
- Recent returns (customer + supplier)
- Delivery status board: all active "Deliver to Site" invoices and their status

### Dashboard must be:
- Fully interactive — all numbers are clickable and drill down to the underlying records
- Real-time data — no static numbers
- Mobile responsive — works on phone browser for admin approving remotely
- Filterable by location (admin can toggle between all locations or specific store/warehouse)

---

## MODULE 9: REPORTS

### Time period filter:
- This month, last month, last 3 months, last 6 months, custom date range

### Business Summary Report:
- Total customers, how many are credit customers, total credit amount outstanding
- Total suppliers, total paid to suppliers, total still owed
- Total expenses (breakdown by category)
- Total sales, total returns
- Real Profit vs Imaginary Profit
- Cash collected vs credit outstanding

### Stock Movement Report:
- Filter by: product, category, date range, location
- Shows: opening stock, received, sold, returned, current stock
- Export to CSV
- Used for Go-Live inventory reconciliation and daily stock management

### Overdue / Aging Report:
- All credit customers with overdue invoices
- Grouped by aging bucket: 0-30 days / 31-60 days / 61-90 days / 90+ days
- Total exposure per bucket
- Exportable, printable

### PDC Report:
- All PDCs (receivable + payable) by status and date
- Upcoming PDCs in next 7 / 14 / 30 days

### All reports: exportable to CSV

---

## MODULE 10: USER ROLES & PERMISSIONS

### Roles:
| Role | Access |
|---|---|
| Admin/Owner | Full access to everything |
| Manager | Approvals, expenses, reports, all stores, manual entries, overrides |
| Warehouse Keeper | Warehouse dashboard, deliveries, stock their warehouse, issue logging |
| Salesman/Store Staff | Invoicing, quotations, their store only, no financial reports |
| Driver | Delivery dashboard only — sees assigned deliveries, confirms delivery done |

### Driver Dashboard:
- List of deliveries assigned to them today
- Per delivery: customer name, delivery address, items list, invoice reference, special instructions
- "Mark as Delivered" button — driver presses when job is done
- System updates invoice status + delivery note automatically on confirmation
- Driver works from phone browser — fully mobile responsive
- Driver has no access to pricing, financials, inventory, or any other module

### Each user:
- Unique login ID and password
- Session tied to their role — dashboard and menu adapts automatically on login
- All actions logged with user ID and timestamp (audit trail)

### Approval permission logic:
- Return requests: any manager or admin can approve from phone
- Invoice edits after 12-hour window: manager or admin only
- Maintenance approvals: manager or admin only
- Manual expense entries above a set threshold: admin only

---

## MODULE 11: SETTINGS (Fully Dynamic)

Everything in this module must be configurable by admin without touching code.
**Core principle: Zero hardcoded values anywhere in the system. If it's a list, a category, a field, or a module — it must be manageable from Settings.**

### 11A. General Configuration:
- Business info: company name, logo, address, contact — appears on all printed documents
- PDC threshold (currently QAR 4,000) — editable
- Void window hours (currently 12 hours) — editable
- Credit term options (currently 30/60/90 days) — add/edit/delete
- Low stock threshold per product — set minimum quantity
- WhatsApp API settings — configure when available
- Notification preferences — who gets notified for what event

### 11B. Lists & Categories (all add/edit/delete):
- Product categories
- Product units (bag, pcs, kg, m, roll, gallon, etc.)
- Expense categories
- Locations (stores + warehouses)
- Sub-locations within each location (free text)
- User roles and their permission sets

### 11C. Custom Fields per Module:
Every module in the system must support admin-added custom fields without code changes.
Admin goes into Settings → select module → add custom field:
- **Field name** (what it's called)
- **Field type**: Text / Number / Date / Dropdown / Checkbox / File upload
- **If Dropdown**: admin defines the dropdown options
- **Required or optional**
- **Visible to which roles**

Modules that support custom fields:
- Customers (e.g. add "Customer Type" dropdown: Contractor / Retailer / Individual / Blacklisted / VIP)
- Inventory / Products (e.g. add "Brand" field, "Origin Country" field)
- Invoices / Documents (e.g. add "Project Site" field, "Reference Number" field)
- Expenses (e.g. add "Approved By" field)
- Suppliers (e.g. add "Delivery Rating" field)
- Any future module

Custom fields appear on the relevant forms, in the list views (optional toggle), and in exports.

### 11D. Custom Module Builder:
Admin can create entirely new modules from Settings without any code change or database rebuild.

**How it works:**
1. Admin goes to Settings → Modules → "Add New Module"
2. Fills in:
   - **Module name** (e.g. "Marketing", "Asset Tracker", "Vehicle Log")
   - **Description** (what this module is for)
   - **Icon** (select from available icons)
   - **Fields**: admin adds as many fields as needed, each with name + type (same field types as 11C above)
   - **Categories**: admin defines category options for this module
   - **Who can access**: select roles that can see/use this module
3. Module appears automatically in the app navigation for the selected roles
4. Admin can edit, hide, or delete any custom module at any time
5. Data entered in custom modules is stored, searchable, and exportable to CSV

**Examples of custom modules admin might create later:**
- Marketing (campaigns, promotions, customer segments)
- Vehicle / Fleet tracker (for delivery trucks)
- Asset management (company equipment, tools, furniture)
- HR module (staff attendance, leave requests)
- Contracting projects (when that business unit launches)

**Architecture requirement:**
The database schema must be designed to support dynamic tables/fields from day one. Custom modules and custom fields must NOT require schema migrations or code deployments to add. This is the most critical architectural requirement in the entire system.

### 11E. User Management:
- Create, edit, deactivate users
- Assign roles
- Reset passwords
- View activity log per user (what they did, when, from which device)

---

## MODULE 12: DELIVERY SYSTEM

- Three options on every invoice: Pick up from Store / Pick up from Warehouse / Deliver to Site
- If Deliver to Site:
  - Delivery notification instantly visible on warehouse/driver dashboard
  - Driver sees: customer name, delivery address, items list, invoice reference
  - Driver presses "Delivered" on their phone when done
  - System updates invoice and delivery note status automatically
  - Delivery note auto-generated and available for download/print
- Delivery tracking is manual confirmation only (no GPS required at this stage)

---

## MODULE 13: NOTIFICATIONS

### Who gets notified for what:

| Event | Admin | Manager | Warehouse | Salesman | Driver |
|---|---|---|---|---|---|
| Return request submitted | ✅ | ✅ | ❌ | ❌ | ❌ |
| PDC due in 3 days | ✅ | ✅ | ❌ | ❌ | ❌ |
| Low stock alert | ✅ | ✅ | ✅ (their location) | ✅ (their store) | ❌ |
| Delivery assigned | ✅ | ✅ | ✅ | ❌ | ✅ |
| Delivery confirmed by driver | ✅ | ✅ | ❌ | ✅ (their invoice) | ❌ |
| Maintenance issue logged | ✅ | ✅ | ❌ | ❌ | ❌ |
| Customer overdue 30/60/90 days | ✅ | ✅ | ❌ | ❌ | ❌ |
| Invoice edit request | ✅ | ✅ | ❌ | ❌ | ❌ |
| Supplier refund received | ✅ | ✅ | ❌ | ❌ | ❌ |

- Notification methods: in-app (all), WhatsApp (admin + manager, when API integrated)
- All notifications have a status: Unread / Read / Acted On

---

## FUTURE MODULES (do not build now — architecture must support adding these later)

- Marketing module (customer promotions, campaigns)
- Contracting module (project-based billing for HVAC, plumbing, gypsum, electrical installation jobs)
- Analytics module (sales forecasting, supplier performance, dead stock analysis)
- Asset management
- Customer portal (customer self-service invoice view)
- WhatsApp Business API integration (start verification process now — 2-4 week approval time)
- Barcode/QR scanning for inventory
- Price tiers per customer type (retail / wholesale / contractor)
- VAT/tax handling
- Multi-currency support

---

## AUDIT CHECKLIST FOR CLAUDE CODE

Go through every module above. For each item, check:
- [ ] Does this feature exist in the current codebase?
- [ ] If yes — does it work correctly? Any bugs?
- [ ] If no — is it missing entirely or partially built?
- [ ] Does it match the specification exactly?

Log every finding in BUGS.md with:
- Module name
- Feature
- Status: Missing / Broken / Partial / Wrong behavior
- Severity: P0 / P1 / P2 / P3
- Notes on what needs to be done

Fix in order: P0 → P1 → P2 → P3
Fix by module: complete all fixes in one module before moving to next
After each module: run through the core user flow to verify

Use all available skills in the project for UI quality, design consistency, and business logic implementation.
