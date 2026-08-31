// Boxes and pieces.
//
//   products.pack_unit / pack_size — the bigger buying unit and how many base
//   units are inside it. Buy 10 BOX of 12, and 120 PCS go on the shelf.
//
//   document_items.base_qty — the quantity that actually moved, in base units,
//   frozen at the moment the line was written. The same lesson as cost_at_sale:
//   changing a pack size later must never rewrite what a past sale took off the
//   shelf, and a return must give back exactly what the sale took.
//
// Every column is nullable, so nothing existing changes: a product with no pack
// behaves exactly as before, and an old line falls back to its own quantity.
//
// Idempotent. Run: node scripts/migrate-pack-units.mjs
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, "..", ".env"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const log = (m) => console.log("[" + new Date().toISOString().slice(11, 19) + "] " + m);

const client = new pg.Client({
  connectionString: url,
  ssl: /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(url)
    ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15000,
  statement_timeout: 60000,
});

const COLS = [
  ["products", "pack_unit", "text"],
  ["products", "pack_size", "numeric"],
  ["document_items", "base_qty", "numeric"],
];

let failed = false;
try {
  await client.connect();
  log("connected");
  for (const [table, col, type] of COLS) {
    const has = await client.query(
      "select count(*)::int n from information_schema.columns " +
      "where table_name = $1 and column_name = $2", [table, col]);
    if (has.rows[0].n > 0) { log(`${table}.${col} already exists.`); continue; }
    await client.query(`alter table ${table} add column ${col} ${type}`);
    log(`added ${table}.${col}`);
  }
  const n = await client.query("select count(*)::int c from products where pack_unit is not null");
  log(`${n.rows[0].c} product(s) have a pack unit so far`);
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
