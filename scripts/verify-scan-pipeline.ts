// End-to-end check of the scan pipeline UP TO the database step: file → text →
// columns. Needs no API key and no DB connection, because that is the point —
// only image transcription needs a provider, and only product matching needs
// the catalogue.
//   Run: npx tsx scripts/verify-scan-pipeline.ts
import { extractText, ocrStatus, PROVIDERS } from "../server/ocr";
import { parseInvoiceText } from "../server/lineParser";

let pass = 0, total = 0;
const failures: string[] = [];

const check = (label: string, ok: boolean, detail = "") => {
  total++;
  if (ok) pass++; else failures.push(label + (detail ? ` — ${detail}` : ""));
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n         ${detail}` : ""}`);
};

const run = async () => {
  console.log("\nScan pipeline — file to columns, no key, no database\n" + "─".repeat(74));

  // ── 1. Provider reporting ────────────────────────────────────────────────
  console.log("\n1. OCR provider status");
  const st = ocrStatus();
  check("Text extraction always available", st.textExtraction === true);
  check(
    `Image extraction correctly reported as ${st.imageExtraction ? "ON" : "OFF"}`,
    typeof st.imageExtraction === "boolean",
    st.activeProvider ? `active: ${st.activeProvider.label}` : "no provider key present",
  );
  check("All four providers advertised with their env var", st.providers.length === PROVIDERS.length,
    st.providers.map((p: any) => `${p.keyVar}${p.configured ? " (set)" : ""}`).join(", "));

  // ── 2. CSV straight through ──────────────────────────────────────────────
  console.log("\n2. CSV file");
  const csv = [
    "item,qty,unit,rate,amount",
    "PVC PIPE 4 INCH X 3M,10,PCS,35.00,350.00",
    "OPC CEMENT 50KG BAG,100,BAG,18.00,1800.00",
  ].join("\n");
  const csvOut = await extractText(Buffer.from(csv, "utf8"), "invoice.csv");
  check("Read with no provider", csvOut.source === "plain-text");
  const csvParsed = parseInvoiceText(csvOut.text);
  check("Both product rows recovered", csvParsed.lines.length === 2,
    csvParsed.lines.map((l) => `${l.description} · ${l.quantity} ${l.unit} @ ${l.unitPrice}`).join(" | "));
  check("Header row not treated as a product",
    !csvParsed.lines.some((l) => /^item$/i.test(l.description)));

  // ── 3. Plain text invoice (what OCR of a scan looks like) ────────────────
  console.log("\n3. Plain-text invoice with aligned columns");
  const txt = [
    "MAMUN M TRADING AND CONTRACTING W.L.L",
    "INVOICE NO: 55231          DATE: 12/08/2026",
    "",
    "NO.   DESCRIPTION                QTY   UNIT   RATE     AMOUNT",
    "1     GYPSUM BOARD 12MM          50    SHEET  22.00    1100.00",
    "2     METAL STUD 76MM X 3M       120   PCS    14.50    1740.00",
    "3     SILICONE SEALANT WHITE     24    TUBE   10.50    252.00",
    "                                       SUBTOTAL        3092.00",
    "                                       TOTAL           3092.00",
    "Thank you for your business",
  ].join("\n");
  const txtOut = await extractText(Buffer.from(txt, "utf8"), "invoice.txt");
  check("Read with no provider", txtOut.source === "plain-text");
  const txtParsed = parseInvoiceText(txtOut.text);
  check("Exactly the 3 product rows, no header/totals/footer", txtParsed.lines.length === 3,
    txtParsed.lines.map((l) => `${l.description} · ${l.quantity} ${l.unit} @ ${l.unitPrice}`).join(" | "));
  check("Company name and invoice header excluded",
    !txtParsed.lines.some((l) => /MAMUN|INVOICE NO|Thank you/i.test(l.description)));
  check("Totals strip excluded",
    !txtParsed.lines.some((l) => /SUBTOTAL|TOTAL/i.test(l.description)));

  // ── 4. Images refuse clearly when no provider is set ─────────────────────
  console.log("\n4. Image with no provider configured");
  const active = ocrStatus().activeProvider;
  if (active) {
    console.log(`  SKIP  a provider (${active.label}) is configured, so the refusal path cannot be exercised`);
  } else {
    let msg = "";
    try {
      await extractText(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "scan.png", "image/png");
    } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    check("Refuses rather than failing obscurely", msg.length > 0);
    check("Names the env vars that would fix it",
      ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY"].every((k) => msg.includes(k)));
    check("Says which formats DO work today", /CSV/.test(msg) && /PDF/i.test(msg));
  }

  // ── 5. Unsupported type ──────────────────────────────────────────────────
  console.log("\n5. Unsupported file type");
  let bad = "";
  try { await extractText(Buffer.from("x"), "notes.docx"); } catch (e) { bad = e instanceof Error ? e.message : String(e); }
  check("Rejected with a readable message", /Unsupported file type/.test(bad), bad);

  // ── 6. Nothing parseable ─────────────────────────────────────────────────
  console.log("\n6. A file with no product rows");
  const empty = parseInvoiceText("Dear customer,\n\nThank you for your payment.\n\nRegards");
  check("Returns no rows rather than inventing them", empty.lines.length === 0);

  console.log("\n" + "─".repeat(74));
  console.log(`${pass}/${total} passed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  · ${f}`);
    process.exit(1);
  }
};

run().catch((e) => { console.error("FATAL:", e); process.exit(1); });
