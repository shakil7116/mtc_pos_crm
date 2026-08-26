// ─────────────────────────────────────────────────────────────────────────────
// Deterministic question router — the AI Overview without any AI.
//
// The data tools in assistant.ts were never the part that needed a language
// model: they are plain TypeScript reading the same storage the screens read.
// The only jobs a model was doing were (1) working out which tool a sentence
// means, and (2) writing the answer out in prose.
//
// Both are solvable with keyword matching and templates for the questions this
// business actually asks, which is a short and repetitive list. So this router
// runs FIRST and answers what it recognises — no key, no network, no cost, and
// no chance of a model inventing a figure. Anything it does not recognise falls
// through to the model, and if no key is set it says plainly what it can answer.
//
// Adding a question here is cheaper than tuning a prompt: one INTENTS entry.
// ─────────────────────────────────────────────────────────────────────────────
import { runTool, type AssistantUser } from "./assistant";
import { getCustomers, getProducts } from "./storage";
import { normalizeName, trigramSimilarity } from "./matching";

export interface RoutedAnswer {
  reply: string;
  draft?: any;
  toolsUsed: { name: string; args: any }[];
  /** False when nothing matched, so the caller can fall through to the model. */
  handled: boolean;
}

const money = (n: number) =>
  `QAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const qty = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

// ─── Entity spotting ─────────────────────────────────────────────────────────

/**
 * Find a named record inside a free-form sentence.
 *
 * Scores each candidate by how much of ITS OWN name appears in the question, so
 * "find mister ahmed construction total credit" locks onto AHMED CONSTRUCTION
 * WLL (both distinctive words present) without the surrounding words diluting
 * it. A single shared common word is not enough to win.
 */
function spotEntity<T extends { id: number; name: string }>(
  text: string,
  rows: T[],
): { row: T; score: number; runnerUp: number } | null {
  const haystack = normalizeName(text).split(" ").filter(Boolean);
  if (!haystack.length) return null;

  const scored = rows.map((row) => {
    const tokens = normalizeName(row.name).split(" ").filter((t) => t.length > 2);
    if (!tokens.length) return { row, score: 0 };
    let hit = 0;
    for (const t of tokens) {
      // Exact word, or close enough to be the same word typed differently.
      const best = haystack.reduce((m, h) => Math.max(m, h === t ? 1 : trigramSimilarity(h, t)), 0);
      if (best >= 0.7) hit += best;
    }
    return { row, score: hit / tokens.length };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < 0.5) return null;
  return { row: top.row, score: top.score, runnerUp: scored[1]?.score ?? 0 };
}

// ─── Intent matching ─────────────────────────────────────────────────────────

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

type Handler = (ctx: {
  text: string;
  user: AssistantUser;
  days: number;
  customers: { id: number; name: string }[];
  products: { id: number; name: string }[];
}) => Promise<RoutedAnswer | null>;

/** "last 90 days", "this month", "last week" → a day count. Defaults to 30. */
function parsePeriod(text: string): number {
  const explicit = text.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)/);
  if (explicit) {
    const n = Number(explicit[1]);
    const unit = explicit[2];
    if (unit.startsWith("day")) return n;
    if (unit.startsWith("week")) return n * 7;
    if (unit.startsWith("month")) return n * 30;
    return n * 365;
  }
  if (has(text, "today")) return 1;
  if (has(text, "this week", "last week")) return 7;
  if (has(text, "this year", "last year")) return 365;
  if (has(text, "this month", "last month")) return 30;
  return 30;
}

/**
 * Strip the question scaffolding so what remains is the thing being asked about.
 * "how many rebar do we have" -> "rebar", which the product matcher handles well.
 */
const QUESTION_WORDS = [
  "how many", "how much", "how", "many", "much", "stock of", "in stock", "on stock",
  "do we have", "we have", "have we", "price of", "cost of", "available", "left",
  "remaining", "what is", "whats", "what", "is", "are", "the", "we", "our", "us",
  "got", "any", "there", "of", "a", "an", "please", "show", "me", "tell",
];
function stripQuestionWords(text: string): string {
  let t = normalizeName(text).toLowerCase();
  for (const w of QUESTION_WORDS) t = t.replace(new RegExp(`\\b${w}\\b`, "g"), " ");
  return t.replace(/\s+/g, " ").trim();
}

const track = (name: string, args: any) => [{ name, args }];

/** Every intent, tried in order. The first whose test passes handles the question. */
const INTENTS: { test: (t: string) => boolean; run: Handler }[] = [
  // ── Send a WhatsApp about money owed ──────────────────────────────────────
  {
    test: (t) => has(t, "whatsapp", "message", "remind", "reminder", "chase", "follow up")
      && !has(t, "how many message", "message log"),
    run: async ({ text, user, customers }) => {
      const spot = spotEntity(text, customers as any);
      if (!spot) {
        return {
          handled: true,
          toolsUsed: [],
          reply: "Which customer should I write to? Give me the name and I'll prepare the message.",
        };
      }
      if (spot.runnerUp > 0.8 && spot.score - spot.runnerUp < 0.15) {
        return {
          handled: true, toolsUsed: [],
          reply: `More than one customer matches that. Please give me the full name.`,
        };
      }
      const purpose = has(text, "statement", "account") ? "statement" : "payment_reminder";
      const result = await runTool("draft_whatsapp", { customerId: spot.row.id, purpose }, user);
      if (result.error) return { handled: true, toolsUsed: track("draft_whatsapp", { customerId: spot.row.id }), reply: `⚠️ ${result.error}` };

      return {
        handled: true,
        draft: result.draft,
        toolsUsed: track("draft_whatsapp", { customerId: spot.row.id, purpose }),
        reply: `Here's a ${purpose === "statement" ? "statement" : "payment reminder"} for **${spot.row.name}**. Review it below and press Send — nothing goes out until you do.`,
      };
    },
  },

  // ── One customer's credit / balance / overdue ─────────────────────────────
  {
    test: (t) => has(t, "credit", "owe", "owes", "outstanding", "balance", "due", "overdue", "unpaid", "receivable"),
    run: async ({ text, user, customers }) => {
      const spot = spotEntity(text, customers as any);

      // No name in the question → they mean the whole ledger.
      if (!spot) {
        const r = await runTool("receivables", { limit: 10 }, user);
        if (r.error) return { handled: true, toolsUsed: track("receivables", {}), reply: `⚠️ ${r.error}` };
        const rows = (r.customers || []).map((c: any) =>
          `| ${c.name} | ${money(c.outstanding)} | ${c.maxDaysOverdue ?? 0} days |`).join("\n");
        return {
          handled: true,
          toolsUsed: track("receivables", { limit: 10 }),
          reply: `**${money(r.totalOutstanding)}** is outstanding across **${r.unpaidInvoiceCount}** unpaid invoices.\n\n`
            + `| Customer | Owes | Oldest |\n| --- | --- | --- |\n${rows}`,
        };
      }

      const o = await runTool("customer_overview", { customerId: spot.row.id }, user);
      if (o.error) return { handled: true, toolsUsed: track("customer_overview", { customerId: spot.row.id }), reply: `⚠️ ${o.error}` };

      const lines = [
        `**${o.name}** owes **${money(o.outstanding)}**.`,
        ``,
        `- Credit limit: ${money(o.creditLimit)}${o.creditRemaining != null ? ` · ${money(o.creditRemaining)} still available` : ""}`,
        `- Unpaid invoices: ${o.unpaidInvoices.length}${o.oldestOverdueDays ? ` · oldest ${o.oldestOverdueDays} days overdue` : ""}`,
        `- Lifetime sales: ${money(o.totalSales)} across ${o.invoiceCount} invoices`,
      ];
      if (o.overLimit) lines.push(``, `⚠️ **Over their credit limit.**`);
      if (o.unpaidInvoices.length) {
        lines.push(``, `| Invoice | Still owed | Overdue |`, `| --- | --- | --- |`);
        for (const i of o.unpaidInvoices.slice(0, 8)) {
          lines.push(`| ${i.number} | ${money(i.remaining)} | ${i.daysOverdue ? `${i.daysOverdue} days` : "—"} |`);
        }
      }
      return { handled: true, toolsUsed: track("customer_overview", { customerId: spot.row.id }), reply: lines.join("\n") };
    },
  },

  // ── Best-selling products ────────────────────────────────────────────────
  {
    test: (t) => has(t, "sold", "selling", "best seller", "bestseller", "top product", "top item", "which item", "which product", "most popular"),
    run: async ({ text, user, days }) => {
      const r = await runTool("product_sales", { days, limit: 10 }, user);
      if (r.error) return { handled: true, toolsUsed: track("product_sales", { days }), reply: `⚠️ ${r.error}` };
      if (!r.products?.length) return { handled: true, toolsUsed: track("product_sales", { days }), reply: `No sales recorded in the ${r.period}.` };

      const showProfit = r.products[0].profit !== undefined;
      const head = showProfit ? `| Product | Qty | Revenue | Profit |\n| --- | --- | --- | --- |`
                              : `| Product | Qty | Revenue |\n| --- | --- | --- |`;
      const rows = r.products.map((p: any) =>
        showProfit ? `| ${p.name} | ${qty(p.qtySold)} | ${money(p.revenue)} | ${money(p.profit)} |`
                   : `| ${p.name} | ${qty(p.qtySold)} | ${money(p.revenue)} |`).join("\n");

      // A loss-making line is the thing worth noticing, so say it outright.
      const losers = showProfit ? r.products.filter((p: any) => p.profit < 0) : [];
      const warn = losers.length
        ? `\n\n⚠️ Sold at a loss: ${losers.map((p: any) => `**${p.name}** (${money(p.profit)})`).join(", ")}. Worth checking the cost price.`
        : "";

      return {
        handled: true,
        toolsUsed: track("product_sales", { days, limit: 10 }),
        reply: `Top sellers, ${r.period} (by revenue):\n\n${head}\n${rows}${warn}`,
      };
    },
  },

  // ── Best customers ───────────────────────────────────────────────────────
  {
    test: (t) => has(t, "top customer", "best customer", "biggest customer", "buys most", "buy most", "spend most", "spends most"),
    run: async ({ user, days }) => {
      const r = await runTool("top_customers", { days, limit: 10 }, user);
      if (r.error) return { handled: true, toolsUsed: track("top_customers", { days }), reply: `⚠️ ${r.error}` };
      if (!r.customers?.length) return { handled: true, toolsUsed: track("top_customers", { days }), reply: `No sales in the ${r.period}.` };
      const rows = r.customers.map((c: any) =>
        `| ${c.name} | ${money(c.sales)} | ${c.invoices} | ${money(c.outstanding)} |`).join("\n");
      return {
        handled: true,
        toolsUsed: track("top_customers", { days, limit: 10 }),
        reply: `Top customers, ${r.period}:\n\n| Customer | Bought | Invoices | Still owes |\n| --- | --- | --- | --- |\n${rows}`,
      };
    },
  },

  // ── Stock alerts ─────────────────────────────────────────────────────────
  {
    test: (t) => has(t, "low stock", "low on stock", "stock low", "running low", "out of stock",
      "running out", "reorder", "re order", "restock", "need to order", "finished stock", "stock alert"),
    run: async ({ user }) => {
      const r = await runTool("stock_alerts", {}, user);
      if (r.error) return { handled: true, toolsUsed: track("stock_alerts", {}), reply: `⚠️ ${r.error}` };
      if (!r.totalAlerts) return { handled: true, toolsUsed: track("stock_alerts", {}), reply: "Nothing is low or out of stock right now." };

      const parts: string[] = [];
      if (r.outOfStock.length) {
        parts.push(`**Out of stock (${r.outOfStock.length})**\n\n| Product | Location |\n| --- | --- |\n`
          + r.outOfStock.map((p: any) => `| ${p.name} | ${p.location || "—"} |`).join("\n"));
      }
      if (r.lowStock.length) {
        parts.push(`**Below minimum (${r.lowStock.length})**\n\n| Product | On hand | Minimum |\n| --- | --- | --- |\n`
          + r.lowStock.map((p: any) => `| ${p.name} | ${qty(p.qty)} | ${qty(p.minimum)} |`).join("\n"));
      }
      return { handled: true, toolsUsed: track("stock_alerts", {}), reply: parts.join("\n\n") };
    },
  },

  // ── Whole-business sales / profit ────────────────────────────────────────
  {
    test: (t) => has(t, "profit", "revenue", "turnover", "how much did we make", "how much we made", "total sales", "sales figure", "how are we doing", "business summary"),
    run: async ({ user, days }) => {
      const r = await runTool("business_summary", { days }, user);
      if (r.error) return { handled: true, toolsUsed: track("business_summary", { days }), reply: `⚠️ ${r.error}` };
      const s: any = r.sales || {};
      const lines = [`Trading figures, ${r.period}:`, ``];
      for (const [label, key] of [["Sales", "totalSales"], ["Invoices", "invoiceCount"], ["Gross profit", "grossProfit"], ["Collected", "collected"]] as const) {
        if (s[key] !== undefined) lines.push(`- ${label}: ${key === "invoiceCount" ? s[key] : money(s[key])}`);
      }
      if (r.profitAllTime?.grossProfit !== undefined) {
        lines.push(``, `All-time gross profit: **${money(r.profitAllTime.grossProfit)}**`);
      }
      return { handled: true, toolsUsed: track("business_summary", { days }), reply: lines.join("\n") };
    },
  },

  // ── Stock level / price of one product ───────────────────────────────────
  {
    test: (t) => has(t, "how many", "how much stock", "stock of", "do we have", "in stock", "price of", "cost of", "available"),
    run: async ({ text, user }) => {
      const phrase = stripQuestionWords(text);
      if (!phrase) return null; // nothing left to search on — let something else try
      const r = await runTool("find_product", { query: phrase }, user);
      if (r.error || !r.matches?.length) {
        return { handled: true, toolsUsed: track("find_product", { query: phrase }), reply: `I couldn't find a product matching "${phrase}".` };
      }

      const rows = r.matches.slice(0, 5).map((p: any) =>
        `| ${p.name} | ${qty(p.stockOnHand)} ${p.unit || ""} | ${money(p.salePrice)}${p.costPrice !== undefined ? ` | ${money(p.costPrice)}` : ""} |`).join("\n");
      const head = r.matches[0].costPrice !== undefined
        ? `| Product | On hand | Sells for | Costs |\n| --- | --- | --- | --- |`
        : `| Product | On hand | Sells for |\n| --- | --- | --- |`;
      return {
        handled: true,
        toolsUsed: track("find_product", { query: phrase }),
        reply: `${head}\n${rows}`,
      };
    },
  },

  // ── Bare customer lookup ─────────────────────────────────────────────────
  {
    test: (t) => has(t, "find", "who is", "look up", "lookup", "details of", "detail of", "about"),
    run: async ({ text, user, customers }) => {
      const spot = spotEntity(text, customers as any);
      if (!spot) return null;
      const o = await runTool("customer_overview", { customerId: spot.row.id }, user);
      if (o.error) return { handled: true, toolsUsed: track("customer_overview", { customerId: spot.row.id }), reply: `⚠️ ${o.error}` };
      return {
        handled: true,
        toolsUsed: track("customer_overview", { customerId: spot.row.id }),
        reply: [
          `**${o.name}**${o.phone ? ` · ${o.phone}` : ""}`,
          ``,
          `- Type: ${o.type}`,
          `- Owes now: ${money(o.outstanding)}`,
          `- Credit limit: ${money(o.creditLimit)}`,
          `- Lifetime sales: ${money(o.totalSales)} across ${o.invoiceCount} invoices`,
          o.unpaidInvoices.length ? `- Unpaid invoices: ${o.unpaidInvoices.length}${o.oldestOverdueDays ? `, oldest ${o.oldestOverdueDays} days overdue` : ""}` : `- Nothing outstanding`,
        ].join("\n"),
      };
    },
  },
];

/** What this router can answer, shown when nothing matches and no model is configured. */
export const CAPABILITY_LIST = [
  "What does *[customer]* owe? / their credit outstanding",
  "Who owes us money? / what's overdue?",
  "Which products sold the most? (add \"in the last 90 days\" for a period)",
  "Who are our top customers?",
  "What's low on stock / out of stock?",
  "What's our profit / sales this month?",
  "How many *[product]* do we have?",
  "Send *[customer]* a payment reminder on WhatsApp",
];

/**
 * Try to answer without a model. Returns handled:false when the question is not
 * one of the recognised shapes, so the caller can decide what to do next.
 */
export async function routeQuestion(text: string, user: AssistantUser): Promise<RoutedAnswer> {
  const t = normalizeName(text).toLowerCase();
  const days = parsePeriod(t);

  const [customerRows, productRows] = await Promise.all([getCustomers(), getProducts()]);
  const customers = customerRows.map((c: any) => ({ id: c.id, name: c.name }));
  const products = productRows.map((p: any) => ({ id: p.id, name: p.name }));

  for (const intent of INTENTS) {
    if (!intent.test(t)) continue;
    const answer = await intent.run({ text, user, days, customers, products });
    if (answer) return answer;
  }
  return { handled: false, reply: "", toolsUsed: [] };
}
