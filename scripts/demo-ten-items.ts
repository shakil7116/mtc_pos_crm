// A 5-day walkthrough of how the shop would actually run, using 10 items.
//
// This touches NO database. It runs the real logic from server/storage.ts
// (applyStockDelta, resolveItemCost, aggregateInvoiceProfit) against a pretend
// shop, so the numbers below are what the real system would produce.
//
// Run: npx tsx scripts/demo-ten-items.ts
import { applyStockDelta, resolveItemCost, aggregateInvoiceProfit } from "../server/storage";

const QAR = (n: number) => "QAR " + n.toFixed(2);
const pad = (s: any, n: number) => String(s).padEnd(n);
const rpad = (s: any, n: number) => String(s).padStart(n);
const line = (c = "-") => console.log(c.repeat(78));
const day = (n: number, t: string) => {
  console.log("");
  line("=");
  console.log("  DAY " + n + " - " + t);
  line("=");
};

type Item = { name: string; unit: string; cost: number; price: number; tracked: boolean; qty: number };

const shop: Record<string, Item> = {
  CEMENT: { name: "CEMENT OPC 50KG", unit: "BAG", cost: 13.0, price: 17.0, tracked: true, qty: 0 },
  SAND: { name: "WASHED SAND", unit: "TON", cost: 90.0, price: 130.0, tracked: true, qty: 0 },
  GLUE: { name: "TILE ADHESIVE 20KG", unit: "BAG", cost: 19.0, price: 27.0, tracked: true, qty: 0 },
  GYPSUM: { name: "GYPSUM BOARD 12MM", unit: "SHEET", cost: 16.0, price: 22.0, tracked: true, qty: 0 },
  GLOVES: { name: "HAND GLOVES", unit: "PAIR", cost: 2.5, price: 5.0, tracked: true, qty: 0 },
  TAPE: { name: "MASKING TAPE 2 INCH", unit: "ROLL", cost: 3.0, price: 6.0, tracked: true, qty: 0 },
  SHEET: { name: "POLYTHENE SHEET 4M", unit: "ROLL", cost: 45.0, price: 65.0, tracked: true, qty: 0 },
  TROWEL: { name: "TROWEL 11 INCH", unit: "PCS", cost: 12.0, price: 20.0, tracked: true, qty: 0 },
  // The rare ones. NOT in the system. Nobody counted them. That is on purpose.
  ELBOW: { name: "BRASS ELBOW 1/2 INCH", unit: "PCS", cost: 8.0, price: 14.0, tracked: false, qty: 0 },
  HINGE: { name: "DOOR HINGE SS 4 INCH", unit: "PCS", cost: 11.0, price: 18.0, tracked: false, qty: 0 },
};

type SoldLine = { docId: number; key: string; qty: number; amount: number; costAtSale: any };
const sold: SoldLine[] = [];
const invoices: { id: number; total: any; status: string }[] = [];
let nextDoc = 1000;

function sell(key: string, qty: number, recordCost = true) {
  const it = shop[key];
  const amount = qty * it.price;
  const id = ++nextDoc;
  invoices.push({ id, total: String(amount), status: "paid" });
  // A tracked item links to a product, so cost comes from the product record.
  // An untracked item is typed on the invoice - cost is whatever staff enters.
  sold.push({ docId: id, key, qty, amount, costAtSale: recordCost ? String(it.cost) : null });
  if (it.tracked) it.qty = applyStockDelta(it.qty, -qty).newQty;
  return { id, amount };
}

function receive(key: string, qty: number, newCost?: number) {
  const it = shop[key];
  if (newCost !== undefined) it.cost = newCost;
  if (it.tracked) it.qty = applyStockDelta(it.qty, qty).newQty;
}

function stockTable(title: string) {
  console.log("");
  console.log("  " + title);
  console.log("  " + pad("ITEM", 26) + pad("UNIT", 7) + rpad("IN STOCK", 12) + rpad("COST", 9) + rpad("VALUE", 11));
  line();
  let value = 0;
  let untracked = 0;
  for (const k of Object.keys(shop)) {
    const it = shop[k];
    if (!it.tracked) { untracked++; continue; }
    const v = it.qty * it.cost;
    value += v;
    console.log("  " + pad(it.name, 26) + pad(it.unit, 7) + rpad(it.qty, 12) + rpad(it.cost.toFixed(2), 9) + rpad(v.toFixed(2), 11));
  }
  for (const k of Object.keys(shop)) {
    const it = shop[k];
    if (it.tracked) continue;
    console.log("  " + pad(it.name, 26) + pad(it.unit, 7) + rpad("not counted", 12) + rpad("-", 9) + rpad("-", 11));
  }
  console.log("  " + pad("", 26) + pad("", 7) + rpad("", 12) + rpad("TOTAL", 9) + rpad(value.toFixed(2), 11));
  console.log("  (" + untracked + " item(s) not counted - value not included)");
  return value;
}

console.log("");
line("=");
console.log("  YOUR SHOP, 10 ITEMS, 5 DAYS - using the real system logic");
line("=");
console.log("  8 items you sell every day.  2 items that sell rarely.");
console.log("  The 2 rare ones stand for your other 3,960.");

day(1, "You count the 8 regular items. One morning of work.");
receive("CEMENT", 240); receive("SAND", 18); receive("GLUE", 60); receive("GYPSUM", 150);
receive("GLOVES", 200); receive("TAPE", 90); receive("SHEET", 25); receive("TROWEL", 40);
console.log("");
console.log("  You walked the yard and typed in what you saw. That is the whole job.");
console.log("  You did NOT touch the brass elbows or the door hinges. On purpose.");
stockTable("STOCK AFTER COUNTING");

day(2, "A delivery arrives. Cement went up in price.");
console.log("");
console.log("  Supplier brings 100 bags of cement. Price rose from 13.00 to 14.50.");
console.log("  You enter it on the delivery screen. 30 seconds.");
receive("CEMENT", 100, 14.5);
console.log("");
console.log("  Cement stock : 240 -> " + shop.CEMENT.qty + " bags");
console.log("  Cement cost  : QAR 13.00 -> QAR " + shop.CEMENT.cost.toFixed(2));
console.log("");
console.log("  Important: sales you already made are still costed at 13.00.");
console.log("  The new price applies from now on only. Your old profit does not change.");

day(3, "A normal trading day. You make invoices.");
console.log("");
const d3 = [
  sell("CEMENT", 60), sell("SAND", 4), sell("GLUE", 12),
  sell("GYPSUM", 30), sell("GLOVES", 25), sell("TAPE", 8),
];
console.log("  You made 6 invoices:");
console.log("    60 bags cement, 4 ton sand, 12 bags tile glue,");
console.log("    30 sheets gypsum, 25 pairs gloves, 8 rolls tape");
console.log("");
console.log("  Total sales today: " + QAR(d3.reduce((s, x) => s + x.amount, 0)));
console.log("");
console.log("  You did NOT subtract anything by hand. Look:");
console.log("    Cement  340 -> " + shop.CEMENT.qty);
console.log("    Gypsum  150 -> " + shop.GYPSUM.qty);
console.log("    Gloves  200 -> " + shop.GLOVES.qty);
console.log("  Making the invoice did it. Every time. That is the point of the system.");

day(4, "A customer wants brass elbows - an item not in the system.");
console.log("");
console.log("  You know you have some. The system does not. That is fine.");
console.log("  You type it on the invoice: name, quantity, price, and what you paid.");
const e = sell("ELBOW", 6);
console.log("");
console.log("    BRASS ELBOW 1/2 INCH   6 PCS  @ QAR 14.00  =  " + QAR(e.amount));
console.log("    (you paid QAR 8.00 each, so you type 8.00 as the cost)");
console.log("");
console.log("  Your profit on it: " + QAR(6 * 14 - 6 * 8) + ". Correct.");
console.log("  No counting. No registering. You took the money and moved on.");
console.log("");
console.log("  -- But watch what happens if the cost box is left blank --");
const wrongCost = resolveItemCost(null, null);
const wrongProfit = 6 * 14 - wrongCost * 6;
const rightProfit = 6 * 14 - resolveItemCost("8.00", null) * 6;
console.log("    Cost typed in     -> profit " + QAR(rightProfit) + "   correct");
console.log("    Cost left blank   -> profit " + QAR(wrongProfit) + "   WRONG, overstated by " + QAR(wrongProfit - rightProfit));
console.log("  That is why the cost box matters. It is the one rule to teach staff.");

day(5, "You have a quiet hour, so you count one shelf.");
console.log("");
console.log("  You count the brass elbows. There are 34 on the shelf.");
console.log("  You type 34. Not 'add 34' - just 34, the true number.");
shop.ELBOW.tracked = true;
shop.ELBOW.qty = 34;
console.log("");
console.log("  The 6 you sold yesterday are already gone from that 34 - you counted");
console.log("  what is physically there. You never work backwards.");
console.log("");
console.log("  Brass elbows are now tracked. Door hinges still are not. No rush.");

line("=");
console.log("  WHERE YOU STAND AFTER 5 DAYS");
line("=");
const value = stockTable("STOCK REPORT");

const profitByDoc: Record<number, number> = {};
const cogsByDoc: Record<number, number> = {};
for (const s of sold) {
  const unit = resolveItemCost(s.costAtSale, shop[s.key].cost);
  const c = unit * s.qty;
  cogsByDoc[s.docId] = (cogsByDoc[s.docId] || 0) + c;
  profitByDoc[s.docId] = (profitByDoc[s.docId] || 0) + (s.amount - c);
}
const agg = aggregateInvoiceProfit(invoices, profitByDoc, cogsByDoc);
console.log("");
console.log("  Invoices        : " + agg.invoiceCount);
console.log("  Sales           : " + QAR(agg.realSales));
console.log("  Cost of goods   : " + QAR(agg.realCogs));
console.log("  Profit          : " + QAR(agg.realProfit) + "   (margin " + agg.realMargin + "%)");
console.log("  Stock value     : " + QAR(value) + "   - 9 of 10 items counted");

line("=");
console.log("  WHAT THIS MEANS FOR YOUR 4,000");
line("=");
console.log("  Day 1 work          : count 40 items. One morning. Not 4,000.");
console.log("  Every day after     : invoices subtract stock by themselves.");
console.log("  Deliveries          : one screen, 30 seconds.");
console.log("  Rare item sold      : type name, price, cost. Take the money.");
console.log("  Quiet hour          : count a shelf. That shelf is now tracked.");
console.log("");
console.log("  You sell 2-5 rare items a day. That is roughly 1,000 different rare");
console.log("  items across a year, each added in seconds as it sells.");
console.log("  The 3,000 that never sold? You saved yourself counting them.");
console.log("");
