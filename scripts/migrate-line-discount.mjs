// Add line-level discount columns to document_items (idempotent).
// Root cause of /api/documents 500: schema.ts declares discount_type/discount_amount
// on document_items but the table was never migrated → SELECT fails → dashboards white-screen.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function cols() {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns where table_name='document_items' order by column_name`
  );
  return rows.map((r) => r.column_name);
}

const before = await cols();
console.log("before:", before.join(", "));

const stmts = [
  `ALTER TABLE document_items ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'QAR'`,
  `ALTER TABLE document_items ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT '0'`,
];
let ok = 0;
for (const sql of stmts) { try { await pool.query(sql); ok++; console.log("OK:", sql.slice(0, 60)); } catch (e) { console.error("FAIL:", e.message); } }

const after = await cols();
console.log("after:", after.join(", "));
console.log(`has discount_type=${after.includes("discount_type")} discount_amount=${after.includes("discount_amount")}`);
console.log(`${ok}/${stmts.length} applied.`);
await pool.end();
