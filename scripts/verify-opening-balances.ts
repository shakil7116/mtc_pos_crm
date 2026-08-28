// Proves the opening-balance flow against the real database, then removes what it made.
//
// The scenario is the owner's own: a customer owes QAR 50,000 built up over years
// across several old paper invoices, and pays QAR 30,000.
//
// Run: npx tsx scripts/verify-opening-balances.ts
import "dotenv/config";
import {
  createOpeningBalance, collectOldestFirst, getCustomerBalance,
  getProfitSummary, getCustomers,
} from "../server/storage";
import { db } from "../server/db";
import { documents, payments } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};
const QAR = (n: number) => "QAR " + Number(n).toFixed(2);
const made: number[] = [];

try {
  const customers: any[] = await getCustomers();
  const cust = customers[0];
  if (!cust) throw new Error("no customer to test with");

  const profitBefore = await getProfitSummary();
  const balBefore = await getCustomerBalance(cust.id);
  console.log(`\ncustomer: ${cust.name}`);
  console.log(`  owes now       : ${QAR(balBefore)}`);
  console.log(`  expected profit: ${QAR(profitBefore.expectedProfit)}`);

  console.log("\n1. Enter three old paper invoices — QAR 50,000 across three years");
  const rows = [
    { number: `ZZTEST-OLD-A-${Date.now()}`, date: "2023-04-11", amount: 20000 },
    { number: `ZZTEST-OLD-B-${Date.now()}`, date: "2024-02-20", amount: 18000 },
    { number: `ZZTEST-OLD-C-${Date.now()}`, date: "2025-09-05", amount: 12000 },
  ];
  for (const r of rows) {
    const d: any = await createOpeningBalance({ customerId: cust.id, ...r, notes: "verification" });
    made.push(d.id);
  }
  ok(made.length === 3, "three opening balances created");

  const balAfter = await getCustomerBalance(cust.id);
  ok(Math.abs(balAfter - (balBefore + 50000)) < 0.01,
     "the customer now owes 50,000 more", `${QAR(balBefore)} -> ${QAR(balAfter)}`);

  console.log("\n2. THE MONEY CHECK — none of it became profit");
  const profitAfter = await getProfitSummary();
  ok(Math.abs(profitAfter.expectedProfit - profitBefore.expectedProfit) < 0.01,
     "expected profit is unchanged", `${QAR(profitAfter.expectedProfit)}`);
  ok(Math.abs(profitAfter.realProfit - profitBefore.realProfit) < 0.01,
     "real profit is unchanged", `${QAR(profitAfter.realProfit)}`);
  console.log("        (entered as ordinary invoices they would have added QAR 50000.00 of fake profit)");

  console.log("\n3. Customer pays QAR 30,000 — oldest invoice first");
  const r = await collectOldestFirst({
    customerId: cust.id, amount: 30000, method: "Cash",
    date: new Date().toISOString().slice(0, 10), notes: "verification",
  });
  for (const a of r.allocations) {
    console.log(`        ${a.date}  ${a.number.slice(-14).padEnd(16)} was ${QAR(a.was).padStart(12)}  paid ${QAR(a.paid).padStart(12)}  ${a.cleared ? "CLEARED" : "still owes " + QAR(a.nowOwes)}`);
  }
  ok(r.collected === 30000, "collected the full 30,000", QAR(r.collected));
  ok(r.allocations[0].date === "2023-04-11", "the OLDEST invoice was paid first", r.allocations[0].date);
  ok(r.allocations[0].cleared, "and it was cleared in full");
  // 20,000 + 18,000 = 38,000 is more than the 30,000 paid, so the second invoice
  // takes only the 10,000 that is left and stays part-paid. That is correct FIFO:
  // money fills the oldest debts in order and stops when it runs out.
  ok(r.allocations[1].paid === 10000 && !r.allocations[1].cleared,
     "the next oldest took only what was left and stays part-paid",
     `paid ${QAR(r.allocations[1].paid)}, still owes ${QAR(r.allocations[1].nowOwes)}`);
  ok(r.allocations.length === 2,
     "the newest invoice was never touched — no money reached it", `${r.allocations.length} allocations`);

  console.log("\n4. Balance after collection");
  const balFinal = await getCustomerBalance(cust.id);
  ok(Math.abs(balFinal - (balBefore + 20000)) < 0.01,
     "20,000 of the 50,000 still outstanding", `${QAR(balFinal)}`);

  console.log("\n5. Profit STILL unchanged after the money arrived");
  const profitPaid = await getProfitSummary();
  ok(Math.abs(profitPaid.expectedProfit - profitBefore.expectedProfit) < 0.01,
     "collecting old debt earns nothing today", QAR(profitPaid.expectedProfit));

  console.log("\n6. Guards");
  let msg = "";
  try {
    await collectOldestFirst({ customerId: cust.id, amount: 999999, method: "Cash", date: "2026-08-28" });
  } catch (e: any) { msg = e.message; }
  ok(/more than the customer owes/i.test(msg), "cannot collect more than is owed", msg.slice(0, 56));

  msg = "";
  try {
    await createOpeningBalance({ customerId: cust.id, amount: 100, date: "2099-01-01" });
  } catch (e: any) { msg = e.message; }
  ok(/future/i.test(msg), "cannot date an opening balance in the future");

  msg = "";
  try {
    await createOpeningBalance({ customerId: cust.id, amount: -5, date: "2024-01-01" });
  } catch (e: any) { msg = e.message; }
  ok(/more than zero/i.test(msg), "a negative balance is refused");

  console.log("\n" + "-".repeat(76));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  if (made.length) {
    await db.delete(payments).where(inArray(payments.documentId, made));
    await db.delete(documents).where(inArray(documents.id, made));
    console.log(`\n(cleaned up ${made.length} test balances and their payments)`);
  }
  process.exit(fail ? 1 : 0);
}
