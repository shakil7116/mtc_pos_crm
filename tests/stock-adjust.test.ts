import { describe, it, expect } from "vitest";
import {
  readAdjustment, needsSecondPerson, describeAdjustment,
  ADD_REASONS, REMOVE_REASONS, LOSING_REASONS, FORBIDDEN_REASONS,
} from "@shared/stockAdjust";

/* Changing a quantity by hand — the most dangerous action in the system.
   These are the rules the screen and the server both enforce. */

const base = { reasonCode: "lost", unitCost: 14 };

describe("reading a hand adjustment", () => {
  it("takes a signed quantity, the way the screens have always sent it", () => {
    const a = readAdjustment({ ...base, qtyChange: -30 });
    expect(a.direction).toBe("remove");
    expect(a.qty).toBe(30);
    expect(a.signed).toBe(-30);
  });

  it("takes a positive quantity with a direction", () => {
    const a = readAdjustment({ ...base, qty: 30, direction: "remove" });
    expect(a.signed).toBe(-30);
  });

  it("refuses a direction that contradicts the number", () => {
    expect(() => readAdjustment({ ...base, qtyChange: 30, direction: "remove" }))
      .toThrow(/says remove, but the quantity is positive/i);
    expect(() => readAdjustment({ reasonCode: "purchase", qtyChange: -5, direction: "add" }))
      .toThrow(/says add, but the quantity is negative/i);
  });

  it("prices it at what the material cost", () => {
    expect(readAdjustment({ ...base, qtyChange: -30 }).value).toBe(420);
  });

  it("refuses a change of nothing", () => {
    expect(() => readAdjustment({ ...base, qtyChange: 0 })).toThrow(/not a change/i);
  });

  it("refuses a quantity that is not a number", () => {
    expect(() => readAdjustment({ ...base, qtyChange: "thirty" as any })).toThrow(/must be a number/i);
  });

  it("refuses no reason at all", () => {
    expect(() => readAdjustment({ qtyChange: -30, reasonCode: "" })).toThrow(/Choose a reason/i);
  });
});

describe("the reason has to fit the direction", () => {
  it("refuses a customer return that REMOVES stock", () => {
    expect(() => readAdjustment({ qtyChange: -5, reasonCode: "return", unitCost: 10 }))
      .toThrow(/not a reason for removing/i);
  });

  it("refuses damage that ADDS stock", () => {
    expect(() => readAdjustment({ qtyChange: 5, reasonCode: "damaged", unitCost: 10 }))
      .toThrow(/not a reason for adding/i);
  });

  it("allows a correction either way — the figure was simply wrong", () => {
    expect(readAdjustment({ qtyChange: 5, reasonCode: "correction", unitCost: 10 }).direction).toBe("add");
    expect(readAdjustment({ qtyChange: -5, reasonCode: "correction", unitCost: 10 }).direction).toBe("remove");
  });
});

describe("what cannot be done by hand at all", () => {
  it("refuses a transfer, and says to use the real one", () => {
    expect(() => readAdjustment({ qtyChange: -100, reasonCode: "transfer", unitCost: 14 }))
      .toThrow(/somebody counting what arrives/i);
  });

  it("refuses sale and count — the system writes those when they happen", () => {
    for (const code of ["sale", "count"]) {
      expect(() => readAdjustment({ qtyChange: -1, reasonCode: code, unitCost: 1 })).toThrow();
    }
    expect(FORBIDDEN_REASONS).toContain("transfer");
  });
});

describe("which removals are losses", () => {
  it("counts damaged, expired, lost and plain removals as material gone", () => {
    for (const code of LOSING_REASONS) {
      expect(readAdjustment({ qtyChange: -2, reasonCode: code, unitCost: 10 }).isLoss).toBe(true);
    }
  });

  it("does NOT count a correction — the figure was wrong, nothing went anywhere", () => {
    expect(readAdjustment({ qtyChange: -2, reasonCode: "correction", unitCost: 10 }).isLoss).toBe(false);
  });

  it("never counts adding stock as a loss", () => {
    for (const code of ADD_REASONS) {
      expect(readAdjustment({ qtyChange: 2, reasonCode: code, unitCost: 10 }).isLoss).toBe(false);
    }
  });
});

describe("when a second person is needed", () => {
  const big = readAdjustment({ qtyChange: -100, reasonCode: "lost", unitCost: 14 });    // QAR 1400
  const small = readAdjustment({ qtyChange: -10, reasonCode: "lost", unitCost: 14 });   // QAR 140

  it("stops a big removal until somebody agrees", () => {
    expect(needsSecondPerson(big, 1000)).toBe(true);
  });

  it("lets a small one through", () => {
    expect(needsSecondPerson(small, 1000)).toBe(false);
  });

  it("never asks for approval to ADD stock — finding stock destroys nothing", () => {
    const found = readAdjustment({ qtyChange: 100, reasonCode: "correction", unitCost: 14 });
    expect(needsSecondPerson(found, 1000)).toBe(false);
  });

  it("asks at exactly the limit, not a riyal above it", () => {
    const exact = readAdjustment({ qtyChange: -100, reasonCode: "lost", unitCost: 10 });  // QAR 1000
    expect(needsSecondPerson(exact, 1000)).toBe(true);
  });

  it("never asks when no limit is set", () => {
    expect(needsSecondPerson(big, 0)).toBe(false);
    expect(needsSecondPerson(big, null)).toBe(false);
  });

  it("cannot be dodged by a product with no cost — such a removal is worth nothing to approve", () => {
    const free = readAdjustment({ qtyChange: -500, reasonCode: "lost", unitCost: 0 });
    expect(free.value).toBe(0);
    expect(needsSecondPerson(free, 1000)).toBe(false);
  });
});

describe("what the log says", () => {
  it("names the action, the amount, the place and the money", () => {
    const a = readAdjustment({ qtyChange: -30, reasonCode: "lost", unitCost: 14 });
    expect(describeAdjustment(a, "OPC CEMENT 50KG BAG", "Store 1"))
      .toBe("Remove 30 × OPC CEMENT 50KG BAG at Store 1 (QAR 420.00)");
  });

  it("leaves the money out when nothing knows the cost", () => {
    const a = readAdjustment({ qtyChange: 4, reasonCode: "purchase", unitCost: 0 });
    expect(describeAdjustment(a, "SAND", "Yard")).toBe("Add 4 × SAND at Yard");
  });
});

describe("the reason lists", () => {
  it("keep add and remove reasons apart", () => {
    expect(ADD_REASONS).toContain("purchase");
    expect(REMOVE_REASONS).toContain("damaged");
    expect(ADD_REASONS).not.toContain("damaged");
    expect(REMOVE_REASONS).not.toContain("purchase");
  });
});
