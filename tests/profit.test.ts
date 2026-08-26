import { describe, it, expect } from "vitest";
import { aggregateInvoiceProfit } from "../server/storage";

// Gross profit is the number the owner runs the business on. Finance, Reports
// and the Dashboard all read aggregateInvoiceProfit() so they cannot disagree.
// These tests pin the contract so a future refactor cannot silently drift it.

const doc = (id: number, total: string, status: string) => ({ id, total, status });

describe("aggregateInvoiceProfit — real vs expected", () => {
  it("splits paid invoices (real) from all invoices (expected)", () => {
    const r = aggregateInvoiceProfit(
      [doc(1, "1000", "paid"), doc(2, "500", "unpaid")],
      { 1: 300, 2: 150 },
      { 1: 700, 2: 350 },
    );
    expect(r.realProfit).toBe(300);      // paid only
    expect(r.expectedProfit).toBe(450);  // paid + credit
    expect(r.realSales).toBe(1000);
    expect(r.totalSales).toBe(1500);
    expect(r.realCount).toBe(1);
    expect(r.invoiceCount).toBe(2);
  });

  it("only status exactly 'paid' counts as real money collected", () => {
    for (const s of ["partial", "unpaid", "returned", "PAID", "Paid", ""]) {
      const r = aggregateInvoiceProfit([doc(1, "100", s)], { 1: 40 }, { 1: 60 });
      expect(r.realProfit, `status "${s}" must not count as real`).toBe(0);
      expect(r.realCount).toBe(0);
    }
  });

  it("keeps imaginaryProfit as an exact alias of expectedProfit (back-compat)", () => {
    const r = aggregateInvoiceProfit([doc(1, "800", "unpaid")], { 1: 123.45 }, { 1: 676.55 });
    expect(r.imaginaryProfit).toBe(r.expectedProfit);
  });
});

describe("aggregateInvoiceProfit — the ?? fallback", () => {
  // profitByDoc[id] ?? (total - cogs) uses ?? and NOT ||. The difference is the
  // whole ballgame: an invoice whose real item-level profit is 0 must stay 0,
  // not silently fall back to (total - cogs).
  it("preserves a genuine zero item-level profit instead of falling back", () => {
    const r = aggregateInvoiceProfit([doc(1, "1000", "paid")], { 1: 0 }, { 1: 250 });
    expect(r.realProfit).toBe(0);          // ?? keeps the 0
    expect(r.realProfit).not.toBe(750);    // || would have produced this
  });

  it("falls back to (total - cogs) only when the doc has no item rows at all", () => {
    const r = aggregateInvoiceProfit([doc(1, "1000", "paid")], {}, { 1: 250 });
    expect(r.realProfit).toBe(750);
  });

  it("treats a missing cogs entry as zero, not NaN", () => {
    const r = aggregateInvoiceProfit([doc(1, "1000", "paid")], {}, {});
    expect(r.realProfit).toBe(1000);
    expect(Number.isNaN(r.realProfit)).toBe(false);
  });
});

describe("aggregateInvoiceProfit — margin guards", () => {
  it("returns 0 margin rather than NaN or Infinity when there are no sales", () => {
    const r = aggregateInvoiceProfit([], {}, {});
    expect(r.realMargin).toBe(0);
    expect(r.expectedMargin).toBe(0);
    expect(Number.isFinite(r.realMargin)).toBe(true);
    expect(Number.isFinite(r.expectedMargin)).toBe(true);
  });

  it("never divides by zero when an invoice totals 0", () => {
    const r = aggregateInvoiceProfit([doc(1, "0", "paid")], { 1: 0 }, { 1: 0 });
    expect(r.realMargin).toBe(0);
    expect(r.expectedMargin).toBe(0);
  });

  it("computes margin as a percentage of sales", () => {
    const r = aggregateInvoiceProfit([doc(1, "1000", "paid")], { 1: 250 }, { 1: 750 });
    expect(r.realMargin).toBe(25);
  });
});

describe("aggregateInvoiceProfit — QAR rounding", () => {
  it("rounds money to 2 decimals after summing, not during", () => {
    const r = aggregateInvoiceProfit(
      [doc(1, "33.335", "paid"), doc(2, "33.335", "paid"), doc(3, "33.335", "paid")],
      { 1: 33.335, 2: 33.335, 3: 33.335 }, {},
    );
    // Rounding happens ONCE, after summing: 33.335*3 = 100.00499999999998 -> 100.00.
    // Rounding each row first would give 33.34*3 = 100.02. The 0.02 QAR gap is the
    // whole point - move the rounding into the loop and this test goes red.
    expect(r.realProfit).toBe(100);
    expect(r.realProfit).not.toBe(100.02);
  });

  it("leaves counts unrounded and integral", () => {
    const r = aggregateInvoiceProfit(
      [doc(1, "10", "paid"), doc(2, "10", "paid"), doc(3, "10", "unpaid")], {}, {},
    );
    expect(r.realCount).toBe(2);
    expect(r.invoiceCount).toBe(3);
    expect(Number.isInteger(r.realCount)).toBe(true);
  });

  it("accepts drizzle numeric strings, which is how rows actually arrive", () => {
    const r = aggregateInvoiceProfit([doc(1, "1945.50", "paid")], {}, { 1: 1000 });
    expect(r.realSales).toBe(1945.5);
    expect(r.realProfit).toBe(945.5);
  });
});
