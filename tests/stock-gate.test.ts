import { describe, it, expect } from "vitest";
import { canPickForSale, isStockCounted, stockLabel } from "../shared/stockGate";

// The shop has ~4,000 products; ~40 sell regularly and get counted. The rest are
// registered for their cost and price but their quantity is unknown. If the sales
// screen gates on quantity alone, that entire long tail becomes unbillable.

const counted = { active: true, trackStock: true };
const uncounted = { active: true, trackStock: false };

describe("canPickForSale — counted products (your ~40 fast movers)", () => {
  it("can be billed when stock is on hand", () => {
    expect(canPickForSale(counted, 240, true)).toBe(true);
  });

  it("is hidden at zero — that zero is real, so billing it would sell air", () => {
    expect(canPickForSale(counted, 0, true)).toBe(false);
  });

  it("is hidden at a negative quantity too", () => {
    expect(canPickForSale(counted, -5, true)).toBe(false);
  });
});

describe("canPickForSale — uncounted products (your ~3,960 rare items)", () => {
  it("can ALWAYS be billed, even showing zero", () => {
    // This is the whole point. A Makita drill nobody has counted still sells.
    expect(canPickForSale(uncounted, 0, true)).toBe(true);
  });

  it("can be billed when a quantity happens to exist", () => {
    expect(canPickForSale(uncounted, 12, true)).toBe(true);
  });

  it("treats a missing trackStock value as counted (safe default)", () => {
    // Products that predate the switch must keep their old behaviour exactly.
    expect(canPickForSale({ active: true }, 0, true)).toBe(false);
    expect(canPickForSale({ active: true, trackStock: null }, 0, true)).toBe(false);
  });
});

describe("canPickForSale — other rules still apply", () => {
  it("an inactive product is never pickable, counted or not", () => {
    expect(canPickForSale({ active: false, trackStock: true }, 500, true)).toBe(false);
    expect(canPickForSale({ active: false, trackStock: false }, 500, true)).toBe(false);
  });

  it("documents that do not move stock never gate at all", () => {
    // e.g. a purchase order — you order what you do NOT have.
    expect(canPickForSale(counted, 0, false)).toBe(true);
    expect(canPickForSale(uncounted, 0, false)).toBe(true);
  });
});

describe("isStockCounted", () => {
  it("is true unless explicitly switched off", () => {
    expect(isStockCounted({ trackStock: true })).toBe(true);
    expect(isStockCounted({})).toBe(true);
    expect(isStockCounted({ trackStock: null })).toBe(true);
    expect(isStockCounted({ trackStock: false })).toBe(false);
  });
});

describe("stockLabel", () => {
  it("says the quantity for a counted product", () => {
    expect(stockLabel(counted, 240, "BAG")).toBe("240 BAG on hand");
  });

  it("never shows a misleading zero for an uncounted product", () => {
    // Showing "0 PCS on hand" would be a lie — nobody has looked.
    expect(stockLabel(uncounted, 0, "PCS")).toBe("stock not counted");
    expect(stockLabel(uncounted, 0, "PCS")).not.toContain("0");
  });
});
