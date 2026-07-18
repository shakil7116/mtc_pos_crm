// Step 3 (Documents): delivery method/status/address on documents.
import "dotenv/config";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
const c = await pool.connect();
try {
  await c.query(`
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS delivery_method text;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS delivery_status text;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS delivery_address text;
  `);
  console.log("✅ documents delivery columns added.");
} finally { c.release(); await pool.end(); }
