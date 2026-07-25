// Adds off-system receipt-confirmation columns to documents (TR rows).
import "dotenv/config";
import pg from "pg";
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await p.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS confirm_method text`);
await p.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_receiver text`);
console.log("ok — confirm_method, external_receiver added");
await p.end();
