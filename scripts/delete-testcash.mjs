// DESTRUCTIVE (authorized): remove the round-10k test cluster so the ledger is a
// clean slate of real sales/refunds/PDC-clearances only. Transactional.
//   cashflow  #13 (rent expense out), #31 (owner injection), #32 (loan repayment),
//             #33 (PDC issued — double-count of rent)
//   owner_loans #1 (injection), #2 (repayment)
//   expenses  #1 (Store 1 Rent — placeholder "—" cheque)
//   cheques   #5 (payable placeholder that double-booked rent)
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const isBank = (s) => /bank transfer|online|cheque|card/i.test(s || "");
async function position() {
  const cf = (await pool.query(`select direction, amount, notes from cashflow`)).rows;
  const [cfg] = (await pool.query(`select opening_cash, opening_bank from settings limit 1`)).rows;
  let hand = Number(cfg?.opening_cash || 0), bank = Number(cfg?.opening_bank || 0);
  for (const r of cf) {
    const amt = Number(r.amount || 0) * (r.direction === "in" ? 1 : -1);
    if (isBank(r.notes)) bank += amt; else hand += amt;
  }
  return { hand: Number(hand.toFixed(2)), bank: Number(bank.toFixed(2)), rows: cf.length };
}

console.log("BEFORE:", await position());

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const r1 = await client.query(`delete from cashflow where id = any($1::int[])`, [[13, 31, 32, 33]]);
  const r2 = await client.query(`delete from owner_loans where id = any($1::int[])`, [[1, 2]]);
  const r3 = await client.query(`delete from cheques where id = any($1::int[])`, [[5]]);
  const r4 = await client.query(`delete from expenses where id = any($1::int[])`, [[1]]);
  await client.query("COMMIT");
  console.log(`deleted: cashflow=${r1.rowCount} owner_loans=${r2.rowCount} cheques=${r3.rowCount} expenses=${r4.rowCount}`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("ROLLBACK —", e.message);
  process.exitCode = 1;
} finally {
  client.release();
}

const after = await position();
console.log("AFTER:", after);
console.log(`hand>=0: ${after.hand >= 0}  bank>=0: ${after.bank >= 0}`);
await pool.end();
