// Adds per-line physical location to document_items (Quick Sale per-line location).
// Idempotent. Run: node scripts/migrate-line-location.mjs
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const run = async () => {
  await pool.query(
    `ALTER TABLE document_items ADD COLUMN IF NOT EXISTS location_store_id integer REFERENCES stores(id)`,
  );
  console.log("✓ document_items.location_store_id added");
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='document_items' AND column_name='location_store_id'`,
  );
  console.table(rows);
  await pool.end();
};

run().catch((e) => { console.error("migration failed:", e.message); process.exit(1); });
