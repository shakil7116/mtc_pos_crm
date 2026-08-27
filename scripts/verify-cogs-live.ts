// Read-only smoke test: proves the COGS snapshot path works against the real
// database after scripts/migrate-cogs-snapshot.mjs has run.
//
// Writes nothing. Run: npx tsx scripts/verify-cogs-live.ts
import "dotenv/config";
import { getProfitDetail, getProfitSummary, resolveItemCost } from "../server/storage";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};

const money = (n: number) => `QAR ${n.toFixed(2)}`;

try {
  console.log("\n1. resolveItemCost is wired into the live query path");
  const detail = await getProfitDetail("1970-01-01", new Date().toISOString().slice(0, 10));
  ok(typeof detail.realProfit === "number" && Number.isFinite(detail.realProfit),
     "getProfitDetail returns a finite real profit", money(detail.realProfit));
  ok(Number.isFinite(detail.expectedProfit),
     "…and a finite expected profit", money(detail.expectedProfit));
  ok(detail.invoiceCount >= 0, "…over a real invoice count", String(detail.invoiceCount));

  console.log("\n2. No item resolved to NaN (the column exists and parses)");
  const allItems = detail.invoices.flatMap((i: any) => i.items || []);
  const bad = allItems.filter((it: any) => !Number.isFinite(it.cost) || !Number.isFinite(it.profit));
  ok(bad.length === 0, "every line has a finite cost and profit",
     `${allItems.length} lines checked`);

  console.log("\n3. Finance and Reports still reconcile");
  const summary = await getProfitSummary();
  ok(Math.abs(summary.realProfit - detail.realProfit) < 0.01,
     "all-time summary matches all-time detail",
     `${money(summary.realProfit)} vs ${money(detail.realProfit)}`);
  ok(Math.abs(summary.expectedProfit - detail.expectedProfit) < 0.01,
     "expected profit matches too",
     `${money(summary.expectedProfit)} vs ${money(detail.expectedProfit)}`);

  console.log("\n4. Fallback behaviour on unpinned historical rows");
  ok(resolveItemCost(null, "12.00") === 12, "NULL snapshot falls back to current cost");
  ok(resolveItemCost("8.00", "12.00") === 8, "a pinned cost wins over current cost");
  ok(resolveItemCost(0, "12.00") === 0, "a pinned ZERO stays zero");

  console.log("\n" + "─".repeat(66));
  console.log(`${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  process.exit(1);
}
