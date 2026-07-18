// GO-LIVE demo/test purge. Preserves document numbering (never reused).
// Deactivates test customers/products/users and hides demo transactions from
// reports. Run once at install, review the counts, then confirm with --commit.
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const commit = process.argv.includes("--commit");

const q = (sql, p = []) => pool.query(sql, p);
const count = async (sql, p = []) => Number((await q(sql, p)).rows[0].n);

const TEST_CUST = `name LIKE 'NJ %' OR name LIKE 'P0 %' OR name LIKE 'CF %' OR name LIKE '%Test%' OR name LIKE 'CreditGate%' OR name LIKE 'Phase%' OR name LIKE 'DemoFix%' OR name='S2 Walkin' OR name='DemoTest'`;
const TEST_PROD = `sku LIKE 'NJ-%' OR sku LIKE 'P0%' OR sku LIKE 'CF-%' OR sku LIKE 'AUD%' OR name LIKE '%Test%'`;

console.log(`Mode: ${commit ? "COMMIT (writing changes)" : "DRY RUN (no changes — pass --commit to apply)"}\n`);

const demoDocs = await count(`SELECT count(*)::int n FROM documents WHERE transaction_mode='demo' OR notes IN ('PHASE5_SEED','AUDIT') OR notes LIKE 'PHASE%'`);
const testCust = await count(`SELECT count(*)::int n FROM customers WHERE ${TEST_CUST}`);
const testProd = await count(`SELECT count(*)::int n FROM products WHERE ${TEST_PROD}`);
const testUsers = await count(`SELECT count(*)::int n FROM users WHERE name LIKE 'NJ %'`);
const demoCashflow = await count(`SELECT count(*)::int n FROM cashflow c WHERE c.ref_type IN ('invoice','payment') AND c.ref_id IN (SELECT id FROM documents WHERE transaction_mode='demo')`);

console.log(`Demo/test documents (will be marked void, NUMBER KEPT): ${demoDocs}`);
console.log(`Test customers (deactivate):                           ${testCust}`);
console.log(`Test products (deactivate):                            ${testProd}`);
console.log(`Test users NJ * (deactivate):                          ${testUsers}`);
console.log(`Demo cashflow rows (delete — never real money):        ${demoCashflow}`);

if (commit) {
  // Demo docs → void (keeps the number, removes from live totals; reports already exclude demo).
  await q(`UPDATE documents SET status='void' WHERE (transaction_mode='demo' OR notes LIKE 'PHASE%' OR notes='AUDIT') AND status<>'void'`);
  await q(`DELETE FROM cashflow WHERE ref_type IN ('invoice','payment') AND ref_id IN (SELECT id FROM documents WHERE transaction_mode='demo')`);
  await q(`UPDATE customers SET active=false WHERE ${TEST_CUST}`);
  await q(`UPDATE products SET active=false WHERE ${TEST_PROD}`);
  await q(`UPDATE users SET active=false WHERE name LIKE 'NJ %'`);
  console.log("\n✔ Committed. Document numbers preserved. Review dashboards + Stock Movement report to confirm.");
} else {
  console.log("\nDry run only. Re-run with --commit once you've reviewed the counts.");
}
await pool.end();
