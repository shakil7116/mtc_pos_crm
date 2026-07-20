// Verifies per-line-item location: an invoice with items from 2 different locations
// must deduct stock from EACH respective location (not one blanket store), and persist
// each line's location. Self-cleaning. Run: npx tsx scripts/verify-quicksale-location.ts
import "dotenv/config";
import { db, pool } from "../server/db";
import { products, stores as storesT, inventory, documents, documentItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createDocument } from "../server/storage";

const R: boolean[] = [];
const ok = (n: string, c: boolean, x = "") => { R.push(c); console.log(`   ${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };

async function qty(pid: number, sid: number): Promise<number> {
  const [r] = await db.select().from(inventory).where(and(eq(inventory.productId, pid), eq(inventory.storeId, sid)));
  return r ? Number(r.qty) : 0;
}
async function setQty(pid: number, sid: number, q: number) {
  const [r] = await db.select().from(inventory).where(and(eq(inventory.productId, pid), eq(inventory.storeId, sid)));
  if (r) await db.update(inventory).set({ qty: String(q) }).where(eq(inventory.id, r.id));
  else await db.insert(inventory).values({ productId: pid, storeId: sid, qty: String(q) });
}

async function main() {
  const prods = await db.select().from(products).limit(2);
  const strs = await db.select().from(storesT).limit(2);
  if (prods.length < 2 || strs.length < 2) { console.log("need >=2 products and >=2 stores"); process.exit(1); }
  const [P1, P2] = prods, [S1, S2] = strs;

  // baseline: 100 each in both stores
  const restore: [number, number, number][] = [];
  for (const p of [P1, P2]) for (const s of [S1, S2]) { restore.push([p.id, s.id, await qty(p.id, s.id)]); await setQty(p.id, s.id, 100); }

  console.log(`\nP1=${P1.id} P2=${P2.id} · S1=${S1.id}(${S1.nameEn}) S2=${S2.id}(${S2.nameEn})`);

  // Invoice: P1 from S1 (qty 5), P2 from S2 (qty 3)
  const doc = await createDocument({
    type: "INV", date: new Date().toISOString().slice(0, 10), customerName: "__LOCTEST__", storeId: S1.id,
    transactionMode: "real", status: "paid", discountType: "QAR", discountAmount: "0",
    subtotal: "0", taxRate: "0", taxAmount: "0", total: "0",
    items: [
      { productId: P1.id, sku: P1.sku, description: "l1", qty: "5", unit: "PCS", price: "0", discountType: "QAR", discountAmount: "0", amount: "0", locationStoreId: S1.id },
      { productId: P2.id, sku: P2.sku, description: "l2", qty: "3", unit: "PCS", price: "0", discountType: "QAR", discountAmount: "0", amount: "0", locationStoreId: S2.id },
    ],
  } as any);

  console.log("\n── Per-line location deduction ──");
  ok("P1 deducted from S1 (100→95)", (await qty(P1.id, S1.id)) === 95, `S1=${await qty(P1.id, S1.id)}`);
  ok("P1 UNTOUCHED in S2 (100)", (await qty(P1.id, S2.id)) === 100, `S2=${await qty(P1.id, S2.id)}`);
  ok("P2 deducted from S2 (100→97)", (await qty(P2.id, S2.id)) === 97, `S2=${await qty(P2.id, S2.id)}`);
  ok("P2 UNTOUCHED in S1 (100)", (await qty(P2.id, S1.id)) === 100, `S1=${await qty(P2.id, S1.id)}`);

  const its = await db.select().from(documentItems).where(eq(documentItems.documentId, doc.id));
  const l1 = its.find((i) => i.productId === P1.id), l2 = its.find((i) => i.productId === P2.id);
  ok("line P1 stored location = S1", l1?.locationStoreId === S1.id, `got ${l1?.locationStoreId}`);
  ok("line P2 stored location = S2", l2?.locationStoreId === S2.id, `got ${l2?.locationStoreId}`);

  // cleanup: delete doc + its stock adjustments effect already applied → restore baselines, delete rows
  await pool.query(`delete from stock_adjustments where reference_id=$1`, [doc.id]);
  await pool.query(`delete from document_items where document_id=$1`, [doc.id]);
  await pool.query(`delete from documents where id=$1`, [doc.id]);
  for (const [pid, sid, q] of restore) await setQty(pid, sid, q);
  const clean = (await pool.query(`select count(*)::int n from documents where customer_name=$1`, ["__LOCTEST__"])).rows[0].n;
  ok("cleanup — doc removed, stock restored", clean === 0, `remaining=${clean}`);

  const pass = R.filter(Boolean).length;
  console.log(`\n${pass}/${R.length} checks passed.`);
  await pool.end();
  process.exit(pass === R.length ? 0 : 1);
}
main().catch(async (e) => { console.error("SCRIPT ERROR:", e); try { await pool.end(); } catch {} process.exit(1); });
