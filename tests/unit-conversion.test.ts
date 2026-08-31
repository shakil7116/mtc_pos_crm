import { describe, it, expect } from "vitest";
import {
  unitFactor, hasPack, toBaseQty, fromBaseQty, toBaseCost,
  splitPacks, formatQty, unitOptions, validatePack,
} from "@shared/unit";

/* A unit used to be only a word. Receiving 10 boxes added 10, selling 120 pieces
   took away 120, and the shelf figure was nonsense within a week. */

const tile = { unit: "PCS", packUnit: "BOX", packSize: 12 };
const cement = { unit: "BAG", packUnit: null, packSize: null };

describe("what a unit is worth", () => {
  it("counts a box as its pieces", () => {
    expect(unitFactor("BOX", tile)).toBe(12);
  });

  it("counts the base unit as one", () => {
    expect(unitFactor("PCS", tile)).toBe(1);
  });

  it("ignores case and stray spaces — people type what they type", () => {
    expect(unitFactor(" box ", tile)).toBe(12);
  });

  it("treats an unknown unit as the base rather than guessing", () => {
    expect(unitFactor("CARTON", tile)).toBe(1);
  });

  it("is one for a product with no pack at all", () => {
    expect(unitFactor("BAG", cement)).toBe(1);
    expect(hasPack(cement)).toBe(false);
  });

  it("refuses to treat a pack of one as a pack", () => {
    expect(hasPack({ unit: "PCS", packUnit: "BOX", packSize: 1 })).toBe(false);
    expect(unitFactor("BOX", { unit: "PCS", packUnit: "BOX", packSize: 1 })).toBe(1);
  });
});

describe("quantities", () => {
  it("puts 120 pieces on the shelf for 10 boxes", () => {
    expect(toBaseQty(10, "BOX", tile)).toBe(120);
  });

  it("leaves pieces alone", () => {
    expect(toBaseQty(120, "PCS", tile)).toBe(120);
  });

  it("converts back the other way for display", () => {
    expect(fromBaseQty(120, "BOX", tile)).toBe(10);
  });

  it("handles halves — half a box of 12 is 6", () => {
    expect(toBaseQty(0.5, "BOX", tile)).toBe(6);
  });

  it("is zero rather than NaN for nonsense", () => {
    expect(toBaseQty("abc" as any, "BOX", tile)).toBe(0);
  });
});

describe("costs", () => {
  it("turns QAR 120 a box into QAR 10 a piece", () => {
    expect(toBaseCost(120, "BOX", tile)).toBe(10);
  });

  it("leaves a per-piece cost alone", () => {
    expect(toBaseCost(10, "PCS", tile)).toBe(10);
  });

  it("does not touch a product with no pack", () => {
    expect(toBaseCost(14, "BAG", cement)).toBe(14);
  });
});

describe("what a person walking to the rack needs", () => {
  it("splits 127 pieces into ten boxes and seven loose", () => {
    expect(splitPacks(127, tile)).toEqual({ packs: 10, loose: 7 });
  });

  it("says exactly ten boxes when it is exact", () => {
    expect(splitPacks(120, tile)).toEqual({ packs: 10, loose: 0 });
  });

  it("leaves everything loose below one box", () => {
    expect(splitPacks(7, tile)).toEqual({ packs: 0, loose: 7 });
  });

  it("writes it the way it would be said aloud", () => {
    expect(formatQty(127, tile)).toBe("127 PCS (10 BOX + 7)");
    expect(formatQty(120, tile)).toBe("120 PCS (10 BOX)");
    expect(formatQty(7, tile)).toBe("7 PCS");
    expect(formatQty(40, cement)).toBe("40 BAG");
  });

  it("offers both units for entry, biggest first", () => {
    expect(unitOptions(tile)).toEqual(["BOX", "PCS"]);
    expect(unitOptions(cement)).toEqual(["BAG"]);
  });
});

describe("a pack setup that would corrupt stock is refused", () => {
  it("allows no pack at all", () => {
    expect(() => validatePack(cement)).not.toThrow();
    expect(() => validatePack({ unit: "PCS" })).not.toThrow();
  });

  it("allows a proper one", () => {
    expect(() => validatePack(tile)).not.toThrow();
  });

  it("refuses a size with no name", () => {
    expect(() => validatePack({ unit: "PCS", packSize: 12 })).toThrow(/needs a name/i);
  });

  it("refuses a name with no size", () => {
    expect(() => validatePack({ unit: "PCS", packUnit: "BOX" })).toThrow(/how many/i);
  });

  it("refuses a pack of one — that is just the same unit", () => {
    expect(() => validatePack({ unit: "PCS", packUnit: "BOX", packSize: 1 })).toThrow(/more than one/i);
  });

  it("refuses a pack named the same as the base unit", () => {
    expect(() => validatePack({ unit: "BOX", packUnit: "BOX", packSize: 12 })).toThrow(/different from/i);
  });
});
