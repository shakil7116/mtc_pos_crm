// YOUR SCENARIO, WEEK BY WEEK.
//
// Monday: you count the 40 regular items. OPC cement is one of them.
// Same day: you bill 25 bags OPC + 1 Makita drill. The drill is a rare item -
// sells maybe once a month - and will not be counted for another two weeks.
//
// This shows what the system does in between, and how the business value fills in.
//
// Touches NO database. Uses the real logic from server/storage.ts.
// Run: npx tsx scripts/demo-going-live.ts
import { applyStockDelta, resolveItemCost, aggregateInvoiceProfit } from "../server/storage";

const QAR = (n: number) => "QAR " + n.toFixed(2);
const pad = (s: any, n: number) => String(s).padEnd(n);
const rpad = (s: any, n: number) => String(s).padStart(n);
const rule = (c = "-") => console.log(c.repeat(76));
const head = (t: string) => { console.log(""); rule("="); console.log("  " + t); rule("="); };

type Item = {
  name: string; unit: string; cost: number; price: number;
  counted: boolean;      // has anyone physically counted it yet?
  qty: number;
};

const shop: Record<string, Item> = {
  OPC:    { name: "OPC CEMENT 50KG",    unit: "BAG",   cost: 13,  price: 17,  counted: false, qty: 0 },
  SAND:   { name: "WASHED SAND",        unit: "TON",   cost: 90,  price: 130, counted: false, qty: 0 },
  GYPSUM: { name: "GYPSUM BOARD 12MM",  unit: "SHEET", cost: 16,  price: 22,  counted: false, qty: 0 },
  GLUE:   { name: "TILE ADHESIVE 20KG", unit: "BAG",   cost: 19,  price: 27,  counted: false, qty: 0 },
  GLOVES: { name: "HAND GLOVES",        unit: "PAIR",  cost: 2.5, price: 5,   counted: false, qty: 0 },
  // The rare one. Registered so it can be billed, but nobody has counted it.
  DRILL:  { name: "MAKITA DRILL HP1630", unit: "PCS",  cost: 380, price: 520, counted: false, qty: 0 },
};

type Line = { docId: number; key: string; qty: number; amount: number; costAtSale: string };
const lines: Line[] = [];
const invoices: { id: number; total: any; status: string }[] = [];
let nextDoc = 5000;

function bill(parts: Array<[string, number]>, label: string) {
  const id = ++nextDoc;
  let total = 0;
  const shown: string[] = [];
  for (const [key, qty] of parts) {
    const it = shop[key];
    const amount = qty * it.price;
    total += amount;
    // Cost is taken from the product record, so profit is right whether or not
    // anyone has ever counted this item.
    lines.push({ docId: id, key, qty, amount, costAtSale: String(it.cost) });
    if (it.counted) it.qty = applyStockDelta(it.qty, -qty).newQty;
    shown.push("    " + pad(it.name, 24) + rpad(qty, 4) + " " + pad(it.unit, 6) +
      " @ " + rpad(it.price.toFixed(2), 7) + " = " + rpad(amount.toFixed(2), 9) +
      (it.counted ? "" : "   [not counted]"));
  }
  invoices.push({ id, total: String(total), status: "paid" });
  console.log("");
  console.log("  INVOICE " + id + "  -  " + label);
  shown.forEach((l) => console.log(l));
  console.log("    " + pad("", 24) + rpad("", 4) + " " + pad("", 6) + "   " + rpad("TOTAL", 7) + " = " + rpad(total.toFixed(2), 9));
  return total;
}

function count(key: string, qty: number) {
  shop[key].counted = true;
  shop[key].qty = qty;
}

function valueReport(title: string) {
  console.log("");
  console.log("  " + title);
  console.log("  " + pad("ITEM", 24) + pad("UNIT", 7) + rpad("ON HAND", 12) + rpad("COST", 9) + rpad("VALUE", 12));
  rule();
  let known = 0, unknownItems = 0;
  for (const k of Object.keys(shop)) {
    const it = shop[k];
    if (it.counted) {
      const v = it.qty * it.cost;
      known += v;
      console.log("  " + pad(it.name, 24) + pad(it.unit, 7) + rpad(it.qty, 12) + rpad(it.cost.toFixed(2), 9) + rpad(v.toFixed(2), 12));
    } else {
      unknownItems++;
      console.log("  " + pad(it.name, 24) + pad(it.unit, 7) + rpad("not counted", 12) + rpad(it.cost.toFixed(2), 9) + rpad("unknown", 12));
    }
  }
  rule();
  const total = Object.keys(shop).length;
  console.log("  " + pad("KNOWN BUSINESS VALUE", 24) + pad("", 7) + rpad("", 12) + rpad("", 9) + rpad(known.toFixed(2), 12));
  console.log("  counted " + (total - unknownItems) + " of " + total + " items" +
    (unknownItems ? "  -  " + unknownItems + " still unknown" : "  -  COMPLETE"));
  return known;
}

function profitReport(title: string) {
  const profitByDoc: Record<number, number> = {};
  const cogsByDoc: Record<number, number> = {};
  for (const l of lines) {
    const unit = resolveItemCost(l.costAtSale, shop[l.key].cost);
    const c = unit * l.qty;
    cogsByDoc[l.docId] = (cogsByDoc[l.docId] || 0) + c;
    profitByDoc[l.docId] = (profitByDoc[l.docId] || 0) + (l.amount - c);
  }
  const a = aggregateInvoiceProfit(invoices, profitByDoc, cogsByDoc);
  console.log("");
  console.log("  " + title);
  console.log("    Invoices      : " + a.invoiceCount);
  console.log("    Sales         : " + QAR(a.realSales));
  console.log("    Cost of goods : " + QAR(a.realCogs));
  console.log("    GROSS PROFIT  : " + QAR(a.realProfit) + "   (margin " + a.realMargin + "%)");
  return a;
}

// ═══════════════════════════════════════════════════════════════════════════
head("MONDAY MORNING, WEEK 1  -  you count the regular items");
count("OPC", 240); count("SAND", 18); count("GYPSUM", 150);
count("GLUE", 60); count("GLOVES", 200);
console.log("");
console.log("  One morning of work. Five items here stand for your forty.");
console.log("  The Makita drill is registered (name, cost, price) but NOT counted.");
console.log("  You will get to it in a couple of weeks.");
const v1 = valueReport("BUSINESS VALUE - MONDAY MORNING");

head("MONDAY, SAME DAY  -  your first real invoice");
bill([["OPC", 25], ["DRILL", 1]], "25 bags cement + 1 Makita drill");
console.log("");
console.log("  Cement is counted, so stock moved:   240 -> " + shop.OPC.qty + " bags");
console.log("  Drill is not counted, so no stock moved. Nothing to move from.");
console.log("");
console.log("  BUT the profit on BOTH is correct:");
console.log("    Cement : 25 x (17.00 - 13.00)  = " + QAR(25 * 4));
console.log("    Drill  :  1 x (520.00 - 380.00) = " + QAR(140));
console.log("  The drill's cost came from its product record. No count needed.");

head("REST OF WEEK 1 AND WEEK 2  -  normal trading");
bill([["OPC", 40], ["GLOVES", 30]], "Tuesday");
bill([["GYPSUM", 45], ["GLUE", 12]], "Wednesday");
bill([["OPC", 60], ["SAND", 5]], "Thursday");
bill([["DRILL", 2]], "Following Tuesday - contractor buys 2 drills");
bill([["OPC", 35], ["GLOVES", 20], ["GLUE", 8]], "Following Thursday");
console.log("");
console.log("  Three drills sold across two weeks. Each one recorded its profit.");
console.log("  Still nobody has counted the drills. That is fine.");

head("END OF WEEK 2  -  what your reports say");
const p2 = profitReport("PROFIT - correct, and it always was");
const v2 = valueReport("BUSINESS VALUE - still one gap");
console.log("");
console.log("  Read this carefully, it is the whole point:");
console.log("");
console.log("    PROFIT is COMPLETE.       " + QAR(p2.realProfit) + " - every sale counted,");
console.log("                              including all three drills.");
console.log("");
console.log("    VALUE is INCOMPLETE.      " + QAR(v2) + " - the drills on the shelf");
console.log("                              are not in this number yet.");
console.log("");
console.log("  You can run your monthly profit report today and it is right.");
console.log("  You just cannot state your full business value yet. Two different things.");

head("MONDAY, WEEK 3  -  a quiet morning, you count the drills");
console.log("");
console.log("  You count the shelf. There are 12 Makita drills.");
console.log("  You type 12. Not 'add 12' - just 12, what is actually there.");
count("DRILL", 12);
console.log("");
console.log("  The 3 you already sold are gone from that 12 already, because you");
console.log("  counted what is physically on the shelf. Nothing to work backwards.");
const v3 = valueReport("BUSINESS VALUE - now complete");
console.log("");
console.log("  Value went from " + QAR(v2) + " to " + QAR(v3));
console.log("  It rose by " + QAR(v3 - v2) + " - that is 12 drills x " + QAR(380) + " cost.");

head("AND NOTHING ABOUT YOUR PROFIT CHANGED");
const p3 = profitReport("PROFIT - after counting the drills");
console.log("");
console.log("  Before counting : " + QAR(p2.realProfit));
console.log("  After counting  : " + QAR(p3.realProfit));
console.log("  Difference      : " + QAR(p3.realProfit - p2.realProfit));
console.log("");
console.log("  Counting stock does NOT change profit. It never did.");
console.log("  Profit comes from your sales. Counting tells you what is on the shelf.");

head("HOW IT GOES ON FROM HERE");
console.log("");
console.log("  Week 1   count 40 regular items    -> those 40 are live and accurate");
console.log("  Week 1+  sell anything, any time   -> profit correct from the first invoice");
console.log("  Week 3   count the drills          -> drills join the value");
console.log("  Week 4   count another shelf       -> that shelf joins the value");
console.log("  Week 8   last shelf counted        -> business value COMPLETE");
console.log("");
console.log("  The report always tells you how many items are counted, so you know");
console.log("  whether you are looking at a partial value or the full one.");
console.log("");
console.log("  You never close the shop. You never count twice. You never work backwards.");
console.log("");
