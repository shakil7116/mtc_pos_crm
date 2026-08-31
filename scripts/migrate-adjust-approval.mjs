// One column: settings.stock_adjust_approval_value.
//
// WHY: taking stock off by hand is the most dangerous action in the system —
// it destroys value with one number and a note. Above this amount it stops
// being a change and becomes a request in the approvals inbox, so a second
// person has to agree. Admin-editable, because "big" differs per business.
//
// Idempotent. Run: node scripts/migrate-adjust-approval.mjs
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
  const has = await client.query(
    "select count(*)::int n from information_schema.columns " +
    "where table_name = 'settings' and column_name = 'stock_adjust_approval_value'");
  if (has.rows[0].n > 0) {
    log("stock_adjust_approval_value already exists.");
  } else {
    await client.query("alter table settings add column stock_adjust_approval_value numeric default '1000'");
    log("added settings.stock_adjust_approval_value");
  }
  const s = await client.query("select stock_adjust_approval_value v from settings limit 1");
  log("hand removals need a second person above QAR " + (s.rows[0]?.v ?? "(no settings row yet)"));
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
