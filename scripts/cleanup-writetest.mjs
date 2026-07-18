// Clean up leftovers from a failed verify-write-cycle run: the __WRITETEST__
// customer's invoice(s), their stock deduction, and the throwaway admin.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const docs = (await pool.query(`select id, number, store_id from documents where customer_name='__WRITETEST__'`)).rows;
console.log("leftover test invoices:", docs.map(d => d.number).join(", ") || "none");

for (const d of docs) {
  await pool.query(`delete from cashflow where ref_type='payment' and ref_id in (select id from payments where document_id=$1)`, [d.id]);
  await pool.query(`delete from cashflow where ref_type in ('invoice','document') and ref_id=$1`, [d.id]);
  await pool.query(`delete from payments where document_id=$1`, [d.id]);
  // restore stock: qty is NUMERIC — subtract the (negative) sale qty_change back out
  const adjs = (await pool.query(`select product_id, store_id, coalesce(sum(qty_change::numeric),0) s from stock_adjustments where reference_id=$1 and type='sale' group by product_id, store_id`, [d.id])).rows;
  for (const a of adjs) {
    await pool.query(`update inventory set qty = qty - $1 where product_id=$2 and store_id=$3`, [Number(a.s), a.product_id, a.store_id]);
    console.log(`restored stock: product ${a.product_id} store ${a.store_id} += ${-Number(a.s)}`);
  }
  await pool.query(`delete from stock_adjustments where reference_id=$1`, [d.id]);
  await pool.query(`delete from edit_log where document_id=$1`, [d.id]);
  await pool.query(`delete from document_items where document_id=$1`, [d.id]);
  await pool.query(`delete from documents where id=$1`, [d.id]);
  console.log(`removed ${d.number}`);
}
const c = await pool.query(`delete from customers where name='__WRITETEST__'`);
const u = await pool.query(`delete from users where username like '__write%' or username like '__verify%' or username like '__smoke%' or username like '__cheq%'`);
console.log(`deleted customers=${c.rowCount}, throwaway admins=${u.rowCount}`);

// verify clean
const left = (await pool.query(`select count(*)::int n from documents where customer_name='__WRITETEST__'`)).rows[0].n;
const leftC = (await pool.query(`select count(*)::int n from customers where name='__WRITETEST__'`)).rows[0].n;
console.log(`AFTER: test invoices=${left}, test customers=${leftC}`);
await pool.end();
