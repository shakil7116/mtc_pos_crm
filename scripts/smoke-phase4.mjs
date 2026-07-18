// Agent 5 — Phase 4 end-to-end verification. Emits Markdown matrix → PHASE4_TEST.md.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const H = (role = "admin", uid = "1") => ({ "Content-Type": "application/json", "x-user-role": role, "x-user-id": uid });

const results = [];
const log = (check, expected, actual, pass) => { results.push({ check, expected, actual: String(actual), pass }); console.log(`${pass ? "PASS" : "FAIL"}: ${check} — ${actual}`); };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

const prod = (await (await fetch(`${BASE}/api/products`)).json())[0];
const store = (await (await fetch(`${BASE}/api/stores`)).json())[0];
// Dedicated clean customer (creditLimit 0 = no limit) — earlier smoke customers
// carry accumulated balances that correctly trip the credit gate on PDC/Credit.
const { rows: custRows } = await pool.query(
  `INSERT INTO customers (name, phone, credit_limit, active) VALUES ('Phase4 Test Customer', '+97400000004', '0', true) RETURNING *`,
);
const cust = { id: custRows[0].id, name: custRows[0].name };
const today = new Date().toISOString().slice(0, 10);

const mkDoc = (total, qty, payments, extra = {}) => ({
  type: "INV", date: today, customerId: cust.id, customerName: cust.name, storeId: store.id,
  subtotal: String(total), total: String(total), taxRate: "0", taxAmount: "0",
  items: [{ productId: prod.id, description: prod.name, qty, unit: "pcs", price: String(total / qty), discountAmount: "0", amount: String(total) }],
  payments, createdBy: 1, ...extra,
});

console.log("── PAYMENT FIELDS ──");
// 1. Cash — no extra fields
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(50, 1, [{ method: "Cash", amount: 50 }])) });
  log("1. Cash invoice, no extra fields", "201 created", `status ${r.status}`, r.status === 201);
}
// 2. Card without reference → blocked
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(50, 1, [{ method: "Card", amount: 50 }])) });
  log("2. Card blocked without reference", "4xx/5xx rejected", `status ${r.status}`, r.status >= 400);
}
// 3. Card reference saves
let cardDocId;
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(50, 1, [{ method: "Card", amount: 50, referenceNumber: "TERM-8842" }])) });
  const d = await j(r); cardDocId = d.id;
  const { rows } = await pool.query("SELECT reference FROM payments WHERE document_id=$1", [d.id]);
  log("3. Card reference saved in DB", "reference=TERM-8842", `got ${rows[0]?.reference}`, rows[0]?.reference === "TERM-8842");
}
// 4. Online transfer full fields
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(75, 1, [{ method: "Online Transfer", amount: 75, accountNumber: "QA58DOHB0000123456789", referenceNumber: "TXN-9917", bankName: "QIB" }])) });
  const d = await j(r);
  const { rows } = await pool.query("SELECT account_number, reference, bank_name FROM payments WHERE document_id=$1", [d.id]);
  const ok = rows[0]?.account_number === "QA58DOHB0000123456789" && rows[0]?.reference === "TXN-9917" && rows[0]?.bank_name === "QIB";
  log("4. Online saves account+ref+bank", "all three saved", JSON.stringify(rows[0]), ok);
  // also: blocked without account
  const r2 = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(75, 1, [{ method: "Online Transfer", amount: 75, referenceNumber: "X", bankName: "QIB" }])) });
  log("4b. Online blocked without account/IBAN", "rejected", `status ${r2.status}`, r2.status >= 400);
}
// 5+6. PDC saves + auto tracker entry
let pdcChequeId;
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(200, 2, [{ method: "PDC", amount: 200, chequeNumber: "CHQ-P4-001", bankName: "Doha Bank", chequeDate: "2026-07-06" }])) });
  const d = await j(r);
  const { rows } = await pool.query("SELECT id, cheque_number, bank_name, cheque_date, type, who, document_id, status FROM cheques WHERE cheque_number='CHQ-P4-001'");
  pdcChequeId = rows[0]?.id;
  log("5. PDC saves cheque no/date/bank", "row in cheques", JSON.stringify({ n: rows[0]?.cheque_number, b: rows[0]?.bank_name, d: rows[0]?.cheque_date }), rows[0]?.cheque_number === "CHQ-P4-001" && rows[0]?.bank_name === "Doha Bank");
  log("6. PDC auto-appears in tracker (receivable, linked, who auto)", "type=receivable, document_id set, who=customer", JSON.stringify({ t: rows[0]?.type, doc: rows[0]?.document_id, who: rows[0]?.who }), rows[0]?.type === "receivable" && rows[0]?.document_id === d.id && !!rows[0]?.who);
}
// 7. Split payment per-portion fields
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(300, 3, [
    { method: "Cash", amount: 100 },
    { method: "Card", amount: 100, referenceNumber: "TERM-SPLIT-7" },
    { method: "PDC", amount: 100, chequeNumber: "CHQ-P4-SPLIT", bankName: "QNB", chequeDate: "2026-07-20" },
  ])) });
  const d = await j(r);
  const { rows } = await pool.query("SELECT method, reference FROM payments WHERE document_id=$1 ORDER BY id", [d.id]);
  const cash = rows.find((x) => x.method === "Cash"), card = rows.find((x) => x.method === "Credit Card"), chq = rows.find((x) => x.method === "Cheque");
  const ok = cash && !cash.reference && card?.reference === "TERM-SPLIT-7" && chq?.reference === "CHQ-P4-SPLIT";
  log("7. Split: each portion own fields", "cash bare, card ref, pdc cheque#", JSON.stringify(rows), !!ok);
}
// 8. Staff auto-recorded
{
  const { rows } = await pool.query("SELECT count(*)::int n FROM payments WHERE document_id=$1 AND recorded_by IS NOT NULL AND created_at IS NOT NULL", [cardDocId]);
  log("8. Staff + timestamp auto-recorded", "recorded_by + created_at set", `${rows[0].n} rows stamped`, rows[0].n > 0);
}

console.log("── EXPENSES ──");
// 9. Expense entry
let expenseId;
{
  const r = await fetch(`${BASE}/api/expenses`, { method: "POST", headers: H(), body: JSON.stringify({ category: "Daily Staff Meals", amount: 85, date: today, paymentMethod: "Cash", storeId: store.id, notes: "Lunch for 4 staff" }) });
  const d = await j(r); expenseId = d.id;
  log("9. Expense saves w/ category+location", "row with category+store", `#${d.id} ${d.category} store ${d.storeId}`, r.status === 201 && d.category === "Daily Staff Meals" && d.storeId === store.id);
}
// 10. Recurring reminder
{
  const past = "2026-06-01";
  const r = await fetch(`${BASE}/api/expenses`, { method: "POST", headers: H(), body: JSON.stringify({ category: "Store 1 Rent", amount: 12000, date: past, paymentMethod: "Bank Transfer", storeId: store.id, isRecurring: true, frequency: "monthly", nextDueDate: "2026-07-01" }) });
  const d = await j(r);
  await fetch(`${BASE}/api/expenses`, { headers: H() }); // triggers lazy check
  const { rows } = await pool.query("SELECT count(*)::int n FROM notifications WHERE type='recurring_expense_due' AND entity_id=$1", [d.id]);
  const { rows: rolled } = await pool.query("SELECT next_due_date FROM expenses WHERE id=$1", [d.id]);
  const nextIso = rolled[0]?.next_due_date ? new Date(rolled[0].next_due_date).toISOString().slice(0, 10) : "";
  log("10. Recurring reminder triggers + rolls forward", "notification + nextDue advanced", `notif=${rows[0].n}, next=${nextIso}`, rows[0].n >= 1 && nextIso > "2026-07-01");
}
// 11. Maintenance links to issue
{
  const ir = await fetch(`${BASE}/api/warehouse-issues`, { method: "POST", headers: H("warehouse", "2"), body: JSON.stringify({ storeId: store.id, description: "Roller shutter jammed at W1", urgency: "normal" }) });
  const issue = await j(ir);
  const er = await fetch(`${BASE}/api/expenses`, { method: "POST", headers: H(), body: JSON.stringify({ category: "Maintenance", amount: 450, date: today, paymentMethod: "Cash", storeId: store.id, linkedIssueId: issue.id, notes: "Shutter repair — external worker" }) });
  const exp = await j(er);
  log("11. Maintenance expense links to issue", "linked_issue_id set", `expense #${exp.id} → issue #${exp.linkedIssueId}`, exp.linkedIssueId === issue.id);
}
// 12. Custom category from Settings appears immediately
{
  await fetch(`${BASE}/api/lists`, { method: "POST", headers: H(), body: JSON.stringify({ listKey: "expense_categories", value: "Vehicle Fuel", sortOrder: 99 }) });
  const cats = await (await fetch(`${BASE}/api/lists/expense_categories`)).json();
  const has = cats.some((c) => c.value === "Vehicle Fuel");
  const er = await fetch(`${BASE}/api/expenses`, { method: "POST", headers: H(), body: JSON.stringify({ category: "Vehicle Fuel", amount: 120, date: today, paymentMethod: "Cash" }) });
  log("12. New category usable immediately", "in list + accepted on expense", `listed=${has}, expense=${er.status}`, has && er.status === 201);
}

console.log("── PDC TRACKER ──");
// 13. Due-soon alert (cheque CHQ-P4-001 dated 2026-07-06, today 2026-07-04, lead 3d)
{
  await fetch(`${BASE}/api/pdc/check-alerts`, { method: "POST", headers: H() });
  const { rows } = await pool.query("SELECT target_role FROM notifications WHERE type='pdc_due' AND entity_id=$1", [pdcChequeId]);
  const roles = rows.map((r) => r.target_role).sort();
  log("13. PDC due-soon alerts admin+manager", "2 notifications (admin, manager)", JSON.stringify(roles), roles.includes("admin") && roles.includes("manager"));
}
// 14. Bounce flags customer
{
  const r = await fetch(`${BASE}/api/cheques/${pdcChequeId}/status`, { method: "POST", headers: H(), body: JSON.stringify({ status: "bounced" }) });
  const { rows } = await pool.query("SELECT custom_data FROM customers WHERE id=$1", [cust.id]);
  const bag = rows[0]?.custom_data || {};
  const { rows: n } = await pool.query("SELECT count(*)::int c FROM notifications WHERE type='cheque_bounced' AND entity_id=$1", [pdcChequeId]);
  log("14. Bounced cheque flags customer + alerts admin", "customData.chequeBounced + notification", `flag=${bag.chequeBounced}, notif=${n[0].c}`, r.status === 200 && bag.chequeBounced === true && n[0].c >= 1);
}
// 15. Void ≥ threshold → outgoing PDC
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(5000, 100, [{ method: "Cash", amount: 5000 }])) });
  const d = await j(r);
  const vr = await fetch(`${BASE}/api/documents/${d.id}/void`, { method: "POST", headers: H() });
  const { rows } = await pool.query("SELECT type, status, amount FROM cheques WHERE document_id=$1 AND type='payable'", [d.id]);
  log("15. Void ≥4000 creates outgoing PDC entry", "payable pending cheque 5000", JSON.stringify(rows[0]), vr.status === 200 && rows[0]?.type === "payable" && Number(rows[0]?.amount) === 5000);
}
// 16. Filter by status
{
  const rows = await (await fetch(`${BASE}/api/cheques?status=bounced`, { headers: H() })).json();
  const allBounced = Array.isArray(rows) && rows.length > 0 && rows.every((r) => r.status === "bounced");
  log("16. Filter by status works", "only bounced rows", `${rows.length} rows, allBounced=${allBounced}`, allBounced);
}
// 17. CSV export
{
  const r = await fetch(`${BASE}/api/cheques/export.csv`, { headers: H() });
  const text = await r.text();
  const ok = r.headers.get("content-type")?.includes("text/csv") && text.startsWith("Cheque #") && text.split("\n").length > 1;
  log("17. CSV export works", "csv with header + rows", `${text.split("\n").length} lines`, !!ok);
}

console.log("── CASH FLOW ──");
// 18. Cash sale → money in
{
  const { rows } = await pool.query("SELECT count(*)::int n FROM cashflow WHERE direction='in' AND category='Sales'");
  log("18. Cash sale appears as money-in", ">0 Sales in-rows", `${rows[0].n} rows`, rows[0].n > 0);
}
// 19. Expense → money out
{
  const { rows } = await pool.query("SELECT direction, category FROM cashflow WHERE ref_type='expense' AND ref_id=$1", [expenseId]);
  log("19. Expense appears as money-out", "out row linked to expense", JSON.stringify(rows[0]), rows[0]?.direction === "out");
}
// 20. Supplier refund in (from Phase 3)
{
  const { rows } = await pool.query("SELECT count(*)::int n FROM cashflow WHERE direction='in' AND category='Supplier Refund'");
  log("20. Supplier refund as money-in", ">0 rows", `${rows[0].n} rows`, rows[0].n > 0);
}
// 21. Position per location
{
  const pos = await (await fetch(`${BASE}/api/cashflow/position`, { headers: H() })).json();
  const hasStore = pos.perStore?.some((s) => s.storeId === store.id);
  log("21. Cash position per location", "perStore breakdown incl store 1", JSON.stringify(pos.perStore?.slice(0, 2)), hasStore && typeof pos.total === "number");
}
// 22. Dashboard position fields
{
  const pos = await (await fetch(`${BASE}/api/cashflow/position`, { headers: H() })).json();
  const ok = ["total", "cashInHand", "bank", "pdcPending", "pdcPayable"].every((k) => typeof pos[k] === "number");
  log("22. Position: hand/bank/PDC breakdown", "all fields numeric", `total=${pos.total}, hand=${pos.cashInHand}, bank=${pos.bank}, pdcIn=${pos.pdcPending}`, ok);
}

console.log("── BACKLOG FIXES ──");
// 23. Void window from Settings
{
  await fetch(`${BASE}/api/settings`, { method: "POST", headers: H(), body: JSON.stringify({ voidWindowHours: 1 }) });
  // create an invoice, backdate created_at 2h, try void → blocked at 1h window
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(60, 1, [{ method: "Cash", amount: 60 }])) });
  const d = await j(r);
  await pool.query("UPDATE documents SET created_at = now() - interval '2 hours' WHERE id=$1", [d.id]);
  const v1 = await fetch(`${BASE}/api/documents/${d.id}/void`, { method: "POST", headers: H() });
  const b1 = await j(v1);
  await fetch(`${BASE}/api/settings`, { method: "POST", headers: H(), body: JSON.stringify({ voidWindowHours: 12 }) });
  const v2 = await fetch(`${BASE}/api/documents/${d.id}/void`, { method: "POST", headers: H() });
  log("23. Void window Settings-driven", "blocked @1h window, allowed @12h", `1h→${v1.status} (${b1.message?.slice(0, 40)}), 12h→${v2.status}`, v1.status === 400 && v2.status === 200);
}
// 24. PDC threshold from Settings
{
  await fetch(`${BASE}/api/settings`, { method: "POST", headers: H(), body: JSON.stringify({ pdcThreshold: "100" }) });
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(150, 3, [{ method: "Cash", amount: 150 }])) });
  const d = await j(r);
  await fetch(`${BASE}/api/documents/${d.id}/void`, { method: "POST", headers: H() });
  const { rows } = await pool.query("SELECT method FROM payments WHERE document_id=$1 AND is_refund=true", [d.id]);
  await fetch(`${BASE}/api/settings`, { method: "POST", headers: H(), body: JSON.stringify({ pdcThreshold: "4000" }) });
  log("24. PDC threshold Settings-driven", "150 refund → Cheque at threshold 100", `refund method=${rows[0]?.method}`, rows[0]?.method === "Cheque");
}
// 25. Role gate on void
{
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: H(), body: JSON.stringify(mkDoc(40, 1, [{ method: "Cash", amount: 40 }])) }); // createdBy 1
  const d = await j(r);
  const other = await fetch(`${BASE}/api/documents/${d.id}/void`, { method: "POST", headers: H("salesman", "99") });
  const creator = await fetch(`${BASE}/api/documents/${d.id}/void`, { method: "POST", headers: H("salesman", "1") });
  log("25. Void role gate", "other salesman 403, creator 200", `other→${other.status}, creator→${creator.status}`, other.status === 403 && creator.status === 200);
}

// ── emit PHASE4_TEST.md ──
const passN = results.filter((r) => r.pass).length;
const md = [
  `# PHASE4_TEST.md — Phase 4 End-to-End Verification`,
  ``, `Mamun M Trading and Contracting WLL — MTC POS & CRM`,
  `Generated by scripts/smoke-phase4.mjs against the live server + Supabase DB.`,
  ``, `**Result: ${passN}/${results.length} checks passed.**`, ``,
  `| # | Check | Expected | Actual | Pass/Fail |`,
  `|---|-------|----------|--------|-----------|`,
  ...results.map((r, i) => `| ${i + 1} | ${r.check} | ${r.expected} | ${r.actual.replace(/\|/g, "\\|")} | ${r.pass ? "✅ Pass" : "❌ Fail"} |`),
].join("\n");
const fs = await import("fs");
fs.writeFileSync("PHASE4_TEST.md", md);
console.log(`\n════ ${passN}/${results.length} passed → PHASE4_TEST.md ════`);
await pool.query(`UPDATE customers SET active=false WHERE id=$1`, [cust.id]); // hide test customer
await pool.end();
process.exit(passN === results.length ? 0 : 1);
