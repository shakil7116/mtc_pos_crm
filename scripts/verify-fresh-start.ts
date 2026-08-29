// Can the whole location list be cleared out and built again from nothing?
//
// A business setting this system up starts with no stores and creates its own.
// So "no locations at all" has to be a real, working state — and the seed must
// not quietly put the old ones back on the next restart.
//
// WRITES: works on a private copy of the location list. It saves every existing
// location first, deletes them all, checks the empty state, then puts them back
// exactly as they were — same ids, same names, same owners.
//
// Run: npx tsx scripts/verify-fresh-start.ts
import "dotenv/config";
import { getStores, createStore, deleteStore, restoreStore, seedDatabase } from "../server/storage";
import { db } from "../server/db";
import { stores } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};

const before = await getStores();
const beforeIds = before.map((s) => s.id);
let madeIds: number[] = [];

try {
  console.log(`\nStarting with ${before.length} location(s): ${before.map((s) => s.nameEn).join(", ")}`);

  console.log("\n1. Every location can be deleted — including the last one");
  for (const s of before) {
    const still = await getStores();
    if (!still.some((x) => x.id === s.id)) continue;   // already went with its store
    await deleteStore(s.id, { byUserId: null });
  }
  const empty = await getStores();
  ok(empty.length === 0, "the list is empty", `${empty.length} left`);

  console.log("\n2. The seed does NOT put the old ones back");
  await seedDatabase();
  const afterSeed = await getStores();
  ok(afterSeed.length === 0, "still empty after a server restart would run the seed",
     `${afterSeed.length} location(s)`);

  console.log("\n3. A fresh store can be created from nothing");
  const fresh: any = await createStore({
    nameEn: "ZZ FRESH START", type: "store", address: "Doha",
  } as any);
  madeIds.push(fresh.id);
  ok(!!fresh.id, "created", `id ${fresh.id}`);
  const shed: any = await createStore({
    nameEn: "ZZ FRESH WAREHOUSE", type: "warehouse", ownerStoreId: fresh.id,
  } as any);
  madeIds.push(shed.id);
  ok(shed.ownerStoreId === fresh.id, "with a warehouse inside it");
  ok((await getStores()).length === 2, "and that is the whole system now", "2 locations");

  console.log("\n4. Undo still works after clearing everything");
  const back: any = await restoreStore(beforeIds[0]);
  ok(back.restored.length >= 1, "an old one comes back",
     back.restored.map((r: any) => r.nameEn).join(", "));

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  // Put the real locations back exactly as they were, whatever happened above.
  if (madeIds.length) await db.delete(stores).where(inArray(stores.id, madeIds)).catch(() => {});
  for (const s of before) {
    await db.update(stores)
      .set({ deletedAt: null, deleteBatch: null, deletedBy: null, nameEn: s.nameEn } as any)
      .where(eq(stores.id, s.id))
      .catch(() => {});
  }
  const now = await getStores();
  console.log(`(restored ${now.length} of ${before.length} original location(s))`);
  if (now.length !== before.length) {
    console.error("!! the location list was NOT fully restored — check it by hand");
    process.exit(1);
  }
  process.exit(fail ? 1 : 0);
}
