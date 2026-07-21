import "dotenv/config";
import { db, pool } from "../server/db";
import { stores, products, inventory, documents, documentItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createTransfer, approveTransfer, receiveTransfer, getTransfers } from "../server/storage";

const R: boolean[] = [];
const ok = (n: string, c: boolean, x = "") => { R.push(c); console.log(`   ${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };
const MARK = "__TRTEST__";
const qty = async (pid: number, sid: number) => { const [r] = await db.select().from(inventory).where(and(eq(inventory.productId, pid), eq(inventory.storeId, sid))); return r ? Number(r.qty) : 0; };
const setQ = async (pid: number, sid: number, q: number) => { const [r] = await db.select().from(inventory).where(and(eq(inventory.productId, pid), eq(inventory.storeId, sid))); if (r) await db.update(inventory).set({ qty: String(q) }).where(eq(inventory.id, r.id)); else await db.insert(inventory).values({ productId: pid, storeId: sid, qty: String(q) }); };

async function cleanup() {
  const ids = (await pool.query(`select id from documents where type='TR' and notes=$1`, [MARK])).rows.map((r: any) => r.id);
  if (ids.length) {
    await pool.query(`delete from edit_log where document_id = any($1::int[])`, [ids]);
    await pool.query(`delete from stock_adjustments where reference_id = any($1::int[])`, [ids]);
    await pool.query(`delete from document_items where document_id = any($1::int[])`, [ids]);
    await pool.query(`delete from documents where id = any($1::int[])`, [ids]);
  }
}

async function main() {
  await cleanup();
  const S1 = 1, S2 = 2, W3 = 3; // Store1, Store2, Warehouse3
  const P = (await db.select().from(products).limit(1))[0].id;
  // Warehouse 3 owned by Store 1 for this test
  await db.update(stores).set({ ownerStoreId: S1 } as any).where(eq(stores.id, W3));

  // baselines
  for (const s of [S1, S2, W3]) await setQ(P, s, 100);

  console.log("\n── Same-owner (Store1 → its Warehouse3) = free ──");
  const t1 = await createTransfer({ date: "2026-07-21", fromStoreId: S1, toStoreId: W3, items: [{ productId: P, description: "x", qty: 10, unit: "PCS" }], notes: MARK } as any);
  const full1 = (await getTransfers()).find((t) => t.id === t1.id);
  ok("same-owner crossOwner=false, total 0", full1.crossOwner === false && Number(full1.total) === 0, `cross=${full1.crossOwner} total=${full1.total}`);
  await approveTransfer(t1.id);
  ok("approve → source −10 (100→90)", (await qty(P, S1)) === 90);
  ok("W3 unchanged until receive (100)", (await qty(P, W3)) === 100);
  await receiveTransfer(t1.id);
  ok("receive → dest +10 (100→110)", (await qty(P, W3)) === 110);

  console.log("\n── Cross-owner (Store1 → Store2) = cost ──");
  const cost = Number((await db.select().from(products).where(eq(products.id, P)))[0].costPrice || 0);
  const t2 = await createTransfer({ date: "2026-07-21", fromStoreId: S1, toStoreId: S2, items: [{ productId: P, description: "x", qty: 5, unit: "PCS" }], notes: MARK } as any);
  const full2 = (await getTransfers()).find((t) => t.id === t2.id);
  ok("cross-owner crossOwner=true, total = 5×cost", full2.crossOwner === true && Math.abs(Number(full2.total) - 5 * cost) < 0.01, `total=${full2.total} expect=${5 * cost}`);

  // cleanup: reverse stock + delete
  await setQ(P, S1, 100); await setQ(P, S2, 100); await setQ(P, W3, 100);
  await db.update(stores).set({ ownerStoreId: null } as any).where(eq(stores.id, W3));
  await cleanup();
  const left = (await pool.query(`select count(*)::int n from documents where type='TR' and notes=$1`, [MARK])).rows[0].n;
  ok("cleanup", left === 0);

  const pass = R.filter(Boolean).length;
  console.log(`\n${pass}/${R.length} passed.`);
  await pool.end();
  process.exit(pass === R.length ? 0 : 1);
}
main().catch(async (e) => { console.error("ERR", e); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
