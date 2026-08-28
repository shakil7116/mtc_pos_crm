// Proves the supplier opening-balance flow, then removes what it made.
//
// Scenario: a supplier is owed QAR 50,000 across three old invoices on 30/60/90 day
// terms, and gets paid QAR 30,000.
//
// Run: npx tsx scripts/verify-supplier-balances.ts
import "dotenv/config";
import {
  createSupplierOpeningBalance, getSupplierOpenOrders, paySupplierOldestFirst,
  getSuppliers, getProfitSummary, getProductQtyAt, getProducts,
} from "../server/storage";
import { db } from "../server/db";
import { supplierOrders, supplierPayments, cashflow } from "@shared/schema";
import { inArray, eq } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};
const QAR = (n: number) => "QAR " + Number(n).toFixed(2);
const made: number[] = [];

try {
  const sups: any[] = await getSuppliers();
  const sup = sups[0];
  if (!sup) throw new Error("no supplier to test with");

  const profitBefore = await getProfitSummary();
  const openBefore = await getSupplierOpenOrders(sup.id);
  const owedBefore = openBefore.reduce((s, o) => s + o.remaining, 0);

  const products: any[] = await getProducts();
  const probe = products[0];
  const stockBefore = probe ? await getProductQtyAt(probe.id, 1) : 0;

  console.log(`\nsupplier: ${sup.name}${sup.company ? " — " + sup.company : ""}`);
  console.log(`  owed now       : ${QAR(owedBefore)}`);
  console.log(`  expected profit: ${QAR(profitBefore.expectedProfit)}`);

  console.log("\n1. Enter three old supplier invoices — 50,000 on 30/60/90 day terms");
  const rows = [
    { date: "2026-05-10", amount: 20000, paymentTermsDays: 90, invoiceNumber: `ZZS-A-${Date.now()}` },
    { date: "2026-06-18", amount: 18000, paymentTermsDays: 60, invoiceNumber: `ZZS-B-${Date.now()}` },
    { date: "2026-07-25", amount: 12000, paymentTermsDays: 30, invoiceNumber: `ZZS-C-${Date.now()}` },
  ];
  for (const r of rows) {
    const o: any = await createSupplierOpeningBalance({ supplierId: sup.id, ...r, notes: "verification" });
    made.push(o.id);
  }
  ok(made.length === 3, "three supplier balances created");

  const open = await getSupplierOpenOrders(sup.id);
  const owed = open.reduce((s, o) => s + o.remaining, 0);
  // Any supplier payment that never named an order is absorbed by the oldest debt
  // — money genuinely paid must not keep showing as outstanding. So the rise can be
  // less than 50,000 if such a payment was sitting there with nothing to attach to.
  const absorbed = Number((owedBefore + 50000 - owed).toFixed(2));
  ok(owed > owedBefore && owed <= owedBefore + 50000.01,
     "the balances are now outstanding",
     `${QAR(owedBefore)} -> ${QAR(owed)}` + (absorbed > 0.005 ? `  (${QAR(absorbed)} absorbed by an earlier unlinked payment)` : ""));

  console.log("\n2. Terms clock runs from the ORIGINAL date, not today");
  const a = open.find((o) => o.invoiceNumber === rows[0].invoiceNumber);
  ok(a?.dueDate === "2026-08-08", "90 days from 2026-05-10 = 2026-08-08", String(a?.dueDate));
  const c = open.find((o) => o.invoiceNumber === rows[2].invoiceNumber);
  ok(c?.dueDate === "2026-08-24", "30 days from 2026-07-25 = 2026-08-24", String(c?.dueDate));

  console.log("\n3. NO stock was invented — the goods arrived months ago");
  const stockAfter = probe ? await getProductQtyAt(probe.id, 1) : 0;
  ok(stockAfter === stockBefore, "stock is untouched", `${stockBefore} -> ${stockAfter}`);

  console.log("\n4. Profit untouched — this is money owed, not money earned");
  const profitAfter = await getProfitSummary();
  ok(Math.abs(profitAfter.expectedProfit - profitBefore.expectedProfit) < 0.01,
     "expected profit unchanged", QAR(profitAfter.expectedProfit));

  console.log("\n5. Pay QAR 30,000 — oldest bill first");
  const r = await paySupplierOldestFirst({
    supplierId: sup.id, amount: 30000, method: "Cash",
    date: new Date().toISOString().slice(0, 10),
    notes: "verification", override: true, overrideReason: "verification script",
  });
  for (const al of r.allocations) {
    console.log(`        ${al.date}  ${al.poNumber.padEnd(10)} was ${QAR(al.was).padStart(12)}  paid ${QAR(al.paid).padStart(12)}  ${al.cleared ? "CLEARED" : "still owes " + QAR(al.nowOwes)}`);
  }
  ok(r.paid === 30000, "paid the full 30,000", QAR(r.paid));
  ok(r.allocations[0].date === "2026-05-10", "the OLDEST bill was paid first", r.allocations[0].date);
  ok(r.allocations[0].cleared, "and it was cleared in full");
  const spent0 = r.allocations[0].paid;
  ok(r.allocations[1].paid === Number((30000 - spent0).toFixed(2)) && !r.allocations[1].cleared,
     "the next took only what was left and stays part-paid",
     `paid ${QAR(r.allocations[1].paid)}, still owes ${QAR(r.allocations[1].nowOwes)}`);
  ok(r.allocations.length === 2, "the newest bill was never touched", `${r.allocations.length} allocations`);

  console.log("\n6. What is left");
  const left = await getSupplierOpenOrders(sup.id);
  const owedNow = left.reduce((s, o) => s + o.remaining, 0);
  ok(Math.abs(owedNow - (owed - 30000)) < 0.01,
     "exactly 30,000 came off what was outstanding",
     `${QAR(owed)} - ${QAR(30000)} = ${QAR(owedNow)}`);

  console.log("\n7. Guards");
  let msg = "";
  try {
    await paySupplierOldestFirst({ supplierId: sup.id, amount: 999999, method: "Cash", date: "2026-08-28", override: true });
  } catch (e: any) { msg = e.message; }
  ok(/more than is owed/i.test(msg), "cannot pay more than is owed", msg.slice(0, 52));

  msg = "";
  try { await createSupplierOpeningBalance({ supplierId: sup.id, amount: 100, date: "2099-01-01" }); }
  catch (e: any) { msg = e.message; }
  ok(/future/i.test(msg), "cannot date a balance in the future");

  console.log("\n" + "-".repeat(76));
  console.log(`${pass}/${pass + fail} passed`);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  fail++;
} finally {
  if (made.length) {
    const pays = await db.select().from(supplierPayments).where(inArray(supplierPayments.poId, made));
    for (const p of pays as any[]) {
      await db.delete(cashflow).where(eq(cashflow.refId, p.id)).catch(() => {});
    }
    await db.delete(supplierPayments).where(inArray(supplierPayments.poId, made));
    await db.delete(supplierOrders).where(inArray(supplierOrders.id, made));
    console.log(`\n(cleaned up ${made.length} test balances and their payments)`);
  }
  process.exit(fail ? 1 : 0);
}
