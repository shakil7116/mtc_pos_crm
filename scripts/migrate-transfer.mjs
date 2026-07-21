import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const run = async () => {
  await pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_store_id integer`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS to_store_id integer`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS taken_by text`);
  console.log("✓ stores.owner_store_id, documents.to_store_id, documents.taken_by");
  await pool.end();
};
run().catch((e) => { console.error("migration failed:", e.message); process.exit(1); });
