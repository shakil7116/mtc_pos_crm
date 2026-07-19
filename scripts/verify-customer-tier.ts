// Verifies the customer behaviour-tier engine end-to-end against the live DB by
// inserting controlled test rows, calling getCustomerOverview() in-process, and
// asserting the spec checkpoints. All rows carry the __TIERTEST__ marker and are
// deleted afterwards. Run: npx tsx scripts/verify-customer-tier.ts
import "dotenv/config";
import { db, pool } from "../server/db";
import { customers, documents, documentItems, payments, cheques } from "@shared/schema";
import { getCustomerOverview } from "../server/storage";

const MARK = "__TIERTEST__";
const R: boolean[] = [];
const ok = (n: string, c: boolean, x = "") => { R.push(c); console.log(`   ${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };

const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
let seq = Date.now();
const num = () => `${MARK}-${seq++}`;

async function mkCust(name: string, creditLimit: number, term: string | null) {
  const [c] = await db.insert(customers).values({ name: `${MARK} ${name}`, type: "contractor", creditLimit: String(creditLimit), paymentTerms: term ?? undefined, active: true }).returning();
  return c.id;
}
async function mkInv(custId: number, date: string, total: number, status: string) {
  const [d] = await db.insert(documents).values({ type: "INV", number: num(), date, customerId: custId, customerName: MARK, storeId: 1, status, subtotal: String(total), total: String(total), transactionMode: "real" }).returning();
  // one line, productId null → cost 0 → margin = full amount (isolates profit ranking)
  await db.insert(documentItems).values({ documentId: d.id, description: "test", qty: "1", unit: "PCS", price: String(total), amount: String(total) });
  return d.id;
}
const payInv = (docId: number, custId: number, amount: number, date: string) =>
  db.insert(payments).values({ documentId: docId, customerId: custId, amount: String(amount), method: "Cash", date, isRefund: false });
const mkChq = (custId: number, amount: number, status: string) =>
  db.insert(cheques).values({ customerId: custId, chequeNumber: num(), bankName: MARK, amount: String(amount), chequeDate: day(15), status, type: "receivable" });

async function cleanup() {
  const ids = (await pool.query(`select id from customers where name like $1`, [MARK + "%"])).rows.map((r: any) => r.id);
  await pool.query(`delete from cheques where bank_name=$1`, [MARK]);
  await pool.query(`delete from document_items where document_id in (select id from documents where customer_name=$1)`, [MARK]);
  await pool.query(`delete from payments where document_id in (select id from documents where customer_name=$1)`, [MARK]);
  await pool.query(`delete from documents where customer_name=$1`, [MARK]);
  if (ids.length) await pool.query(`delete from customers where id = any($1::int[])`, [ids]);
}

async function main() {
  await cleanup(); // clear any prior residue

  // C_BAD — credit, high profit BUT an invoice 65 days past term → must be Bad (override)
  const cBad = await mkCust("BAD", 50000, "30");
  const b1 = await mkInv(cBad, day(-10), 50000, "paid"); await payInv(b1, cBad, 50000, day(-10));
  const b2 = await mkInv(cBad, day(-8), 50000, "paid"); await payInv(b2, cBad, 50000, day(-8));
  await mkInv(cBad, day(-95), 20000, "unpaid"); // 95d old, term 30 → 65d past due

  // C_CASH — cash account, frequent large buyer → Best/Better, never Watch/Bad
  const cCash = await mkCust("CASH", 0, null);
  const h1 = await mkInv(cCash, day(-12), 60000, "paid"); await payInv(h1, cCash, 60000, day(-12));
  const h2 = await mkInv(cCash, day(-6), 60000, "paid"); await payInv(h2, cCash, 60000, day(-6));
  await mkInv(cCash, day(-100), 5000, "unpaid"); // even with an old due, cash stays positive

  // C_WATCH — credit, one invoice 10 days past term (under 60) → Watch
  const cWatch = await mkCust("WATCH", 20000, "30");
  await mkInv(cWatch, day(-40), 8000, "unpaid"); // 40d old, term 30 → 10d past due

  // C_PDC — credit, a pending receivable cheque → Has-PDC badge, no overdue → not Watch/Bad
  const cPdc = await mkCust("PDC", 15000, "30");
  const p1 = await mkInv(cPdc, day(-5), 4000, "paid"); await payInv(p1, cPdc, 4000, day(-5));
  await mkChq(cPdc, 9000, "pending");

  // C_BOUNCE — credit, a bounced cheque on record → Bad
  const cBounce = await mkCust("BOUNCE", 15000, "30");
  const q1 = await mkInv(cBounce, day(-5), 3000, "paid"); await payInv(q1, cBounce, 3000, day(-5));
  await mkChq(cBounce, 7000, "bounced");

  const { rows } = await getCustomerOverview();
  const find = (id: number) => rows.find((r: any) => r.customerId === id) as any;
  const rBad = find(cBad), rCash = find(cCash), rWatch = find(cWatch), rPdc = find(cPdc), rBounce = find(cBounce);

  console.log("\n── Behaviour-tier assertions ──");
  ok("C_BAD credit + 65d past term → Bad (overrides high profit)", rBad?.tier === "bad", `tier=${rBad?.tier} profit=${rBad?.profit} maxPastDue=${rBad?.maxPastDue}`);
  ok("C_BAD financialStatus = credit", rBad?.financialStatus === "credit");
  ok("C_CASH frequent large buyer → Best or Better", ["best", "better"].includes(rCash?.tier), `tier=${rCash?.tier} profit=${rCash?.profit} invWin=${rCash?.invoiceCountWindow}`);
  ok("C_CASH can NEVER be Watch/Bad (cash account)", !["watch", "bad"].includes(rCash?.tier), `tier=${rCash?.tier}`);
  ok("C_CASH financialStatus = cash", rCash?.financialStatus === "cash");
  ok("C_WATCH credit + 10d past term (<60) → Watch", rWatch?.tier === "watch", `tier=${rWatch?.tier} maxPastDue=${rWatch?.maxPastDue}`);
  ok("C_PDC Has-PDC badge (pending cheque) → pdcAmount 9000, hasPdc", rPdc?.hasPdc === true && Math.abs(rPdc?.pdcAmount - 9000) < 0.01, `pdc=${rPdc?.pdcAmount} hasPdc=${rPdc?.hasPdc}`);
  ok("C_PDC no overdue → not Watch/Bad", !["watch", "bad"].includes(rPdc?.tier), `tier=${rPdc?.tier}`);
  ok("C_BOUNCE bounced cheque on record → Bad", rBounce?.tier === "bad", `tier=${rBounce?.tier} bounced=${rBounce?.bouncedPdc}`);

  await cleanup();
  const leftover = (await pool.query(`select count(*)::int n from customers where name like $1`, [MARK + "%"])).rows[0].n;
  ok("cleanup — zero test customers remain", leftover === 0, `remaining=${leftover}`);

  const pass = R.filter(Boolean).length;
  console.log(`\n${pass}/${R.length} checks passed.`);
  await pool.end();
  process.exit(pass === R.length ? 0 : 1);
}

main().catch(async (e) => { console.error("SCRIPT ERROR:", e); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
