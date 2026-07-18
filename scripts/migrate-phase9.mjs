// Phase 9 migration (idempotent):
//  - products.image_url (optional product photo)
//  - documents.footer_discount_by (who approved the footer/grand-total discount)
//  - settings.store_open_time / store_close_time (business day boundary)
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const stmts = [
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS footer_discount_by integer REFERENCES users(id)`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS store_open_time text DEFAULT '05:00'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS store_close_time text DEFAULT '22:00'`,
];
let ok = 0;
for (const sql of stmts) { try { await pool.query(sql); ok++; console.log("OK:", sql.slice(0, 72)); } catch (e) { console.error("FAIL:", sql.slice(0,60), e.message); } }
console.log(`${ok}/${stmts.length} applied.`);
await pool.end();
