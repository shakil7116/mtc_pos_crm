import { describe, it, expect } from "vitest";
import {
  normalizeCollectability, countsAsReceivable, splitReceivables,
  COLLECTABILITY_LABEL,
} from "../shared/collectability";

// Eleven years of trust-based credit, roughly QAR 900,000 outstanding, of which
// about 500,000 is realistically collectable. Reporting one confident 900,000
// makes the business look richer than it is.

describe("normalizeCollectability", () => {
  it("defaults to normal", () => {
    expect(normalizeCollectability(undefined)).toBe("normal");
    expect(normalizeCollectability(null)).toBe("normal");
    expect(normalizeCollectability("")).toBe("normal");
  });

  it("keeps the three real values", () => {
    expect(normalizeCollectability("normal")).toBe("normal");
    expect(normalizeCollectability("doubtful")).toBe("doubtful");
    expect(normalizeCollectability("written_off")).toBe("written_off");
  });

  it("falls back to normal on anything unrecognised", () => {
    // A typo must never quietly hide a debt from the receivables total.
    expect(normalizeCollectability("bad")).toBe("normal");
    expect(normalizeCollectability("WRITTEN_OFF")).toBe("normal");
  });
});

describe("countsAsReceivable", () => {
  it("counts only what is expected", () => {
    expect(countsAsReceivable("normal")).toBe(true);
    expect(countsAsReceivable("doubtful")).toBe(false);
    expect(countsAsReceivable("written_off")).toBe(false);
  });

  it("counts an unmarked customer", () => {
    expect(countsAsReceivable(null)).toBe(true);
  });
});

describe("splitReceivables — the owner's real picture", () => {
  const book = [
    { name: "Mr Shuri",        balance: 50000, collectability: "normal" },
    { name: "Ashoku Islam",    balance: 42000, collectability: "normal" },
    { name: "Regular trader",  balance: 8000,  collectability: null },      // unmarked
    { name: "Left the country", balance: 30000, collectability: "doubtful" },
    { name: "Folded contractor", balance: 12000, collectability: "written_off" },
  ];

  it("separates what is expected from what is not", () => {
    const s = splitReceivables(book);
    expect(s.expected).toBe(100000);    // 50k + 42k + 8k
    expect(s.doubtful).toBe(30000);
    expect(s.writtenOff).toBe(12000);
  });

  it("still reports the full amount owed", () => {
    // The debt does not disappear. It is only reported honestly.
    expect(splitReceivables(book).total).toBe(142000);
  });

  it("counts customers in each state", () => {
    const s = splitReceivables(book);
    expect(s.counts.normal).toBe(3);
    expect(s.counts.doubtful).toBe(1);
    expect(s.counts.written_off).toBe(1);
  });

  it("a big balance is not doubtful by itself", () => {
    // The largest account here pays reliably every month. Size is not risk.
    const s = splitReceivables([{ balance: 50000, collectability: "normal" }]);
    expect(s.expected).toBe(50000);
    expect(s.doubtful).toBe(0);
  });

  it("ignores customers who owe nothing", () => {
    const s = splitReceivables([
      { balance: 0, collectability: "normal" },
      { balance: -500, collectability: "normal" },
      { balance: 1000, collectability: "normal" },
    ]);
    expect(s.expected).toBe(1000);
    expect(s.total).toBe(1000);
  });

  it("handles an empty book without producing NaN", () => {
    const s = splitReceivables([]);
    expect(s.total).toBe(0);
    expect(Number.isNaN(s.expected)).toBe(false);
  });

  it("rounds to fils", () => {
    const s = splitReceivables([
      { balance: 33.333, collectability: "normal" },
      { balance: 33.333, collectability: "normal" },
    ]);
    expect(s.expected).toBe(66.67);
  });
});

describe("labels say what they mean", () => {
  it("does not call written-off debt 'deleted'", () => {
    expect(COLLECTABILITY_LABEL.written_off).toBe("Written off");
    expect(COLLECTABILITY_LABEL.normal).toBe("Expected");
    expect(COLLECTABILITY_LABEL.doubtful).toBe("Doubtful");
  });
});
