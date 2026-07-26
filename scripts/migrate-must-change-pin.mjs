// Adds must_change_pin to users and forces every active staff member to set a
// fresh, unique PIN on next login (closes weak/shared default PINs).
import "dotenv/config";
import pg from "pg";
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_pin boolean DEFAULT false`);
const r = await p.query(`UPDATE users SET must_change_pin = true WHERE active = true`);
console.log(`ok — must_change_pin ready; flagged ${r.rowCount} active users for reset`);
await p.end();
