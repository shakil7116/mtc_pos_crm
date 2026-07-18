// Add photo_url to cheques (idempotent) — scanned cheque image as base64 data URL.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await pool.query(`ALTER TABLE cheques ADD COLUMN IF NOT EXISTS photo_url text`);
  const has = (await pool.query(`select 1 from information_schema.columns where table_name='cheques' and column_name='photo_url'`)).rowCount;
  console.log("photo_url present:", has === 1);
} catch (e) { console.error("FAIL:", e.message); process.exitCode = 1; }
await pool.end();
