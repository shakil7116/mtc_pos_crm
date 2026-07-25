import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const run = async () => {
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS received_by integer`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS received_at timestamp`);
  console.log("✓ documents.received_by, received_at");
  await pool.end();
};
run().catch((e) => { console.error(e.message); process.exit(1); });
