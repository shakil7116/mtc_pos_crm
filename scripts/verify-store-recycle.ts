// Checks the whole delete story against the REAL database:
//   delete hides · undo brings it back · a location with stock in it can be
//   erased on purpose, and only after a backup and the exact name typed back.
//
// WRITES: creates its own throwaway store + warehouse + one stock row, and
// removes them again. Touches nothing that already exists.
//
// Run: npx tsx scripts/verify-store-recycle.ts
import "dotenv/config";
import {
  createStore, getStores, deleteStore, restoreStore, getDeletedStores,
  planStorePurge, purgeStoreWithContents, storeReferences, updateStore,
} from "../server/storage";
import { db } from "../server/db";
import { stores, inventory, products, managedLists } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { isUndoable } from "@shared/undo";

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
let shopId: number | null = null;
let shedId: number | null = null;

try {
  console.log("\n1. A store and a warehouse inside it");
  const shop: any = await createStore({
    nameEn: `ZZ TEST STORE ${stamp}`, nameAr: "اختبار", address: "nowhere",
    type: "store", code: "ZZ", phone: "+974 0000 0000",
    openingHours: "Sat–Thu 7am–7pm", crNumber: "CR-TEST",
  } as any);
  shopId = shop.id;
  ok(!!shop.id, "store created", `id ${shop.id}`);
  ok(shop.code === "ZZ" && shop.phone === "+974 0000 0000",
     "the new details are stored", `code ${shop.code}, phone ${shop.phone}`);

  const shed: any = await createStore({
    nameEn: `ZZ TEST WAREHOUSE ${stamp}`, type: "warehouse", ownerStoreId: shop.id,
  } as any);
  shedId = shed.id;
  ok(shed.ownerStoreId === shop.id, "warehouse belongs to it", `owner ${shed.ownerStoreId}`);

  console.log("\n2. The same name twice is refused");
  const dup = await refuses(
    () => createStore({ nameEn: `zz test store ${stamp}`, type: "store" } as any),
    /already exists/i);
  ok(dup.matched, "a duplicate name cannot be created", dup.msg.slice(0, 70));

  console.log("\n2b. Renaming");
  const renamed: any = await updateStore(shed.id, { nameEn: `ZZ RENAMED ${stamp}` } as any);
  ok(renamed.nameEn === `ZZ RENAMED ${stamp}`, "renamed", renamed.nameEn);
  const clash = await refuses(
    () => updateStore(shed.id, { nameEn: `ZZ TEST STORE ${stamp}` } as any), /already exists/i);
  ok(clash.matched, "but not onto a name already in use", clash.msg.slice(0, 60));
  await updateStore(shed.id, { nameEn: `ZZ TEST WAREHOUSE ${stamp}` } as any);

  console.log("\n3. Delete HIDES the store, and takes its warehouse with it");
  const res: any = await deleteStore(shop.id, { byUserId: null });
  ok(res.hidden.length === 2, "both went together", res.hidden.map((h: any) => h.nameEn).join(" + "));
  ok(isUndoable(res.deletedAt), "undo is open", new Date(res.undoUntil).toISOString().slice(0, 16));

  const live = await getStores();
  ok(!live.some((s) => s.id === shop.id || s.id === shed.id),
     "neither shows in the normal list", `${live.length} locations visible`);
  const all = await getStores({ includeDeleted: true });
  ok(all.some((s) => s.id === shop.id), "but the row is still there — nothing was erased");

  const bin = await getDeletedStores();
  ok(bin.some((b: any) => b.id === shop.id && b.undoable), "it is in the recycle bin");

  console.log("\n4. Undo brings the family back");
  const back: any = await restoreStore(shed.id);          // restore the warehouse…
  ok(back.restored.length === 2, "…and the store comes back with it",
     back.restored.map((r: any) => r.nameEn).join(" + "));
  const live2 = await getStores();
  ok(live2.some((s) => s.id === shop.id) && live2.some((s) => s.id === shed.id),
     "both visible again");

  console.log("\n5. Put stock in the warehouse — the test-data problem");
  const [anyProduct] = await db.select().from(products).limit(1);
  if (!anyProduct) throw new Error("no product to test with");
  await db.insert(inventory).values({
    productId: (anyProduct as any).id, storeId: shed.id, qty: "7",
  } as any);
  await db.insert(managedLists).values({
    listKey: "location_areas", value: `ZZ AREA ${stamp}`, meta: { locationId: shed.id },
  } as any);
  const refs = await storeReferences(shed.id);
  ok(refs.length > 0, "the warehouse now counts as used", refs.join(", "));

  console.log("\n6. Deleting it still works — it is hidden, not erased");
  const res2: any = await deleteStore(shed.id, { byUserId: null });
  ok(res2.keptForever === true, "and it is marked as kept for good (it has history)",
     res2.usedBy.join(", "));
  await restoreStore(shed.id);

  console.log("\n7. The preview says exactly what erasing would do");
  const plan = await planStorePurge(shed.id);
  const stock = plan.effects.find((e) => e.table === "inventory");
  const areas = plan.effects.find((e) => e.table === "managed_lists");
  ok(!!stock && stock.action === "delete", "stock in it would be deleted", `${stock?.count} row(s)`);
  ok(!!areas && areas.action === "delete", "its areas/racks/shelves would go too", `${areas?.count} row(s)`);
  ok(!plan.tooBig, "and it is small enough to be allowed", `${plan.totalRows} rows`);

  console.log("\n8. The wrong name erases nothing");
  const wrong = await refuses(
    () => purgeStoreWithContents(shed.id, "something else"), /Type the name exactly/i);
  ok(wrong.matched, "refused", wrong.msg.slice(0, 70));
  ok(!!(await getStores()).find((s) => s.id === shed.id), "the warehouse is untouched");

  console.log("\n9. The right name erases it — after a backup");
  const done = await purgeStoreWithContents(shed.id, `ZZ TEST WAREHOUSE ${stamp}`);
  ok(/\.json\.gz/.test(done.backupFile), "a backup was taken first", done.backupFile);
  const gone = await getStores({ includeDeleted: true });
  ok(!gone.some((s) => s.id === shed.id), "the warehouse is gone for real");
  const leftoverStock = await db.select().from(inventory).where(eq(inventory.storeId, shed.id));
  ok(leftoverStock.length === 0, "its stock rows went with it");
  shedId = null;

  console.log("\n10. The store it belonged to is untouched");
  ok(!!(await getStores()).find((s) => s.id === shop.id), "the store is still there");

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  // Clean up whatever survived, whichever way the run ended.
  const ids = [shopId, shedId].filter(Boolean) as number[];
  if (ids.length) {
    await db.delete(inventory).where(inArray(inventory.storeId, ids)).catch(() => {});
    await db.delete(stores).where(inArray(stores.id, ids)).catch(() => {});
    console.log("(cleaned up the throwaway locations)");
  }
  process.exit(fail ? 1 : 0);
}
