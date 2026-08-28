// Clears test data so the system can go live with real records.
//
// DRY RUN BY DEFAULT. It shows exactly what would go and writes nothing until you
// pass --confirm. It takes a full backup first, every time, and refuses to proceed
// if that backup fails.
//
// Groups — pick what you want gone:
//   --transactions   invoices, payments, cheques, cashflow, returns, stock moves,
//                    supplier orders, expenses, loans, tasks, notifications, logs
//   --stock          inventory quantities (products themselves are kept)
//   --people         customers and suppliers
//   --catalogue      products, aliases AND their inventory
//   --users          every staff account except admins
//   --counters       restart document numbering (INV-1, QT-1, …)
//   --all            everything above
//
// ALWAYS KEPT: admin accounts, stores, settings, managed lists, custom field
// definitions, module definitions.
//
//   node scripts/wipe-test-data.mjs --all
//   node scripts/wipe-test-data.mjs --all --confirm
import pg from "pg";
import dotenv from "dotenv";
import { execFileSync } from "child_process";
dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const CONFIRM = has("--confirm");
const ALL = has("--all");

const want = {
  transactions: ALL || has("--transactions"),
  stock: ALL || has("--stock"),
  people: ALL || has("--people"),
  catalogue: ALL || has("--catalogue"),
  users: ALL || has("--users"),
  counters: ALL || has("--counters"),
};

if (!Object.values(want).some(Boolean)) {
  console.error("Nothing selected. Pass --all, or one of --transactions --stock --people --catalogue --users --counters");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const log = (m) => console.log("[" + new Date().toISOString().slice(11, 19) + "] " + m);

// Everything that records trading activity. Order does not matter here — the
// deletion is sorted by foreign keys below.
const TRANSACTION_TABLES = [
  "document_items", "documents", "payments", "cheques", "cashflow",
  "return_items", "returns", "stock_adjustments", "notifications",
  "approval_requests", "edit_log", "corrections", "numbering_audit",
  "arrangement_corrections", "arrangement_note_items", "arrangement_notes",
  "supplier_returns", "supplier_payments", "supplier_orders",
  "owner_loans", "expenses", "warehouse_issues", "damage_claims",
  "tasks", "messages", "messages_log", "staff_payroll", "custom_records",
  "conversations",
];
const STOCK_TABLES = ["inventory"];
const PEOPLE_TABLES = ["customers", "suppliers"];
const CATALOGUE_TABLES = ["product_aliases", "products"];

const client = new pg.Client({
  connectionString: url,
  ssl: /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(url)
    ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20000,
  statement_timeout: 300000,
});

let failed = false;
try {
  await client.connect();
  log("connected");

  const live = new Set((await client.query(`
    select c.relname n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'`)).rows.map((r) => r.n));

  // Build the target list from the chosen groups.
  let targets = [];
  if (want.transactions) targets.push(...TRANSACTION_TABLES);
  if (want.stock || want.catalogue) targets.push(...STOCK_TABLES);
  if (want.people) targets.push(...PEOPLE_TABLES);
  if (want.catalogue) targets.push(...CATALOGUE_TABLES);
  targets = [...new Set(targets)].filter((t) => live.has(t));

  // Children before parents, so no foreign key is ever left dangling.
  const fks = (await client.query(`
    select tc.table_name as child, ccu.table_name as parent
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`)).rows
    .filter((r) => r.child !== r.parent);

  const order = [];
  const done = new Set();
  let guard = 0;
  while (order.length < targets.length && guard++ < targets.length + 5) {
    for (const t of targets) {
      if (done.has(t)) continue;
      // Safe to delete once nothing still-pending points AT it.
      const blockers = fks.filter((f) => f.parent === t && targets.includes(f.child) && !done.has(f.child));
      if (!blockers.length) { order.push(t); done.add(t); }
    }
  }
  for (const t of targets) if (!done.has(t)) order.push(t); // cycles go last

  // ── report ──
  console.log("");
  log("WOULD DELETE");
  let total = 0;
  for (const t of order) {
    const n = (await client.query(`select count(*)::int n from "${t}"`)).rows[0].n;
    total += n;
    if (n) log("   " + String(n).padStart(6) + "  " + t);
  }

  let staff = [];
  if (want.users) {
    staff = (await client.query(
      "select id, name, username, role from users where role <> 'admin' order by id")).rows;
    if (staff.length) {
      log("   " + String(staff.length).padStart(6) + "  users (non-admin)");
      for (const u of staff) log("            - " + String(u.username || "(no username)").padEnd(20) + u.role + "  " + u.name);
    }
    const admins = (await client.query("select username, name from users where role = 'admin'")).rows;
    log("   KEEPING admin: " + admins.map((a) => a.username || a.name).join(", "));
  }

  if (want.counters) {
    const c = (await client.query("select type, next_number from document_counters order by type")).rows;
    log("   RESET numbering: " + c.map((x) => `${x.type}@${x.next_number}`).join(", "));
  }

  log("");
  log("ALWAYS KEPT: admin accounts, stores, settings, managed lists, field/module definitions");
  log(`total rows to delete: ${total}${staff.length ? " + " + staff.length + " users" : ""}`);

  if (!CONFIRM) {
    console.log("");
    log("DRY RUN — nothing was written.");
    log("Re-run with --confirm to do it. A backup is taken first automatically.");
    await client.end();
    process.exit(0);
  }

  // ── backup first, always ──
  console.log("");
  log("taking a backup before deleting anything…");
  try {
    execFileSync(process.execPath, ["scripts/backup-db.mjs"], { stdio: "inherit" });
  } catch {
    throw new Error("Backup failed — refusing to delete anything. Fix the backup first.");
  }

  // ── wipe ──
  console.log("");
  await client.query("begin");
  for (const t of order) {
    const r = await client.query(`delete from "${t}"`);
    if (r.rowCount) log("   deleted " + String(r.rowCount).padStart(6) + "  " + t);
  }
  if (want.users) {
    const r = await client.query("delete from users where role <> 'admin'");
    log("   deleted " + String(r.rowCount).padStart(6) + "  users (non-admin)");
  }
  if (want.counters) {
    await client.query("update document_counters set next_number = 1");
    log("   numbering restarted at 1");
  }
  await client.query("commit");

  log("");
  log("done. The system is ready for real data.");
  if (want.users) log("Every username is free again — create your real staff in Settings > Users.");
} catch (e) {
  failed = true;
  await client.query("rollback").catch(() => {});
  log("FAILED (nothing was deleted): " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
