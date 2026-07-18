// READ-ONLY: dump cashflow + owner_loans + cheques so we can identify test rows.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const cf = await pool.query(`select id, direction, category, amount, ref_type, ref_id, store_id, notes, date, created_by
  from cashflow order by id`);
console.log("=== CASHFLOW (" + cf.rows.length + " rows) ===");
for (const r of cf.rows) console.log(`#${r.id} ${r.direction.toUpperCase()} ${r.amount}  [${r.category}] ref=${r.ref_type||"-"}/${r.ref_id||"-"} store=${r.store_id||"-"}  "${(r.notes||"").slice(0,50)}"  ${r.date}`);

const ol = await pool.query(`select id, type, amount, source, method, date, note from owner_loans order by id`);
console.log("\n=== OWNER_LOANS (" + ol.rows.length + " rows) ===");
for (const r of ol.rows) console.log(`#${r.id} ${r.type} ${r.amount} src=${r.source} method=${r.method} "${(r.note||"").slice(0,40)}" ${r.date}`);

const ch = await pool.query(`select id, type, amount, cheque_number, bank_name, status, cheque_date, notes from cheques order by id`);
console.log("\n=== CHEQUES (" + ch.rows.length + " rows) ===");
for (const r of ch.rows) console.log(`#${r.id} ${r.type} ${r.amount} no=${r.cheque_number} bank=${r.bank_name} status=${r.status} "${(r.notes||"").slice(0,40)}" ${r.cheque_date}`);

await pool.end();
