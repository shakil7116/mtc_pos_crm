// Adds the store detail columns and the recycle bin to `stores`.
//
// WHY: a location used to be a name and an address. A store is a real place —
// it has a phone, a CR number, opening hours, a map pin the driver taps. Those
// now live on the location instead of in someone's head.
//
// And deleting: an admin can now remove any store or warehouse, but the row is
// HIDDEN, not erased, so a mistake can be undone for one day (shared/undo.ts).
// A location with history is never erased at all — invoices point at it.
//
// Every column is nullable, so nothing existing changes.
// Idempotent. Run: node scripts/migrate-store-details.mjs
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
  ["code", "text"],
  ["phone", "text"],
  ["email", "text"],
  ["cr_number", "text"],
  ["tax_number", "text"],
  ["opening_hours", "text"],
  ["map_url", "text"],
  ["notes", "text"],
  ["created_at", "timestamp default now()"],
  ["deleted_at", "timestamp"],
  ["deleted_by", "integer"],
  ["delete_batch", "text"],
];

let failed = false;
try {
  await client.connect();
  log("connected");
  for (const [col, type] of COLS) {
    const has = await client.query(
      "select count(*)::int n from information_schema.columns " +
      "where table_name = 'stores' and column_name = $1", [col]);
    if (has.rows[0].n > 0) { log(`${col} already exists.`); continue; }
    await client.query(`alter table stores add column ${col} ${type}`);
    log(`added stores.${col}`);
  }
  // Hidden locations are read on every page load — keep that lookup cheap.
  await client.query(
    "create index if not exists stores_deleted_at_idx on stores (deleted_at)");
  log("index stores_deleted_at_idx ready");

  const s = await client.query(
    "select type, count(*)::int n, count(deleted_at)::int hidden from stores group by type");
  for (const r of s.rows) log(`${r.type}: ${r.n} (${r.hidden} hidden)`);
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
