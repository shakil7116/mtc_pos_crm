import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { clsx } from "clsx";
import type { TemplateProps } from "./types";
import { TermsFooter } from "./TermsFooter";
import {
  Pair, ColHead, FitBox, docTitles, billToLabel, signaturesFor, L, money, dmy,
  lineDiscount, fillerRows, arabicDigits,
} from "./bilingual";

/* ── PALM ─────────────────────────────────────────────────────────────────────
   Green and gold, with the logo in the letterhead.

   The other two put the two languages side by side or one above the other. This
   one leads with the MARK: logo left, then the company in both languages beside
   it, so the eye lands on the badge first the way it does on a shop sign.

   Green carries the structure, gold marks the money, and every word of text is
   black — a colour that has to survive a cheap printer, a photocopier and a
   phone photo sent to a site.
──────────────────────────────────────────────────────────────────────────────*/

const GREEN = "#1B5E3F";
const GREEN_SOFT = "#EAF2ED";
const GOLD = "#D9A427";
const INK = "#111111";
const SANS = "'Barlow Condensed', Montserrat, system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const PalmTemplate = forwardRef<HTMLDivElement, TemplateProps & { className?: string }>(
  ({ invoice, settings, options, className }, ref) => {
    const isDN = invoice.type === "DN";
    const isQT = invoice.type === "QT";
    const title = docTitles(invoice);
    const to = billToLabel(invoice.type);
    const cols = isDN ? 4 : 7;

    const netSubtotal = invoice.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const gross = Number(invoice.subtotal ?? netSubtotal) || netSubtotal;
    const footerDiscount = Number(invoice.discountAmount || 0);
    const tax = Number(invoice.taxAmount || 0);
    const logo = (settings as any).logoUrl as string | undefined;

    const cell = { padding: "1mm 2mm", fontSize: "9.2pt", whiteSpace: "nowrap" as const };
    const head = {
      background: GREEN, color: "#fff", padding: "1.4mm 2mm",
      fontFamily: SANS, fontSize: "7pt", letterSpacing: ".12em",
      textTransform: "uppercase" as const, fontWeight: 600, whiteSpace: "nowrap" as const,
    };

    return (
      <div
        ref={ref}
        className={clsx(
          "invoice-paper tpl-cairo bg-white w-[210mm] max-w-full min-h-[297mm] print:min-h-0",
          "shadow-xl print:shadow-none flex flex-col print:block",
          className,
        )}
        style={{ boxSizing: "border-box", margin: "0 auto", padding: "10mm", fontFamily: SANS, color: INK }}
      >
        <div className="flex-1">
          <table className="w-full border-collapse" style={{ pageBreakInside: "auto" }}>
            <thead style={{ display: "table-header-group" }}>
              {/* The whole letterhead sits in the table head, so a second page of
                  a long order is still on company paper with labelled columns. */}
              <tr>
                <th colSpan={cols} style={{
                  padding: 0, background: "transparent", color: "inherit",
                  textAlign: "left", fontWeight: "inherit", letterSpacing: "normal",
                  textTransform: "none", border: "none", whiteSpace: "normal",
                }}>
                  {/* ── Letterhead: mark, then the company in both languages ── */}
                  <div className="flex items-center gap-[5mm]" style={{ paddingBottom: "2.5mm" }}>
                    {logo ? (
                      <img src={logo} alt="" style={{ width: "22mm", height: "22mm", objectFit: "contain" }} />
                    ) : (
                      <div
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: "22mm", height: "22mm", background: GREEN, color: "#fff",
                          fontSize: "16pt", fontWeight: 700, letterSpacing: ".06em", borderRadius: "1mm",
                        }}
                      >
                        MTC
                      </div>
                    )}
                    <div className="flex-1" style={{ minWidth: 0 }}>
                      <FitBox
                        text={settings.storeNameEn || ""}
                        width="100%" height="12mm" widthMm={158} heightMm={12} nowrap max={19}
                        className="uppercase"
                        style={{ color: GREEN, fontWeight: 700, justifyContent: "center" }}
                      />
                      <FitBox
                        text={settings.storeNameAr || ""}
                        width="100%" height="12mm" widthMm={158} heightMm={12} rtl nowrap max={19}
                        className="font-arabic"
                        style={{ color: GREEN, fontWeight: 700, justifyContent: "center" }}
                      />
                    </div>
                  </div>

                  {/* Contact: English line, then the same details in Arabic. */}
                  <div style={{ borderTop: `.8mm solid ${GOLD}`, borderBottom: `.2mm solid ${GREEN}`, padding: "1.4mm 0", fontSize: "7.2pt" }}>
                    <div className="flex justify-between gap-[4mm]">
                      <span>{L.poBox.en} <b style={{ fontFamily: MONO }}>{settings.poBox}</b>
                        {"  ·  "}{L.phone.en} <b style={{ fontFamily: MONO }}>{settings.phone}</b>
                        {"  ·  "}{L.cr.en} <b style={{ fontFamily: MONO }}>{settings.crNumber}</b></span>
                      <span>{settings.addressEn}</span>
                    </div>
                    <div className="flex justify-between gap-[4mm] font-arabic" dir="rtl" style={{ fontSize: "8pt", marginTop: ".6mm" }}>
                      <span>{L.poBox.ar} {arabicDigits(settings.poBox)}
                        {"  ·  "}{L.phone.ar} {arabicDigits(settings.phone)}
                        {"  ·  "}{L.cr.ar} {arabicDigits(settings.crNumber)}</span>
                      <span>{settings.addressAr}</span>
                    </div>
                  </div>

                  {/* ── Title: a green band with a gold edge ── */}
                  <div
                    className="flex items-baseline justify-center gap-[4mm] text-white"
                    style={{ background: GREEN, borderLeft: `2mm solid ${GOLD}`, padding: "1.8mm 4mm", margin: "3mm 0 2.5mm" }}
                  >
                    <span className="uppercase font-bold" style={{ fontSize: "14pt", letterSpacing: ".24em" }}>{title.en}</span>
                    <span className="font-arabic font-bold" dir="rtl" style={{ fontSize: "11pt" }}>{title.ar}</span>
                  </div>

                  {/* ── Who and when ── */}
                  <div className="flex justify-between items-end gap-[6mm]" style={{ marginBottom: "2.5mm" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="uppercase font-bold" style={{ fontSize: "6.2pt", letterSpacing: ".2em", color: GREEN }}>
                        <Pair en={to.en} ar={to.ar} />
                      </div>
                      <div className="font-bold uppercase" style={{ fontSize: "11pt" }}>
                        {invoice.customerName || "CASH CUSTOMER"}
                      </div>
                    </div>
                    <div className="flex gap-[7mm] shrink-0">
                      {[
                        [L.number, invoice.number],
                        [L.date, dmy(invoice.date)],
                        ...(invoice.poNumber ? [[L.poNumber, invoice.poNumber]] : []),
                      ].map(([lab, val]: any, i) => (
                        <div key={i} className="text-right">
                          <div className="uppercase font-bold" style={{ fontSize: "6.2pt", letterSpacing: ".2em", color: GREEN }}>
                            <Pair en={lab.en} ar={lab.ar} />
                          </div>
                          <div className="font-bold" style={{ fontSize: "11pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </th>
              </tr>
              <tr>
                <th className="text-center" style={{ ...head, width: "9mm" }}><ColHead en={L.no.en} ar={L.no.ar} /></th>
                <th className="text-left" style={head}><ColHead en={L.desc.en} ar={L.desc.ar} /></th>
                <th className="text-center" style={{ ...head, width: "15mm" }}><ColHead en={L.qty.en} ar={L.qty.ar} /></th>
                <th className="text-center" style={{ ...head, width: "17mm" }}><ColHead en={L.unit.en} ar={L.unit.ar} /></th>
                {!isDN && <th className="text-right" style={{ ...head, width: "23mm" }}><ColHead en={L.price.en} ar={L.price.ar} /></th>}
                {!isDN && <th className="text-right" style={{ ...head, width: "20mm" }}><ColHead en={L.disc.en} ar={L.disc.ar} /></th>}
                {!isDN && <th className="text-right" style={{ ...head, width: "30mm" }}><ColHead en={L.amount.en} ar={L.amount.ar} /></th>}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => {
                const d = lineDiscount(it);
                return (
                  <tr key={i} className="print:break-inside-avoid"
                      style={{ background: i % 2 ? GREEN_SOFT : undefined, borderBottom: `.15mm solid ${GREEN_SOFT}` }}>
                    <td className="text-center" style={{ ...cell, fontFamily: MONO }}>{i + 1}</td>
                    <td className="uppercase" style={{ ...cell, whiteSpace: "normal", overflowWrap: "anywhere" }}>{it.description}</td>
                    <td className="text-center" style={{ ...cell, fontFamily: MONO }}>{it.qty}</td>
                    <td className="text-center uppercase" style={cell}>{it.unit}</td>
                    {!isDN && <td className="text-right" style={{ ...cell, fontFamily: MONO }}>{money(it.price)}</td>}
                    {!isDN && <td className="text-right" style={{ ...cell, fontFamily: MONO, color: d > 0 ? INK : "#bdbdbd" }}>{d > 0 ? money(d) : "—"}</td>}
                    {!isDN && <td className="text-right font-bold" style={{ ...cell, fontFamily: MONO, color: GREEN }}>{money(it.amount)}</td>}
                  </tr>
                );
              })}
              {fillerRows(invoice.items.length).map((i) => (
                <tr key={`f${i}`} style={{ borderBottom: `.15mm solid ${GREEN_SOFT}` }}>
                  <td colSpan={cols} style={{ height: "5.2mm" }} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Words | totals ─────────────────────────────────────────────── */}
        <div
          className="grid gap-[6mm] mt-auto print:break-inside-avoid"
          style={{ gridTemplateColumns: isDN ? "1fr" : "minmax(0, 1fr) 66mm", paddingTop: "3mm" }}
        >
          <div style={{ minWidth: 0 }}>
            {!isDN && options?.showAmountInWords !== false && (
              <div style={{ borderLeft: `2mm solid ${GOLD}`, background: GREEN_SOFT, padding: "2mm 2.5mm" }}>
                <div className="uppercase font-bold" style={{ fontSize: "6pt", letterSpacing: ".2em", color: GREEN }}>
                  <Pair en={L.words.en} ar={L.words.ar} />
                </div>
                <div className="font-bold uppercase" style={{ fontSize: "8.4pt", marginTop: "1mm" }}>
                  {invoice.totalWords || "—"}
                </div>
              </div>
            )}

            {isDN && (invoice.deliveryAddress || invoice.mapLink || invoice.customerPhone) && (() => {
              const nav = invoice.mapLink
                || (invoice.deliveryAddress
                  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(invoice.deliveryAddress + ", Doha, Qatar")}`
                  : null);
              return (
                <div className="flex items-start justify-between gap-3 print:break-inside-avoid"
                     style={{ borderLeft: `2mm solid ${GOLD}`, background: GREEN_SOFT, padding: "2mm 2.5mm" }}>
                  <div className="min-w-0">
                    <div className="uppercase font-bold" style={{ fontSize: "6pt", letterSpacing: ".2em", color: GREEN }}>
                      <Pair en={L.delivery.en} ar={L.delivery.ar} />
                    </div>
                    {invoice.deliveryAddress && <p className="uppercase font-bold" style={{ fontSize: "8.5pt", marginTop: "1mm" }}>{invoice.deliveryAddress}</p>}
                    {invoice.customerPhone && <p dir="ltr" style={{ fontSize: "8pt", fontFamily: MONO }}>{invoice.customerPhone}</p>}
                    {invoice.deliveryInstructions && <p style={{ fontSize: "7pt", opacity: .75 }}>{invoice.deliveryInstructions}</p>}
                  </div>
                  {nav && <QRCodeSVG value={nav} size={58} level="M" />}
                </div>
              );
            })()}

            {!isDN && !isQT && <div style={{ marginTop: "2mm" }}><TermsFooter terms={invoice.terms} /></div>}
          </div>

          {!isDN && (
            <div>
              <div className="flex justify-between items-baseline" style={{ padding: "1.1mm 0", fontSize: "9pt", borderBottom: `.15mm solid ${GREEN_SOFT}` }}>
                <Pair en={L.subtotal.en} ar={L.subtotal.ar} />
                <span style={{ fontFamily: MONO }}>{money(gross)}</span>
              </div>
              {footerDiscount > 0 && (
                <div className="flex justify-between items-baseline" style={{ padding: "1.1mm 0", fontSize: "9pt", borderBottom: `.15mm solid ${GREEN_SOFT}` }}>
                  <Pair en={L.discount.en} ar={L.discount.ar} />
                  <span style={{ fontFamily: MONO }}>− {money(footerDiscount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between items-baseline" style={{ padding: "1.1mm 0", fontSize: "9pt", borderBottom: `.15mm solid ${GREEN_SOFT}` }}>
                  <Pair en={`${L.vat.en} ${invoice.taxRate}%`} ar={L.vat.ar} />
                  <span style={{ fontFamily: MONO }}>{money(tax)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline text-white font-bold"
                   style={{ background: GREEN, borderLeft: `2mm solid ${GOLD}`, padding: "2mm 2.5mm", marginTop: "1mm", fontSize: "12.5pt" }}>
                <Pair en={L.total.en} ar={L.total.ar} />
                <span style={{ fontFamily: MONO, whiteSpace: "nowrap" }}>{money(invoice.total)}</span>
              </div>
              <div className="text-right" style={{ fontSize: "6pt", color: "#6a6a6a", marginTop: ".8mm" }}>
                <Pair en={`(${L.currencyNote.en})`} ar={L.currencyNote.ar} />
              </div>
            </div>
          )}
        </div>

        {options?.showSignature !== false && (() => {
          const sigs = signaturesFor(invoice.type);
          return (
            <div className="grid gap-[6mm]" style={{ gridTemplateColumns: `repeat(${sigs.length}, minmax(0, 1fr))`, marginTop: "6mm" }}>
              {sigs.map((sg, i) => (
                <div key={i}>
                  <div className="font-bold uppercase"
                       style={{ borderTop: `.3mm solid ${GREEN}`, marginTop: "9mm", paddingTop: "1mm",
                                fontSize: "6.4pt", letterSpacing: ".14em", color: GREEN }}>
                    <Pair en={sg.en} ar={sg.ar} />
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    );
  },
);
PalmTemplate.displayName = "PalmTemplate";
