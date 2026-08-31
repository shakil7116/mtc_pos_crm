import { describe, it, expect } from "vitest";
import { readSwap, swapNeedsApproval, describeSwap } from "@shared/stockSwap";

/* The owner's own example: a customer needs white, somebody hands over the white
   bought earlier. Same size, same price, never went through the system — and two
   counts later, one product is short and another is over. */

const paintForPaint = {
  outProductId: 1, outQty: 2, outCost: 55,
  inProductId: 2, inQty: 2, inCost: 55,
};

describe("a straight swap", () => {
  it("balances when both sides are worth the same", () => {
    const s = readSwap(paintForPaint);
    expect(s.outValue).toBe(110);
    expect(s.inValue).toBe(110);
    expect(s.difference).toBe(0);
    expect(s.even).toBe(true);
  });

  it("does not need anybody's permission", () => {
    expect(swapNeedsApproval(readSwap(paintForPaint), 250)).toBe(false);
  });
});

describe("when the two sides differ", () => {
  it("is DOWN when what went out was worth more", () => {
    const s = readSwap({ ...paintForPaint, inCost: 52 });
    expect(s.difference).toBe(6);          // 110 out, 104 in
    expect(s.even).toBe(false);
  });

  it("is UP when what came back was worth more", () => {
    const s = readSwap({ ...paintForPaint, inCost: 60 });
    expect(s.difference).toBe(-10);
  });

  it("measures how lopsided it is", () => {
    const s = readSwap({ outProductId: 1, outQty: 1, outCost: 100, inProductId: 2, inQty: 1, inCost: 40 });
    expect(s.difference).toBe(60);
    expect(s.driftPct).toBe(60);
  });

  it("handles different quantities on each side — two 4L tins for one 8L", () => {
    const s = readSwap({ outProductId: 1, outQty: 2, outCost: 55, inProductId: 2, inQty: 1, inCost: 108 });
    expect(s.outValue).toBe(110);
    expect(s.inValue).toBe(108);
    expect(s.difference).toBe(2);
  });
});

describe("what is refused", () => {
  it("refuses swapping a product for itself — that is a correction", () => {
    expect(() => readSwap({ ...paintForPaint, inProductId: 1 }))
      .toThrow(/count the shelf instead/i);
  });

  it("refuses a missing side", () => {
    expect(() => readSwap({ ...paintForPaint, inProductId: 0 })).toThrow(/both sides/i);
  });

  it("refuses a quantity of nothing", () => {
    expect(() => readSwap({ ...paintForPaint, outQty: 0 })).toThrow(/greater than zero/i);
    expect(() => readSwap({ ...paintForPaint, inQty: -2 })).toThrow(/greater than zero/i);
  });

  it("refuses a quantity that is not a number", () => {
    expect(() => readSwap({ ...paintForPaint, outQty: "two" })).toThrow(/must be numbers/i);
  });
});

describe("when somebody else has to agree", () => {
  it("lets the everyday swap through, because staff already do it all day", () => {
    const small = readSwap({ ...paintForPaint, inCost: 52 });   // QAR 6 apart
    expect(swapNeedsApproval(small, 250)).toBe(false);
  });

  it("stops a lopsided one — cement for a tin of paint is theft with extra steps", () => {
    const lopsided = readSwap({ outProductId: 1, outQty: 100, outCost: 14, inProductId: 2, inQty: 1, inCost: 55 });
    expect(lopsided.difference).toBe(1345);
    expect(swapNeedsApproval(lopsided, 250)).toBe(true);
  });

  it("stops one that is lopsided the OTHER way too — an unexplained gain is a question", () => {
    const suspicious = readSwap({ outProductId: 1, outQty: 1, outCost: 10, inProductId: 2, inQty: 10, inCost: 55 });
    expect(suspicious.difference).toBe(-540);
    expect(swapNeedsApproval(suspicious, 250)).toBe(true);
  });

  it("asks at exactly the limit", () => {
    const exact = readSwap({ outProductId: 1, outQty: 1, outCost: 250, inProductId: 2, inQty: 1, inCost: 0 });
    expect(swapNeedsApproval(exact, 250)).toBe(true);
  });

  it("never asks when no limit is set", () => {
    const lopsided = readSwap({ outProductId: 1, outQty: 100, outCost: 14, inProductId: 2, inQty: 1, inCost: 55 });
    expect(swapNeedsApproval(lopsided, 0)).toBe(false);
    expect(swapNeedsApproval(lopsided, null)).toBe(false);
  });
});

describe("what the record says", () => {
  it("names both halves and the gap", () => {
    const s = readSwap({ ...paintForPaint, inCost: 52 });
    expect(describeSwap(s, "WHITE PAINT A 4L", "WHITE PAINT B 4L", "Store 1"))
      .toBe("2 × WHITE PAINT A 4L out, 2 × WHITE PAINT B 4L in at Store 1 (QAR 6.00 down)");
  });

  it("says so plainly when the swap came out ahead", () => {
    const s = readSwap({ ...paintForPaint, inCost: 60 });
    expect(describeSwap(s, "A", "B")).toContain("QAR 10.00 up");
  });

  it("says same value when it balances", () => {
    expect(describeSwap(readSwap(paintForPaint), "A", "B")).toContain("same value");
  });
});
