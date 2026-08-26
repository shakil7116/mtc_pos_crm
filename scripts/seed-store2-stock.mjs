// Opening stock for Store 2, which was left holding only three seed items while
// the whole CSV import landed in Store 1 — so Store 2 staff saw almost nothing
// to sell. Quantities below are SETUP figures, not a real count: correct them
// with a Stock Adjustment once the shelves are counted.
//
//   Run:  node scripts/seed-store2-stock.mjs
//   Undo: node scripts/seed-store2-stock.mjs --undo
import 'dotenv/config';
import pg from 'pg';

const STORE_ID = 2;
const REASON = 'Store 2 opening stock (setup)';
const PLAN = [
  [1, 40], [2, 20], [3, 60], [14, 15], [19, 40], [20, 80], [47, 20], [49, 25],
  [53, 60], [59, 40], [61, 30], [65, 20], [67, 100], [69, 80], [70, 25],
];

const undo = process.argv.includes('--undo');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

if (undo) {
  const { rows } = await c.query(
    `select product_id, sum(qty_change::numeric) q from stock_adjustments
     where store_id=$1 and reason=$2 group by product_id`, [STORE_ID, REASON]);
  for (const r of rows) {
    await c.query(`update inventory set qty = (qty::numeric - $1)::text, updated_at = now()
                   where product_id=$2 and store_id=$3`, [r.q, r.product_id, STORE_ID]);
  }
  await c.query(`delete from stock_adjustments where store_id=$1 and reason=$2`, [STORE_ID, REASON]);
  console.log(`Reversed ${rows.length} product(s) at Store ${STORE_ID}.`);
  await c.end();
  process.exit(0);
}

for (const [productId, qty] of PLAN) {
  const p = (await c.query('select name, unit from products where id=$1 and active', [productId])).rows[0];
  if (!p) { console.log(`skip ${productId} — no such active product`); continue; }
  const existing = (await c.query('select qty from inventory where product_id=$1 and store_id=$2', [productId, STORE_ID])).rows[0];
  const before = Number(existing?.qty || 0);
  if (existing) {
    await c.query(`update inventory set qty=$1, updated_at=now() where product_id=$2 and store_id=$3`,
      [String(before + qty), productId, STORE_ID]);
  } else {
    await c.query(`insert into inventory (product_id, store_id, qty, updated_at) values ($1,$2,$3,now())`,
      [productId, STORE_ID, String(qty)]);
  }
  await c.query(
    `insert into stock_adjustments (product_id, store_id, qty_change, type, reason, user_id, created_at)
     values ($1,$2,$3,'add',$4,1,now())`, [productId, STORE_ID, String(qty), REASON]);
  console.log(`+${String(qty).padStart(4)} ${(p.unit || 'PCS').padEnd(6)} ${p.name.padEnd(46)} ${before} -> ${before + qty}`);
}
console.log(`\nDone. Undo with: node scripts/seed-store2-stock.mjs --undo`);
await c.end();
