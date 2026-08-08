import "dotenv/config";
import pg from "pg";

/* Idempotent migration — adds site-delivery proof/navigation columns to `documents`.
   Safe to run repeatedly (ADD COLUMN IF NOT EXISTS). */
const { Pool } = pg;
const dbUrl = process.env.DATABASE_URL;
const isHosted = /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(dbUrl || "");

const cols: [string, string][] = [
  ["map_link", "text"],
  ["receiver_name", "text"],
  ["receiver_phone", "text"],
  ["warehouse_signed_by", "integer"],
  ["warehouse_signed_at", "timestamp"],
  ["signed_dn_url", "text"],
  ["damage_reported", "boolean DEFAULT false"],
  ["damage_notes", "text"],
  ["damage_photo", "text"],
  ["damage_reported_at", "timestamp"],
];

async function main() {
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: dbUrl, ssl: isHosted ? { rejectUnauthorized: false } : undefined });
  for (const [name, type] of cols) {
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS ${name} ${type};`);
    console.log(`✓ documents.${name}`);
  }
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='documents' AND column_name = ANY($1)`,
    [cols.map((c) => c[0])],
  );
  console.log(`\nVerified ${rows.length}/${cols.length} columns present.`);
  await pool.end();
}

main().then(() => { console.log("Done."); process.exit(0); })
  .catch((e) => { console.error("Migration failed:", e); process.exit(1); });
