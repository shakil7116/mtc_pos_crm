// Adds the pricing-approval audit column to documents (who approved a salesman's
// discount / price change).
import "dotenv/config";
import pg from "pg";
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await p.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS pricing_approved_by integer`);
console.log("ok — pricing_approved_by ready");
await p.end();
