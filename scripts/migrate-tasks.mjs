// Creates the tasks table (manager → staff workflow).
import "dotenv/config";
import pg from "pg";
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await p.query(`
  CREATE TABLE IF NOT EXISTS tasks (
    id serial PRIMARY KEY,
    title text NOT NULL,
    note text,
    assigned_to integer NOT NULL,
    assigned_by integer,
    store_id integer,
    due_date date,
    status text NOT NULL DEFAULT 'open',
    completed_at timestamp,
    created_at timestamp DEFAULT now()
  )
`);
console.log("ok — tasks table ready");
await p.end();
