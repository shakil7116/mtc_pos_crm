import "dotenv/config";
import { db, pool } from "../server/db";
import { stores, products, inventory } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createTransfer, approveTransfer, receiveTransfer, getTransferSettlement } from "../server/storage";

const R: boolean[] = [];
const ok = (n: string, c: boolean, x = "") => { R.push(c); console.log(`   ${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };
const MARK = "__SETTLETEST__";
const setQ = async (pid: number, sid: number, q: number) => { const [r] = await db.select().from(inventory).where(and(eq(inventory.productId, pid), eq(inventory.storeId, sid))); if (r) await db.update(inventory).set({ qty: String(q) }).where(eq(inventory.id, r.id)); else await db.insert(inventory).values({ productId: pid, storeId: sid, qty: String(q) }); };
async function cleanup() {
  const ids = (await pool.query(`select id from documents where type='TR' and notes=$1`, [MARK])).rows.map((r: any) => r.id);
  if (ids.length) { await pool.query(`delete from edit_log where document_id=any($1::int[])`, [ids]); await pool.query(`delete from stock_adjustments where reference_id=any($1::int[])`, [ids]); await pool.query(`delete from document_items where document_id=any($1::int[])`, [ids]); await pool.query(`delete from documents where id=any($1::int[])`, [ids]); }
}

async function main() {
  await cleanup();
  const S1 = 1, S2 = 2; const P = (await db.select().from(products).limit(1))[0].id;
  const cost = Number((await db.select().from(products).where(eq(products.id, P)))[0].costPrice || 0);
  for (const s of [S1, S2]) await setQ(P, s, 1000);
  const mk = async (from: number, to: number, qty: number) => {
    const t = await createTransfer({ date: "2027-03-15", fromStoreId: from, toStoreId: to, items: [{ productId: P, description: "x", qty, unit: "PCS" }], notes: MARK } as any);
    await approveTransfer(t.id); await receiveTransfer(t.id); return t;
  };
  // Store1 gives Store2 qty 10 (owes cost*10); Store2 gives Store1 qty 3 (owes cost*3)
  await mk(S1, S2, 10);
  await mk(S2, S1, 3);
  const net = (10 - 3) * cost; // Store2 owes Store1
  const s = await getTransferSettlement("2027-03-01", "2027-03-31");
  console.log("\n── Settlement netting ──");
  console.log("  " + JSON.stringify(s.settlements));
  const row = (s.settlements || [])[0];
  ok("one net settlement row", (s.settlements || []).length === 1);
  ok(`Store2 owes Store1 net ${net}`, row && Math.abs(row.amount - net) < 0.01, `amount=${row?.amount} debtor=${row?.debtor} creditor=${row?.creditor}`);

  for (const st of [S1, S2]) await setQ(P, st, 1000);
  await cleanup();
  const left = (await pool.query(`select count(*)::int n from documents where type='TR' and notes=$1`, [MARK])).rows[0].n;
  ok("cleanup", left === 0);
  const pass = R.filter(Boolean).length;
  console.log(`\n${pass}/${R.length} passed.`);
  await pool.end();
  process.exit(pass === R.length ? 0 : 1);
}
main().catch(async (e) => { console.error("ERR", e); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
