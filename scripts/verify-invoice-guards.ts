import "dotenv/config";
import { db, pool } from "../server/db";
import { documents, documentItems, payments } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createDocument, getDocument } from "../server/storage";

const R: boolean[] = [];
const ok = (n: string, c: boolean, x = "") => { R.push(c); console.log(`   ${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };
const MARK = "__GUARDTEST__";
const num = () => `${MARK}-${Date.now()}-${Math.floor(Math.random()*1000)}`;

async function cleanup() {
  await pool.query(`delete from payments where document_id in (select id from documents where customer_name=$1)`, [MARK]);
  await pool.query(`delete from document_items where document_id in (select id from documents where customer_name=$1)`, [MARK]);
  await pool.query(`delete from documents where customer_name=$1`, [MARK]);
}

async function main() {
  await cleanup();
  console.log("\n── Invoice guards ──");

  // 1. INV without customer → must throw
  let threw = false;
  try {
    await createDocument({ type: "INV", date: "2026-07-20", customerName: MARK, storeId: 1, customerId: null,
      transactionMode: "real", discountType: "QAR", discountAmount: "0", subtotal: "0", taxRate: "0", taxAmount: "0", total: "0",
      items: [] } as any);
  } catch (e: any) { threw = /customer is required/i.test(e.message); }
  ok("INV without customer → rejected", threw);

  // 2. INV with customer + dueDate (credit) → due date persisted + drives footer standardDue
  const doc = await createDocument({ type: "INV", date: "2026-07-20", customerName: MARK, storeId: 1, customerId: 2,
    transactionMode: "real", status: "unpaid", dueDate: "2026-08-05",
    discountType: "QAR", discountAmount: "0", subtotal: "500", taxRate: "0", taxAmount: "0", total: "500",
    payments: [{ method: "Credit", amount: 500, creditTerm: 16 }],
    items: [{ productId: null, sku: null, description: "x", qty: "1", unit: "PCS", price: "500", discountType: "QAR", discountAmount: "0", amount: "500" }] } as any);
  const full: any = await getDocument(doc.id);
  ok("dueDate persisted on invoice", full.dueDate === "2026-08-05", `got ${full.dueDate}`);
  ok("footer standardDue = chosen dueDate (not customer term)", full.terms?.standardDue === "2026-08-05", `got ${full.terms?.standardDue}`);
  ok("invoiceType = Credit", full.invoiceType === "Credit Invoice", `got ${full.invoiceType}`);

  await cleanup();
  const left = (await pool.query(`select count(*)::int n from documents where customer_name=$1`, [MARK])).rows[0].n;
  ok("cleanup", left === 0);

  const pass = R.filter(Boolean).length;
  console.log(`\n${pass}/${R.length} passed.`);
  await pool.end();
  process.exit(pass === R.length ? 0 : 1);
}
main().catch(async (e) => { console.error("ERR:", e); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
