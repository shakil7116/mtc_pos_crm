// One spelling per unit, written the way the trade writes it.
//
// TWO CHANGES:
//
//  1. PIECE → PCS on the products still using it. They are the same unit, and
//     two spellings of one unit break more than they look: stock grouped by unit
//     splits in two, and a pack size ("1 BOX = 12 PCS") converts nothing for a
//     product measured in PIECE. Six products now, four thousand later.
//
//  2. LEN → LENGTH and BDL → BUNDLE in the list. Every other code on the list is
//     what the trade actually writes — SQM, CUM, RFT, TON, TRIP, LS. Those two
//     were abbreviations I invented, and an invented code is not a standard.
//
// Historical invoice lines are NOT touched. A document is a record of what was
// printed on the day; rewriting the unit on a past invoice would falsify it.
//
// Idempotent. Run: node scripts/merge-unit-pieces.mjs
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, "..", ".env"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const log = (m) => console.log("[" + new Date().toISOString().slice(11, 19) + "] " + m);

const client = new pg.Client({
  connectionString: url,
  ssl: /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(url)
    ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15000,
  statement_timeout: 60000,
});

// old spelling → the one that stays
const MERGE = { "PIECE": "PCS", "PIECES": "PCS", "NOS": "PCS", "NO": "PCS" };
// list entry → what the trade actually writes
const RENAME = { "LEN": "LENGTH", "BDL": "BUNDLE" };

let failed = false;
try {
  await client.connect();
  log("connected");

  // ── 1. Products ──
  for (const [from, to] of Object.entries(MERGE)) {
    const hit = await client.query(
      "select id, name from products where upper(trim(unit)) = $1", [from]);
    if (!hit.rows.length) continue;
    await client.query(
      "update products set unit = $1 where upper(trim(unit)) = $2", [to, from]);
    log(`${hit.rows.length} product(s): ${from} → ${to}`);
    for (const r of hit.rows) log(`    ${r.name}`);
  }

  // ── 2. The list ──
  for (const [from, to] of Object.entries(RENAME)) {
    const exists = await client.query(
      "select id from managed_lists where list_key = 'product_units' and upper(value) = $1", [to]);
    if (exists.rows.length) {
      await client.query(
        "delete from managed_lists where list_key = 'product_units' and upper(value) = $1", [from]);
    } else {
      const r = await client.query(
        "update managed_lists set value = $1 where list_key = 'product_units' and upper(value) = $2",
        [to, from]);
      if (r.rowCount) log(`list: ${from} → ${to}`);
    }
  }
  for (const from of Object.keys(MERGE)) {
    const still = await client.query(
      "select count(*)::int n from products where upper(trim(unit)) = $1", [from]);
    if (still.rows[0].n > 0) { log(`!! ${still.rows[0].n} product(s) still on ${from}`); continue; }
    const r = await client.query(
      "delete from managed_lists where list_key = 'product_units' and upper(value) = $1", [from]);
    if (r.rowCount) log(`list: removed ${from}`);
  }

  // ── 3. Prove it ──
  const units = await client.query(
    "select value from managed_lists where list_key = 'product_units' order by sort_order, id");
  const onProducts = await client.query(
    "select upper(trim(unit)) u, count(*)::int n from products where unit is not null group by 1 order by 2 desc");
  const offered = new Set(units.rows.map((r) => String(r.value).toUpperCase()));
  const orphans = onProducts.rows.filter((r) => !offered.has(r.u));

  log("");
  log(`${units.rows.length} units offered:`);
  log("  " + units.rows.map((r) => r.value).join("  ·  "));
  log(`units in use on products: ${onProducts.rows.map((r) => `${r.u}(${r.n})`).join(", ")}`);
  log(orphans.length
    ? `!! in use but NOT offered: ${orphans.map((r) => r.u).join(", ")}`
    : "every unit in use is on the list");
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
