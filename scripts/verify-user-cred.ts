// Verifies admin credential management: temp password + forced change, username
// uniqueness, and last-admin protection. Leaves store2.salesman WITHOUT a password
// so the owner sets their own via the new Settings → Users → Login dialog.
import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { updateUser } from "../server/storage";
import { adminResetPassword, verifyUserPassword } from "../server/auth";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const S2 = 58, ADMIN = 1;

(async () => {
  // 1. Admin sets a temp password → hash stored, forced change flagged
  await adminResetPassword(S2, "Temp@1234");
  ok(await verifyUserPassword(S2, "Temp@1234"), "temp password verifies");
  ok(!(await verifyUserPassword(S2, "wrongpass")), "wrong password rejected");
  const [u1] = await db.select().from(users).where(eq(users.id, S2));
  ok(u1.mustChangePassword === true, "mustChangePassword forced true after reset");

  // 2. Password length rule
  let threw = false;
  try { await adminResetPassword(S2, "short"); } catch { threw = true; }
  ok(threw, "password under 8 chars rejected");

  // 3. Username uniqueness
  threw = false;
  try { await updateUser(S2, { username: "shakil" } as any); } catch (e: any) { threw = /already taken/.test(e.message); }
  ok(threw, "duplicate username rejected");

  // 4. Username change lowercases + stores
  await updateUser(S2, { username: "STORE2.SALESMAN" } as any);
  const [u2] = await db.select().from(users).where(eq(users.id, S2));
  ok(u2.username === "store2.salesman", `username stored lowercase = ${u2.username}`);

  // 5. Last-admin protection — cannot disable/demote the only admin
  threw = false;
  try { await updateUser(ADMIN, { active: false } as any); } catch (e: any) { threw = /last active admin/.test(e.message); }
  ok(threw, "cannot disable the last active admin");
  threw = false;
  try { await updateUser(ADMIN, { role: "salesman" } as any); } catch (e: any) { threw = /last active admin/.test(e.message); }
  ok(threw, "cannot demote the last active admin");

  // Revert store2 → no password (owner sets their own in the UI)
  await db.update(users).set({ passwordHash: null, mustChangePassword: true }).where(eq(users.id, S2));
  const [u3] = await db.select().from(users).where(eq(users.id, S2));
  ok(!u3.passwordHash, "store2.salesman reverted to no password (owner will set it)");

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
