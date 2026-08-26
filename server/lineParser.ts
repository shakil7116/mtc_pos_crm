// ─────────────────────────────────────────────────────────────────────────────
// Turning invoice text into columns — without an AI model.
//
// This exists because asking a language model to BOTH read an image AND split
// the result into description / qty / unit / price is asking it to do two jobs,
// and it is unreliable at the second one: it drops columns, merges rows, and
// invents units. Splitting the work fixes that.
//
//   OCR's job:     picture  →  text            (hard for code, easy for a model)
//   This file's:   text     →  columns         (easy for code, unreliable for a model)
//
// So whatever OCR provider gets plugged in later only has to transcribe. The
// structure is decided here, by rules that either match or visibly do not —
// never by a guess. Text-based inputs (CSV, TXT, a PDF with a real text layer)
// need no model at all and work today.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedLine {
  /** 1-based position in the source, for pointing a human at the right row. */
  row: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number | null;
  /** How the numbers were obtained — "columns" is a clean split, "inline" is inferred. */
  basis: "csv" | "columns" | "inline" | "description-only";
  /** Text this was parsed from, so a human can check it against the paper. */
  raw: string;
  warnings: string[];
}

export interface ParseResult {
  lines: ParsedLine[];
  /** Lines that looked like data but could not be read — surfaced, never dropped. */
  skipped: { row: number; raw: string; reason: string }[];
  method: string;
}

// Units seen on trade invoices here. Anything else is kept verbatim if it sits
// where a unit belongs.
const UNIT_WORDS = new Set([
  "PCS", "PC", "PIECE", "PIECES", "NOS", "NO", "EA", "EACH", "UNIT", "UNITS",
  "BAG", "BAGS", "BOX", "BOXES", "CTN", "CARTON", "ROLL", "ROLLS", "SET", "SETS",
  "PKT", "PACKET", "PACK", "TIN", "TUBE", "TUBES", "CAN", "DRUM", "GALLON", "PAIL",
  "MTR", "M", "METER", "METRE", "MTRS", "FT", "FEET", "SQM", "SQFT", "CBM",
  "KG", "KGS", "GM", "G", "TON", "TONS", "LTR", "L", "LITRE", "LITER", "ML",
  "PAIR", "PAIRS", "DOZ", "DOZEN", "SHEET", "SHEETS", "BUNDLE", "LOT", "LENGTH",
]);

// Rows that are totals, headers or boilerplate rather than goods.
const NOISE = /^(sub\s*total|total|grand\s*total|vat|tax|discount|amount|balance|net|gross|s\.?\s*no|sl\.?\s*no|sr\.?\s*no|item\s*no|description|qty|quantity|unit|rate|price|signature|received|thank|terms|conditions|page|invoice|quotation|delivery|date|customer|supplier|tel|phone|fax|email|address|p\.?o\.?\s*box|cr\s*no|trn)\b/i;

const CURRENCY = /\b(QAR|AED|USD|SAR|OMR|KWD|BHD|INR|QR|RS)\b\.?/gi;

/** "1,234.56" → 1234.56. Returns NaN for anything that is not a plain number. */
function num(s: string): number {
  const cleaned = String(s).replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function looksNumeric(s: string): boolean {
  return /^[\s]*[\d,]+(\.\d+)?[\s]*$/.test(s.replace(/[^\d.,\s]/g, ""))
    && /\d/.test(s);
}

// The words a table header is built from. Listing every spelling of "S.No" is a
// losing game, so a row is judged a header by how MANY of its cells are header
// words — which no real product line ever manages.
const HEADER_WORDS = new Set([
  "NO", "NO.", "S.NO", "SNO", "SL", "SL.", "SR", "SR.", "SERIAL", "ITEM", "ITEMS",
  "DESCRIPTION", "PARTICULARS", "PRODUCT", "GOODS", "QTY", "QTY.", "QUANTITY",
  "UNIT", "UNITS", "UOM", "RATE", "PRICE", "AMOUNT", "TOTAL", "VALUE", "NOS",
]);

function isHeaderRow(cells: string[]): boolean {
  if (cells.length < 3) return false;
  const hits = cells.filter((c) => HEADER_WORDS.has(c.toUpperCase().replace(/[^A-Z.]/g, ""))).length;
  return hits >= Math.ceil(cells.length * 0.6);
}

function isNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (t.length < 3) return true;
  if (NOISE.test(t)) return true;
  // A row of only numbers and punctuation is a totals strip, not an item.
  if (!/[A-Za-z]{3}/.test(t)) return true;
  // A row that is mostly column titles.
  const cells = splitColumns(t);
  if (cells.length && isHeaderRow(cells)) return true;
  if (isHeaderRow(t.split(/\s+/))) return true;
  return false;
}

/**
 * Split a text line on runs of whitespace wide enough to be a column gap.
 * OCR of a table usually preserves those gaps even when it loses the ruling
 * lines, which is what makes column recovery possible without a model.
 */
function splitColumns(line: string): string[] {
  const parts = line.split(/\s{2,}|\t+/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [];
}

/**
 * Read one already-split row: the description is the longest non-numeric cell,
 * the trailing numbers are qty / price / total in the order invoices use.
 */
function fromColumns(cells: string[], row: number, raw: string): ParsedLine | null {
  const warnings: string[] = [];

  // Leading serial number ("1", "01.") carries no information.
  if (cells.length > 1 && /^\d{1,3}[.)]?$/.test(cells[0])) cells = cells.slice(1);
  if (!cells.length) return null;

  const descIdx = cells.findIndex((c) => /[A-Za-z]{3}/.test(c) && !UNIT_WORDS.has(c.toUpperCase()));
  if (descIdx === -1) return null;
  const description = cells[descIdx].replace(CURRENCY, "").trim();

  const after = cells.slice(descIdx + 1);
  let unit = "";
  const numbers: number[] = [];
  for (const cell of after) {
    const bare = cell.replace(CURRENCY, "").trim();
    if (UNIT_WORDS.has(bare.toUpperCase())) { unit = bare.toUpperCase(); continue; }
    // "10 PCS" in one cell.
    const combo = bare.match(/^([\d,.]+)\s*([A-Za-z]+)$/);
    if (combo && UNIT_WORDS.has(combo[2].toUpperCase())) {
      const n = num(combo[1]);
      if (!isNaN(n)) numbers.push(n);
      unit = combo[2].toUpperCase();
      continue;
    }
    if (looksNumeric(bare)) {
      const n = num(bare);
      if (!isNaN(n)) numbers.push(n);
    }
  }

  if (!numbers.length) {
    return { row, description, quantity: 1, unit: unit || "PCS", unitPrice: 0, lineTotal: null,
      basis: "description-only", raw, warnings: ["No quantity or price found on this line."] };
  }

  // Invoices run qty → rate → amount. With two numbers it is qty and rate;
  // with three the last is the line total, which we use to CHECK the other two
  // rather than to trust them.
  let quantity = 1, unitPrice = 0, lineTotal: number | null = null;
  if (numbers.length === 1) {
    unitPrice = numbers[0];
    warnings.push("Only one number on this line — read as the price, quantity assumed 1.");
  } else if (numbers.length === 2) {
    [quantity, unitPrice] = numbers;
  } else {
    quantity = numbers[0];
    unitPrice = numbers[1];
    lineTotal = numbers[numbers.length - 1];
    const expected = quantity * unitPrice;
    if (lineTotal && Math.abs(expected - lineTotal) > Math.max(0.02, expected * 0.01)) {
      // The arithmetic disagrees, so one of the three numbers was misread.
      // Trust the total and the quantity, since a total is the figure a supplier
      // is most careful about.
      if (quantity > 0) {
        unitPrice = lineTotal / quantity;
        warnings.push(`Price recalculated from the line total (${lineTotal} ÷ ${quantity}) — the printed rate did not multiply out.`);
      } else {
        warnings.push("Quantity × price does not equal the line total. Check this row.");
      }
    }
  }

  return { row, description, quantity, unit: unit || "PCS", unitPrice, lineTotal, basis: "columns", raw, warnings };
}

/**
 * Last resort for a line that arrived as one run of text: pull the trailing
 * numbers off the end and treat what is left as the description.
 */
function fromInline(line: string, row: number): ParsedLine | null {
  const warnings: string[] = [];
  let work = line.replace(CURRENCY, " ").trim();
  work = work.replace(/^\s*\d{1,3}[.)]\s+/, ""); // leading serial number

  // Preferred reading: the unit word anchors the row. In "WHITE CEMENT 40KG BAG
  // 25 BAG 32.00 800.00" the LAST unit splits description+qty from price+total,
  // which is what stops the quantity being swallowed into the description.
  const tokens = work.split(/\s+/).filter(Boolean);
  let unitAt = -1;
  for (let i = tokens.length - 1; i >= 1; i--) {
    if (UNIT_WORDS.has(tokens[i].toUpperCase()) && looksNumeric(tokens[i - 1])) { unitAt = i; break; }
  }
  if (unitAt > 1) {
    const quantity = num(tokens[unitAt - 1]);
    const description = tokens.slice(0, unitAt - 1).join(" ").trim();
    const after = tokens.slice(unitAt + 1).filter(looksNumeric).map(num).filter((n) => !isNaN(n));
    if (!isNaN(quantity) && description && /[A-Za-z]{3}/.test(description) && after.length) {
      const unitPrice = after[0];
      const lineTotal = after.length > 1 ? after[after.length - 1] : null;
      if (lineTotal !== null && quantity > 0) {
        const expected = quantity * unitPrice;
        if (Math.abs(expected - lineTotal) > Math.max(0.02, expected * 0.01)) {
          warnings.push(`Quantity × price does not match the line total (${lineTotal}). Check this row.`);
        }
      }
      return { row, description, quantity, unit: tokens[unitAt].toUpperCase(), unitPrice, lineTotal, basis: "inline", raw: line, warnings };
    }
  }

  const trailing = work.match(/((?:[\d,]+(?:\.\d+)?\s+){0,3}[\d,]+(?:\.\d+)?)\s*$/);
  if (!trailing) return null;

  let head = work.slice(0, trailing.index).trim();
  const numbers = trailing[1].split(/\s+/).map(num).filter((n) => !isNaN(n));
  if (!head || !numbers.length) return null;

  // A unit often sits at the end of the description.
  let unit = "";
  const tail = head.split(/\s+/).pop() || "";
  if (UNIT_WORDS.has(tail.toUpperCase())) {
    unit = tail.toUpperCase();
    head = head.slice(0, head.length - tail.length).trim();
  }

  // A quantity often sits directly before the unit ("… 10 PCS 35.00").
  let quantity = 1, unitPrice = 0, lineTotal: number | null = null;
  if (numbers.length === 1) {
    unitPrice = numbers[0];
    const qtyBefore = head.match(/(?:^|\s)([\d,]+(?:\.\d+)?)\s*$/);
    if (qtyBefore) {
      const q = num(qtyBefore[1]);
      if (!isNaN(q) && q > 0) { quantity = q; head = head.slice(0, qtyBefore.index).trim(); }
    } else {
      warnings.push("Only one number found — read as the price, quantity assumed 1.");
    }
  } else if (numbers.length === 2) {
    [quantity, unitPrice] = numbers;
  } else {
    quantity = numbers[0];
    unitPrice = numbers[1];
    lineTotal = numbers[numbers.length - 1];
  }

  if (!head || !/[A-Za-z]{3}/.test(head)) return null;
  return { row, description: head, quantity, unit: unit || "PCS", unitPrice, lineTotal, basis: "inline", raw: line, warnings };
}

/** Header aliases accepted in a CSV-shaped input. */
const CSV_KEYS = {
  description: ["description", "item", "item name", "product", "product name", "particulars", "name", "details"],
  quantity: ["qty", "quantity", "nos", "no of pcs", "pcs"],
  unit: ["unit", "uom", "units"],
  price: ["price", "unit price", "rate", "unitprice", "unit rate", "cost"],
  total: ["amount", "total", "line total", "value", "net amount"],
};

function pick(rowObj: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (rowObj[k] != null && String(rowObj[k]).trim()) return String(rowObj[k]).trim();
  return "";
}

/**
 * Parse a delimited table where the first line is a header. Nothing is inferred
 * here — the columns say what they are.
 */
export function parseDelimited(text: string): ParseResult | null {
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  if (rows.length < 2) return null;

  const delimiter = [",", "\t", ";", "|"]
    .map((d) => ({ d, n: (rows[0].match(new RegExp(`\\${d}`, "g")) || []).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (!delimiter || delimiter.n < 1) return null;

  const split = (line: string): string[] => {
    if (delimiter.d !== ",") return line.split(delimiter.d).map((c) => c.trim());
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const headers = split(rows[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim());
  const known = Object.values(CSV_KEYS).flat();
  if (!headers.some((h) => known.includes(h))) return null; // not a table we recognise

  const lines: ParsedLine[] = [];
  const skipped: ParseResult["skipped"] = [];

  rows.slice(1).forEach((line, i) => {
    const cells = split(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, hi) => { obj[h] = cells[hi] ?? ""; });

    const description = pick(obj, CSV_KEYS.description);
    if (!description) { skipped.push({ row: i + 1, raw: line, reason: "No description column value." }); return; }

    const q = num(pick(obj, CSV_KEYS.quantity));
    const p = num(pick(obj, CSV_KEYS.price));
    const t = num(pick(obj, CSV_KEYS.total));
    const warnings: string[] = [];

    let quantity = isNaN(q) ? 1 : q;
    let unitPrice = isNaN(p) ? 0 : p;
    // A total with no rate still yields the rate.
    if (!unitPrice && !isNaN(t) && quantity > 0) {
      unitPrice = t / quantity;
      warnings.push("Unit price derived from the amount column.");
    }
    if (isNaN(q)) warnings.push("No quantity column — assumed 1.");

    lines.push({
      row: i + 1, description, quantity, unit: (pick(obj, CSV_KEYS.unit) || "PCS").toUpperCase(),
      unitPrice, lineTotal: isNaN(t) ? null : t, basis: "csv", raw: line, warnings,
    });
  });

  return lines.length ? { lines, skipped, method: `delimited (${delimiter.d === "\t" ? "tab" : delimiter.d})` } : null;
}

/**
 * Parse free text — OCR output, a pasted invoice, a PDF's text layer.
 * Tries the column split first because it is far more reliable, and only falls
 * back to inline parsing for lines that arrived as one run.
 */
export function parseFreeText(text: string): ParseResult {
  const rows = text.split(/\r?\n/);
  const lines: ParsedLine[] = [];
  const skipped: ParseResult["skipped"] = [];
  let columnHits = 0;

  rows.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    if (isNoise(line)) return;

    const cells = splitColumns(line);
    let parsed: ParsedLine | null = null;
    if (cells.length >= 2) {
      parsed = fromColumns(cells, lines.length + 1, line);
      if (parsed) columnHits++;
    }
    if (!parsed) parsed = fromInline(line, lines.length + 1);

    if (parsed && parsed.description.length >= 2) lines.push({ ...parsed, row: lines.length + 1 });
    else if (/\d/.test(line) && /[A-Za-z]{3}/.test(line)) {
      skipped.push({ row: i + 1, raw: line, reason: "Could not separate a price or quantity from this line." });
    }
  });

  return {
    lines,
    skipped,
    method: columnHits >= lines.length / 2 ? "aligned columns" : "inline text",
  };
}

/** Delimited if it looks delimited, otherwise free text. */
export function parseInvoiceText(text: string): ParseResult {
  return parseDelimited(text) || parseFreeText(text);
}
