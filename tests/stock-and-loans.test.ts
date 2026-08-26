import { describe, it, expect } from "vitest";
import { applyStockDelta, LOAN_TYPES, LOAN_OUT_TYPES } from "../server/storage";

// stockAdjustments.qtyChange feeds the stock-movement report, so what gets
// recorded there has to be what actually moved — not what was requested.

describe("applyStockDelta", () => {
  it("adds stock normally", () => {
    expect(applyStockDelta(10, 5)).toEqual({ newQty: 15, applied: 5, clamped: false });
  });

  it("removes stock normally", () => {
    expect(applyStockDelta(10, -4)).toEqual({ newQty: 6, applied: -4, clamped: false });
  });

  it("takes stock to exactly zero without flagging a clamp", () => {
    // All ten units left the shelf, so applied is -10 and nothing was clamped.
    expect(applyStockDelta(10, -10)).toEqual({ newQty: 0, applied: -10, clamped: false });
  });

  it("never lets stock go negative", () => {
    expect(applyStockDelta(5, -10).newQty).toBe(0);
  });

  it("reports the delta that ACTUALLY happened when it clamps", () => {
    // Only 5 were on hand, so only 5 could leave — not the 10 requested.
    // Recording -10 in the audit made inventory and its own audit disagree.
    const r = applyStockDelta(5, -10);
    expect(r.applied).toBe(-5);
    expect(r.applied).not.toBe(-10);
    expect(r.clamped).toBe(true);
  });

  it("reconciles: current + applied always equals newQty", () => {
    for (const [cur, delta] of [[10, 5], [10, -4], [5, -10], [0, -3], [0, 7], [2.5, -1.25]]) {
      const r = applyStockDelta(cur, delta);
      expect(cur + r.applied).toBeCloseTo(r.newQty, 10);
    }
  });

  it("treats an empty location as zero on hand", () => {
    expect(applyStockDelta(0, 50)).toEqual({ newQty: 50, applied: 50, clamped: false });
    expect(applyStockDelta(0, -50)).toEqual({ newQty: 0, applied: 0, clamped: true });
  });
});

describe("loan type constants", () => {
  it("knows exactly the five cash/loan types", () => {
    expect(Array.from(LOAN_TYPES).sort()).toEqual(
      ["collection", "injection", "lend_out", "profit_withdrawal", "repayment"]);
  });

  it("marks the three money-OUT types", () => {
    expect(Array.from(LOAN_OUT_TYPES).sort()).toEqual(
      ["lend_out", "profit_withdrawal", "repayment"]);
  });

  it("keeps every OUT type inside the known set", () => {
    for (const t of LOAN_OUT_TYPES) expect(LOAN_TYPES.has(t)).toBe(true);
  });

  it("treats injection and collection as money IN", () => {
    expect(LOAN_OUT_TYPES.has("injection")).toBe(false);
    expect(LOAN_OUT_TYPES.has("collection")).toBe(false);
  });

  it("rejects typos and unknown types — createOwnerLoan now throws on these", () => {
    for (const bad of ["Injection", "withdraw", "loan", "", "profit-withdrawal"]) {
      expect(LOAN_TYPES.has(bad), `"${bad}" must not be a valid type`).toBe(false);
    }
  });

  it("classifies profit_withdrawal as money out but never as a settlement", () => {
    // It is an owner draw: cash leaves, but it settles no parent injection.
    expect(LOAN_OUT_TYPES.has("profit_withdrawal")).toBe(true);
    expect(LOAN_TYPES.has("profit_withdrawal")).toBe(true);
  });
});
