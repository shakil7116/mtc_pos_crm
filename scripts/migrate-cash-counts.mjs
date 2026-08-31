// Counting the drawer at close.
//
// WHY: a cash sale that never gets entered is the oldest hole in retail, and no
// system can prevent it. What a system can do is make it visible — count the
// money, compare it with what the day says was taken, and write the difference
// down every day. One day short is nothing; the same till short every day is the
// only evidence anybody will ever get.
//
// Idempotent. Run: node scripts/migrate-cash-counts.mjs
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
    create table if not exists cash_counts (
      id serial primary key,
      store_id integer references stores(id),
      date date not null,
      opening_float numeric not null default 0,
      cash_in numeric not null default 0,
      cash_out numeric not null default 0,
      expected numeric not null default 0,
      counted numeric not null default 0,
      breakdown jsonb default '{}',
      difference numeric not null default 0,
      closing_float numeric not null default 0,
      banked numeric not null default 0,
      reason text,
      counted_by integer references users(id),
      created_at timestamp default now()
    )`);
  log("table cash_counts ready");
  await client.query("create index if not exists cash_counts_store_date_idx on cash_counts (store_id, date)");
  log("index ready");

  const has = await client.query(
    "select count(*)::int n from information_schema.columns " +
    "where table_name = 'settings' and column_name = 'cash_count_tolerance'");
  if (has.rows[0].n > 0) {
    log("settings.cash_count_tolerance already exists.");
  } else {
    await client.query("alter table settings add column cash_count_tolerance numeric default '5'");
    log("added settings.cash_count_tolerance");
  }
  const s = await client.query("select cash_count_tolerance v from settings limit 1");
  log("a till difference over QAR " + (s.rows[0]?.v ?? "?") + " needs an explanation");
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
