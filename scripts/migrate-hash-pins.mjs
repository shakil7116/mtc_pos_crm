// Scramble every PIN, then erase the plain ones. Idempotent — safe to re-run.
//
// WHY: a PIN authorises discounts AND, through "Forgot password?", lets someone
// set a new password on that account. It was stored as plain digits, so anyone
// who could read the database could take over any account. It is now bcrypt'd
// like a password.
//
// The old `pin` column is kept (nullable) but emptied, so nothing reads a plain
// PIN again and an old build cannot silently start working off stale values.
//
//   node scripts/migrate-hash-pins.mjs           # migrate
//   node scripts/migrate-hash-pins.mjs --check   # report only, writes nothing
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const checkOnly = process.argv.includes("--check");
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase|neon|render|amazonaws|\.cloud/.test(process.env.DATABASE_URL || "")
    ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash text`);
  // The plain column has to become nullable before it can be emptied.
  await pool.query(`ALTER TABLE users ALTER COLUMN pin DROP NOT NULL`);

  const { rows } = await pool.query(
    `SELECT id, name, username, pin, pin_hash FROM users ORDER BY id`,
  );

  const needHash = rows.filter((r) => r.pin && String(r.pin).trim() && !r.pin_hash);
  const stillPlain = rows.filter((r) => r.pin && String(r.pin).trim());
  const noPinAtAll = rows.filter((r) => !r.pin_hash && !(r.pin && String(r.pin).trim()));

  console.log(`${rows.length} account(s): ${rows.length - needHash.length - noPinAtAll.length} already scrambled, ` +
              `${needHash.length} to scramble, ${noPinAtAll.length} with no PIN at all.`);

  if (checkOnly) {
    console.log(`--check: nothing written. ${stillPlain.length} plain PIN(s) still on disk.`);
    await pool.end();
    process.exit(0);
  }

  for (const r of needHash) {
    await pool.query(`UPDATE users SET pin_hash = $1 WHERE id = $2`,
      [bcrypt.hashSync(String(r.pin).trim(), 10), r.id]);
    console.log(`  scrambled: ${r.username || r.name}`);
  }

  // Only erase a plain PIN once its scrambled copy is definitely stored — never
  // both in one statement, or a failure halfway leaves an account with no PIN.
  const cleared = await pool.query(
    `UPDATE users SET pin = NULL WHERE pin IS NOT NULL AND pin_hash IS NOT NULL`,
  );
  console.log(`Erased ${cleared.rowCount} plain PIN(s).`);

  const left = (await pool.query(
    `SELECT count(*)::int AS n FROM users WHERE pin IS NOT NULL AND trim(pin) <> ''`,
  )).rows[0].n;
  const missing = (await pool.query(
    `SELECT count(*)::int AS n FROM users WHERE pin_hash IS NULL AND active = true`,
  )).rows[0].n;

  console.log(`Plain PINs remaining: ${left} (want 0)`);
  if (missing) {
    console.log(`WARNING: ${missing} active account(s) have no PIN — they must set one before ` +
                `they can approve anything or use "Forgot password?".`);
  }
  if (left > 0) process.exitCode = 1;
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
}
await pool.end();
