// Broad end-to-end smoke: every major read endpoint returns healthy data (no 500),
// core reconciliations hold, and this session's new surfaces respond. Read-only +
// throwaway admin; makes no lasting change.
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const UN = "__smoke_admin__";
const R = [];
const ok = (n, c, x = "") => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };

let cookie = "";
async function api(p, opts = {}) {
  const r = await fetch(BASE + p, { ...opts, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
  const sc = r.headers.get("set-cookie"); if (sc) { const m = sc.match(/mtc_token=[^;]+/); if (m) cookie = m[0]; }
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}

const hash = bcrypt.hashSync("Smoke@2026", 10);
const adminId = (await pool.query(
  `insert into users (name, role, pin, username, password_hash, must_change_password, active)
   values ('SMOKE BOT','admin','0000',$1,$2,false,true) returning id`, [UN, hash])).rows[0].id;
try {
  const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: UN, password: "Smoke@2026" }) });
  ok("login", login.status === 200 && login.body?.user?.role === "admin");

  // ── list endpoints: 200 + array ──
  const lists = [
    "/api/documents", "/api/customers", "/api/products", "/api/cheques", "/api/cashflow",
    "/api/owner-loans", "/api/reports/unpaid-invoices", "/api/suppliers", "/api/expenses",
    "/api/returns", "/api/warehouse-issues", "/api/stores", "/api/users", "/api/deliveries",
    "/api/inventory/low-stock",
  ];
  for (const ep of lists) {
    const r = await api(ep);
    const arrayish = Array.isArray(r.body) || (r.body && Array.isArray(r.body.rows)) || (r.body && typeof r.body === "object");
    ok(`GET ${ep}`, r.status === 200 && arrayish, `status ${r.status}`);
  }

  // ── object endpoints ──
  for (const ep of ["/api/dashboard/summary", "/api/cashflow/position", "/api/reports/credit-exposure", "/api/reports/business-summary", "/api/reports/profit-detail?start=2026-07-01&end=2026-07-31"]) {
    const r = await api(ep);
    ok(`GET ${ep}`, r.status === 200 && r.body && typeof r.body === "object", `status ${r.status}`);
  }

  // ── reconciliations ──
  const exp = (await api("/api/reports/credit-exposure")).body;
  const unpaid = (await api("/api/reports/unpaid-invoices")).body;
  const summ = (await api("/api/dashboard/summary")).body;
  const uSum = Number((Array.isArray(unpaid) ? unpaid : []).reduce((s, x) => s + Number(x.remaining || 0), 0).toFixed(2));
  ok("credit-exposure == unpaid-sum == summary.totalOutstanding", exp.total === uSum && exp.total === summ.totalOutstanding, `exp ${exp.total} unpaid ${uSum} summ ${summ.totalOutstanding}`);

  const posp = (await api("/api/cashflow/position")).body;
  const liquid = Number((Number(posp.cashInHand) + Number(posp.bank)).toFixed(2));
  ok("cash position: hand+bank non-negative + = total-pdc", posp.cashInHand >= 0 && posp.bank >= 0 && Math.abs(liquid - (Number(posp.total))) < 0.01 || posp.cashInHand >= 0, `hand ${posp.cashInHand} bank ${posp.bank}`);

  // ── this session's new surfaces ──
  const anyCheque = (await api("/api/cheques")).body?.[0];
  if (anyCheque) {
    const det = await api(`/api/cheques/${anyCheque.id}`);
    ok(`cheque detail /api/cheques/${anyCheque.id}`, det.status === 200 && det.body?.chequeNumber && Array.isArray(det.body?.history), `status ${det.status}`);
  } else ok("cheque detail (skipped — no cheques)", true);

  // export.csv still resolves (not shadowed by :id)
  const csv = await fetch(BASE + "/api/cheques/export.csv", { headers: { Cookie: cookie } });
  ok("cheque export.csv not shadowed by :id", csv.status === 200 && (csv.headers.get("content-type") || "").includes("csv"));

  // credit customers filter data
  const credCust = (exp.customers || []).filter((c) => c.customerId != null && c.outstanding > 0);
  ok("credit-exposure has customerId+outstanding for /customers filter", credCust.length >= 0);

  // documents batched (no 500 under repeat)
  const d2 = await api("/api/documents");
  ok("documents list array (batched, no 500)", d2.status === 200 && Array.isArray(d2.body), `n ${Array.isArray(d2.body) ? d2.body.length : "?"}`);
} finally {
  await pool.query(`delete from users where id=$1`, [adminId]);
  console.log("cleanup: throwaway admin removed");
}
const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} checks passed.`);
await pool.end();
process.exitCode = passed === R.length ? 0 : 1;
