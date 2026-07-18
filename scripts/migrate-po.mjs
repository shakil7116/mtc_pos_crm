// Step 2 (P0 #2): supplier_orders destination store for PO receive → inventory.
import "dotenv/config";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
const c = await pool.connect();
try {
  await c.query("ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id)");
  console.log("✅ supplier_orders.store_id added.");
} finally { c.release(); await pool.end(); }
