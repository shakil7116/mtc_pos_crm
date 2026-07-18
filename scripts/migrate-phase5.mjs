// Idempotent Phase 5 migration:
//  - products: physical location path (location_store_id, area, rack, shelf)
//  - documents: driver_id + delivery_instructions (driver dashboard)
//  - seed location hierarchy managed lists (areas/racks/shelves) — admin-editable
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const stmts = [
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS location_store_id integer REFERENCES stores(id)`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS location_area text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS location_rack text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS location_shelf text`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS driver_id integer REFERENCES users(id)`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS delivery_instructions text`,
];

let ok = 0;
for (const sql of stmts) {
  try { await pool.query(sql); ok++; console.log("OK:", sql.slice(0, 72).replace(/\s+/g, " ")); }
  catch (e) { console.error("FAIL:", sql.slice(0, 72), "→", e.message); }
}

// Seed starter options for the 3 sub-levels (free-text lists, admin edits anytime).
const SEEDS = {
  location_areas:  ["North Side", "South Side", "East Side", "West Side", "Middle"],
  location_racks:  ["Rack A", "Rack B", "Middle Rack", "Corner Rack", "Wall Rack"],
  location_shelves: ["Shelf 1", "Shelf 2", "Shelf 3", "Top Shelf", "Bottom Shelf", "Left Side", "Right Side"],
};
for (const [key, values] of Object.entries(SEEDS)) {
  const { rows } = await pool.query(`SELECT value FROM managed_lists WHERE list_key=$1`, [key]);
  const have = new Set(rows.map((r) => r.value));
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    if (have.has(values[i])) continue;
    await pool.query(
      `INSERT INTO managed_lists (list_key, value, sort_order, active) VALUES ($1,$2,$3,true)`,
      [key, values[i], i],
    );
    n++;
  }
  console.log(`Seeded ${n} → ${key} (had ${have.size})`);
}
console.log(`${ok}/${stmts.length} statements applied.`);
await pool.end();
