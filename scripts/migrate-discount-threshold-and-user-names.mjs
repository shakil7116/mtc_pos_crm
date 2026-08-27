// Two go-live changes:
//
// 1. settings.discount_approval_threshold — how much a salesman may discount
//    without a manager PIN. Default QAR 100. Change it in Settings.
//
// 2. Rename staff accounts so the store is obvious: "Store Manager" tells you
//    nothing when there are two stores; "Store 1 Manager" does. Built from the
//    user's role and assigned store, with A/B when several share both.
//    Admin is left alone — admin is universal, not tied to a store.
//
// Dry run by default. Nothing is written without --apply.
//   node scripts/migrate-discount-threshold-and-user-names.mjs
//   node scripts/migrate-discount-threshold-and-user-names.mjs --apply
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const log = (m) => console.log("[" + new Date().toISOString().slice(11, 19) + "] " + m);

const ROLE_LABEL = {
  manager: "Manager",
  salesman: "Salesman",
  worker: "Worker",
  driver: "Driver",
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

  // ── 1. the setting ──
  const has = await client.query(
    "select count(*)::int n from information_schema.columns " +
    "where table_name = 'settings' and column_name = 'discount_approval_threshold'");
  if (has.rows[0].n > 0) {
    log("settings.discount_approval_threshold already exists.");
  } else if (APPLY) {
    await client.query(
      "alter table settings add column discount_approval_threshold numeric default '100'");
    log("added settings.discount_approval_threshold (default QAR 100)");
  } else {
    log("WOULD ADD settings.discount_approval_threshold (default QAR 100)");
  }

  // ── 2. the names ──
  const users = (await client.query(
    "select u.id, u.name, u.username, u.role, u.store_id, s.name_en as store " +
    "from users u left join stores s on s.id = u.store_id " +
    "where u.role <> 'admin' order by u.store_id nulls last, u.role, u.id")).rows;

  // "Store 1 — Najma Street…" -> "Store 1".  Anything else keeps its own name.
  const shortStore = (name, id) => {
    if (!name) return null;
    const m = String(name).match(/^\s*Store\s*(\d+)/i);
    return m ? `Store ${m[1]}` : String(name).split("—")[0].trim() || `Store ${id}`;
  };

  // Count how many share the same store+role, so duplicates get A / B.
  const groups = new Map();
  for (const u of users) {
    const key = `${u.store_id ?? "none"}|${u.role}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const seen = new Map();

  const changes = [];
  for (const u of users) {
    const roleLabel = ROLE_LABEL[u.role] || u.role;
    const key = `${u.store_id ?? "none"}|${u.role}`;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    const suffix = groups.get(key) > 1 ? " " + String.fromCharCode(64 + n) : "";

    const store = u.store_id ? shortStore(u.store, u.store_id) : null;
    const proposed = store ? `${store} ${roleLabel}${suffix}` : `${roleLabel}${suffix}`;

    if (proposed !== u.name) changes.push({ id: u.id, username: u.username, from: u.name, to: proposed });
  }

  if (!changes.length) {
    log("All staff names already say which store they belong to.");
  } else {
    log(changes.length + " name(s) to change:");
    for (const c of changes) {
      log("   " + String(c.id).padStart(3) + "  " + String(c.username || "").padEnd(20) +
          '"' + c.from + '"  ->  "' + c.to + '"');
    }
    if (APPLY) {
      await client.query("begin");
      for (const c of changes) {
        await client.query("update users set name = $1 where id = $2", [c.to, c.id]);
      }
      await client.query("commit");
      log("names applied.");
    }
  }

  // ── warnings worth seeing before go-live ──
  const noStore = (await client.query(
    "select id, name, username, role from users where store_id is null and role <> 'admin'")).rows;
  if (noStore.length) {
    log("");
    log("NOTE: these are not assigned to any store, so they are not store-scoped:");
    for (const u of noStore) log("   " + u.username + " (" + u.role + ")");
  }

  const mgrs = (await client.query(
    "select store_id, count(*)::int n from users where role = 'manager' and active group by store_id")).rows;
  const stores = (await client.query("select id, name_en from stores where type = 'store' order by id")).rows;
  const covered = new Set(mgrs.map((m) => m.store_id));
  const missing = stores.filter((s) => !covered.has(s.id));
  if (missing.length) {
    log("");
    log("NOTE: no manager assigned to: " + missing.map((s) => shortStore(s.name_en, s.id)).join(", "));
    log("      Create one in Settings > Users if that store needs its own manager.");
  }

  const dupPins = (await client.query(
    "select pin, count(*)::int n from users where active group by pin having count(*) > 1")).rows;
  if (dupPins.length) {
    log("");
    log("WARNING: PIN(s) shared by more than one user: " +
        dupPins.map((d) => d.pin + " x" + d.n).join(", "));
    log("         A PIN approves discounts. Shared PINs mean you cannot tell who approved what.");
  }

  if (!APPLY) {
    log("");
    log("DRY RUN — nothing written. Re-run with --apply.");
  }
} catch (e) {
  failed = true;
  await client.query("rollback").catch(() => {});
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
