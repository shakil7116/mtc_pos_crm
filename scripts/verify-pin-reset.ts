// Verifies forced-PIN-reset rules: non-trivial, unique, right length. Restores the
// two test users' PINs + reset flags afterward.
import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { changeOwnPin } from "../server/storage";

const A = 2, B = 3;
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const throws = async (fn: () => Promise<any>, needle: string) => {
  try { await fn(); return false; } catch (e: any) { return new RegExp(needle, "i").test(e.message); }
};

(async () => {
  const [a0] = await db.select().from(users).where(eq(users.id, A));
  const [b0] = await db.select().from(users).where(eq(users.id, B));

  ok(await throws(() => changeOwnPin(A, "12"), "4 to 6"), "too-short PIN rejected");
  ok(await throws(() => changeOwnPin(A, "1234"), "obvious"), "sequence 1234 rejected");
  ok(await throws(() => changeOwnPin(A, "1111"), "obvious"), "all-same 1111 rejected");

  // A valid unique PIN is accepted
  await changeOwnPin(A, "8642");
  const [aAfter] = await db.select().from(users).where(eq(users.id, A));
  ok(aAfter.pin === "8642" && aAfter.mustChangePin === false, "valid unique PIN set + flag cleared");

  // Another user cannot reuse it
  ok(await throws(() => changeOwnPin(B, "8642"), "already used"), "duplicate PIN rejected");

  // Restore
  await db.update(users).set({ pin: a0.pin, mustChangePin: a0.mustChangePin }).where(eq(users.id, A));
  await db.update(users).set({ pin: b0.pin, mustChangePin: b0.mustChangePin }).where(eq(users.id, B));
  console.log(`\n${pass}/${pass + fail} passed (test users restored)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
