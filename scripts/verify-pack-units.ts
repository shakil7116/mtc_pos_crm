// Boxes and pieces, end to end, against the REAL database.
//
//   buy 10 BOX of 12 → 120 pieces on the shelf, at the per-piece cost
//   sell 2 BOX       → 24 pieces off the shelf, and the invoice still says 2 BOX
//   void that sale   → exactly 24 come back, not 2
//   count 5 boxes and 3 loose → 63
//   changing the pack size later must NOT rewrite what a past sale took
//
// WRITES: its own location, product, invoice and receipt. All removed at the end.
//
// Run: npx tsx scripts/verify-pack-units.ts
import "dotenv/config";
import {
  createStore, createProduct, updateProduct, getProduct, getProductStock,
  quickGoodsReceipt, createDocument, voidDocument, setStockCount,
  createSupplier, getUsers, createCustomer,
} from "../server/storage";
import { db } from "../server/db";
import {
  stores, products, inventory, stockAdjustments, stockLosses, documents,
  documentItems, editLog, supplierOrders, suppliers, customers, arrangementNotes,
  arrangementNoteItems, notifications,
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
let supplierId: number | null = null;
let customerId: number | null = null;
const madeDocs: number[] = [];
const madeOrders: number[] = [];

try {
  const [me] = await getUsers();
  if (!me) throw new Error("no user to act as");

  console.log("\nSetting up: tiles kept in PCS, bought in BOX of 12");
  const st: any = await createStore({ nameEn: `ZZ PACK YARD ${stamp}`, type: "store" } as any);
  storeId = st.id;
  const tile: any = await createProduct({
    name: `ZZ TILE ${stamp}`, unit: "PCS", packUnit: "BOX", packSize: "12",
    costPrice: "10", salePrice: "15",
  } as any);
  productId = tile.id;
  ok(tile.packSize == 12, "pack of 12 saved", `1 ${tile.packUnit} = ${tile.packSize} ${tile.unit}`);

  console.log("\n1. A pack setup that would corrupt stock is refused");
  const badSize = await refuses(
    () => createProduct({ name: `ZZ BAD ${stamp}`, unit: "PCS", packUnit: "BOX", packSize: "1" } as any),
    /more than one/i);
  ok(badSize.matched, "a pack of one", badSize.msg.slice(0, 52));
  const noName = await refuses(
    () => createProduct({ name: `ZZ BAD2 ${stamp}`, unit: "PCS", packSize: "12" } as any),
    /needs a name/i);
  ok(noName.matched, "a size with no name");

  console.log("\n2. Buy 10 BOX at QAR 120 a box");
  const sup: any = await createSupplier({ name: `ZZ SUPPLIER ${stamp}` } as any);
  supplierId = sup.id;
  const receipt: any = await quickGoodsReceipt({
    supplierId: sup.id, storeId: st.id, date: today,
    items: [{ productId: tile.id, name: tile.name, qty: 10, unit: "BOX", cost: 120 }],
    createdBy: me.id,
  } as any);
  madeOrders.push(receipt.order.id);
  ok(await getProductStock(tile.id, st.id) === 120, "120 pieces on the shelf, not 10",
     `${await getProductStock(tile.id, st.id)} PCS`);
  const afterCost: any = await getProduct(tile.id);
  ok(Number(afterCost.costPrice) === 10, "and a piece costs QAR 10, not 120",
     `cost ${afterCost.costPrice}`);

  console.log("\n3. Sell 2 BOX");
  const cust: any = await createCustomer({ name: `ZZ CUSTOMER ${stamp}` } as any);
  customerId = cust.id;
  const inv: any = await createDocument({
    type: "INV", date: today, customerId: cust.id, customerName: cust.name,
    storeId: st.id, status: "unpaid", paymentMethod: "Cash",
    items: [{ productId: tile.id, description: tile.name, qty: 2, unit: "BOX", price: 200, amount: 400 }],
    subtotal: "400", total: "400", taxRate: "0", taxAmount: "0", discountAmount: "0",
    createdBy: me.id,
  } as any);
  madeDocs.push(inv.id);
  ok(await getProductStock(tile.id, st.id) === 96, "24 pieces came off the shelf",
     `${await getProductStock(tile.id, st.id)} PCS left`);

  const [line] = await db.select().from(documentItems).where(eq(documentItems.documentId, inv.id));
  ok(Number((line as any).qty) === 2 && String(line.unit) === "BOX",
     "the invoice still says 2 BOX — the customer's copy is unchanged");
  ok(Number((line as any).baseQty) === 24, "and the line remembers it moved 24",
     `baseQty ${(line as any).baseQty}`);

  console.log("\n4. Changing the pack size later must not rewrite history");
  await updateProduct(tile.id, { packSize: "24" } as any);
  await voidDocument(inv.id, me.id);
  ok(await getProductStock(tile.id, st.id) === 120,
     "the void gave back exactly the 24 it took, not 48",
     `${await getProductStock(tile.id, st.id)} PCS`);
  await updateProduct(tile.id, { packSize: "12" } as any);

  console.log("\n5. Count five boxes and three loose");
  const counted: any = await setStockCount({
    productId: tile.id, storeId: st.id, packs: 5, loose: 3, userId: me.id,
  });
  ok(counted.after === 63, "which is 63 pieces", String(counted.after));
  ok(counted.variance === -57, "and the variance is against the 120 that were there",
     String(counted.variance));
  ok(counted.lossValue === 570, "worth QAR 570", String(counted.lossValue));

  console.log("\n6. A product with no pack is untouched by any of this");
  const bag: any = await createProduct({
    name: `ZZ CEMENT ${stamp}`, unit: "BAG", costPrice: "14", salePrice: "18",
  } as any);
  const r2: any = await quickGoodsReceipt({
    supplierId: sup.id, storeId: st.id, date: today,
    items: [{ productId: bag.id, name: bag.name, qty: 40, unit: "BAG", cost: 14 }],
    createdBy: me.id,
  } as any);
  madeOrders.push(r2.order.id);
  ok(await getProductStock(bag.id, st.id) === 40, "40 bags received are 40 bags");
  await db.delete(stockAdjustments).where(eq(stockAdjustments.productId, bag.id)).catch(() => {});
  await db.delete(inventory).where(eq(inventory.productId, bag.id)).catch(() => {});
  await db.delete(products).where(eq(products.id, bag.id)).catch(() => {});

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  if (madeDocs.length) {
    const notes = await db.select().from(arrangementNotes).where(inArray(arrangementNotes.documentId, madeDocs));
    if (notes.length) {
      await db.delete(arrangementNoteItems)
        .where(inArray(arrangementNoteItems.noteId, notes.map((n) => n.id))).catch(() => {});
      await db.delete(arrangementNotes).where(inArray(arrangementNotes.documentId, madeDocs)).catch(() => {});
    }
    await db.delete(editLog).where(inArray(editLog.documentId, madeDocs)).catch(() => {});
    await db.delete(documentItems).where(inArray(documentItems.documentId, madeDocs)).catch(() => {});
    await db.delete(documents).where(inArray(documents.id, madeDocs)).catch(() => {});
  }
  if (madeOrders.length) {
    await db.delete(supplierOrders).where(inArray(supplierOrders.id, madeOrders)).catch(() => {});
  }
  if (productId) {
    await db.delete(stockLosses).where(eq(stockLosses.productId, productId)).catch(() => {});
    await db.delete(stockAdjustments).where(eq(stockAdjustments.productId, productId)).catch(() => {});
    await db.delete(inventory).where(eq(inventory.productId, productId)).catch(() => {});
    await db.delete(products).where(eq(products.id, productId)).catch(() => {});
  }
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId)).catch(() => {});
  if (supplierId) await db.delete(suppliers).where(eq(suppliers.id, supplierId)).catch(() => {});
  if (storeId) {
    await db.delete(notifications).where(eq(notifications.entityId, storeId)).catch(() => {});
    await db.delete(stores).where(eq(stores.id, storeId)).catch(() => {});
  }
  console.log("(cleaned up the throwaway yard, product, receipt and invoice)");
  process.exit(fail ? 1 : 0);
}
