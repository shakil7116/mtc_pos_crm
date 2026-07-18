import { forwardRef } from "react";
import { TemplateProps, DOC_TITLE, qar } from "./types";

/**
 * "Ledger" — classic structured template.
 * Navy header band, boxed meta grid, solid ruled table, gold underline accents.
 * Traditional and authoritative, refined spacing and type for a premium feel.
 */
const ClassicTemplate = forwardRef<HTMLDivElement, TemplateProps>(
  ({ invoice, settings, options }, ref) => {
    const showPrices = invoice.type !== "DN";
    const cols = showPrices ? 6 : 4;
    const showSignature = options?.showSignature ?? true;
    const showReturnPolicy = options?.showReturnPolicy ?? true;
    const showWords = options?.showAmountInWords ?? true;
    return (
      <div
        ref={ref}
        className="invoice-paper bg-white text-[#1e2a3a] mx-auto"
        style={{
          width: "210mm",
          minHeight: "297mm",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {/* Navy header band */}
        <div style={{ background: "#1e2a3a", color: "#fff", padding: "14mm 16mm 10mm" }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[22px] font-bold tracking-tight leading-tight">
                {settings.storeNameEn ?? "Company Name"}
              </div>
              {settings.storeNameAr && (
                <div className="text-[13px] text-white/70 mt-1" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
                  {settings.storeNameAr}
                </div>
              )}
              <div className="text-[10.5px] text-white/60 mt-2 leading-relaxed">
                {settings.addressEn}
                {settings.phone && <><br />{settings.phone}{settings.email ? `  ·  ${settings.email}` : ""}</>}
              </div>
            </div>
            <div className="text-right">
              <div
                className="inline-block text-[13px] font-semibold uppercase tracking-[0.2em] px-3 py-1 rounded"
                style={{ background: "#d4a017", color: "#1e2a3a" }}
              >
                {DOC_TITLE[invoice.type]}
              </div>
              <div className="text-[24px] font-bold mt-3 leading-none">{invoice.number}</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "10mm 16mm 16mm" }}>
          {/* Meta grid */}
          <div className="grid grid-cols-2 border" style={{ borderColor: "#e5e7eb" }}>
            <MetaCell label="Bill To">
              <div className="text-[14px] font-semibold">{invoice.customerName || "Cash Customer"}</div>
              {invoice.customerPhone && <div className="text-[11px] text-[#6b7280]">{invoice.customerPhone}</div>}
            </MetaCell>
            <div className="grid grid-cols-2">
              <MetaCell label="Date" border>
                <span className="text-[13px] font-medium">
                  {new Date(invoice.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </MetaCell>
              <MetaCell label="PO Number" border>
                <span className="text-[13px] font-medium font-mono">{invoice.poNumber || "—"}</span>
              </MetaCell>
            </div>
          </div>

          {/* Items table */}
          <table className="w-full border-collapse mt-6 text-[12.5px]">
            <thead>
              <tr style={{ background: "#f3f4f6" }} className="text-[10px] uppercase tracking-[0.1em] text-[#4b5563]">
                <th className="text-left font-semibold px-3 py-2.5 border" style={{ borderColor: "#e5e7eb", width: "32px" }}>#</th>
                <th className="text-left font-semibold px-3 py-2.5 border" style={{ borderColor: "#e5e7eb" }}>Description</th>
                <th className="text-right font-semibold px-3 py-2.5 border" style={{ borderColor: "#e5e7eb", width: "54px" }}>Qty</th>
                <th className="text-left font-semibold px-3 py-2.5 border" style={{ borderColor: "#e5e7eb", width: "54px" }}>Unit</th>
                {showPrices && <th className="text-right font-semibold px-3 py-2.5 border" style={{ borderColor: "#e5e7eb", width: "90px" }}>Price</th>}
                {showPrices && <th className="text-right font-semibold px-3 py-2.5 border" style={{ borderColor: "#e5e7eb", width: "100px" }}>Amount</th>}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-2.5 border text-[#9ca3af]" style={{ borderColor: "#e5e7eb" }}>{i + 1}</td>
                  <td className="px-3 py-2.5 border" style={{ borderColor: "#e5e7eb" }}>
                    <span className="font-medium">{it.description}</span>
                    {it.sku && <span className="text-[10px] text-[#9ca3af] font-mono ml-2">{it.sku}</span>}
                  </td>
                  <td className="px-3 py-2.5 border text-right" style={{ borderColor: "#e5e7eb" }}>{it.qty}</td>
                  <td className="px-3 py-2.5 border text-[#6b7280]" style={{ borderColor: "#e5e7eb" }}>{it.unit}</td>
                  {showPrices && <td className="px-3 py-2.5 border text-right" style={{ borderColor: "#e5e7eb" }}>{qar(it.price)}</td>}
                  {showPrices && <td className="px-3 py-2.5 border text-right font-semibold" style={{ borderColor: "#e5e7eb" }}>{qar(it.amount)}</td>}
                </tr>
              ))}
              {/* filler rows for a full-page ledger feel */}
              {Array.from({ length: Math.max(0, 8 - invoice.items.length) }).map((_, i) => (
                <tr key={`f${i}`}>
                  {Array.from({ length: cols }).map((__, c) => (
                    <td key={c} className="px-3 py-2.5 border" style={{ borderColor: "#eef0f2", height: "34px" }}>&nbsp;</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          {showPrices && (
            <div className="flex justify-end mt-5">
              <table className="text-[12.5px]" style={{ width: "82mm" }}>
                <tbody>
                  <TotalRow label="Subtotal" value={`QAR ${qar(Number(invoice.subtotal || 0))}`} />
                  {Number(invoice.discountAmount || 0) > 0 && (
                    <TotalRow label="Gross Discount" value={`− QAR ${qar(Number(invoice.discountAmount || 0))}`} />
                  )}
                  {invoice.taxAmount > 0 && <TotalRow label={`Tax (${invoice.taxRate}%)`} value={`QAR ${qar(invoice.taxAmount)}`} />}
                  <tr>
                    <td className="py-2 text-[12px] font-bold uppercase tracking-wide" style={{ borderTop: "2px solid #1e2a3a" }}>Total</td>
                    <td className="py-2 text-right text-[16px] font-bold" style={{ borderTop: "2px solid #1e2a3a", color: "#1e2a3a" }}>
                      QAR {qar(invoice.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {showPrices && showWords && invoice.totalWords && (
            <div className="mt-3 text-[11px] italic text-[#6b7280] border-l-2 pl-3" style={{ borderColor: "#d4a017" }}>
              {invoice.totalWords}
            </div>
          )}

          {invoice.notes && (
            <div className="mt-6 text-[11px] text-[#374151]">
              <span className="font-semibold">Notes: </span>{invoice.notes}
            </div>
          )}

          {/* Footer */}
          {(showReturnPolicy || showSignature) && (
            <div className="mt-10 grid grid-cols-2 gap-8 items-end">
              <div className="text-[10px] text-[#9ca3af] leading-relaxed">
                {showReturnPolicy ? settings.returnPolicyText : ""}
              </div>
              {showSignature && (
                <div className="text-right">
                  <div className="h-px w-[50mm] bg-[#9ca3af] mb-1.5 ml-auto" />
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#6b7280]">For {settings.storeNameEn?.split(" ").slice(0, 2).join(" ")}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

function MetaCell({ label, children, border }: { label: string; children: React.ReactNode; border?: boolean }) {
  return (
    <div className={`px-4 py-3 ${border ? "border-l" : ""}`} style={{ borderColor: "#e5e7eb" }}>
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-[#9ca3af] mb-1">{label}</div>
      {children}
    </div>
  );
}

function TotalRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <tr>
      <td className="py-1.5 text-[#6b7280]">{label}</td>
      <td className="py-1.5 text-right" style={{ color: accent }}>{value}</td>
    </tr>
  );
}

ClassicTemplate.displayName = "ClassicTemplate";
export default ClassicTemplate;
