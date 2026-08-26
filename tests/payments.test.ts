import { describe, it, expect } from "vitest";
import {
  netCollected, remainingBalance, isOverpayment, paymentStatusFor,
  PAYMENT_EPSILON, STATUS_EPSILON, OverpaymentError,
} from "../server/storage";

// There is no customer-credit ledger in this system, so money that exceeds an
// invoice total has nowhere to live. It must be refused at the door, not stored.
// Fixtures use STRINGS because drizzle numeric columns arrive as strings.

const pay = (amount: string, isRefund = false) => ({ amount, isRefund });

describe("netCollected", () => {
  it("sums ordinary payments", () => {
    expect(netCollected([pay("100.00"), pay("250.50")])).toBe(350.5);
  });

  it("subtracts refunds instead of adding them", () => {
    // If this inverts, a refund flips an invoice to "paid" and the money vanishes.
    expect(netCollected([pay("1000.00"), pay("400.00", true)])).toBe(600);
  });

  it("treats an empty ledger as zero, not NaN", () => {
    expect(netCollected([])).toBe(0);
  });

  it("survives null/undefined/empty amounts", () => {
    expect(netCollected([{ amount: null }, { amount: undefined }, { amount: "" }])).toBe(0);
  });
});

describe("remainingBalance", () => {
  it("is total minus net collected", () => {
    expect(remainingBalance("1945.00", [pay("945.00")])).toBe(1000);
  });

  it("is zero when fully settled", () => {
    expect(remainingBalance("860.00", [pay("860.00")])).toBe(0);
  });

  it("reports a NEGATIVE balance on already-corrupt data rather than hiding it", () => {
    // Clamping here would mask historical damage. Display clamps; the maths does not.
    expect(remainingBalance("860.00", [pay("9000.00")])).toBe(-8140);
  });
});

describe("isOverpayment — the guard", () => {
  it("blocks the real bug: a QAR 9000 cheque against an 860 invoice", () => {
    expect(isOverpayment("9000.00", "860.00", [])).toBe(true);
  });

  it("allows paying the balance exactly", () => {
    expect(isOverpayment("860.00", "860.00", [])).toBe(false);
  });

  it("allows a final instalment that closes the invoice", () => {
    expect(isOverpayment("500.00", "1000.00", [pay("500.00")])).toBe(false);
  });

  it("blocks an instalment that would exceed what is left", () => {
    expect(isOverpayment("600.00", "1000.00", [pay("500.00")])).toBe(true);
  });

  it("absorbs one fils of float drift but not two", () => {
    expect(PAYMENT_EPSILON).toBe(0.01);
    expect(isOverpayment("1000.01", "1000.00", [])).toBe(false); // within epsilon
    expect(isOverpayment("1000.02", "1000.00", [])).toBe(true);  // beyond it
  });

  it("counts a prior refund as re-opening the balance", () => {
    // 1000 paid then 400 refunded leaves 400 payable again.
    expect(isOverpayment("400.00", "1000.00", [pay("1000.00"), pay("400.00", true)])).toBe(false);
    expect(isOverpayment("401.00", "1000.00", [pay("1000.00"), pay("400.00", true)])).toBe(true);
  });
});

describe("paymentStatusFor", () => {
  it("flips to paid on exact settlement", () => {
    expect(paymentStatusFor(1945, 1945)).toBe("paid");
  });

  it("flips to paid despite float drift just under the total", () => {
    expect(paymentStatusFor(1945, 1944.999999)).toBe("paid");
  });

  it("stays partial when money is still owed", () => {
    expect(paymentStatusFor(1000, 400)).toBe("partial");
  });

  it("is unpaid when nothing has been collected", () => {
    expect(paymentStatusFor(1000, 0)).toBe("unpaid");
  });

  it("does not call a zero-total document paid", () => {
    expect(paymentStatusFor(0, 0)).toBe("unpaid");
  });

  it("treats a fully refunded invoice as unpaid, never paid", () => {
    expect(paymentStatusFor(1000, netCollected([pay("1000.00"), pay("1000.00", true)]))).toBe("unpaid");
  });

  it("pins the status epsilon separately from the payment epsilon", () => {
    // These two constants are deliberately different (0.005 vs 0.01). A cleanup
    // that "standardises" them would change which payments are accepted.
    expect(STATUS_EPSILON).toBe(0.005);
    expect(PAYMENT_EPSILON).toBe(0.01);
    expect(STATUS_EPSILON).not.toBe(PAYMENT_EPSILON);
  });
});

describe("OverpaymentError", () => {
  it("carries the machine-readable code the routes map to HTTP 400", () => {
    const e = new OverpaymentError("INV-990123", 860, 9000);
    expect(e.code).toBe("OVERPAYMENT");
    expect(e).toBeInstanceOf(Error);
  });

  it("clamps a negative remaining to zero for the message shown to staff", () => {
    const e = new OverpaymentError("INV-990123", -50, 9000);
    expect(e.remaining).toBe(0);
  });

  it("keeps the invoice number so staff know which document was refused", () => {
    expect(new OverpaymentError("INV-990123", 860, 9000).invoiceNumber).toBe("INV-990123");
  });
});
