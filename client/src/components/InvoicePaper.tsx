// @ts-nocheck
import { forwardRef } from "react";
import type { Settings, InvoiceWithItems } from "@shared/schema";
import { format } from "date-fns";
import { clsx } from "clsx";
import logoImg from "@assets/generated_images/minimalist_professional_mtc_text_logo.png";
import { TermsFooter } from "@/components/invoice-templates/TermsFooter";

interface InvoicePaperProps {
  settings: Settings;
  invoice: InvoiceWithItems;
  className?: string;
  template?: "template1" | "template2" | "template3" | "template4" | "template5";
  docType?: "invoice" | "quotation" | "delivery_note" | "return" | "credit_note";
}

export const InvoicePaper = forwardRef<HTMLDivElement, InvoicePaperProps>(
  ({ settings, invoice, className, template = "template1", docType: docTypeProp }, ref) => {
    const isTemplate1 = template === "template1"; // Modern Blue
    const isTemplate2 = template === "template2"; // Yellow/Black (Inspired)
    const isTemplate3 = template === "template3"; // Cyan/Modern (Inspired)
    const isTemplate4 = template === "template4"; // Red/Professional (Inspired)
    const isTemplate5 = template === "template5"; // Dark/Minimal

    // Auto-detect document type from invoice number prefix (QT- = quotation, DN- = delivery note, CN- = credit note, RV- = legacy return)
    const detectedType = invoice.invoiceNumber?.startsWith("QT-") ? "quotation"
      : invoice.invoiceNumber?.startsWith("DN-") ? "delivery_note"
      : invoice.invoiceNumber?.startsWith("CN-") ? "credit_note"
      : invoice.invoiceNumber?.startsWith("RV-") ? "return"
      : "invoice";
    const docType = docTypeProp || detectedType;

    const isDeliveryNote = docType === "delivery_note";
    const isQuotation = docType === "quotation";
    const isCreditNote = docType === "credit_note";
    const isReturn = docType === "return";

    // Title labels. For an invoice, the heading itself carries the Cash/Credit type.
    const invLabel = (invoice as any).invoiceTypeLabel;
    const invEn = invLabel === "Cash Invoice" ? "CASH INVOICE" : invLabel === "Credit Invoice" ? "CREDIT INVOICE" : "INVOICE";
    const invAr = invLabel === "Cash Invoice" ? "فاتورة نقدية" : invLabel === "Credit Invoice" ? "فاتورة آجلة" : "فاتورة";
    const docTitleEn = isDeliveryNote ? "DELIVERY NOTE" : isQuotation ? "QUOTATION" : isCreditNote ? "CREDIT NOTE" : isReturn ? "RETURN INVOICE" : invEn;
    const docTitleAr = isDeliveryNote ? "إشعار تسليم" : isQuotation ? "عرض سعر" : isCreditNote ? "إشعار دائن" : isReturn ? "فاتورة إرجاع" : invAr;

    // "Bill To" label
    const billToLabelEn = isDeliveryNote ? "DELIVER TO" : isQuotation ? "TO" : "BILL TO";
    const billToLabelAr = isDeliveryNote ? "التسليم إلى" : isQuotation ? "إلى" : "العميل";

    // Number label
    const docRefLabel = isDeliveryNote ? "DN NO. / رقم" : isQuotation ? "QT NO. / رقم" : "NO. / رقم";

    const customerName = (invoice.customerName || "CASH CUSTOMER").toUpperCase(); 

// Function to convert Western digits (123) to Eastern Arabic digits (١٢٣)
const toArabicDigits = (num: string | number) => {
  if (num === undefined || num === null) return '';
  const id = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().replace(/[0-9]/g, (w) => id[+w]);
};
    // Template specific colors
    const primaryColor = isTemplate2 ? "bg-[#f59e0b]" : 
                         isTemplate3 ? "bg-[#06b6d4]" : 
                         isTemplate4 ? "bg-[#ef4444]" : 
                         isTemplate1 ? "bg-blue-600" : "bg-gray-900";

    const borderColor = isTemplate2 ? "border-[#f59e0b]" : 
                        isTemplate3 ? "border-[#06b6d4]" : 
                        isTemplate4 ? "border-[#ef4444]" : 
                        isTemplate1 ? "border-blue-600" : "border-gray-900";

    const textColor = isTemplate2 ? "text-[#f59e0b]" : 
                      isTemplate3 ? "text-[#06b6d4]" : 
                      isTemplate4 ? "text-[#ef4444]" : 
                      isTemplate1 ? "text-blue-600" : "text-gray-900";

    // 10% opacity for table header background
    const headerBgColor = isTemplate2 ? "bg-[#f59e0b]/10" : 
                          isTemplate3 ? "bg-[#06b6d4]/10" : 
                          isTemplate4 ? "bg-[#ef4444]/10" : 
                          isTemplate1 ? "bg-blue-600/10" : "bg-gray-900/10";

    const headerTextColor = isTemplate2 ? "text-[#f59e0b]" :
                            isTemplate3 ? "text-[#06b6d4]" :
                            isTemplate4 ? "text-[#ef4444]" :
                            isTemplate1 ? "text-blue-600" : "text-gray-900";

    // Per-line discount is derived (gross − amount) and shown in the line-items
    // table only. The footer shows NET Subtotal / Total — never an aggregate
    // discount line (that would reveal internal pricing strategy to the customer).
    const _n = (v: any) => Number(v || 0);
    const lineGross = (it: any) => _n(it.quantity) * _n(it.unitPrice);
    const lineDiscount = (it: any) => Math.max(0, lineGross(it) - _n(it.amount));
    const grandTotalCalc = _n(invoice.totalAmount);
    const money2 = (n: number) => n.toFixed(2);

    // Split the Arabic company name into two balanced lines (mirrors the English name's 2-line wrap)
    const arNameWords = (settings.storeNameAr || "").trim().split(/\s+/);
    const arSplit = Math.ceil(arNameWords.length / 2);
    const arNameLine1 = arNameWords.slice(0, arSplit).join(" ");
    const arNameLine2 = arNameWords.slice(arSplit).join(" ");

    return (
      <div 
        ref={ref} 
        className={clsx(
          "bg-white text-black w-[210mm] h-[297mm] max-h-[297mm] shadow-xl print:shadow-none relative overflow-hidden flex flex-col uppercase print:w-[210mm] print:h-[297mm] print:max-h-[297mm] print:m-0 print:p-[10mm]",
          className
        )}
        style={{ 
          boxSizing: 'border-box',
          margin: '0 auto',
          padding: '10mm' 
        }}
      >
        {/* Geometric Accents */}
        {(isTemplate2 || isTemplate3 || isTemplate4) && (
          <>
            <div className={clsx("absolute top-0 right-0 w-64 h-12 transform skew-x-[30deg] translate-x-12", primaryColor)} />
            <div className={clsx("absolute bottom-0 left-0 w-64 h-8 transform skew-x-[-30deg] -translate-x-12", primaryColor)} />
          </>
        )}

        {/* Header Section — strict 1fr · auto · 1fr mirrored bilingual grid */}
        <div className={clsx(
          "grid grid-cols-[1fr_auto_1fr] w-full items-start gap-4 pb-4 mb-6 relative z-10",
          !isTemplate3 && !isTemplate5 && "border-b-2 border-black",
          isTemplate3 && "bg-[#06b6d4] text-white -mx-[10mm] -mt-[10mm] p-[10mm] mb-6",
          isTemplate5 && "bg-gray-900 text-white -mx-[10mm] -mt-[10mm] p-[10mm] mb-6 border-b-[4px] border-blue-500"
        )}>
          {/* Column 1 (1fr) — English: fixed-height rows lock level with the Arabic column */}
          <div className="w-full flex flex-col gap-1 text-left">
            <div className={clsx(
              "h-12 flex items-end w-full text-[18px] font-bold tracking-tight leading-[1.15]",
              (isTemplate3 || isTemplate5) ? "text-white" : textColor
            )} style={{ fontWeight: 700 }}>{settings.storeNameEn.toUpperCase()}</div>
            <div className={clsx(
              "w-full text-[10px] uppercase",
              (isTemplate3 || isTemplate5) ? "text-white/90" : "text-gray-600"
            )} style={{ fontWeight: 700 }}>
              <div className="h-5 leading-5">P.O. BOX: <span className={clsx((isTemplate3 || isTemplate5) ? "text-white" : "text-black")}>{settings.poBox}</span></div>
              <div className="h-5 leading-5">PHONE: <span dir="ltr" className={clsx("inline-block align-middle", (isTemplate3 || isTemplate5) ? "text-white" : "text-black")}>{settings.phone}</span></div>
              <div className="h-5 leading-5">C.R. NO: <span className={clsx((isTemplate3 || isTemplate5) ? "text-white" : "text-black")}>{settings.crNumber}</span></div>
              <div className="h-5 leading-5 text-[9px] opacity-80">{settings.addressEn.toUpperCase()}</div>
            </div>
          </div>

          {/* Column 2 (auto) — Logo, vertically centered relative to the text */}
          <div className="w-auto self-center flex items-center justify-center px-3">
            <img src={logoImg} alt="MTC LOGO" className={clsx(
              "w-24 h-24 object-contain",
              (isTemplate3 || isTemplate5) && "brightness-0 invert"
            )} />
          </div>

          {/* Column 3 (1fr) — Arabic: mirrors English fixed-height rows so both columns lock level */}
          <div className="w-full flex flex-col gap-1 text-right font-arabic" dir="rtl" style={{ fontWeight: 700 }}>
            <div dir="rtl" className={clsx(
              "h-12 flex flex-col justify-end text-right w-full text-[18px] font-bold leading-snug",
              (isTemplate3 || isTemplate5) ? "text-white" : textColor
            )} style={{ fontWeight: 700 }}>{settings.storeNameAr}</div>
            <div className={clsx(
              "w-full text-[10px]",
              (isTemplate3 || isTemplate5) ? "text-white/90" : "text-gray-800"
            )} style={{ fontWeight: 700 }}>
              <div className="h-5 leading-5">ص.ب: <span className={clsx((isTemplate3 || isTemplate5) ? "text-white" : "text-black")}>{toArabicDigits(settings.poBox)}</span></div>
              <div className="h-5 leading-5">هاتف: <span className={clsx((isTemplate3 || isTemplate5) ? "text-white" : "text-black")}>{toArabicDigits(settings.phone)}</span></div>
              <div className="h-5 leading-5">س.ت: <span className={clsx((isTemplate3 || isTemplate5) ? "text-white" : "text-black")}>{toArabicDigits(settings.crNumber)}</span></div>
              <div className="h-5 leading-5 text-[9px] opacity-90">{settings.addressAr}</div>
            </div>
          </div>
        </div>

        {/* Centered Invoice Title - Slimmer Padding */}
        <div className="w-full py-0.5 mb-2 flex flex-col items-center justify-center relative z-10">
          <div className="w-full border-t border-gray-200 opacity-50 mb-0.5"></div>
          <h1 className="text-[20pt] font-bold text-gray-900 tracking-[0.2em] py-0.5 leading-none" style={{ fontWeight: 700 }}>{docTitleAr} / {docTitleEn}</h1>
          <div className="w-full border-t border-gray-200 opacity-50 mt-0.5"></div>
        </div>

        {/* Invoice Meta Section - Tighter Spacing */}
        <div className="flex justify-between items-end mb-4 px-2 relative z-10">
          <div className="text-left">
            <p className={clsx("text-[9px] tracking-[0.2em] font-bold mb-0.5", textColor)} style={{ fontWeight: 700 }}>{billToLabelEn} / {billToLabelAr}</p>
            <h3 className="text-xl font-bold text-gray-700 border-b border-current inline-block pb-0.5" style={{ fontWeight: 700, fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>{customerName}</h3>
          </div>
          <div className="text-right">
            <div className="flex gap-6 justify-end border border-gray-100 p-2 rounded bg-gray-50/30">
              <div>
                <p className={clsx("text-[9px] tracking-widest font-bold", textColor)} style={{ fontWeight: 700 }}>{docRefLabel}</p>
                <p className="font-mono font-bold text-base text-gray-900 leading-none mt-0.5" style={{ fontWeight: 700 }}>{invoice.invoiceNumber}</p>
              </div>
              <div className="border-l border-gray-200 h-6 self-center"></div>
              <div>
                <p className={clsx("text-[9px] tracking-widest font-bold", textColor)} style={{ fontWeight: 700 }}>DATE / التاريخ</p>
                <p className="font-mono font-bold text-base text-gray-900 leading-none mt-0.5" style={{ fontWeight: 700 }}>{format(new Date(invoice.date), "dd/MM/yyyy")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Items Table - Standard 11pt Body, Reduced Padding, Modern Styling */}
        <div className="relative z-10 mb-2 flex-1 overflow-hidden px-1">
          <table className="w-full border-collapse">
            <thead>
              <tr className={clsx("border-b-2", borderColor, headerBgColor, headerTextColor)}>
                <th className="py-1 px-2 text-left font-bold text-[10px] w-10" style={{ fontWeight: 700 }}>NO.</th>
                <th className="py-1 px-2 text-left font-bold text-[10px]" style={{ fontWeight: 700 }}>DESCRIPTION</th>
                <th className="py-1 px-2 text-center font-bold text-[10px] w-16" style={{ fontWeight: 700 }}>QTY</th>
                <th className="py-1 px-2 text-center font-bold text-[10px] w-20" style={{ fontWeight: 700 }}>UNIT</th>
                {!isDeliveryNote && <th className="py-1 px-2 text-right font-bold text-[10px] w-24" style={{ fontWeight: 700 }}>PRICE</th>}
                {!isDeliveryNote && <th className="py-1 px-2 text-right font-bold text-[10px] w-20" style={{ fontWeight: 700 }}>DISCOUNT</th>}
                {!isDeliveryNote && <th className="py-1 px-2 text-right font-bold text-[10px] w-24" style={{ fontWeight: 700 }}>AMOUNT</th>}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={idx} className={clsx("border-b transition-colors", isTemplate2 ? "border-[#fef3c7]/30" : "border-gray-100")}>
                  <td className={clsx("py-[2px] px-1 text-center text-[11pt] font-bold text-gray-400")}>{idx + 1}</td>
                  <td className={clsx("py-[2px] px-1 text-[11pt] font-bold text-gray-900")} style={{ fontWeight: 700 }}>{item.description.toUpperCase()}</td>
                  <td className={clsx("py-[2px] px-1 text-center text-[11pt] font-mono font-bold text-gray-700")}>{item.quantity}</td>
                  <td className={clsx("py-[2px] px-1 text-center text-[11pt] font-bold text-gray-500")} style={{ fontWeight: 700 }}>{item.unit.toUpperCase()}</td>
                  {!isDeliveryNote && <td className={clsx("py-[2px] px-1 text-right text-[11pt] font-mono font-bold text-gray-700")}>{item.unitPrice}</td>}
                  {!isDeliveryNote && <td className={clsx("py-[2px] px-1 text-right text-[11pt] font-mono font-bold", lineDiscount(item) > 0 ? "text-gray-700" : "text-gray-300")}>{money2(lineDiscount(item))}</td>}
                  {!isDeliveryNote && <td className={clsx("py-[2px] px-1 text-right text-[11pt] font-mono font-bold", textColor)} style={{ fontWeight: 700 }}>{item.amount}</td>}
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 15 - invoice.items.length) }).map((_, idx) => (
                <tr key={`empty-${idx}`} className={clsx("border-b h-6", isTemplate2 ? "border-[#fef3c7]/20" : "border-gray-100/50")}>
                  <td colSpan={isDeliveryNote ? 4 : 7}></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section - Tightened Footer */}
        <div className="flex flex-row justify-between items-start gap-2 relative z-10 print:break-inside-avoid mt-auto pb-4 px-2">
          <div className="w-[60%] flex flex-col justify-between h-full">
             {!isDeliveryNote && (
             <div className="bg-gray-50 p-2 rounded border border-gray-100 shadow-sm mb-4">
                <p className={clsx("text-[9px] tracking-widest font-bold mb-0.5 opacity-60", textColor)} style={{ fontWeight: 700 }}>AMOUNT IN WORDS / المبلغ بالحروف</p>
                <p className={clsx("font-bold italic text-base uppercase leading-tight underline underline-offset-2 decoration-current/10", textColor)} style={{ fontWeight: 700 }}>{invoice.totalAmountWords?.toUpperCase() || "---"}</p>
             </div>
             )}
             {!isDeliveryNote && !isQuotation && (
               <div className="px-4 mt-4"><TermsFooter terms={(invoice as any).terms} /></div>
             )}
             <div className="flex justify-between px-4 mt-8">
  {/* Invoice: Salesman + Receiver */}
  {!isDeliveryNote && !isQuotation && (
    <>
      <div className="text-center w-32">
        <p className="font-bold text-sm uppercase mb-1 min-h-[20px]"></p>
        <div className="border-t border-gray-400 mb-2 w-full"></div>
        <p className="font-bold text-[9px] text-gray-500 uppercase leading-none">SALESMAN SIGNATURE</p>
        <p className="text-[10px] font-arabic font-bold opacity-70 mt-1">توقيع البائع</p>
      </div>
      <div className="text-center w-32">
        <p className="font-bold text-sm uppercase mb-1 min-h-[20px]">{invoice.receiverSignature || ""}</p>
        <div className="border-t border-gray-400 mb-2 w-full"></div>
        <p className="font-bold text-[9px] text-gray-500 uppercase leading-none">RECEIVER'S SIGNATURE</p>
        <p className="text-[14px] font-arabic font-bold opacity-70 mt-1">توقيع المستلم</p>
      </div>
    </>
  )}
  {/* Quotation: Authorized Signature only (centered) */}
  {isQuotation && (
    <div className="text-center w-48 mx-auto">
      <div className="border-t border-gray-400 mb-2 w-full"></div>
      <p className="font-bold text-[9px] text-gray-500 uppercase leading-none">AUTHORIZED SIGNATURE</p>
      <p className="text-[10px] font-arabic font-bold opacity-70 mt-1">التوقيع المعتمد</p>
    </div>
  )}
  {/* Delivery Note: Delivered By + Received By */}
  {isDeliveryNote && (
    <>
      <div className="text-center w-32">
        <div className="border-t border-gray-400 mb-2 w-full"></div>
        <p className="font-bold text-[9px] text-gray-500 uppercase leading-none">DELIVERED BY</p>
        <p className="text-[10px] font-arabic font-bold opacity-70 mt-1">سلّمه</p>
      </div>
      <div className="text-center w-32">
        <div className="border-t border-gray-400 mb-2 w-full"></div>
        <p className="font-bold text-[9px] text-gray-500 uppercase leading-none">RECEIVED BY</p>
        <p className="text-[10px] font-arabic font-bold opacity-70 mt-1">استلمه</p>
      </div>
    </>
  )}
</div>
          </div>

          {!isDeliveryNote && <div className="w-[35%] flex flex-col gap-2">
             {/* Gross Discount is INTERNAL: the breakdown shows on the staff screen but
                 the customer's printed/PDF copy shows only a clean net Subtotal + Total. */}
             <div className="flex justify-between items-center px-2 py-1 border-b border-gray-100">
               <span className="text-[10px] font-bold tracking-widest text-gray-500" style={{ fontWeight: 700 }}>SUBTOTAL / المجموع</span>
               <span className="font-mono font-bold text-sm text-gray-900" style={{ fontWeight: 700 }}>
                 <span className="print:hidden">{money2(_n((invoice as any).subtotalAmount) || grandTotalCalc)}</span>
                 <span className="hidden print:inline">{money2(grandTotalCalc)}</span>
               </span>
             </div>
             {_n((invoice as any).discountAmount) > 0 && (
               <div className="flex justify-between items-center px-2 py-1 border-b border-gray-100 print:hidden">
                 <span className="text-[10px] font-bold tracking-widest text-amber-600" style={{ fontWeight: 700 }}>GROSS DISCOUNT / الخصم <span className="text-[8px] normal-case">(internal)</span></span>
                 <span className="font-mono font-bold text-sm text-amber-700" style={{ fontWeight: 700 }}>− {money2(_n((invoice as any).discountAmount))}</span>
               </div>
             )}
             <div className={clsx("p-3 rounded shadow-sm flex flex-col items-end gap-1 text-white", primaryColor)}>
               <div className="flex justify-between w-full items-center">
                 <span className="text-sm font-bold tracking-[0.2em]" style={{ fontWeight: 700 }}>TOTAL</span>
                 <span className="text-2xl font-mono font-bold" style={{ fontWeight: 700 }}>{invoice.totalAmount}</span>
               </div>
               <div className="flex items-center gap-2">
                 <span className="text-[10px] font-bold opacity-90 font-arabic">المجموع الكلي</span>
                 <span className="text-[10px] font-bold opacity-100 border border-white/40 px-1.5 rounded bg-white/10" style={{ fontWeight: 700 }}>QAR</span>
               </div>
             </div>
          </div>}
        </div>

        {/* Footer Address Bar */}
        <div className="pt-2 text-center relative z-10 border-t border-gray-100 flex flex-col items-center gap-0.5 mt-2">
          <p className="text-[9px] text-gray-600 font-bold tracking-[0.1em] leading-none uppercase flex items-center gap-3" style={{ fontWeight: 700 }}>
            <span dir="ltr" className="inline-block">MOBILE: {settings.phone}</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
            <span>{settings.addressEn.toUpperCase()}</span>
          </p>
          <p className="text-[8px] text-gray-400 font-bold font-arabic leading-none mt-0.5" style={{ fontWeight: 700 }}>
            {settings.addressAr}
          </p>
        </div>
      </div>
    );
  }
);

InvoicePaper.displayName = "InvoicePaper";