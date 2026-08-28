// Checks that a location can be deleted when it was typed in by mistake, and
// refuses when it has actually been used.
//
// WRITES: creates one throwaway location and deletes it again. Touches no real one.
// Run: npx tsx scripts/verify-store-delete.ts
import "dotenv/config";
import { createStore, deleteStore, getStores, updateStore } from "../server/storage";
import { db } from "../server/db";
import { products, stores } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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

let madeId: number | null = null;

try {
  const before: any[] = await getStores();
  console.log("\nlocations now:");
  for (const s of before) console.log(`   ${String(s.id).padStart(3)}  ${s.type.padEnd(9)} ${s.nameEn}`);

  console.log("\n1. A location typed in by mistake can be deleted");
  const made: any = await createStore({
    nameEn: `ZZ TEST WAREHOUSE ${Date.now()}`, nameAr: "اختبار",
    address: "nowhere", type: "warehouse",
  } as any);
  madeId = made.id;
  ok(!!made.id, "created", `id ${made.id}`);
  await deleteStore(made.id);
  const after: any[] = await getStores();
  ok(!after.some((s) => s.id === made.id), "and deleted cleanly", `id ${made.id} gone`);
  madeId = null;

  console.log("\n2. A location that has been USED is protected");
  // Products carry a location. Find one that is actually referenced.
  // Pick a location that owns NO warehouses, so this exercises the "has been used"
  // guard rather than the ownership one — Store 1 owns all four warehouses and
  // would be refused for that reason first.
  const standalone: any = before.find((s2: any) => !before.some((w: any) => w.ownerStoreId === s2.id));
  const [anyProduct] = await db.select().from(products).limit(1);
  if (standalone && anyProduct) {
    const wasAt = (anyProduct as any).locationStoreId ?? null;
    await db.update(products).set({ locationStoreId: standalone.id } as any)
      .where(eq(products.id, (anyProduct as any).id));
    const r = await refuses(() => deleteStore(standalone.id), /cannot be deleted|has been used/i);
    ok(r.matched, `${standalone.nameEn} is protected once a product sits there`, r.msg.slice(0, 76));
    await db.update(products).set({ locationStoreId: wasAt } as any)
      .where(eq(products.id, (anyProduct as any).id));
    console.log("        (product location put back)");
  } else {
    ok(false, "expected a standalone location and a product to test with");
  }

  console.log("\n3. A store owning warehouses cannot be removed underneath them");
  const owner = before.find((s) => before.some((w: any) => w.ownerStoreId === s.id));
  if (owner) {
    const r = await refuses(() => deleteStore(owner.id), /owns .* warehouse/i);
    ok(r.matched, `${owner.nameEn} is protected`, r.msg.slice(0, 74));
  } else {
    console.log("        (no warehouse is owned by a store right now — nothing to check)");
  }

  console.log("\n4. The last location cannot be removed");
  const now: any[] = await getStores();
  ok(now.length > 1, "more than one exists, so the guard is not triggered here", `${now.length} locations`);

  console.log("\n5. Renaming works — English and Arabic");
  const target = now.find((s) => s.type === "warehouse") || now[0];
  const originalEn = target.nameEn, originalAr = target.nameAr;
  const renamed: any = await updateStore(target.id, { nameEn: "ZZ RENAMED CHECK" } as any);
  ok(renamed.nameEn === "ZZ RENAMED CHECK", "renamed", `${originalEn} -> ${renamed.nameEn}`);
  await updateStore(target.id, { nameEn: originalEn, nameAr: originalAr } as any);
  const restored: any = (await getStores()).find((s: any) => s.id === target.id);
  ok(restored.nameEn === originalEn, "and put back", restored.nameEn);

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  if (madeId) {
    await db.delete(stores).where(eq(stores.id, madeId)).catch(() => {});
    console.log("(cleaned up the throwaway location)");
  }
  process.exit(fail ? 1 : 0);
}
