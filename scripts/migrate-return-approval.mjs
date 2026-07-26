// Adds the return-approval threshold to settings (returns OVER this need a manager).
import "dotenv/config";
import pg from "pg";
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await p.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS return_approval_threshold numeric DEFAULT 1000`);
await p.query(`UPDATE settings SET return_approval_threshold = 1000 WHERE return_approval_threshold IS NULL`);
console.log("ok — return_approval_threshold ready (default 1000)");
await p.end();
