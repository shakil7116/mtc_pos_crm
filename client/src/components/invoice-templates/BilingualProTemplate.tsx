import { forwardRef } from "react";
import { TemplateProps, DOC_TITLE, DOC_TITLE_AR, LABELS_AR, qar } from "./types";

/**
 * "Sahara" — high-fidelity bilingual (English / Arabic) document.
 * Grid-based, RTL-aware, dual-language column headers and labels.
 * No greetings; official-transaction layout. Tailwind + Amiri for Arabic.
 * Renders identically in both languages (mirrored header, stacked labels).
 */
const BilingualProTemplate = forwardRef<HTMLDivElement, TemplateProps>(
  ({ invoice, settings, options }, ref) => {
    const showPrices = invoice.type !== "DN";
    const showSignature = options?.showSignature ?? true;
    const showReturnPolicy = options?.showReturnPolicy ?? true;
    const showWords = options?.showAmountInWords ?? true;
    const accent = options?.accent ?? "#1e2a3a";

    const ar = { fontFamily: "'Amiri', serif" } as const;

    return (
      <div
        ref={ref}
        className="invoice-paper bg-white text-[#1e2a3a] mx-auto"
        style={{ width: "210mm", minHeight: "297mm", fontFamily: "'Inter', system-ui, sans-serif", fontVariantNumeric: "tabular-nums" }}
      >
        {/* ── Header: EN left · brand center · AR right ── */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 px-[14mm] pt-[12mm] pb-[6mm]">
          <div className="text-[10.5px] leading-relaxed text-[#475569]">
            <div className="text-[15px] font-extrabold text-[#1e2a3a] leading-tight tracking-tight">
              {settings.storeNameEn ?? "Company Name"}
            </div>
            <div className="mt-1">{settings.addressEn}</div>
            {settings.phone && <div>{settings.phone}</div>}
            {settings.crNumber && <div>CR: {settings.crNumber}{settings.poBox ? ` · P.O. ${settings.poBox}` : ""}</div>}
          </div>

          <div className="flex flex-col items-center pt-1">
            <div className="w-[42px] h-[42px] rounded-lg flex items-center justify-center text-white font-black text-[18px]" style={{ background: accent }}>
              M
            </div>
          </div>

          <div className="text-[11px] leading-relaxed text-[#475569] text-right" dir="rtl" style={ar}>
            <div className="text-[16px] font-bold text-[#1e2a3a] leading-tight">
              {settings.storeNameAr ?? "اسم الشركة"}
            </div>
            <div className="mt-1">{settings.addressAr ?? settings.addressEn}</div>
            {settings.phone && <div dir="ltr">{settings.phone}</div>}
            {settings.crNumber && <div>س.ت: {settings.crNumber}{settings.poBox ? ` · ص.ب ${settings.poBox}` : ""}</div>}
          </div>
        </div>

        {/* ── Title band (bilingual, centered) ── */}
        <div className="flex items-center justify-center gap-4 py-2.5 text-white" style={{ background: accent }}>
          <span className="text-[16px] font-bold uppercase tracking-[0.18em]">{DOC_TITLE[invoice.type]}</span>
          <span className="text-[#d4a017]">•</span>
          <span className="text-[17px] font-bold" dir="rtl" style={ar}>{DOC_TITLE_AR[invoice.type]}</span>
        </div>
        <div className="h-[3px]" style={{ background: "#d4a017" }} />

        {/* ── Meta grid ── */}
        <div className="px-[14mm] py-[6mm]">
          <div className="grid grid-cols-2 border border-[#e2e8f0] rounded-md overflow-hidden text-[11px]">
            {/* Bill To */}
            <div className="p-3 border-r border-[#e2e8f0]">
              <BiLabel en="Bill To" ar={LABELS_AR.billTo} />
              <div className="text-[13px] font-semibold mt-1">{invoice.customerName || "Cash Customer"}</div>
              {invoice.customerPhone && <div className="text-[#64748b]" dir="ltr">{invoice.customerPhone}</div>}
            </div>
            {/* Number / Date / PO */}
            <div className="grid grid-cols-1 divide-y divide-[#e2e8f0]">
              <MetaRow en="No." ar={LABELS_AR.number} value={invoice.number} mono />
              <MetaRow
                en="Date" ar={LABELS_AR.date}
                value={new Date(invoice.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              />
              {invoice.poNumber ? <MetaRow en="PO No." ar={LABELS_AR.poNumber} value={invoice.poNumber} mono /> : null}
            </div>
          </div>

          {/* ── Items table ── */}
          <table className="w-full border-collapse mt-5 text-[11.5px]">
            <thead>
              <tr className="text-white" style={{ background: accent }}>
                <Th className="w-[26px] text-center">#</Th>
                <Th className="text-left"><BiHead en="Description" ar={LABELS_AR.description} align="left" /></Th>
                <Th className="w-[58px] text-center"><BiHead en="Qty" ar={LABELS_AR.qty} /></Th>
                <Th className="w-[58px] text-center"><BiHead en="Unit" ar={LABELS_AR.unit} /></Th>
                {showPrices && <Th className="w-[78px] text-right"><BiHead en="Price" ar={LABELS_AR.price} align="right" /></Th>}
                {showPrices && <Th className="w-[88px] text-right"><BiHead en="Amount" ar={LABELS_AR.amount} align="right" /></Th>}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                  <Td className="text-center text-[#94a3b8]">{i + 1}</Td>
                  <Td>
                    <span className="font-medium">{it.description}</span>
                    {it.sku && <span className="text-[9.5px] text-[#94a3b8] font-mono ml-2">{it.sku}</span>}
                  </Td>
                  <Td className="text-center">{it.qty}</Td>
                  <Td className="text-center text-[#64748b]">{it.unit}</Td>
                  {showPrices && <Td className="text-right">{qar(it.price)}</Td>}
                  {showPrices && <Td className="text-right font-semibold">{qar(it.amount)}</Td>}
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 6 - invoice.items.length) }).map((_, i) => (
                <tr key={`f${i}`} style={{ background: (invoice.items.length + i) % 2 ? "#f8fafc" : "#fff" }}>
                  {Array.from({ length: showPrices ? 6 : 4 }).map((__, c) => (
                    <Td key={c}>&nbsp;</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Totals + words ── */}
          {showPrices && (
            <div className="flex justify-between items-start gap-6 mt-4">
              {showWords && invoice.totalWords && (
                <div className="flex-1 text-[10px] text-[#475569] border border-[#e2e8f0] rounded-md p-3">
                  <BiLabel en="Amount in words" ar={LABELS_AR.amountInWords} />
                  <div className="italic mt-1">{invoice.totalWords}</div>
                </div>
              )}
              <table className="text-[11.5px]" style={{ width: "78mm" }}>
                <tbody>
                  <TotalRow en="Subtotal" ar={LABELS_AR.subtotal} value={`QAR ${qar(Number(invoice.subtotal || 0))}`} />
                  {Number(invoice.discountAmount || 0) > 0 && (
                    <TotalRow en="Gross Discount" ar={LABELS_AR.discount ?? "الخصم"} value={`− QAR ${qar(Number(invoice.discountAmount || 0))}`} />
                  )}
                  {invoice.taxAmount > 0 && <TotalRow en={`Tax (${invoice.taxRate}%)`} ar={LABELS_AR.tax} value={`QAR ${qar(invoice.taxAmount)}`} />}
                  <tr className="text-white" style={{ background: accent }}>
                    <td className="py-2 px-3 text-[12px] font-bold">
                      Total <span dir="rtl" style={ar} className="ml-1">{LABELS_AR.total}</span>
                    </td>
                    <td className="py-2 px-3 text-right text-[14px] font-bold">QAR {qar(invoice.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="mt-10 grid grid-cols-2 gap-10 items-end">
            {showReturnPolicy ? (
              <div className="text-[9px] text-[#94a3b8] leading-relaxed">
                <div>{settings.returnPolicyText}</div>
              </div>
            ) : <div />}
            {showSignature && (
              <div className="grid grid-cols-2 gap-6 text-center">
                <div>
                  <div className="h-px bg-[#94a3b8] mb-1.5" />
                  <div className="text-[9.5px] text-[#64748b]">Receiver · <span dir="rtl" style={ar}>{LABELS_AR.receiver}</span></div>
                </div>
                <div>
                  <div className="h-px bg-[#94a3b8] mb-1.5" />
                  <div className="text-[9.5px] text-[#64748b]">For Company · <span dir="rtl" style={ar}>{LABELS_AR.forCompany}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

/* ── small bilingual primitives ── */
function BiLabel({ en, ar }: { en: string; ar: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] uppercase tracking-[0.14em] text-[#94a3b8]">{en}</span>
      <span className="text-[10px] text-[#94a3b8]" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>{ar}</span>
    </div>
  );
}
function BiHead({ en, ar, align = "center" }: { en: string; ar: string; align?: "left" | "right" | "center" }) {
  return (
    <div className={`flex flex-col ${align === "left" ? "items-start" : align === "right" ? "items-end" : "items-center"}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">{en}</span>
      <span className="text-[10px] font-normal leading-none mt-0.5 opacity-90" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>{ar}</span>
    </div>
  );
}
function MetaRow({ en, ar, value, mono }: { en: string; ar: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[9px] uppercase tracking-wide text-[#94a3b8]">{en} · <span dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>{ar}</span></span>
      <span className={`text-[12px] font-semibold ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
function TotalRow({ en, ar, value, accent }: { en: string; ar: string; value: string; accent?: string }) {
  return (
    <tr className="border-b border-[#e2e8f0]">
      <td className="py-1.5 px-3 text-[#64748b]">{en} <span dir="rtl" style={{ fontFamily: "'Amiri', serif" }} className="text-[10px]">{ar}</span></td>
      <td className="py-1.5 px-3 text-right" style={{ color: accent }}>{value}</td>
    </tr>
  );
}
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`py-2 px-2 align-middle ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2 px-2 border-b border-[#eef2f6] align-top ${className}`} style={{ height: "26px" }}>{children}</td>;
}

BilingualProTemplate.displayName = "BilingualProTemplate";
export default BilingualProTemplate;
