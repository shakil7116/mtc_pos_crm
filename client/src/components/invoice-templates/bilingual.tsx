import type { TemplateInvoice, DocKind } from "./types";

/* ── Shared bilingual furniture ───────────────────────────────────────────────
   Both new templates print every label in English AND Arabic, and the Arabic has
   to look the same SIZE as the English beside it — not the same point size.
   Amiri sets small for its point size where a Latin sans sets large, so the
   Arabic is stepped UP here rather than left to chance.

   One place for the pairs, so a label can never say one thing on one template
   and something else on the other.
──────────────────────────────────────────────────────────────────────────────*/

/** English, a hairline slash, then the Arabic — optically matched. */
export function Pair({
  en, ar, className = "", arClass = "", scale = 1.12,
}: {
  en: string; ar: string; className?: string; arClass?: string; scale?: number;
}) {
  return (
    <span className={`inline-flex items-baseline gap-[3px] whitespace-nowrap ${className}`}>
      <span>{en}</span>
      <span className="opacity-40 font-normal">/</span>
      <span
        className={`font-arabic ${arClass}`}
        style={{ fontSize: `${scale}em`, letterSpacing: 0 }}
        dir="rtl"
      >
        {ar}
      </span>
    </span>
  );
}

/** A stacked heading for a table column: English over Arabic, both taking the
 *  column's own alignment so the words sit directly above their numbers. */
export function ColHead({ en, ar }: { en: string; ar: string }) {
  return (
    <>
      {en}
      <span className="block font-arabic font-normal opacity-90 leading-tight" dir="rtl"
            style={{ fontSize: "0.86em", letterSpacing: 0 }}>
        {ar}
      </span>
    </>
  );
}

/** The document's own name, in both languages.
 *
 *  An invoice carries Cash or Credit — computed live by the system from the
 *  payments and any linked cheques, never stored. A PDC keeps it Credit even
 *  after the cheque clears, so the heading always reflects how it was paid. */
export function docTitles(invoice: TemplateInvoice): { en: string; ar: string } {
  const t = invoice.type as DocKind;
  if (t === "INV") {
    const label = invoice.invoiceType;
    if (label === "Cash Invoice") return { en: "Cash Invoice", ar: "فاتورة نقدية" };
    if (label === "Credit Invoice") return { en: "Credit Invoice", ar: "فاتورة آجلة" };
    return { en: "Invoice", ar: "فاتورة" };
  }
  const map: Record<string, { en: string; ar: string }> = {
    QT: { en: "Quotation", ar: "عرض سعر" },
    DN: { en: "Delivery Note", ar: "سند تسليم" },
    CN: { en: "Credit Note", ar: "إشعار دائن" },
    RV: { en: "Return Voucher", ar: "سند إرجاع" },
    PO: { en: "Purchase Order", ar: "أمر شراء" },
  };
  return map[t] || { en: "Document", ar: "مستند" };
}

/** Who the document is addressed to changes with its type. */
export function billToLabel(type: DocKind): { en: string; ar: string } {
  if (type === "DN") return { en: "Deliver to", ar: "التسليم إلى" };
  if (type === "QT") return { en: "To", ar: "إلى" };
  if (type === "PO") return { en: "Supplier", ar: "المورّد" };
  return { en: "Bill to", ar: "فاتورة إلى" };
}

export const L = {
  number:   { en: "Number", ar: "الرقم" },
  date:     { en: "Date", ar: "التاريخ" },
  poNumber: { en: "Your order", ar: "أمر الشراء" },
  no:       { en: "No.", ar: "رقم" },
  desc:     { en: "Description", ar: "الوصف" },
  qty:      { en: "Qty", ar: "الكمية" },
  unit:     { en: "Unit", ar: "الوحدة" },
  price:    { en: "Price", ar: "السعر" },
  disc:     { en: "Disc.", ar: "الخصم" },
  amount:   { en: "Amount", ar: "المبلغ" },
  subtotal: { en: "Subtotal", ar: "المجموع" },
  discount: { en: "Discount", ar: "الخصم" },
  vat:      { en: "VAT", ar: "الضريبة" },
  total:    { en: "Total", ar: "الإجمالي" },
  words:    { en: "Amount in words", ar: "المبلغ كتابةً" },
  receiver: { en: "Receiver's signature", ar: "توقيع المستلم" },
  company:  { en: "For the company", ar: "عن الشركة" },
  salesman: { en: "Salesman", ar: "البائع" },
  authorised: { en: "Authorised signature", ar: "التوقيع المعتمد" },
  poBox:    { en: "P.O. Box", ar: "ص.ب" },
  phone:    { en: "Phone", ar: "هاتف" },
  cr:       { en: "C.R. No", ar: "س.ت" },
  address:  { en: "Address", ar: "العنوان" },
  delivery: { en: "Delivery details", ar: "تفاصيل التسليم" },
} as const;

export const money = (n: any): string =>
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dmy = (iso: string): string => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
};

/** A line's own discount: what it would have cost, less what it did. */
export const lineDiscount = (it: { qty: number; price: number; amount: number }): number =>
  Math.max(0, (Number(it.qty) || 0) * (Number(it.price) || 0) - (Number(it.amount) || 0));

/** Enough blank rows to keep the table the same height on a short invoice, so
 *  the totals block always lands in the same place on the page. */
export const fillerRows = (count: number, min = 12): number[] =>
  Array.from({ length: Math.max(0, min - count) }, (_, i) => i);
