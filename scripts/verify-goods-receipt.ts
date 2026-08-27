// End-to-end check of the Quick Goods Receipt path against the real database.
//
// WRITES: creates one supplier order (marked received), moves stock, and creates
// one throwaway product. Every id it touches is printed so it can be cleaned up.
// Run: npx tsx scripts/verify-goods-receipt.ts
import "dotenv/config";
import {
  quickGoodsReceipt, getProducts, getProductQtyAt, getSuppliers, updateProduct,
} from "../server/storage";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};

try {
  const suppliers = await getSuppliers();
  const products = await getProducts();
  if (!suppliers.length) throw new Error("no suppliers to test with");
  const supplierId = suppliers[0].id;
  const storeId = 1;
  const existing: any = products[0];
  const throwawayName = `ZZ TEST RECEIPT ITEM ${Date.now()}`;

  const qtyBefore = await getProductQtyAt(existing.id, storeId);
  const costBefore = Number(existing.costPrice || 0);
  const newCost = Number((costBefore + 3.5).toFixed(2));

  console.log(`\nbaseline: ${existing.name}`);
  console.log(`  qty at store ${storeId}: ${qtyBefore} · cost ${costBefore}`);

  console.log("\n1. Receive a delivery with no purchase order");
  const r = await quickGoodsReceipt({
    supplierId, storeId,
    items: [
      { productId: existing.id, name: existing.name, qty: 12, cost: newCost },
      { name: throwawayName, qty: 5, unit: "PCS", cost: 20, salePrice: 30, category: "TEST" },
    ],
    supplierInvoiceNumber: "TEST-GRN-001",
    paymentTermsDays: 30,
    notes: "Automated verification of quickGoodsReceipt",
  });
  ok(!!r.poNumber, "a PO number was issued", r.poNumber);
  ok(r.order.status === "received", "the order is marked fully received", r.order.status);
  ok(r.totalValue > 0, "receipt value computed", `QAR ${r.totalValue}`);

  console.log("\n2. Stock actually moved");
  const qtyAfter = await getProductQtyAt(existing.id, storeId);
  ok(qtyAfter === qtyBefore + 12, "existing product went up by exactly 12",
     `${qtyBefore} -> ${qtyAfter}`);

  console.log("\n3. An unknown item seeded the catalogue instead of blocking");
  ok(r.productsCreated.length === 1, "one product created", r.productsCreated[0]?.name);
  const created = r.productsCreated[0];
  if (created) {
    const newQty = await getProductQtyAt(created.id, storeId);
    ok(newQty === 5, "and its stock landed", `qty ${newQty}`);
  }

  console.log("\n4. Cost refreshed to what was actually paid");
  ok(r.costsUpdated.some((c) => c.id === existing.id),
     "standing cost updated", `${costBefore} -> ${newCost}`);
  const reread: any = (await getProducts()).find((p: any) => p.id === existing.id);
  ok(Math.abs(Number(reread.costPrice) - newCost) < 0.005, "and it persisted",
     `now ${reread.costPrice}`);

  console.log("\n5. Guards");
  let threw = "";
  try {
    await quickGoodsReceipt({ supplierId, storeId, items: [] });
  } catch (e: any) { threw = e.message; }
  ok(/at least one line/i.test(threw), "an empty receipt is refused");

  threw = "";
  try {
    await quickGoodsReceipt({ supplierId, storeId: 0, items: [{ name: "X", qty: 1 }] });
  } catch (e: any) { threw = e.message; }
  ok(/location|store/i.test(threw), "a receipt with no destination is refused");

  threw = "";
  try {
    await quickGoodsReceipt({ supplierId, storeId, items: [{ name: "X", qty: 1, cost: -5 }] });
  } catch (e: any) { threw = e.message; }
  ok(/negative/i.test(threw), "a negative cost is refused");

  // Put the standing cost back so the test does not skew reporting.
  await updateProduct(existing.id, { costPrice: String(costBefore) } as any);
  console.log(`\n(restored ${existing.name} cost to ${costBefore})`);

  console.log("\n" + "─".repeat(70));
  console.log(`${pass}/${pass + fail} passed`);
  console.log(`\nCREATED (test data — clean up before go-live):`);
  console.log(`  supplier order ${r.order.id} (${r.poNumber})`);
  console.log(`  product ${created?.id} "${created?.name}"`);
  console.log(`  stock: ${existing.name} +12 at store ${storeId}, ${created?.name} +5`);
  process.exit(fail ? 1 : 0);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  process.exit(1);
}
