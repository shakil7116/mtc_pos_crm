// Two columns for the second half of the loss work.
//
//   stock_losses.photo_url        — a broken pallet is worth a picture. A damage
//                                   entry with no photo is one person's word.
//   settings.stock_loss_alert_value — how much a single loss has to be worth
//                                   before the owner is told. Admin-editable,
//                                   because "big" is different in every business.
//
// Idempotent. Run: node scripts/migrate-loss-photo-and-alert.mjs
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
  ["stock_losses", "photo_url", "text"],
  ["settings", "stock_loss_alert_value", "numeric default '250'"],
];

let failed = false;
try {
  await client.connect();
  log("connected");
  for (const [table, col, type] of COLS) {
    const has = await client.query(
      "select count(*)::int n from information_schema.columns " +
      "where table_name = $1 and column_name = $2", [table, col]);
    if (has.rows[0].n > 0) { log(`${table}.${col} already exists.`); continue; }
    await client.query(`alter table ${table} add column ${col} ${type}`);
    log(`added ${table}.${col}`);
  }
  const s = await client.query("select stock_loss_alert_value v from settings limit 1");
  log("loss alert threshold: QAR " + (s.rows[0]?.v ?? "(no settings row yet)"));
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
