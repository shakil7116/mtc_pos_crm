// GO-LIVE SECURITY STEP — run this once when you switch from testing to real use.
// It forces EVERY active user to set a new strong password on their next login
// (the shared `test123` stops working as a permanent password). It does NOT change
// anyone's current password by itself — it flips the `must_change_password` flag and
// invalidates existing sessions, so the next login lands on the forced-change screen.
//
//   node scripts/force-password-reset.mjs            # force everyone
//   node scripts/force-password-reset.mjs shakil     # force just one username
//
// After this, each user logs in with their current password once, is required to set
// a strong one (>=8 chars, letters+numbers, not a common/weak password), and that new
// password is theirs alone.
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /supabase|neon|render|amazonaws|\.cloud/.test(process.env.DATABASE_URL || "") ? { rejectUnauthorized: false } : undefined });

const onlyUser = process.argv[2];

const run = async () => {
  const where = onlyUser ? "WHERE username = $1 AND active = true" : "WHERE active = true";
  const args = onlyUser ? [onlyUser] : [];
  const rows = (await pool.query(`SELECT id, username, role FROM users ${where}`, args)).rows;
  if (!rows.length) { console.log(onlyUser ? `No active user "${onlyUser}".` : "No active users."); await pool.end(); return; }
  await pool.query(
    `UPDATE users SET must_change_password = true, token_version = token_version + 1 ${where}`,
    args,
  );
  console.log(`Forced password change on ${rows.length} user(s); all existing sessions invalidated:`);
  rows.forEach((r) => console.log(`  - ${r.username} (${r.role})`));
  console.log("\nEach will be required to set a strong new password on next login.");
  await pool.end();
};
run().catch((e) => { console.error("FATAL:", e.message); pool.end(); process.exit(1); });
