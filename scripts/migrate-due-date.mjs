import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const run = async () => {
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS due_date date`);
  console.log("✓ documents.due_date added");
  await pool.end();
};
run().catch((e) => { console.error("migration failed:", e.message); process.exit(1); });
