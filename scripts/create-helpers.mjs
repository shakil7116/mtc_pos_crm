import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase|neon|render|amazonaws/.test(process.env.DATABASE_URL || "")
    ? { rejectUnauthorized: false } : undefined,
});

const hash = bcrypt.hashSync("test123", 10);

const newUsers = [
  { name: "Store1 Helper A", username: "store1.helper1", role: "helper", storeId: 1 },
  { name: "Store1 Helper B", username: "store1.helper2", role: "helper", storeId: 1 },
  { name: "Store2 Helper A", username: "store2.helper1", role: "helper", storeId: 2 },
  { name: "Store2 Helper B", username: "store2.helper2", role: "helper", storeId: 2 },
];

for (const u of newUsers) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, pin, role, store_id, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username, role, store_id`,
      [u.name, u.username, hash, "1234", u.role, u.storeId]
    );
    if (rows.length > 0) {
      console.log(`Created: ${rows[0].username} (${rows[0].role}) store=${rows[0].store_id} id=${rows[0].id}`);
    } else {
      console.log(`Already exists: ${u.username}`);
    }
  } catch (err) {
    console.error(`Error ${u.username}:`, err.message);
  }
}

await pool.end();
console.log("\nAll new users → password: test123, pin: 1234");
