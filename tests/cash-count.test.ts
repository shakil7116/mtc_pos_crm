import { describe, it, expect } from "vitest";
import {
  QAR_DENOMINATIONS, breakdownTotal, cleanBreakdown, cashDifference,
  expectedCash, needsExplanation, splitClose, describeCashCount,
} from "@shared/cashCount";

/* Counting the drawer at close. No system prevents a cash sale that never gets
   entered — but one day short is nothing, and the same till short every day is
   the only evidence anybody will ever get. */

describe("adding up the drawer", () => {
  it("counts notes and coins", () => {
    expect(breakdownTotal({ "500": 2, "100": 7, "50": 1, "5": 3, "0.5": 2 }))
      .toBe(1766);            // 1000 + 700 + 50 + 15 + 1
  });

  it("is zero for an empty drawer", () => {
    expect(breakdownTotal({})).toBe(0);
    expect(breakdownTotal(null)).toBe(0);
  });

  it("ignores nonsense rather than producing NaN", () => {
    expect(breakdownTotal({ "100": "abc" as any, "50": 2 })).toBe(100);
    expect(breakdownTotal({ "100": -3, "50": 2 })).toBe(100);
  });

  it("keeps only the denominations actually there", () => {
    expect(cleanBreakdown({ "500": 2, "100": 0, "50": "" as any })).toEqual({ "500": 2 });
  });

  it("offers the real Qatari notes and coins, biggest first", () => {
    expect(QAR_DENOMINATIONS[0]).toBe(500);
    expect(QAR_DENOMINATIONS).toContain(1);
    expect([...QAR_DENOMINATIONS]).toEqual([...QAR_DENOMINATIONS].sort((a, b) => b - a));
  });
});

describe("what should be in there", () => {
  it("is yesterday's float plus what came in, less what went out", () => {
    expect(expectedCash(500, 3200, 450)).toBe(3250);
  });

  it("copes with an empty day", () => {
    expect(expectedCash(0, 0, 0)).toBe(0);
  });
});

describe("the difference", () => {
  it("is short when the drawer holds less than the day says", () => {
    const d = cashDifference(3200, 3250);
    expect(d.difference).toBe(-50);
    expect(d.direction).toBe("short");
  });

  it("is over when there is more money than the day accounts for", () => {
    expect(cashDifference(3300, 3250).direction).toBe("over");
  });

  it("is exact when they match", () => {
    const d = cashDifference(3250, 3250);
    expect(d.direction).toBe("exact");
    expect(d.difference).toBe(0);
  });

  it("treats a fraction of a riyal as exact — a till is not a laboratory", () => {
    expect(cashDifference(3250.001, 3250).direction).toBe("exact");
  });
});

describe("when it has to be explained", () => {
  const short50 = cashDifference(3200, 3250);
  const shortTwo = cashDifference(3248, 3250);

  it("lets a couple of riyals pass", () => {
    expect(needsExplanation(shortTwo, 5)).toBe(false);
  });

  it("asks about a real gap", () => {
    expect(needsExplanation(short50, 5)).toBe(true);
  });

  it("asks about a SURPLUS too — unexplained extra money is also a question", () => {
    expect(needsExplanation(cashDifference(3300, 3250), 5)).toBe(true);
  });

  it("asks about everything when the tolerance is zero", () => {
    expect(needsExplanation(shortTwo, 0)).toBe(true);
    expect(needsExplanation(cashDifference(3250, 3250), 0)).toBe(false);
  });
});

describe("closing up", () => {
  it("keeps the float and banks the rest", () => {
    expect(splitClose(3250, 500)).toEqual({ keep: 500, bank: 2750 });
  });

  it("banks nothing when everything stays in", () => {
    expect(splitClose(3250, 3250)).toEqual({ keep: 3250, bank: 0 });
  });

  it("never keeps more than was counted", () => {
    expect(splitClose(200, 500)).toEqual({ keep: 200, bank: 0 });
  });
});

describe("what the record says", () => {
  it("spells out short, with both numbers", () => {
    expect(describeCashCount(cashDifference(3200, 3250), "Store 1"))
      .toBe("Till at Store 1 SHORT by QAR 50.00 — counted 3200.00, expected 3250.00");
  });

  it("says so plainly when it is exact", () => {
    expect(describeCashCount(cashDifference(3250, 3250))).toContain("counted exactly");
  });
});
