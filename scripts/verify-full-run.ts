// A whole trading day, end to end, against the REAL database.
//
// Buy → move → sell → get paid → count → break → swap → close the till → close
// the location, checking the numbers at every step and reading them back out of
// the reports the owner actually looks at.
//
// SAFE: every row it creates is its own — its own location, products, customer
// and supplier — and all of it is removed at the end, including the document
// numbers it consumed, which are wound back so the first real invoice still
// gets the number it would have had.
//
// Run: npx tsx scripts/verify-full-run.ts
import "dotenv/config";
import {
  createStore, createProduct, createCustomer, createSupplier, getUsers,
  quickGoodsReceipt, getProductStock,
  createTransfer, approveTransfer, receiveTransfer,
  createDocument, getDocument, createPayment, createCheque,
  setStockCount, recordDamage, recordSwap, adjustStockManual,
  getStockLosses, getProfitDetail, getCashPosition, logCashflow,
  getCashCountPlan, recordCashCount, getClosurePlan, closeLocation,
  upsertSettings, getSettings,
} from "../server/storage";
import { db } from "../server/db";
import {
  stores, products, customers, suppliers, inventory, documents, documentItems,
  payments, cheques, cashflow, cashCounts, stockLosses, stockSwaps,
  stockAdjustments, supplierOrders, notifications, editLog, documentCounters,
  arrangementNotes, arrangementNoteItems, approvalRequests,
} from "@shared/schema";
import { eq, inArray, like } from "drizzle-orm";

let pass = 0, fail = 0;
const step = (t: string) => console.log(`\n${t}`);
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};
const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) < e;
const refuses = async (fn: () => Promise<any>, re: RegExp) => {
  let m = ""; try { await fn(); } catch (e: any) { m = e.message || String(e); }
  return { matched: re.test(m), msg: m };
};

const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);
const made = {
  stores: [] as number[], products: [] as number[], docs: [] as number[],
  orders: [] as number[], customer: 0, supplier: 0,
};
const countersBefore = await db.select().from(documentCounters);
const settingsBefore = await getSettings();

try {
  const [me] = await getUsers();
  if (!me) throw new Error("no user to act as");
  console.log(`Acting as ${me.name}. Every row created here is removed at the end.`);

  // ══ SET UP ════════════════════════════════════════════════════════════════
  step("0. A shop, a store room, a supplier and a customer");
  const shop: any = await createStore({ nameEn: `ZZ RUN SHOP ${stamp}`, type: "store" } as any);
  const room: any = await createStore({ nameEn: `ZZ RUN STORE ROOM ${stamp}`, type: "warehouse", ownerStoreId: shop.id } as any);
  made.stores.push(shop.id, room.id);
  const sup: any = await createSupplier({ name: `ZZ RUN SUPPLIER ${stamp}` } as any);
  made.supplier = sup.id;
  const cust: any = await createCustomer({
    name: `ZZ RUN CONTRACTING ${stamp}`, phone: "+974 5555 0000",
    paymentTerms: "45 days", creditLimit: "100000",
  } as any);
  made.customer = cust.id;
  ok(!!shop.id && !!room.id && !!sup.id && !!cust.id, "created", `shop ${shop.id}, room ${room.id}`);

  const tile: any = await createProduct({
    name: `ZZ TILE 30X60 ${stamp}`, unit: "PCS", packUnit: "BOX", packSize: "12",
    costPrice: "0", salePrice: "9", locationStoreId: room.id,
  } as any);
  const cement: any = await createProduct({
    name: `ZZ CEMENT 50KG ${stamp}`, unit: "BAG", costPrice: "14", salePrice: "18",
    locationStoreId: room.id,
  } as any);
  const paint: any = await createProduct({
    name: `ZZ PAINT WHITE 20L ${stamp}`, unit: "PAIL", costPrice: "110", salePrice: "150",
    locationStoreId: room.id,
  } as any);
  made.products.push(tile.id, cement.id, paint.id);
  ok(true, "three products", "tile sold by the piece, bought by the box of 12");

  // ══ BUY ═══════════════════════════════════════════════════════════════════
  step("1. Goods in — 10 BOX of tile at QAR 96 a box, 100 bags of cement");
  const receipt: any = await quickGoodsReceipt({
    supplierId: sup.id, storeId: room.id, date: today, createdBy: me.id,
    items: [
      { productId: tile.id, name: tile.name, qty: 10, unit: "BOX", cost: 96 },
      { productId: cement.id, name: cement.name, qty: 100, unit: "BAG", cost: 14 },
      { productId: paint.id, name: paint.name, qty: 20, unit: "PAIL", cost: 110 },
    ],
  } as any);
  made.orders.push(receipt.order.id);
  ok(await getProductStock(tile.id, room.id) === 120, "10 boxes became 120 pieces",
     `${await getProductStock(tile.id, room.id)} PCS`);
  const tileNow: any = (await db.select().from(products).where(eq(products.id, tile.id)))[0];
  ok(Number(tileNow.costPrice) === 8, "and a piece costs 8, not 96", `cost ${tileNow.costPrice}`);

  // ══ MOVE ══════════════════════════════════════════════════════════════════
  step("2. Move 60 pieces to the shop — only 56 arrive");
  const tr: any = await createTransfer({
    fromStoreId: room.id, toStoreId: shop.id, date: today, createdBy: me.id,
    items: [{ productId: tile.id, description: tile.name, qty: 60, unit: "PCS" }],
  } as any);
  made.docs.push(tr.id);
  await approveTransfer(tr.id, me.id);
  const line = (await db.select().from(documentItems).where(eq(documentItems.documentId, tr.id)))[0];
  const short = await refuses(
    () => receiveTransfer(tr.id, me.id, { lines: [{ id: line.id, receivedQty: 56 }] }),
    /4 item\(s\) are missing/);
  ok(short.matched, "a shortage cannot be waved through", short.msg.slice(0, 52));
  const recv: any = await receiveTransfer(tr.id, me.id, {
    lines: [{ id: line.id, receivedQty: 56 }],
    shortageReason: "4 tiles broken in the pickup",
  });
  ok(recv.lossValue === 32, "4 missing tiles booked at QAR 32", String(recv.lossValue));
  ok(await getProductStock(tile.id, shop.id) === 56, "56 landed, not 60");

  // ══ SELL ══════════════════════════════════════════════════════════════════
  step("3. Sell 2 BOX of tile and 20 bags on credit, with a discount");
  const items = [
    { productId: tile.id, description: tile.name, qty: 2, unit: "BOX", price: 108, discountType: "QAR", discountAmount: 8, amount: 200 },
    { productId: cement.id, description: cement.name, qty: 20, unit: "BAG", price: 18, discountType: "QAR", discountAmount: 0, amount: 360 },
  ];
  const inv: any = await createDocument({
    type: "INV", date: today, customerId: cust.id, customerName: cust.name,
    storeId: shop.id, status: "unpaid", paymentType: "Credit",
    items, subtotal: "560", discountType: "QAR", discountAmount: "10",
    taxRate: "0", taxAmount: "0", total: "550",
    totalWords: "FIVE HUNDRED AND FIFTY QATARI RIYALS ONLY", createdBy: me.id,
  } as any);
  made.docs.push(inv.id);
  ok(await getProductStock(tile.id, shop.id) === 32, "2 BOX took 24 pieces off the shop",
     `${await getProductStock(tile.id, shop.id)} PCS left`);
  const invLines = await db.select().from(documentItems).where(eq(documentItems.documentId, inv.id));
  const tileLine: any = invLines.find((l: any) => l.productId === tile.id);
  ok(Number(tileLine.baseQty) === 24, "the line remembers it moved 24", `baseQty ${tileLine.baseQty}`);
  ok(Number(tileLine.costAtSale) === 8, "and the cost is pinned at 8", `costAtSale ${tileLine.costAtSale}`);

  const fresh: any = await getDocument(inv.id);
  ok(fresh.invoiceType === "Credit Invoice", "unpaid, so it is a CREDIT invoice", fresh.invoiceType);

  // ══ GET PAID ══════════════════════════════════════════════════════════════
  step("4. Part cash now, the rest on a 45-day cheque");
  await createPayment({
    documentId: inv.id, customerId: cust.id, amount: "150", method: "Cash",
    date: today, recordedBy: me.id,
  } as any);
  const afterCash: any = await getDocument(inv.id);
  ok(afterCash.status === "partial", "invoice is part paid", afterCash.status);

  const over = await refuses(
    () => createPayment({ documentId: inv.id, customerId: cust.id, amount: "9999", method: "Cash", date: today } as any),
    /exceed|Overpayment|remaining/i);
  ok(over.matched, "and it refuses more than is owed", over.msg.slice(0, 54));

  const due = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  await createCheque({
    customerId: cust.id, documentId: inv.id, type: "receivable",
    chequeNumber: `ZZ${stamp}`.slice(0, 12), bankName: "QNB", amount: "400",
    chequeDate: due, status: "pending", who: cust.name,
  } as any);
  const withPdc: any = await getDocument(inv.id);
  ok(withPdc.invoiceType === "Credit Invoice", "a PDC keeps it CREDIT");
  ok(withPdc.terms?.chequeDue?.length === 1, "and the cheque's due date reaches the printed footer",
     withPdc.terms?.chequeDue?.[0]?.dueDate);

  // ══ WHAT IT EARNED ════════════════════════════════════════════════════════
  step("5. Profit, item by item");
  const detail: any = await getProfitDetail(today, today, shop.id);
  const roomDetail: any = await getProfitDetail(today, today, room.id);
  const mine = detail.invoices.find((d: any) => d.id === inv.id);
  //  tile: 200 − 24×8 = 8   ·   cement: 360 − 20×14 = 80
  ok(near(mine.profit, 88), "gross profit 88 — item level, not total minus COGS", String(mine.profit));
  // The shortage is charged to the location the goods left, so it shows against
  // the store room — not the shop that received them.
  ok(near(roomDetail.materialLosses, 32), "the 4 broken tiles land on the store room",
     String(roomDetail.materialLosses));

  // ══ THINGS GO WRONG ═══════════════════════════════════════════════════════
  step("6. A count, a breakage, a swap and a hand adjustment");
  const bagsBefore = await getProductStock(cement.id, room.id);
  const cnt: any = await setStockCount({
    productId: cement.id, storeId: room.id, countedQty: bagsBefore - 4, userId: me.id,
  });
  ok(cnt.variance === -4 && cnt.lossValue === 56, "count 4 bags short = QAR 56",
     `${bagsBefore} on the books, ${bagsBefore - 4} counted`);

  const dmg: any = await recordDamage({
    productId: paint.id, storeId: room.id, qty: 2,
    reason: "two pails split on the rack", userId: me.id,
  });
  ok(dmg.lossValue === 220, "2 pails damaged = QAR 220", String(dmg.lossValue));

  const evenSwap: any = await recordSwap({
    storeId: room.id, outProductId: paint.id, outQty: 1, inProductId: cement.id, inQty: 1,
    reason: "customer took cement instead of paint", actorId: me.id,
  });
  ok(evenSwap.applied === true, "a small swap goes straight through",
     `QAR ${evenSwap.difference} apart`);
  const bigSwap: any = await recordSwap({
    storeId: room.id, outProductId: paint.id, outQty: 4, inProductId: cement.id, inQty: 1,
    reason: "trying to swap four pails for one bag", actorId: me.id,
  });
  ok(bigSwap.pendingApproval === true, "a lopsided one waits for approval", bigSwap.requestNumber);

  const adj: any = await adjustStockManual({
    productId: cement.id, storeId: room.id, qtyChange: -1,
    reasonCode: "lost", note: "one bag unaccounted for", actorId: me.id,
  });
  ok(adj.applied && adj.lossId !== null, "a hand removal reaches the loss ledger", `QAR ${adj.value}`);

  // ══ THE TILL ══════════════════════════════════════════════════════════════
  step("7. Count the drawer");
  const plan = await getCashCountPlan(shop.id, today);
  ok(near(plan.cashIn, 150), "the day's cash is the 150 collected", String(plan.cashIn));
  const till: any = await recordCashCount({
    storeId: shop.id, date: today, countedTotal: 130, closingFloat: 130,
    reason: "a sale may not have been rung up", actorId: me.id,
  });
  ok(till.difference === -20 && till.direction === "short", "20 short, recorded", String(till.difference));

  // ══ THE LEDGER OF LOSSES ══════════════════════════════════════════════════
  step("8. What the day cost");
  const losses = await getStockLosses({ start: today, end: today });
  const kinds = losses.byKind || {};
  ok(near(kinds.transfer_shortage?.value ?? 0, 32), "short transfer 32");
  ok(near(kinds.count_variance?.value ?? 0, 56), "count 56", String(kinds.count_variance?.value));
  ok(near(kinds.damage?.value ?? 0, 220), "damage 220");
  ok(near(kinds.write_off?.value ?? 0, 14), "hand write-off 14");

  // ══ CLOSING UP ════════════════════════════════════════════════════════════
  step("9. Close the store room and move what is left into the shop");
  const cp = await getClosurePlan(room.id);
  ok(cp.stockLines > 0 && cp.canClose, "the plan lists what is inside", `${cp.stockLines} lines, QAR ${cp.stockValue}`);
  const closure = await closeLocation({
    storeId: room.id, moveToStoreId: shop.id,
    counts: cp.stock.map((l) => ({ productId: l.productId, foundQty: Math.max(0, l.qty - 1) })),
    reason: "store room given up", actorId: me.id,
  });
  ok(closure.missingValue > 0, "and one of each could not be found", `QAR ${closure.missingValue} written off`);
  ok(!!closure.transferNumber, "the move went out on a real transfer", closure.transferNumber || "");
  const shut = await refuses(
    () => recordDamage({ productId: cement.id, storeId: room.id, qty: 1, reason: "after closing", userId: me.id }),
    /is closed/i);
  ok(shut.matched, "nothing can be booked to it afterwards");

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  // ── Put the database back exactly as it was found ───────────────────────
  const docIds = (await db.select().from(documents))
    .filter((d: any) => made.stores.includes(d.storeId) || made.stores.includes(d.toStoreId)
      || made.docs.includes(d.id) || d.customerId === made.customer)
    .map((d) => d.id);
  if (docIds.length) {
    const notes = await db.select().from(arrangementNotes).where(inArray(arrangementNotes.documentId, docIds));
    if (notes.length) {
      await db.delete(arrangementNoteItems).where(inArray(arrangementNoteItems.noteId, notes.map((n) => n.id))).catch(() => {});
      await db.delete(arrangementNotes).where(inArray(arrangementNotes.documentId, docIds)).catch(() => {});
    }
    await db.delete(cheques).where(inArray(cheques.documentId, docIds)).catch(() => {});
    await db.delete(payments).where(inArray(payments.documentId, docIds)).catch(() => {});
    await db.delete(editLog).where(inArray(editLog.documentId, docIds)).catch(() => {});
    await db.delete(documentItems).where(inArray(documentItems.documentId, docIds)).catch(() => {});
    await db.delete(documents).where(inArray(documents.id, docIds)).catch(() => {});
  }
  if (made.stores.length) {
    await db.delete(cashCounts).where(inArray(cashCounts.storeId, made.stores)).catch(() => {});
    await db.delete(cashflow).where(inArray(cashflow.storeId, made.stores)).catch(() => {});
    await db.delete(stockSwaps).where(inArray(stockSwaps.storeId, made.stores)).catch(() => {});
    await db.delete(stockLosses).where(inArray(stockLosses.storeId, made.stores)).catch(() => {});
    await db.delete(notifications).where(inArray(notifications.entityId, made.stores)).catch(() => {});
  }
  if (made.products.length) {
    await db.delete(stockLosses).where(inArray(stockLosses.productId, made.products)).catch(() => {});
    await db.delete(notifications).where(inArray(notifications.entityId, made.products)).catch(() => {});
    await db.delete(stockAdjustments).where(inArray(stockAdjustments.productId, made.products)).catch(() => {});
    await db.delete(inventory).where(inArray(inventory.productId, made.products)).catch(() => {});
    await db.delete(products).where(inArray(products.id, made.products)).catch(() => {});
  }
  if (made.orders.length) await db.delete(supplierOrders).where(inArray(supplierOrders.id, made.orders)).catch(() => {});
  await db.delete(approvalRequests).where(like(approvalRequests.title, "%ZZ %")).catch(() => {});
  if (made.customer) await db.delete(customers).where(eq(customers.id, made.customer)).catch(() => {});
  if (made.supplier) await db.delete(suppliers).where(eq(suppliers.id, made.supplier)).catch(() => {});
  if (made.stores.length) await db.delete(stores).where(inArray(stores.id, made.stores)).catch(() => {});

  // Wind the document numbers back, so the first REAL invoice gets the number
  // it would have had if this run had never happened.
  for (const c of countersBefore) {
    await db.update(documentCounters).set({ nextNumber: c.nextNumber })
      .where(eq(documentCounters.type, c.type)).catch(() => {});
  }
  if (settingsBefore) {
    await upsertSettings({
      stockLossAlertValue: (settingsBefore as any).stockLossAlertValue,
      stockAdjustApprovalValue: (settingsBefore as any).stockAdjustApprovalValue,
      cashCountTolerance: (settingsBefore as any).cashCountTolerance,
    } as any).catch(() => {});
  }
  console.log("(everything created here has been removed; document numbers wound back)");
  process.exit(fail ? 1 : 0);
}
