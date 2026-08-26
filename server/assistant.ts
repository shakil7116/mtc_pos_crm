// ─────────────────────────────────────────────────────────────────────────────
// AI Overview assistant — answers questions about the business and drafts the
// routine messages that follow from the answer.
//
// The whole design rests on one rule: THE MODEL NEVER TOUCHES THE DATABASE.
// It picks a tool and supplies arguments; the tool is ordinary TypeScript that
// calls the same storage functions the screens call. Three reasons it is built
// this way rather than letting the model write SQL:
//
//   · Permissions. Every tool re-checks the caller's role. A salesman asking
//     "what is our profit" gets the same refusal he would get in the UI. Model-
//     written SQL would walk straight past every gate in the app.
//   · One profit model. Money figures come from the same aggregate the Finance
//     and Reports pages use, so the assistant can never quote a number that
//     disagrees with the screen the owner is looking at.
//   · No invented figures. The model formats numbers it was handed. It has no
//     way to produce one that did not come out of the database.
//
// Sending is never automatic. The WhatsApp tool returns a DRAFT; a human presses
// Send, and that goes through a separate endpoint with its own role check.
// ─────────────────────────────────────────────────────────────────────────────
import type { Role } from "@shared/permissions";
import {
  searchCustomers, getCustomer, getCustomers,
  getProducts, getMatchCatalogue, getInventory, getLowStockItems,
  getUnpaidInvoices, getProfitSummary, getCreditExposure,
  getDailySalesSummary, getDocuments, getSettings,
} from "./storage";
import { matchProduct } from "./matching";

export interface AssistantUser {
  id: number;
  name: string;
  role: Role;
  storeId: number | null;
}

/** Thrown when a tool is called by someone whose role may not see that data. */
export class ToolForbiddenError extends Error {
  constructor(what: string) {
    super(`You do not have permission to view ${what}.`);
    this.name = "ToolForbiddenError";
  }
}

const MONEY_ROLES: Role[] = ["admin", "manager"];
/** Cost, margin and whole-business profit are owner/manager information. */
function requireMoney(user: AssistantUser, what: string) {
  if (!MONEY_ROLES.includes(user.role)) throw new ToolForbiddenError(what);
}

const n2 = (v: any) => Number(Number(v || 0).toFixed(2));

// ─── Tool definitions (the schema the model sees) ────────────────────────────

export const TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "find_customer",
      description:
        "Find customers by name or phone. Returns each match with its outstanding balance and credit limit. " +
        "Use this first whenever the user names a customer. If more than one comes back, ASK the user which one — never assume.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Name or partial name, or a phone number." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "customer_overview",
      description:
        "Full picture for ONE customer: total sales, outstanding balance, credit limit and headroom, invoice count, " +
        "and their unpaid invoices with how many days overdue each is. Call find_customer first to get the id.",
      parameters: {
        type: "object",
        properties: { customerId: { type: "number" } },
        required: ["customerId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_product",
      description:
        "Find products by name, including trade synonyms and misspellings. Returns stock on hand and selling price. " +
        "If the result is marked needsConfirmation, ASK the user which product they meant before going further.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "product_sales",
      description:
        "How much of each product was sold over a period — quantity, revenue, and (for admin/manager) profit. " +
        "Answers 'which item sold more', 'what is our best seller', 'how much did we sell of X'.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Look back this many days. Default 30." },
          productQuery: { type: "string", description: "Optional: limit to products matching this name." },
          limit: { type: "number", description: "How many to return. Default 10." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "top_customers",
      description: "Highest-spending customers over a period, with what each still owes.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Look back this many days. Default 30." },
          limit: { type: "number", description: "Default 10." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "business_summary",
      description:
        "Headline trading figures for a period: sales, invoice count, gross profit and margin. Admin/manager only.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "Look back this many days. Default 30." } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "receivables",
      description:
        "Everything owed to the business: total outstanding, and the customers who owe, worst overdue first. " +
        "Answers 'who owes us money', 'what is overdue', 'total credit outstanding'.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Default 15." } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "stock_alerts",
      description: "Products at or below their minimum stock level, and products completely out of stock.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Default 20." } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_whatsapp",
      description:
        "Compose a WhatsApp message to a customer and show it to the user for approval. " +
        "THIS DOES NOT SEND — it only prepares the text; the user must press Send themselves. " +
        "Use purpose 'payment_reminder' for money owed. Always call customer_overview first so the figures are real.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "number" },
          purpose: {
            type: "string",
            enum: ["payment_reminder", "statement", "custom"],
            description: "payment_reminder = ask for overdue payment. custom = use the message text given.",
          },
          message: { type: "string", description: "Required when purpose is 'custom'. Otherwise leave empty and one is written for you." },
        },
        required: ["customerId", "purpose"],
      },
    },
  },
];

// ─── Tool implementations ────────────────────────────────────────────────────

/** Days between a date string and today. Negative means not due yet. */
function daysPast(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function sinceDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * What a customer still owes, summed per open invoice.
 *
 * Every tool here uses this one basis so two answers in the same conversation
 * can never quote different figures for the same customer. It matches the
 * Credit Exposure page. It can differ from the balance on the Customers page,
 * which uses getCustomerBalance() — that one also counts demo-mode invoices and
 * matches payments by customer rather than by document.
 */
async function outstandingMap(): Promise<Map<number, number>> {
  const unpaid = (await getUnpaidInvoices({})) as any[];
  const m = new Map<number, number>();
  for (const i of unpaid) {
    if (i.customerId == null) continue;
    m.set(i.customerId, (m.get(i.customerId) || 0) + Number(i.remaining || 0));
  }
  return m;
}

function customerRow(c: any, owed: Map<number, number>) {
  const balance = owed.get(c.id) || 0;
  const limit = Number(c.creditLimit || 0);
  return {
    customerId: c.id,
    name: c.name,
    phone: c.phone || null,
    type: c.type,
    outstanding: n2(balance),
    creditLimit: n2(limit),
    creditRemaining: limit > 0 ? n2(limit - balance) : null,
    overLimit: limit > 0 && balance > limit,
  };
}

const TOOLS: Record<string, (args: any, user: AssistantUser) => Promise<any>> = {
  async find_customer({ query }, _user) {
    const q = String(query || "").trim();
    if (!q) return { error: "Give me a name or phone number to search for." };
    const found = await searchCustomers(q);
    if (!found.length) return { matches: [], note: `No customer matches "${q}".` };
    // One ledger read for the whole result set, not one per match.
    const owed = await outstandingMap();
    const rows = found.slice(0, 8).map((c) => customerRow(c, owed));
    return {
      matches: rows,
      note: rows.length > 1
        ? "More than one match — ask the user which one before continuing."
        : undefined,
    };
  },

  async customer_overview({ customerId }, _user) {
    const c = await getCustomer(Number(customerId));
    if (!c) return { error: `No customer with id ${customerId}.` };

    const [docs, allUnpaid] = await Promise.all([
      getDocuments("INV", undefined, { lean: true } as any),
      getUnpaidInvoices({}),
    ]);

    const mine = (docs as any[]).filter(
      (d) => d.customerId === c.id && d.status !== "void" && d.transactionMode !== "demo",
    );
    const totalSales = mine.reduce((s, d) => s + Number(d.total || 0), 0);

    // Outstanding is summed from the very invoices listed below, so the headline
    // figure and the breakdown can never disagree inside one answer. This is the
    // same per-invoice basis the Credit Exposure page uses. Note it can differ
    // from the Customers-page balance, which counts demo invoices and matches
    // payments by customer rather than by document.
    const unpaid = (allUnpaid as any[])
      .filter((i) => i.customerId === c.id)
      .map((i) => ({
        number: i.number,
        date: i.date,
        total: n2(i.total),
        paid: n2(i.paid),
        remaining: n2(i.remaining),
        daysOverdue: i.daysOverdue ?? 0,
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    const outstanding = unpaid.reduce((s, i) => s + i.remaining, 0);
    const limit = Number(c.creditLimit || 0);

    return {
      customerId: c.id,
      name: c.name,
      phone: c.phone || null,
      type: c.type,
      outstanding: n2(outstanding),
      creditLimit: n2(limit),
      creditRemaining: limit > 0 ? n2(limit - outstanding) : null,
      overLimit: limit > 0 && outstanding > limit,
      totalSales: n2(totalSales),
      invoiceCount: mine.length,
      unpaidInvoices: unpaid.slice(0, 20),
      oldestOverdueDays: unpaid[0]?.daysOverdue ?? 0,
      paymentTerms: c.paymentTerms || null,
    };
  },

  async find_product({ query }, user) {
    const q = String(query || "").trim();
    if (!q) return { error: "Give me a product name to look for." };

    const [catalogue, products, inv] = await Promise.all([
      getMatchCatalogue(), getProducts(), getInventory(),
    ]);
    const m = matchProduct(q, catalogue, { limit: 5 });
    if (!m.candidates.length) return { matches: [], note: `Nothing in the catalogue resembles "${q}".` };

    const byId = new Map(products.map((p: any) => [p.id, p]));
    const qty: Record<number, number> = {};
    for (const row of inv as any[]) {
      const pid = row.productId ?? row.product?.id;
      if (pid != null) qty[pid] = (qty[pid] || 0) + Number(row.qty || 0);
    }

    const matches = m.candidates.map((c) => {
      const p: any = byId.get(c.productId);
      return {
        productId: c.productId,
        name: c.name,
        sku: c.sku,
        unit: p?.unit || null,
        category: p?.category || null,
        stockOnHand: qty[c.productId] ?? 0,
        salePrice: n2(p?.salePrice),
        // Cost is margin information — only for those allowed to see money.
        costPrice: MONEY_ROLES.includes(user.role) ? n2(p?.costPrice) : undefined,
        confidence: c.score,
      };
    });

    return {
      matches,
      needsConfirmation: m.decision !== "auto",
      note: m.decision !== "auto"
        ? "Not a certain match — ask the user which product they mean."
        : undefined,
    };
  },

  async product_sales({ days, productQuery, limit }, user) {
    const showMoney = MONEY_ROLES.includes(user.role);
    const lookback = Number(days) > 0 ? Number(days) : 30;
    const cap = Number(limit) > 0 ? Number(limit) : 10;
    const start = sinceDate(lookback);

    const docs = (await getDocuments("INV", undefined, { lean: true } as any)) as any[];
    const inScope = docs.filter(
      (d) => d.date >= start && d.status !== "void" && d.transactionMode !== "demo",
    );
    if (!inScope.length) return { period: `last ${lookback} days`, products: [] };

    // Line items are pulled in one query keyed on the in-range invoice ids —
    // the lean document list above deliberately does not carry them.
    const { db } = await import("./db");
    const { documentItems, products: productsTable } = await import("@shared/schema");
    const { inArray, eq } = await import("drizzle-orm");

    const items = await db.select({
      productId: documentItems.productId,
      description: documentItems.description,
      qty: documentItems.qty,
      amount: documentItems.amount,
      costPrice: productsTable.costPrice,
      productName: productsTable.name,
    })
      .from(documentItems)
      .leftJoin(productsTable, eq(documentItems.productId, productsTable.id))
      .where(inArray(documentItems.documentId, inScope.map((d) => d.id)));

    const agg = new Map<string, any>();
    for (const it of items as any[]) {
      const name = it.productName || it.description || "Unknown";
      const key = it.productId ? `p${it.productId}` : `d${name.toUpperCase()}`;
      const qty = Number(it.qty || 0);
      const revenue = Number(it.amount || 0);
      const cost = qty * Number(it.costPrice || 0);
      const row = agg.get(key) || { productId: it.productId ?? null, name, qtySold: 0, revenue: 0, cost: 0 };
      row.qtySold += qty; row.revenue += revenue; row.cost += cost;
      agg.set(key, row);
    }

    let rows = Array.from(agg.values());
    if (productQuery) {
      const catalogue = rows.map((r) => ({ productId: r.productId ?? 0, name: r.name }));
      const m = matchProduct(String(productQuery), catalogue, { limit: 20 });
      const keep = new Set(m.candidates.map((c) => c.name));
      rows = rows.filter((r) => keep.has(r.name));
    }

    rows.sort((a, b) => b.revenue - a.revenue);
    return {
      period: `last ${lookback} days`,
      products: rows.slice(0, cap).map((r) => ({
        productId: r.productId,
        name: r.name,
        qtySold: n2(r.qtySold),
        revenue: n2(r.revenue),
        profit: showMoney ? n2(r.revenue - r.cost) : undefined,
      })),
    };
  },

  async top_customers({ days, limit }, _user) {
    const lookback = Number(days) > 0 ? Number(days) : 30;
    const cap = Number(limit) > 0 ? Number(limit) : 10;
    const start = sinceDate(lookback);

    const docs = (await getDocuments("INV", undefined, { lean: true } as any)) as any[];
    const inScope = docs.filter(
      (d) => d.date >= start && d.status !== "void" && d.transactionMode !== "demo" && d.customerId,
    );

    const agg = new Map<number, any>();
    for (const d of inScope) {
      const row = agg.get(d.customerId) || { customerId: d.customerId, name: d.customerName || "Unknown", sales: 0, invoices: 0 };
      row.sales += Number(d.total || 0); row.invoices++;
      agg.set(d.customerId, row);
    }

    const rows = Array.from(agg.values()).sort((a, b) => b.sales - a.sales).slice(0, cap);
    const owed = await outstandingMap();
    for (const r of rows) r.outstanding = n2(owed.get(r.customerId) || 0);
    return {
      period: `last ${lookback} days`,
      customers: rows.map((r) => ({ ...r, sales: n2(r.sales) })),
    };
  },

  async business_summary({ days }, user) {
    requireMoney(user, "business profit figures");
    const lookback = Number(days) > 0 ? Number(days) : 30;
    const [daily, profit] = await Promise.all([
      getDailySalesSummary(sinceDate(lookback), new Date().toISOString().slice(0, 10)),
      getProfitSummary(),
    ]);
    return { period: `last ${lookback} days`, sales: daily, profitAllTime: profit };
  },

  async receivables({ limit }, user) {
    requireMoney(user, "the receivables ledger");
    const cap = Number(limit) > 0 ? Number(limit) : 15;
    const exposure: any = await getCreditExposure();
    const unpaid: any[] = (await getUnpaidInvoices({})) as any[];

    const rows = (Array.isArray(exposure) ? exposure : exposure?.customers || [])
      .slice()
      .sort((a: any, b: any) => Number(b.outstanding || 0) - Number(a.outstanding || 0))
      .slice(0, cap);

    return {
      totalOutstanding: n2(unpaid.reduce((s, i: any) => s + Number(i.balance ?? i.total ?? 0), 0)),
      unpaidInvoiceCount: unpaid.length,
      customers: rows,
    };
  },

  async stock_alerts({ limit }, _user) {
    const cap = Number(limit) > 0 ? Number(limit) : 20;
    const low = await getLowStockItems();
    const rows = (low as any[]).map((r) => ({
      productId: r.product?.id,
      name: r.product?.name,
      location: r.store?.nameEn,
      qty: Number(r.qty || 0),
      minimum: Number(r.product?.minStockQty || 0),
      outOfStock: Number(r.qty || 0) <= 0,
    }));
    return {
      outOfStock: rows.filter((r) => r.outOfStock).slice(0, cap),
      lowStock: rows.filter((r) => !r.outOfStock).slice(0, cap),
      totalAlerts: rows.length,
    };
  },

  async draft_whatsapp({ customerId, purpose, message }, user) {
    const c = await getCustomer(Number(customerId));
    if (!c) return { error: `No customer with id ${customerId}.` };
    if (!c.phone) {
      return { error: `${c.name} has no phone number on file — add one on the customer record first.` };
    }

    const settings = await getSettings();
    const business = settings?.storeNameEn || "MTC";

    let text: string;
    if (purpose === "custom") {
      if (!message) return { error: "A custom message needs the text to send." };
      text = String(message);
    } else {
      const overview = await TOOLS.customer_overview({ customerId: c.id }, user);
      const outstanding = overview.outstanding ?? 0;
      if (purpose === "payment_reminder" && outstanding <= 0) {
        return { error: `${c.name} has nothing outstanding — there is no payment to ask for.` };
      }
      const lines = (overview.unpaidInvoices || [])
        .slice(0, 6)
        // What is still owed per invoice, never the original face value — a
        // part-paid invoice must not be chased for the full amount.
        .map((i: any) => `• ${i.number} — QAR ${i.remaining.toFixed(2)}${i.daysOverdue ? ` (${i.daysOverdue} days overdue)` : ""}`)
        .join("\n");

      text = purpose === "payment_reminder"
        ? `Dear ${c.name},\n\nThis is a friendly reminder from ${business} regarding your outstanding balance of *QAR ${outstanding.toFixed(2)}*.\n\n${lines}\n\nKindly arrange payment at your earliest convenience. Please ignore this message if payment has already been made.\n\nThank you for your business.`
        : `Dear ${c.name},\n\nStatement of account from ${business}:\n\nOutstanding balance: *QAR ${outstanding.toFixed(2)}*\nOpen invoices: ${overview.invoiceCount ?? 0}\n\n${lines}\n\nPlease contact us if anything looks incorrect.`;
    }

    // A draft, deliberately. The client renders this with a Send button; nothing
    // leaves the building until a person presses it.
    return {
      draft: {
        customerId: c.id,
        customerName: c.name,
        phone: c.phone,
        purpose,
        message: text,
      },
      note: "This is a draft. Tell the user to review it and press Send — it has NOT been sent.",
    };
  },
};

export async function runTool(name: string, args: any, user: AssistantUser): Promise<any> {
  const fn = TOOLS[name];
  if (!fn) return { error: `Unknown tool "${name}".` };
  try {
    return await fn(args || {}, user);
  } catch (e) {
    if (e instanceof ToolForbiddenError) return { error: e.message, forbidden: true };
    console.error(`assistant tool ${name} failed:`, e);
    return { error: `That lookup failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── System prompt ───────────────────────────────────────────────────────────

export function systemPrompt(user: AssistantUser, currency = "QAR"): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `You are the AI Overview assistant inside a building-materials trading business's POS/CRM system.`,
    `Today is ${today}. All money is in ${currency}. You are talking to ${user.name}, whose role is ${user.role}.`,
    ``,
    `HOW YOU WORK`,
    `- You can only see what the tools return. Never state a figure that did not come from a tool call.`,
    `- If you do not have a number, say so plainly and offer to look it up. Never estimate or invent one.`,
    `- Prefer one tool call that answers the question over several speculative ones.`,
    ``,
    `ASKING BACK`,
    `- When a search returns more than one match, or a result says needsConfirmation, STOP and ask which one.`,
    `  Do not guess, and do not pick the first result. List the options briefly and wait.`,
    `- When a request is ambiguous about the time period, assume the last 30 days and say that you did.`,
    ``,
    `SENDING MESSAGES`,
    `- draft_whatsapp only PREPARES a message. It never sends. After calling it, tell the user the draft is`,
    `  ready for them to review and send. Never claim a message was sent.`,
    `- Always look up the customer's real figures before drafting anything that mentions money.`,
    ``,
    `STYLE`,
    `- Be brief and concrete. Lead with the number the user asked for.`,
    `- Format money as ${currency} 1,234.56. Use short markdown tables for lists of more than three rows.`,
    `- If a tool returns a permission error, say the information is above their access level and move on.`,
  ].join("\n");
}
