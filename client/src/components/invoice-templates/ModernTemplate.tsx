import { forwardRef } from "react";
import { TemplateProps, DOC_TITLE, qar } from "./types";

/**
 * "Aurora" — modern minimal template.
 * Generous whitespace, hairline rules, one navy accent, tabular figures.
 * No heavy borders or zebra striping; hierarchy comes from type weight + space.
 */
const ModernTemplate = forwardRef<HTMLDivElement, TemplateProps>(
  ({ invoice, settings, options }, ref) => {
    const showPrices = invoice.type !== "DN";
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
          padding: "18mm 16mm",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div
              className="text-[26px] font-extrabold tracking-tight leading-none"
              style={{ letterSpacing: "-0.03em" }}
            >
              {settings.storeNameEn ?? "Company Name"}
            </div>
            {settings.storeNameAr && (
              <div className="text-sm text-[#6b7280] mt-1" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
                {settings.storeNameAr}
              </div>
            )}
            <div className="text-[11px] text-[#6b7280] mt-2 leading-relaxed max-w-[78mm]">
              {settings.addressEn}
              {settings.phone && <><br />{settings.phone}</>}
              {settings.crNumber && <>{"  ·  CR "}{settings.crNumber}</>}
            </div>
          </div>

          <div className="text-right">
            <div
              className="uppercase text-[11px] font-semibold tracking-[0.25em] text-[#d4a017]"
            >
              {DOC_TITLE[invoice.type]}
            </div>
            <div className="text-[28px] font-bold leading-none mt-1" style={{ letterSpacing: "-0.02em" }}>
              {invoice.number}
            </div>
            <div className="text-[11px] text-[#6b7280] mt-2">
              {new Date(invoice.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* Accent rule */}
        <div className="mt-6 mb-7 h-px w-full" style={{ background: "linear-gradient(90deg, #1e2a3a 0%, #d4a017 100%)" }} />

        {/* Meta row */}
        <div className="grid grid-cols-3 gap-6 mb-9">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#9ca3af] mb-1.5">Billed to</div>
            <div className="text-[14px] font-semibold">{invoice.customerName || "Cash Customer"}</div>
            {invoice.customerPhone && <div className="text-[11px] text-[#6b7280] mt-0.5">{invoice.customerPhone}</div>}
          </div>
          {invoice.poNumber ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#9ca3af] mb-1.5">PO Number</div>
              <div className="text-[13px] font-medium font-mono">{invoice.poNumber}</div>
            </div>
          ) : <div />}
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#9ca3af] mb-1.5">Amount due</div>
            <div className="text-[20px] font-bold" style={{ color: "#1e2a3a" }}>
              QAR {qar(invoice.total)}
            </div>
          </div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-[#9ca3af]">
              <th className="text-left font-medium pb-2.5">Description</th>
              <th className="text-right font-medium pb-2.5 w-[60px]">Qty</th>
              <th className="text-left font-medium pb-2.5 w-[60px] pl-3">Unit</th>
              {showPrices && <th className="text-right font-medium pb-2.5 w-[90px]">Price</th>}
              {showPrices && <th className="text-right font-medium pb-2.5 w-[100px]">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={i} className="align-top" style={{ borderTop: "1px solid #f0f1f3" }}>
                <td className="py-3 pr-3">
                  <div className="text-[13px] font-medium leading-snug">{it.description}</div>
                  {it.sku && <div className="text-[10px] text-[#9ca3af] font-mono mt-0.5">{it.sku}</div>}
                </td>
                <td className="py-3 text-right text-[13px]">{it.qty}</td>
                <td className="py-3 pl-3 text-[12px] text-[#6b7280]">{it.unit}</td>
                {showPrices && <td className="py-3 text-right text-[13px]">{qar(it.price)}</td>}
                {showPrices && <td className="py-3 text-right text-[13px] font-semibold">{qar(it.amount)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        {showPrices && (
          <div className="flex justify-end mt-7">
            <div className="w-[78mm]">
              <Row label="Subtotal" value={`QAR ${qar(Number(invoice.subtotal || 0))}`} />
              {Number(invoice.discountAmount || 0) > 0 && (
                <Row label="Gross Discount" value={`− QAR ${qar(Number(invoice.discountAmount || 0))}`} />
              )}
              {invoice.taxAmount > 0 && <Row label={`Tax (${invoice.taxRate}%)`} value={`QAR ${qar(invoice.taxAmount)}`} />}
              <div className="flex justify-between items-baseline mt-2.5 pt-3" style={{ borderTop: "2px solid #1e2a3a" }}>
                <span className="text-[12px] font-semibold uppercase tracking-wide">Total</span>
                <span className="text-[18px] font-bold">QAR {qar(invoice.total)}</span>
              </div>
            </div>
          </div>
        )}

        {showPrices && showWords && invoice.totalWords && (
          <div className="mt-4 text-[11px] italic text-[#6b7280]">{invoice.totalWords}</div>
        )}

        {invoice.notes && (
          <div className="mt-8">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#9ca3af] mb-1">Notes</div>
            <div className="text-[12px] text-[#374151] leading-relaxed whitespace-pre-line">{invoice.notes}</div>
          </div>
        )}

        {/* Footer */}
        {(showReturnPolicy || showSignature) && (
          <div className="mt-12 pt-5 flex items-end justify-between" style={{ borderTop: "1px solid #f0f1f3" }}>
            <div className="text-[10px] text-[#9ca3af] leading-relaxed max-w-[100mm]">
              {showReturnPolicy ? settings.returnPolicyText : ""}
            </div>
            {showSignature && (
              <div className="text-right">
                <div className="h-px w-[50mm] bg-[#d1d5db] mb-1.5 ml-auto" />
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#9ca3af]">Authorized signature</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1.5">
      <span className="text-[12px] text-[#6b7280]">{label}</span>
      <span className={`text-[13px] ${muted ? "text-[#b91c1c]" : ""}`}>{value}</span>
    </div>
  );
}

ModernTemplate.displayName = "ModernTemplate";
export default ModernTemplate;
