import { useLayoutEffect, useRef, useState } from "react";
import type { TemplateInvoice, DocKind } from "./types";

/* ── Shared bilingual furniture ───────────────────────────────────────────────
   Both new templates print every label in English AND Arabic, and the Arabic has
   to look the same SIZE as the English beside it — not the same point size.
   Amiri sets small for its point size where a Latin sans sets large, so the
   Arabic is stepped UP here rather than left to chance.

   One place for the pairs, so a label can never say one thing on one template
   and something else on the other.
──────────────────────────────────────────────────────────────────────────────*/

/** A name that FILLS a fixed block — the same block for both languages.
 *
 *  This is the thing that kept going wrong. Choosing a point size by hand works
 *  for exactly one company name: the English is 37 characters and wraps to two
 *  lines, the Arabic is 32 and sits on one, so at any single size one of them
 *  looks like the main name and the other like a translation.
 *
 *  So neither size is chosen. Each name is given the SAME box and grown to the
 *  largest size that still fits inside it. Both then occupy the same area by
 *  construction — and they still will after the trading name is edited, or if
 *  another company uses this system.
 *
 *  In the browser the box is measured for real. Server-side (a preview, a PDF
 *  worker) there is nothing to measure, so it falls back to an estimate from the
 *  character count — close enough to look right, and corrected the moment it
 *  renders in a browser.
 */
const MM_PER_PT = 0.352778;

function estimateFit(text: string, widthMm: number, heightMm: number, rtl: boolean): number {
  const chars = Math.max(1, (text || "").trim().length);
  // Rough average advance per character, as a fraction of the point size.
  const advance = rtl ? 0.44 : 0.40;
  const lineFactor = 1.22;
  let best = 6;
  for (let lines = 1; lines <= 3; lines++) {
    const widthPt = (widthMm / MM_PER_PT) * lines;
    const byWidth = widthPt / (chars * advance);
    const byHeight = (heightMm / MM_PER_PT) / (lines * lineFactor);
    best = Math.max(best, Math.min(byWidth, byHeight));
  }
  return Math.min(30, Math.max(6, Number(best.toFixed(1))));
}

export function FitBox({
  text, width, height, widthMm, heightMm, max = 30, min = 6, rtl = false,
  className = "", style = {},
}: {
  text: string; width: string; height: string;
  /** Same numbers as `width`/`height`, for the server-side estimate. */
  widthMm: number; heightMm: number;
  max?: number; min?: number; rtl?: boolean;
  className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => estimateFit(text, widthMm, heightMm, rtl));

  useLayoutEffect(() => {
    let cancelled = false;

    const measure = () => {
      const el = ref.current;
      if (!el || cancelled) return;
      // Largest size that still fits: start at the ceiling and come down. Half a
      // point at a time is under 50 passes and imperceptible.
      let pt = max;
      // Measure the INK, not the line box. scrollHeight reports the line boxes,
      // and glyphs — Arabic descenders above all — reach past them, so the loop
      // kept declaring a fit while the letters were still being cut off.
      const fits = () => {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const ink = rg.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return ink.width <= box.width + 0.5 && ink.height <= box.height + 0.5;
      };
      el.style.fontSize = `${pt}pt`;
      while (pt > min && !fits()) {
        pt -= 0.5;
        el.style.fontSize = `${pt}pt`;
      }
      setSize(pt);
    };

    measure();

    // MEASURE AGAIN once the real fonts have arrived. Fitting against a fallback
    // face picks a size for the wrong letterforms — then the real font loads,
    // the name no longer fits, and it is clipped out of sight. That is exactly
    // how the company name disappeared from the letterhead.
    const fonts: any = typeof document !== "undefined" ? (document as any).fonts : null;
    if (fonts?.ready?.then) fonts.ready.then(() => measure());

    return () => { cancelled = true; };
  }, [text, width, height, max, min]);

  return (
    <div
      ref={ref}
      dir={rtl ? "rtl" : undefined}
      className={className}
      // Marked so a static render (a preview, a PDF worker) can run the same
      // fit with a few lines of plain script and show the true result.
      data-fit={max}
      data-fit-min={min}
      style={{
        width, height, fontSize: `${size}pt`, lineHeight: 1.22,
        display: "flex", alignItems: "center",
        justifyContent: rtl ? "flex-start" : "flex-start",
        overflow: "visible", ...style,
      }}
    >
      {text}
    </div>
  );
}

/** English, a hairline slash, then the Arabic — optically matched.
 *
 *  MEASURED, not guessed. At the same point size Cairo renders far taller than
 *  a Latin face: 8.3px of English produced 6px of ink, and 9.3px of Cairo
 *  produced 11px. So the Arabic is set BELOW the English size, not above it.
 *
 *  The common rule of thumb — "Arabic wants 1.3× the Latin size" — is true for
 *  a traditional Naskh face like Amiri, which sets small for its point size. It
 *  is the wrong way round for Cairo. The rule that actually holds is: match the
 *  rendered height, and that depends entirely on the face. Change the Arabic
 *  font and this number has to be re-measured.
 */
export function Pair({
  en, ar, className = "", arClass = "", scale = 0.8,
}: {
  en: string; ar: string; className?: string; arClass?: string; scale?: number;
}) {
  return (
    <span className={`inline-flex items-baseline gap-[3px] ${className}`}>
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

/** Who signs, per document type.
 *
 *  An invoice is signed three ways: the salesman who sold it, whoever physically
 *  received the goods, and the customer accepting the bill — often three
 *  different people on a building site. A delivery note has no money on it, so
 *  it carries who handed over and who took. A quotation is a promise from us
 *  alone. A purchase order is generated by the system, so if anything signs it,
 *  it is us authorising it.
 */
export function signaturesFor(type: DocKind): { en: string; ar: string }[] {
  switch (type) {
    case "DN":
      return [
        { en: "Delivered by", ar: "سُلّمت بواسطة" },
        { en: "Receiver's signature", ar: "توقيع المستلم" },
      ];
    case "QT":
    case "PO":
      return [{ en: "Authorised signature", ar: "التوقيع المعتمد" }];
    case "CN":
    case "RV":
      return [
        { en: "Authorised signature", ar: "التوقيع المعتمد" },
        { en: "Receiver's signature", ar: "توقيع المستلم" },
      ];
    default:
      return [
        { en: "Salesman signature", ar: "توقيع البائع" },
        { en: "Receiver's signature", ar: "توقيع المستلم" },
        { en: "Customer signature", ar: "توقيع العميل" },
      ];
  }
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
  currencyNote: { en: "All amounts in QAR", ar: "جميع المبالغ بالريال القطري" },
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
