// Idempotent migration for Agents 1-3:
//  - payment confirmation fields (phone, bank_name)
//  - return approval flow (return_items.product_id, returns.submitted_by/rejection_reason)
//  - PO lifecycle (supplier_orders payment terms + receipt/due dates, default status draft)
//  - supplier_returns, notifications, cashflow tables
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const stmts = [
  // Agent 1 — payment confirmation fields
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS phone text`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_name text`,

  // Agent 2 — return approval
  `ALTER TABLE return_items ADD COLUMN IF NOT EXISTS product_id integer REFERENCES products(id)`,
  `ALTER TABLE returns ADD COLUMN IF NOT EXISTS submitted_by integer REFERENCES users(id)`,
  `ALTER TABLE returns ADD COLUMN IF NOT EXISTS rejection_reason text`,
  // new returns default to pending (approval required)
  `ALTER TABLE returns ALTER COLUMN status SET DEFAULT 'pending'`,

  // Agent 3 — PO lifecycle
  `ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS payment_terms_days integer DEFAULT 0`,
  `ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS receipt_date date`,
  `ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS payment_due_date date`,
  `ALTER TABLE supplier_orders ALTER COLUMN status SET DEFAULT 'draft'`,

  // supplier_returns
  `CREATE TABLE IF NOT EXISTS supplier_returns (
     id serial PRIMARY KEY,
     po_id integer REFERENCES supplier_orders(id),
     supplier_id integer REFERENCES suppliers(id),
     store_id integer REFERENCES stores(id),
     return_type text NOT NULL,
     status text NOT NULL DEFAULT 'pending_confirmation',
     items jsonb NOT NULL DEFAULT '[]',
     total numeric DEFAULT '0',
     refund_amount numeric,
     refund_received_at timestamptz,
     notes text,
     created_by integer REFERENCES users(id),
     created_at timestamptz DEFAULT now()
   )`,

  // notifications
  `CREATE TABLE IF NOT EXISTS notifications (
     id serial PRIMARY KEY,
     target_role text,
     target_user_id integer REFERENCES users(id),
     type text NOT NULL,
     title text NOT NULL,
     message text,
     link text,
     entity_type text,
     entity_id integer,
     is_read boolean DEFAULT false,
     created_by integer REFERENCES users(id),
     created_at timestamptz DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (is_read, target_role)`,

  // cashflow
  `CREATE TABLE IF NOT EXISTS cashflow (
     id serial PRIMARY KEY,
     direction text NOT NULL,
     category text NOT NULL,
     amount numeric NOT NULL,
     ref_type text,
     ref_id integer,
     store_id integer REFERENCES stores(id),
     notes text,
     date date NOT NULL,
     created_by integer REFERENCES users(id),
     created_at timestamptz DEFAULT now()
   )`,

  // searchable payment ledger (disputes/audit)
  `CREATE INDEX IF NOT EXISTS payments_reference_idx ON payments (reference)`,
  `CREATE INDEX IF NOT EXISTS payments_phone_idx ON payments (phone)`,
  `CREATE INDEX IF NOT EXISTS cheques_number_idx ON cheques (cheque_number)`,
];

let ok = 0;
for (const sql of stmts) {
  try {
    await pool.query(sql);
    ok++;
    console.log("OK:", sql.slice(0, 68).replace(/\s+/g, " "));
  } catch (e) {
    console.error("FAIL:", sql.slice(0, 68).replace(/\s+/g, " "), "→", e.message);
  }
}
console.log(`\n${ok}/${stmts.length} statements applied.`);
await pool.end();
