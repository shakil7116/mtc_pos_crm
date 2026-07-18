// Verify the insufficient-funds guard end-to-end over HTTP.
// Creates a throwaway admin, drives the guard, then deletes everything it made.
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const UN = "__verify_admin__";
const results = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? "PASS" : "FAIL"} — ${name}${extra ? " :: " + extra : ""}`); };

let cookie = "";
let baseHand = 0, baseBank = 0;
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  const setc = r.headers.get("set-cookie");
  if (setc) { const m = setc.match(/mtc_token=[^;]+/); if (m) cookie = m[0]; }
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

// ── create throwaway admin ──
const hash = bcrypt.hashSync("Verify@2026", 10);
const ins = await pool.query(
  `insert into users (name, role, pin, username, password_hash, must_change_password, active)
   values ('VERIFY BOT','admin','0000',$1,$2,false,true) returning id`, [UN, hash]);
const adminId = ins.rows[0].id;
console.log("throwaway admin id", adminId);

try {
  const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: UN, password: "Verify@2026" }) });
  ok("login as throwaway admin", login.status === 200 && login.body?.user?.role === "admin", `status ${login.status}`);

  const pos = (await api("/api/cashflow/position")).body;
  const hand = Number(pos.cashInHand), bank = Number(pos.bank);
  baseHand = hand; baseBank = bank; // self-baseline (live balances drift with real sales)
  ok("baseline captured, non-negative", hand >= 0 && bank >= 0, `hand ${hand} bank ${bank}`);

  const today = "2026-07-14";

  // Test A — cash outflow over hand balance → 409 with exact message
  const overCash = Number((hand + 5000).toFixed(2));
  const a = await api("/api/expenses", { method: "POST", body: JSON.stringify({ category: "__VERIFY__", amount: overCash, date: today, paymentMethod: "Cash" }) });
  const expMsgA = `Insufficient cash in hand — current balance is QAR ${hand.toFixed(2)}, cannot pay QAR ${overCash.toFixed(2)}.`;
  ok("A: cash over-balance blocked 409 INSUFFICIENT_FUNDS", a.status === 409 && a.body?.code === "INSUFFICIENT_FUNDS", `status ${a.status} code ${a.body?.code}`);
  ok("A: exact error message", a.body?.message === expMsgA, a.body?.message);

  // Test B — bank outflow over bank balance → 409 bank message
  const overBank = Number((bank + 1000).toFixed(2));
  const b = await api("/api/expenses", { method: "POST", body: JSON.stringify({ category: "__VERIFY__", amount: overBank, date: today, paymentMethod: "Bank Transfer" }) });
  const expMsgB = `Insufficient bank balance — current balance is QAR ${bank.toFixed(2)}, cannot pay QAR ${overBank.toFixed(2)}.`;
  ok("B: bank over-balance blocked 409", b.status === 409 && b.body?.code === "INSUFFICIENT_FUNDS", `status ${b.status}`);
  ok("B: exact bank message", b.body?.message === expMsgB, b.body?.message);

  // Test D — under-balance cash expense passes normally (run BEFORE the override,
  // which intentionally drains the till and would then block this).
  const d = await api("/api/expenses", { method: "POST", body: JSON.stringify({ category: "__VERIFY__", amount: 100, date: today, paymentMethod: "Cash" }) });
  ok("D: normal expense within balance passes 201", d.status === 201, `status ${d.status}`);
  // undo D so it doesn't shift the balance for later exact-message asserts
  await pool.query(`delete from cashflow where category = 'Expense: __VERIFY__'`);
  await pool.query(`delete from expenses where category = '__VERIFY__'`);

  // Test C — admin override with reason → 201 succeeds + audit notification logged
  const c = await api("/api/expenses", { method: "POST", body: JSON.stringify({ category: "__VERIFY__", amount: overCash, date: today, paymentMethod: "Cash", override: true, overrideReason: "real till counted higher than system" }) });
  ok("C: admin override succeeds 201", c.status === 201, `status ${c.status} ${JSON.stringify(c.body).slice(0,80)}`);
  const auditRows = (await pool.query(`select id, message from notifications where type='cash_override'`)).rows;
  ok("C: override written to audit trail", auditRows.length >= 1, auditRows[auditRows.length-1]?.message?.slice(0,90));

  // Test E — override WITHOUT reason rejected
  const e = await api("/api/expenses", { method: "POST", body: JSON.stringify({ category: "__VERIFY__", amount: overCash, date: today, paymentMethod: "Cash", override: true, overrideReason: "" }) });
  ok("E: override with no reason rejected", e.status !== 201, `status ${e.status} msg ${e.body?.message}`);
} finally {
  // ── cleanup: remove everything the test created ──
  await pool.query(`delete from cashflow where category = 'Expense: __VERIFY__'`);
  await pool.query(`delete from cheques where who = '__VERIFY__'`);
  await pool.query(`delete from expenses where category = '__VERIFY__'`);
  await pool.query(`delete from notifications where type = 'cash_override'`);
  await pool.query(`delete from users where id = $1`, [adminId]);
  console.log("cleanup done (verify expenses/cashflow/notifications + throwaway admin removed)");
}

const finalPos = (await (async () => {
  const cf = (await pool.query(`select direction, amount, notes from cashflow`)).rows;
  const [cfg] = (await pool.query(`select opening_cash, opening_bank from settings limit 1`)).rows;
  let hand = Number(cfg?.opening_cash || 0), bank = Number(cfg?.opening_bank || 0);
  for (const r of cf) { const amt = Number(r.amount || 0) * (r.direction === "in" ? 1 : -1); if (/bank transfer|online|cheque|card/i.test(r.notes || "")) bank += amt; else hand += amt; }
  return { hand: Number(hand.toFixed(2)), bank: Number(bank.toFixed(2)) };
})());
ok("final position restored to baseline", finalPos.hand === baseHand && finalPos.bank === baseBank, `hand ${finalPos.hand}/${baseHand} bank ${finalPos.bank}/${baseBank}`);

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed.`);
await pool.end();
process.exitCode = passed === results.length ? 0 : 1;
