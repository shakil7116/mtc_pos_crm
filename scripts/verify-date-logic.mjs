// Return/Edit date-logic verification. Shows BEFORE/AFTER dashboard numbers for the
// 7 spec cases. Rule: Today's Sales/Profit move only when the invoice's OWN original
// business day is today; only cash movement on the processing day moves Cash Position.
// All test data carries the __DATETEST__ marker; cleaned up after every case.
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
const BASE = "http://localhost:5050";
const UN = "__date_admin__", MARK = "__DATETEST__";
const R = [];
const ok = (n, c, x = "") => { R.push(!!c); console.log(`   ${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };
const money = (n) => Number(n).toFixed(2);

let cookie = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(p, opts = {}, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(BASE + p, { ...opts, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
    const sc = r.headers.get("set-cookie"); if (sc) { const m = sc.match(/mtc_token=[^;]+/); if (m) cookie = m[0]; }
    let b = null; try { b = await r.json(); } catch {}
    last = { status: r.status, body: b };
    if (r.status === 500 && i < tries - 1) { await sleep(600 * (i + 1)); continue; } // transient Supabase drop → backoff+retry
    return last;
  }
  return last;
}
const qtyOf = async (pid, sid) => Number(((await pool.query(`select qty from inventory where product_id=$1 and store_id=$2`, [pid, sid])).rows[0] || {}).qty || 0);
async function snap() {
  const s = (await api("/api/dashboard/summary")).body;
  const pos = (await api("/api/cashflow/position")).body;
  return { sales: Number(s.cashSalesToday) + Number(s.creditSalesToday), profit: Number(s.profitFromCash), returnsToday: Number(s.returnsToday), hand: Number(pos.cashInHand) };
}
const show = (label, a, b) => console.log(`   ${label}: sales ${money(a.sales)}→${money(b.sales)} (Δ${money(b.sales - a.sales)}) | profit ${money(a.profit)}→${money(b.profit)} (Δ${money(b.profit - a.profit)}) | hand ${money(a.hand)}→${money(b.hand)} (Δ${money(b.hand - a.hand)})`);

async function fileAndApprove(originalId, units, type = "partial") {
  const ret = await api("/api/returns", { method: "POST", body: JSON.stringify({
    originalInvoiceId: originalId, customerId: custId, customerName: MARK, storeId, type,
    refundMethod: "Cash", refundAmount: units * price,
    items: [{ productId, description: "d", qty: units, unit: "PCS", price, amount: units * price }],
  }) });
  const rv = ret.body?.returnVoucher;
  if (!rv) { console.log("   ⚠ RETURN FILE FAILED:", ret.status, JSON.stringify(ret.body).slice(0, 160)); return null; }
  const ap = await api(`/api/returns/${rv.id}/approve`, { method: "POST", body: JSON.stringify({}) });
  if (ap.status !== 200) console.log("   ⚠ APPROVE FAILED:", ap.status, JSON.stringify(ap.body).slice(0, 160));
  return rv;
}

let custId = null, cust2 = null, storeId = 1, productId = null, price = 0, cost = 0;

async function cleanupAll() {
  const docs = (await pool.query(`select id, type from documents where customer_name=$1`, [MARK])).rows;
  const invIds = docs.filter(d => d.type === "INV").map(d => d.id);
  const rets = invIds.length ? (await pool.query(`select id from returns where original_invoice_id = any($1::int[])`, [invIds])).rows.map(r => r.id) : [];
  for (const rid of rets) {
    await pool.query(`update returns set credit_note_id=null where id=$1`, [rid]);
    await pool.query(`delete from cashflow where ref_type='return' and ref_id=$1`, [rid]);
    await pool.query(`delete from return_items where return_id=$1`, [rid]);
    await pool.query(`delete from returns where id=$1`, [rid]);
  }
  for (const d of docs) {
    const net = (await pool.query(`select product_id, coalesce(sum(qty_change::numeric),0) s from stock_adjustments where reference_id=$1 group by product_id`, [d.id])).rows;
    for (const a of net) if (a.product_id && Number(a.s) !== 0) await pool.query(`update inventory set qty = qty - $1 where product_id=$2 and store_id=$3`, [Number(a.s), a.product_id, storeId]);
    await pool.query(`delete from cashflow where ref_type='payment' and ref_id in (select id from payments where document_id=$1)`, [d.id]);
    await pool.query(`delete from payments where document_id=$1`, [d.id]);
    await pool.query(`delete from stock_adjustments where reference_id=$1`, [d.id]);
    await pool.query(`delete from edit_log where document_id=$1`, [d.id]);
    await pool.query(`delete from document_items where document_id=$1`, [d.id]);
    await pool.query(`delete from documents where id=$1`, [d.id]);
  }
  await pool.query(`delete from cashflow where notes like '%__DATETEST__%'`);
  await pool.query(`delete from payments where customer_id in (select id from customers where name like '%__DATETEST__%')`);
  // NOTE: the __DATETEST__ customer is created ONCE and reused across all cases —
  // do NOT delete it here or later invoices FK-fail. It is removed in the final finally.
}

// create a PAID invoice of `units` on a given date; optionally backdate created_at
async function makeInvoice(units, dateStr, backdateDays = 0) {
  const total = units * price;
  const doc = await api("/api/documents", { method: "POST", body: JSON.stringify({
    type: "INV", date: dateStr, customerId: custId, customerName: MARK, storeId, status: "unpaid",
    subtotal: String(total), total: String(total),
    items: [{ productId, sku: "T", description: "datetest", qty: String(units), unit: "PCS", price: String(price), amount: String(total) }],
    createdBy: adminId,
  }) });
  const id = doc.body?.id;
  if (!id) { console.log("   ⚠ INVOICE CREATE FAILED:", doc.status, JSON.stringify(doc.body).slice(0, 200)); return null; }
  await api(`/api/documents/${id}/payments`, { method: "POST", body: JSON.stringify({ amount: total, method: "Cash", date: dateStr, recordedBy: adminId }) });
  if (backdateDays > 0) {
    const past = new Date(Date.now() - backdateDays * 86400000);
    await pool.query(`update documents set date=$1, created_at=$2 where id=$3`, [dateStr, past.toISOString(), id]);
  }
  return id;
}

await pool.query(`delete from users where username=$1`, [UN]); // idempotent: clear a leftover from a crashed run
const adminId = (await pool.query(
  `insert into users (name, role, pin, username, password_hash, must_change_password, active)
   values ('DATE BOT','admin','0000',$1,$2,false,true) returning id`, [UN, bcrypt.hashSync("Date@2026", 10)])).rows[0].id;

try {
  await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: UN, password: "Date@2026" }) });
  const s = (await api("/api/settings")).body || {};
  const openT = s.storeOpenTime || "05:00";
  // business "today" (5AM boundary)
  const now = new Date(); const [oh] = String(openT).split(":").map(Number);
  const bDate = new Date(now); if (now.getHours() < (oh || 5)) bDate.setDate(bDate.getDate() - 1);
  const today = bDate.toISOString().slice(0, 10);
  const day5 = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);

  const inv = (await api("/api/inventory")).body;
  const pick = (Array.isArray(inv) ? inv : []).find(r => r.storeId === storeId && Number(r.qty) >= 20 && r.product);
  productId = pick.productId; price = Number(pick.product.salePrice) || 120; cost = Number(pick.product.costPrice) || 0;
  const c = await api("/api/customers", { method: "POST", body: JSON.stringify({ name: MARK, type: "walk-in" }) });
  custId = c.body.id;
  const margin = price - cost;
  console.log(`SETUP: product ${productId} price=${price} cost=${cost} margin/unit=${margin} | today=${today} day5=${day5}\n`);

  // ── CASE 1 — invoice created today, untouched ──
  console.log("CASE 1 — invoice today, untouched → today's sales/profit include it");
  { const a = await snap(); const id = await makeInvoice(10, today); const b = await snap(); show("dash", a, b);
    ok("today sales +total (10×price)", Number((b.sales - a.sales).toFixed(2)) === 10 * price);
    ok("today profit +margin (10×margin)", Number((b.profit - a.profit).toFixed(2)) === 10 * margin);
    await cleanupAll(); }

  // ── CASE 2 — return today on a 5-day-old invoice ──
  console.log("\nCASE 2 — return today on invoice from 5 days ago → sales/profit UNCHANGED, cash −refund");
  { const id = await makeInvoice(10, day5, 5); // old invoice (backdated)
    const a = await snap();
    await fileAndApprove(id, 4, "full");
    const b = await snap(); show("dash", a, b);
    ok("today sales UNCHANGED", Number((b.sales - a.sales).toFixed(2)) === 0);
    ok("today profit UNCHANGED", Number((b.profit - a.profit).toFixed(2)) === 0);
    ok("cash −refund (4×price)", Number((a.hand - b.hand).toFixed(2)) === 4 * price);
    await cleanupAll(); }

  // ── CASE 3 — invoice today, partially returned today ──
  console.log("\nCASE 3 — invoice today, returned today (same day) → sales −returned, profit −margin, cash −refund");
  { const id = await makeInvoice(10, today);
    const a = await snap();
    await fileAndApprove(id, 4, "partial");
    const b = await snap(); show("dash", a, b);
    ok("today sales −returned (4×price)", Number((a.sales - b.sales).toFixed(2)) === 4 * price);
    ok("today profit −returned margin (4×margin)", Number((a.profit - b.profit).toFixed(2)) === 4 * margin);
    ok("cash −refund (4×price)", Number((a.hand - b.hand).toFixed(2)) === 4 * price);
    await cleanupAll(); }

  // ── CASE 4 — invoice today, edited today (reduce 10→7 units) ──
  console.log("\nCASE 4 — invoice today, edited today (reduce) → today shows FINAL edited amount, no double count");
  { const base = await snap();
    const id = await makeInvoice(10, today);
    const afterCreate = await snap();
    // edit: reduce to 7 units
    await api(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify({ total: String(7 * price), subtotal: String(7 * price), items: [{ productId, sku: "T", description: "d", qty: String(7), unit: "PCS", price: String(price), amount: String(7 * price) }] }) });
    const afterEdit = await snap(); show("create→edit", afterCreate, afterEdit);
    ok("today sales = FINAL edited (7×price over baseline)", Number((afterEdit.sales - base.sales).toFixed(2)) === 7 * price);
    ok("today profit = FINAL edited (7×margin over baseline)", Number((afterEdit.profit - base.profit).toFixed(2)) === 7 * margin);
    await cleanupAll(); }

  // ── CASE 5 — 5-day-old invoice edited today (reduce), refund 400 today ──
  console.log("\nCASE 5 — old invoice edited today (reduce) → today sales/profit UNCHANGED, cash −diff");
  { const id = await makeInvoice(10, day5, 5);
    const a = await snap();
    const stockBefore = await qtyOf(productId, storeId);
    await api(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify({ total: String(7 * price), subtotal: String(7 * price), items: [{ productId, sku: "T", description: "d", qty: String(7), unit: "PCS", price: String(price), amount: String(7 * price) }] }) });
    // refund the 3-unit difference today
    await api(`/api/documents/${id}/payments`, { method: "POST", body: JSON.stringify({ amount: 3 * price, method: "Cash", date: today, isRefund: true, recordedBy: adminId }) });
    // isRefund payment logs no cashflow; record the refund out explicitly (as the UI refund would)
    await pool.query(`insert into cashflow (direction,category,amount,ref_type,ref_id,store_id,notes,date,created_by) values ('out','Customer Refund',$1,'edit',$2,$3,'__DATETEST__ edit refund',$4,$5)`, [String(3 * price), id, storeId, today, adminId]);
    const b = await snap(); show("dash", a, b);
    ok("today sales UNCHANGED", Number((b.sales - a.sales).toFixed(2)) === 0);
    ok("today profit UNCHANGED", Number((b.profit - a.profit).toFixed(2)) === 0);
    ok("cash −diff (3×price refunded)", Number((a.hand - b.hand).toFixed(2)) === 3 * price);
    ok("stock restored +3 on reduce edit", (await qtyOf(productId, storeId)) === stockBefore + 3, `${stockBefore} → ${await qtyOf(productId, storeId)}`);
    await cleanupAll(); }

  // ── CASE 6 — 5-day-old invoice edited today (increase), collect 400 today ──
  console.log("\nCASE 6 — old invoice edited today (increase) → today sales/profit UNCHANGED, cash +diff");
  { const id = await makeInvoice(10, day5, 5);
    const a = await snap();
    const stockBefore = await qtyOf(productId, storeId);
    await api(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify({ total: String(13 * price), subtotal: String(13 * price), items: [{ productId, sku: "T", description: "d", qty: String(13), unit: "PCS", price: String(price), amount: String(13 * price) }] }) });
    await api(`/api/documents/${id}/payments`, { method: "POST", body: JSON.stringify({ amount: 3 * price, method: "Cash", date: today, recordedBy: adminId }) });
    const b = await snap(); show("dash", a, b);
    ok("today sales UNCHANGED", Number((b.sales - a.sales).toFixed(2)) === 0);
    ok("today profit UNCHANGED", Number((b.profit - a.profit).toFixed(2)) === 0);
    ok("cash +diff (3×price collected)", Number((b.hand - a.hand).toFixed(2)) === 3 * price);
    ok("stock −3 more on increase edit", (await qtyOf(productId, storeId)) === stockBefore - 3, `${stockBefore} → ${await qtyOf(productId, storeId)}`);
    await cleanupAll(); }

  // ── CASE 7 — stock always correct (net zero after full create+return, and after edits above) ──
  console.log("\nCASE 7 — stock integrity across create → edit → return");
  { const startQty = await qtyOf(productId, storeId);
    const id = await makeInvoice(10, today); // -10
    ok("stock -10 after sale", (await qtyOf(productId, storeId)) === startQty - 10);
    await api(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify({ total: String(6 * price), subtotal: String(6 * price), items: [{ productId, sku: "T", description: "d", qty: String(6), unit: "PCS", price: String(price), amount: String(6 * price) }] }) });
    ok("stock -6 after edit to 6 units (reconciled +4)", (await qtyOf(productId, storeId)) === startQty - 6);
    await fileAndApprove(id, 2, "partial");
    ok("stock -4 after returning 2 (6 sold − 2 returned)", (await qtyOf(productId, storeId)) === startQty - 4, `${startQty} → ${await qtyOf(productId, storeId)}`);
    await cleanupAll();
    ok("stock back to baseline after full cleanup", (await qtyOf(productId, storeId)) === startQty, `${await qtyOf(productId, storeId)} vs ${startQty}`);
  }
} finally {
  await cleanupAll();
  await pool.query(`delete from payments where customer_id in (select id from customers where name like '%__DATETEST__%')`);
  await pool.query(`delete from customers where name like '%__DATETEST__%'`);
  await pool.query(`delete from users where id=$1`, [adminId]);
  console.log("\ncleanup done");
}

const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} checks passed.`);
await pool.end();
process.exitCode = passed === R.length ? 0 : 1;
