import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "csv-templates");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// ─── Customers ──────────────────────────────────────────────────────────────
const customersCols = [
  "name",
  "phone",
  "type",
  "credit_limit",
  "trn",
  "address",
  "notes",
  "payment_terms",
];

const customersRows = [
  ["Al Noor Trading LLC", "+971501234567", "corporate", "50000", "100123456789012", "Dubai, Deira", "Key account", "Net 30"],
  ["Mohammed Ahmed", "+971559876543", "contractor", "20000", "", "Sharjah, Industrial Area 2", "", "Net 15"],
  ["Walk-in Customer", "", "walk-in", "0", "", "", "", ""],
  ["Emirates Construction Co.", "+971504445555", "government", "100000", "300987654321098", "Abu Dhabi", "Govt project Q3", "Net 60"],
  ["Hassan Building Materials", "+971556667777", "contractor", "35000", "100555666777888", "Ajman", "Regular contractor", "Net 30"],
];

// ─── Products (Inventory) ───────────────────────────────────────────────────
const productsCols = [
  "sku",
  "name",
  "category",
  "unit",
  "sale_price",
  "wholesale_price",
  "cost_price",
  "min_stock_qty",
  "supplier_name",
  "location_area",
  "location_rack",
  "location_shelf",
  "initial_qty",
];

const productsRows = [
  ["CEM-001", "Portland Cement 50kg", "Cement", "BAG", "25.00", "22.00", "18.50", "100", "National Cement Co.", "Warehouse A", "R1", "S1", "500"],
  ["STL-010", "Steel Rebar 12mm (12m)", "Steel", "PCS", "45.00", "40.00", "35.00", "50", "Emirates Steel", "Yard B", "R3", "S1", "200"],
  ["PLY-005", "Plywood 18mm 4x8", "Wood", "SHEET", "120.00", "105.00", "90.00", "30", "Al Madina Wood", "Warehouse A", "R2", "S2", "80"],
  ["PNT-020", "White Emulsion Paint 20L", "Paint", "BUCKET", "180.00", "160.00", "130.00", "20", "Jotun Paints", "Warehouse C", "R1", "S3", "60"],
  ["PIP-003", "PVC Pipe 4 inch (6m)", "Plumbing", "PCS", "35.00", "30.00", "24.00", "40", "National Pipes", "Yard B", "R5", "S1", "150"],
  ["TIL-007", "Ceramic Floor Tile 60x60", "Tiles", "BOX", "55.00", "48.00", "38.00", "25", "RAK Ceramics", "Warehouse A", "R4", "S2", "100"],
  ["ELC-015", "Cable 2.5mm (100m roll)", "Electrical", "ROLL", "210.00", "190.00", "160.00", "15", "Ducab Cables", "Warehouse C", "R2", "S1", "40"],
  ["SND-002", "Washed Sand (per ton)", "Aggregates", "TON", "90.00", "80.00", "60.00", "10", "Gulf Aggregates", "Yard A", "", "", "30"],
];

// ─── Suppliers ──────────────────────────────────────────────────────────────
const suppliersCols = [
  "name",
  "company",
  "whatsapp",
  "phone",
  "email",
  "address",
  "notes",
  "payment_terms",
  "credit_days",
  "payment_mode",
];

const suppliersRows = [
  ["Ahmed Khan", "National Cement Co.", "+971501112233", "+971501112233", "ahmed@nationalcement.ae", "Dubai Industrial City", "Main cement supplier", "Net 30", "30", "credit"],
  ["Ali Raza", "Emirates Steel", "+971502223344", "+971502223344", "ali@emiratessteel.ae", "Abu Dhabi, Musaffah", "Steel rebar & sections", "Net 60", "60", "credit"],
  ["Tariq Mahmood", "Al Madina Wood", "+971503334455", "+971503334455", "tariq@almadinawood.ae", "Sharjah, Industrial 6", "Plywood & timber", "Net 30", "30", "credit"],
  ["Nabil Hassan", "Jotun Paints", "+971504445566", "+971504445566", "nabil@jotun.ae", "Dubai, Al Quoz", "Paints & coatings", "Net 45", "45", "credit"],
  ["Imran Siddiqui", "National Pipes", "+971505556677", "+971505556677", "imran@nationalpipes.ae", "Ajman Free Zone", "PVC & HDPE pipes", "Cash on delivery", "0", "cash"],
  ["Sami Al Balushi", "RAK Ceramics", "+971506667788", "+971506667788", "sami@rakceramics.ae", "Ras Al Khaimah", "Tiles & sanitaryware", "Net 30", "30", "credit"],
  ["Khalid Nawaz", "Ducab Cables", "+971507778899", "+971507778899", "khalid@ducab.ae", "Dubai, Jebel Ali", "Electrical cables", "Net 30", "30", "credit"],
  ["Yusuf Ibrahim", "Gulf Aggregates", "+971508889900", "+971508889900", "yusuf@gulfagg.ae", "Fujairah", "Sand, gravel & crush", "Cash", "0", "cash"],
];

function writeCsv(filename, cols, rows) {
  const lines = [cols.join(",")];
  for (const row of rows) {
    lines.push(row.map((v) => (v.includes(",") ? `"${v}"` : v)).join(","));
  }
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  console.log(`  Created: ${filePath}`);
}

console.log("Generating CSV templates...\n");
writeCsv("customers.csv", customersCols, customersRows);
writeCsv("products.csv", productsCols, productsRows);
writeCsv("suppliers.csv", suppliersCols, suppliersRows);
console.log("\nDone! Files saved to csv-templates/");
