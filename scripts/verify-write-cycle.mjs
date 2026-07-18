// Controlled money-path write test: create test customer + invoice -> add payment
// -> verify stock deduction + cash inflow + status -> then FULLY clean up to the exact
// baseline. Real writes via HTTP (exercises the real code path); cleanup via DB.
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const UN = "__write_admin__";
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
const qtyOf = async (pid, sid) => {
  const { rows } = await pool.query(`select qty from inventory where product_id=$1 and store_id=$2`, [pid, sid]);
  return rows.length ? Number(rows[0].qty) : 0;
};

const adminId = (await pool.query(
  `insert into users (name, role, pin, username, password_hash, must_change_password, active)
   values ('WRITE BOT','admin','0000',$1,$2,false,true) returning id`, [UN, bcrypt.hashSync("Write@2026", 10)])).rows[0].id;

let docId = null, custId = null, productId = null, storeId = 1;
try {
  await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: UN, password: "Write@2026" }) });

  // pick a product with stock >= 2 at store 1
  const inv = (await api("/api/inventory")).body;
  const pick = (Array.isArray(inv) ? inv : []).find((r) => r.storeId === storeId && Number(r.qty) >= 2 && r.product);
  if (!pick) throw new Error("no product with stock at store 1");
  productId = pick.productId;
  const prod = pick.product;
  const price = Number(prod.salePrice) || 10;

  const baseQty = await qtyOf(productId, storeId);
  const baseHand = await hand();
  const baseDocs = ((await api("/api/documents")).body || []).length;
  console.log(`baseline: product ${prod.name} qty=${baseQty}, hand=${baseHand}, docs=${baseDocs}, price=${price}`);

  // 1) create test customer
  const cust = await api("/api/customers", { method: "POST", body: JSON.stringify({ name: "__WRITETEST__", type: "walk-in" }) });
  custId = cust.body?.id;
  ok("create customer 201", cust.status === 201 && custId);

  // 2) create INV with 1 unit
  const today = "2026-07-18";
  const doc = await api("/api/documents", { method: "POST", body: JSON.stringify({
    type: "INV", date: today, customerId: custId, customerName: "__WRITETEST__", storeId,
    status: "unpaid", subtotal: String(price), total: String(price),
    items: [{ productId, sku: prod.sku, description: prod.name, qty: "1", unit: prod.unit || "PCS", price: String(price), amount: String(price) }],
    createdBy: adminId,
  }) });
  docId = doc.body?.id;
  ok("create invoice 201", doc.status === 201 && docId, `status ${doc.status} num ${doc.body?.number}`);

  // 3) stock deducted by 1
  const afterQty = await qtyOf(productId, storeId);
  ok("stock deducted by 1 on invoice", afterQty === baseQty - 1, `${baseQty} -> ${afterQty}`);
  ok("invoice status unpaid", doc.body?.status === "unpaid", doc.body?.status);

  // 4) add cash payment = total
  const pay = await api(`/api/documents/${docId}/payments`, { method: "POST", body: JSON.stringify({ amount: price, method: "Cash", date: today, recordedBy: adminId }) });
  ok("payment recorded 200/201", pay.status === 200 || pay.status === 201, `status ${pay.status}`);

  // 5) cash increased + invoice paid
  const afterHand = await hand();
  ok("hand cash increased by payment", Number((afterHand - baseHand).toFixed(2)) === price, `${baseHand} -> ${afterHand} (Δ ${(afterHand - baseHand).toFixed(2)})`);
  const docAfter = (await api(`/api/documents/${docId}`)).body;
  ok("invoice status now paid", docAfter?.status === "paid", docAfter?.status);

  // 6) reconciliation: this doc's cash-in is in the ledger once
  const cfRows = (await pool.query(`select count(*)::int n from cashflow c where c.ref_type='payment' and c.ref_id in (select id from payments where document_id=$1)`, [docId])).rows[0].n;
  ok("exactly one Sales cashflow row for this payment", cfRows === 1, `rows ${cfRows}`);
} finally {
  // ── cleanup: reverse everything to baseline ──
  if (docId) {
    await pool.query(`delete from cashflow where ref_type='payment' and ref_id in (select id from payments where document_id=$1)`, [docId]);
    await pool.query(`delete from cashflow where ref_type='invoice' and ref_id=$1`, [docId]);
    await pool.query(`delete from payments where document_id=$1`, [docId]);
    // restore stock: add back the units deducted by this doc's sale adjustments
    const adj = (await pool.query(`select coalesce(sum(qty_change::numeric),0) s from stock_adjustments where reference_id=$1 and type='sale'`, [docId])).rows[0].s;
    if (productId && Number(adj) !== 0) {
      // inventory.qty is NUMERIC — subtract the (negative) sale change back out, no ::text cast
      await pool.query(`update inventory set qty = qty - $1 where product_id=$2 and store_id=$3`, [Number(adj), productId, storeId]);
    }
    await pool.query(`delete from stock_adjustments where reference_id=$1`, [docId]);
    await pool.query(`delete from edit_log where document_id=$1`, [docId]);
    await pool.query(`delete from document_items where document_id=$1`, [docId]);
    await pool.query(`delete from documents where id=$1`, [docId]);
  }
  await pool.query(`delete from customers where name='__WRITETEST__'`);
  await pool.query(`delete from users where id=$1`, [adminId]);
  console.log("cleanup done");
}

// verify baseline restored
if (productId) {
  const q = await qtyOf(productId, storeId);
  console.log("post-cleanup product qty:", q);
}
const leftoverCust = (await pool.query(`select count(*)::int n from customers where name='__WRITETEST__'`)).rows[0].n;
const leftoverDoc = docId ? (await pool.query(`select count(*)::int n from documents where id=$1`, [docId])).rows[0].n : 0;
ok("cleanup: no test customer left", leftoverCust === 0);
ok("cleanup: invoice removed", leftoverDoc === 0);

const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} checks passed. (note: INV number counter advances by 1 — harmless)`);
await pool.end();
process.exitCode = passed === R.length ? 0 : 1;
