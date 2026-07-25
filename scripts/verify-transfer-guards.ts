// Verifies the transfer guardrails. Each guard throws BEFORE moving stock, so no
// inventory is touched. Any draft created for a test is deleted at the end.
import "dotenv/config";
import { db } from "../server/db";
import { documents, documentItems, stockAdjustments, editLog } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { createTransfer, approveTransfer } from "../server/storage";

const ORIG_RECEIVED = 232; // TR-100011, Store1→Store2, product 6 ×23, received
const PRODUCT = 6;

let pass = 0, fail = 0;
const created: number[] = [];
async function expectThrow(label: string, fn: () => Promise<any>, needle: string) {
  try { await fn(); console.log(`  ✗ ${label} — expected throw, got success`); fail++; }
  catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes(needle)) { console.log(`  ✓ ${label}`); pass++; }
    else { console.log(`  ✗ ${label} — wrong error: ${msg}`); fail++; }
  }
}

(async () => {
  // 1. Over-return: return more than originally transferred (23).
  await expectThrow("return 155 > orig 23 rejected",
    () => createTransfer({ date: "2026-07-25", fromStoreId: 2, toStoreId: 1, linkedDocId: ORIG_RECEIVED,
      items: [{ productId: PRODUCT, description: "ANGLE VALVE", qty: 155, unit: "PCS" }] } as any),
    "only 23 left to return");

  // 2. Return against a NON-received original (a fresh draft) rejected.
  const draft = await createTransfer({ date: "2026-07-25", fromStoreId: 1, toStoreId: 2,
    items: [{ productId: PRODUCT, description: "ANGLE VALVE", qty: 2, unit: "PCS" }] } as any);
  created.push(draft.id);
  await expectThrow("return against draft rejected",
    () => createTransfer({ date: "2026-07-25", fromStoreId: 2, toStoreId: 1, linkedDocId: draft.id,
      items: [{ productId: PRODUCT, description: "ANGLE VALVE", qty: 1, unit: "PCS" }] } as any),
    "must be received first");

  // 3. Approve a transfer bigger than the source holds → blocked (no phantom stock).
  const huge = await createTransfer({ date: "2026-07-25", fromStoreId: 1, toStoreId: 2,
    items: [{ productId: PRODUCT, description: "ANGLE VALVE", qty: 99999, unit: "PCS" }] } as any);
  created.push(huge.id);
  await expectThrow("approve over-stock blocked",
    () => approveTransfer(huge.id, 1),
    "Not enough stock");

  // 4. qty <= 0 rejected.
  await expectThrow("qty 0 rejected",
    () => createTransfer({ date: "2026-07-25", fromStoreId: 1, toStoreId: 2,
      items: [{ productId: PRODUCT, description: "ANGLE VALVE", qty: 0, unit: "PCS" }] } as any),
    "greater than zero");

  // Cleanup — remove test drafts (FK order: adjustments, editLog, items, doc).
  if (created.length) {
    await db.delete(stockAdjustments).where(inArray(stockAdjustments.referenceId, created));
    await db.delete(editLog).where(inArray(editLog.documentId, created));
    await db.delete(documentItems).where(inArray(documentItems.documentId, created));
    await db.delete(documents).where(inArray(documents.id, created));
  }

  console.log(`\n${pass}/${pass + fail} guards passed. Cleaned ${created.length} test drafts.`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
