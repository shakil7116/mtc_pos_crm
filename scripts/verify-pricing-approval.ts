// Verifies the discount / price-change manager-approval gate. The salesman-without-PIN
// paths throw BEFORE any document is inserted, so nothing is written.
import "dotenv/config";
import { getManagerByPin, createDocument, getCustomers, PricingApprovalRequiredError } from "../server/storage";

const SALESMAN = 2; // Store Salesman, role salesman
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

const baseReq = (cid: number, items: any[]) => ({
  type: "INV", date: "2026-07-26", customerId: cid, createdBy: SALESMAN, storeId: 1,
  total: items.reduce((s, i) => s + i.amount, 0), discountAmount: 0,
  payments: [{ method: "Cash", amount: items.reduce((s, i) => s + i.amount, 0) }], // cash → skip credit gate
  items,
} as any);

async function throwsPricing(req: any): Promise<boolean> {
  try { await createDocument(req); return false; }
  catch (e) { return e instanceof PricingApprovalRequiredError; }
}

(async () => {
  // getManagerByPin — supervisor lookup
  ok(!!(await getManagerByPin("1234")), "admin PIN 1234 resolves a supervisor");
  ok(!(await getManagerByPin("1111")), "salesman PIN 1111 is NOT a supervisor");
  ok(!(await getManagerByPin("857392")), "unknown PIN is not a supervisor");
  ok(!(await getManagerByPin("12")), "too-short PIN rejected");

  const custs = await getCustomers();
  const cid = custs[0].id;

  // Salesman + a line discount, no PIN → blocked
  ok(await throwsPricing(baseReq(cid, [{ productId: 6, description: "ITEM", qty: 1, unit: "PCS", price: 5, originalPrice: 5, discountAmount: 2, amount: 3 }])),
    "salesman line discount without a manager PIN is blocked");

  // Salesman + a price below the auto-filled price, no PIN → blocked
  ok(await throwsPricing(baseReq(cid, [{ productId: 6, description: "ITEM", qty: 1, unit: "PCS", price: 3, originalPrice: 5, discountAmount: 0, amount: 3 }])),
    "salesman price-below-original without a manager PIN is blocked");

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
