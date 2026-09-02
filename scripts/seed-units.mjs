// The complete unit list for a building-materials store.
//
// WHY: adding a product and not finding its unit is a dead end mid-job — the
// person either types a new spelling of one that already exists (PIECE beside
// PCS) or picks the wrong one. Both corrupt stock, and now also the pack-size
// conversion, which keys off the unit word.
//
// So the list is filled in ONCE, before go-live, with everything this trade
// sells by: count, packaging, length, area, volume, weight, and the job units a
// contracting company invoices with (trip, lump sum, hour, day).
//
// Rules: SHORT CODES, UPPERCASE, one spelling per unit. Codes stay under seven
// characters so they always fit the unit column on a printed invoice.
//
// SAFE: only touches the product_units list in settings. It never edits a
// product. An entry already in use by a product is never renamed or removed.
//
// Idempotent. Run: node scripts/seed-units.mjs
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, "..", ".env"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const log = (m) => console.log("[" + new Date().toISOString().slice(11, 19) + "] " + m);

// code → what it means, grouped the way a person thinks about it.
const UNITS = [
  // ── Counted ──
  ["PCS",    "Pieces"],
  ["SET",    "Set"],
  ["PAIR",   "Pair"],
  ["DOZ",    "Dozen"],
  // ── Packaging ──
  ["BAG",    "Bag — cement, plaster, grout"],
  ["BOX",    "Box"],
  ["CTN",    "Carton"],
  ["PKT",    "Packet"],
  ["BDL",    "Bundle — steel bars, ply, timber"],
  ["ROLL",   "Roll — membrane, mesh, tape"],
  ["COIL",   "Coil — wire, cable"],
  ["DRUM",   "Drum"],
  ["PAIL",   "Pail — paint, adhesive"],
  ["TIN",    "Tin"],
  ["TUBE",   "Tube — silicone, sealant"],
  ["CAN",    "Can — spray, solvent"],
  ["CRATE",  "Crate — tiles, glass"],
  ["PALLET", "Pallet"],
  ["SHEET",  "Sheet — ply, gypsum, MDF"],
  // ── Length ──
  ["MTR",    "Metre"],
  ["RM",     "Running metre — skirting, profile, pipe"],
  ["LEN",    "Length — a full bar or pipe as supplied"],
  ["FT",     "Foot"],
  ["RFT",    "Running foot"],
  // ── Area ──
  ["SQM",    "Square metre — tile, marble, cladding"],
  ["SQFT",   "Square foot"],
  // ── Volume ──
  ["CUM",    "Cubic metre — sand, aggregate, ready-mix"],
  ["CFT",    "Cubic foot"],
  ["LTR",    "Litre"],
  ["GAL",    "Gallon"],
  // ── Weight ──
  ["KG",     "Kilogram"],
  ["TON",    "Tonne — steel, aggregate"],
  // ── How a job is billed ──
  ["TRIP",   "Trip — a truck load of sand or aggregate"],
  ["LOT",    "Lot — a job lot, sold as one"],
  ["LS",     "Lump sum — labour or a whole job"],
  ["HR",     "Hour — labour, equipment"],
  ["DAY",    "Day — equipment hire"],
];

// Entries worth replacing: a long word where a code belongs, a lowercase entry
// that will never match what the product form saves (it uppercases), or a second
// spelling of a unit already in the list.
const REPLACE = {
  "GALLON": "GAL",
  "length": "LEN",
  "sheet":  "SHEET",
  "nos":    "PCS",
  "PIECE":  "PCS",
  "NOS":    "PCS",
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

  const before = await client.query(
    "select id, value from managed_lists where list_key = 'product_units' order by id");
  log(`list has ${before.rows.length}: ${before.rows.map((r) => r.value).join(", ") || "(empty)"}`);

  // What the products actually use — an entry in use is never touched.
  const used = await client.query(
    "select distinct upper(trim(unit)) u from products where unit is not null");
  const inUse = new Set(used.rows.map((r) => r.u));
  log(`products use: ${[...inUse].join(", ")}`);

  const have = new Map(before.rows.map((r) => [String(r.value).toUpperCase(), r]));

  // 1. Tidy the entries that would collide with what the form saves.
  let fixed = 0, skipped = 0;
  for (const row of before.rows) {
    const raw = String(row.value);
    const target = REPLACE[raw];
    if (!target) continue;
    if (inUse.has(raw.toUpperCase())) {
      log(`kept "${raw}" — ${used.rows.length && inUse.has(raw.toUpperCase()) ? "products use it" : ""}`);
      skipped++;
      continue;
    }
    if (have.has(target)) {
      await client.query("delete from managed_lists where id = $1", [row.id]);
      log(`removed "${raw}" — ${target} already covers it`);
    } else {
      await client.query("update managed_lists set value = $1 where id = $2", [target, row.id]);
      have.set(target, { ...row, value: target });
      log(`"${raw}" → "${target}"`);
    }
    have.delete(raw.toUpperCase());
    fixed++;
  }

  // 2. Fill in everything missing, in the order above so the dropdown reads well.
  let added = 0;
  let sort = 0;
  for (const [code, meaning] of UNITS) {
    sort += 10;
    if (have.has(code)) continue;
    await client.query(
      "insert into managed_lists (list_key, value, meta, sort_order, active) values ($1,$2,$3,$4,true)",
      ["product_units", code, JSON.stringify({ meaning }), sort]);
    added++;
  }

  // 3. Anything a product uses that still is not offered would be an invisible
  //    unit — add it rather than leave a product with a unit nobody can pick.
  let rescued = 0;
  const after1 = await client.query(
    "select value from managed_lists where list_key = 'product_units'");
  const offered = new Set(after1.rows.map((r) => String(r.value).toUpperCase()));
  for (const u of inUse) {
    if (!u || offered.has(u)) continue;
    sort += 10;
    await client.query(
      "insert into managed_lists (list_key, value, meta, sort_order, active) values ($1,$2,$3,$4,true)",
      ["product_units", u, JSON.stringify({ meaning: "In use on a product" }), sort]);
    log(`added "${u}" — products use it but it was not on the list`);
    rescued++;
  }

  const after = await client.query(
    "select value from managed_lists where list_key = 'product_units' order by sort_order, id");
  log("");
  log(`tidied ${fixed}, added ${added}, rescued ${rescued}, kept ${skipped}`);
  log(`list now has ${after.rows.length}:`);
  log("  " + after.rows.map((r) => r.value).join("  ·  "));
} catch (e) {
  failed = true;
  log("FAILED: " + (e.code || "") + " " + e.message);
} finally {
  await client.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
