// Creates the stock_swaps table.
//
// WHY: a customer needs white, somebody hands over the white bought earlier —
// same size, same price, never went through the system. Months later one product
// is short and another is over, and nobody can connect them.
//
// A swap is now one record with both halves in it, so the two stock movements
// point at the same thing and the pair can never be read as two mysteries.
//
// Idempotent. Run: node scripts/migrate-stock-swaps.mjs
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

let failed = false;
try {
  await client.connect();
  log("connected");
  await client.query(`
    create table if not exists stock_swaps (
      id serial primary key,
      store_id integer references stores(id),
      out_product_id integer references products(id),
      out_name text not null,
      out_qty numeric not null,
      out_unit text,
      out_cost numeric not null default 0,
      out_value numeric not null default 0,
      in_product_id integer references products(id),
      in_name text not null,
      in_qty numeric not null,
      in_unit text,
      in_cost numeric not null default 0,
      in_value numeric not null default 0,
      difference numeric not null default 0,
      reason text not null,
      customer_name text,
      recorded_by integer references users(id),
      approved_by integer references users(id),
      date date not null,
      created_at timestamp default now()
    )`);
  log("table stock_swaps ready");
  await client.query("create index if not exists stock_swaps_date_idx on stock_swaps (date)");
  await client.query("create index if not exists stock_swaps_store_idx on stock_swaps (store_id)");
  log("indexes ready");
  const n = await client.query("select count(*)::int c from stock_swaps");
  log(`stock_swaps holds ${n.rows[0].c} row(s)`);
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
