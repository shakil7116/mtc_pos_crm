// Agent 3 — real Store 1 workflow test, 7 scenarios, JWT-authenticated. → REALTEST.md
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const today = new Date().toISOString().slice(0, 10);
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

// JWT login → cookie header per role (tokens in-memory only)
async function loginCookie(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  if (!r.ok) throw new Error(`login ${username} failed: ${await r.text()}`);
  return r.headers.get("set-cookie").match(/mtc_token=[^;]*/)[0];
}
// NOTE: admin (shakil) password was changed by the owner; use manager for
// management-level reads/reports/approvals (equivalent access).
const sales = await loginCookie("store.salesman", "Mtc@2026-2");
const manager = await loginCookie("manager", "Mtc@2026-x");
const driver = await loginCookie("driver", "Mtc@2026-x");
const admin = manager;
const H = (cookie) => ({ "Content-Type": "application/json", cookie });

const prods = await (await fetch(`${BASE}/api/products`, { headers: H(admin) })).json();
const P = (sku) => prods.find((p) => p.sku === sku);
const custs = await (await fetch(`${BASE}/api/customers`, { headers: H(admin) })).json();
const C = (name) => custs.find((c) => c.name === name);
// qty at the product's home location (default) or a specific store.
const qty = async (sku, storeId) => { const { rows } = await pool.query(`SELECT i.qty FROM inventory i JOIN products p ON p.id=i.product_id WHERE p.sku=$1 AND i.store_id=${storeId ? "$2" : "p.location_store_id"}`, storeId ? [sku, storeId] : [sku]); return Number(rows[0]?.qty || 0); };

const results = [];
const rec = (scenario, step, expected, actual, pass) => { results.push({ scenario, step, expected, actual: String(actual), pass }); console.log(`${pass ? "PASS" : "FAIL"}: [${scenario}] ${step} — ${actual}`); };

const line = (sku, q, priceOverride, disc) => { const p = P(sku); const price = priceOverride ?? Number(p.salePrice); const gross = price * q; const amount = gross - (disc || 0) * q; return { productId: p.id, sku, description: p.name, qty: q, unit: p.unit, price: String(price), discountType: "QAR", discountAmount: String((disc || 0) * q), amount: String(amount) }; };
const mkInv = (cust, items, payments, extra = {}) => { const total = items.reduce((s, i) => s + Number(i.amount), 0); return { type: "INV", date: today, customerId: cust?.id ?? null, customerName: cust?.name || "Walk-in", storeId: 1, subtotal: String(items.reduce((s,i)=>s+Number(i.price)*Number(i.qty),0)), total: String(total), taxRate: "0", taxAmount: "0", items, payments, createdBy: 2, ...extra }; };

// ── S1: cash sale, walk-in ──
{
  const q0 = { cem: await qty("CEM-001", 1), wht: await qty("CEM-002", 1), av: await qty("PLM-003", 1) };
  const items = [line("CEM-001", 5), line("CEM-002", 2), line("PLM-003", 10)];
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(sales), body: JSON.stringify(mkInv(null, items, [{ method: "Cash", amount: 5*28+2*45+10*9 }])) });
  const d = await j(r);
  global._s1 = d;
  rec("S1", "cash invoice created + paid + sequential", "201 paid INV-", `${d.number} ${d.status}`, r.status===201 && d.status==="paid" && /^INV-/.test(d.number||""));
  rec("S1", "total = 320 (5*28+2*45+10*9)", "320", d.total, Number(d.total)===320);
  const q1 = { cem: await qty("CEM-001", 1), wht: await qty("CEM-002", 1), av: await qty("PLM-003", 1) };
  rec("S1", "stock deducted from Store 1 (cement -5, white -2, valve -10)", "correct", `cem ${q0.cem}->${q1.cem}, wht ${q0.wht}->${q1.wht}, av ${q0.av}->${q1.av}`, q1.cem===q0.cem-5 && q1.wht===q0.wht-2 && q1.av===q0.av-10);
  const { rows: pay } = await pool.query(`SELECT method FROM payments WHERE document_id=$1 AND is_refund=false`, [d.id]);
  rec("S1", "cash payment recorded", "Cash", pay[0]?.method, pay[0]?.method==="Cash");
  const detail = await j(await fetch(`${BASE}/api/documents/${d.id}`, { headers: H(admin) }));
  rec("S1", "cost price NOT in customer doc payload", "no cost field", `leak=${JSON.stringify(detail.items).includes('cost')}`, !JSON.stringify(detail.items).includes("cost"));
}
// ── S2: credit customer ──
{
  const before = await (await fetch(`${BASE}/api/dashboard/summary?storeId=1`, { headers: H(admin) })).json();
  const items = [line("GYP-001", 20), line("GYP-002", 10), line("GYP-003", 5)];
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(sales), body: JSON.stringify(mkInv(C("Mohammed Al-Rashidi"), items, [{ method: "Credit", amount: 860, creditTerm: 30 }])) });
  const d = await j(r);
  rec("S2", "credit invoice unpaid", "201 unpaid", `${d.number} ${d.status}`, r.status===201 && d.status==="unpaid");
  rec("S2", "total 860", "860", d.total, Number(d.total)===860);
  const mohDocs = await (await fetch(`${BASE}/api/documents?customerId=${C("Mohammed Al-Rashidi").id}`, { headers: H(admin) })).json();
  rec("S2", "customer history isolated (all his)", "all Mohammed", `${mohDocs.length} docs all his=${mohDocs.every(x=>x.customerId===C("Mohammed Al-Rashidi").id)}`, mohDocs.every(x=>x.customerId===C("Mohammed Al-Rashidi").id));
  const aging = await (await fetch(`${BASE}/api/reports/aging`, { headers: H(admin) })).json();
  rec("S2", "appears in aging report", "Mohammed present", `found=${!!aging.rows.find(x=>x.customerId===C("Mohammed Al-Rashidi").id)}`, !!aging.rows.find(x=>x.customerId===C("Mohammed Al-Rashidi").id));
}
// ── S3: split cash + PDC ──
{
  const clearDate = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const items = [line("PWR-001", 3), line("ELE-003", 5)];
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(sales), body: JSON.stringify(mkInv(C("Ahmed Construction WLL"), items, [{ method: "Cash", amount: 600 }, { method: "PDC", amount: 750, chequeNumber: "112233", bankName: "Qatar National Bank", chequeDate: clearDate }])) });
  const d = await j(r);
  rec("S3", "split → partial", "201 partial", `${d.number} ${d.status}`, r.status===201 && d.status==="partial");
  const { rows: chq } = await pool.query(`SELECT cheque_number, bank_name, cheque_date, type, status FROM cheques WHERE cheque_number='112233' AND document_id=$1`, [d.id]);
  rec("S3", "PDC in tracker w/ correct date+bank", "112233 QNB", JSON.stringify(chq[0]), chq[0]?.type==="receivable" && chq[0]?.bank_name==="Qatar National Bank");
  const { rows: cf } = await pool.query(`SELECT count(*)::int n FROM cashflow WHERE ref_type='invoice' AND ref_id=$1 AND direction='in'`, [d.id]);
  rec("S3", "cash portion in cash flow (PDC not yet)", "1 in-row (600)", `${cf[0].n} rows`, cf[0].n===1);
}
// ── S4: line-item discount + online transfer ──
{
  const items = [line("SAF-002", 100, 10, 1), line("SAF-001", 10)]; // gloves 10 w/ 1 disc =9; helmets 25
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(sales), body: JSON.stringify(mkInv(C("Khalid Al-Marri"), items, [{ method: "Online Transfer", amount: 1150, accountNumber: "QA12QNBA000012345", referenceNumber: "TRF2026001", bankName: "Qatar National Bank" }])) });
  const d = await j(r);
  rec("S4", "total = 1150 (100*9 + 10*25)", "1150", d.total, Number(d.total)===1150);
  const { rows: pay } = await pool.query(`SELECT method, account_number, reference, bank_name FROM payments WHERE document_id=$1`, [d.id]);
  rec("S4", "online transfer ref+account saved", "TRF2026001 + IBAN", JSON.stringify(pay[0]), pay[0]?.reference==="TRF2026001" && pay[0]?.account_number==="QA12QNBA000012345");
  const { rows: it } = await pool.query(`SELECT discount_amount FROM document_items WHERE document_id=$1 AND sku='SAF-002'`, [d.id]);
  rec("S4", "line discount stored on item (100)", "100", it[0]?.discount_amount, Number(it[0]?.discount_amount)===100);
}
// ── S5: partial return, cash refund, no PDC option ──
{
  const inv = global._s1;
  const rr = await fetch(`${BASE}/api/returns`, { method: "POST", headers: H(sales), body: JSON.stringify({ originalInvoiceId: inv.id, type: "partial", reason: "Wrong size", refundMethod: "Cash", refundAmount: 27, storeId: 1, createdBy: 2, items: [{ productId: P("PLM-003").id, description: "Angle Valve", qty: 3, price: 9, amount: 27 }] }) });
  const rd = await j(rr);
  rec("S5", "return created pending (needs approval)", "pending", rd.returnVoucher?.status, rd.returnVoucher?.status==="pending");
  const q0 = await qty("PLM-003");
  const ar = await fetch(`${BASE}/api/returns/${rd.returnVoucher.id}/approve`, { method: "POST", headers: H(manager), body: JSON.stringify({ refundMethod: "Cash" }) });
  const ad = await j(ar);
  const q1 = await qty("PLM-003");
  rec("S5", "manager approve → stock +3", "approved +3", `${ad.status}, valve ${q0}->${q1}`, ad.status==="approved" && q1===q0+3);
  const { rows: pay } = await pool.query(`SELECT method FROM payments WHERE reference=$1 AND is_refund=true`, [rd.returnVoucher.voucherNumber]);
  rec("S5", "refund is CASH (never PDC)", "Cash", pay[0]?.method, pay[0]?.method==="Cash");
  // no payable cheque created for the return
  const { rows: badChq } = await pool.query(`SELECT count(*)::int n FROM cheques WHERE cheque_number LIKE $1`, [`REFUND-${rd.returnVoucher.voucherNumber}%`]);
  rec("S5", "NO PDC cheque created for return", "0 cheques", `${badChq[0].n}`, badChq[0].n===0);
  rec("S5", "credit note linked to original invoice", `orig ${inv.id}`, rd.returnVoucher?.originalInvoiceId, rd.returnVoucher?.originalInvoiceId===inv.id);
}
// ── S6: void ──
{
  const d = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(sales), body: JSON.stringify(mkInv(C("Omar Hassan"), [line("CEM-001", 2)], [{ method: "Cash", amount: 56 }])) }));
  const q0 = await qty("CEM-001", 1);
  const v = await fetch(`${BASE}/api/documents/${d.id}/void`, { method: "POST", headers: H(sales) });
  const doc = await j(await fetch(`${BASE}/api/documents/${d.id}`, { headers: H(admin) }));
  const q1 = await qty("CEM-001", 1);
  rec("S6", "void: status void, number kept, stock +2", "void +2", `${doc.status}, ${doc.number}===${d.number}, cem ${q0}->${q1}`, v.status===200 && doc.status==="void" && doc.number===d.number && q1===q0+2);
  const { rows: pay } = await pool.query(`SELECT method, is_refund FROM payments WHERE document_id=$1 AND is_refund=true`, [d.id]);
  rec("S6", "cash refund processed on void", "Cash refund", pay[0]?.method, pay[0]?.method==="Cash");
}
// ── S7: delivery to site ──
{
  // Farhan is over his credit limit → the sale needs a manager override (real flow).
  const items = [line("GYP-001", 50), line("GYP-002", 20)];
  const d = await j(await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(manager), body: JSON.stringify(mkInv(C("Farhan Trading"), items, [{ method: "Credit", amount: 1850, creditTerm: 60 }], { creditOverride: true, deliveryMethod: "deliver_site", deliveryStatus: "pending", deliveryAddress: "Industrial Area St 22, Doha", driverId: 5 })) }));
  rec("S7", "delivery invoice created (credit, manager override)", "unpaid site", `${d.number} ${d.status} ${d.deliveryMethod}`, d.status==="unpaid" && d.deliveryMethod==="deliver_site");
  const dels = await (await fetch(`${BASE}/api/deliveries?driverId=5`, { headers: H(driver) })).json();
  rec("S7", "driver sees the delivery", "listed for driver 5", `${dels.length} deliveries, has=${dels.some(x=>x.id===d.id)}`, dels.some(x=>x.id===d.id));
  rec("S7", "driver payload strips pricing", "total null for driver", `total=${dels.find(x=>x.id===d.id)?.total}`, dels.find(x=>x.id===d.id)?.total==null);
  const del = await j(await fetch(`${BASE}/api/documents/${d.id}/delivered`, { method: "POST", headers: H(driver) }));
  const doc = await j(await fetch(`${BASE}/api/documents/${d.id}`, { headers: H(admin) }));
  rec("S7", "mark delivered → status + auto DN", "delivered + DN", `status=${doc.deliveryStatus}, DN=${del.deliveryNote?.number}`, doc.deliveryStatus==="delivered" && !!del.deliveryNote?.number);
}

const passN = results.filter((r) => r.pass).length;
const md = [
  `# REALTEST.md — Real Store 1 Workflow Test`, ``,
  `7 real building-materials scenarios run as salesman/manager/driver via JWT auth on the live server.`, ``,
  `**Result: ${passN}/${results.length} checks passed.**`, ``,
  `| Scenario | Step | Expected | Actual | Pass/Fail |`, `|---|---|---|---|---|`,
  ...results.map((r) => `| ${r.scenario} | ${r.step} | ${r.expected} | ${r.actual.replace(/\|/g, "\\|")} | ${r.pass ? "✅ Pass" : "❌ Fail"} |`),
].join("\n");
const fs = await import("fs");
fs.writeFileSync("REALTEST.md", md);
console.log(`\n════ ${passN}/${results.length} → REALTEST.md ════`);
await pool.end();
process.exit(passN === results.length ? 0 : 1);
