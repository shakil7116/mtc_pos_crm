// Step 1 — Document Numbering: add format config to document_counters +
// numbering_audit table. Idempotent, additive, non-destructive.
import "dotenv/config";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });

const DDL = `
ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS prefix text;
ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS digits integer DEFAULT 0;
ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS separator text DEFAULT '-';
UPDATE document_counters SET prefix = type WHERE prefix IS NULL;
UPDATE document_counters SET separator = '-' WHERE separator IS NULL;
UPDATE document_counters SET digits = 0 WHERE digits IS NULL;

CREATE TABLE IF NOT EXISTS numbering_audit (
  id SERIAL PRIMARY KEY,
  doc_type TEXT NOT NULL,
  old_next INTEGER,
  new_next INTEGER,
  skipped JSONB DEFAULT '[]'::jsonb,
  reason TEXT,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_numbering_audit_type ON numbering_audit(doc_type);
`;

async function main() {
  const c = await pool.connect();
  try {
    await c.query(DDL);
    const { rows } = await c.query("SELECT type, next_number, prefix, digits, separator FROM document_counters ORDER BY type");
    console.log("document_counters:", rows);
    console.log("✅ Numbering migration complete.");
  } finally { c.release(); await pool.end(); }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
