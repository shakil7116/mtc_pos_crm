// Adds products.track_stock — the switch that separates counted stock from the long tail.
//
// WHY: the shop carries roughly 4,000 products but only 30-40 sell regularly. Only
// those few are worth counting and keeping accurate. The rest are registered so they
// can be billed with the correct cost (so profit is exact) but their QUANTITY is
// simply unknown and nobody maintains it.
//
// Without this flag, an uncounted product sits at quantity 0 — and the sales screen
// hides zero-stock products, so it could never be billed at all.
//
// Defaults to TRUE, so every product that already exists keeps behaving exactly as
// before. Untick it per product for the long tail.
//
// Idempotent and additive. Safe to re-run.
//   node scripts/migrate-track-stock.mjs
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

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
  log("connecting...");
  await client.connect();
  log("connected");

  const exists = await client.query(
    "select count(*)::int n from information_schema.columns " +
    "where table_name = 'products' and column_name = 'track_stock'");

  if (exists.rows[0].n > 0) {
    log("track_stock already exists - nothing to add.");
  } else {
    await client.query(
      "alter table products add column track_stock boolean not null default true");
    log("added products.track_stock (default true)");
  }

  const s = await client.query(
    "select count(*)::int as total, " +
    "count(*) filter (where track_stock)::int as counted from products");
  const { total, counted } = s.rows[0];
  log("products: " + total + " total, " + counted + " counted, " +
      (total - counted) + " marked as not counted");
  log("done. Existing products are unchanged - untick the switch per product as you go.");
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
