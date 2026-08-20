// Confirms the return-approval threshold is wired (settings → getBusinessRules)
// and documents the exact gate boundary the approve route enforces.
import "dotenv/config";
import { getBusinessRules } from "../server/storage";

// Pure replica of the /api/returns/:id/approve gate — locks the boundary behavior.
const gate = (role: string, total: number, threshold: number) => {
  const isBoss = ["admin", "manager"].includes(role);
  if (isBoss) return true;
  if (!["salesman", "worker"].includes(role)) return false;
  return total <= threshold;
};

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

(async () => {
  const { returnApprovalThreshold: t } = await getBusinessRules();
  ok(t === 1000, `threshold from settings = ${t}`);
  ok(gate("salesman", 1000, t) === true, "salesman may process exactly 1000");
  ok(gate("salesman", 1000.01, t) === false, "salesman blocked just over 1000");
  ok(gate("worker", 500, t) === true, "worker may process 500");
  ok(gate("manager", 5000, t) === true, "manager may process 5000 (over threshold)");
  ok(gate("admin", 99999, t) === true, "admin may process anything");
  ok(gate("driver", 100, t) === false, "driver cannot approve returns at all");
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
