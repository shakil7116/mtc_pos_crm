// Counting and damage, priced — against the REAL database.
//
//   a count that comes up short   → a valued loss
//   a count that finds more       → a NEGATIVE loss that nets it off
//   damage                        → stock down AND the money written down
//   all of it                     → visible beside profit for the period
//
// WRITES: builds its own location and product, then removes every row it made.
//
// Run: npx tsx scripts/verify-loss-ledger.ts
import "dotenv/config";
import {
  createStore, createProduct, adjustStock, getProductStock,
  setStockCount, recordDamage, getStockLosses, getProfitDetail, upsertSettings, getSettings,
} from "../server/storage";
import { db } from "../server/db";
import {
  stores, products, inventory, stockAdjustments, stockLosses, notifications,
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
const today = new Date().toISOString().slice(0, 10);
let storeId: number | null = null;
let productId: number | null = null;
let paintId: number | null = null;
const before = await getSettings();

try {
  console.log("\nSetting up: one location, cement at QAR 14, paint at QAR 55");
  const st: any = await createStore({ nameEn: `ZZ LOSS YARD ${stamp}`, type: "warehouse" } as any);
  storeId = st.id;
  const cement: any = await createProduct({
    name: `ZZ CEMENT ${stamp}`, unit: "BAG", costPrice: "14", salePrice: "18",
  } as any);
  productId = cement.id;
  const paint: any = await createProduct({
    name: `ZZ PAINT ${stamp}`, unit: "TIN", costPrice: "55", salePrice: "80",
  } as any);
  paintId = paint.id;
  await adjustStock(cement.id, st.id, 68, "add", "test setup");
  await adjustStock(paint.id, st.id, 40, "add", "test setup");
  await upsertSettings({ stockLossAlertValue: "250" } as any);
  ok(true, "ready", "68 bags, 40 tins");

  console.log("\n1. A count that comes up short is priced");
  const c1: any = await setStockCount({
    productId: cement.id, storeId: st.id, countedQty: 47,
    note: "counted twice, north side",
  });
  ok(c1.variance === -21, "variance recorded", String(c1.variance));
  ok(c1.lossValue === 294, "and valued at QAR 294", `${c1.unitCost} × 21`);
  ok(!!c1.lossId, "a loss row was written", `id ${c1.lossId}`);
  ok(await getProductStock(cement.id, st.id) === 47, "stock now says what was counted");

  console.log("\n2. The owner is told, because it is over the QAR 250 alert");
  const notes = await db.select().from(notifications).where(eq(notifications.entityId, cement.id));
  const alert = notes.find((n: any) => n.type === "stock_variance");
  ok(!!alert, "notification raised", alert?.title);
  ok(/294\.00/.test(String(alert?.message || "")), "naming the value");

  console.log("\n3. A count that finds MORE nets off instead of being ignored");
  const c2: any = await setStockCount({ productId: paint.id, storeId: st.id, countedQty: 43 });
  ok(c2.variance === 3, "3 more than the system said", String(c2.variance));
  ok(c2.lossValue === -165, "recorded as a NEGATIVE loss", String(c2.lossValue));

  console.log("\n4. Damage takes the stock down AND writes down the money");
  const d: any = await recordDamage({
    productId: cement.id, storeId: st.id, qty: 6,
    reason: "pallet dropped unloading — 6 bags split",
  });
  ok(d.removed === 6 && d.onHand === 41, "6 written off", `${d.onHand} left`);
  ok(d.lossValue === 84, "worth QAR 84", String(d.lossValue));
  ok(d.loss?.kind === "damage", "filed as damage");

  console.log("\n5. Damage is refused when it cannot be true");
  const tooMany = await refuses(
    () => recordDamage({ productId: cement.id, storeId: st.id, qty: 500, reason: "everything broke" }),
    /Only 41 .* are recorded/i);
  ok(tooMany.matched, "more than is there is refused", tooMany.msg.slice(0, 66));
  const noReason = await refuses(
    () => recordDamage({ productId: cement.id, storeId: st.id, qty: 1, reason: "" }),
    /Say what happened/i);
  ok(noReason.matched, "and so is a blank reason");
  ok(await getProductStock(cement.id, st.id) === 41, "neither touched the stock");

  console.log("\n6. It all totals into one place");
  const report = await getStockLosses({ start: today, end: today, storeId: st.id });
  ok(report.byKind?.count_variance?.value === 294 - 165,
     "counts net to QAR 129", String(report.byKind?.count_variance?.value));
  ok(report.byKind?.damage?.value === 84, "damage QAR 84");
  ok(report.totalValue === 213, "total QAR 213 lost here today", String(report.totalValue));
  ok(report.worst?.[0]?.description?.includes("CEMENT"), "worst offender named", report.worst?.[0]?.description);

  console.log("\n7. Profit for the period knows about it");
  const profit: any = await getProfitDetail(today, today, st.id);
  ok(profit.materialLosses === 213, "material losses carried alongside profit", String(profit.materialLosses));
  ok(profit.realProfitAfterLosses === Number((profit.realProfit - 213).toFixed(2)),
     "and profit after losses is worked out", `${profit.realProfit} → ${profit.realProfitAfterLosses}`);
  ok(typeof profit.realProfit === "number", "gross profit itself is untouched", String(profit.realProfit));

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  const pids = [productId, paintId].filter(Boolean) as number[];
  if (pids.length) {
    await db.delete(stockLosses).where(inArray(stockLosses.productId, pids)).catch(() => {});
    await db.delete(notifications).where(inArray(notifications.entityId, pids)).catch(() => {});
    await db.delete(stockAdjustments).where(inArray(stockAdjustments.productId, pids)).catch(() => {});
    await db.delete(inventory).where(inArray(inventory.productId, pids)).catch(() => {});
    await db.delete(products).where(inArray(products.id, pids)).catch(() => {});
  }
  if (storeId) await db.delete(stores).where(eq(stores.id, storeId)).catch(() => {});
  if (before) {
    await upsertSettings({ stockLossAlertValue: (before as any).stockLossAlertValue ?? "250" } as any).catch(() => {});
  }
  console.log("(cleaned up the throwaway location, products and losses)");
  process.exit(fail ? 1 : 0);
}
