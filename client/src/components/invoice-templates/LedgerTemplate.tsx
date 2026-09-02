import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { clsx } from "clsx";
import type { TemplateProps } from "./types";
import { TermsFooter } from "./TermsFooter";
import {
  Pair, ColHead, docTitles, billToLabel, L, money, dmy, lineDiscount, fillerRows,
} from "./bilingual";

/* ── LEDGER ───────────────────────────────────────────────────────────────────
   No colour fields at all. Rules, spacing and type do the work, the way a bank
   statement or a bill of lading does. One ochre hairline is the only colour on
   the page, which means it photocopies, faxes to a site office and prints on a
   nearly-empty cartridge without losing anything.

   The two company names stack on the centre of the page, one under the other,
   matched to the same 120 mm measure — the strongest way to say they are one
   company. The customer name is English only: the system holds one name, and
   printing a second would mean inventing it.
──────────────────────────────────────────────────────────────────────────────*/

const INK = "#15130F";
const OCHRE = "#9A7422";
const SERIF = "'Source Serif 4', Georgia, serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const LedgerTemplate = forwardRef<HTMLDivElement, TemplateProps & { className?: string }>(
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

    const key = { fontFamily: MONO, fontSize: "6.1pt", letterSpacing: ".14em", color: "#6b6455" } as const;

    return (
      <div
        ref={ref}
        className={clsx(
          "invoice-paper bg-white w-[210mm] max-w-full min-h-[297mm] print:min-h-0",
          "shadow-xl print:shadow-none flex flex-col print:block",
          className,
        )}
        style={{ boxSizing: "border-box", margin: "0 auto", padding: "10mm", fontFamily: SERIF, color: INK }}
      >
        {/* ── The two names, stacked on the centre of the page ────────────── */}
        <div className="text-center" style={{ paddingBottom: "2.5mm", borderBottom: `.5mm solid ${INK}` }}>
          <div
            className="mx-auto uppercase font-semibold leading-[1.1]"
            style={{ width: "120mm", fontSize: "15pt", letterSpacing: ".32em" }}
          >
            {settings.storeNameEn}
          </div>
          <div
            className="mx-auto font-arabic font-bold"
            dir="rtl"
            style={{ width: "120mm", fontSize: "15.5pt", lineHeight: 1.25, marginTop: "1.2mm" }}
          >
            {settings.storeNameAr}
          </div>
        </div>

        {/* Every detail in English, then every detail in Arabic. */}
        <div className="text-center" style={{ padding: "1.6mm 0", borderBottom: `.2mm solid ${INK}`, fontSize: "6.7pt" }}>
          <div>
            {L.poBox.en} <span style={{ fontFamily: MONO }}>{settings.poBox}</span>
            {"  ·  "}{L.phone.en} <span style={{ fontFamily: MONO }}>{settings.phone}</span>
            {"  ·  "}{L.cr.en} <span style={{ fontFamily: MONO }}>{settings.crNumber}</span>
            {"  ·  "}{settings.addressEn}
          </div>
          <div className="font-arabic" dir="rtl" style={{ fontSize: "7.6pt", marginTop: ".8mm" }}>
            {L.poBox.ar} <span dir="ltr" style={{ fontFamily: MONO, unicodeBidi: "embed" }}>{settings.poBox}</span>
            {"  ·  "}{L.phone.ar} <span dir="ltr" style={{ fontFamily: MONO, unicodeBidi: "embed" }}>{settings.phone}</span>
            {"  ·  "}{L.cr.ar} <span dir="ltr" style={{ fontFamily: MONO, unicodeBidi: "embed" }}>{settings.crNumber}</span>
            {"  ·  "}{settings.addressAr}
          </div>
        </div>

        {/* ── Title ───────────────────────────────────────────────────────── */}
        <div className="text-center" style={{ margin: "6mm 0 1mm" }}>
          <div className="uppercase font-bold" style={{ fontSize: "16pt", letterSpacing: ".5em" }}>{title.en}</div>
          <div className="font-arabic font-bold" dir="rtl" style={{ fontSize: "12pt", marginTop: ".8mm" }}>{title.ar}</div>
        </div>
        <div style={{ height: ".2mm", background: INK }} />

        {/* ── Who and when ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-[6mm]" style={{ margin: "4mm 0 2mm", fontSize: "8.4pt" }}>
          <div>
            <div className="uppercase" style={key}><Pair en={to.en} ar={to.ar} /></div>
            <div className="font-semibold uppercase" style={{ fontSize: "10.5pt" }}>
              {invoice.customerName || "CASH CUSTOMER"}
            </div>
            {invoice.customerPhone && (
              <div dir="ltr" style={{ fontFamily: MONO, fontSize: "8pt" }}>{invoice.customerPhone}</div>
            )}
          </div>
          <div className="text-right">
            <div className="uppercase" style={key}><Pair en={L.number.en} ar={L.number.ar} /></div>
            <div className="font-semibold" style={{ fontSize: "10.5pt", fontFamily: MONO }}>{invoice.number}</div>
            <div className="uppercase" style={{ ...key, marginTop: "2mm" }}><Pair en={L.date.en} ar={L.date.ar} /></div>
            <div className="font-semibold" style={{ fontSize: "10.5pt", fontFamily: MONO }}>{dmy(invoice.date)}</div>
            {invoice.poNumber && (
              <>
                <div className="uppercase" style={{ ...key, marginTop: "2mm" }}><Pair en={L.poNumber.en} ar={L.poNumber.ar} /></div>
                <div className="font-semibold" style={{ fontSize: "10.5pt", fontFamily: MONO }}>{invoice.poNumber}</div>
              </>
            )}
          </div>
        </div>

        {/* ── Items: hairlines and dotted leaders, no fills ───────────────── */}
        <div className="flex-1">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[
                  { l: L.no, w: "9mm", a: "center" as const },
                  { l: L.desc, w: undefined, a: "left" as const },
                  { l: L.qty, w: "15mm", a: "center" as const },
                  { l: L.unit, w: "17mm", a: "center" as const },
                  ...(isDN ? [] : [
                    { l: L.price, w: "23mm", a: "right" as const },
                    { l: L.disc, w: "20mm", a: "right" as const },
                    { l: L.amount, w: "30mm", a: "right" as const },
                  ]),
                ].map((c, i) => (
                  <th
                    key={i}
                    style={{
                      width: c.w, textAlign: c.a, padding: "1.4mm 2mm",
                      borderTop: `.4mm solid ${INK}`, borderBottom: `.4mm solid ${INK}`,
                      fontFamily: MONO, fontSize: "6.2pt", letterSpacing: ".14em",
                      textTransform: "uppercase", fontWeight: 500, whiteSpace: "nowrap",
                    }}
                  >
                    <ColHead en={c.l.en} ar={c.l.ar} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => {
                const d = lineDiscount(it);
                return (
                  <tr key={i} className="print:break-inside-avoid" style={{ borderBottom: ".12mm dotted #B9B2A2" }}>
                    <td className="text-center" style={{ padding: "1mm 2mm", fontSize: "9.4pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{i + 1}</td>
                    <td className="uppercase" style={{ padding: "1mm 2mm", fontSize: "9.4pt", overflowWrap: "anywhere" }}>
                      {it.description}
                    </td>
                    <td className="text-center" style={{ padding: "1mm 2mm", fontSize: "9.4pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{it.qty}</td>
                    <td className="text-center uppercase" style={{ padding: "1mm 2mm", fontSize: "9.4pt" }}>{it.unit}</td>
                    {!isDN && <td className="text-right" style={{ padding: "1mm 2mm", fontSize: "9.4pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{money(it.price)}</td>}
                    {!isDN && <td className="text-right" style={{ padding: "1mm 2mm", fontSize: "9.4pt", fontFamily: MONO, whiteSpace: "nowrap", color: d > 0 ? INK : "#B9B2A2" }}>{d > 0 ? money(d) : "—"}</td>}
                    {!isDN && <td className="text-right font-semibold" style={{ padding: "1mm 2mm", fontSize: "9.4pt", fontFamily: MONO, whiteSpace: "nowrap" }}>{money(it.amount)}</td>}
                  </tr>
                );
              })}
              {fillerRows(invoice.items.length).map((i) => (
                <tr key={`f${i}`}><td colSpan={cols} style={{ height: "5.4mm" }} /></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Words and signatures | totals ───────────────────────────────── */}
        <div
          className="grid gap-[6mm] mt-auto print:break-inside-avoid"
          style={{ gridTemplateColumns: isDN ? "1fr" : "1fr 66mm", paddingTop: "3mm" }}
        >
          <div>
            {!isDN && options?.showAmountInWords !== false && (
              <div style={{ borderTop: `.15mm solid ${OCHRE}`, borderBottom: `.15mm solid ${OCHRE}`, padding: "2mm 0" }}>
                <div className="uppercase" style={{ ...key, fontSize: "5.9pt" }}>
                  <Pair en={L.words.en} ar={L.words.ar} />
                </div>
                <div className="font-semibold" style={{ fontSize: "8.8pt", marginTop: "1mm" }}>
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
                     style={{ borderTop: `.15mm solid ${OCHRE}`, borderBottom: `.15mm solid ${OCHRE}`, padding: "2mm 0" }}>
                  <div className="min-w-0">
                    <div className="uppercase" style={key}><Pair en={L.delivery.en} ar={L.delivery.ar} /></div>
                    {invoice.deliveryAddress && <p className="uppercase font-semibold" style={{ fontSize: "8.6pt", marginTop: "1mm" }}>{invoice.deliveryAddress}</p>}
                    {invoice.deliveryInstructions && <p style={{ fontSize: "7pt", color: "#6b6455" }}>{invoice.deliveryInstructions}</p>}
                  </div>
                  {nav && <QRCodeSVG value={nav} size={58} level="M" />}
                </div>
              );
            })()}

            {!isDN && !isQT && <div style={{ marginTop: "2mm" }}><TermsFooter terms={invoice.terms} /></div>}

            {options?.showSignature !== false && (
              <div className="grid grid-cols-2 gap-[10mm]" style={{ marginTop: "6mm" }}>
                <div>
                  <div style={{ borderBottom: `.25mm solid ${INK}`, height: "11mm" }} />
                  <div className="uppercase" style={{ ...key, marginTop: "1mm" }}>
                    <Pair en={isQT ? L.authorised.en : L.receiver.en} ar={isQT ? L.authorised.ar : L.receiver.ar} />
                  </div>
                </div>
                <div>
                  <div style={{ borderBottom: `.25mm solid ${INK}`, height: "11mm" }} />
                  <div className="uppercase" style={{ ...key, marginTop: "1mm" }}>
                    <Pair en={L.company.en} ar={L.company.ar} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {!isDN && (
            <div>
              <div className="flex justify-between" style={{ padding: ".9mm 0", fontSize: "9pt", borderBottom: ".12mm dotted #B9B2A2" }}>
                <Pair en={L.subtotal.en} ar={L.subtotal.ar} />
                <span style={{ fontFamily: MONO }}>{money(gross)}</span>
              </div>
              {footerDiscount > 0 && (
                <div className="flex justify-between" style={{ padding: ".9mm 0", fontSize: "9pt", borderBottom: ".12mm dotted #B9B2A2" }}>
                  <Pair en={L.discount.en} ar={L.discount.ar} />
                  <span style={{ fontFamily: MONO }}>− {money(footerDiscount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between" style={{ padding: ".9mm 0", fontSize: "9pt", borderBottom: ".12mm dotted #B9B2A2" }}>
                  <Pair en={`${L.vat.en} ${invoice.taxRate}%`} ar={L.vat.ar} />
                  <span style={{ fontFamily: MONO }}>{money(tax)}</span>
                </div>
              )}
              {/* A double rule under the total — the accountant's mark for a closed figure. */}
              <div
                className="flex justify-between font-bold"
                style={{ borderTop: `.4mm solid ${INK}`, borderBottom: `.5mm double ${INK}`, fontSize: "12.5pt", padding: "1.6mm 0" }}
              >
                <Pair en={L.total.en} ar={L.total.ar} />
                <span style={{ fontFamily: MONO }}>QAR {money(invoice.total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);
LedgerTemplate.displayName = "LedgerTemplate";
