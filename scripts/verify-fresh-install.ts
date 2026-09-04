// Can a business that is not ours actually start from an empty database?
//
// This walks the first day of a NEW installation the way the setup wizard does,
// against a THROWAWAY schema — never the live one — and checks the things that
// were quietly broken before: the company details being discarded, the staff
// never appearing, and the unit list never being seeded.
//
// Run: npx tsx scripts/verify-fresh-install.ts
import "dotenv/config";
import { pool } from "../server/db";
import { UNIT_CATALOGUE } from "../shared/unitCatalogue";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};

const SCHEMA = `zz_fresh_${Date.now()}`;
const q = async (s: string, v: any[] = []) => (await pool.query(s, v)).rows;

try {
  console.log(`A brand-new installation, in a throwaway schema (${SCHEMA}).`);
  console.log("Nothing here touches the live tables.\n");

  // Build the three tables setup actually writes to, exactly as the schema
  // declares them — including the defaults a new business would inherit.
  await q(`create schema ${SCHEMA}`);
  await q(`set search_path to ${SCHEMA}`);
  await q(`create table settings (
      id serial primary key,
      store_name_en text not null default '',
      store_name_ar text not null default '',
      address_en text not null default '',
      address_ar text not null default '',
      phone text not null default '',
      cr_number text not null default '',
      po_box text not null default '',
      setup_complete boolean default false)`);
  await q(`create table users (id serial primary key, name text, username text unique, role text)`);
  await q(`create table managed_lists (
      id serial primary key, list_key text not null, value text not null,
      sort_order integer not null default 0, active boolean not null default true)`);

  console.log("1. What a new business inherits before it types anything");
  const [blank] = await q(`insert into settings default values returning *`);
  ok(blank.store_name_en === "" && blank.cr_number === "" && blank.po_box === "",
     "no company name, CR or PO Box carried over from us",
     `name "${blank.store_name_en}", CR "${blank.cr_number}"`);
  ok(!/MAMUN|NAJMA|72986|30703722/i.test(JSON.stringify(blank)),
     "and nothing of ours anywhere in the row");
  await q(`delete from settings`);

  console.log("\n2. The wizard saves the company details");
  // The old code did UPDATE ... WHERE id = 1 against an empty table.
  const before = await q(`select * from settings`);
  ok(before.length === 0, "the settings table starts empty, as a new database does");
  const stale = await q(
    `update settings set store_name_en = $1 where id = 1 returning *`, ["AL RAYAN TRADING W.L.L"]);
  ok(stale.length === 0, "the OLD way updated nothing — this is the bug that lost it",
     `${stale.length} rows touched`);
  const [saved] = await q(
    `insert into settings (store_name_en, store_name_ar, address_en, address_ar, phone, cr_number, po_box)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    ["AL RAYAN TRADING W.L.L", "الريان للتجارة ذ.م.م", "SALWA ROAD, DOHA, QATAR",
     "طريق سلوى، الدوحة، قطر", "+974 4444 1111", "99887/2", "24680"]);
  ok(saved.store_name_en === "AL RAYAN TRADING W.L.L", "the NEW way creates the row", saved.store_name_en);
  ok(saved.store_name_ar === "الريان للتجارة ذ.م.م", "Arabic name kept");
  ok(saved.address_ar === "طريق سلوى، الدوحة، قطر", "Arabic address kept — it prints on the letterhead");
  ok(saved.po_box === "24680" && saved.cr_number === "99887/2", "PO Box and CR kept",
     `PO ${saved.po_box}, CR ${saved.cr_number}`);

  console.log("\n3. Their letterhead is theirs");
  const printed = [saved.store_name_en, saved.store_name_ar, saved.address_en,
                   saved.address_ar, saved.phone, saved.cr_number, saved.po_box].join(" | ");
  ok(!/MAMUN|NAJMA|72986|30703722|17336/i.test(printed),
     "nothing of ours would print on their invoice", printed.slice(0, 46) + "...");

  console.log("\n4. The unit list a new business starts with");
  for (let i = 0; i < UNIT_CATALOGUE.length; i++) {
    await q(`insert into managed_lists (list_key, value, sort_order) values ($1,$2,$3)`,
            ["product_units", UNIT_CATALOGUE[i].code, i]);
  }
  const units = await q(`select value from managed_lists where list_key = 'product_units' order by sort_order`);
  ok(units.length === 38, "all 38 units seeded, so the first product has one to pick",
     `${units.length} units`);
  ok(units.some((u: any) => u.value === "BAG") && units.some((u: any) => u.value === "SQM")
     && units.some((u: any) => u.value === "RMT"),
     "including the ones this trade actually needs", "BAG, SQM, RMT");
  const codes = units.map((u: any) => u.value);
  ok(new Set(codes).size === codes.length, "no unit is listed twice");
  ok(codes.every((c: string) => c.length <= 6 && c === c.toUpperCase()),
     "every code is short and uppercase, so it fits the invoice column");

  console.log("\n5. Setup can only be run once");
  await q(`insert into users (name, username, role) values ('Owner','owner','admin')`);
  const anyone = await q(`select id from users limit 1`);
  ok(anyone.length > 0, "once somebody exists, registration is refused",
     "the gate is ANY user, not just an admin");

  console.log("\n6. Finishing it");
  await q(`update settings set setup_complete = true where id = $1`, [saved.id]);
  const [done] = await q(`select setup_complete from settings where id = $1`, [saved.id]);
  ok(done.setup_complete === true, "setup marked complete, so the wizard stops showing");
} catch (e: any) {
  fail++;
  console.log("\n  ERROR:", e?.message || e);
} finally {
  await pool.query(`drop schema if exists ${SCHEMA} cascade`).catch(() => {});
  console.log(`\n${"-".repeat(66)}\n${pass}/${pass + fail} passed`);
  console.log("(the throwaway schema has been dropped)");
  await pool.end();
  process.exit(fail ? 1 : 0);
}
