// Adds document_items.cost_at_sale — the COGS snapshot column.
//
// Why: gross profit was computed by joining documentItems to products and reading
// products.cost_price at REPORT time. That means changing a supplier's cost silently
// rewrote the margin on every invoice ever sold — a cost rise could turn a
// historically profitable invoice into a loss. The cost must be frozen at sale time.
//
// Existing rows are left NULL on purpose. resolveItemCost() falls back to the current
// product cost for them, which is exactly the old behaviour — so historical reports do
// not change, and every invoice written from now on is pinned.
//
// Idempotent and additive. Safe to re-run. Run: node scripts/migrate-cogs-snapshot.mjs
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

// Explicit timeouts: a migration that hangs forever is worse than one that fails.
const client = new pg.Client({
  connectionString: url,
  ssl: /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(url)
    ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 60_000,
});

let failed = false;
try {
  log("connecting…");
  await client.connect();
  log("connected");

  const exists = await client.query(`
    select count(*)::int as n from information_schema.columns
    where table_name = 'document_items' and column_name = 'cost_at_sale'`);

  if (exists.rows[0].n > 0) {
    log("cost_at_sale already exists — nothing to add.");
  } else {
    // Nullable, no default → metadata-only change on PG 11+. No table rewrite.
    await client.query(`alter table document_items add column cost_at_sale numeric`);
    log("added document_items.cost_at_sale");
  }

  const stats = await client.query(`
    select count(*)::int as total, count(cost_at_sale)::int as pinned from document_items`);
  const { total, pinned } = stats.rows[0];
  log(`document_items: ${total} rows — ${pinned} pinned, ${total - pinned} falling back to current product cost.`);
  log("done. Historical rows are intentionally left unpinned; new sales pin automatically.");
} catch (e) {
  failed = true;
  log(`FAILED: ${e.code || ""} ${e.message}`);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
