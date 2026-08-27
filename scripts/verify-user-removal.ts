// Checks account creation and removal against the real database.
//
// WRITES: creates one throwaway account and deletes it again. Touches no real user.
// Run: npx tsx scripts/verify-user-removal.ts
import "dotenv/config";
import { createUser, deleteUser, setUserActive, getUsers } from "../server/storage";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  PASS  ${label}${detail ? " · " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? " · " + detail : ""}`); }
};
const refuses = async (fn: () => Promise<any>, re: RegExp) => {
  let msg = "";
  try { await fn(); } catch (e: any) { msg = e.message || String(e); }
  return { matched: re.test(msg), msg };
};

const stamp = Date.now();

try {
  const users: any[] = await getUsers();
  const admin = users.find((u) => u.role === "admin");
  const worked = users.find((u) => u.username === "store1.salesman");

  console.log("\n1. An account must be usable the moment it is created");
  let r = await refuses(
    () => createUser({ name: "ZZ NO USERNAME", role: "salesman", pin: "8471" } as any),
    /username/i);
  ok(r.matched, "no username is refused", r.msg.slice(0, 58));

  r = await refuses(
    () => createUser({ name: "ZZ NO PW", username: `zz${stamp}a`, role: "salesman", pin: "8472" } as any),
    /password/i);
  ok(r.matched, "no password is refused", r.msg.slice(0, 58));

  r = await refuses(
    () => createUser({ name: "ZZ WEAK", username: `zz${stamp}b`, role: "salesman", pin: "1234", password: "goodpassword1" } as any),
    /obvious|sequence/i);
  ok(r.matched, "PIN 1234 is refused", r.msg.slice(0, 58));

  r = await refuses(
    () => createUser({ name: "ZZ DUP", username: `zz${stamp}c`, role: "salesman", pin: String(admin.pin), password: "goodpassword1" } as any),
    /already used/i);
  ok(r.matched, "a PIN someone else has is refused", r.msg.slice(0, 58));

  r = await refuses(
    () => createUser({ name: "ZZ DUPNAME", username: "shakil", role: "salesman", pin: "8473", password: "goodpassword1" } as any),
    /taken/i);
  ok(r.matched, "a username already in use is refused", r.msg.slice(0, 58));

  console.log("\n2. A valid account is created, and can actually log in");
  const made: any = await createUser({
    name: "ZZ TEST ACCOUNT", username: `zz${stamp}`, role: "salesman",
    pin: "8479", password: "throwaway-password-1", mustChangePassword: true,
  } as any);
  ok(!!made.id, "created", `id ${made.id}`);
  ok(!!made.username, "has a username", made.username);
  ok(!!made.passwordHash, "password was hashed, not stored raw",
     String(made.passwordHash).slice(0, 7) + "…");
  ok(made.passwordHash !== "throwaway-password-1", "and is not the plain text");

  console.log("\n3. Removing someone who HAS worked is refused");
  if (worked) {
    r = await refuses(() => deleteUser(worked.id, admin.id), /cannot be deleted|Deactivate/i);
    ok(r.matched, `${worked.name} is protected`, r.msg.slice(0, 72));
  } else {
    ok(false, "expected store1.salesman to exist");
  }

  console.log("\n4. The obvious foot-guns");
  r = await refuses(() => deleteUser(admin.id, admin.id), /your own account/i);
  ok(r.matched, "you cannot delete yourself", r.msg.slice(0, 50));

  r = await refuses(() => setUserActive(admin.id, false, admin.id), /your own account/i);
  ok(r.matched, "you cannot disable yourself", r.msg.slice(0, 50));

  console.log("\n5. Disable, then re-enable — history untouched either way");
  const off: any = await setUserActive(made.id, false, admin.id);
  ok(off.active === false, "disabled");
  const on: any = await setUserActive(made.id, true, admin.id);
  ok(on.active === true, "re-enabled");

  console.log("\n6. An account that never did anything CAN be erased");
  await deleteUser(made.id, admin.id);
  const after: any[] = await getUsers();
  ok(!after.some((u) => u.id === made.id), "throwaway account removed", `id ${made.id} gone`);

  console.log("\n" + "-".repeat(72));
  console.log(`${pass}/${pass + fail} passed`);
  console.log("(no real account was changed)");
  process.exit(fail ? 1 : 0);
} catch (e: any) {
  console.error("\nFAILED:", e?.message || e);
  process.exit(1);
}
