import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL;

// Hosted Postgres (Supabase / Neon / Render / RDS) requires SSL.
// rejectUnauthorized:false avoids self-signed-cert failures on the pooler.
const isHosted = /supabase\.com|neon\.tech|render\.com|amazonaws\.com|\.cloud/.test(dbUrl || "");

export const pool = new Pool({
  connectionString: dbUrl || "postgresql://localhost/mtcpos_placeholder",
  ssl: isHosted ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

export const db = drizzle(pool, { schema });

// Never let an idle-client error crash the process.
pool.on("error", (err: any) => {
  console.error("⚠️  DB pool error:", err.code || "", err.message);
});

if (!dbUrl) {
  console.error("\n⚠️  DATABASE_URL not set — running on the in-memory demo backend.");
  console.error("   Add DATABASE_URL to .env for permanent storage.\n");
}

/**
 * One-time startup probe with actionable, specific messages.
 * Returns true if the DB is reachable and authenticated.
 */
export async function checkDbConnection(): Promise<boolean> {
  if (!dbUrl) return false;
  try {
    await pool.query("select 1");
    console.log("✅ Database connected.");
    return true;
  } catch (err: any) {
    const code = err.code;
    if (code === "28P01") {
      console.error("❌ DB: password authentication failed. Check the password in DATABASE_URL");
      console.error("   (special characters must be URL-encoded; rotate it in Supabase if unsure).");
    } else if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      console.error("❌ DB: host not found. Check the host portion of DATABASE_URL.");
    } else if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENETUNREACH") {
      console.error("❌ DB: connection refused/timeout. If the host is db.<ref>.supabase.co,");
      console.error("   switch to the Session Pooler URL (aws-0-…pooler.supabase.com) in .env.");
    } else {
      console.error("❌ DB connection failed:", code || "", err.message);
    }
    return false;
  }
}
