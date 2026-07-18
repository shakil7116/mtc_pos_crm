# NEW_FEATURES.md — Proposed features for MTC POS & CRM

Compared MTC against Odoo 17, SAP Business One, Zoho Books/Inventory, Lightspeed
Retail+Wholesale, and Unleashed. Below are features those systems have that would
solve a **real daily problem** for a retail + wholesale building-materials store in
Doha. Each is scored for a building trade — not a supermarket.

**Nothing here is built yet. Awaiting Shakil's approval on the HIGH-priority items.**

Legend — Priority: 🔴 High / 🟡 Medium / ⚪ Low · Effort: S / M / L

---

## 🔴 HIGH — ✅ ALL FOUR BUILT & VERIFIED (Phase 10 / 10.1)

Status: **#1 Quick Sale ✅ · #2 Suggested PO ✅ · #3 Statement ✅ · #4 Price tiers ✅** —
all live, tsc-clean, verified against the server. See EXAMINER_LOG.md.

### 1. Quick Sale Mode (retail walk-in) — Effort S — ✅ BUILT
**Problem:** A walk-in buying 2 bags of cement shouldn't need the full invoice form.
Counter queues build up.
**How:** One screen — search/scan product, qty, Cash, Done. No customer account. Prints
a short receipt, deducts stock, books cash. Under 30 seconds.
**Why MTC:** You are retail *and* wholesale — the retail half needs speed the B2B form
doesn't give.

### 2. Reorder Alerts → 1-click Suggested PO — Effort M — ✅ BUILT
**Problem:** Low-stock alerts exist, but re-ordering is still manual and easy to forget.
**How:** When stock hits its minimum, the system drafts a PO to that product's usual
supplier, with a suggested quantity from recent sales velocity. One click to send.
**Why MTC:** Cement/pipe/cable stockouts lose whole contractor orders. This closes the
loop the low-stock alert already opens.

### 3. Customer Statement → PDF / WhatsApp — Effort M — ✅ BUILT
**Problem:** Chasing 30/60/90-day credit is your biggest cash risk; statements are made
by hand today.
**How:** One button on a customer → a dated statement of all unpaid invoices with due
dates and a total, as a PDF and a pre-filled WhatsApp message.
**Why MTC:** Credit is a large share of revenue here; faster, professional statements
get you paid sooner.

### 4. Retail vs Wholesale price per product — Effort M — ✅ BUILT
**Problem:** A contractor and a walk-in should not pay the same price, but staff key it
manually and make mistakes.
**How:** Two price tiers per product (retail / wholesale). The customer's type picks the
tier automatically on the invoice; staff can still override with a discount.
**Why MTC:** This is the core of a dual retail+wholesale business — it removes the single
most common pricing error.

---

## 🟡 MEDIUM — strong value, build after the High set

### 5. Daily Cash Reconciliation (end of day) — Effort M
At 10 PM close, the salesman counts the drawer and enters the amount; the system compares
it to expected cash (cash sales − cash refunds) and shows any discrepancy for the manager
to sign off. Creates an end-of-day report. **Why:** catches till shortfalls the same day.

### 6. Supplier Price History — Effort S
Track what you paid each supplier for each product over time, so you see creeping prices
and negotiate. **Why:** materials prices move; memory doesn't scale.

### 7. Product Bundles / Kits — Effort M
Define a "Bathroom Set" = toilet + basin + pipes + fittings at one price; the invoice
shows the bundle but stock deducts each component. **Why:** common in the trade, speeds
repeat orders.

---

## ⚪ LOW — nice to have, not now

- **Barcode/QR label printing** for bins and fast scan-to-sell.
- **Delivery route sheet** grouping a driver's authorized DNs by area for the day.
- **Customer portal** (view statements/quotes online) — large, low near-term payoff.

---

## Recommendation
Build in this order: **#4 price tiers** and **#3 statements** (highest cash impact),
then **#1 Quick Sale** and **#2 suggested PO** (daily time savers). #5–#7 next.

👉 **Shakil — which of the four HIGH-priority features should I build?** I will only start
once you approve. (Reply with the numbers, or "all four".)
