import { describe, it, expect } from "vitest";
import { resolveItemCost, aggregateInvoiceProfit } from "../server/storage";

// Profit used to re-read products.cost_price at REPORT time. That meant changing a
// supplier's cost silently rewrote the margin on every invoice ever sold. Cost is
// now frozen onto the line at the moment of sale; the current cost is only a
// fallback for rows written before the column existed.

describe("resolveItemCost", () => {
  it("prefers the cost pinned at the moment of sale", () => {
    // Bought at 8, supplier later raised it to 12. The old sale still cost 8.
    expect(resolveItemCost("8.00", "12.00")).toBe(8);
  });

  it("keeps a genuine zero pinned cost — it does not fall back", () => {
    // A giveaway or zero-cost line must stay at zero margin cost, not inherit
    // whatever the product costs today.
    expect(resolveItemCost(0, "12.00")).toBe(0);
    expect(resolveItemCost("0", "12.00")).toBe(0);
    expect(resolveItemCost("0.00", "12.00")).toBe(0);
  });

  it("falls back to current cost for legacy rows with no snapshot", () => {
    expect(resolveItemCost(null, "12.00")).toBe(12);
    expect(resolveItemCost(undefined, "12.00")).toBe(12);
    expect(resolveItemCost("", "12.00")).toBe(12);
  });

  it("falls back when the pinned value is malformed", () => {
    expect(resolveItemCost("abc", "12.00")).toBe(12);
  });

  it("returns 0 rather than NaN when neither value is usable", () => {
    expect(resolveItemCost(null, null)).toBe(0);
    expect(resolveItemCost(undefined, undefined)).toBe(0);
    expect(resolveItemCost("", "abc")).toBe(0);
    expect(Number.isNaN(resolveItemCost(null, "abc"))).toBe(false);
  });

  it("handles an unlinked line (no product row) without inventing margin", () => {
    // leftJoin gives cost = null for a line with no product. Old behaviour treated
    // that as zero cost, i.e. 100% margin. Still zero — but now visibly so.
    expect(resolveItemCost(null, null)).toBe(0);
  });

  it("distinguishes a pinned zero from a missing snapshot", () => {
    expect(resolveItemCost(0, "12.00")).not.toBe(resolveItemCost(null, "12.00"));
  });

  it("accepts drizzle numeric strings, which is how rows actually arrive", () => {
    expect(resolveItemCost("8.50", "12.00")).toBe(8.5);
  });
});

describe("pinned cost keeps historical margin stable", () => {
  it("a supplier price rise does not change an already-sold invoice", () => {
    const qty = 10, amount = 150;
    const pinned = resolveItemCost("8.00", "12.00");   // sold when cost was 8
    const profitThen = amount - pinned * qty;          // 150 - 80 = 70

    // Supplier cost later doubles. The pinned value is unchanged.
    const pinnedLater = resolveItemCost("8.00", "24.00");
    expect(amount - pinnedLater * qty).toBe(profitThen);

    // Without the snapshot the same invoice would have reported a LOSS.
    const unpinned = resolveItemCost(null, "24.00");
    expect(amount - unpinned * qty).toBe(-90);
  });

  it("feeds the canonical aggregate unchanged", () => {
    const cost = resolveItemCost("8.00", "99.00");
    const profit = 150 - cost * 10;
    const r = aggregateInvoiceProfit(
      [{ id: 1, total: "150", status: "paid" }], { 1: profit }, { 1: cost * 10 });
    expect(r.realProfit).toBe(70);
    expect(r.realCogs).toBe(80);
    expect(r.realMargin).toBeCloseTo(46.67, 2);
  });
});
