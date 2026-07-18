// Controlled return->approve write test. Seeds invoice+payment, files a return,
// approves it (reverses stock + refund + generates a linked CN doc), verifies each
// effect, then FULLY cleans up to the exact baseline. All test rows carry the
// __RETURNTEST__ customer marker so cleanup is self-recovering.
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const UN = "__ret_admin__";
const MARK = "__RETURNTEST__";
const R = [];
const ok = (n, c, x = "") => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };

let cookie = "";
async function api(p, opts = {}) {
  const r = await fetch(BASE + p, { ...opts, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
  const sc = r.headers.get("set-cookie"); if (sc) { const m = sc.match(/mtc_token=[^;]+/); if (m) cookie = m[0]; }
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}
const hand = async () => Number((await api("/api/cashflow/position")).body.cashInHand);
const qtyOf = async (pid, sid) => Number(((await pool.query(`select qty from inventory where product_id=$1 and store_id=$2`, [pid, sid])).rows[0] || {}).qty || 0);

async function cleanup() {
  const docs = (await pool.query(`select id, type from documents where customer_name=$1`, [MARK])).rows;
  const invIds = docs.filter(d => d.type === "INV").map(d => d.id);
  const rets = invIds.length ? (await pool.query(`select id from returns where original_invoice_id = any($1::int[])`, [invIds])).rows.map(r => r.id) : [];

  // 1) RETURNS FIRST (they FK-reference the invoice document). Null the CN link,
  //    drop refund cashflow + items, then the return rows.
  for (const rid of rets) {
    await pool.query(`update returns set credit_note_id=null where id=$1`, [rid]);
    await pool.query(`delete from cashflow where ref_type='return' and ref_id=$1`, [rid]);
    await pool.query(`delete from return_items where return_id=$1`, [rid]);
    await pool.query(`delete from returns where id=$1`, [rid]);
  }
  // 2) DOCS (INV + CN). Restore net stock BEFORE deleting the adjustments, then remove.
  for (const d of docs) {
    const net = (await pool.query(`select product_id, coalesce(sum(qty_change::numeric),0) s from stock_adjustments where reference_id=$1 group by product_id`, [d.id])).rows;
    for (const a of net) if (a.product_id && Number(a.s) !== 0) {
      await pool.query(`update inventory set qty = qty - $1 where product_id=$2 and store_id=$3`, [Number(a.s), a.product_id, storeId]);
    }
    await pool.query(`delete from cashflow where ref_type='payment' and ref_id in (select id from payments where document_id=$1)`, [d.id]);
    await pool.query(`delete from cashflow where ref_type in ('invoice','document') and ref_id=$1`, [d.id]);
    await pool.query(`delete from payments where document_id=$1`, [d.id]);
    await pool.query(`delete from stock_adjustments where reference_id=$1`, [d.id]);
    await pool.query(`delete from edit_log where document_id=$1`, [d.id]);
    await pool.query(`delete from document_items where document_id=$1`, [d.id]);
    await pool.query(`delete from documents where id=$1`, [d.id]);
  }
  // 3) refund payment (no documentId — keyed to the marker customer) + the customer
  await pool.query(`delete from payments where customer_id in (select id from customers where name=$1)`, [MARK]);
  await pool.query(`delete from customers where name=$1`, [MARK]);
}

const adminId = (await pool.query(
  `insert into users (name, role, pin, username, password_hash, must_change_password, active)
   values ('RET BOT','admin','0000',$1,$2,false,true) returning id`, [UN, bcrypt.hashSync("Ret@2026", 10)])).rows[0].id;

let productId = null; const storeId = 1;
try {
  await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: UN, password: "Ret@2026" }) });
  const inv = (await api("/api/inventory")).body;
  const pick = (Array.isArray(inv) ? inv : []).find((r) => r.storeId === storeId && Number(r.qty) >= 2 && r.product);
  if (!pick) throw new Error("no product with stock");
  productId = pick.productId; const prod = pick.product; const price = Number(prod.salePrice) || 10;

  const baseQty = await qtyOf(productId, storeId);
  const baseHand = await hand();
  console.log(`baseline: ${prod.name} qty=${baseQty}, hand=${baseHand}, price=${price}`);

  const cust = await api("/api/customers", { method: "POST", body: JSON.stringify({ name: MARK, type: "walk-in" }) });
  const custId = cust.body?.id;

  const doc = await api("/api/documents", { method: "POST", body: JSON.stringify({
    type: "INV", date: "2026-07-18", customerId: custId, customerName: MARK, storeId, status: "unpaid",
    subtotal: String(price), total: String(price),
    items: [{ productId, sku: prod.sku, description: prod.name, qty: "1", unit: prod.unit || "PCS", price: String(price), amount: String(price) }],
    createdBy: adminId,
  }) });
  const docId = doc.body?.id;
  ok("invoice created", doc.status === 201 && docId, doc.body?.number);
  ok("stock deducted 94->93 by sale", (await qtyOf(productId, storeId)) === baseQty - 1, `qty ${await qtyOf(productId, storeId)}`);

  await api(`/api/documents/${docId}/payments`, { method: "POST", body: JSON.stringify({ amount: price, method: "Cash", date: "2026-07-18", recordedBy: adminId }) });
  ok("payment collected (cash +price)", Number(((await hand()) - baseHand).toFixed(2)) === price);

  // file a return (pending)
  const ret = await api("/api/returns", { method: "POST", body: JSON.stringify({
    originalInvoiceId: docId, originalInvoiceNumber: doc.body?.number, customerId: custId, customerName: MARK, storeId,
    type: "full", reason: "write-test return", refundMethod: "Cash", refundAmount: price,
    items: [{ productId, description: prod.name, qty: 1, unit: prod.unit || "PCS", price, amount: price }],
    submittedBy: adminId,
  }) });
  const rv = ret.body?.returnVoucher; // route wraps it: { returnVoucher, status }
  const retId = rv?.id;
  ok("return filed (pending)", ret.status === 201 && retId && rv?.status === "pending", `${rv?.voucherNumber} ${rv?.status}`);

  // approve
  const appr = await api(`/api/returns/${retId}/approve`, { method: "POST", body: JSON.stringify({}) });
  ok("return approved 200", appr.status === 200 && appr.body?.status === "approved", `status ${appr.status}/${appr.body?.status}`);

  // effects: stock restored, refund cashflow, CN doc generated
  ok("stock RESTORED to baseline after approve (sale -1 + return +1)", (await qtyOf(productId, storeId)) === baseQty, `qty ${await qtyOf(productId, storeId)}`);
  const refundCf = (await pool.query(`select count(*)::int n, coalesce(sum(amount::numeric),0) amt from cashflow where ref_type='return' and ref_id=$1 and category='Customer Refund'`, [retId])).rows[0];
  ok("refund booked (Customer Refund cashflow out)", refundCf.n === 1 && Number(refundCf.amt) === price, `rows ${refundCf.n} amt ${refundCf.amt}`);
  const cn = (await pool.query(`select id, number from documents where type='CN' and original_invoice_id=$1`, [docId])).rows[0];
  ok("linked Credit Note (CN) generated", !!cn, cn?.number);
  const linked = (await pool.query(`select credit_note_id from returns where id=$1`, [retId])).rows[0]?.credit_note_id;
  ok("return links to its CN", linked && cn && linked === cn.id);
  // net cash back to baseline (paid +price, refunded -price)
  ok("net cash back to baseline (paid then refunded)", Number((await hand()).toFixed(2)) === baseHand, `hand ${await hand()} vs ${baseHand}`);
} finally {
  await cleanup();
  await pool.query(`delete from users where id=$1`, [adminId]);
  console.log("cleanup done");
}

// verify baseline restored
const leftDocs = (await pool.query(`select count(*)::int n from documents where customer_name=$1`, [MARK])).rows[0].n;
const leftCust = (await pool.query(`select count(*)::int n from customers where name=$1`, [MARK])).rows[0].n;
const finalQty = productId ? await qtyOf(productId, storeId) : "?";
ok("cleanup: no test documents (INV/CN) left", leftDocs === 0);
ok("cleanup: no test customer left", leftCust === 0);
console.log("final product qty:", finalQty);

const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} checks passed. (RV + CN number counters advance — harmless)`);
await pool.end();
process.exitCode = passed === R.length ? 0 : 1;
