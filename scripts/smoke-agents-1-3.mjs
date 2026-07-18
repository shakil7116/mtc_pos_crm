// End-to-end smoke test for Agents 1-3. Hits the live server on :5050.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const admin = { "Content-Type": "application/json", "x-user-role": "admin", "x-user-id": "1" };

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}: ${name}${extra ? " — " + extra : ""}`); };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const qty = async (pid, sid) => {
  const { rows } = await pool.query("SELECT qty FROM inventory WHERE product_id=$1 AND store_id=$2", [pid, sid]);
  return rows.length ? Number(rows[0].qty) : 0;
};

const products = await (await fetch(`${BASE}/api/products`)).json();
const stores = await (await fetch(`${BASE}/api/stores`)).json();
const customers = await (await fetch(`${BASE}/api/customers`)).json();
const suppliers = await (await fetch(`${BASE}/api/suppliers`)).json();
const prod = products[0], store = stores[0], cust = customers[0], sup = suppliers[0];
console.log(`Seed: product #${prod?.id} "${prod?.name}", store #${store?.id}, customer #${cust?.id}, supplier #${sup?.id}\n`);

// Ensure stock so sale doesn't fail: bump to 100 via direct upsert
await pool.query(
  `INSERT INTO inventory (product_id, store_id, qty) VALUES ($1,$2,'100')
   ON CONFLICT (product_id, store_id) DO UPDATE SET qty='100'`,
  [prod.id, store.id]
).catch(async () => {
  // no unique constraint? update or insert manually
  const { rows } = await pool.query("SELECT id FROM inventory WHERE product_id=$1 AND store_id=$2", [prod.id, store.id]);
  if (rows.length) await pool.query("UPDATE inventory SET qty='100' WHERE id=$1", [rows[0].id]);
  else await pool.query("INSERT INTO inventory (product_id, store_id, qty) VALUES ($1,$2,'100')", [prod.id, store.id]);
});

const price = 50;
const mkItem = (q) => ({ productId: prod.id, sku: prod.sku, description: prod.name, qty: q, unit: prod.unit || "pcs", price, discountAmount: "0", amount: String(price * q) });
const mkDoc = (q, payments, extra = {}) => ({
  type: "INV", date: new Date().toISOString().slice(0, 10),
  customerId: cust.id, customerName: cust.name, storeId: store.id,
  subtotal: String(price * q), total: String(price * q), taxRate: "0", taxAmount: "0",
  items: [mkItem(q)], payments, createdBy: 1, ...extra,
});

console.log("──────── AGENT 1: payment confirmation fields ────────");
// 1a. Card without phone → rejected
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: admin,
    body: JSON.stringify(mkDoc(1, [{ method: "Card", amount: 50, referenceNumber: "APP123" }])) });
  ok("Card without phone rejected", r.status >= 400, `status ${r.status}`);
}
// 1b. Online transfer without bank → rejected
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: admin,
    body: JSON.stringify(mkDoc(1, [{ method: "Online Transfer", amount: 50, referenceNumber: "TX9" }])) });
  ok("Online transfer without bank rejected", r.status >= 400, `status ${r.status}`);
}
// 1c. Valid split with all confirmation fields
let splitDocId;
{
  const q = 4; // total 200 = Cash 60 + Card 40 + Online 50 + PDC 50
  const body = mkDoc(q, [
    { method: "Cash", amount: 60 },
    { method: "Card", amount: 40, referenceNumber: "APP-778899", phone: "+97455512345" },
    { method: "Online Transfer", amount: 50, referenceNumber: "TXN-55231", bankName: "QNB", transferDate: "2026-07-02" },
    { method: "PDC", amount: 50, chequeNumber: "CHQ-6001", bankName: "Doha Bank", chequeDate: "2026-08-15" },
  ]);
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: admin, body: JSON.stringify(body) });
  const doc = await j(r);
  splitDocId = doc.id;
  ok("Split INV created", r.status < 400 && !!doc.id, `status ${r.status}`);
  // status: collected = 60+40+50 = 150 of 200 → partial
  ok("Split status = partial (PDC not collected)", doc.status === "partial", `got ${doc.status}`);
  const { rows } = await pool.query("SELECT method, reference, phone, bank_name FROM payments WHERE document_id=$1 ORDER BY id", [splitDocId]);
  const card = rows.find((x) => x.method === "Credit Card");
  const online = rows.find((x) => x.method === "Bank Transfer");
  const chq = rows.find((x) => x.method === "Cheque");
  ok("Card row has reference + phone", card && card.reference === "APP-778899" && card.phone === "+97455512345", JSON.stringify(card));
  ok("Online row has reference + bank", online && online.reference === "TXN-55231" && online.bank_name === "QNB", JSON.stringify(online));
  ok("PDC row has reference(cheque) + bank", chq && chq.reference === "CHQ-6001" && chq.bank_name === "Doha Bank", JSON.stringify(chq));
  const { rows: chqRows } = await pool.query("SELECT cheque_number, bank_name, status FROM cheques WHERE payment_id=$1", [chq?.id]);
  ok("PDC cheque tracked pending", chqRows[0]?.status === "pending" && chqRows[0]?.cheque_number === "CHQ-6001", JSON.stringify(chqRows[0]));
}

console.log("\n──────── AGENT 2: credit note approval flow ────────");
// Create a paid INV to return against
let invId, invNo;
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: admin,
    body: JSON.stringify(mkDoc(3, [{ method: "Cash", amount: 150 }])) });
  const doc = await j(r); invId = doc.id; invNo = doc.number;
  ok("Return-source INV created + paid", doc.status === "paid", `status ${doc.status}`);
}
const stockBeforeReturn = await qty(prod.id, store.id);
// Submit return (pending)
let retId;
{
  const r = await fetch(`${BASE}/api/returns`, { method: "POST", headers: admin, body: JSON.stringify({
    originalInvoiceId: invId, type: "full", reason: "Customer changed mind",
    refundMethod: "Cash", refundAmount: 150, storeId: store.id, createdBy: 1,
    items: [{ productId: prod.id, description: prod.name, qty: 3, price, amount: 150 }],
  }) });
  const data = await j(r); retId = data.returnVoucher?.id;
  ok("Return created", r.status < 400 && !!retId, `status ${r.status}`);
  ok("Return status = pending", data.returnVoucher?.status === "pending", `got ${data.returnVoucher?.status}`);
}
const stockAfterSubmit = await qty(prod.id, store.id);
ok("Stock NOT reversed while pending", stockAfterSubmit === stockBeforeReturn, `before ${stockBeforeReturn}, after ${stockAfterSubmit}`);
// Notification for admin exists
{
  const notes = await (await fetch(`${BASE}/api/notifications`, { headers: admin })).json();
  ok("Admin notified of pending return", Array.isArray(notes) && notes.some((n) => n.type === "return_approval" && n.entityId === retId), `count ${notes.length}`);
}
// Salesman cannot approve
{
  const r = await fetch(`${BASE}/api/returns/${retId}/approve`, { method: "POST", headers: { ...admin, "x-user-role": "salesman" } });
  ok("Salesman approve blocked (403)", r.status === 403, `status ${r.status}`);
}
// Admin approves → stock reversed + refund
{
  const r = await fetch(`${BASE}/api/returns/${retId}/approve`, { method: "POST", headers: admin });
  const data = await j(r);
  ok("Admin approve OK", r.status < 400 && data.status === "approved", `status ${r.status} ${data.status}`);
}
const stockAfterApprove = await qty(prod.id, store.id);
ok("Stock reversed on approval (+3)", stockAfterApprove === stockAfterSubmit + 3, `after ${stockAfterApprove} (was ${stockAfterSubmit})`);
{
  const { rows } = await pool.query("SELECT method, is_refund, amount FROM payments WHERE reference=(SELECT voucher_number FROM returns WHERE id=$1) AND is_refund=true", [retId]);
  ok("Refund payment recorded (Cash)", rows.length === 1 && rows[0].method === "Cash" && Number(rows[0].amount) === 150, JSON.stringify(rows[0]));
}
// Re-approve idempotent
{
  const r = await fetch(`${BASE}/api/returns/${retId}/approve`, { method: "POST", headers: admin });
  const stock2 = await qty(prod.id, store.id);
  ok("Re-approve idempotent (no double stock)", r.status < 400 && stock2 === stockAfterApprove, `stock ${stock2}`);
}
// Refund rule: >=4000 → PDC (Cheque), never card
{
  // New INV + return with refundMethod Card, amount 5000
  const big = mkDoc(100, [{ method: "Cash", amount: 5000 }]); // 100*50=5000
  const doc = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: admin, body: JSON.stringify(big) }));
  const rr = await j(await fetch(`${BASE}/api/returns`, { method: "POST", headers: admin, body: JSON.stringify({
    originalInvoiceId: doc.id, type: "full", reason: "bulk cancel", refundMethod: "Credit Card", refundAmount: 5000, storeId: store.id, createdBy: 1,
    items: [{ productId: prod.id, description: prod.name, qty: 100, price, amount: 5000 }],
  }) }));
  await fetch(`${BASE}/api/returns/${rr.returnVoucher.id}/approve`, { method: "POST", headers: admin });
  const { rows } = await pool.query("SELECT method FROM payments WHERE reference=(SELECT voucher_number FROM returns WHERE id=$1) AND is_refund=true", [rr.returnVoucher.id]);
  ok("Refund >=4000 forced to PDC/Cheque (never card)", rows[0]?.method === "Cheque", JSON.stringify(rows[0]));
}
// Reject path
{
  const doc = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: admin, body: JSON.stringify(mkDoc(2, [{ method: "Cash", amount: 100 }])) }));
  const stockBefore = await qty(prod.id, store.id);
  const rr = await j(await fetch(`${BASE}/api/returns`, { method: "POST", headers: admin, body: JSON.stringify({
    originalInvoiceId: doc.id, type: "full", reason: "test reject", refundMethod: "Cash", refundAmount: 100, storeId: store.id, createdBy: 1,
    items: [{ productId: prod.id, description: prod.name, qty: 2, price, amount: 100 }],
  }) }));
  const rej = await j(await fetch(`${BASE}/api/returns/${rr.returnVoucher.id}/reject`, { method: "POST", headers: admin, body: JSON.stringify({ reason: "Not eligible" }) }));
  const stockAfter = await qty(prod.id, store.id);
  ok("Reject sets status rejected", rej.status === "rejected", `got ${rej.status}`);
  ok("Reject leaves stock unchanged", stockAfter === stockBefore, `before ${stockBefore}, after ${stockAfter}`);
}

console.log("\n──────── AGENT 3: PO lifecycle + supplier returns ────────");
let poId;
{
  const r = await fetch(`${BASE}/api/supplier-orders`, { method: "POST", headers: admin, body: JSON.stringify({
    supplierId: sup.id, storeId: store.id, paymentTermsDays: 30,
    items: [{ productId: prod.id, name: prod.name, qty: 10, unit: prod.unit || "pcs" }],
  }) });
  const po = await j(r); poId = po.id;
  ok("PO created as draft", po.status === "draft", `got ${po.status}`);
}
{
  const po = await j(await fetch(`${BASE}/api/supplier-orders/${poId}/status`, { method: "POST", headers: admin, body: JSON.stringify({ status: "sent" }) }));
  ok("PO → sent", po.status === "sent", `got ${po.status}`);
}
const poStockBefore = await qty(prod.id, store.id);
{
  // partial receive 4 of 10
  const po = await j(await fetch(`${BASE}/api/supplier-orders/${poId}/receive-items`, { method: "POST", headers: admin, body: JSON.stringify({ storeId: store.id, receipts: [{ index: 0, qty: 4 }] }) }));
  const s = await qty(prod.id, store.id);
  ok("PO partial receive → status partial", po.status === "partial", `got ${po.status}`);
  ok("Partial receipt adds only received qty (+4)", s === poStockBefore + 4, `before ${poStockBefore}, after ${s}`);
}
{
  // over-receive guard: try to receive 100 of remaining 6 → only 6 added, status received
  const po = await j(await fetch(`${BASE}/api/supplier-orders/${poId}/receive-items`, { method: "POST", headers: admin, body: JSON.stringify({ storeId: store.id, receipts: [{ index: 0, qty: 100 }] }) }));
  const s = await qty(prod.id, store.id);
  ok("PO fully received (over-receive clamped)", po.status === "received", `got ${po.status}`);
  ok("Total received exactly ordered (+10 net)", s === poStockBefore + 10, `after ${s}, expected ${poStockBefore + 10}`);
  ok("Payment due date set on full receipt", !!po.paymentDueDate, `due ${po.paymentDueDate}`);
}
// Supplier return — initiated (deducts stock)
{
  const sBefore = await qty(prod.id, store.id);
  const sr = await j(await fetch(`${BASE}/api/supplier-returns`, { method: "POST", headers: admin, body: JSON.stringify({
    poId, supplierId: sup.id, storeId: store.id, returnType: "initiated", refundAmount: 100,
    items: [{ productId: prod.id, name: prod.name, qty: 2, amount: 100 }],
  }) }));
  const sAfter = await qty(prod.id, store.id);
  ok("Supplier return (initiated) created pending", sr.status === "pending_confirmation", `got ${sr.status}`);
  ok("Initiated return deducts stock (−2)", sAfter === sBefore - 2, `before ${sBefore}, after ${sAfter}`);
  // rejected_delivery does NOT deduct
  const sBefore2 = await qty(prod.id, store.id);
  await fetch(`${BASE}/api/supplier-returns`, { method: "POST", headers: admin, body: JSON.stringify({
    poId, supplierId: sup.id, storeId: store.id, returnType: "rejected_delivery", refundAmount: 50,
    items: [{ productId: prod.id, name: prod.name, qty: 1, amount: 50 }],
  }) });
  const sAfter2 = await qty(prod.id, store.id);
  ok("Rejected-delivery return does NOT deduct stock", sAfter2 === sBefore2, `before ${sBefore2}, after ${sAfter2}`);
  // status flow → refund_received → cashflow cash-in
  const confirmed = await j(await fetch(`${BASE}/api/supplier-returns/${sr.id}/status`, { method: "POST", headers: admin, body: JSON.stringify({ status: "confirmed" }) }));
  ok("Supplier return → confirmed", confirmed.status === "confirmed", `got ${confirmed.status}`);
  const refunded = await j(await fetch(`${BASE}/api/supplier-returns/${sr.id}/status`, { method: "POST", headers: admin, body: JSON.stringify({ status: "refund_received" }) }));
  ok("Supplier return → refund_received", refunded.status === "refund_received", `got ${refunded.status}`);
  const { rows } = await pool.query("SELECT direction, category, amount FROM cashflow WHERE ref_type='supplier_return' AND ref_id=$1", [sr.id]);
  ok("Refund logged as cash-in (Supplier Refund)", rows[0]?.direction === "in" && rows[0]?.category === "Supplier Refund" && Number(rows[0]?.amount) === 100, JSON.stringify(rows[0]));
}

console.log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`);
await pool.end();
process.exit(fail ? 1 : 0);
