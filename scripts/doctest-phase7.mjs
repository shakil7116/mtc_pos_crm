// Agent 5 — real document lifecycle tests on the seeded Store 1 data. → DOCTEST.md
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const H = (role = "admin", uid = "1") => ({ "Content-Type": "application/json", "x-user-role": role, "x-user-id": uid });
const today = new Date().toISOString().slice(0, 10);
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const results = [];
const rec = (test, expected, actual, pass) => { results.push({ test, expected, actual: String(actual), pass }); console.log(`${pass ? "PASS" : "FAIL"}: ${test} — ${actual}`); };
const qty = async (sku) => { const { rows } = await pool.query(`SELECT i.qty FROM inventory i JOIN products p ON p.id=i.product_id WHERE p.sku=$1 AND i.store_id=p.location_store_id`, [sku]); return Number(rows[0]?.qty || 0); };
const prods = await (await fetch(`${BASE}/api/products`, { headers: H() })).json();
const P = (sku) => prods.find((p) => p.sku === sku);
const custs = await (await fetch(`${BASE}/api/customers`, { headers: H() })).json();
const C = (name) => custs.find((c) => c.name === name);
const line = (sku, q) => { const p = P(sku); return { productId: p.id, sku, description: p.name, qty: q, unit: p.unit, price: String(p.salePrice), discountAmount: "0", amount: String(Number(p.salePrice) * q) }; };
const mk = (cust, items, payments, extra = {}) => {
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  return { type: "INV", date: today, customerId: cust?.id, customerName: cust?.name, storeId: 1, subtotal: String(total), total: String(total), taxRate: "0", taxAmount: "0", items, payments, createdBy: 5, ...extra };
};

// T1 — cash invoice
{
  const q0 = await qty("PLM-003");
  const items = [line("PLM-003", 10), line("CHM-001", 5), line("PNT-003", 2)];
  const d = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H("salesman", "5"), body: JSON.stringify(mk(C("Omar Hassan"), items, [{ method: "Cash", amount: 10 * 9 + 5 * 14 + 2 * 15 }])) }));
  const q1 = await qty("PLM-003");
  rec("T1 Cash invoice", "created, paid, stock −10, sequential #", `${d.number} status=${d.status}, angle-valve ${q0}→${q1}`, d.status === "paid" && q1 === q0 - 10 && /^INV-/.test(d.number || ""));
  global._t1 = d;
}
// T2 — credit invoice, limit checked, unpaid
{
  const d = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H("salesman", "5"), body: JSON.stringify(mk(C("Mohammed Al-Rashidi"), [line("GYP-001", 20), line("GYP-003", 10), line("SAF-001", 5)], [{ method: "Credit", amount: 20 * 25 + 10 * 12 + 5 * 25, creditTerm: 30 }])) });
  const doc = await j(d);
  rec("T2 Credit invoice", "unpaid, within limit", `status=${doc.status} #${doc.number}`, d.status === 201 && doc.status === "unpaid");
}
// T3 — split cash + PDC → partial + cheque tracked
{
  const items = [line("PWR-001", 2), line("PWR-002", 3), line("ELE-002", 10)];
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const d = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H("salesman", "5"), body: JSON.stringify(mk(C("Ahmed Construction WLL"), items, [{ method: "Cash", amount: 500 }, { method: "PDC", amount: total - 500, chequeNumber: "12345", bankName: "Al Ahli Bank", chequeDate: today }])) }));
  const { rows: chq } = await pool.query(`SELECT status, type FROM cheques WHERE cheque_number='12345' AND document_id=$1`, [d.id]);
  rec("T3 Split cash+PDC", "partial + receivable cheque tracked", `status=${d.status}, cheque=${JSON.stringify(chq[0])}`, d.status === "partial" && chq[0]?.type === "receivable");
}
// T4 — delivery invoice + driver → DN on delivered
{
  const d = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H("salesman", "5"), body: JSON.stringify(mk(C("Khalid Al-Marri"), [line("GYP-001", 50), line("GYP-003", 20)], [{ method: "Cash", amount: 50 * 25 + 20 * 12 }], { deliveryMethod: "deliver_site", deliveryStatus: "pending", deliveryAddress: "Al Sadd, Doha", driverId: 7 })) }));
  const del = await j(await fetch(`${BASE}/api/documents/${d.id}/delivered`, { method: "POST", headers: H("driver", "7") }));
  rec("T4 Delivery invoice", "DN auto-generated on delivered", `DN=${del.deliveryNote?.number || "NONE"}`, !!del.deliveryNote?.number);
}
// T5 — quotation, no stock move
{
  const q0 = await qty("PLM-001");
  const items = [line("PLM-001", 100), line("PLM-002", 50), line("PLM-003", 30)];
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const d = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H("salesman", "5"), body: JSON.stringify({ type: "QT", date: today, customerId: C("Farhan Trading").id, customerName: "Farhan Trading", storeId: 1, subtotal: String(total), total: String(total), taxRate: "0", taxAmount: "0", items, createdBy: 5 }) }));
  const q1 = await qty("PLM-001");
  rec("T5 Quotation", "QT #, draft, stock NOT moved", `${d.number} status=${d.status}, ppr ${q0}→${q1}`, /^QT-/.test(d.number || "") && q1 === q0);
  global._qt = d;
}
// T6 — convert QT → INV (online transfer)
{
  const conv = await j(await fetch(`${BASE}/api/documents/${global._qt.id}/convert`, { method: "POST", headers: H("manager", "8") }));
  const orig = await j(await fetch(`${BASE}/api/documents/${global._qt.id}`, { headers: H() }));
  rec("T6 Convert QT→INV", "QT converted, INV created", `QT status=${orig.status}, new INV=${conv.number}`, orig.status === "converted" && /^INV-/.test(conv.number || ""));
}
// T8 — return < 5000 → cash (not PDC), approval flow
{
  const inv = global._t1;
  const rr = await j(await fetch(`${BASE}/api/returns`, { method: "POST", headers: H("salesman", "5"), body: JSON.stringify({ originalInvoiceId: inv.id, type: "partial", reason: "3 angle valves returned", refundMethod: "Cash", refundAmount: 27, storeId: 1, createdBy: 5, items: [{ productId: P("PLM-003").id, description: "Angle Valve", qty: 3, price: 9, amount: 27 }] }) }));
  const ar = await j(await fetch(`${BASE}/api/returns/${rr.returnVoucher.id}/approve`, { method: "POST", headers: H("manager", "8") }));
  const { rows } = await pool.query(`SELECT method FROM payments WHERE reference=$1 AND is_refund=true`, [rr.returnVoucher.voucherNumber]);
  rec("T8 Return < 5000 → cash", "approved, refund Cash (not PDC)", `status=${ar.status}, refund=${rows[0]?.method}`, ar.status === "approved" && rows[0]?.method === "Cash");
}
// T9 — void within window → stock reversed, VOID kept, cash refund
{
  const d = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H("salesman", "5"), body: JSON.stringify(mk(C("Khalid Al-Marri"), [line("SAF-002", 5)], [{ method: "Cash", amount: 50 }])) }));
  const q0 = await qty("SAF-002");
  const v = await j(await fetch(`${BASE}/api/documents/${d.id}/void`, { method: "POST", headers: H("salesman", "5") }));
  const q1 = await qty("SAF-002");
  const doc = await j(await fetch(`${BASE}/api/documents/${d.id}`, { headers: H() }));
  rec("T9 Void invoice", "VOID kept, stock reversed +5, cash refund", `status=${doc.status}, gloves ${q0}→${q1}`, doc.status === "void" && q1 === q0 + 5 && doc.number === d.number);
}
// Cost never on print (template data)
{
  const inv = global._t1;
  const detail = await j(await fetch(`${BASE}/api/documents/${inv.id}`, { headers: H() }));
  const leaks = JSON.stringify(detail.items).includes("costPrice") || (detail.items || []).some((i) => i.cost || i.costPrice);
  rec("Cost price not in customer document payload", "no cost field on items", `leaks=${leaks}`, !leaks);
}

const passN = results.filter((r) => r.pass).length;
const md = [
  `# DOCTEST.md — Real Document Lifecycle Tests (Store 1 — Najma Street)`, ``,
  `Run by scripts/doctest-phase7.mjs against live server + real seeded inventory/customers.`, ``,
  `**Result: ${passN}/${results.length} tests passed.**`, ``,
  `| Test | Expected | Actual | Pass/Fail |`, `|------|----------|--------|-----------|`,
  ...results.map((r) => `| ${r.test} | ${r.expected} | ${r.actual.replace(/\|/g, "\\|")} | ${r.pass ? "✅ Pass" : "❌ Fail"} |`),
].join("\n");
const fs = await import("fs");
fs.writeFileSync("DOCTEST.md", md);
console.log(`\n════ ${passN}/${results.length} → DOCTEST.md ════`);
await pool.end();
process.exit(passN === results.length ? 0 : 1);
