import { describe, it, expect } from "vitest";
import { creditNoteTotal, methodInstrument, InsufficientFundsError } from "../server/storage";

// The dashboard deducts credit-note totals from revenue. So the CN total must be
// the credit the customer ACTUALLY received — not the value of the goods that
// came back. These two numbers differ whenever an item comes back damaged:
// ReturnModal only sums items in "original" condition into the refund.

describe("creditNoteTotal — the zero-refund bug", () => {
  it("keeps an explicit zero refund at zero", () => {
    // Damage claim: goods worth 500 came back, none resaleable, customer got
    // nothing. Deducting 500 from revenue would be inventing a refund.
    // The old `refundAmt || rvTotal` returned 500 here.
    expect(creditNoteTotal(0, 500)).toBe(0);
    expect(creditNoteTotal("0", 500)).toBe(0);
    expect(creditNoteTotal("0.00", 500)).toBe(0);
  });

  it("uses the refund when one was actually paid", () => {
    expect(creditNoteTotal(300, 500)).toBe(300);
    expect(creditNoteTotal("300.00", 500)).toBe(300);
  });

  it("handles a partial refund — one item original, one damaged", () => {
    // 300 resaleable + 200 damaged = 500 goods, but only 300 refunded.
    expect(creditNoteTotal("300", 500)).toBe(300);
  });

  it("falls back to goods value only for legacy rows with no refundAmount at all", () => {
    expect(creditNoteTotal(null, 500)).toBe(500);
    expect(creditNoteTotal(undefined, 500)).toBe(500);
    expect(creditNoteTotal("", 500)).toBe(500);
  });

  it("never returns NaN on a malformed amount", () => {
    expect(creditNoteTotal("abc", 500)).toBe(0);
    expect(Number.isNaN(creditNoteTotal("abc", 500))).toBe(false);
  });

  it("distinguishes a real zero from a missing value — the whole point", () => {
    expect(creditNoteTotal(0, 500)).not.toBe(creditNoteTotal(null, 500));
  });
});

describe("methodInstrument", () => {
  it("routes cash refunds to the cash drawer", () => {
    expect(methodInstrument("Cash")).toBe("cash");
  });

  it("routes everything else to the bank", () => {
    expect(methodInstrument("Bank Transfer")).toBe("bank");
  });

  it("pairs with the refund-method coercion: returns are only ever Cash or Bank Transfer", () => {
    // approveReturn coerces any non-"Bank Transfer" method down to Cash, so the
    // instrument is always deterministic — never PDC, never card.
    for (const m of ["Cash", "Bank Transfer"]) {
      expect(["cash", "bank"]).toContain(methodInstrument(m));
    }
  });
});

describe("InsufficientFundsError", () => {
  it("is a real Error so route handlers can catch it", () => {
    const e = new InsufficientFundsError("cash", 500, 100, "Return refund RV-001");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("InsufficientFundsError");
  });
});
