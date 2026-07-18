// One-off idempotent Foundation migration: dynamic-schema tables + customData
// columns + role backfill + seed managed lists. Safe to re-run.
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });

const DDL = `
ALTER TABLE customers ADD COLUMN IF NOT EXISTS custom_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS custom_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS custom_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS custom_data jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS field_definitions (
  id SERIAL PRIMARY KEY,
  module_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  options JSONB DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT false,
  visible_to_roles JSONB DEFAULT '[]'::jsonb,
  show_in_list BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_definitions (
  id SERIAL PRIMARY KEY,
  module_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Box',
  categories JSONB DEFAULT '[]'::jsonb,
  roles JSONB DEFAULT '[]'::jsonb,
  is_custom BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_records (
  id SERIAL PRIMARY KEY,
  module_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  category TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS managed_lists (
  id SERIAL PRIMARY KEY,
  list_key TEXT NOT NULL,
  value TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_field_defs_module ON field_definitions(module_key);
-- Enforce the "field_key unique within a module" contract the code promises
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_defs_module_field ON field_definitions(module_key, field_key);
CREATE INDEX IF NOT EXISTS idx_custom_records_module ON custom_records(module_key);
CREATE INDEX IF NOT EXISTS idx_managed_lists_key ON managed_lists(list_key);

-- Legacy role backfill (staff -> salesman)
UPDATE users SET role = 'salesman' WHERE role = 'staff';
`;

const SEED = {
  product_categories: ["Gypsum","Plumbing","Electrical","HVAC","Painting","Chemicals","Safety Equipment","Power Tools","Plywood/Wood","Other"],
  product_units: ["BAG","PCS","MTR","KG","ROLL","GALLON","SET","BOX","PAIR","LTR"],
  expense_categories: ["Store 1 Rent","Store 2 Rent","Warehouse 1 Rent","Warehouse 2 Rent","Warehouse 3 Rent","Staff Salaries","Daily Staff Meals","Medical / Insurance","Software / Subscriptions","Maintenance","Other"],
  credit_terms: ["30","60","90"],
};

async function main() {
  const c = await pool.connect();
  try {
    await c.query(DDL);
    console.log("DDL applied (tables + columns + role backfill).");
    for (const [listKey, values] of Object.entries(SEED)) {
      const { rows } = await c.query("SELECT count(*)::int AS n FROM managed_lists WHERE list_key=$1", [listKey]);
      if (rows[0].n > 0) { console.log(`seed ${listKey}: already has ${rows[0].n} rows, skip`); continue; }
      let i = 0;
      for (const v of values) {
        await c.query("INSERT INTO managed_lists (list_key, value, sort_order) VALUES ($1,$2,$3)", [listKey, v, i++]);
      }
      console.log(`seed ${listKey}: inserted ${values.length}`);
    }
    // Register built-in modules so custom fields can target them + the module list is unified
    const builtins = [
      ["customers","Customers","Users"],["products","Inventory","Package"],
      ["documents","Documents","FileText"],["suppliers","Suppliers","Truck"],["expenses","Expenses","Wallet"],
    ];
    for (const [key,name,icon] of builtins) {
      await c.query(
        `INSERT INTO module_definitions (module_key,name,icon,is_custom,active) VALUES ($1,$2,$3,false,true)
         ON CONFLICT (module_key) DO NOTHING`, [key,name,icon]);
    }
    console.log("built-in modules registered.");
    const { rows: rc } = await c.query("SELECT role, count(*)::int n FROM users GROUP BY role");
    console.log("user roles now:", rc);
    console.log("✅ Foundation migration complete.");
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch((e) => { console.error("MIGRATION FAILED:", e.message); process.exit(1); });
