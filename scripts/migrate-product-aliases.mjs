// Creates the product_aliases table — one physical product, many names.
// Idempotent (IF NOT EXISTS) and non-destructive: safe to re-run on any
// environment. Run: node scripts/migrate-product-aliases.mjs
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase|neon|render|amazonaws|\.cloud/.test(process.env.DATABASE_URL || "") ? { rejectUnauthorized: false } : undefined,
});

const STEPS = [
  ["product_aliases table", `
    CREATE TABLE IF NOT EXISTS product_aliases (
      id           serial PRIMARY KEY,
      product_id   integer NOT NULL REFERENCES products(id),
      alias        text NOT NULL,
      alias_norm   text NOT NULL,
      source       text NOT NULL DEFAULT 'manual',
      confirmed_by integer REFERENCES users(id),
      created_at   timestamp DEFAULT now()
    )`],

  // The whole safety model rests on this: one normalized string can never point
  // at two products. Without it, a race between two review screens could file
  // the same alias against different SKUs and split the stock silently.
  ["unique alias_norm index", `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_aliases_norm ON product_aliases (alias_norm)`],

  ["product_id index", `
    CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id ON product_aliases (product_id)`],
];

// Optional: pg_trgm lets Postgres pre-filter candidates for very large
// catalogues. The matcher works without it (server/matching.ts computes the
// same trigram similarity in JS), so a permission failure here is not fatal.
const OPTIONAL = [
  ["pg_trgm extension", `CREATE EXTENSION IF NOT EXISTS pg_trgm`],
  ["products.name trigram index", `
    CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops)`],
  ["product_aliases.alias trigram index", `
    CREATE INDEX IF NOT EXISTS idx_product_aliases_alias_trgm ON product_aliases USING gin (alias gin_trgm_ops)`],
];

const run = async () => {
  for (const [label, sql] of STEPS) {
    await pool.query(sql);
    console.log(`  + ${label}`);
  }
  for (const [label, sql] of OPTIONAL) {
    try {
      await pool.query(sql);
      console.log(`  + ${label}`);
    } catch (e) {
      console.log(`  ~ ${label} skipped: ${e.message.split("\n")[0]} (matcher falls back to JS — not a problem)`);
    }
  }
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM product_aliases");
  console.log(`\nDone. product_aliases holds ${rows[0].n} alias(es).`);
  await pool.end();
};

run().catch((e) => { console.error("FATAL:", e.message); pool.end(); process.exit(1); });
