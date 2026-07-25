// Full inter-store transfer + return workflow, acted out as each real user by id.
// Store1 salesman → manager sends → Store2 keeper receives → Store2 returns some →
// manager sends → Store1 salesman receives → settlement nets to the difference.
// Everything is torn down at the end so real data is untouched.
import "dotenv/config";
import { db } from "../server/db";
import { documents, documentItems, stockAdjustments, editLog, inventory } from "../shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  createTransfer, approveTransfer, receiveTransfer, getTransferSettlement,
} from "../server/storage";

// Real actors (from the users table)
const SALESMAN_S1 = 2;   // Store Salesman, store 1
const KEEPER_S2 = 3;     // Warehouse Keeper, store 2
const MANAGER = 4;       // Store Manager (approves/sends)
const STORE1 = 1, STORE2 = 2, PRODUCT = 6; // ANGLE VALVE 1/2 INCH, cost 5

const qty = async (store: number) => {
  const [r] = await db.select().from(inventory).where(and(eq(inventory.productId, PRODUCT), eq(inventory.storeId, store)));
  return Number(r?.qty || 0);
};
const money = (n: number) => "QAR " + n.toFixed(2);
let step = 0;
const say = (s: string) => console.log(`\n[${++step}] ${s}`);

(async () => {
  const s1_0 = await qty(STORE1), s2_0 = await qty(STORE2);
  console.log(`START — Store1 angle valve = ${s1_0}, Store2 = ${s2_0}`);
  const created: number[] = [];

  // ── 1. Store 1 salesman writes the transfer note (10 pcs to Store 2) ──
  say(`Logged in as Store 1 SALESMAN — create transfer Store1 → Store2, ANGLE VALVE ×10`);
  const t1 = await createTransfer({ date: "2026-07-25", fromStoreId: STORE1, toStoreId: STORE2,
    takenBy: "STORE 2 DRIVER", createdBy: SALESMAN_S1,
    items: [{ productId: PRODUCT, description: "ANGLE VALVE 1/2 INCH", qty: 10, unit: "PCS" }] } as any);
  created.push(t1.id);
  console.log(`    → ${t1.number} DRAFT, cross-owner, valued ${money(Number(t1.total))} (cost 5 × 10). Stock not moved yet.`);

  // ── 2. Manager sends it for confirmation (salesman cannot — admin/manager only) ──
  say(`Logged in as MANAGER — "Send for confirmation" (${t1.number})`);
  await approveTransfer(t1.id, MANAGER);
  console.log(`    → approved. Stock LEFT Store 1: ${s1_0} → ${await qty(STORE1)}. authorizedBy = Manager.`);

  // ── 3. Store 2 keeper confirms the goods physically arrived ──
  say(`Logged in as Store 2 KEEPER — "Confirm receipt" (${t1.number})`);
  await receiveTransfer(t1.id, KEEPER_S2);
  console.log(`    → received. Stock LANDED Store 2: ${s2_0} → ${await qty(STORE2)}. receivedBy = Keeper, status RECEIVED.`);

  const netAfterSend = (await getTransferSettlement("2026-07-01", "2026-07-31"))
    .settlements.find((x: any) => /Store 2/.test(x.debtor));
  console.log(`    Settlement now: Store 2 owes Store 1 ${money(netAfterSend?.amount || 0)} (includes the +50 just moved).`);

  // ── 4. Three days later Store 2 returns 4 pcs from THEIR end ──
  say(`Logged in as Store 2 KEEPER — edit note into a return of 4 pcs against ${t1.number}`);
  const t2 = await createTransfer({ date: "2026-07-28", fromStoreId: STORE2, toStoreId: STORE1,
    takenBy: "STORE 1 DRIVER", createdBy: KEEPER_S2, linkedDocId: t1.id,
    items: [{ productId: PRODUCT, description: "ANGLE VALVE 1/2 INCH", qty: 4, unit: "PCS" }] } as any);
  created.push(t2.id);
  console.log(`    → ${t2.number} DRAFT return (link ${t1.number}), valued ${money(Number(t2.total))} (cost 5 × 4).`);

  // ── 5. Manager sends the return; Store 1 salesman confirms it back in ──
  say(`Logged in as MANAGER — send the return (${t2.number})`);
  await approveTransfer(t2.id, MANAGER);
  console.log(`    → approved. Stock LEFT Store 2: ${await qty(STORE2)} (was 33).`);

  say(`Logged in as Store 1 SALESMAN — "Confirm receipt" of the return (${t2.number})`);
  await receiveTransfer(t2.id, SALESMAN_S1);
  console.log(`    → received. Stock BACK at Store 1: ${await qty(STORE1)}. receivedBy = Salesman.`);

  // ── 6. Month-end settlement nets both directions ──
  say(`Month-end settlement (July 2026)`);
  const settle = await getTransferSettlement("2026-07-01", "2026-07-31");
  const row = settle.settlements.find((x: any) => /Store 2/.test(x.debtor) || /Store 1/.test(x.creditor));
  console.log(`    ${settle.transferCount} received cross-owner transfers this month.`);
  if (row) console.log(`    NET: ${row.debtor} owes ${row.creditor} ${money(row.amount)}  (gave ${money(row.grossCreditorGave)} out, ${money(row.grossDebtorGave)} back).`);

  // Expected net contributed by THIS demo = 50 out − 20 back = 30.
  const s1_end = await qty(STORE1), s2_end = await qty(STORE2);
  const ok = s1_end === s1_0 - 6 && s2_end === s2_0 + 6; // net 10 out − 4 back = 6
  console.log(`\n    CHECK stock moved net 6 (10−4): Store1 ${s1_0}→${s1_end}, Store2 ${s2_0}→${s2_end} — ${ok ? "OK" : "MISMATCH"}`);

  // ── Cleanup — remove both demo docs, restore inventory ──
  await db.delete(stockAdjustments).where(inArray(stockAdjustments.referenceId, created));
  await db.delete(editLog).where(inArray(editLog.documentId, created));
  await db.delete(documentItems).where(inArray(documentItems.documentId, created));
  await db.delete(documents).where(inArray(documents.id, created));
  await db.update(inventory).set({ qty: String(s1_0) }).where(and(eq(inventory.productId, PRODUCT), eq(inventory.storeId, STORE1)));
  await db.update(inventory).set({ qty: String(s2_0) }).where(and(eq(inventory.productId, PRODUCT), eq(inventory.storeId, STORE2)));
  console.log(`\nCLEANED — deleted ${created.length} demo transfers, restored Store1=${s1_0}, Store2=${s2_0}.`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
