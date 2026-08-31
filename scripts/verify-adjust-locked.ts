// Is the back door actually shut? Against the REAL database.
//
//   the name comes from who is signed in, never from the request
//   the reason is compulsory
//   a removal reaches the loss ledger — Adjust cannot dodge what Damage records
//   a big removal is NOT carried out; it becomes an approval request
//   approving it carries it out, against the person who asked
//   "transfer" is refused by name
//
// WRITES: its own location and product, removed again at the end.
//
// Run: npx tsx scripts/verify-adjust-locked.ts
import "dotenv/config";
import {
  createStore, createProduct, adjustStock, getProductStock, adjustStockManual,
  getStockLosses, getApprovalRequests, approveApprovalRequest, upsertSettings, getSettings,
  getUsers,
} from "../server/storage";
import { db } from "../server/db";
import {
  stores, products, inventory, stockAdjustments, stockLosses,
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
let productId: number | null = null;
let requestId: number | null = null;
const beforeSettings = await getSettings();

try {
  const [me] = await getUsers();
  if (!me) throw new Error("no user to act as");
  console.log(`\nSetting up: one yard, 200 bags at QAR 14, acting as ${me.name}`);
  const st: any = await createStore({ nameEn: `ZZ LOCK YARD ${stamp}`, type: "warehouse" } as any);
  storeId = st.id;
  const p: any = await createProduct({
    name: `ZZ CEMENT ${stamp}`, unit: "BAG", costPrice: "14", salePrice: "18",
  } as any);
  productId = p.id;
  await adjustStock(p.id, st.id, 200, "add", "test setup");
  await upsertSettings({ stockAdjustApprovalValue: "1000", stockLossAlertValue: "250" } as any);
  ok(await getProductStock(p.id, st.id) === 200, "200 on hand");

  console.log("\n1. A reason is compulsory");
  const noWhy = await refuses(
    () => adjustStockManual({
      productId: p.id, storeId: st.id, qtyChange: -5,
      reasonCode: "lost", note: "", actorId: me.id,
    }), /Say why/i);
  ok(noWhy.matched, "refused with no explanation", noWhy.msg.slice(0, 60));
  ok(await getProductStock(p.id, st.id) === 200, "and nothing moved");

  console.log("\n2. A transfer cannot be done by hand");
  const asTransfer = await refuses(
    () => adjustStockManual({
      productId: p.id, storeId: st.id, qtyChange: -50,
      reasonCode: "transfer", note: "moving to store 2", actorId: me.id,
    }), /somebody counting what arrives/i);
  ok(asTransfer.matched, "refused, and points at the real transfer", asTransfer.msg.slice(0, 62));

  console.log("\n3. A reason that contradicts the direction is refused");
  const wrongWay = await refuses(
    () => adjustStockManual({
      productId: p.id, storeId: st.id, qtyChange: -5,
      reasonCode: "return", note: "customer brought it back", actorId: me.id,
    }), /not a reason for removing/i);
  ok(wrongWay.matched, "a customer return cannot remove stock");

  console.log("\n4. A small removal goes through — and reaches the loss ledger");
  const small: any = await adjustStockManual({
    productId: p.id, storeId: st.id, qtyChange: -10,
    reasonCode: "lost", note: "not on the rack after the count", actorId: me.id,
  });
  ok(small.applied === true, "carried out");
  ok(small.value === 140, "worth QAR 140", String(small.value));
  ok(!!small.lossId, "a loss row was written — Adjust cannot dodge the ledger", `id ${small.lossId}`);
  ok(await getProductStock(p.id, st.id) === 190, "190 left");

  console.log("\n5. A correction is NOT a loss — the figure was wrong, nothing went anywhere");
  const corr: any = await adjustStockManual({
    productId: p.id, storeId: st.id, qtyChange: -5,
    reasonCode: "correction", note: "double counted on the north side", actorId: me.id,
  });
  ok(corr.applied === true && corr.lossId === null, "applied, no loss recorded");

  console.log("\n6. A BIG removal is not carried out — it is asked for");
  const big: any = await adjustStockManual({
    productId: p.id, storeId: st.id, qtyChange: -100,   // QAR 1400, over the 1000 limit
    reasonCode: "lost", note: "cannot find a whole pallet", actorId: me.id,
  });
  ok(big.applied === false && big.pendingApproval === true, "held", big.requestNumber);
  ok(await getProductStock(p.id, st.id) === 185, "the stock has NOT moved", "185 still there");

  const pending = (await getApprovalRequests({ role: "admin", userId: me.id })).find(
    (r: any) => r.requestNumber === big.requestNumber);
  requestId = pending?.id ?? null;
  ok(!!pending, "it is waiting in Approvals");
  ok(pending?.type === "stock_adjustment", "as a stock adjustment");
  ok(Number(pending?.amount) === 1400, "for QAR 1,400", String(pending?.amount));

  console.log("\n7. Approving it carries it out");
  await approveApprovalRequest(requestId!, me.id, undefined);
  ok(await getProductStock(p.id, st.id) === 85, "now the stock moves", "85 left");
  const losses = await getStockLosses({ storeId: st.id });
  const fromApproval = losses.rows.filter((r: any) => r.refType === "approval_request");
  ok(fromApproval.length === 1 && Number(fromApproval[0].value) === 1400,
     "and the loss is recorded at QAR 1,400", String(fromApproval[0]?.value));

  console.log("\n8. More than is there is refused");
  const tooMuch = await refuses(
    () => adjustStockManual({
      productId: p.id, storeId: st.id, qtyChange: -500,
      reasonCode: "lost", note: "everything gone", actorId: me.id,
    }), /Only 85 .* are recorded/i);
  ok(tooMuch.matched, "refused", tooMuch.msg.slice(0, 58));

  console.log("\n9. Nobody can act without a name");
  const noName = await refuses(
    () => adjustStockManual({
      productId: p.id, storeId: st.id, qtyChange: -1,
      reasonCode: "lost", note: "anonymous attempt", actorId: 0 as any,
    }), /Sign in first/i);
  ok(noName.matched, "refused", noName.msg.slice(0, 56));

  console.log("\n10. Everything that left is in one place");
  const report = await getStockLosses({ storeId: st.id });
  ok(report.totalValue === 1540, "QAR 1,540 written off here", String(report.totalValue));
  ok(report.byKind?.write_off?.count === 2, "two write-offs, the correction excluded",
     String(report.byKind?.write_off?.count));

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  if (requestId) await db.delete(approvalRequests).where(eq(approvalRequests.id, requestId)).catch(() => {});
  if (productId) {
    await db.delete(stockLosses).where(eq(stockLosses.productId, productId)).catch(() => {});
    await db.delete(notifications).where(eq(notifications.entityId, productId)).catch(() => {});
    await db.delete(stockAdjustments).where(eq(stockAdjustments.productId, productId)).catch(() => {});
    await db.delete(inventory).where(eq(inventory.productId, productId)).catch(() => {});
    await db.delete(products).where(eq(products.id, productId)).catch(() => {});
  }
  if (storeId) await db.delete(stores).where(eq(stores.id, storeId)).catch(() => {});
  if (beforeSettings) {
    await upsertSettings({
      stockAdjustApprovalValue: (beforeSettings as any).stockAdjustApprovalValue ?? "1000",
      stockLossAlertValue: (beforeSettings as any).stockLossAlertValue ?? "250",
    } as any).catch(() => {});
  }
  console.log("(cleaned up the throwaway yard, product, losses and request)");
  process.exit(fail ? 1 : 0);
}
