// Phase 10 migration (idempotent):
//  - settings.opening_cash / opening_bank (Go-Live opening balances → cash position never spuriously negative)
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const stmts = [
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS opening_cash numeric DEFAULT '0'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS opening_bank numeric DEFAULT '0'`,
  // Delivery Note workflow (Agent 2): authorization + expected date on documents
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS expected_delivery_date date`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS authorized_by integer REFERENCES users(id)`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS authorized_at timestamp`,
  // Price tiers (Feature A): wholesale price per product
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price numeric DEFAULT '0'`,
];
let ok = 0;
for (const sql of stmts) { try { await pool.query(sql); ok++; console.log("OK:", sql.slice(0, 72)); } catch (e) { console.error("FAIL:", sql.slice(0,60), e.message); } }
console.log(`${ok}/${stmts.length} applied.`);
await pool.end();
