// ─────────────────────────────────────────────────────────────────────────────
// CSV product import — analysed first, written only after a human confirms.
//
// The import used to write the moment the file was chosen. That is the wrong
// shape for how these files are actually produced: a spreadsheet or an AI
// assistant outside the system writes the rows, and such a file cannot know
// this business's exact store names, so location arrived wrong or missing and
// stock silently went nowhere. Worse, a half-good file wrote its good rows and
// left the user unable to re-import safely, because re-running adds quantities
// a second time.
//
// So the flow is now: analyse → show → pick the location here → apply.
// analyseCsv() touches nothing. commitRows() writes exactly what came back.
//
// Location deliberately does NOT come from the file. It is chosen in the app
// against the real store list, which is the one thing an outside tool cannot
// get right.
// ─────────────────────────────────────────────────────────────────────────────
import { getProducts, getSuppliers, getMatchCatalogue, createProduct, updateProduct, adjustStock, getProductQtyAt } from "./storage";
import { matchProduct, normalizeName } from "./matching";

export interface AnalysedRow {
  row: number;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  salePrice: number | null;
  costPrice: number | null;
  wholesalePrice: number | null;
  minStockQty: number | null;
  quantity: number;
  supplierName: string | null;
  supplierId: number | null;

  /** What would happen if applied as-is. */
  action: "create" | "update" | "reject";
  /** Set when action is "update". */
  matchedProductId: number | null;
  matchedProductName: string | null;
  matchReason: "sku" | "name" | null;
  /** Alternatives when the match was close but not certain. */
  candidates: { productId: number; name: string; sku: string | null; score: number }[];
  rejectReason: string | null;
  warnings: string[];
}

export interface AnalysisResult {
  rows: AnalysedRow[];
  headers: string[];
  summary: { total: number; create: number; update: number; reject: number; withQty: number };
  /** File-level problems worth showing above the table. */
  fileWarnings: string[];
}

const num = (v: any): number | null => {
  if (v == null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Header aliases, so a file written elsewhere does not have to guess our spelling. */
const H = {
  sku: ["sku", "code", "item code", "product code"],
  name: ["name", "product name", "description", "item", "product", "item name"],
  category: ["category", "type", "group"],
  unit: ["unit", "uom", "units"],
  salePrice: ["sale_price", "saleprice", "sale price", "price", "selling price", "retail", "retail price"],
  costPrice: ["cost_price", "costprice", "cost price", "cost", "purchase price", "buy price"],
  wholesalePrice: ["wholesale_price", "wholesaleprice", "wholesale price", "wholesale"],
  minStockQty: ["min_stock_qty", "minstockqty", "min stock qty", "minstock", "min qty", "reorder level"],
  quantity: ["initial_qty", "initialqty", "initial qty", "opening_qty", "openingqty", "quantity", "qty", "stock"],
  supplier: ["supplier_name", "suppliername", "supplier"],
};

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Read a parsed CSV and work out what each row would do. Writes nothing.
 *
 * Duplicate rows inside the file are resolved here rather than at write time:
 * the catalogue is a snapshot, so without this the second mention of a new
 * product would not see the first and both would be created — two products,
 * one SKU. Later rows are folded into the earlier one instead.
 */
export async function analyseCsv(csvRows: Record<string, string>[]): Promise<AnalysisResult> {
  const [existing, catalogue, suppliers] = await Promise.all([
    getProducts(), getMatchCatalogue(), getSuppliers(),
  ]);

  const bySku = new Map(existing.filter((p: any) => p.sku).map((p: any) => [String(p.sku).toUpperCase(), p]));
  const byId = new Map(existing.map((p: any) => [p.id, p]));
  const fileWarnings: string[] = [];
  const headers = csvRows.length ? Object.keys(csvRows[0]) : [];

  // Track what earlier rows in THIS file already claimed.
  const seenSku = new Map<string, number>();   // sku → row number
  const seenName = new Map<string, number>();  // normalized name → row number

  const rows: AnalysedRow[] = [];

  csvRows.forEach((r, idx) => {
    const rowNo = idx + 1;
    const warnings: string[] = [];
    const sku = pick(r, H.sku) || null;
    const name = pick(r, H.name);
    const salePrice = num(pick(r, H.salePrice));
    const costPrice = num(pick(r, H.costPrice));
    const quantity = num(pick(r, H.quantity)) ?? 0;
    const supplierName = pick(r, H.supplier) || null;

    const base: AnalysedRow = {
      row: rowNo, sku, name, category: pick(r, H.category) || null, unit: pick(r, H.unit) || null,
      salePrice, costPrice,
      wholesalePrice: num(pick(r, H.wholesalePrice)),
      minStockQty: num(pick(r, H.minStockQty)),
      quantity, supplierName, supplierId: null,
      action: "create", matchedProductId: null, matchedProductName: null, matchReason: null,
      candidates: [], rejectReason: null, warnings,
    };

    if (!name && !sku) { return; } // wholly blank line

    if (supplierName) {
      const sup = suppliers.find((s: any) => (s.name || "").toLowerCase() === supplierName.toLowerCase());
      if (sup) base.supplierId = sup.id;
      else warnings.push(`Supplier "${supplierName}" is not on file — the product will be imported without one.`);
    }

    // ── Rejections ────────────────────────────────────────────────────────
    if (!name) {
      rows.push({ ...base, action: "reject", rejectReason: "No product name." });
      return;
    }

    // ── Match: SKU is decisive, then name ─────────────────────────────────
    let matched: any = sku ? bySku.get(sku.toUpperCase()) : null;
    let reason: "sku" | "name" | null = matched ? "sku" : null;
    const candidates: AnalysedRow["candidates"] = [];

    if (!matched && !sku) {
      const m = matchProduct(name, catalogue);
      if (m.decision === "auto" && m.productId) {
        matched = byId.get(m.productId);
        reason = "name";
      } else if (m.candidates.length) {
        for (const c of m.candidates.slice(0, 4)) {
          candidates.push({ productId: c.productId, name: c.name, sku: c.sku, score: c.score });
        }
        if (m.decision === "review") {
          warnings.push(`Looks similar to "${m.candidates[0].name}" — check before creating a separate product.`);
        }
      }
    }

    // ── Same thing twice in this file ─────────────────────────────────────
    const nameKey = normalizeName(name);
    const dupRow = (sku && seenSku.get(sku.toUpperCase())) || seenName.get(nameKey);
    if (dupRow && !matched) {
      // Fold into the earlier row's product rather than creating a second one.
      const earlier = rows.find((x) => x.row === dupRow);
      if (earlier) {
        earlier.quantity += quantity;
        earlier.warnings.push(`Row ${rowNo} is the same item — quantities combined (${earlier.quantity} total).`);
        fileWarnings.push(`Row ${rowNo} repeats row ${dupRow} ("${name}"). They have been combined into one line.`);
        return;
      }
    }
    if (sku) seenSku.set(sku.toUpperCase(), rowNo);
    seenName.set(nameKey, rowNo);

    if (matched) {
      // Prices are optional on an update — blank means "leave it alone".
      rows.push({
        ...base, action: "update", matchedProductId: matched.id, matchedProductName: matched.name,
        matchReason: reason, candidates,
      });
      return;
    }

    // ── Creating: prices are mandatory, or the product is unsellable ──────
    const missing: string[] = [];
    if (!(costPrice && costPrice > 0)) missing.push("cost price");
    if (!(salePrice && salePrice > 0)) missing.push("sale price");
    if (missing.length) {
      rows.push({
        ...base, action: "reject",
        rejectReason: `New product needs a ${missing.join(" and ")} above zero.`,
        candidates,
      });
      return;
    }
    if (salePrice! <= costPrice!) {
      warnings.push(`Sale price ${salePrice} is not above cost ${costPrice} — this product would make no profit.`);
    }
    rows.push({ ...base, action: "create", candidates });
  });

  return {
    rows,
    headers,
    fileWarnings,
    summary: {
      total: rows.length,
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      reject: rows.filter((r) => r.action === "reject").length,
      withQty: rows.filter((r) => r.quantity > 0).length,
    },
  };
}

export interface CommitRow {
  row: number;
  name: string;
  sku?: string | null;
  category?: string | null;
  unit?: string | null;
  salePrice?: number | null;
  costPrice?: number | null;
  wholesalePrice?: number | null;
  minStockQty?: number | null;
  quantity?: number;
  supplierId?: number | null;
  /** null → create a new product. */
  productId: number | null;
  /** Where this row's stock goes. Falls back to the import-wide location. */
  storeId?: number | null;
}

export interface CommitResult {
  created: { row: number; name: string; productId: number }[];
  updated: { row: number; name: string; productId: number }[];
  stockAdded: { row: number; name: string; storeId: number; before: number; added: number; after: number }[];
  stockSkipped: { row: number; name: string; qty: number; reason: string }[];
  failed: { row: number; name: string; reason: string }[];
}

/**
 * Apply reviewed rows. Only what is passed in gets written, and the caller has
 * already chosen the location, so nothing here has to guess.
 */
export async function commitRows(
  rows: CommitRow[],
  opts: { defaultStoreId: number | null; userId?: number },
): Promise<CommitResult> {
  const out: CommitResult = { created: [], updated: [], stockAdded: [], stockSkipped: [], failed: [] };

  // Products created earlier in THIS run, so a repeated name updates instead of
  // creating a twin — the snapshot the analysis used cannot know about them.
  const createdThisRun = new Map<string, number>();

  for (const r of rows) {
    const name = String(r.name || "").trim();
    try {
      if (!name) throw new Error("No product name.");

      const key = normalizeName(name);
      let productId = r.productId ?? createdThisRun.get(key) ?? null;
      let created = false;

      if (productId == null) {
        const cost = Number(r.costPrice) || 0;
        const sale = Number(r.salePrice) || 0;
        if (!(cost > 0) || !(sale > 0)) throw new Error("A new product needs a cost and sale price above zero.");

        const made = await createProduct({
          name: name.toUpperCase(),
          sku: r.sku || null,
          category: r.category || null,
          unit: (r.unit || "PCS").toUpperCase(),
          costPrice: String(cost),
          salePrice: String(sale),
          wholesalePrice: String(Number(r.wholesalePrice) > 0 ? r.wholesalePrice : sale),
          minStockQty: String(Number(r.minStockQty) > 0 ? r.minStockQty : 0),
          ...(r.supplierId ? { supplierId: r.supplierId } : {}),
          ...(r.storeId ?? opts.defaultStoreId ? { locationStoreId: r.storeId ?? opts.defaultStoreId } : {}),
        } as any);
        productId = made.id;
        created = true;
        createdThisRun.set(key, made.id);
        out.created.push({ row: r.row, name, productId: made.id });
      } else {
        // Blank means "leave alone" — never overwrite a stored value with a default.
        const patch: any = {};
        if (r.sku) patch.sku = r.sku;
        if (r.category) patch.category = r.category;
        if (r.unit) patch.unit = String(r.unit).toUpperCase();
        if (Number(r.costPrice) > 0) patch.costPrice = String(r.costPrice);
        if (Number(r.salePrice) > 0) patch.salePrice = String(r.salePrice);
        if (Number(r.wholesalePrice) > 0) patch.wholesalePrice = String(r.wholesalePrice);
        if (Number(r.minStockQty) > 0) patch.minStockQty = String(r.minStockQty);
        if (r.supplierId) patch.supplierId = r.supplierId;
        if (Object.keys(patch).length) await updateProduct(productId, patch);
        out.updated.push({ row: r.row, name, productId });
      }

      const qty = Number(r.quantity) || 0;
      if (qty > 0) {
        const storeId = r.storeId ?? opts.defaultStoreId;
        if (!storeId) {
          out.stockSkipped.push({ row: r.row, name, qty, reason: "No location chosen for this row." });
        } else {
          const before = await getProductQtyAt(productId, storeId);
          await adjustStock(
            productId, storeId, qty, "add",
            created ? "Opening stock (CSV import)" : "Stock received (CSV import)",
            productId, opts.userId,
          );
          out.stockAdded.push({ row: r.row, name, storeId, before, added: qty, after: before + qty });
        }
      }
    } catch (e) {
      out.failed.push({ row: r.row, name, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return out;
}
