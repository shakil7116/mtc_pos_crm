// Adds the customer collectability columns.
//
// WHY: after eleven years of trust-based trading some balances will never be
// collected. Counting all of it as an asset overstates what the business is worth.
// This lets each customer be marked normal / doubtful / written_off so the
// receivables figure can say "QAR 500,000, plus 400,000 unlikely" instead of one
// confident number that is not true.
//
// Everyone defaults to "normal" — nothing changes until someone is marked.
// Idempotent. Run: node scripts/migrate-collectability.mjs
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
  ["collectability", "text not null default 'normal'"],
  ["collectability_note", "text"],
  ["collectability_at", "timestamp"],
  ["collectability_by", "integer references users(id)"],
];

let failed = false;
try {
  await client.connect();
  log("connected");
  for (const [col, type] of COLS) {
    const has = await client.query(
      "select count(*)::int n from information_schema.columns " +
      "where table_name = 'customers' and column_name = $1", [col]);
    if (has.rows[0].n > 0) { log(`${col} already exists.`); continue; }
    await client.query(`alter table customers add column ${col} ${type}`);
    log(`added customers.${col}`);
  }
  const s = await client.query(
    "select collectability, count(*)::int n from customers group by collectability");
  log("customers by collectability: " +
      (s.rows.length ? s.rows.map((r) => `${r.collectability}=${r.n}`).join(", ") : "none yet"));
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
