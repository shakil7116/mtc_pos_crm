// Checks the stocktake path against the real database, then uses it to correct
// the two quantities an earlier cleanup script got wrong.
//
// WRITES: sets stock on a few products at store 1, each with a "count" audit row.
// Run: npx tsx scripts/verify-stock-count.ts
import "dotenv/config";
import { setStockCount, setStockCountBatch, getProductQtyAt, getProducts } from "../server/storage";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};

try {
  const STORE = 1;
  const all: any[] = await getProducts();
  const byId = (id: number) => all.find((p) => p.id === id);

  console.log("\n1. Setting an absolute count (not a delta)");
  const target: any = all.find((p) => p.id === 17) || all[0];
  const startQty = await getProductQtyAt(target.id, STORE);
  const r1 = await setStockCount({ productId: target.id, storeId: STORE, countedQty: 99 });
  ok(r1.after === 99, "stock is now exactly what was counted", `${startQty} -> ${r1.after}`);
  ok((await getProductQtyAt(target.id, STORE)) === 99, "and it persisted");
  ok(r1.variance === 99 - startQty, "variance recorded",
     `system had ${r1.before}, counted 99, variance ${r1.variance >= 0 ? "+" : ""}${r1.variance}`);

  console.log("\n2. Counting the same shelf again is safe (not additive)");
  const r2 = await setStockCount({ productId: target.id, storeId: STORE, countedQty: 99 });
  ok(r2.after === 99, "re-counting 99 leaves 99, not 198", `variance ${r2.variance}`);
  ok(r2.variance === 0, "and reports no discrepancy the second time");

  console.log("\n3. Counting to zero is allowed — 'I looked, there are none'");
  const r3 = await setStockCount({ productId: target.id, storeId: STORE, countedQty: 0 });
  ok(r3.after === 0, "stock set to zero", `variance ${r3.variance}`);

  console.log("\n4. Guards");
  const guards: [string, () => Promise<any>, RegExp][] = [
    ["a negative count is refused", () => setStockCount({ productId: target.id, storeId: STORE, countedQty: -5 }), /negative/i],
    ["a count with no location is refused", () => setStockCount({ productId: target.id, storeId: 0, countedQty: 5 }), /location/i],
    ["a count with no product is refused", () => setStockCount({ productId: 0, storeId: STORE, countedQty: 5 }), /product/i],
    ["a non-numeric count is refused", () => setStockCount({ productId: target.id, storeId: STORE, countedQty: NaN }), /number/i],
  ];
  for (const [label, fn, re] of guards) {
    let msg = "";
    try { await fn(); } catch (e: any) { msg = e.message; }
    ok(re.test(msg), label, msg.slice(0, 60));
  }

  console.log("\n5. Counting a shelf in one go");
  const shelf = all.filter((p) => [1, 17].includes(p.id)).map((p) => ({ productId: p.id, countedQty: 5 }));
  const batch = await setStockCountBatch(STORE, shelf);
  ok(batch.counted === shelf.length, "every line applied", `${batch.counted} of ${shelf.length}`);
  ok(batch.failed.length === 0, "no line failed");

  console.log("\n6. Correcting the two numbers a bad cleanup script left wrong");
  // GYPSUM BOARD 12MM was wrongly reduced by 12 and should read 12.
  // ANGLE GRINDER 4 INCH still carried +12 from a goods-receipt test and should read 6.
  const fixes = [
    { id: 1, name: byId(1)?.name, should: 12 },
    { id: 17, name: byId(17)?.name, should: 6 },
  ];
  for (const f of fixes) {
    const r = await setStockCount({
      productId: f.id, storeId: STORE, countedQty: f.should,
      note: "Correcting a bad automated cleanup (2026-08-27)",
    });
    ok(r.after === f.should, `${f.name} set to ${f.should}`, `was ${r.before}`);
  }

  console.log("\n" + "-".repeat(70));
  console.log(`${pass}/${pass + fail} passed`);
  console.log("\nFinal quantities at store 1:");
  for (const f of fixes) {
    console.log(`  ${f.name}: ${await getProductQtyAt(f.id, STORE)}`);
  }
  process.exit(fail ? 1 : 0);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  process.exit(1);
}
