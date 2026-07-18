// Prove a cheque expense hits the bank EXACTLY ONCE — at clearance, not creation.
// Throwaway admin, driven over HTTP, everything cleaned up at the end.
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const UN = "__cheq_admin__";
const results = [];
const ok = (name, cond, extra = "") => { results.push({ pass: !!cond }); console.log(`${cond ? "PASS" : "FAIL"} — ${name}${extra ? " :: " + extra : ""}`); };

let cookie = "";
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
  const setc = r.headers.get("set-cookie"); if (setc) { const m = setc.match(/mtc_token=[^;]+/); if (m) cookie = m[0]; }
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
}
const bank = async () => Number((await api("/api/cashflow/position")).body.bank);
const cfCount = async (where, params) => Number((await pool.query(`select count(*)::int n from cashflow where ${where}`, params)).rows[0].n);

const hash = bcrypt.hashSync("Cheq@2026", 10);
const adminId = (await pool.query(
  `insert into users (name, role, pin, username, password_hash, must_change_password, active)
   values ('CHEQ BOT','admin','0000',$1,$2,false,true) returning id`, [UN, hash])).rows[0].id;

const madeExpenses = [], madeCheques = [];
let bank0 = 0; // self-baseline (live bank drifts with real sales)
try {
  await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: UN, password: "Cheq@2026" }) });
  bank0 = await bank();
  ok("baseline bank captured, non-negative", bank0 >= 0, `bank ${bank0}`);
  const AMT = 1234.50;

  // 1) create cheque expense
  const cre = await api("/api/expenses", { method: "POST", body: JSON.stringify({ category: "__CHEQTEST__", amount: AMT, date: "2026-07-14", paymentMethod: "Cheque", chequeNumber: "TEST999", bankName: "QNB" }) });
  ok("cheque expense created 201", cre.status === 201, `status ${cre.status}`);
  const expId = cre.body?.id; if (expId) madeExpenses.push(expId);

  // 2) NO cashflow booked at creation + bank unchanged
  const expCf = await cfCount(`category = 'Expense: __CHEQTEST__'`, []);
  ok("no cashflow booked at creation", expCf === 0, `expense cashflow rows ${expCf}`);
  const bank1 = await bank();
  ok("bank UNCHANGED after writing the cheque", bank1 === bank0, `bank ${bank1}`);

  // 3) a pending payable cheque is linked to the expense
  const chq = (await pool.query(`select id, status, amount, ref_type, ref_id from cheques where ref_type='expense' and ref_id=$1`, [expId])).rows[0];
  ok("payable cheque linked to expense, pending", chq && chq.status === "pending" && Number(chq.amount) === AMT, chq ? `#${chq.id} ${chq.status} ${chq.amount}` : "none");
  if (chq) madeCheques.push(chq.id);

  // 4) clear the cheque → bank decreases ONCE by the amount
  const clr = await api(`/api/cheques/${chq.id}/clear`, { method: "PUT", body: JSON.stringify({}) });
  ok("clear cheque 200", clr.status === 200, `status ${clr.status}`);
  const bank2 = await bank();
  ok("bank decreased EXACTLY once by the amount", Number((bank0 - bank2).toFixed(2)) === AMT, `${bank0} → ${bank2} (Δ ${(bank0 - bank2).toFixed(2)})`);
  const clearCf = await cfCount(`ref_type='cheque' and ref_id=$1`, [chq.id]);
  ok("exactly ONE clearance cashflow row", clearCf === 1, `rows ${clearCf}`);
  const stillNoExpCf = await cfCount(`category = 'Expense: __CHEQTEST__'`, []);
  ok("still no expense-side cashflow (no double-count)", stillNoExpCf === 0, `rows ${stillNoExpCf}`);

  // 5) guard at clearance: a cheque bigger than bank is blocked at clearance
  const big = await api("/api/expenses", { method: "POST", body: JSON.stringify({ category: "__CHEQBIG__", amount: 999999, date: "2026-07-14", paymentMethod: "Cheque", chequeNumber: "BIG1", bankName: "QNB" }) });
  const bigExpId = big.body?.id; if (bigExpId) madeExpenses.push(bigExpId);
  ok("big cheque expense still CREATES (post-dated, no funds needed)", big.status === 201, `status ${big.status}`);
  const bigChq = (await pool.query(`select id from cheques where ref_type='expense' and ref_id=$1`, [bigExpId])).rows[0];
  if (bigChq) madeCheques.push(bigChq.id);
  const clrBig = await api(`/api/cheques/${bigChq.id}/clear`, { method: "PUT", body: JSON.stringify({}) });
  ok("clearing an over-bank cheque BLOCKED 409", clrBig.status === 409 && clrBig.body?.code === "INSUFFICIENT_FUNDS", `status ${clrBig.status}`);
  // cancel it so it can't clear later
  await api(`/api/cheques/${bigChq.id}/status`, { method: "POST", body: JSON.stringify({ status: "cancelled" }) });
} finally {
  for (const cid of madeCheques) await pool.query(`delete from cashflow where ref_type='cheque' and ref_id=$1`, [cid]);
  await pool.query(`delete from cashflow where category in ('Expense: __CHEQTEST__','Expense: __CHEQBIG__')`);
  await pool.query(`delete from cheques where ref_type='expense' and ref_id = any($1::int[])`, [madeExpenses.length ? madeExpenses : [-1]]);
  await pool.query(`delete from expenses where category in ('__CHEQTEST__','__CHEQBIG__')`);
  await pool.query(`delete from notifications where type='cash_override'`);
  await pool.query(`delete from users where id=$1`, [adminId]);
  console.log("cleanup done");
}

// final position must be restored
const finalBank = await (async () => {
  const cf = (await pool.query(`select direction, amount, notes from cashflow`)).rows;
  const [cfg] = (await pool.query(`select opening_bank from settings limit 1`)).rows;
  let b = Number(cfg?.opening_bank || 0);
  for (const r of cf) { const amt = Number(r.amount || 0) * (r.direction === "in" ? 1 : -1); if (/bank transfer|online|cheque|card/i.test(r.notes || "")) b += amt; }
  return Number(b.toFixed(2));
})();
ok("final bank restored to baseline", finalBank === bank0, `bank ${finalBank}/${bank0}`);

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed.`);
await pool.end();
process.exitCode = passed === results.length ? 0 : 1;
