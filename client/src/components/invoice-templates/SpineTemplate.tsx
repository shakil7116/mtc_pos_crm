import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { clsx } from "clsx";
import type { TemplateProps } from "./types";
import { TermsFooter } from "./TermsFooter";
import {
  Pair, ColHead, FitBox, docTitles, billToLabel, signaturesFor, L, money, dmy, lineDiscount, fillerRows,
} from "./bilingual";

/* ── SPINE ────────────────────────────────────────────────────────────────────
   A true mirror. One hairline runs down the centre of the page and every row
   locks level across it: English left, Arabic right, top to bottom. The Arabic
   side begins at the RIGHT edge and reads right to left, as Arabic does, with
   numbers held left-to-right inside it — the way a Qatari letterhead is written.

   Both company names sit in an identical 78 × 11 mm block so neither reads as a
   translation of the other.

   Qatar maroon, because a second blue template is not a second template.
──────────────────────────────────────────────────────────────────────────────*/

const MAROON = "#8A1538";
const SANS = "'Barlow Condensed', Montserrat, system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const SpineTemplate = forwardRef<HTMLDivElement, TemplateProps & { className?: string }>(
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

    const Axis = () => <div style={{ background: MAROON, width: 1 }} className="self-stretch" />;

    return (
      <div
        ref={ref}
        className={clsx(
          "invoice-paper tpl-cairo bg-white text-black w-[210mm] max-w-full min-h-[297mm] print:min-h-0",
          "shadow-xl print:shadow-none flex flex-col print:block",
          className,
        )}
        style={{ boxSizing: "border-box", margin: "0 auto", padding: "10mm", fontFamily: SANS }}
      >
        {/* ── Items. Quantities centred, money right — decimals must stack. ── */}
        <div className="flex-1" style={{ marginTop: "3mm" }}>
          <table className="w-full border-collapse" style={{ pageBreakInside: "auto" }}>
            <thead style={{ display: "table-header-group" }}>
              {/* The letterhead lives INSIDE the table head, so the browser
                  repeats it on every printed page. A second page of a long
                  invoice is still on company paper, with the column headings
                  above the rows — and the totals, which sit after the table,
                  appear once, on the last page. */}
              <tr>
                <th colSpan={cols} style={{
                  padding: 0, background: "transparent", color: "inherit",
                  textAlign: "left", fontWeight: "inherit", letterSpacing: "normal",
                  textTransform: "none", border: "none", whiteSpace: "normal",
                }}>
            {/* ── Letterhead: English | axis | Arabic ─────────────────────────── */}
            <div className="grid items-start gap-[6mm]" style={{ gridTemplateColumns: "1fr 1px 1fr" }}>
              <div>
                <FitBox
                  text={settings.storeNameEn || ""}
                  width="78mm" height="12mm" widthMm={78} heightMm={12}
                  className="uppercase font-bold"
                  style={{ color: MAROON }}
                />
                <div className="mt-[2.5mm]" style={{ fontSize: "7.2pt", color: "#3a3a3a" }}>
                  {[
                    [L.poBox.en, settings.poBox],
                    [L.phone.en, settings.phone],
                    [L.cr.en, settings.crNumber],
                    [L.address.en, settings.addressEn],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center gap-[1.5mm]" style={{ height: "4.4mm" }}>
                      <b style={{ color: MAROON, fontSize: "6.4pt", letterSpacing: ".06em" }}>{k}</b>
                      <span dir="ltr" style={{ fontFamily: k === L.address.en ? SANS : MONO }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Axis />

              {/* The Arabic column is a mirror: every line starts at the right edge. */}
              <div>
                <FitBox
                  text={settings.storeNameAr || ""}
                  width="78mm" height="12mm" widthMm={78} heightMm={12} rtl
                  className="font-arabic font-bold ml-auto"
                  style={{ color: MAROON }}
                />
                <div className="mt-[2.5mm] text-right" dir="rtl" style={{ fontSize: "7.2pt", color: "#3a3a3a" }}>
                  {[
                    [L.poBox.ar, settings.poBox, true],
                    [L.phone.ar, settings.phone, true],
                    [L.cr.ar, settings.crNumber, true],
                    [L.address.ar, settings.addressAr, false],
                  ].map(([k, v, ltr]) => (
                    <div key={String(k)} className="flex items-center gap-[1.5mm]" style={{ height: "4.4mm" }}>
                      <b className="font-arabic" style={{ color: MAROON, fontSize: "7.6pt" }}>{k}</b>
                      <span
                        dir={ltr ? "ltr" : "rtl"}
                        className={ltr ? "" : "font-arabic"}
                        style={{ fontFamily: ltr ? MONO : undefined, fontSize: ltr ? "7pt" : "8pt", unicodeBidi: "isolate" }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── The title sits ON the axis ──────────────────────────────────── */}
            <div
              className="mx-auto text-center text-white"
              style={{ background: MAROON, padding: "2mm 10mm", margin: "5mm auto 1.5mm", borderRadius: ".6mm" }}
            >
              <div className="font-bold uppercase leading-none" style={{ fontSize: "15pt", letterSpacing: ".28em" }}>
                {title.en}
              </div>
              <div className="font-arabic font-bold" style={{ fontSize: "12pt", lineHeight: 1.3 }} dir="rtl">
                {title.ar}
              </div>
            </div>

            {/* ── Who and when ────────────────────────────────────────────────── */}
            <div
              className="grid items-center gap-[6mm]"
              style={{
                gridTemplateColumns: "1fr 1px 1fr",
                borderTop: `.4mm solid ${MAROON}`, borderBottom: `.4mm solid ${MAROON}`,
                padding: "2mm 0", marginTop: "3mm",
              }}
            >
              <div>
                <div className="font-bold uppercase" style={{ fontSize: "6.2pt", letterSpacing: ".2em", color: MAROON }}>
                  <Pair en={to.en} ar={to.ar} />
                </div>
                <div className="font-bold uppercase" style={{ fontSize: "11pt" }}>
                  {invoice.customerName || "CASH CUSTOMER"}
                </div>
              </div>
              <Axis />
              <div className="flex gap-[8mm] justify-end">
                <div>
                  <div className="font-bold uppercase" style={{ fontSize: "6.2pt", letterSpacing: ".2em", color: MAROON }}>
                    <Pair en={L.number.en} ar={L.number.ar} />
                  </div>
                  <div className="font-bold" style={{ fontSize: "11pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{invoice.number}</div>
                </div>
                <div>
                  <div className="font-bold uppercase" style={{ fontSize: "6.2pt", letterSpacing: ".2em", color: MAROON }}>
                    <Pair en={L.date.en} ar={L.date.ar} />
                  </div>
                  <div className="font-bold" style={{ fontSize: "11pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{dmy(invoice.date)}</div>
                </div>
                {invoice.poNumber && (
                  <div>
                    <div className="font-bold uppercase" style={{ fontSize: "6.2pt", letterSpacing: ".2em", color: MAROON }}>
                      <Pair en={L.poNumber.en} ar={L.poNumber.ar} />
                    </div>
                    <div className="font-bold" style={{ fontSize: "11pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{invoice.poNumber}</div>
                  </div>
                )}
              </div>
            </div>
                </th>
              </tr>
              <tr style={{ background: MAROON, color: "#fff" }}>
                <th className="text-center" style={{ width: "9mm", padding: "1.4mm 2mm", fontSize: "7pt", letterSpacing: ".12em" }}>
                  <ColHead en={L.no.en} ar={L.no.ar} />
                </th>
                <th className="text-left" style={{ padding: "1.4mm 2mm", fontSize: "7pt", letterSpacing: ".12em" }}>
                  <ColHead en={L.desc.en} ar={L.desc.ar} />
                </th>
                <th className="text-center" style={{ width: "15mm", padding: "1.4mm 2mm", fontSize: "7pt", letterSpacing: ".12em" }}>
                  <ColHead en={L.qty.en} ar={L.qty.ar} />
                </th>
                <th className="text-center" style={{ width: "17mm", padding: "1.4mm 2mm", fontSize: "7pt", letterSpacing: ".12em" }}>
                  <ColHead en={L.unit.en} ar={L.unit.ar} />
                </th>
                {!isDN && (
                  <th className="text-right" style={{ width: "23mm", padding: "1.4mm 2mm", fontSize: "7pt", letterSpacing: ".12em" }}>
                    <ColHead en={L.price.en} ar={L.price.ar} />
                  </th>
                )}
                {!isDN && (
                  <th className="text-right" style={{ width: "20mm", padding: "1.4mm 2mm", fontSize: "7pt", letterSpacing: ".12em" }}>
                    <ColHead en={L.disc.en} ar={L.disc.ar} />
                  </th>
                )}
                {!isDN && (
                  <th className="text-right" style={{ width: "30mm", padding: "1.4mm 2mm", fontSize: "7pt", letterSpacing: ".12em" }}>
                    <ColHead en={L.amount.en} ar={L.amount.ar} />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => {
                const d = lineDiscount(it);
                return (
                  <tr key={i} className="print:break-inside-avoid"
                      style={{ background: i % 2 ? "#FBF6F7" : undefined, borderBottom: ".2mm solid #EADFE3" }}>
                    <td className="text-center" style={{ padding: ".9mm 2mm", fontSize: "9.2pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{i + 1}</td>
                    <td className="uppercase" style={{ padding: ".9mm 2mm", fontSize: "9.2pt", overflowWrap: "anywhere" }}>{it.description}</td>
                    <td className="text-center" style={{ padding: ".9mm 2mm", fontSize: "9.2pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{it.qty}</td>
                    <td className="text-center uppercase" style={{ padding: ".9mm 2mm", fontSize: "9.2pt" }}>{it.unit}</td>
                    {!isDN && <td className="text-right" style={{ padding: ".9mm 2mm", fontSize: "9.2pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{money(it.price)}</td>}
                    {!isDN && <td className="text-right" style={{ padding: ".9mm 2mm", fontSize: "9.2pt", fontFamily: MONO, whiteSpace: "nowrap", color: d > 0 ? "#111" : "#c9c9c9" }}>{d > 0 ? money(d) : "—"}</td>}
                    {!isDN && <td className="text-right font-bold" style={{ padding: ".9mm 2mm", fontSize: "9.2pt", fontFamily: MONO, whiteSpace: "nowrap", color: MAROON }}>{money(it.amount)}</td>}
                  </tr>
                );
              })}
              {fillerRows(invoice.items.length).map((i) => (
                <tr key={`f${i}`} style={{ borderBottom: ".2mm solid #F2E9EC" }}>
                  <td colSpan={cols} style={{ height: "5.2mm" }} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Words | axis | totals ───────────────────────────────────────── */}
        <div
          className="grid gap-[5mm] mt-auto print:break-inside-avoid"
          style={{ gridTemplateColumns: isDN ? "1fr" : "minmax(0, 1fr) 1px 66mm", paddingTop: "3mm" }}
        >
          <div>
            {!isDN && options?.showAmountInWords !== false && (
              <div style={{ border: `.3mm solid ${MAROON}`, padding: "2mm 2.5mm" }}>
                <div className="font-bold uppercase" style={{ fontSize: "6pt", letterSpacing: ".2em", color: MAROON }}>
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
                     style={{ border: `.3mm solid ${MAROON}`, padding: "2mm 2.5mm" }}>
                  <div className="min-w-0">
                    <div className="font-bold uppercase" style={{ fontSize: "6pt", letterSpacing: ".2em", color: MAROON }}>
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

          {!isDN && <Axis />}

          {!isDN && (
            <div>
              <div className="flex justify-between items-baseline" style={{ padding: "1.1mm 0", fontSize: "9pt" }}>
                <Pair en={L.subtotal.en} ar={L.subtotal.ar} />
                <span style={{ fontFamily: MONO }}>{money(gross)}</span>
              </div>
              {footerDiscount > 0 && (
                <div className="flex justify-between items-baseline" style={{ padding: "1.1mm 0", fontSize: "9pt" }}>
                  <Pair en={L.discount.en} ar={L.discount.ar} />
                  <span style={{ fontFamily: MONO }}>− {money(footerDiscount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between items-baseline" style={{ padding: "1.1mm 0", fontSize: "9pt" }}>
                  <Pair en={`${L.vat.en} ${invoice.taxRate}%`} ar={L.vat.ar} />
                  <span style={{ fontFamily: MONO }}>{money(tax)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline text-white font-bold"
                   style={{ background: MAROON, padding: "2mm 2.5mm", marginTop: "1mm", fontSize: "12.5pt" }}>
                <Pair en={L.total.en} ar={L.total.ar} />
                <span style={{ fontFamily: MONO, whiteSpace: "nowrap" }}>{money(invoice.total)}</span>
              </div>
              <div className="text-right" style={{ fontSize: "6pt", color: "#6a6a6a", marginTop: ".8mm" }}>
                <Pair en={`(${L.currencyNote.en})`} ar={L.currencyNote.ar} />
              </div>
            </div>
          )}
        </div>

        {/* ── Signatures. An invoice takes three; a delivery note two. ────── */}
        {options?.showSignature !== false && (() => {
          const sigs = signaturesFor(invoice.type);
          return (
            <div className="grid gap-[6mm]" style={{ gridTemplateColumns: `repeat(${sigs.length}, minmax(0, 1fr))`, marginTop: "6mm" }}>
              {sigs.map((sg, i) => (
                <div key={i}>
                  <div className="font-bold uppercase"
                       style={{ borderTop: ".3mm solid #111", marginTop: "11mm", paddingTop: "1mm",
                                fontSize: "6.4pt", letterSpacing: ".14em" }}>
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
SpineTemplate.displayName = "SpineTemplate";
