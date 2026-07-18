// Add ref_type/ref_id to cheques (idempotent) so a payable cheque links back to
// its source expense — the single source of truth for cheque-expense bank movement.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const stmts = [
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS ref_type text`,
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS ref_id integer`,
];
let ok = 0;
for (const sql of stmts) { try { await pool.query(sql); ok++; console.log("OK:", sql.slice(0, 55)); } catch (e) { console.error("FAIL:", e.message); } }
const cols = (await pool.query(`select column_name from information_schema.columns where table_name='cheques' order by column_name`)).rows.map(r => r.column_name);
console.log("cheques cols:", cols.join(", "));
console.log(`${ok}/${stmts.length} applied.`);
await pool.end();
