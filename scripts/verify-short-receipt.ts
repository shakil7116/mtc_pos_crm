// The whole short-receipt story against the REAL database:
//   100 sent, 70 arrive → 70 land in stock, 30 become a valued, explained,
//   attributed loss, and an admin is told.
//
// WRITES: builds its own two throwaway locations, its own product, and its own
// transfers, then removes every row it made. Touches nothing that exists.
//
// Run: npx tsx scripts/verify-short-receipt.ts
import "dotenv/config";
import {
  createStore, createProduct, adjustStock, getProductStock,
  createTransfer, approveTransfer, receiveTransfer, getTransferForReceipt,
  getStockLosses,
} from "../server/storage";
import { db } from "../server/db";
import {
  stores, products, inventory, documents, documentItems,
  stockAdjustments, stockLosses, notifications, editLog,
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
const madeStores: number[] = [];
const madeDocs: number[] = [];
let productId: number | null = null;

try {
  console.log("\nSetting up: two locations under different owners, and 100 bags of cement");
  const a: any = await createStore({ nameEn: `ZZ SHORT SRC ${stamp}`, type: "store" } as any);
  const b: any = await createStore({ nameEn: `ZZ SHORT DEST ${stamp}`, type: "store" } as any);
  madeStores.push(a.id, b.id);

  const p: any = await createProduct({
    name: `ZZ CEMENT ${stamp}`, unit: "BAG", costPrice: "14", salePrice: "18",
  } as any);
  productId = p.id;
  await adjustStock(p.id, a.id, 100, "add", "test setup");
  ok(await getProductStock(p.id, a.id) === 100, "source holds 100");

  console.log("\n1. Send all 100");
  const tr: any = await createTransfer({
    fromStoreId: a.id, toStoreId: b.id, date: today,
    items: [{ productId: p.id, description: p.name, qty: 100, unit: "BAG" }],
    createdBy: null,
  } as any);
  madeDocs.push(tr.id);
  await approveTransfer(tr.id, undefined);
  ok(await getProductStock(p.id, a.id) === 0, "stock leaves the source on approval");

  console.log("\n2. The receiving screen can price a shortage before it is confirmed");
  const receipt = await getTransferForReceipt(tr.id);
  const l = receipt.lines[0];
  ok(l.qty === 100, "it knows 100 was sent");
  ok(Number(l.linePrice) === 14 || Number(l.productCost) === 14,
     "and what one bag costs", `line ${l.linePrice}, product ${l.productCost}`);

  console.log("\n3. A shortage cannot be waved through without a reason");
  const noReason = await refuses(
    () => receiveTransfer(tr.id, undefined, { lines: [{ id: l.id, receivedQty: 70 }] }),
    /30 item\(s\) are missing/i);
  ok(noReason.matched, "refused", noReason.msg.slice(0, 78));
  ok(/420\.00/.test(noReason.msg), "and it says what that is worth");
  ok(await getProductStock(p.id, b.id) === 0, "nothing landed while it was refused");

  console.log("\n4. More than was sent is refused too");
  const over = await refuses(
    () => receiveTransfer(tr.id, undefined, {
      lines: [{ id: l.id, receivedQty: 120 }], shortageReason: "trying it on",
    }), /only 100 was sent/i);
  ok(over.matched, "refused", over.msg.slice(0, 70));

  console.log("\n5. Receive the 70 that actually arrived");
  const res: any = await receiveTransfer(tr.id, undefined, {
    lines: [{ id: l.id, receivedQty: 70 }],
    shortageReason: "30 bags left at the gate — driver returning tomorrow",
  });
  ok(res.shortage === true, "reported as short");
  ok(res.totalShort === 30, "30 missing", String(res.totalShort));
  ok(res.lossValue === 420, "worth QAR 420", String(res.lossValue));
  ok(await getProductStock(p.id, b.id) === 70,
     "ONLY 70 landed at the destination — no phantom stock",
     `${await getProductStock(p.id, b.id)} on hand`);

  console.log("\n6. The 30 are written down as a loss");
  const report = await getStockLosses({ start: today, end: today });
  const mine = report.rows.filter((r: any) => r.refId === tr.id);
  ok(mine.length === 1, "one loss row");
  ok(Number(mine[0]?.qty) === 30 && Number(mine[0]?.value) === 420,
     "quantity and value", `${mine[0]?.qty} × ${mine[0]?.unitCost} = ${mine[0]?.value}`);
  ok(mine[0]?.kind === "transfer_shortage", "filed as a transfer shortage");
  ok(/left at the gate/.test(mine[0]?.reason || ""), "with the reason kept");
  ok(mine[0]?.storeId === a.id, "charged to the location it left", mine[0]?.storeName);
  ok(report.byKind?.transfer_shortage?.value >= 420, "and it totals into the report");

  console.log("\n7. An admin is told without anyone opening the transfer list");
  const notes = await db.select().from(notifications).where(eq(notifications.entityId, tr.id));
  const shortNote = notes.find((n: any) => n.type === "stock_shortage");
  ok(!!shortNote, "notification raised", shortNote?.title);
  ok(/420\.00/.test(String(shortNote?.message || "")), "naming the value");

  console.log("\n8. A full receipt still behaves exactly as before");
  await adjustStock(p.id, a.id, 10, "add", "test setup 2");
  const tr2: any = await createTransfer({
    fromStoreId: a.id, toStoreId: b.id, date: today,
    items: [{ productId: p.id, description: p.name, qty: 10, unit: "BAG" }],
    createdBy: null,
  } as any);
  madeDocs.push(tr2.id);
  await approveTransfer(tr2.id, undefined);
  const res2: any = await receiveTransfer(tr2.id, undefined, {});   // no lines at all
  ok(res2.shortage === false, "no shortage claimed");
  ok(await getProductStock(p.id, b.id) === 80, "all 10 landed", "80 total at destination");
  const after = await getStockLosses({ start: today, end: today });
  ok(after.rows.filter((r: any) => r.refId === tr2.id).length === 0, "and no loss invented");

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  // Remove everything this run created, in dependency order.
  if (madeDocs.length) {
    await db.delete(editLog).where(inArray(editLog.documentId, madeDocs)).catch(() => {});
    await db.delete(documentItems).where(inArray(documentItems.documentId, madeDocs)).catch(() => {});
    await db.delete(stockLosses).where(inArray(stockLosses.refId, madeDocs)).catch(() => {});
    await db.delete(notifications).where(inArray(notifications.entityId, madeDocs)).catch(() => {});
    await db.delete(documents).where(inArray(documents.id, madeDocs)).catch(() => {});
  }
  if (productId) {
    await db.delete(stockAdjustments).where(eq(stockAdjustments.productId, productId)).catch(() => {});
    await db.delete(inventory).where(eq(inventory.productId, productId)).catch(() => {});
    await db.delete(products).where(eq(products.id, productId)).catch(() => {});
  }
  if (madeStores.length) {
    await db.delete(stores).where(inArray(stores.id, madeStores)).catch(() => {});
  }
  console.log("(cleaned up the throwaway locations, product and transfers)");
  process.exit(fail ? 1 : 0);
}
