// DATABASE_URL points at a LIVE Supabase instance holding real customers, real
// stock and real money. Tests must never reach it. Removing the variable means
// even an accidental query falls back to the localhost placeholder in
// server/db.ts and fails fast, instead of touching production.
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "test";
