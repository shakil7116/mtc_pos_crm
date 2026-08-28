import { describe, it, expect } from "vitest";
import {
  countsForProfit, countsForBalance, isOpeningBalance,
} from "../shared/transactionMode";
import { aggregateInvoiceProfit } from "../server/storage";

// An opening balance is a debt carried in from before the system. The customer
// really owes it — but nobody sold anything today. Counting it as profit would
// report the whole outstanding balance as pure margin.

const real = { transactionMode: "real" };
const demo = { transactionMode: "demo" };
const opening = { transactionMode: "opening" };
const legacy = { transactionMode: null };      // rows written before the field existed

describe("countsForProfit — did we actually sell something?", () => {
  it("counts a real trade", () => {
    expect(countsForProfit(real)).toBe(true);
  });

  it("counts a legacy row with no mode set", () => {
    // NULL must behave as "real", or every pre-existing invoice vanishes from profit.
    expect(countsForProfit(legacy)).toBe(true);
    expect(countsForProfit({})).toBe(true);
  });

  it("excludes practice data", () => {
    expect(countsForProfit(demo)).toBe(false);
  });

  it("excludes an opening balance — this is the whole point", () => {
    expect(countsForProfit(opening)).toBe(false);
  });
});

describe("countsForBalance — is this real money owed?", () => {
  it("counts a real trade", () => {
    expect(countsForBalance(real)).toBe(true);
  });

  it("COUNTS an opening balance — the customer really has to pay it", () => {
    expect(countsForBalance(opening)).toBe(true);
  });

  it("still excludes practice data", () => {
    expect(countsForBalance(demo)).toBe(false);
  });

  it("counts legacy rows", () => {
    expect(countsForBalance(legacy)).toBe(true);
    expect(countsForBalance({})).toBe(true);
  });
});

describe("the two questions must not be collapsed into one", () => {
  it("an opening balance answers them differently", () => {
    expect(countsForProfit(opening)).toBe(false);
    expect(countsForBalance(opening)).toBe(true);
    expect(countsForProfit(opening)).not.toBe(countsForBalance(opening));
  });

  it("every other mode answers them the same way", () => {
    for (const d of [real, demo, legacy]) {
      expect(countsForProfit(d)).toBe(countsForBalance(d));
    }
  });
});

describe("isOpeningBalance", () => {
  it("identifies only carried-in balances", () => {
    expect(isOpeningBalance(opening)).toBe(true);
    expect(isOpeningBalance(real)).toBe(false);
    expect(isOpeningBalance(demo)).toBe(false);
    expect(isOpeningBalance({})).toBe(false);
  });
});

describe("what this prevents, in money", () => {
  it("an old QAR 5,000 debt does not appear as QAR 5,000 profit", () => {
    // Carried-in invoices have no cost lines. If they reached the profit
    // aggregate, the fallback (total - cogs) would report the entire balance
    // as margin.
    const carried = [{ id: 1, total: "5000", status: "unpaid" }];
    const wrong = aggregateInvoiceProfit(carried as any, {}, {});
    expect(wrong.expectedProfit).toBe(5000);   // what WOULD happen if it got through

    // Filtered out first, it contributes nothing.
    const filtered = carried.filter(() => countsForProfit(opening));
    const right = aggregateInvoiceProfit(filtered as any, {}, {});
    expect(right.expectedProfit).toBe(0);
    expect(right.invoiceCount).toBe(0);
  });

  it("but the customer still owes it", () => {
    expect(countsForBalance(opening)).toBe(true);
  });
});
