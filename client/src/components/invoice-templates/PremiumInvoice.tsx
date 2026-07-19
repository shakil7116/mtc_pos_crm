// @ts-nocheck
import clsx from "clsx";
import { format } from "date-fns";
import logoImg from "@assets/generated_images/minimalist_professional_mtc_text_logo.png";

// Convert Western digits (123) to Eastern Arabic-Indic digits (١٢٣) for the Arabic column.
const toArabicDigits = (value: string | number) => {
  if (value === undefined || value === null) return "";
  const id = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return value.toString().replace(/[0-9]/g, (d) => id[+d]);
};

// 2-decimal money formatter, guarded against null/undefined/NaN.
const money = (value: any) => Number(value || 0).toFixed(2);

// Safe date formatter — never throws on a missing/invalid date.
const safeDate = (value: any, pattern: string) => {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : format(d, pattern);
};

export function PremiumInvoice({ settings, invoice, options, className }: any) {
  settings = settings || {};
  invoice = invoice || {};
  options = options || {};

  const items = invoice.items || [];
  const isDeliveryNote = invoice.type === "DN";
  const showPrices = !isDeliveryNote;

  // Document title badge derived from invoice.type.
  const titleMap: Record<string, { en: string; ar: string }> = {
    INV: { en: "TAX INVOICE", ar: "فاتورة" },
    CN: { en: "CREDIT NOTE", ar: "إشعار دائن" },
    QT: { en: "QUOTATION", ar: "عرض سعر" },
    DN: { en: "DELIVERY NOTE", ar: "إشعار تسليم" },
  };
  const docTitle = titleMap[invoice.type] || titleMap.INV;

  // Arabic company name split across two balanced lines to mirror the English wrap.
  const arNameWords = (settings.storeNameAr || "").trim().split(/\s+/).filter(Boolean);
  const arSplit = Math.ceil(arNameWords.length / 2);
  const arNameLine1 = arNameWords.slice(0, arSplit).join(" ");
  const arNameLine2 = arNameWords.slice(arSplit).join(" ");

  const NAVY = "#0F172A";
  const NAVY_LIGHT = "#1E3A8A";

  // Column span for the table footer / empty filler rows.
  const colCount = showPrices ? 7 : 5;

  return (
    <div
      className={clsx(
        "bg-white text-slate-900 w-[210mm] h-[297mm] max-h-[297mm] shadow-xl print:shadow-none relative overflow-hidden flex flex-col print:w-[210mm] print:h-[297mm] print:max-h-[297mm] print:m-0",
        className
      )}
      style={{ boxSizing: "border-box", margin: "0 auto", padding: "12mm" }}
    >
      {/* ── 1. HEADER ─────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-[1fr_auto_1fr] w-full items-stretch gap-6 pb-5 mb-5"
        style={{ borderBottom: `3px solid ${NAVY}` }}
      >
        {/* LEFT — English company block */}
        <div className="flex flex-col text-left">
          <div
            className="text-[19px] font-bold tracking-tight leading-[1.15] min-h-[3rem] flex items-end"
            style={{ color: NAVY }}
          >
            {(settings.storeNameEn || "").toUpperCase()}
          </div>
          <div className="mt-2 space-y-[3px] text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            <div>
              P.O. BOX: <span className="text-slate-800">{settings.poBox || ""}</span>
            </div>
            <div>
              PHONE:{" "}
              <span dir="ltr" className="inline-block text-slate-800">
                {settings.phone || ""}
              </span>
            </div>
            <div>
              C.R. NO: <span className="text-slate-800">{settings.crNumber || ""}</span>
            </div>
            <div className="text-[9px] text-slate-500 normal-case leading-snug">
              {settings.addressEn || ""}
            </div>
          </div>
        </div>

        {/* CENTER — Logo */}
        <div className="self-center flex items-center justify-center px-2">
          <img src={logoImg} alt="MTC LOGO" className="w-24 h-24 object-contain" />
        </div>

        {/* RIGHT — Arabic company block (RTL, Arabic-Indic digits) */}
        <div className="flex flex-col text-right font-arabic" dir="rtl">
          <div
            dir="rtl"
            className="text-[20px] font-bold leading-snug min-h-[3rem] flex flex-col justify-end text-right"
            style={{ color: NAVY }}
          >
            {/* Clean right-aligned bilingual name — fits its column, no forced justify gaps */}
            <span className="block">{arNameLine1 || settings.storeNameAr || ""}</span>
            {arNameLine2 ? <span className="block">{arNameLine2}</span> : null}
          </div>
          <div className="mt-2 space-y-[3px] text-[10px] text-slate-600 font-semibold">
            <div>
              ص.ب: <span className="text-slate-800">{toArabicDigits(settings.poBox)}</span>
            </div>
            <div>
              هاتف: <span className="text-slate-800">{toArabicDigits(settings.phone)}</span>
            </div>
            <div>
              س.ت: <span className="text-slate-800">{toArabicDigits(settings.crNumber)}</span>
            </div>
            <div className="text-[9px] text-slate-500 leading-snug">{settings.addressAr || ""}</div>
          </div>
        </div>
      </div>

      {/* ── 2. DOCUMENT TITLE BADGE ───────────────────────────────── */}
      <div className="flex flex-col items-center mb-5">
        <div
          className="px-8 py-2 rounded-full text-white shadow-sm flex items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)` }}
        >
          <span className="text-[15px] font-bold tracking-[0.18em] uppercase">{docTitle.en}</span>
          <span className="w-px h-4 bg-white/30" />
          <span className="text-[15px] font-bold font-arabic" dir="rtl">
            {docTitle.ar}
          </span>
        </div>
        {invoice.type === "INV" && invoice.invoiceType && (
          <span
            className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.18em] px-2.5 py-0.5 rounded border"
            style={{
              color: invoice.invoiceType === "Credit Invoice" ? "#b91c1c"
                : invoice.invoiceType === "Cash Invoice" ? "#15803d" : "#334155",
              borderColor: invoice.invoiceType === "Credit Invoice" ? "#b91c1c"
                : invoice.invoiceType === "Cash Invoice" ? "#15803d" : "#334155",
            }}
          >
            {invoice.invoiceType}
          </span>
        )}
      </div>

      {/* ── 3. METADATA GRID ──────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-px mb-4 rounded overflow-hidden border border-slate-200 bg-slate-200">
        {[
          { en: "INVOICE NO.", ar: "رقم", value: invoice.number, mono: true },
          { en: "DATE", ar: "التاريخ", value: safeDate(invoice.date, "dd-MMM-yyyy"), mono: true },
          { en: "L.P.O. NO.", ar: "أمر الشراء", value: invoice.poNumber },
          { en: "MODE OF PAYMENT", ar: "طريقة الدفع", value: (invoice.paymentType || "").toUpperCase() },
        ].map((cell, i) => (
          <div key={i} className="bg-white px-3 py-2">
            {/* Bilingual label on one horizontal line: EN left, AR right (baseline-aligned) */}
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[8px] font-bold tracking-widest uppercase" style={{ color: NAVY_LIGHT }}>
                {cell.en}
              </span>
              <span className="text-[9px] font-arabic text-slate-500 leading-none whitespace-nowrap" dir="rtl">
                {cell.ar}
              </span>
            </div>
            <div
              className={clsx(
                "text-[12px] font-bold text-slate-900 leading-tight",
                cell.mono && "font-mono tabular-nums"
              )}
            >
              {cell.value || "—"}
            </div>
          </div>
        ))}
      </div>

      {/* ── 4. CLIENT PANEL ───────────────────────────────────────── */}
      <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: NAVY_LIGHT }}>
              BILL TO
            </span>
            <span className="text-[10px] font-arabic text-slate-400" dir="rtl">
              العميل
            </span>
          </div>
          <div className="text-[16px] font-bold text-slate-900 uppercase leading-tight">
            {invoice.customerName || "CASH CUSTOMER"}
          </div>
        </div>
        {invoice.customerPhone ? (
          <div className="text-right">
            <div className="text-[8px] font-bold tracking-widest uppercase text-slate-400">PHONE</div>
            <div dir="ltr" className="text-[13px] font-mono font-bold text-slate-800 tabular-nums">
              {invoice.customerPhone}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 5. ITEMS TABLE ────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden mb-4">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-white" style={{ backgroundColor: NAVY }}>
              <th className="py-2 px-2 text-left text-[10px] font-bold uppercase tracking-wide w-10">Sl.#</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold uppercase tracking-wide w-28">
                Item Code
              </th>
              <th className="py-2 px-2 text-left text-[10px] font-bold uppercase tracking-wide">
                Description
              </th>
              <th className="py-2 px-2 text-center text-[10px] font-bold uppercase tracking-wide w-16">
                Unit
              </th>
              <th className="py-2 px-2 text-right text-[10px] font-bold uppercase tracking-wide w-16">Qty</th>
              {showPrices && (
                <th className="py-2 px-2 text-right text-[10px] font-bold uppercase tracking-wide w-24">
                  Unit Price
                </th>
              )}
              {showPrices && (
                <th className="py-2 px-3 text-right text-[10px] font-bold uppercase tracking-wide w-28">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr
                key={idx}
                className={clsx(
                  "border-b border-slate-200 align-top",
                  idx % 2 === 1 && "bg-slate-50"
                )}
              >
                <td className="py-[5px] px-2 text-[11px] text-slate-400 font-medium">{idx + 1}</td>
                <td className="py-[5px] px-2 text-[11px] font-mono text-slate-600">{item?.sku || ""}</td>
                <td className="py-[5px] px-2 text-[11px] font-semibold text-slate-900 break-words">
                  {item?.description || ""}
                </td>
                <td className="py-[5px] px-2 text-[11px] text-center text-slate-600 uppercase">
                  {item?.unit || ""}
                </td>
                <td className="py-[5px] px-2 text-[11px] text-right font-mono tabular-nums text-slate-700">
                  {item?.qty ?? ""}
                </td>
                {showPrices && (
                  <td className="py-[5px] px-2 text-[11px] text-right font-mono tabular-nums text-slate-700">
                    {money(item?.price)}
                  </td>
                )}
                {showPrices && (
                  <td className="py-[5px] px-3 text-[11px] text-right font-mono tabular-nums font-bold text-slate-900">
                    {money(item?.amount)}
                  </td>
                )}
              </tr>
            ))}
            {/* Filler rows to keep the table body visually anchored on the page. */}
            {Array.from({ length: Math.max(0, 12 - items.length) }).map((_, idx) => (
              <tr key={`empty-${idx}`} className="border-b border-slate-100 h-7">
                <td colSpan={colCount}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 6. TOTALS ─────────────────────────────────────────────── */}
      <div className="flex flex-row justify-between items-start gap-6 mb-4 print:break-inside-avoid">
        {/* LEFT — amount in words */}
        <div className="w-[55%]">
          {options.showAmountInWords && showPrices ? (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[8px] font-bold tracking-[0.2em] uppercase" style={{ color: NAVY_LIGHT }}>
                  AMOUNT IN WORDS
                </span>
                <span className="text-[9px] font-arabic text-slate-400" dir="rtl">
                  المبلغ بالحروف
                </span>
              </div>
              <div className="text-[13px] font-semibold italic text-slate-800 leading-snug uppercase">
                {invoice.totalWords || "—"}
              </div>
            </div>
          ) : null}
        </div>

        {/* RIGHT — Subtotal (gross) / Gross Discount / Net Total. */}
        {showPrices && (
          <div className="w-[40%] flex flex-col">
            <div className="flex justify-between items-center px-3 py-1.5 border-b border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Subtotal</span>
              <span className="font-mono tabular-nums text-[13px] font-bold text-slate-900">
                {money(Number(invoice.subtotal || 0))}
              </span>
            </div>
            {Number(invoice.discountAmount || 0) > 0 ? (
              <div className="flex justify-between items-center px-3 py-1.5 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Gross Discount</span>
                <span className="font-mono tabular-nums text-[13px] font-bold text-amber-700">
                  − {money(Number(invoice.discountAmount || 0))}
                </span>
              </div>
            ) : null}
            {Number(invoice.taxAmount || 0) > 0 ? (
              <div className="flex justify-between items-center px-3 py-1.5 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Tax ({money(invoice.taxRate)}%)
                </span>
                <span className="font-mono tabular-nums text-[13px] font-bold text-slate-900">
                  {money(invoice.taxAmount)}
                </span>
              </div>
            ) : null}
            <div
              className="mt-2 rounded-lg px-4 py-3 text-white flex items-center justify-between"
              style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)` }}
            >
              <div className="flex flex-col">
                <span className="text-[13px] font-bold tracking-[0.18em] uppercase">Net Total</span>
                <span className="text-[10px] font-arabic opacity-80" dir="rtl">
                  المجموع الكلي
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-bold opacity-90 border border-white/40 rounded px-1.5 py-0.5 bg-white/10">
                  QAR
                </span>
                <span className="text-[22px] font-mono tabular-nums font-bold">{money(invoice.total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 7. SIGNATURES ─────────────────────────────────────────── */}
      {options.showSignature ? (
        <div className="grid grid-cols-3 gap-8 pt-3 mt-auto print:break-inside-avoid">
          {[
            { en: "Authorized Signatory", ar: "التوقيع المعتمد" },
            { en: "Storekeeper", ar: "أمين المخزن" },
            { en: "Receiver's Verification & Stamp", ar: "توقيع وختم المستلم" },
          ].map((sig, i) => (
            <div key={i} className="text-center">
              <div className="h-10" />
              <div className="border-t border-slate-300 mb-1" />
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 leading-tight">
                {sig.en}
              </div>
              <div className="text-[10px] font-arabic text-slate-400 mt-0.5" dir="rtl">
                {sig.ar}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Optional return-policy / notes footer */}
      {options.showReturnPolicy || invoice.notes ? (
        <div className="pt-3 mt-3 border-t border-slate-200 text-center">
          {invoice.notes ? (
            <p className="text-[9px] text-slate-500 leading-snug">{invoice.notes}</p>
          ) : null}
          {options.showReturnPolicy ? (
            <p className="text-[8px] text-slate-400 mt-1 uppercase tracking-wide">
              Goods sold are not returnable after 7 days. البضاعة المباعة لا ترد بعد ٧ أيام
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default PremiumInvoice;
