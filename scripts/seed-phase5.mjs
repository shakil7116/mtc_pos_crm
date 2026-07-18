// Phase 5 demo seed — Store 1 (Najma Street) dataset for dashboard verification.
// Idempotent: skips anything already present (marker: names prefixed "NJ").
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BASE = "http://localhost:5050";
const H = (role = "admin", uid = "1") => ({ "Content-Type": "application/json", "x-user-role": role, "x-user-id": uid });
const today = new Date().toISOString().slice(0, 10);

// ── Test users (one per role) ──────────────────────────────────
const USERS = [
  { name: "NJ Salesman Ali", role: "salesman", pin: "1111", store_id: 1 },
  { name: "NJ Keeper Hassan", role: "warehouse", pin: "2222", store_id: 3 },
  { name: "NJ Driver Rafiq", role: "driver", pin: "3333", store_id: null },
  { name: "NJ Manager Karim", role: "manager", pin: "4444", store_id: null },
];
const userIds = {};
for (const u of USERS) {
  const { rows } = await pool.query(`SELECT id FROM users WHERE name=$1`, [u.name]);
  if (rows.length) { userIds[u.role] = rows[0].id; continue; }
  const { rows: ins } = await pool.query(
    `INSERT INTO users (name, role, pin, store_id, active) VALUES ($1,$2,$3,$4,true) RETURNING id`,
    [u.name, u.role, u.pin, u.store_id],
  );
  userIds[u.role] = ins[0].id;
}
console.log("users:", JSON.stringify(userIds));

// ── 5 customers → Store 1 ──────────────────────────────────────
const CUSTOMERS = [
  ["NJ Al Rayyan Contracting", "+97455100001", "5000"],
  ["NJ Doha Build Mart", "+97455100002", "10000"],
  ["NJ Petra Interiors", "+97455100003", "0"],
  ["NJ Lusail Villas Co", "+97455100004", "20000"],
  ["NJ Walk-in Trade", "+97455100005", "0"],
];
const custIds = [];
for (const [name, phone, limit] of CUSTOMERS) {
  const { rows } = await pool.query(`SELECT id FROM customers WHERE name=$1`, [name]);
  if (rows.length) { custIds.push(rows[0].id); continue; }
  const { rows: ins } = await pool.query(
    `INSERT INTO customers (name, phone, credit_limit, active) VALUES ($1,$2,$3,true) RETURNING id`,
    [name, phone, limit],
  );
  custIds.push(ins[0].id);
}
console.log("customers:", custIds.join(","));

// ── 10 products → Store 1 with varied location paths ──────────
const PRODUCTS = [
  ["NJ-CEM-01", "NJ Portland Cement 50kg", "Cement", "bag", 28, 21, 20, "East Side", "Wall Rack", "Shelf 1"],
  ["NJ-STL-02", "NJ Steel Rebar 12mm", "Steel", "pcs", 45, 36, 30, "North Side", "Rack A", "Bottom Shelf"],
  ["NJ-BLK-03", "NJ Concrete Block 20cm", "Blocks", "pcs", 4.5, 3.2, 100, "South Side", "Corner Rack", "Shelf 2"],
  ["NJ-PNT-04", "NJ Oryx Paint White 18L", "Paint", "gallon", 165, 120, 10, "Middle", "Middle Rack", "Top Shelf"],
  ["NJ-PIP-05", "NJ PVC Pipe 4in x 3m", "Pipes", "pcs", 32, 24, 25, "West Side", "Wall Rack", "Left Side"],
  ["NJ-TIL-06", "NJ Ceramic Tile 60x60", "Tiles", "m", 38, 27, 40, "East Side", "Rack B", "Shelf 3"],
  ["NJ-WIR-07", "NJ Electric Cable 2.5mm", "Electrical", "roll", 210, 155, 8, "North Side", "Corner Rack", "Top Shelf"],
  ["NJ-SND-08", "NJ Washed Sand", "Aggregate", "bag", 12, 8, 50, "South Side", "Wall Rack", "Bottom Shelf"],
  ["NJ-GLU-09", "NJ Tile Adhesive 20kg", "Adhesives", "bag", 22, 15, 15, "Middle", "Rack A", "Shelf 2"],
  ["NJ-LAD-10", "NJ Aluminium Ladder 3m", "Tools", "pcs", 145, 100, 5, "West Side", "Middle Rack", "Right Side"],
];
const prodIds = [];
for (const [sku, name, cat, unit, sale, cost, min, area, rack, shelf] of PRODUCTS) {
  const { rows } = await pool.query(`SELECT id FROM products WHERE sku=$1`, [sku]);
  if (rows.length) { prodIds.push(rows[0].id); continue; }
  const { rows: ins } = await pool.query(
    `INSERT INTO products (sku, name, category, unit, sale_price, cost_price, min_stock_qty, active,
       location_store_id, location_area, location_rack, location_shelf)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,1,$8,$9,$10) RETURNING id`,
    [sku, name, cat, unit, sale, cost, min, area, rack, shelf],
  );
  prodIds.push(ins[0].id);
}
console.log("products:", prodIds.join(","));

// ── Stock in Store 1: first 3 LOW (below min), rest healthy ───
for (let i = 0; i < prodIds.length; i++) {
  const pid = prodIds[i];
  const min = PRODUCTS[i][6];
  const qty = i < 3 ? Math.max(1, Math.floor(min / 4)) : min * 3; // 3 low-stock items
  const { rows } = await pool.query(`SELECT id FROM inventory WHERE product_id=$1 AND store_id=1`, [pid]);
  if (rows.length) await pool.query(`UPDATE inventory SET qty=$1 WHERE id=$2`, [String(qty), rows[0].id]);
  else await pool.query(`INSERT INTO inventory (product_id, store_id, qty) VALUES ($1,1,$2)`, [pid, String(qty)]);
}
console.log("inventory seeded (3 low)");

// ── 5 invoices from Store 1 today (via API — exercises real flow) ──
const { rows: markRows } = await pool.query(
  `SELECT count(*)::int n FROM documents WHERE date=$1 AND store_id=1 AND notes='PHASE5_SEED'`, [today]);
if (markRows[0].n >= 5) {
  console.log("invoices already seeded");
} else {
  const salesmanH = H("salesman", String(userIds.salesman));
  const mk = (custIdx, prodIdx, qty, payments, extra = {}) => {
    const p = PRODUCTS[prodIdx]; const total = p[4] * qty;
    return {
      type: "INV", date: today, customerId: custIds[custIdx], customerName: CUSTOMERS[custIdx][0],
      storeId: 1, subtotal: String(total), total: String(total), taxRate: "0", taxAmount: "0",
      notes: "PHASE5_SEED",
      items: [{ productId: prodIds[prodIdx], sku: p[0], description: p[1], qty, unit: p[3], price: String(p[4]), discountAmount: "0", amount: String(total) }],
      payments, createdBy: userIds.salesman, ...extra,
    };
  };
  const post = async (body) => {
    const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: salesmanH, body: JSON.stringify(body) });
    const d = await r.json();
    console.log(`INV ${d.number || "?"} → ${r.status} ${d.status || d.message || ""}`);
    return d;
  };
  await post(mk(0, 3, 4, [{ method: "Cash", amount: 660 }]));                              // cash paid
  await post(mk(1, 4, 10, [{ method: "Cash", amount: 320 }]));                             // cash paid
  await post(mk(3, 1, 20, [{ method: "Credit", amount: 900, creditTerm: 30 }]));           // credit unpaid
  await post(mk(1, 6, 2, [{ method: "PDC", amount: 420, chequeNumber: "NJ-CHQ-9001", bankName: "QNB", chequeDate: today }])); // PDC (due today → alert)
  await post(mk(0, 5, 30, [{ method: "Credit", amount: 1140, creditTerm: 30 }], {          // deliver to site + driver
    deliveryMethod: "deliver_site", deliveryStatus: "pending",
    deliveryAddress: "Villa 12, Al Waab Street, Doha", driverId: userIds.driver,
    deliveryInstructions: "Call site engineer before arrival",
  }));
}

// ── 2 expenses → Store 1 ───────────────────────────────────────
const { rows: expRows } = await pool.query(`SELECT count(*)::int n FROM expenses WHERE store_id=1 AND notes LIKE 'PHASE5%'`);
if (expRows[0].n < 2) {
  await fetch(`${BASE}/api/expenses`, { method: "POST", headers: H(), body: JSON.stringify({ category: "Daily Staff Meals", amount: 95, date: today, paymentMethod: "Cash", storeId: 1, notes: "PHASE5 lunch" }) });
  await fetch(`${BASE}/api/expenses`, { method: "POST", headers: H(), body: JSON.stringify({ category: "Store 1 Rent", amount: 11000, date: today, paymentMethod: "Bank Transfer", storeId: 1, isRecurring: true, frequency: "monthly", notes: "PHASE5 rent" }) });
  console.log("expenses seeded");
} else console.log("expenses already seeded");

// ── 1 warehouse issue → Warehouse 1 (storeId 3) ────────────────
const { rows: issRows } = await pool.query(`SELECT count(*)::int n FROM warehouse_issues WHERE description LIKE 'PHASE5%'`);
if (!issRows[0].n) {
  await fetch(`${BASE}/api/warehouse-issues`, { method: "POST", headers: H("warehouse", String(userIds.warehouse)), body: JSON.stringify({ storeId: 3, description: "PHASE5 — forklift hydraulic leak near Rack A", urgency: "normal" }) });
  console.log("issue seeded");
} else console.log("issue already seeded");

console.log("\nSEED COMPLETE");
await pool.end();
