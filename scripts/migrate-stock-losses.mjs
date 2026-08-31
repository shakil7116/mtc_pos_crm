// Creates the stock_losses table.
//
// WHY: stock movements have always recorded the QUANTITY that moved. Nothing
// recorded what a loss was WORTH, so material that went missing never reached
// the money — profit was reported as if nothing had been lost at all.
//
// First writer is the transfer receipt: sent 100, received 70, the 30 become a
// valued, attributed loss instead of 30 phantom bags on a shelf. Stock counts
// and damage follow into the same table.
//
// Creates nothing else and changes no existing column.
// Idempotent. Run: node scripts/migrate-stock-losses.mjs
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
    create table if not exists stock_losses (
      id serial primary key,
      product_id integer references products(id),
      description text not null,
      store_id integer references stores(id),
      qty numeric not null,
      unit text,
      unit_cost numeric not null default 0,
      value numeric not null default 0,
      kind text not null,
      ref_type text,
      ref_id integer,
      reason text not null,
      reported_by integer references users(id),
      against_user_id integer references users(id),
      date date not null,
      created_at timestamp default now()
    )`);
  log("table stock_losses ready");

  // Every report reads these two ways: by date for a period, by kind for a split.
  await client.query("create index if not exists stock_losses_date_idx on stock_losses (date)");
  await client.query("create index if not exists stock_losses_kind_idx on stock_losses (kind)");
  await client.query("create index if not exists stock_losses_ref_idx on stock_losses (ref_type, ref_id)");
  log("indexes ready");

  const n = await client.query("select count(*)::int c from stock_losses");
  log(`stock_losses holds ${n.rows[0].c} row(s)`);
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
