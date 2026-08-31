// The swap, end to end, against the REAL database.
//
//   both shelves move in ONE record, so the pair can never read as two mysteries
//   an even swap goes straight through — staff already do it all day
//   a lopsided one waits for approval, and nothing moves until it is agreed
//   the difference in value lands in the loss ledger, signed
//
// WRITES: its own location and three products, all removed at the end.
//
// Run: npx tsx scripts/verify-swap.ts
import "dotenv/config";
import {
  createStore, createProduct, adjustStock, getProductStock, recordSwap, getSwaps,
  getStockLosses, getApprovalRequests, approveApprovalRequest,
  upsertSettings, getSettings, getUsers,
} from "../server/storage";
import { db } from "../server/db";
import {
  stores, products, inventory, stockAdjustments, stockLosses, stockSwaps,
  notifications, approvalRequests,
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
let storeId: number | null = null;
const madeProducts: number[] = [];
let requestId: number | null = null;
const beforeSettings = await getSettings();

try {
  const [me] = await getUsers();
  if (!me) throw new Error("no user to act as");

  console.log("\nSetting up: two whites at QAR 55, a cheaper one at 52, and cement");
  const st: any = await createStore({ nameEn: `ZZ SWAP SHOP ${stamp}`, type: "store" } as any);
  storeId = st.id;
  const whiteA: any = await createProduct({ name: `ZZ WHITE A ${stamp}`, unit: "TIN", costPrice: "55", salePrice: "80" } as any);
  const whiteB: any = await createProduct({ name: `ZZ WHITE B ${stamp}`, unit: "TIN", costPrice: "55", salePrice: "80" } as any);
  const cheap: any = await createProduct({ name: `ZZ WHITE C ${stamp}`, unit: "TIN", costPrice: "52", salePrice: "78" } as any);
  const cement: any = await createProduct({ name: `ZZ CEMENT ${stamp}`, unit: "BAG", costPrice: "14", salePrice: "18" } as any);
  madeProducts.push(whiteA.id, whiteB.id, cheap.id, cement.id);
  await adjustStock(whiteA.id, st.id, 10, "add", "test setup");
  await adjustStock(whiteB.id, st.id, 10, "add", "test setup");
  await adjustStock(cheap.id, st.id, 10, "add", "test setup");
  await adjustStock(cement.id, st.id, 100, "add", "test setup");
  await upsertSettings({ stockLossAlertValue: "250" } as any);
  ok(true, "ready");

  console.log("\n1. The everyday swap — same price, both shelves fixed at once");
  const even: any = await recordSwap({
    storeId: st.id, outProductId: whiteA.id, outQty: 2,
    inProductId: whiteB.id, inQty: 2,
    reason: "customer needed the white we already had — exchanged at the counter",
    customerName: "mr shuri", actorId: me.id,
  });
  ok(even.applied === true, "recorded straight away, no approval");
  ok(even.difference === 0, "both sides worth the same", String(even.difference));
  ok(await getProductStock(whiteA.id, st.id) === 8, "2 went out", "8 left");
  ok(await getProductStock(whiteB.id, st.id) === 12, "2 came in", "12 now");
  ok(even.lossId === null, "nothing lost, so nothing written to the loss ledger");

  console.log("\n2. Both halves point at the SAME record");
  const moves = await db.select().from(stockAdjustments)
    .where(inArray(stockAdjustments.productId, [whiteA.id, whiteB.id]));
  const pair = (moves as any[]).filter((m) => m.referenceId === even.swap.id);
  ok(pair.length === 2, "two movements, one reference", `swap #${even.swap.id}`);
  ok(pair.some((m) => Number(m.qtyChange) === -2) && pair.some((m) => Number(m.qtyChange) === 2),
     "one out, one in — never two unrelated mysteries");

  console.log("\n3. A small price difference is recorded, not hidden");
  const uneven: any = await recordSwap({
    storeId: st.id, outProductId: whiteA.id, outQty: 2,
    inProductId: cheap.id, inQty: 2,
    reason: "swapped for the cheaper white, customer agreed", actorId: me.id,
  });
  ok(uneven.applied === true, "still goes straight through");
  ok(uneven.difference === 6, "QAR 6 down", String(uneven.difference));
  ok(!!uneven.lossId, "and the difference is in the loss ledger");
  const losses = await getStockLosses({ storeId: st.id });
  ok(losses.byKind?.swap_difference?.value === 6, "filed as a swap difference",
     String(losses.byKind?.swap_difference?.value));

  console.log("\n4. A swap that comes out AHEAD nets off instead of being ignored");
  const ahead: any = await recordSwap({
    storeId: st.id, outProductId: cheap.id, outQty: 2,
    inProductId: whiteA.id, inQty: 2,
    reason: "swapped back the other way", actorId: me.id,
  });
  ok(ahead.difference === -6, "QAR 6 up", String(ahead.difference));
  const after = await getStockLosses({ storeId: st.id });
  ok(after.byKind?.swap_difference?.value === 0, "the two cancel to zero",
     String(after.byKind?.swap_difference?.value));

  console.log("\n5. A lopsided swap does NOT happen — it is asked for");
  const cementBefore = await getProductStock(cement.id, st.id);
  const big: any = await recordSwap({
    storeId: st.id, outProductId: cement.id, outQty: 100,   // QAR 1,400 out
    inProductId: whiteA.id, inQty: 1,                       // QAR 55 back
    reason: "trying it on", actorId: me.id,
  });
  ok(big.applied === false && big.pendingApproval === true, "held", big.requestNumber);
  ok(await getProductStock(cement.id, st.id) === cementBefore, "no cement moved", `${cementBefore} still there`);

  const pendingReq = (await getApprovalRequests({ role: "admin", userId: me.id }))
    .find((r: any) => r.requestNumber === big.requestNumber);
  requestId = pendingReq?.id ?? null;
  ok(pendingReq?.type === "stock_swap", "waiting in Approvals as a swap");
  ok(Math.abs(Number(pendingReq?.amount) - 1345) < 0.01, "for the QAR 1,345 gap", String(pendingReq?.amount));

  console.log("\n6. Approving it carries it out");
  await approveApprovalRequest(requestId!, me.id, undefined);
  ok(await getProductStock(cement.id, st.id) === cementBefore - 100, "now the cement moves");
  const swaps = await getSwaps({ storeId: st.id });
  const approved = swaps.rows.find((r: any) => Number(r.outQty) === 100);
  ok(!!approved?.approvedBy, "and the approver is on the record", approved?.approvedByName || "");

  console.log("\n7. What cannot be swapped");
  const same = await refuses(
    () => recordSwap({
      storeId: st.id, outProductId: whiteA.id, outQty: 1,
      inProductId: whiteA.id, inQty: 1, reason: "same thing", actorId: me.id,
    }), /count the shelf instead/i);
  ok(same.matched, "a product for itself is a correction, not a swap");

  const tooMany = await refuses(
    () => recordSwap({
      storeId: st.id, outProductId: whiteB.id, outQty: 999,
      inProductId: whiteA.id, inQty: 1, reason: "handing over the world", actorId: me.id,
    }), /Only .* are recorded/i);
  ok(tooMany.matched, "more than is on the shelf is refused");

  const noWhy = await refuses(
    () => recordSwap({
      storeId: st.id, outProductId: whiteB.id, outQty: 1,
      inProductId: whiteA.id, inQty: 1, reason: "", actorId: me.id,
    }), /Say why/i);
  ok(noWhy.matched, "and so is no reason at all");

  console.log("\n8. Not through a closed location");
  // Shut it directly — the full closing procedure has its own verification, and
  // it would rightly demand somewhere for the stock still in here to go.
  await db.update(stores).set({ active: false } as any).where(eq(stores.id, st.id));
  const shut = await refuses(
    () => recordSwap({
      storeId: st.id, outProductId: whiteB.id, outQty: 1,
      inProductId: whiteA.id, inQty: 1, reason: "after hours", actorId: me.id,
    }), /is closed/i);
  ok(shut.matched, "refused", shut.msg.slice(0, 52));

  console.log("\n9. The register reads back");
  const register = await getSwaps({ storeId: st.id });
  ok(register.count === 4, "four swaps recorded", String(register.count));
  ok(register.rows[0]?.recordedByName === me.name, "each with the name of who did it");

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  if (requestId) await db.delete(approvalRequests).where(eq(approvalRequests.id, requestId)).catch(() => {});
  if (storeId) {
    await db.delete(stockSwaps).where(eq(stockSwaps.storeId, storeId)).catch(() => {});
    await db.delete(stockLosses).where(eq(stockLosses.storeId, storeId)).catch(() => {});
    await db.delete(notifications).where(eq(notifications.entityId, storeId)).catch(() => {});
  }
  if (madeProducts.length) {
    await db.delete(stockLosses).where(inArray(stockLosses.productId, madeProducts)).catch(() => {});
    await db.delete(stockAdjustments).where(inArray(stockAdjustments.productId, madeProducts)).catch(() => {});
    await db.delete(inventory).where(inArray(inventory.productId, madeProducts)).catch(() => {});
    await db.delete(products).where(inArray(products.id, madeProducts)).catch(() => {});
  }
  if (storeId) await db.delete(stores).where(eq(stores.id, storeId)).catch(() => {});
  console.log("(cleaned up the throwaway shop, products and swaps)");
  process.exit(fail ? 1 : 0);
}
