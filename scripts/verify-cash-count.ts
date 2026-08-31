// Counting the till, end to end, against the REAL database.
//
//   the expected figure comes from the same ledger the cash position reads
//   a difference bigger than the tolerance cannot be saved without a note
//   the difference is posted to the ledger, so recorded cash matches the drawer
//   banking the takings moves them from cash to bank
//   tomorrow starts with whatever was left in the till
//
// WRITES: its own location and cashflow rows, all removed at the end.
//
// Run: npx tsx scripts/verify-cash-count.ts
import "dotenv/config";
import {
  createStore, logCashflow, getCashCountPlan, recordCashCount, getCashCounts,
  getCashPosition, upsertSettings, getSettings, getUsers,
} from "../server/storage";
import { db } from "../server/db";
import { stores, cashflow, cashCounts, notifications } from "@shared/schema";
import { eq } from "drizzle-orm";

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
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
let storeId: number | null = null;
const before = await getSettings();

try {
  const [me] = await getUsers();
  if (!me) throw new Error("no user to act as");

  console.log("\nSetting up: a till with a day's takings");
  const st: any = await createStore({ nameEn: `ZZ TILL SHOP ${stamp}`, type: "store" } as any);
  storeId = st.id;
  await upsertSettings({ cashCountTolerance: "5" } as any);

  // A day's movements, the way the app records them.
  await logCashflow({ direction: "in", category: "Invoice payment", amount: 3000, storeId: st.id, notes: "Cash", date: today, createdBy: me.id });
  await logCashflow({ direction: "in", category: "Invoice payment", amount: 200, storeId: st.id, notes: "Cash", date: today, createdBy: me.id });
  await logCashflow({ direction: "out", category: "Expense", amount: 450, storeId: st.id, notes: "Cash", date: today, createdBy: me.id });
  // A bank transfer never reaches the drawer and must NOT be expected in it.
  await logCashflow({ direction: "in", category: "Invoice payment", amount: 5000, storeId: st.id, notes: "Bank Transfer", date: today, createdBy: me.id });
  ok(true, "3,200 in cash, 450 paid out, 5,000 by bank transfer");

  console.log("\n1. What the day says should be in the drawer");
  const plan = await getCashCountPlan(st.id, today);
  ok(plan.cashIn === 3200, "cash in 3,200 — the bank transfer is not in the till", String(plan.cashIn));
  ok(plan.cashOut === 450, "cash out 450", String(plan.cashOut));
  ok(plan.expected === 2750, "so 2,750 should be there", String(plan.expected));
  ok(plan.openingFloat === 0, "nothing left in from before");

  console.log("\n2. A real difference cannot be saved without a note");
  const noWhy = await refuses(
    () => recordCashCount({ storeId: st.id, date: today, countedTotal: 2700, actorId: me.id }),
    /SHORT by QAR 50\.00/);
  ok(noWhy.matched, "refused, and it says short by how much", noWhy.msg.slice(0, 64));

  console.log("\n3. Count it: 2,700 in notes, 50 short");
  const res: any = await recordCashCount({
    storeId: st.id, date: today,
    breakdown: { "500": 5, "100": 2 },          // 2,500 + 200
    closingFloat: 500,
    reason: "a cash sale may not have been entered this morning",
    actorId: me.id,
  });
  ok(res.count.counted == 2700, "counted 2,700 from the notes", String(res.count.counted));
  ok(res.difference === -50, "50 short", String(res.difference));
  ok(res.direction === "short", "recorded as short");
  ok(res.banked === 2200, "2,200 goes to the bank, 500 stays in", String(res.banked));

  console.log("\n4. The difference goes through the ledger");
  const rows = await db.select().from(cashflow).where(eq(cashflow.storeId, st.id));
  const shortRow = (rows as any[]).find((r) => r.category === "Till shortage");
  ok(!!shortRow, "a till-shortage entry exists");
  ok(Number(shortRow?.amount) === 50 && shortRow?.direction === "out",
     "for 50, out of cash", `${shortRow?.direction} ${shortRow?.amount}`);
  const banked = (rows as any[]).filter((r) => r.category === "Banked takings");
  ok(banked.length === 2, "banking is two entries — out of the till, into the bank");
  ok(banked.some((r) => r.direction === "out" && !/bank transfer/i.test(r.notes || "")) &&
     banked.some((r) => r.direction === "in" && /bank transfer/i.test(r.notes || "")),
     "tagged so the cash position splits them correctly");

  console.log("\n5. The recorded cash now matches the drawer");
  const pos = await getCashPosition(st.id);
  ok(Math.abs(pos.cashInHand - 500) < 0.005,
     "cash in hand is the 500 left in the till", String(pos.cashInHand));

  console.log("\n6. The owner is told");
  const notes = await db.select().from(notifications).where(eq(notifications.entityId, st.id));
  const alert = (notes as any[]).find((n) => n.type === "cash_difference");
  ok(!!alert, "notification raised", alert?.title);

  console.log("\n7. Tomorrow starts with what was left in");
  const tomorrow = await getCashCountPlan(st.id, new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  ok(tomorrow.openingFloat === 500, "opening float 500", String(tomorrow.openingFloat));

  console.log("\n8. An exact count needs no explanation at all");
  await logCashflow({ direction: "in", category: "Invoice payment", amount: 100, storeId: st.id, notes: "Cash", date: yesterday, createdBy: me.id });
  const exact: any = await recordCashCount({
    storeId: st.id, date: yesterday, countedTotal: 100, closingFloat: 0, actorId: me.id,
  });
  ok(exact.direction === "exact" && exact.difference === 0, "saved with no note required");

  console.log("\n9. The register shows the pattern, not just the day");
  const reg = await getCashCounts({ storeId: st.id });
  ok(reg.count === 2, "two closes recorded", String(reg.count));
  ok(reg.shortDays === 1 && reg.exactDays === 1, "one short, one exact");
  ok(reg.netDifference === -50, "net 50 short over the period", String(reg.netDifference));

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  if (storeId) {
    await db.delete(cashCounts).where(eq(cashCounts.storeId, storeId)).catch(() => {});
    await db.delete(cashflow).where(eq(cashflow.storeId, storeId)).catch(() => {});
    await db.delete(notifications).where(eq(notifications.entityId, storeId)).catch(() => {});
    await db.delete(stores).where(eq(stores.id, storeId)).catch(() => {});
  }
  if (before) {
    await upsertSettings({ cashCountTolerance: (before as any).cashCountTolerance ?? "5" } as any).catch(() => {});
  }
  console.log("(cleaned up the throwaway till, its cashflow and counts)");
  process.exit(fail ? 1 : 0);
}
