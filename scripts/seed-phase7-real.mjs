// Phase 7 — real Store 1 (Najma Street) inventory + customers. Idempotent by SKU / name.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Real JWT login (ALLOW_DEV_HEADERS is off) — token kept in-memory only, never written to disk.
const loginRes = await fetch("http://localhost:5050/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "shakil", password: "Mtc@2026-1" }),
});
if (!loginRes.ok) throw new Error("Admin login failed — cannot seed via API: " + (await loginRes.text()));
const authCookie = loginRes.headers.get("set-cookie").match(/mtc_token=[^;]*/)[0];

// store ids: 1 = Store 1 — Najma Street, 3 = Warehouse 1
const S1 = 1, W1 = 3;

const PRODUCTS = [
  // sku,name,category,unit,cost,sell,storeId,area,rack,shelf,qty
  ["GYP-001", "Gypsum Board 12mm (Saint Gobain)", "Gypsum", "Sheet", 18, 25, W1, "North Side", "Rack A", "Shelf 1", 500],
  ["GYP-002", "Gypsum Compound 20kg (Knauf)", "Gypsum", "Bag", 22, 30, W1, "North Side", "Rack A", "Shelf 2", 200],
  ["GYP-003", "Metal Stud 76mm x 3m", "Gypsum", "Piece", 8, 12, W1, "North Side", "Rack B", "Shelf 1", 300],
  ["PLM-001", "PPR Pipe 20mm x 4m (Wavin)", "Plumbing", "Piece", 12, 18, S1, "East Side", "Wall Rack", "Shelf 1", 150],
  ["PLM-002", "Ball Valve 1/2 inch brass", "Plumbing", "Piece", 8, 14, S1, "East Side", "Wall Rack", "Shelf 2", 200],
  ["PLM-003", "Angle Valve 1/2 inch", "Plumbing", "Piece", 5, 9, S1, "East Side", "Wall Rack", "Shelf 3", 300],
  ["PLM-004", "Water Hose 1/2 inch 10m roll", "Plumbing", "Roll", 15, 22, S1, "East Side", "Corner Rack", "Shelf 1", 80],
  ["ELE-001", "Single Socket 13A (MK)", "Electrical", "Piece", 12, 18, S1, "West Side", "Display Rack", "Shelf 1", 150],
  ["ELE-002", "Double Socket 13A (MK)", "Electrical", "Piece", 18, 26, S1, "West Side", "Display Rack", "Shelf 2", 100],
  ["ELE-003", "1.5mm Cable 100m roll (Ducab)", "Electrical", "Roll", 85, 120, W1, "South Side", "Rack C", "Shelf 1", 50],
  ["PNT-001", "White Emulsion Paint 4L (Jotun)", "Painting", "Tin", 35, 50, S1, "South Side", "Paint Rack", "Shelf 1", 60],
  ["PNT-002", "White Oil Paint 4L (Jotun)", "Painting", "Tin", 45, 65, S1, "South Side", "Paint Rack", "Shelf 2", 40],
  ["PNT-003", "Paint Roller Set", "Painting", "Set", 8, 15, S1, "South Side", "Paint Rack", "Shelf 3", 100],
  ["SAF-001", "Safety Helmet yellow", "Safety", "Piece", 15, 25, S1, "Middle", "Safety Rack", "Shelf 1", 50],
  ["SAF-002", "Safety Gloves pair", "Safety", "Pair", 5, 10, S1, "Middle", "Safety Rack", "Shelf 2", 200],
  ["PWR-001", "Drill Machine 13mm (Bosch)", "Power Tools", "Piece", 180, 250, S1, "Middle", "Tools Cabinet", "Shelf 1", 20],
  ["PWR-002", "Angle Grinder 4 inch (Makita)", "Power Tools", "Piece", 220, 300, S1, "Middle", "Tools Cabinet", "Shelf 2", 15],
  ["CHM-001", "PVC Solvent Cement 250ml", "Chemicals", "Tin", 8, 14, S1, "East Side", "Chemical Rack", "Shelf 1", 120],
  ["CHM-002", "Silicone Sealant White 280ml", "Chemicals", "Piece", 10, 18, S1, "East Side", "Chemical Rack", "Shelf 2", 150],
];

// Ensure category/unit managed lists cover the new values.
const cats = [...new Set(PRODUCTS.map((p) => p[2]))];
const units = [...new Set(PRODUCTS.map((p) => p[3]))];
for (const [key, vals] of [["product_categories", cats], ["product_units", units]]) {
  const have = new Set((await pool.query(`SELECT value FROM managed_lists WHERE list_key=$1`, [key])).rows.map((r) => r.value));
  for (let i = 0; i < vals.length; i++) if (!have.has(vals[i])) await pool.query(`INSERT INTO managed_lists (list_key,value,sort_order,active) VALUES ($1,$2,$3,true)`, [key, vals[i], 100 + i]);
}
// Sub-location values for the racks/shelves used.
for (const [key, idx] of [["location_areas", 7], ["location_racks", 8], ["location_shelves", 9]]) {
  const vals = [...new Set(PRODUCTS.map((p) => p[idx]))];
  const have = new Set((await pool.query(`SELECT value FROM managed_lists WHERE list_key=$1`, [key])).rows.map((r) => r.value));
  for (let i = 0; i < vals.length; i++) if (!have.has(vals[i])) await pool.query(`INSERT INTO managed_lists (list_key,value,sort_order,active) VALUES ($1,$2,$3,true)`, [key, vals[i], 200 + i]);
}

let created = 0;
for (const [sku, name, cat, unit, cost, sell, storeId, area, rack, shelf, qty] of PRODUCTS) {
  let { rows } = await pool.query(`SELECT id FROM products WHERE sku=$1`, [sku]);
  let pid;
  if (rows.length) {
    pid = rows[0].id;
    await pool.query(`UPDATE products SET name=$2,category=$3,unit=$4,cost_price=$5,sale_price=$6,min_stock_qty=$7,location_store_id=$8,location_area=$9,location_rack=$10,location_shelf=$11,active=true WHERE id=$1`,
      [pid, name, cat, unit, cost, sell, Math.max(5, Math.floor(qty * 0.1)), storeId, area, rack, shelf]);
  } else {
    const ins = await pool.query(`INSERT INTO products (sku,name,category,unit,cost_price,sale_price,min_stock_qty,active,location_store_id,location_area,location_rack,location_shelf) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11) RETURNING id`,
      [sku, name, cat, unit, cost, sell, Math.max(5, Math.floor(qty * 0.1)), storeId, area, rack, shelf]);
    pid = ins.rows[0].id; created++;
  }
  // opening stock at its home location
  const { rows: inv } = await pool.query(`SELECT id FROM inventory WHERE product_id=$1 AND store_id=$2`, [pid, storeId]);
  if (inv.length) await pool.query(`UPDATE inventory SET qty=$1 WHERE id=$2`, [String(qty), inv[0].id]);
  else await pool.query(`INSERT INTO inventory (product_id,store_id,qty) VALUES ($1,$2,$3)`, [pid, storeId, String(qty)]);
}
console.log(`products: ${created} created, ${PRODUCTS.length - created} updated`);

// Customers
const CUSTOMERS = [
  ["Mohammed Al-Rashidi", "+974 3312 4455", 15000, false],
  ["Ahmed Construction WLL", "+974 5512 8833", 50000, false],
  ["Farhan Trading", "+974 6612 9977", 10000, true], // high risk
  ["Omar Hassan", "+974 5588 1122", 0, false],
  ["Khalid Al-Marri", "+974 3377 6644", 0, false],
];
const custIds = {};
for (const [name, phone, limit, highRisk] of CUSTOMERS) {
  let { rows } = await pool.query(`SELECT id FROM customers WHERE name=$1`, [name]);
  let cid;
  const bag = highRisk ? { riskFlag: "HIGH RISK", badDebt: true } : {};
  if (rows.length) { cid = rows[0].id; await pool.query(`UPDATE customers SET phone=$2,credit_limit=$3,active=true,custom_data=$4 WHERE id=$1`, [cid, phone, String(limit), bag]); }
  else { const ins = await pool.query(`INSERT INTO customers (name,phone,credit_limit,active,custom_data) VALUES ($1,$2,$3,true,$4) RETURNING id`, [name, phone, String(limit), bag]); cid = ins.rows[0].id; }
  custIds[name] = cid;
}
console.log("customers:", JSON.stringify(custIds));

// Opening receivables for the two credit customers with outstanding balances.
// Backdated unpaid invoices so aging buckets populate (45 / 75 days).
async function openingInvoice(custName, amount, daysAgo) {
  const cid = custIds[custName];
  const { rows: exist } = await pool.query(`SELECT id FROM documents WHERE customer_id=$1 AND notes='OPENING_BALANCE'`, [cid]);
  if (exist.length) return;
  const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  // reserve a number
  const numRes = await fetch("http://localhost:5050/api/documents", { method: "POST", headers: { "Content-Type": "application/json", cookie: authCookie },
    body: JSON.stringify({ type: "INV", date, customerId: cid, customerName: custName, storeId: S1, status: "unpaid", subtotal: String(amount), total: String(amount), taxRate: "0", taxAmount: "0", notes: "OPENING_BALANCE", items: [{ description: "Opening balance (pre-system)", qty: 1, unit: "lot", price: String(amount), discountAmount: "0", amount: String(amount) }], createdBy: 1, payments: [{ method: "Credit", amount, creditTerm: 30 }] }) });
  const d = await numRes.json();
  // backdate created_at so the void window / aging use the real date
  await pool.query(`UPDATE documents SET date=$1::date, created_at=$2::timestamptz WHERE id=$3`, [date, date + "T09:00:00Z", d.id]);
  console.log(`opening invoice ${d.number} for ${custName}: QAR ${amount} @ ${daysAgo}d`);
}
await openingInvoice("Mohammed Al-Rashidi", 3200, 45);
await openingInvoice("Farhan Trading", 8500, 75);

console.log("\nSEED COMPLETE");
await pool.end();
