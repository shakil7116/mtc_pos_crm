// Adds document_items.cost_at_sale — the COGS snapshot column.
//
// Why: gross profit was computed by joining documentItems to products and reading
// products.cost_price at REPORT time. That means changing a supplier's cost silently
// rewrote the margin on every invoice ever sold. The cost must be frozen at the
// moment of sale.
//
// Existing rows are left NULL on purpose. resolveItemCost() falls back to the current
// product cost for them, which is exactly the old behaviour — so historical reports do
// not change, and every invoice written from now on is pinned.
//
// Idempotent. Safe to re-run.
import pg from "pg";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const pool = new pg.Pool({
  connectionString: url,
  ssl: /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(url)
    ? { rejectUnauthorized: false } : undefined,
});

try {
  const before = await pool.query(`
    select count(*)::int as n from information_schema.columns
    where table_name = 'document_items' and column_name = 'cost_at_sale'`);

  if (before.rows[0].n > 0) {
    console.log("cost_at_sale already exists — nothing to do.");
  } else {
    await pool.query(`alter table document_items add column cost_at_sale numeric`);
    console.log("added document_items.cost_at_sale");
  }

  const stats = await pool.query(`
    select count(*)::int as total,
           count(cost_at_sale)::int as pinned
    from document_items`);
  const { total, pinned } = stats.rows[0];
  console.log(`document_items: ${total} rows, ${pinned} with a pinned cost, ${total - pinned} falling back to current product cost.`);
} catch (e) {
  console.error("migration failed:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
