import { describe, it, expect } from "vitest";
import { computeInvoiceType, computeInvoiceTerms } from "../shared/invoiceType";

// Two types only. PDC is a payment METHOD under Credit Invoice, never a third type.
// This label is printed on the customer's invoice, so getting it wrong is visible
// to the customer and affects what the business is owed.

const cash = (amount: string) => ({ method: "Cash", amount });
const cheque = (amount: string) => ({ method: "Cheque", amount });

describe("computeInvoiceType", () => {
  it("is a Cash Invoice when fully paid with cash and no cheque", () => {
    expect(computeInvoiceType("1000", [cash("1000")], [])).toBe("Cash Invoice");
  });

  it("is a Credit Invoice when any balance remains", () => {
    expect(computeInvoiceType("1000", [cash("400")], [])).toBe("Credit Invoice");
  });

  it("is a Credit Invoice when nothing has been paid", () => {
    expect(computeInvoiceType("1000", [], [])).toBe("Credit Invoice");
  });

  it("mixes cash and card up to the total as a Cash Invoice", () => {
    expect(computeInvoiceType("1000", [
      { method: "Cash", amount: "600" }, { method: "Card", amount: "400" },
    ], [])).toBe("Cash Invoice");
  });
});

describe("computeInvoiceType — PDC is permanent", () => {
  it("is Credit the moment a cheque is involved", () => {
    expect(computeInvoiceType("1000", [cheque("1000")], [])).toBe("Credit Invoice");
  });

  it("STAYS Credit even after the cheque clears", () => {
    // The label reflects HOW it was paid, not merely whether it settled.
    expect(computeInvoiceType("1000", [], [{ amount: "1000", status: "cleared" }]))
      .toBe("Credit Invoice");
  });

  it("stays Credit when a cheque bounced and a balance is open", () => {
    expect(computeInvoiceType("1000", [], [{ amount: "1000", status: "bounced" }]))
      .toBe("Credit Invoice");
  });

  it("stays Credit when a cheque is topped up with cash to the full total", () => {
    expect(computeInvoiceType("1000", [cash("1000")], [{ amount: "1000", status: "cleared" }]))
      .toBe("Credit Invoice");
  });

  it("ignores a PAYABLE cheque - that is money the business owes, not a customer PDC", () => {
    expect(computeInvoiceType("1000", [cash("1000")], [{ amount: "500", status: "pending", type: "payable" }]))
      .toBe("Cash Invoice");
  });

  it("does not let a refunded cheque row mark the invoice Credit", () => {
    expect(computeInvoiceType("1000", [cash("1000"), { method: "Cheque", amount: "200", isRefund: true }], []))
      .toBe("Cash Invoice");
  });
});

describe("computeInvoiceType — refunds and epsilon", () => {
  it("re-opens the balance when cash is refunded", () => {
    expect(computeInvoiceType("1000", [cash("1000"), { method: "Cash", amount: "300", isRefund: true }], []))
      .toBe("Credit Invoice");
  });

  it("does not count a pure Credit tender as money collected", () => {
    expect(computeInvoiceType("1000", [{ method: "Credit", amount: "1000" }], []))
      .toBe("Credit Invoice");
  });

  it("absorbs half a fils of float drift", () => {
    expect(computeInvoiceType("1000", [cash("999.999")], [])).toBe("Cash Invoice");
    expect(computeInvoiceType("1000", [cash("999.99")], [])).toBe("Credit Invoice");
  });
});

describe("computeInvoiceTerms", () => {
  const base = { total: "1000", date: "2026-08-26", payments: [], cheques: [], termDays: 30 };

  it("gives a Cash Invoice no due dates at all", () => {
    const t = computeInvoiceTerms({ ...base, invoiceType: "Cash Invoice" });
    expect(t.isCredit).toBe(false);
    expect(t.chequeDue).toEqual([]);
    expect(t.standardDue).toBeNull();
  });

  it("derives a standard due date from the invoice date plus the term", () => {
    const t = computeInvoiceTerms({ ...base, invoiceType: "Credit Invoice" });
    expect(t.standardDue).toBe("2026-09-25"); // 26 Aug + 30 days
  });

  it("lets an explicit per-invoice due date win over the term calc", () => {
    const t = computeInvoiceTerms({ ...base, invoiceType: "Credit Invoice", dueDate: "2026-12-01" });
    expect(t.standardDue).toBe("2026-12-01");
  });

  it("lists each uncleared cheque with its own due date", () => {
    const t = computeInvoiceTerms({
      ...base, invoiceType: "Credit Invoice",
      cheques: [{ amount: "1000", status: "pending", chequeNumber: "004521", chequeDate: "2026-10-15" }],
    });
    expect(t.chequeDue).toEqual([{ number: "004521", dueDate: "2026-10-15" }]);
  });

  it("raises no standard due date when cheques already cover the balance", () => {
    const t = computeInvoiceTerms({
      ...base, invoiceType: "Credit Invoice",
      cheques: [{ amount: "1000", status: "pending", chequeNumber: "004521", chequeDate: "2026-10-15" }],
    });
    expect(t.standardDue).toBeNull(); // chasing this would double-chase the customer
  });

  it("raises a standard due date for the part NOT covered by a cheque", () => {
    const t = computeInvoiceTerms({
      ...base, invoiceType: "Credit Invoice",
      cheques: [{ amount: "600", status: "pending", chequeNumber: "004521", chequeDate: "2026-10-15" }],
    });
    expect(t.standardDue).toBe("2026-09-25"); // the remaining 400
  });

  it("re-opens a standard due date when the covering cheque bounced", () => {
    const t = computeInvoiceTerms({
      ...base, invoiceType: "Credit Invoice",
      cheques: [{ amount: "1000", status: "bounced", chequeNumber: "004521", chequeDate: "2026-10-15" }],
    });
    expect(t.standardDue).toBe("2026-09-25");
    expect(t.chequeDue).toEqual([]); // a bounced cheque is not a promise to pay
  });
});
