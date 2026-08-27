// Full logical backup of the MTC POS database to a single compressed file.
//
// WHY THIS EXISTS: Supabase's own retention is the only other copy of this
// business's entire financial record. This gives you a copy you control.
//
// No pg_dump required — this machine has no PostgreSQL client tools installed.
// It uses the `pg` driver the app already depends on.
//
// Reads only. Never writes to the database.
//
//   node scripts/backup-db.mjs              → backups/mtc-<timestamp>.json.gz
//   node scripts/backup-db.mjs --keep 30    → keep the newest 30, delete older
//   node scripts/backup-db.mjs --out D:/bk  → write somewhere else (a USB stick,
//                                             another drive — off-machine is better)
import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const KEEP = Number(argOf("--keep", 14));
const OUT_DIR = path.resolve(argOf("--out", "backups"));

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const human = (n) => n < 1024 ? `${n} B`
  : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;

// Buffers (bytea) must survive the JSON round-trip; pg gives us Buffer objects.
const replacer = (_k, v) =>
  (v && v.type === "Buffer" && Array.isArray(v.data))
    ? { __buf: Buffer.from(v.data).toString("base64") } : v;

const client = new pg.Client({
  connectionString: url,
  ssl: /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(url)
    ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20_000,
  statement_timeout: 300_000,
});

let failed = false;
try {
  log("connecting…");
  await client.connect();
  log("connected");

  // Tables, and the FK graph so a restore can insert parents before children.
  const tables = (await client.query(`
    select c.relname as name from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname`)).rows.map((r) => r.name);

  const fks = (await client.query(`
    select tc.table_name as child, ccu.table_name as parent
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`)).rows
    .filter((r) => r.child !== r.parent);   // self-references cannot be ordered away

  const columns = (await client.query(`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public' order by table_name, ordinal_position`)).rows;

  const colTypes = {};
  for (const c of columns) (colTypes[c.table_name] ||= {})[c.column_name] = c.data_type;

  // Sequence positions. Without these a restore resets every id counter to 1 and
  // new inserts collide with restored rows. document_counters is an ordinary table
  // so its data is already covered; these are the serial-column sequences.
  const sequences = (await client.query(`
    select sequencename as name, last_value from pg_sequences
    where schemaname = 'public' order by sequencename`)).rows;

  log(`${tables.length} tables, ${fks.length} foreign keys, ${sequences.length} sequences`);

  const data = {};
  const counts = {};
  let total = 0;
  for (const t of tables) {
    const rows = (await client.query(`select * from "${t}"`)).rows;
    data[t] = rows;
    counts[t] = rows.length;
    total += rows.length;
  }
  log(`read ${total} rows`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const payload = {
    meta: {
      createdAt: new Date().toISOString(),
      database: (await client.query("select current_database() d")).rows[0].d,
      generator: "scripts/backup-db.mjs",
      formatVersion: 1,
      tableOrder: tables,          // alphabetical; restore re-sorts by FK depth
      foreignKeys: fks,
      columnTypes: colTypes,
      sequences,
      rowCounts: counts,
      totalRows: total,
    },
    data,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `mtc-${stamp}.json.gz`);
  const json = JSON.stringify(payload, replacer);
  await pipeline(Readable.from([json]), zlib.createGzip({ level: 9 }), fs.createWriteStream(file));

  const size = fs.statSync(file).size;
  log(`wrote ${path.relative(process.cwd(), file)} — ${human(size)} (${human(Buffer.byteLength(json))} uncompressed)`);

  // A backup you have not read back is not a backup. Verify before trusting it.
  log("verifying…");
  const round = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString());
  let mismatch = 0;
  for (const t of tables) {
    if ((round.data[t] || []).length !== counts[t]) {
      mismatch++; log(`  MISMATCH ${t}: ${counts[t]} written, ${(round.data[t] || []).length} read back`);
    }
  }
  if (mismatch) throw new Error(`${mismatch} table(s) failed verification`);
  const seqBack = (round.meta.sequences || []).length;
  if (seqBack !== sequences.length) throw new Error("sequence metadata did not survive the round trip");
  log(`verified: all ${tables.length} tables, ${round.meta.totalRows} rows, ${seqBack} sequence positions read back intact`);

  // Rotation.
  const existing = fs.readdirSync(OUT_DIR)
    .filter((f) => /^mtc-.*\.json\.gz$/.test(f)).sort().reverse();
  const stale = existing.slice(KEEP);
  for (const f of stale) fs.unlinkSync(path.join(OUT_DIR, f));
  log(`retention: ${Math.min(existing.length, KEEP)} kept${stale.length ? `, ${stale.length} old removed` : ""}`);

  const biggest = Object.entries(counts).filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  log(`largest tables: ${biggest.map(([t, n]) => `${t}(${n})`).join(", ")}`);
  log("backup complete.");
} catch (e) {
  failed = true;
  log(`FAILED: ${e.code || ""} ${e.message}`);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
