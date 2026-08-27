// Rewrites legacy role names in the users table to the five current roles.
//
// WHY: shared/permissions.ts normalizeRole() already translates these at runtime,
// so nothing is broken today. But the stored values are stale, which means:
//   - the Settings user list shows role names that no longer exist
//   - any future query that filters on role directly (without normalizing) misses them
//   - a new developer reading the table gets a wrong picture of the role model
//
// Mapping (identical to normalizeRole in shared/permissions.ts):
//   staff                                  -> salesman
//   helper, salesman_helper                -> worker
//   warehouse, warehouse_manager           -> worker
//
// Changes nothing else. Idempotent — safe to re-run.
//   node scripts/migrate-normalize-roles.mjs           (dry run, shows what would change)
//   node scripts/migrate-normalize-roles.mjs --apply   (writes)
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const log = (m) => console.log("[" + new Date().toISOString().slice(11, 19) + "] " + m);

const MAP = {
  staff: "salesman",
  helper: "worker",
  salesman_helper: "worker",
  warehouse: "worker",
  warehouse_manager: "worker",
};

const client = new pg.Client({
  connectionString: url,
  ssl: /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(url)
    ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15000,
  statement_timeout: 60000,
});

let failed = false;
try {
  await client.connect();
  log("connected");

  const stale = (await client.query(
    "select id, name, username, role from users where role = any($1) order by id",
    [Object.keys(MAP)])).rows;

  if (!stale.length) {
    log("No legacy roles found — nothing to do.");
  } else {
    log(stale.length + " user(s) carry a legacy role:");
    for (const u of stale) {
      log("   " + String(u.id).padStart(3) + "  " + (u.username || u.name) +
          "   " + u.role + "  ->  " + MAP[u.role]);
    }

    if (!APPLY) {
      log("");
      log("DRY RUN — nothing written. Re-run with --apply to make the change.");
    } else {
      await client.query("begin");
      for (const [from, to] of Object.entries(MAP)) {
        await client.query("update users set role = $1 where role = $2", [to, from]);
      }
      await client.query("commit");
      log("applied.");
    }
  }

  const after = (await client.query(
    "select role, count(*)::int n from users group by role order by n desc")).rows;
  log("");
  log("roles now in the table:");
  for (const r of after) log("   " + String(r.n).padStart(3) + "  " + r.role);
} catch (e) {
  failed = true;
  await client.query("rollback").catch(() => {});
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
