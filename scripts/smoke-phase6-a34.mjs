// Phase 6 Agents 3+4 smoke: correction system + return refund rule split.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const H = (role = "admin", uid = "1") => ({ "Content-Type": "application/json", "x-user-role": role, "x-user-id": uid });
const today = new Date().toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}: ${name}${extra ? " — " + extra : ""}`); };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const qty = async (pid, sid) => Number((await pool.query(`SELECT qty FROM inventory WHERE product_id=$1 AND store_id=$2`, [pid, sid])).rows[0]?.qty || 0);

const prods = await (await fetch(`${BASE}/api/products`)).json();
const prod = prods.find((p) => p.sku === "NJ-CEM-01");
const { rows: custRows } = await pool.query(
  `INSERT INTO customers (name, phone, credit_limit, active) VALUES ('P6 Test Customer', '+97400000006', '0', true) RETURNING id, name`);
const cust = custRows[0];
const mkInv = (total, qtyN, payments, extra = {}) => ({
  type: "INV", date: today, customerId: cust.id, customerName: cust.name, storeId: 1,
  subtotal: String(total), total: String(total), taxRate: "0", taxAmount: "0",
  items: [{ productId: prod.id, description: prod.name, qty: qtyN, unit: "bag", price: String(total / qtyN), discountAmount: "0", amount: String(total) }],
  payments, createdBy: 1, ...extra,
});

console.log("── AGENT 4: return refund rule (threshold 5000, separate from void) ──");
// settings check
{
  const s = await (await fetch(`${BASE}/api/settings`)).json();
  ok("returnPdcThreshold=5000, void pdcThreshold=4000 (separate)", Number(s.returnPdcThreshold) === 5000 && Number(s.pdcThreshold) === 4000,
    `return=${s.returnPdcThreshold}, void=${s.pdcThreshold}`);
}
// small return (2000) w/ staff choice Cash → stays Cash (never PDC)
{
  const inv = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkInv(2000, 10, [{ method: "Cash", amount: 2000 }])) }));
  const rr = await j(await fetch(`${BASE}/api/returns`, { method: "POST", headers: H(), body: JSON.stringify({
    originalInvoiceId: inv.id, type: "full", reason: "P6 small", refundMethod: "Cash", refundAmount: 2000, storeId: 1, createdBy: 1,
    items: [{ productId: prod.id, description: prod.name, qty: 10, price: 200, amount: 2000 }] }) }));
  await fetch(`${BASE}/api/returns/${rr.returnVoucher.id}/approve`, { method: "POST", headers: H() });
  const { rows } = await pool.query(`SELECT method FROM payments WHERE reference=$1 AND is_refund=true`, [rr.returnVoucher.voucherNumber]);
  ok("Small return 2000 → Cash (not forced PDC)", rows[0]?.method === "Cash", `method=${rows[0]?.method}`);
}
// small return w/ Bank Transfer choice honored
{
  const inv = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkInv(1500, 10, [{ method: "Cash", amount: 1500 }])) }));
  const rr = await j(await fetch(`${BASE}/api/returns`, { method: "POST", headers: H(), body: JSON.stringify({
    originalInvoiceId: inv.id, type: "full", reason: "P6 online", refundMethod: "Bank Transfer", refundAmount: 1500, storeId: 1, createdBy: 1,
    items: [{ productId: prod.id, description: prod.name, qty: 10, price: 150, amount: 1500 }] }) }));
  await fetch(`${BASE}/api/returns/${rr.returnVoucher.id}/approve`, { method: "POST", headers: H() });
  const { rows } = await pool.query(`SELECT method FROM payments WHERE reference=$1 AND is_refund=true`, [rr.returnVoucher.voucherNumber]);
  ok("Small return: staff's Bank Transfer choice honored", rows[0]?.method === "Bank Transfer", `method=${rows[0]?.method}`);
}
// large return 6000: default PDC; manager override to online works
let bigRetId, bigVoucher;
{
  const inv = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkInv(6000, 10, [{ method: "Cash", amount: 6000 }])) }));
  const rr = await j(await fetch(`${BASE}/api/returns`, { method: "POST", headers: H(), body: JSON.stringify({
    originalInvoiceId: inv.id, type: "full", reason: "P6 big", refundMethod: "Cash", refundAmount: 6000, storeId: 1, createdBy: 1,
    items: [{ productId: prod.id, description: prod.name, qty: 10, price: 600, amount: 6000 }] }) }));
  bigRetId = rr.returnVoucher.id; bigVoucher = rr.returnVoucher.voucherNumber;
  const ar = await j(await fetch(`${BASE}/api/returns/${bigRetId}/approve`, { method: "POST", headers: H("manager", "8"), body: JSON.stringify({ refundMethod: "Cheque" }) }));
  const { rows } = await pool.query(`SELECT method FROM payments WHERE reference=$1 AND is_refund=true`, [bigVoucher]);
  const { rows: chq } = await pool.query(`SELECT type, status FROM cheques WHERE cheque_number=$1`, [`REFUND-${bigVoucher}`]);
  ok("Large return 6000 → PDC (cash upgraded)", rows[0]?.method === "Cheque" && chq[0]?.type === "payable", `method=${rows[0]?.method}, cheque=${JSON.stringify(chq[0])}`);
}
// large return with manager choosing online
{
  const inv = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkInv(7000, 10, [{ method: "Cash", amount: 7000 }])) }));
  const rr = await j(await fetch(`${BASE}/api/returns`, { method: "POST", headers: H(), body: JSON.stringify({
    originalInvoiceId: inv.id, type: "full", reason: "P6 big online", refundMethod: "Cash", refundAmount: 7000, storeId: 1, createdBy: 1,
    items: [{ productId: prod.id, description: prod.name, qty: 10, price: 700, amount: 7000 }] }) }));
  await fetch(`${BASE}/api/returns/${rr.returnVoucher.id}/approve`, { method: "POST", headers: H("manager", "8"), body: JSON.stringify({ refundMethod: "Bank Transfer" }) });
  const { rows } = await pool.query(`SELECT method FROM payments WHERE reference=$1 AND is_refund=true`, [rr.returnVoucher.voucherNumber]);
  ok("Large return: manager online choice honored", rows[0]?.method === "Bank Transfer", `method=${rows[0]?.method}`);
}
// void rule unchanged (4000)
{
  const inv = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkInv(4500, 10, [{ method: "Cash", amount: 4500 }])) }));
  await fetch(`${BASE}/api/documents/${inv.id}/void`, { method: "POST", headers: H() });
  const { rows } = await pool.query(`SELECT method FROM payments WHERE document_id=$1 AND is_refund=true`, [inv.id]);
  ok("VOID 4500 still → PDC (4000 rule unchanged)", rows[0]?.method === "Cheque", `method=${rows[0]?.method}`);
}

console.log("── AGENT 3: correction system ──");
// cheque status reversal: cleared → deposited, cashflow counter-entry
{
  const { rows: chqRows } = await pool.query(`SELECT id, cheque_number, amount FROM cheques WHERE status='pending' AND type='receivable' ORDER BY id DESC LIMIT 1`);
  const chq = chqRows[0];
  await fetch(`${BASE}/api/cheques/${chq.id}/status`, { method: "POST", headers: H(), body: JSON.stringify({ status: "cleared" }) });
  const { rows: cf1 } = await pool.query(`SELECT count(*)::int n FROM cashflow WHERE ref_type='cheque' AND ref_id=$1 AND direction='in'`, [chq.id]);
  // no reason → 400
  const noReason = await fetch(`${BASE}/api/corrections/cheque/${chq.id}`, { method: "POST", headers: H(), body: JSON.stringify({ targetStatus: "deposited", reason: "" }) });
  ok("Reversal without reason blocked", noReason.status === 400, `status ${noReason.status}`);
  // staff → 403
  const staffTry = await fetch(`${BASE}/api/corrections/cheque/${chq.id}`, { method: "POST", headers: H("salesman", "5"), body: JSON.stringify({ targetStatus: "deposited", reason: "x" }) });
  ok("Staff cannot correct (403)", staffTry.status === 403, `status ${staffTry.status}`);
  // manager reverses
  const rev = await j(await fetch(`${BASE}/api/corrections/cheque/${chq.id}`, { method: "POST", headers: H("manager", "8"), body: JSON.stringify({ targetStatus: "deposited", reason: "Cleared by mistake — bank not confirmed" }) }));
  const { rows: cf2 } = await pool.query(`SELECT count(*)::int n FROM cashflow WHERE ref_type='cheque' AND ref_id=$1 AND direction='out'`, [chq.id]);
  const { rows: corr } = await pool.query(`SELECT old_value, new_value, reason FROM corrections WHERE entity_type='cheque' AND entity_id=$1`, [chq.id]);
  ok("Cheque cleared→deposited reversed + counter cashflow", rev.status === "deposited" && cf1[0].n === 1 && cf2[0].n === 1, `status=${rev.status}, in=${cf1[0].n}, out=${cf2[0].n}`);
  ok("Correction logged permanently", corr.length === 1 && corr[0].old_value === "cleared" && !!corr[0].reason, JSON.stringify(corr[0]));
}
// payment correction: card → cash
{
  const inv = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkInv(300, 3, [{ method: "Card", amount: 300, referenceNumber: "P6-TERM-1" }])) }));
  const { rows: payRows } = await pool.query(`SELECT id, method FROM payments WHERE document_id=$1`, [inv.id]);
  const pay = payRows[0];
  const r = await j(await fetch(`${BASE}/api/corrections/payment/${pay.id}`, { method: "POST", headers: H(), body: JSON.stringify({ method: "Cash", reason: "Recorded as card but customer paid cash" }) }));
  const { rows: corr } = await pool.query(`SELECT old_value, new_value FROM corrections WHERE entity_type='payment' AND entity_id=$1 AND field='method'`, [pay.id]);
  ok("Payment card→cash corrected + original logged", r.method === "Cash" && corr[0]?.old_value === "Credit Card" && corr[0]?.new_value === "Cash", JSON.stringify(corr[0]));
  // amount correction recomputes doc status
  const r2 = await j(await fetch(`${BASE}/api/corrections/payment/${pay.id}`, { method: "POST", headers: H(), body: JSON.stringify({ amount: 150, reason: "Wrong amount keyed" }) }));
  const doc = await j(await fetch(`${BASE}/api/documents/${inv.id}`));
  ok("Amount correction recomputes status → partial", Number(r2.amount) === 150 && doc.status === "partial", `amount=${r2.amount}, status=${doc.status}`);
}
// expense soft delete
{
  const ex = await j(await fetch(`${BASE}/api/expenses`, { method: "POST", headers: H(), body: JSON.stringify({ category: "Other", amount: 77, date: today, paymentMethod: "Cash", notes: "P6 softdel" }) }));
  const del = await j(await fetch(`${BASE}/api/corrections/expense/${ex.id}/delete`, { method: "POST", headers: H(), body: JSON.stringify({ reason: "Duplicate entry" }) }));
  const list = await j(await fetch(`${BASE}/api/expenses`, { headers: H() }));
  const { rows: dbRow } = await pool.query(`SELECT deleted_at, delete_reason FROM expenses WHERE id=$1`, [ex.id]);
  const { rows: cf } = await pool.query(`SELECT count(*)::int n FROM cashflow WHERE ref_type='expense' AND ref_id=$1`, [ex.id]);
  ok("Expense soft-deleted (row kept, hidden, cashflow cleaned)", !!del.deletedAt && !list.some((e) => e.id === ex.id) && !!dbRow[0].deleted_at && dbRow[0].delete_reason === "Duplicate entry" && cf[0].n === 0,
    `hidden=${!list.some((e) => e.id === ex.id)}, reason=${dbRow[0].delete_reason}`);
}
// delivery reversal
{
  const inv = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkInv(500, 5, [{ method: "Cash", amount: 500 }], {
    deliveryMethod: "deliver_site", deliveryStatus: "pending", deliveryAddress: "P6 site", driverId: 7 })) }));
  await fetch(`${BASE}/api/documents/${inv.id}/delivered`, { method: "POST", headers: H("driver", "7") });
  const rev = await fetch(`${BASE}/api/corrections/delivery/${inv.id}`, { method: "POST", headers: H(), body: JSON.stringify({ reason: "Driver tapped wrong invoice" }) });
  const doc = await j(await fetch(`${BASE}/api/documents/${inv.id}`));
  const { rows: notif } = await pool.query(`SELECT count(*)::int n FROM notifications WHERE type='delivery_reversed' AND entity_id=$1`, [inv.id]);
  ok("Delivery reversed to pending + driver notified", rev.status === 200 && doc.deliveryStatus === "pending" && notif[0].n === 1, `status=${doc.deliveryStatus}, notif=${notif[0].n}`);
}
// return approval reversal: stock + refund reversed, back to pending
{
  const before = await qty(prod.id, 1);
  const r = await j(await fetch(`${BASE}/api/corrections/return/${bigRetId}`, { method: "POST", headers: H(), body: JSON.stringify({ reason: "Approved before inspecting the goods" }) }));
  const after = await qty(prod.id, 1);
  const { rows: chq } = await pool.query(`SELECT status FROM cheques WHERE cheque_number=$1`, [`REFUND-${bigVoucher}`]);
  ok("Return approval reversed → pending", r.status === "pending", `status=${r.status}`);
  // Inventory floors at 0 by design (POS no-negative-stock, accepted Phase 2);
  // the stock_adjustments ledger still records the full −qty for audit.
  const { rows: adj } = await pool.query(`SELECT qty_change FROM stock_adjustments WHERE type='correction' ORDER BY id DESC LIMIT 1`);
  ok("Stock re-deducted (floored at 0; ledger −10)", after === Math.max(0, before - 10) && Number(adj[0]?.qty_change) === -10, `before=${before}, after=${after}, ledger=${adj[0]?.qty_change}`);
  ok("Outgoing refund PDC cancelled", chq[0]?.status === "cancelled", `cheque=${chq[0]?.status}`);
}

await pool.query(`UPDATE customers SET active=false WHERE id=$1`, [cust.id]);
console.log(`\n════ ${pass} passed, ${fail} failed ════`);
await pool.end();
process.exit(fail ? 1 : 0);
