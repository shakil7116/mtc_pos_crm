// Idempotent Phase 4 migration:
//  - Settings 11A business rules (pdc_threshold, void_window_hours, credit_terms, pdc_alert_days, maintenance_cheque_threshold)
//  - payments.account_number (online transfer sender account/IBAN)
//  - cheques: supplier_id, document_id, type, who, deposited/bounced dates (full PDC tracker)
//  - warehouse_issues + expenses tables
//  - seed default expense categories into managed_lists (skip if present)
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const stmts = [
  // Settings 11A
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pdc_threshold numeric DEFAULT '4000'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS void_window_hours integer DEFAULT 12`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS credit_terms integer[] DEFAULT '{30,60,90}'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pdc_alert_days integer DEFAULT 3`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS maintenance_cheque_threshold numeric DEFAULT '10000'`,

  // Payments
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS account_number text`,
  `CREATE INDEX IF NOT EXISTS payments_account_idx ON payments (account_number)`,

  // Cheques → full PDC tracker
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS supplier_id integer REFERENCES suppliers(id)`,
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS document_id integer REFERENCES documents(id)`,
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'receivable'`,
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS who text`,
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS deposited_date date`,
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS bounced_date date`,

  // Warehouse issues (Module 6 scaffold for expense traceability)
  `CREATE TABLE IF NOT EXISTS warehouse_issues (
     id serial PRIMARY KEY,
     store_id integer REFERENCES stores(id),
     description text NOT NULL,
     urgency text NOT NULL DEFAULT 'normal',
     status text NOT NULL DEFAULT 'open',
     is_manager_override boolean DEFAULT false,
     reported_by integer REFERENCES users(id),
     resolved_at timestamptz,
     created_at timestamptz DEFAULT now()
   )`,

  // Expenses (Module 5)
  `CREATE TABLE IF NOT EXISTS expenses (
     id serial PRIMARY KEY,
     category text NOT NULL,
     amount numeric NOT NULL,
     date date NOT NULL,
     payment_method text NOT NULL DEFAULT 'Cash',
     store_id integer REFERENCES stores(id),
     notes text,
     attachment_url text,
     is_recurring boolean DEFAULT false,
     frequency text,
     next_due_date date,
     linked_issue_id integer REFERENCES warehouse_issues(id),
     custom_data jsonb DEFAULT '{}',
     created_by integer REFERENCES users(id),
     created_at timestamptz DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (date)`,
  `CREATE INDEX IF NOT EXISTS expenses_category_idx ON expenses (category)`,
];

let ok = 0;
for (const sql of stmts) {
  try {
    await pool.query(sql);
    ok++;
    console.log("OK:", sql.slice(0, 70).replace(/\s+/g, " "));
  } catch (e) {
    console.error("FAIL:", sql.slice(0, 70).replace(/\s+/g, " "), "→", e.message);
  }
}

// Seed default expense categories (spec Module 5) — skip existing
const DEFAULTS = [
  "Store 1 Rent", "Store 2 Rent", "Warehouse 1 Rent", "Warehouse 2 Rent", "Warehouse 3 Rent",
  "Staff Salaries", "Daily Staff Meals", "Medical / Insurance", "Software / Subscriptions",
  "Maintenance", "Other",
];
const { rows: existing } = await pool.query(
  `SELECT value FROM managed_lists WHERE list_key='expense_categories'`,
);
const have = new Set(existing.map((r) => r.value));
let seeded = 0;
for (let i = 0; i < DEFAULTS.length; i++) {
  if (have.has(DEFAULTS[i])) continue;
  await pool.query(
    `INSERT INTO managed_lists (list_key, value, sort_order, active) VALUES ('expense_categories', $1, $2, true)`,
    [DEFAULTS[i], i],
  );
  seeded++;
}
console.log(`\nSeeded ${seeded} expense categories (had ${have.size}).`);
console.log(`${ok}/${stmts.length} statements applied.`);
await pool.end();
