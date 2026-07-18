// Phase 7 — JWT auth migration (idempotent):
//  - users: username, password_hash, must_change_password, token_version,
//    failed_attempts, locked_until
//  - seed usernames from names + default password per user (bcrypt) —
//    mustChangePassword=true so first login forces a change
//  - ensure JWT_SECRET exists in .env
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
import fs from "fs";
import crypto from "crypto";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const stmts = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS username text UNIQUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz`,
];
for (const sql of stmts) {
  await pool.query(sql);
  console.log("OK:", sql.slice(0, 72));
}

// Seed usernames + default passwords for existing users without one.
const { rows: users } = await pool.query(`SELECT id, name, role, username FROM users WHERE active=true`);
const taken = new Set(users.map((u) => u.username).filter(Boolean));
const slug = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "user";
for (const u of users) {
  if (u.username) continue;
  let base = slug(u.name), uname = base, n = 1;
  while (taken.has(uname)) uname = `${base}${++n}`;
  taken.add(uname);
  // Default password (must change on first login). Documented in GO_LIVE_CHECKLIST.
  const defaultPw = `Mtc@2026-${u.id}`;
  const hash = bcrypt.hashSync(defaultPw, 10);
  await pool.query(
    `UPDATE users SET username=$1, password_hash=$2, must_change_password=true WHERE id=$3`,
    [uname, hash, u.id],
  );
  console.log(`user #${u.id} ${u.name} → username=${uname} defaultPw=${defaultPw}`);
}

// Ensure JWT_SECRET in .env
const envPath = ".env";
let env = fs.readFileSync(envPath, "utf8");
if (!/^JWT_SECRET=/m.test(env)) {
  const secret = crypto.randomBytes(48).toString("hex");
  env += `${env.endsWith("\n") ? "" : "\n"}JWT_SECRET=${secret}\nALLOW_DEV_HEADERS=1\n`;
  fs.writeFileSync(envPath, env);
  console.log("JWT_SECRET generated + ALLOW_DEV_HEADERS=1 (dev only — remove for production)");
} else {
  console.log("JWT_SECRET already present");
}
await pool.end();
console.log("DONE");
