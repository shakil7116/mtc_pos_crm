import "dotenv/config";
import { db, pool } from "../server/db";
import { products, inventory, documents } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createTransfer, approveTransfer, receiveTransfer, getTransfers, getTransferSettlement } from "../server/storage";

const R: boolean[] = [];
const ok = (n: string, c: boolean, x = "") => { R.push(c); console.log(`   ${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };
const MARK = "__RETTEST__";
const setQ = async (pid: number, sid: number, q: number) => { const [r] = await db.select().from(inventory).where(and(eq(inventory.productId, pid), eq(inventory.storeId, sid))); if (r) await db.update(inventory).set({ qty: String(q) }).where(eq(inventory.id, r.id)); else await db.insert(inventory).values({ productId: pid, storeId: sid, qty: String(q) }); };
async function cleanup() { const ids = (await pool.query(`select id from documents where type='TR' and notes=$1`, [MARK])).rows.map((r: any) => r.id); if (ids.length) { await pool.query(`delete from edit_log where document_id=any($1::int[])`, [ids]); await pool.query(`delete from stock_adjustments where reference_id=any($1::int[])`, [ids]); await pool.query(`delete from document_items where document_id=any($1::int[])`, [ids]); await pool.query(`delete from documents where id=any($1::int[])`, [ids]); } }

async function main() {
  await cleanup();
  const S1 = 1, S2 = 2, P = (await db.select().from(products).limit(1))[0].id;
  const cost = Number((await db.select().from(products).where(eq(products.id, P)))[0].costPrice || 0);
  for (const s of [S1, S2]) await setQ(P, s, 1000);
  const flow = async (from: number, to: number, qty: number, uid: number) => { const t = await createTransfer({ date: "2027-05-10", fromStoreId: from, toStoreId: to, items: [{ productId: P, description: "angle valve", qty, unit: "PCS" }], notes: MARK } as any); await approveTransfer(t.id, uid); await receiveTransfer(t.id, uid); return t.id; };
  // take 25 (Store1→Store2), return 15 (Store2→Store1)
  const takeId = await flow(S1, S2, 25, 4);
  await flow(S2, S1, 15, 5);

  const trs = await getTransfers();
  const take = trs.find((t) => t.id === takeId);
  ok("receivedByName recorded on receive", !!take.receivedByName, `receivedBy=${take.receivedByName}`);

  const s = await getTransferSettlement("2027-05-01", "2027-05-31");
  const row = (s.settlements || [])[0];
  const net = (25 - 15) * cost;
  console.log("  settlement:", JSON.stringify(s.settlements));
  ok(`net after 25 take − 15 return = 10×cost (${net}); Store2 owes Store1`, row && Math.abs(row.amount - net) < 0.01 && row.debtor.includes("Store 2") && row.creditor.includes("Store 1"), `amount=${row?.amount}`);

  for (const st of [S1, S2]) await setQ(P, st, 1000);
  await cleanup();
  const pass = R.filter(Boolean).length;
  console.log(`\n${pass}/${R.length} passed.`);
  await pool.end();
  process.exit(pass === R.length ? 0 : 1);
}
main().catch(async (e) => { console.error("ERR", e); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
