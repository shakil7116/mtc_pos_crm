// Adds the customer behaviour-tier config columns to the settings table.
// Idempotent: ADD COLUMN IF NOT EXISTS. Run once against the live DB.
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const cols = [
  ["tier_window_months", "integer", "6"],
  ["tier_best_pct", "numeric", "10"],
  ["tier_better_pct", "numeric", "30"],
  ["tier_default_term_days", "integer", "30"],
  ["tier_bad_overdue_days", "integer", "60"],
  ["tier_bad_late_count", "integer", "2"],
];

const run = async () => {
  for (const [name, type, def] of cols) {
    await pool.query(
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS ${name} ${type} DEFAULT ${def}`,
    );
    console.log(`✓ settings.${name} ${type} default ${def}`);
  }
  const { rows } = await pool.query(
    `SELECT tier_window_months, tier_best_pct, tier_better_pct, tier_default_term_days, tier_bad_overdue_days, tier_bad_late_count FROM settings LIMIT 1`,
  );
  console.table(rows);
  await pool.end();
};

run().catch((e) => {
  console.error("migration failed:", e.message);
  process.exit(1);
});
