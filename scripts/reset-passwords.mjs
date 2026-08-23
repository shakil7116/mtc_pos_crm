import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase|neon|render|amazonaws/.test(process.env.DATABASE_URL || "")
    ? { rejectUnauthorized: false } : undefined,
});

const newPw = "test123";
const hash = bcrypt.hashSync(newPw, 10);

const { rows } = await pool.query(`SELECT id, name, username, role FROM users WHERE active=true`);
for (const u of rows) {
  await pool.query(
    `UPDATE users SET password_hash=$1, must_change_password=false, token_version=token_version+1 WHERE id=$2`,
    [hash, u.id]
  );
  console.log(`Reset: ${u.username} (${u.role}) -> password="${newPw}"`);
}

await pool.end();
console.log("\nAll passwords reset to:", newPw);
