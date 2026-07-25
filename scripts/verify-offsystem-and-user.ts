// (1) Verify off-system receipt confirmation records method + external receiver.
// (2) Create the Store 2 salesman shell (placeholder PIN, no password → owner sets it).
import "dotenv/config";
import { db } from "../server/db";
import { documents, documentItems, stockAdjustments, editLog, inventory, users } from "../shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { createTransfer, approveTransfer, receiveTransfer, getTransfers } from "../server/storage";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

(async () => {
  const PRODUCT = 6;
  const s1 = Number((await db.select().from(inventory).where(and(eq(inventory.productId, PRODUCT), eq(inventory.storeId, 1))))[0]?.qty || 0);
  const s2 = Number((await db.select().from(inventory).where(and(eq(inventory.productId, PRODUCT), eq(inventory.storeId, 2))))[0]?.qty || 0);
  const created: number[] = [];

  // Off-system flow: create → send → receive via WhatsApp, named external party
  const t = await createTransfer({ date: "2026-07-25", fromStoreId: 1, toStoreId: 2, takenBy: "DRIVER", createdBy: 2,
    items: [{ productId: PRODUCT, description: "ANGLE VALVE 1/2 INCH", qty: 3, unit: "PCS" }] } as any);
  created.push(t.id);
  await approveTransfer(t.id, 4);

  // Guard: off-system method with no name → throws
  let threw = false;
  try { await receiveTransfer(t.id, 1, { method: "whatsapp" }); } catch { threw = true; }
  ok(threw, "off-system receive without a name is rejected");

  // Proper off-system receive
  await receiveTransfer(t.id, 1, { method: "whatsapp", externalReceiver: "abdul rahman" });
  const row = (await getTransfers()).find((x) => x.number === t.number);
  ok(row?.confirmMethod === "whatsapp", `confirmMethod recorded = ${row?.confirmMethod}`);
  ok(row?.externalReceiver === "ABDUL RAHMAN", `externalReceiver stored uppercase = ${row?.externalReceiver}`);
  ok(row?.receivedByName === "ABDUL RAHMAN", `receivedByName shows the external party = ${row?.receivedByName}`);
  ok(row?.status === "received", "status = received");

  // Cleanup transfer
  await db.delete(stockAdjustments).where(inArray(stockAdjustments.referenceId, created));
  await db.delete(editLog).where(inArray(editLog.documentId, created));
  await db.delete(documentItems).where(inArray(documentItems.documentId, created));
  await db.delete(documents).where(inArray(documents.id, created));
  await db.update(inventory).set({ qty: String(s1) }).where(and(eq(inventory.productId, PRODUCT), eq(inventory.storeId, 1)));
  await db.update(inventory).set({ qty: String(s2) }).where(and(eq(inventory.productId, PRODUCT), eq(inventory.storeId, 2)));

  // Store 2 salesman shell (idempotent)
  const existing = await db.select().from(users).where(eq(users.username, "store2.salesman"));
  if (existing.length) {
    console.log(`\n  Store 2 salesman already exists (id ${existing[0].id}).`);
  } else {
    const [u] = await db.insert(users).values({
      name: "Store 2 Salesman", username: "store2.salesman", role: "salesman",
      storeId: 2, pin: "0000", active: true, mustChangePassword: true,
    } as any).returning();
    console.log(`\n  Created Store 2 Salesman (id ${u.id}) — username store2.salesman, PIN 0000, no password yet.`);
  }

  console.log(`\n${pass}/${pass + fail} checks passed. Transfer test data cleaned (Store1=${s1}, Store2=${s2}).`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
