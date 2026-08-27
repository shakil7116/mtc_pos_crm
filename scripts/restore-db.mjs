// Restore a backup produced by scripts/backup-db.mjs.
//
// DRY RUN BY DEFAULT. It validates the whole plan and writes nothing unless you
// pass --confirm. A restore you have never rehearsed is not a restore plan.
//
//   node scripts/restore-db.mjs                          → newest backup, dry run
//   node scripts/restore-db.mjs --file backups/x.json.gz → a specific file, dry run
//   node scripts/restore-db.mjs --confirm                → ACTUALLY RESTORE
//   node scripts/restore-db.mjs --url postgres://…       → restore into a DIFFERENT
//                                                          database (rehearse safely)
//
// The restore is destructive: it TRUNCATEs every table present in the backup and
// reloads it. Schema (tables/columns) must already exist — recreate it with
// `npm run db:push` from shared/schema.ts, which lives in git.
import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import zlib from "zlib";

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const CONFIRM = has("--confirm");
const DIR = path.resolve(argOf("--dir", "backups"));
const TARGET = argOf("--url", process.env.DATABASE_URL);

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

let file = argOf("--file", null);
if (!file) {
  if (!fs.existsSync(DIR)) { console.error(`No backup directory at ${DIR}`); process.exit(1); }
  const found = fs.readdirSync(DIR).filter((f) => /^mtc-.*\.json\.gz$/.test(f)).sort().reverse();
  if (!found.length) { console.error(`No backups found in ${DIR}`); process.exit(1); }
  file = path.join(DIR, found[0]);
}
if (!TARGET) { console.error("No target database. Set DATABASE_URL or pass --url."); process.exit(1); }

// Undo the Buffer encoding the backup applied.
const reviver = (_k, v) =>
  (v && typeof v === "object" && typeof v.__buf === "string") ? Buffer.from(v.__buf, "base64") : v;

log(`reading ${path.relative(process.cwd(), file)}`);
const backup = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString(), reviver);
const { meta, data } = backup;
log(`backup taken ${meta.createdAt} from "${meta.database}" — ${meta.totalRows} rows, ${meta.tableOrder.length} tables`);

// Parents before children, so foreign keys hold at every step.
function fkOrder(tables, fks) {
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of fks) {
    if (deps.has(child) && deps.has(parent)) deps.get(child).add(parent);
  }
  const out = [], done = new Set();
  let guard = 0;
  while (out.length < tables.length && guard++ < tables.length + 5) {
    for (const t of tables) {
      if (done.has(t)) continue;
      if ([...deps.get(t)].every((p) => done.has(p))) { out.push(t); done.add(t); }
    }
  }
  // Anything left is in a dependency cycle — append it and let the caller know.
  const cyclic = tables.filter((t) => !done.has(t));
  return { order: [...out, ...cyclic], cyclic };
}

const { order, cyclic } = fkOrder(meta.tableOrder, meta.foreignKeys || []);

const client = new pg.Client({
  connectionString: TARGET,
  ssl: /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(TARGET)
    ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20_000,
  statement_timeout: 300_000,
});

let failed = false;
try {
  await client.connect();
  const who = await client.query("select current_database() d, current_user u");
  log(`target: "${who.rows[0].d}" as ${who.rows[0].u}`);

  // ── Validation (always runs, even on a real restore) ──
  const live = new Set((await client.query(`
    select c.relname n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' and c.relkind='r'`)).rows.map((r) => r.n));

  const missing = order.filter((t) => !live.has(t));
  const extra = [...live].filter((t) => !meta.tableOrder.includes(t));

  let colProblems = 0, liveRows = 0;
  for (const t of order) {
    if (!live.has(t)) continue;
    const cols = new Set((await client.query(`
      select column_name c from information_schema.columns
      where table_schema='public' and table_name=$1`, [t])).rows.map((r) => r.c));
    const backupCols = Object.keys(meta.columnTypes[t] || {});
    const gone = backupCols.filter((c) => !cols.has(c));
    if (gone.length) { colProblems++; log(`  COLUMN MISSING in ${t}: ${gone.join(", ")}`); }
    liveRows += Number((await client.query(`select count(*)::int n from "${t}"`)).rows[0].n);
  }

  console.log("");
  log("── validation ─────────────────────────────────────────");
  log(`tables in backup : ${order.length}`);
  log(`missing in target: ${missing.length}${missing.length ? " → " + missing.join(", ") : ""}`);
  log(`extra in target  : ${extra.length}${extra.length ? " → " + extra.join(", ") : " (will be left untouched)"}`);
  log(`column mismatches: ${colProblems}`);
  log(`FK cycles        : ${cyclic.length}${cyclic.length ? " → " + cyclic.join(", ") + " (inserted last)" : ""}`);
  log(`rows in target now: ${liveRows}  →  would become ${meta.totalRows}`);
  log(`sequences to reset: ${(meta.sequences || []).length}`);

  if (missing.length || colProblems) {
    throw new Error("Target schema does not match the backup. Run `npm run db:push` first.");
  }

  if (!CONFIRM) {
    console.log("");
    log("DRY RUN — nothing was written.");
    log("The plan above is valid. To execute it, re-run with --confirm.");
    log("Restore order (parents first): " + order.slice(0, 8).join(" → ") + (order.length > 8 ? " → …" : ""));
    await client.end();
    process.exit(0);
  }

  // ── Real restore ──
  console.log("");
  log("!! RESTORING — every table listed above will be TRUNCATED and reloaded !!");
  await client.query("begin");
  await client.query(`truncate ${order.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
  log("truncated");

  let written = 0;
  for (const t of order) {
    const rows = data[t] || [];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const quoted = cols.map((c) => `"${c}"`).join(", ");
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const params = [];
      const tuples = slice.map((r) => {
        const ph = cols.map((c) => { params.push(r[c]); return `$${params.length}`; });
        return `(${ph.join(", ")})`;
      });
      await client.query(`insert into "${t}" (${quoted}) values ${tuples.join(", ")}`, params);
    }
    written += rows.length;
    log(`  ${t}: ${rows.length}`);
  }

  for (const s of meta.sequences || []) {
    if (s.last_value === null || s.last_value === undefined) continue;
    await client.query(`select setval($1, $2, true)`, [`public.${s.name}`, String(s.last_value)]);
  }
  log(`reset ${(meta.sequences || []).filter((s) => s.last_value != null).length} sequences`);

  await client.query("commit");
  log(`restore complete — ${written} rows written.`);
} catch (e) {
  failed = true;
  await client.query("rollback").catch(() => {});
  log(`FAILED (rolled back): ${e.code || ""} ${e.message}`);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
