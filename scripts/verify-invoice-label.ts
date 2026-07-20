// Verifies the invoice type label (Task 2). Part 1: pure-function rule table.
// Part 2: in-process getDocument integration with real rows (self-cleaning).
// Run: npx tsx scripts/verify-invoice-label.ts
import "dotenv/config";
import { db, pool } from "../server/db";
import { documents, payments, cheques } from "@shared/schema";
import { computeInvoiceType } from "@shared/invoiceType";
import { getDocument } from "../server/storage";

const R: boolean[] = [];
const ok = (n: string, got: any, want: any) => { const p = got === want; R.push(p); console.log(`   ${p ? "PASS" : "FAIL"} — ${n} :: got "${got}" want "${want}"`); };

// ── Part 1: pure rules (payments use the stored method labels; PDC → "Cheque") ──
console.log("\n── Rule table (pure) ──");
ok("cash-only full → Cash", computeInvoiceType(500, [{ method: "Cash", amount: 500 }], []), "Cash Invoice");
ok("card+online full → Cash", computeInvoiceType(500, [{ method: "Credit Card", amount: 200 }, { method: "Bank Transfer", amount: 300 }], []), "Cash Invoice");
ok("PDC-only full → Credit (PDC always Credit)", computeInvoiceType(500, [{ method: "Cheque", amount: 500 }], [{ amount: 500, status: "pending" }]), "Credit Invoice");
ok("PDC-only CLEARED → still Credit (permanent)", computeInvoiceType(500, [{ method: "Cheque", amount: 500 }], [{ amount: 500, status: "cleared" }]), "Credit Invoice");
ok("unpaid → Credit", computeInvoiceType(500, [], []), "Credit Invoice");
ok("partial cash → Credit", computeInvoiceType(500, [{ method: "Cash", amount: 200 }], []), "Credit Invoice");
ok("mixed cash+PDC full → Credit", computeInvoiceType(500, [{ method: "Cash", amount: 250 }, { method: "Cheque", amount: 250 }], [{ amount: 250, status: "pending" }]), "Credit Invoice");
ok("PDC bounced → Credit", computeInvoiceType(500, [{ method: "Cheque", amount: 500 }], [{ amount: 500, status: "bounced" }]), "Credit Invoice");
ok("relabel: credit paid off by cash only → Cash", computeInvoiceType(500, [{ method: "Cash", amount: 500 }], []), "Cash Invoice");

// ── Part 2: getDocument integration ──
const MARK = "__LABELTEST__";
let seq = Date.now();
const num = () => `${MARK}-${seq++}`;
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function mkInv(total: number, status: string) {
  const [d] = await db.insert(documents).values({ type: "INV", number: num(), date: day(0), customerName: MARK, storeId: 1, status, subtotal: String(total), total: String(total), transactionMode: "real" }).returning();
  return d.id;
}
const pay = (docId: number, method: string, amount: number) => db.insert(payments).values({ documentId: docId, amount: String(amount), method, date: day(0), isRefund: false });
const chq = (docId: number, amount: number, status: string) => db.insert(cheques).values({ documentId: docId, chequeNumber: num(), bankName: MARK, amount: String(amount), chequeDate: day(10), status, type: "receivable" });

async function cleanup() {
  await pool.query(`delete from cheques where bank_name=$1`, [MARK]);
  await pool.query(`delete from payments where document_id in (select id from documents where customer_name=$1)`, [MARK]);
  await pool.query(`delete from documents where customer_name=$1`, [MARK]);
}

async function main() {
  await cleanup();
  console.log("\n── getDocument integration ──");

  const cash = await mkInv(500, "paid"); await pay(cash, "Cash", 500);
  ok("getDocument cash-only → Cash Invoice", (await getDocument(cash) as any).invoiceType, "Cash Invoice");

  const pdc = await mkInv(500, "unpaid"); await pay(pdc, "Cheque", 500); await chq(pdc, 500, "pending");
  ok("getDocument PDC-only → Credit Invoice", (await getDocument(pdc) as any).invoiceType, "Credit Invoice");

  const pdcCleared = await mkInv(500, "unpaid"); await pay(pdcCleared, "Cheque", 500); await chq(pdcCleared, 500, "cleared");
  ok("getDocument PDC cleared → still Credit", (await getDocument(pdcCleared) as any).invoiceType, "Credit Invoice");

  const part = await mkInv(500, "partial"); await pay(part, "Cash", 200);
  ok("getDocument partial → Credit Invoice", (await getDocument(part) as any).invoiceType, "Credit Invoice");

  const bounce = await mkInv(500, "unpaid"); await pay(bounce, "Cheque", 500); await chq(bounce, 500, "bounced");
  ok("getDocument bounced PDC → Credit Invoice", (await getDocument(bounce) as any).invoiceType, "Credit Invoice");

  await cleanup();
  const left = (await pool.query(`select count(*)::int n from documents where customer_name=$1`, [MARK])).rows[0].n;
  ok("cleanup — zero test docs remain", left, 0);

  const pass = R.filter(Boolean).length;
  console.log(`\n${pass}/${R.length} checks passed.`);
  await pool.end();
  process.exit(pass === R.length ? 0 : 1);
}
main().catch(async (e) => { console.error("SCRIPT ERROR:", e); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
