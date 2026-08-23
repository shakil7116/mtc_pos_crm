// Adds indexes on hot foreign-key / filter columns for high-load read performance.
// Idempotent (IF NOT EXISTS) and non-destructive — safe to run on any environment,
// including a fresh cloud database before go-live. Run: node scripts/add-performance-indexes.mjs
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase|neon|render|amazonaws|\.cloud/.test(process.env.DATABASE_URL || "") ? { rejectUnauthorized: false } : undefined,
});

// Column list mirrors the hottest joins/filters: profit calc, dashboard, reports,
// document detail, cheque register, inventory per store.
const INDEXES = [
  ["idx_document_items_document_id", "document_items", "(document_id)"],
  ["idx_document_items_product_id",  "document_items", "(product_id)"],
  ["idx_payments_document_id",       "payments",       "(document_id)"],
  ["idx_payments_customer_id",       "payments",       "(customer_id)"],
  ["idx_documents_customer_id",      "documents",      "(customer_id)"],
  ["idx_documents_store_id",         "documents",      "(store_id)"],
  ["idx_documents_type_status",      "documents",      "(type, status)"],
  ["idx_documents_date",             "documents",      "(date)"],
  ["idx_cheques_customer_id",        "cheques",        "(customer_id)"],
  ["idx_cheques_status",             "cheques",        "(status)"],
  ["idx_cashflow_store_id",          "cashflow",       "(store_id)"],
  ["idx_inventory_product_id",       "inventory",      "(product_id)"],
  ["idx_inventory_store_id",         "inventory",      "(store_id)"],
];

const run = async () => {
  let made = 0, skipped = 0;
  for (const [name, table, cols] of INDEXES) {
    try {
      const before = await pool.query(`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, [name]);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} ${cols}`);
      if (before.rows.length) { skipped++; console.log(`  = ${name} (already existed)`); }
      else { made++; console.log(`  + ${name} ON ${table} ${cols}`); }
    } catch (e) {
      console.log(`  ! ${name}: ${e.message.split("\n")[0]}`);
    }
  }
  console.log(`\nDone. Created ${made}, already-present ${skipped}, of ${INDEXES.length}.`);
  await pool.end();
};

run().catch((e) => { console.error("FATAL:", e.message); pool.end(); process.exit(1); });
