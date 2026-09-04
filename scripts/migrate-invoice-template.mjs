// The invoice template becomes a COMPANY setting.
//
// It was living in each browser's localStorage, so two people printing the same
// invoice could get two different papers, and a new phone reset to Blue. A
// company has one house style; it belongs beside the company name.
//
// Idempotent and additive: adds one column with a safe default. Nothing is read,
// changed or deleted. Run: node scripts/migrate-invoice-template.mjs
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, "..", ".env"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  const before = await pool.query(
    `select column_name from information_schema.columns
     where table_name = 'settings' and column_name = 'invoice_template'`);
  if (before.rowCount) {
    console.log("Already there — nothing to do.");
  } else {
    await pool.query(
      `alter table settings add column invoice_template text not null default 'paper-blue'`);
    console.log("Added settings.invoice_template (default 'paper-blue').");
  }
  const [row] = (await pool.query(`select invoice_template from settings limit 1`)).rows;
  console.log("Your company prints on:", row?.invoice_template ?? "(no settings row yet)");
} catch (e) {
  console.error("Failed:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
