import { describe, it, expect } from "vitest";
import {
  reconcileReceipt, requireShortageReason, lineUnitCost, LOSS_KINDS,
} from "@shared/stockLoss";

/* Receiving a transfer with what ACTUALLY arrived.
   100 bags leave, 70 arrive: the 30 must become a priced, explained loss — not
   30 phantom bags on a shelf at the destination. */

const line = (over: Partial<any> = {}) => ({
  id: 1, productId: 5, description: "OPC CEMENT 50KG BAG", unit: "BAG",
  qty: 100, linePrice: 0, productCost: 14, ...over,
});

describe("what arrived", () => {
  it("takes an uncounted line as arriving in full — one-click receipt still works", () => {
    const r = reconcileReceipt([line()], undefined);
    expect(r.lines[0].received).toBe(100);
    expect(r.hasShortage).toBe(false);
    expect(r.lossValue).toBe(0);
  });

  it("counts the shortage when less turns up", () => {
    const r = reconcileReceipt([line()], [{ id: 1, receivedQty: 70 }]);
    expect(r.lines[0].received).toBe(70);
    expect(r.lines[0].short).toBe(30);
    expect(r.totalShort).toBe(30);
    expect(r.hasShortage).toBe(true);
    expect(r.shortLines).toBe(1);
  });

  it("prices the shortage at what the material cost", () => {
    const r = reconcileReceipt([line()], [{ id: 1, receivedQty: 70 }]);
    expect(r.lossValue).toBe(420);          // 30 bags × QAR 14
  });

  it("accepts nothing arriving at all", () => {
    const r = reconcileReceipt([line()], [{ id: 1, receivedQty: 0 }]);
    expect(r.lines[0].received).toBe(0);
    expect(r.totalShort).toBe(100);
    expect(r.lossValue).toBe(1400);
  });

  it("refuses more than was sent — that is a different delivery", () => {
    expect(() => reconcileReceipt([line()], [{ id: 1, receivedQty: 120 }]))
      .toThrow(/only 100 was sent/i);
  });

  it("refuses a negative quantity", () => {
    expect(() => reconcileReceipt([line()], [{ id: 1, receivedQty: -5 }]))
      .toThrow(/cannot be less than none/i);
  });

  it("refuses something that is not a number", () => {
    expect(() => reconcileReceipt([line()], [{ id: 1, receivedQty: "seventy" }]))
      .toThrow(/not a number/i);
  });

  it("handles several lines, only some short", () => {
    const r = reconcileReceipt(
      [line(), line({ id: 2, description: "WHITE PAINT 4L", qty: 10, productCost: 55 })],
      [{ id: 2, receivedQty: 8 }],
    );
    expect(r.totalSent).toBe(110);
    expect(r.totalReceived).toBe(108);
    expect(r.totalShort).toBe(2);
    expect(r.lossValue).toBe(110);          // 2 × 55; the cement line was full
    expect(r.shortLines).toBe(1);
  });

  it("copes with fractions — sand and cable are not whole numbers", () => {
    const r = reconcileReceipt([line({ qty: 12.5, productCost: 8 })], [{ id: 1, receivedQty: 11.25 }]);
    expect(r.totalShort).toBe(1.25);
    expect(r.lossValue).toBe(10);
  });
});

describe("what a missing item is worth", () => {
  it("uses the cost the transfer was priced at, when it carries one", () => {
    expect(lineUnitCost({ id: 1, productId: 5, description: "X", qty: 1, linePrice: 12.5, productCost: 14 }))
      .toBe(12.5);
  });

  it("falls back to the product cost — a same-owner move is priced at zero, but a lost bag still cost money", () => {
    expect(lineUnitCost({ id: 1, productId: 5, description: "X", qty: 1, linePrice: 0, productCost: 14 }))
      .toBe(14);
  });

  it("is zero rather than NaN when nothing knows the cost", () => {
    expect(lineUnitCost({ id: 1, productId: null, description: "X", qty: 1 })).toBe(0);
  });
});

describe("a shortage has to be explained", () => {
  it("demands a reason, and says what is missing and what it cost", () => {
    const r = reconcileReceipt([line()], [{ id: 1, receivedQty: 70 }]);
    expect(() => requireShortageReason(r, "")).toThrow(/30 item\(s\) are missing/);
    expect(() => requireShortageReason(r, "")).toThrow(/420\.00/);
  });

  it("rejects a token keypress", () => {
    const r = reconcileReceipt([line()], [{ id: 1, receivedQty: 70 }]);
    expect(() => requireShortageReason(r, "x")).toThrow();
  });

  it("accepts a real note", () => {
    const r = reconcileReceipt([line()], [{ id: 1, receivedQty: 70 }]);
    expect(() => requireShortageReason(r, "30 bags left at the gate, driver returning tomorrow")).not.toThrow();
  });

  it("asks for nothing when everything arrived", () => {
    const r = reconcileReceipt([line()], [{ id: 1, receivedQty: 100 }]);
    expect(() => requireShortageReason(r, "")).not.toThrow();
  });
});

describe("kinds of loss", () => {
  it("keeps transfer shortage alongside counts, damage and write-offs so they total together", () => {
    expect(LOSS_KINDS).toContain("transfer_shortage");
    expect(LOSS_KINDS).toContain("count_variance");
    expect(LOSS_KINDS).toContain("damage");
    expect(LOSS_KINDS).toContain("write_off");
  });
});
