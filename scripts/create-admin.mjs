// FIRST RUN — create the very first admin account from the terminal.
//
// The normal way is the setup screen: start the app, open it in a browser, and it
// walks you through creating the owner account. This script is the back door for
// when that is not possible:
//
//   - the browser screen cannot reach the server (headless box, no display)
//   - the setup was finished but the admin row was lost or deactivated
//   - you are restoring a backup onto a new machine and need a way back in
//
//   node scripts/create-admin.mjs                       # asks for everything
//   node scripts/create-admin.mjs shakil "Shakil Gazi"  # asks only for the password
//
// It REFUSES if an active admin already exists — after the first one, accounts are
// created by that admin from Settings, where every creation is attributable.
// Use scripts/force-password-reset.mjs if an admin exists but has lost the password.
//
// The password is typed, never passed as an argument: a password on the command line
// ends up in the shell history file in plain text.
import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import readline from "node:readline";
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase|neon|render|amazonaws|\.cloud/.test(process.env.DATABASE_URL || "") ? { rejectUnauthorized: false } : undefined,
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

// Typing a password with no echo. Falls back to a visible prompt where the terminal
// cannot be switched to raw mode (a pipe, some CI shells).
const CTRL_C = "\u0003";   // Ctrl-C
const BACKSPACE = "\u007f"; // DEL
const askSecret = (q) => new Promise((resolve) => {
  if (!process.stdin.isTTY) return rl.question(q, (a) => resolve(a.trim()));
  process.stdout.write(q);
  let buf = "";
  const cleanup = () => {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeListener("data", onData);
  };
  const onData = (chunk) => {
    const s = chunk.toString();
    if (s === "\n" || s === "\r") { cleanup(); process.stdout.write("\n"); resolve(buf); return; }
    if (s === CTRL_C) { cleanup(); process.stdout.write("\n"); process.exit(1); }
    if (s === BACKSPACE || s === "\b") { buf = buf.slice(0, -1); return; }
    buf += s;
  };
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onData);
});

// Same rules the app applies — kept in step with shared/password.ts and shared/setup.ts.
// This file is plain .mjs so it can run without a build step, so the rules are repeated
// rather than imported. If you change them there, change them here.
const WEAK_PASSWORDS = new Set([
  "test123", "test1234", "password", "password1", "passw0rd", "12345678", "123456789",
  "1234567890", "qwerty123", "11111111", "00000000", "abc12345", "admin123", "welcome1",
  "iloveyou", "letmein1", "changeme", "mtc12345",
]);
const passwordProblem = (p, username) => {
  if (String(p).length < 8) return "Password must be at least 8 characters.";
  if (WEAK_PASSWORDS.has(String(p).toLowerCase())) return "That password is too common — pick something harder to guess.";
  if (username && String(p).toLowerCase() === String(username).toLowerCase()) return "Password must be different from the username.";
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return "Password must include both letters and numbers.";
  return null;
};
const normalizeUsername = (raw) => String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
const usernameProblem = (u) => {
  if (!u) return "Choose a username — this is what you type to sign in.";
  if (u.length < 3) return "Username must be at least 3 characters.";
  if (u.length > 32) return "Username must be 32 characters or fewer.";
  return null;
};

const run = async () => {
  const admins = (await pool.query(`SELECT username, active FROM users WHERE role = 'admin'`)).rows;
  const activeAdmins = admins.filter((a) => a.active !== false);
  if (activeAdmins.length) {
    console.error(`An admin already exists (${activeAdmins.map((a) => a.username).join(", ")}).`);
    console.error("Create further accounts from Settings, signed in as that admin.");
    console.error(`If the password is lost: node scripts/force-password-reset.mjs ${activeAdmins[0].username}`);
    process.exit(1);
  }
  if (admins.length) {
    console.log(`Note: ${admins.length} deactivated admin account(s) exist. Creating a new active one.`);
  }

  let username = normalizeUsername(process.argv[2] || "");
  let name = process.argv[3] || "";

  while (usernameProblem(username)) {
    if (username) console.log("  " + usernameProblem(username));
    username = normalizeUsername(await ask("Username to sign in with: "));
  }
  while (!name.trim()) name = await ask("Full name: ");

  const clash = (await pool.query(`SELECT id FROM users WHERE username = $1`, [username])).rows;
  if (clash.length) { console.error(`Username "${username}" is already taken.`); process.exit(1); }

  const typedEmail = await ask("Email (optional, press Enter to skip): ");
  const email = typedEmail.toLowerCase() || null;

  let password = "";
  for (;;) {
    password = await askSecret("Password: ");
    const problem = passwordProblem(password, username);
    if (problem) { console.log("  " + problem); continue; }
    const again = await askSecret("Repeat password: ");
    if (again !== password) { console.log("  Passwords don't match."); continue; }
    break;
  }

  // A PIN nobody is told, plus must_change_pin: the new admin chooses their own the
  // first time they sign in. The PIN signs off discount approvals and is what
  // "Forgot password?" checks, so it must be theirs alone.
  const tempPin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");

  const { rows } = await pool.query(
    `INSERT INTO users (name, username, email, role, password_hash, pin_hash,
                        must_change_password, must_change_pin, token_version, active)
     VALUES ($1, $2, $3, 'admin', $4, $5, false, true, 0, true)
     RETURNING id, username`,
    [name.trim(), username, email, bcrypt.hashSync(password, 10), bcrypt.hashSync(tempPin, 10)],
  );

  console.log("\nAdmin account created.");
  console.log(`  Username: ${rows[0].username}`);
  console.log("  Sign in with that username — not the email — and the password you just set.");
  console.log("  You will be asked to choose your own 4-digit PIN on first login.");
};

run()
  .catch((e) => { console.error("FATAL:", e.message); process.exitCode = 1; })
  .finally(async () => { rl.close(); await pool.end(); });
