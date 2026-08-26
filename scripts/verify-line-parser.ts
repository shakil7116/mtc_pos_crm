// Proves the text→columns step works WITHOUT any AI, on the shapes a supplier
// invoice actually arrives in. This is the step a vision model was doing badly.
//   Run: npx tsx scripts/verify-line-parser.ts
import { parseInvoiceText } from "../server/lineParser";

interface Case {
  what: string;
  text: string;
  expect: { description: string; quantity: number; unit?: string; unitPrice: number }[];
}

const CASES: Case[] = [
  {
    what: "Aligned columns, the usual OCR output of a ruled table",
    text: [
      "NO.   DESCRIPTION                QTY    UNIT    PRICE     AMOUNT",
      "1     PVC PIPE 4 INCH X 3M       10     PCS     35.00     350.00",
      "2     OPC CEMENT 50KG BAG        100    BAG     18.00     1800.00",
      "3     SILICONE SEALANT WHITE     24     TUBE    10.50     252.00",
      "                                        SUBTOTAL          2402.00",
      "                                        VAT 0%            0.00",
      "                                        TOTAL             2402.00",
    ].join("\n"),
    expect: [
      { description: "PVC PIPE 4 INCH X 3M", quantity: 10, unit: "PCS", unitPrice: 35 },
      { description: "OPC CEMENT 50KG BAG", quantity: 100, unit: "BAG", unitPrice: 18 },
      { description: "SILICONE SEALANT WHITE", quantity: 24, unit: "TUBE", unitPrice: 10.5 },
    ],
  },
  {
    what: "Comma-separated table with a header",
    text: [
      "item,qty,unit,rate,amount",
      "GYPSUM BOARD 12MM,50,SHEET,22.00,1100.00",
      "METAL STUD 76MM X 3M,120,PCS,14.50,1740.00",
    ].join("\n"),
    expect: [
      { description: "GYPSUM BOARD 12MM", quantity: 50, unit: "SHEET", unitPrice: 22 },
      { description: "METAL STUD 76MM X 3M", quantity: 120, unit: "PCS", unitPrice: 14.5 },
    ],
  },
  {
    what: "Tab-separated export",
    text: ["description\tquantity\tunit price", "MARINE PLYWOOD 15MM\t30\t95.00"].join("\n"),
    expect: [{ description: "MARINE PLYWOOD 15MM", quantity: 30, unitPrice: 95 }],
  },
  {
    what: "Single run of text — columns collapsed by OCR",
    text: ["1. WHITE CEMENT 40KG BAG 25 BAG 32.00 800.00", "2. PRIMER SEALER 4L 12 TIN 45.00 540.00"].join("\n"),
    expect: [
      { description: "WHITE CEMENT 40KG BAG", quantity: 25, unit: "BAG", unitPrice: 32 },
      { description: "PRIMER SEALER 4L", quantity: 12, unit: "TIN", unitPrice: 45 },
    ],
  },
  {
    what: "Currency symbols mixed in",
    text: "LED PANEL LIGHT 60X60 40W      12     PCS     QAR 120.00     QAR 1,440.00",
    expect: [{ description: "LED PANEL LIGHT 60X60 40W", quantity: 12, unit: "PCS", unitPrice: 120 }],
  },
  {
    what: "Thousands separators",
    text: "REBAR 12MM X 12M        1,200      PCS      45.50      54,600.00",
    expect: [{ description: "REBAR 12MM X 12M", quantity: 1200, unit: "PCS", unitPrice: 45.5 }],
  },
  {
    what: "Arithmetic disagrees — the total wins and the rate is recomputed",
    text: "CERAMIC FLOOR TILE 60X60CM     20     BOX     55.00     1500.00",
    expect: [{ description: "CERAMIC FLOOR TILE 60X60CM", quantity: 20, unit: "BOX", unitPrice: 75 }],
  },
];

let pass = 0, total = 0;
const failures: string[] = [];

console.log("\nInvoice text → columns, with no AI\n" + "─".repeat(76));

for (const c of CASES) {
  const r = parseInvoiceText(c.text);
  console.log(`\n${c.what}   [${r.method}]`);

  const countOk = r.lines.length === c.expect.length;
  total++;
  if (countOk) pass++; else failures.push(`${c.what}: expected ${c.expect.length} lines, got ${r.lines.length}`);
  console.log(`  ${countOk ? "PASS" : "FAIL"}  line count ${r.lines.length}/${c.expect.length}`);

  c.expect.forEach((e, i) => {
    const got = r.lines[i];
    total++;
    if (!got) { failures.push(`${c.what} line ${i + 1}: missing`); console.log(`  FAIL  line ${i + 1} missing`); return; }
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const ok = got.description === e.description
      && near(got.quantity, e.quantity)
      && near(got.unitPrice, e.unitPrice)
      && (!e.unit || got.unit === e.unit);
    if (ok) pass++;
    else failures.push(`${c.what} line ${i + 1}: got "${got.description}" ${got.quantity} ${got.unit} @ ${got.unitPrice}`);
    console.log(`  ${ok ? "PASS" : "FAIL"}  "${got.description}" · ${got.quantity} ${got.unit} @ ${got.unitPrice}${got.warnings.length ? `\n        ↳ ${got.warnings.join(" ")}` : ""}`);
  });

  if (r.skipped.length) {
    console.log(`  skipped (surfaced, not dropped): ${r.skipped.length}`);
    for (const sk of r.skipped) console.log(`        row ${sk.row}: ${sk.reason} — "${sk.raw.trim().slice(0, 50)}"`);
  }
}

console.log("\n" + "─".repeat(76));
console.log(`${pass}/${total} passed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
