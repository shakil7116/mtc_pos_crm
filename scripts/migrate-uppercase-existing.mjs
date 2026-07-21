// One-time backfill: UPPER-CASE the display text fields on existing rows so old
// records match the new write-time uppercasing. Safe: only the listed columns,
// only non-null values. Email/phone/TRN/notes/URLs untouched.
import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const jobs = [
  ["customers", ["name", "address"]],
  ["products", ["name", "sku", "category", "unit"]],
  ["document_items", ["description", "sku", "unit"]],
  ["documents", ["customer_name"]],
];

const run = async () => {
  for (const [table, cols] of jobs) {
    for (const c of cols) {
      const r = await pool.query(`UPDATE ${table} SET ${c} = UPPER(${c}) WHERE ${c} IS NOT NULL AND ${c} <> UPPER(${c})`);
      console.log(`✓ ${table}.${c} — ${r.rowCount} rows`);
    }
  }
  await pool.end();
};
run().catch((e) => { console.error("backfill failed:", e.message); process.exit(1); });
