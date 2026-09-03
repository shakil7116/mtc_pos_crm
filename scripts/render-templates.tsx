// Render the REAL invoice templates to a standalone HTML page.
//
// WHY: a drawing of a template proves nothing — it is not the code that will
// print. This imports the actual components the app uses, feeds them realistic
// data, and writes one page showing every variant side by side, with the app's
// own compiled stylesheet so the type and spacing are exactly what a customer
// would receive.
//
// Reads only. Writes one HTML file and touches no data.
// Run: npx tsx scripts/render-templates.tsx [outfile]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TemplateInvoice, TemplateSettings } from "../client/src/components/invoice-templates/types";

// The app compiles JSX with the automatic runtime (Vite), so its components do
// not import React themselves. Running them here through the classic transform
// needs React in scope — set it BEFORE the components load, hence the dynamic
// import below rather than a top-of-file one.
(globalThis as any).React = React;
const { SpineTemplate } = await import("../client/src/components/invoice-templates/SpineTemplate");
const { LedgerTemplate } = await import("../client/src/components/invoice-templates/LedgerTemplate");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const OUT = process.argv[2] || path.join(ROOT, "template-preview.html");

const settings: TemplateSettings = {
  storeNameEn: "MAMUN M TRADING AND CONTRACTING W.L.L",
  storeNameAr: "مأمون م للتجارة والمقاولات ذ.م.م",
  addressEn: "NAJMA STREET, NAJMA, DOHA, QATAR",
  addressAr: "شارع النجمة، النجمة، الدوحة، قطر",
  phone: "+974 30703722",
  crNumber: "72986/1",
  poBox: "17336",
};

const items = [
  { description: "OPC CEMENT 50KG BAG", sku: "CEM-50", qty: 200, unit: "BAG", price: 18, amount: 3600 },
  { description: "CERAMIC WALL TILE 30X60", sku: "TIL-3060", qty: 45, unit: "BOX", price: 62, amount: 2700 },
  { description: "WHITE EMULSION PAINT 20L", sku: "PNT-W20", qty: 8, unit: "PAIL", price: 115, amount: 920 },
  { description: "STEEL BAR 12MM X 12M", sku: "STL-12", qty: 30, unit: "LENGTH", price: 6.67, amount: 200 },
  // The worst case, on purpose: a long description, a big quantity and an amount
  // in the millions — proof the columns hold rather than a promise that they do.
  { description: "GALVANISED STEEL SHEET 1.2MM X 2.4M - HEAVY DUTY, POWDER COATED", sku: "GSS-12", qty: 12500, unit: "SQM", price: 98.76, amount: 1234567.89 },
];

const base: TemplateInvoice = {
  type: "INV",
  number: "INV-100361",
  date: "2026-09-02",
  poNumber: "PO-4471",
  invoiceType: "Credit Invoice",
  terms: {
    isCredit: true,
    chequeDue: [
      { number: "004521", dueDate: "2026-10-17" },
      { number: "004522", dueDate: "2026-12-01" },
    ],
    standardDue: "2026-10-17",
  },
  customerName: "AL BAYT CONTRACTING W.L.L",
  customerPhone: "+974 5555 1234",
  items,
  subtotal: 1241987.89,
  discountType: "QAR",
  discountAmount: 90,
  taxRate: 0,
  taxAmount: 0,
  total: 1241897.89,
  totalWords: "ONE MILLION TWO HUNDRED FORTY ONE THOUSAND EIGHT HUNDRED NINETY SEVEN QATARI RIYALS AND EIGHTY NINE DIRHAMS ONLY",
  notes: null,
};

const cash: TemplateInvoice = {
  ...base,
  number: "INV-100362",
  invoiceType: "Cash Invoice",
  terms: { isCredit: false, chequeDue: [], standardDue: null },
  items: items.slice(0, 4),
  subtotal: 7420, discountAmount: 0, total: 7420,
  totalWords: "SEVEN THOUSAND FOUR HUNDRED AND TWENTY QATARI RIYALS ONLY",
};

const dn: TemplateInvoice = {
  ...base,
  type: "DN",
  number: "DN-297334",
  invoiceType: null,
  terms: null,
  items: items.slice(0, 4),
  deliveryAddress: "PLOT 44, STREET 8, INDUSTRIAL AREA, DOHA",
  deliveryInstructions: "Site gate closes at 4pm — call before arriving",
  mapLink: "https://maps.app.goo.gl/example",
};

const qt: TemplateInvoice = {
  ...base,
  type: "QT",
  number: "QT-197236",
  invoiceType: null,
  terms: null,
  items: items.slice(0, 4),
  subtotal: 7420, discountAmount: 0, total: 7420,
  totalWords: "SEVEN THOUSAND FOUR HUNDRED AND TWENTY QATARI RIYALS ONLY",
};

// 32 lines: the real two-page case. Built from the same items, repeated, so the
// only thing being tested is how the sheet behaves when it runs past one page.
const many: TemplateInvoice = {
  ...base,
  number: "INV-100363",
  items: Array.from({ length: 32 }, (_, i) => ({
    ...items[i % items.length],
    description: `${items[i % items.length].description} #${i + 1}`,
  })),
};

const SHEETS: { title: string; note: string; invoice: TemplateInvoice; which: "spine" | "ledger" }[] = [
  { which: "spine",  title: "Spine · Credit invoice",  note: "Two PDC cheques, a line discount and a whole-invoice discount. The worst-case row is real: 12,500 SQM at 1,234,567.89.", invoice: base },
  { which: "ledger", title: "Ledger · Credit invoice", note: "Same document, same data — the other sheet.", invoice: base },
  { which: "spine",  title: "Spine · Cash invoice",    note: "Paid in full, no cheques: no due dates, only the return policy.", invoice: cash },
  { which: "ledger", title: "Ledger · Cash invoice",   note: "Paid in full, no cheques.", invoice: cash },
  { which: "spine",  title: "Spine · Delivery note",   note: "No price, no discount, no amount, no totals — with the site address and a maps QR the driver can scan.", invoice: dn },
  { which: "ledger", title: "Ledger · Delivery note",  note: "Same rules on the other sheet.", invoice: dn },
  { which: "spine",  title: "Spine · 32 lines (two pages)", note: "The long invoice. Everything below the table has to land after the last row, not on top of it.", invoice: many },
  { which: "ledger", title: "Ledger · 32 lines (two pages)", note: "Same test on the other sheet.", invoice: many },
  { which: "spine",  title: "Spine · Quotation",       note: "Authorised signature, and no payment terms — nothing is owed yet.", invoice: qt },
  { which: "ledger", title: "Ledger · Quotation",      note: "Authorised signature, no terms.", invoice: qt },
];

const css = (() => {
  const dir = path.join(ROOT, "dist", "public", "assets");
  if (!fs.existsSync(dir)) return "";
  const f = fs.readdirSync(dir).find((x) => x.endsWith(".css"));
  return f ? fs.readFileSync(path.join(dir, f), "utf8") : "";
})();

const body = SHEETS.map(({ which, title, note, invoice }) => {
  const el = which === "spine"
    ? React.createElement(SpineTemplate as any, { invoice, settings, options: {} })
    : React.createElement(LedgerTemplate as any, { invoice, settings, options: {} });
  return `
  <section class="stage">
    <h2>${title}</h2>
    <p class="note">${note}</p>
    <div class="scaler">${renderToStaticMarkup(el)}</div>
  </section>`;
}).join("\n");

const html = `<title>Spine and Ledger — Live</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Barlow+Condensed:wght@400;500;600;700&family=Cairo:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Montserrat:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400..700&display=swap">
<style>
${css}
</style>
<style>
  :root { --wall:#E4E7E4; --ink:#1A1D1A; --muted:#6B716C; --rule:#CDD2CD; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --wall:#17191A; --ink:#E9EBE8; --muted:#939995; --rule:#313638; }
  }
  :root[data-theme="dark"] { --wall:#17191A; --ink:#E9EBE8; --muted:#939995; --rule:#313638; }
  body { background:var(--wall); color:var(--ink);
         font-family:"IBM Plex Sans",system-ui,sans-serif; margin:0; }
  .wrap { max-width:64rem; margin:0 auto; padding:2.5rem 1.5rem 5rem; }
  h1 { font-family:Montserrat,sans-serif; font-size:clamp(2rem,6vw,3rem); text-transform:uppercase;
       letter-spacing:.02em; margin:0 0 .5rem; }
  .lede { color:var(--muted); max-width:60ch; margin:0 0 2.5rem; }
  .stage { margin:0 0 3rem; }
  .stage h2 { font-family:Montserrat,sans-serif; font-size:1.15rem; text-transform:uppercase;
              letter-spacing:.06em; margin:0 0 .2rem; }
  .note { color:var(--muted); font-size:.9rem; margin:0 0 .9rem; max-width:70ch; }
  /* zoom, not transform: it shrinks the LAYOUT too, so the page grows to fit the
     whole sheet instead of clipping a fixed-height window over it. */
  .scaler { zoom:.66; width:210mm; }
  @media (max-width:52rem) { .scaler { zoom:.44; } }
  @media (max-width:34rem) { .scaler { zoom:.28; } }
  .scaler .invoice-paper { box-shadow:0 2px 4px rgba(0,0,0,.08), 0 24px 48px -28px rgba(0,0,0,.5); }
</style>
<script>
  // The same fit the component runs in the app: grow each name to the largest
  // size that still fits its box, so this page shows the real result rather
  // than the server-side estimate.
  addEventListener("load", function () {
    document.querySelectorAll("[data-fit]").forEach(function (el) {
      var max = parseFloat(el.getAttribute("data-fit")) || 30;
      var min = parseFloat(el.getAttribute("data-fit-min")) || 6;
      var pt = max;
      el.style.fontSize = pt + "pt";
      while (pt > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
        pt -= 0.5;
        el.style.fontSize = pt + "pt";
      }
    });
  });
</script>
<div class="wrap">
  <h1>Spine and Ledger</h1>
  <p class="lede">
    Rendered from the components the app actually prints with — not drawings.
    Same data on both sheets, and every document type each one has to handle.
  </p>
  ${body}
</div>
`;

fs.writeFileSync(OUT, html, "utf8");
console.log(`wrote ${OUT} — ${SHEETS.length} sheets, ${(html.length / 1024).toFixed(0)} KB`);
