// Verifies the task workflow: create, scoped listing, status transitions with
// actor permissions, completion stamp, delete.
import "dotenv/config";
import { createTask, getTasks, updateTask, deleteTask } from "../server/storage";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const SALESMAN = 2, ADMIN = 1;

(async () => {
  const t = await createTask({ title: "Count gypsum board stock", note: "north rack", assignedTo: SALESMAN, assignedBy: ADMIN, storeId: 1, dueDate: "2026-07-30" });
  ok(!!t.id && t.status === "open", "task created, status open");

  const all = await getTasks({});
  const mine = await getTasks({ mineUserId: SALESMAN });
  const notMine = await getTasks({ mineUserId: ADMIN });
  ok(all.some((x) => x.id === t.id), "appears in full board");
  ok(mine.some((x) => x.id === t.id), "appears in assignee's list");
  ok(!notMine.some((x) => x.id === t.id), "not in a different user's list");
  ok(all.find((x) => x.id === t.id)?.assignedToName === "Store Salesman", "assignee name resolved");

  // Assignee moves it in progress
  await updateTask(t.id, { status: "in_progress" }, { id: SALESMAN, role: "salesman" });
  ok((await getTasks({})).find((x) => x.id === t.id)?.status === "in_progress", "assignee set in_progress");

  // A random unrelated staff cannot touch it
  let threw = false;
  try { await updateTask(t.id, { status: "done" }, { id: 999, role: "driver" }); } catch (e: any) { threw = /not allowed/i.test(e.message); }
  ok(threw, "unrelated staff blocked");

  // Admin completes it → completedAt stamped
  const done = await updateTask(t.id, { status: "done" }, { id: ADMIN, role: "admin" });
  ok(done.status === "done" && !!done.completedAt, "admin completed, completedAt stamped");

  // Reopen clears the stamp
  const reopened = await updateTask(t.id, { status: "open" }, { id: ADMIN, role: "admin" });
  ok(reopened.status === "open" && !reopened.completedAt, "reopen clears completedAt");

  await deleteTask(t.id);
  ok(!(await getTasks({})).some((x) => x.id === t.id), "deleted");

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
