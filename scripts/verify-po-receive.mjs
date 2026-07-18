// Controlled PO -> receive write test: draft a purchase order, receive it (stock in),
// verify stock increased + status, then clean up to baseline. Marker notes __POTEST__.
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const UN = "__po_admin__";
const MARK = "__POTEST__";
const R = [];
const ok = (n, c, x = "") => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };

let cookie = "";
async function api(p, opts = {}) {
  const r = await fetch(BASE + p, { ...opts, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
  const sc = r.headers.get("set-cookie"); if (sc) { const m = sc.match(/mtc_token=[^;]+/); if (m) cookie = m[0]; }
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}
const qtyOf = async (pid, sid) => Number(((await pool.query(`select qty from inventory where product_id=$1 and store_id=$2`, [pid, sid])).rows[0] || {}).qty || 0);

async function cleanup(storeId) {
  const orders = (await pool.query(`select id from supplier_orders where notes=$1`, [MARK])).rows;
  for (const o of orders) {
    // reverse the net stock this PO's receipts added, then drop the adjustment rows + the PO
    const net = (await pool.query(`select product_id, coalesce(sum(qty_change::numeric),0) s from stock_adjustments where reference_id=$1 and type='purchase' group by product_id`, [o.id])).rows;
    for (const a of net) if (a.product_id && Number(a.s) !== 0) {
      await pool.query(`update inventory set qty = qty - $1 where product_id=$2 and store_id=$3`, [Number(a.s), a.product_id, storeId]);
    }
    await pool.query(`delete from stock_adjustments where reference_id=$1 and type='purchase'`, [o.id]);
    await pool.query(`delete from supplier_orders where id=$1`, [o.id]);
  }
}

const adminId = (await pool.query(
  `insert into users (name, role, pin, username, password_hash, must_change_password, active)
   values ('PO BOT','admin','0000',$1,$2,false,true) returning id`, [UN, bcrypt.hashSync("Po@2026", 10)])).rows[0].id;

const storeId = 1; let productId = null;
try {
  await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: UN, password: "Po@2026" }) });
  const inv = (await api("/api/inventory")).body;
  const pick = (Array.isArray(inv) ? inv : []).find((r) => r.storeId === storeId && r.product);
  if (!pick) throw new Error("no product at store 1");
  productId = pick.productId; const prod = pick.product;
  const suppliers = (await api("/api/suppliers")).body;
  const supplierId = (Array.isArray(suppliers) ? suppliers : [])[0]?.id;
  if (!supplierId) throw new Error("no supplier");

  const baseQty = await qtyOf(productId, storeId);
  console.log(`baseline: ${prod.name} qty=${baseQty}, supplier=${supplierId}`);
  const RECV = 5;

  // 1) draft PO
  const po = await api("/api/supplier-orders", { method: "POST", body: JSON.stringify({
    supplierId, storeId, notes: MARK,
    items: [{ productId, name: prod.name, qty: RECV, unit: prod.unit || "PCS" }],
  }) });
  const poId = po.body?.id;
  ok("PO drafted (201, status draft)", po.status === 201 && poId && po.body?.status === "draft", `${po.body?.poNumber} ${po.body?.status}`);

  // 2) receive PO -> stock in
  const rec = await api(`/api/supplier-orders/${poId}/receive`, { method: "POST", body: JSON.stringify({ storeId }) });
  ok("PO received (200, status received)", rec.status === 200 && rec.body?.status === "received", `status ${rec.status}/${rec.body?.status}`);

  // 3) stock increased by RECV
  const afterQty = await qtyOf(productId, storeId);
  ok(`stock increased by ${RECV} on receipt`, afterQty === baseQty + RECV, `${baseQty} -> ${afterQty}`);

  // 4) a purchase stock-adjustment logged for this PO
  const adj = (await pool.query(`select count(*)::int n, coalesce(sum(qty_change::numeric),0) s from stock_adjustments where reference_id=$1 and type='purchase'`, [poId])).rows[0];
  ok("purchase stock-adjustment logged", adj.n === 1 && Number(adj.s) === RECV, `rows ${adj.n} sum ${adj.s}`);
} finally {
  await cleanup(storeId);
  await pool.query(`delete from users where id=$1`, [adminId]);
  console.log("cleanup done");
}

const finalQty = productId ? await qtyOf(productId, storeId) : "?";
const leftPo = (await pool.query(`select count(*)::int n from supplier_orders where notes=$1`, [MARK])).rows[0].n;
ok("cleanup: no test PO left", leftPo === 0);
console.log("final product qty:", finalQty);

const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} checks passed. (PO number counter advances — harmless)`);
await pool.end();
process.exitCode = passed === R.length ? 0 : 1;
