// READ-ONLY: cheques + expenses so we can map the round-10k test cluster.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const cols = (await pool.query(
  `select column_name from information_schema.columns where table_name='cheques' order by ordinal_position`
)).rows.map(r => r.column_name);
console.log("cheque cols:", cols.join(", "));

const ch = await pool.query(`select id, type, who, amount, cheque_number, bank_name, status, cheque_date, document_id from cheques order by id`);
console.log("\n=== CHEQUES (" + ch.rows.length + ") ===");
for (const r of ch.rows) console.log(`#${r.id} ${r.type} who=${r.who||"-"} ${r.amount} no=${r.cheque_number} bank=${r.bank_name} status=${r.status} doc=${r.document_id||"-"} ${r.cheque_date}`);

const ex = await pool.query(`select id, category, amount, payment_method, date, notes from expenses order by id`);
console.log("\n=== EXPENSES (" + ex.rows.length + ") ===");
for (const r of ex.rows) console.log(`#${r.id} [${r.category}] ${r.amount} via ${r.payment_method} ${r.date} "${(r.notes||"").slice(0,30)}"`);

await pool.end();
