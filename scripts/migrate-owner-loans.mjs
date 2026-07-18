// Owner loans / cash injections table (idempotent).
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const stmts = [
  `CREATE TABLE IF NOT EXISTS owner_loans (
    id serial PRIMARY KEY,
    type text NOT NULL,
    amount numeric NOT NULL,
    source text,
    method text NOT NULL DEFAULT 'Cash',
    date date NOT NULL,
    note text,
    created_by integer REFERENCES users(id),
    created_at timestamp DEFAULT now()
  )`,
];
let ok = 0;
for (const sql of stmts) { try { await pool.query(sql); ok++; console.log("OK:", sql.slice(0, 50)); } catch (e) { console.error("FAIL:", e.message); } }
console.log(`${ok}/${stmts.length} applied.`);
await pool.end();
