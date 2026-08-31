// Closing a location, end to end, against the REAL database.
//
//   the plan says what is inside and what blocks the closure
//   what is found moves out as a real transfer
//   what cannot be found is written off at cost — the closure's real price
//   the place is switched OFF, not deleted, and nothing can trade through it
//
// WRITES: its own two locations and product, all removed at the end.
//
// Run: npx tsx scripts/verify-close-location.ts
import "dotenv/config";
import {
  createStore, createProduct, adjustStock, getProductStock, getStores,
  getClosurePlan, closeLocation, reopenLocation, getStockLosses,
  createTransfer, approveTransfer, adjustStockManual, recordDamage, getUsers,
} from "../server/storage";
import { db } from "../server/db";
import {
  stores, products, inventory, stockAdjustments, stockLosses,
  notifications, documents, documentItems, editLog,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};
const refuses = async (fn: () => Promise<any>, re: RegExp) => {
  let msg = "";
  try { await fn(); } catch (e: any) { msg = e.message || String(e); }
  return { matched: re.test(msg), msg };
};

const stamp = Date.now();
const madeStores: number[] = [];
const madeDocs: number[] = [];
let cementId: number | null = null;
let paintId: number | null = null;

try {
  const [me] = await getUsers();
  if (!me) throw new Error("no user to act as");

  console.log("\nSetting up: a rental shop closing, and Store 1 to receive its stock");
  const shop: any = await createStore({ nameEn: `ZZ RENTAL SHOP ${stamp}`, type: "warehouse" } as any);
  const main: any = await createStore({ nameEn: `ZZ MAIN ${stamp}`, type: "store" } as any);
  madeStores.push(shop.id, main.id);

  const cement: any = await createProduct({
    name: `ZZ CEMENT ${stamp}`, unit: "BAG", costPrice: "14", salePrice: "18",
  } as any);
  const paint: any = await createProduct({
    name: `ZZ PAINT ${stamp}`, unit: "TIN", costPrice: "55", salePrice: "80",
  } as any);
  cementId = cement.id; paintId = paint.id;
  await adjustStock(cement.id, shop.id, 100, "add", "test setup");   // QAR 1,400
  await adjustStock(paint.id, shop.id, 20, "add", "test setup");     // QAR 1,100
  ok(true, "the shop holds QAR 2,500 of stock", "100 bags + 20 tins");

  console.log("\n1. The plan says what is inside");
  const plan1 = await getClosurePlan(shop.id);
  ok(plan1.stockLines === 2, "two products");
  ok(plan1.stockValue === 2500, "worth QAR 2,500", String(plan1.stockValue));
  ok(plan1.canClose === true, "nothing blocking yet");

  console.log("\n2. A transfer still in progress BLOCKS the closure");
  const tr: any = await createTransfer({
    fromStoreId: shop.id, toStoreId: main.id, date: new Date().toISOString().slice(0, 10),
    items: [{ productId: cement.id, description: cement.name, qty: 5, unit: "BAG" }],
    createdBy: me.id,
  } as any);
  madeDocs.push(tr.id);
  const plan2 = await getClosurePlan(shop.id);
  ok(plan2.canClose === false, "cannot close", plan2.blockers[0]?.kind);
  const blocked = await refuses(
    () => closeLocation({ storeId: shop.id, moveToStoreId: main.id, reason: "giving up the shop", actorId: me.id }),
    /still in progress/i);
  ok(blocked.matched, "and the closure is refused", blocked.msg.slice(0, 60));

  // Clear the blocker: approve it and take the stock back out of the way.
  await approveTransfer(tr.id, me.id);
  await db.update(documents).set({ status: "cancelled" } as any).where(eq(documents.id, tr.id));
  await adjustStock(cement.id, shop.id, 5, "add", "test: put the released stock back");
  ok((await getClosurePlan(shop.id)).canClose === true, "blocker cleared");

  console.log("\n3. Close it — 70 of 100 bags found, all 20 tins found");
  const before = await getStockLosses({});
  const st = await closeLocation({
    storeId: shop.id,
    moveToStoreId: main.id,
    counts: [
      { productId: cement.id, foundQty: 70 },
      { productId: paint.id, foundQty: 20 },
    ],
    reason: "rental shop given up end of August",
    actorId: me.id,
  });
  ok(st.movedValue === 70 * 14 + 20 * 55, "moved QAR 2,080", String(st.movedValue));
  ok(st.missingValue === 30 * 14, "written off QAR 420 — the real cost of closing",
     String(st.missingValue));
  ok(st.totalBefore === 2500, "against QAR 2,500 held before", String(st.totalBefore));
  ok(!!st.transferNumber, "the move has a voucher", st.transferNumber || "");

  console.log("\n4. The stock really moved");
  ok(await getProductStock(cement.id, main.id) === 70, "70 bags at the destination");
  ok(await getProductStock(paint.id, main.id) === 20, "20 tins at the destination");
  ok(await getProductStock(cement.id, shop.id) === 0, "nothing left behind", "shop empty");

  console.log("\n5. The 30 missing bags are in the loss ledger");
  const after = await getStockLosses({});
  const mine = after.rows.filter((r: any) => r.refType === "closure" && r.storeId === shop.id);
  ok(mine.length === 1, "one write-off row");
  ok(Number(mine[0]?.value) === 420, "worth QAR 420", String(mine[0]?.value));
  ok(/given up end of August/.test(mine[0]?.reason || ""), "carrying the reason");
  ok(after.totalValue - before.totalValue === 420, "and it adds to the total losses");

  console.log("\n6. The place is switched OFF, not deleted");
  const all = await getStores();
  const row: any = all.find((s) => s.id === shop.id);
  ok(!!row, "still there — every invoice that names it still works");
  ok(row?.active === false, "but closed");

  console.log("\n7. Nothing can trade through a closed location");
  const sale = await refuses(
    () => createTransfer({
      fromStoreId: shop.id, toStoreId: main.id, date: new Date().toISOString().slice(0, 10),
      items: [{ productId: cement.id, description: cement.name, qty: 1, unit: "BAG" }],
      createdBy: me.id,
    } as any), /is closed/i);
  ok(sale.matched, "a transfer through it is refused", sale.msg.slice(0, 58));
  const adj = await refuses(
    () => adjustStockManual({
      productId: cement.id, storeId: shop.id, qtyChange: -1,
      reasonCode: "lost", note: "sneaking one out", actorId: me.id,
    }), /is closed/i);
  ok(adj.matched, "so is a hand adjustment");
  const dmg = await refuses(
    () => recordDamage({ productId: cement.id, storeId: shop.id, qty: 1, reason: "broken", userId: me.id }),
    /is closed/i);
  ok(dmg.matched, "so is a damage entry");

  console.log("\n8. It can be re-opened if that was a mistake");
  await reopenLocation(shop.id);
  ok(((await getStores()).find((s: any) => s.id === shop.id) as any)?.active === true, "open again");

  console.log("\n9. Closing an empty location is just a switch");
  const empty = await closeLocation({
    storeId: shop.id, reason: "nothing left in it", actorId: me.id,
  });
  ok(empty.movedValue === 0 && empty.missingValue === 0, "nothing moved, nothing lost");

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  const pids = [cementId, paintId].filter(Boolean) as number[];
  // Transfers made by the closure itself, plus the one made above.
  const trs = await db.select().from(documents).where(eq(documents.type, "TR"));
  const junk = (trs as any[]).filter((d) => madeStores.includes(d.storeId) || madeStores.includes(d.toStoreId));
  const junkIds = Array.from(new Set([...madeDocs, ...junk.map((d) => d.id)]));
  if (junkIds.length) {
    await db.delete(editLog).where(inArray(editLog.documentId, junkIds)).catch(() => {});
    await db.delete(documentItems).where(inArray(documentItems.documentId, junkIds)).catch(() => {});
    await db.delete(documents).where(inArray(documents.id, junkIds)).catch(() => {});
  }
  if (pids.length) {
    await db.delete(stockLosses).where(inArray(stockLosses.productId, pids)).catch(() => {});
    await db.delete(stockAdjustments).where(inArray(stockAdjustments.productId, pids)).catch(() => {});
    await db.delete(inventory).where(inArray(inventory.productId, pids)).catch(() => {});
    await db.delete(products).where(inArray(products.id, pids)).catch(() => {});
  }
  if (madeStores.length) {
    await db.delete(notifications).where(inArray(notifications.entityId, madeStores)).catch(() => {});
    await db.delete(stores).where(inArray(stores.id, madeStores)).catch(() => {});
  }
  console.log("(cleaned up the throwaway locations, product, transfers and losses)");
  process.exit(fail ? 1 : 0);
}
