import { db } from "./db";
import { computeInvoiceType, computeInvoiceTerms } from "@shared/invoiceType";
import {
  settings, stores, users, customers, products, inventory, suppliers,
  documents, documentItems, payments, cheques, returns as returnsTable,
  returnItems, editLog, messagesLog, stockAdjustments, supplierOrders,
  documentCounters, damageClaims,
  supplierReturns, notifications, cashflow, expenses, warehouseIssues, corrections,
  fieldDefinitions, moduleDefinitions, customRecords, managedLists, numberingAudit,
  ownerLoans,
  type Settings, type InsertSettings,
  type Store, type InsertStore,
  type User, type InsertUser,
  type Customer, type InsertCustomer,
  type Product, type InsertProduct,
  type Inventory, type InsertInventory,
  type Supplier, type InsertSupplier,
  type Document, type InsertDocument, type DocumentWithItems, type CreateDocumentRequest,
  type DocumentItem, type InsertDocumentItem,
  type Payment, type InsertPayment,
  type Cheque, type InsertCheque,
  type Return, type ReturnItem,
  type EditLog,
  type MessagesLog,
  type StockAdjustment,
  type SupplierOrder, type SupplierReturn, type Notification,
  type Cashflow, type Expense, type InsertExpense,
  type WarehouseIssue, type InsertWarehouseIssue,
  type Correction,
} from "@shared/schema";
import { eq, desc, asc, and, or, gte, lte, lt, ne, isNull, sql, inArray } from "drizzle-orm";

export { chatStorage } from "./replit_integrations/chat/storage";

// ─── Settings ────────────────────────────────────────────────────────────────
export async function getSettings(): Promise<Settings | undefined> {
  const [row] = await db.select().from(settings).limit(1);
  return row;
}

export async function upsertSettings(data: Partial<InsertSettings>): Promise<Settings> {
  const existing = await getSettings();
  if (!existing) {
    const [row] = await db.insert(settings).values({
      storeNameEn: "MAMUN M TRADING AND CONTRACTING W.L.L",
      storeNameAr: "مأمون م للتجارة والمقاولات ذ.م.م",
      addressEn: "NAJMA STREET, NAJMA, DOHA, QATAR",
      addressAr: "شارع النجمة، النجمة، الدوحة، قطر",
      phone: "+974 30703722",
      crNumber: "72986/1",
      poBox: "17336",
      ...data,
    }).returning();
    return row;
  }
  const [row] = await db.update(settings).set(data).where(eq(settings.id, existing.id)).returning();
  return row;
}

// ─── Stores ──────────────────────────────────────────────────────────────────
export async function getStores(): Promise<Store[]> {
  return db.select().from(stores).orderBy(asc(stores.id));
}

export async function getStore(id: number): Promise<Store | undefined> {
  const [row] = await db.select().from(stores).where(eq(stores.id, id));
  return row;
}

export async function createStore(data: InsertStore): Promise<Store> {
  const [row] = await db.insert(stores).values(data).returning();
  return row;
}

export async function updateStore(id: number, data: Partial<InsertStore>): Promise<Store> {
  const [row] = await db.update(stores).set(data).where(eq(stores.id, id)).returning();
  return row;
}

// ─── Users ───────────────────────────────────────────────────────────────────
export async function getUsers(): Promise<User[]> {
  return db.select().from(users).orderBy(asc(users.name));
}

export async function getUser(id: number): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

export async function getUserByName(name: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.name, name));
  return row;
}

export async function createUser(data: InsertUser): Promise<User> {
  const [row] = await db.insert(users).values(data).returning();
  return row;
}

export async function updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
  const [row] = await db.update(users).set(data).where(eq(users.id, id)).returning();
  return row;
}

export async function verifyUserPin(userId: number, pin: string): Promise<boolean> {
  const user = await getUser(userId);
  return user?.pin === pin && user?.active === true;
}

// ─── Document Counters ───────────────────────────────────────────────────────
const DOC_COUNTER_DEFAULTS: Record<string, number> = {
  INV: 100360, QT: 197235, DN: 297333, CN: 100001, PO: 100001, RV: 500001,
};

function defaultCounterStart(type: string): number {
  return DOC_COUNTER_DEFAULTS[type] || 100001;
}

// Build a document number from the counter's configurable format.
export function formatDocNumber(
  type: string, n: number,
  counter?: { prefix?: string | null; digits?: number | null; separator?: string | null },
): string {
  const prefix = counter?.prefix ?? type;
  const sep = counter?.separator ?? "-";
  const digits = counter?.digits ?? 0;
  const body = digits && digits > 0 ? String(n).padStart(digits, "0") : String(n);
  return `${prefix}${sep}${body}`;
}

export async function peekNextDocNumber(type: string): Promise<string> {
  const [counter] = await db
    .select()
    .from(documentCounters)
    .where(eq(documentCounters.type, type));
  const next = counter?.nextNumber ?? defaultCounterStart(type);
  return formatDocNumber(type, next, counter);
}

export async function documentNumberExists(number: string): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.number, number))
    .limit(1);
  return Boolean(row);
}

async function syncCounterIfNeeded(type: string, usedNum: number): Promise<void> {
  const [counter] = await db
    .select()
    .from(documentCounters)
    .where(eq(documentCounters.type, type));

  if (!counter) {
    await db.insert(documentCounters).values({
      type,
      nextNumber: Math.max(usedNum + 1, defaultCounterStart(type) + 1),
    });
    return;
  }

  if (usedNum >= counter.nextNumber) {
    await db.update(documentCounters)
      .set({ nextNumber: usedNum + 1 })
      .where(eq(documentCounters.type, type));
  }
}

// Extract the numeric part from any configured format (INV-10034 / INV/10034 / INV10034 / 10034).
function parseDocNumericPart(number: string, _type: string): number | null {
  const m = number.trim().match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

export class DuplicateDocumentNumberError extends Error {
  constructor(public readonly number: string) {
    super(`Document number ${number} already exists`);
    this.name = "DuplicateDocumentNumberError";
  }
}

export class InvalidDocumentNumberError extends Error {
  constructor() {
    super("Invalid document number format");
    this.name = "InvalidDocumentNumberError";
  }
}

export class CreditLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditLimitExceededError";
  }
}

/** Reserve the next sequential number (increments counter). */
export async function getNextDocNumber(type: string): Promise<string> {
  const [counter] = await db
    .select()
    .from(documentCounters)
    .where(eq(documentCounters.type, type));

  if (!counter) {
    const start = defaultCounterStart(type);
    await db.insert(documentCounters).values({ type, nextNumber: start + 1, prefix: type, separator: "-", digits: 0 });
    return formatDocNumber(type, start);
  }

  const num = counter.nextNumber;
  await db.update(documentCounters)
    .set({ nextNumber: num + 1 })
    .where(eq(documentCounters.type, type));
  return formatDocNumber(type, num, counter);
}

/** Use auto-sequential or a validated manual override. */
export async function resolveDocumentNumber(type: string, requested?: string | null): Promise<string> {
  const trimmed = requested?.trim();
  if (!trimmed) {
    return getNextDocNumber(type);
  }

  const numPart = parseDocNumericPart(trimmed, type);
  if (numPart === null) {
    throw new InvalidDocumentNumberError();
  }

  const [counter] = await db.select().from(documentCounters).where(eq(documentCounters.type, type));
  const normalized = formatDocNumber(type, numPart, counter);
  if (await documentNumberExists(normalized)) {
    throw new DuplicateDocumentNumberError(normalized);
  }

  await syncCounterIfNeeded(type, numPart);
  return normalized;
}

// ── Document numbering management (Settings Step 1) ──
export async function getDocumentCounters() {
  return db.select().from(documentCounters).orderBy(asc(documentCounters.type));
}

// Manually set the next number for a type. Logs skipped numbers to the audit trail.
export async function setNextDocNumber(
  type: string, newNext: number,
  opts?: { reason?: string; userId?: number; userName?: string },
) {
  const [counter] = await db.select().from(documentCounters).where(eq(documentCounters.type, type));
  const oldNext = counter?.nextNumber ?? defaultCounterStart(type);
  if (!counter) {
    await db.insert(documentCounters).values({ type, nextNumber: newNext, prefix: type, separator: "-", digits: 0 });
  } else {
    await db.update(documentCounters).set({ nextNumber: newNext }).where(eq(documentCounters.type, type));
  }
  // Record which numbers were skipped (jumped over) — never to be reused.
  const skipped: number[] = [];
  if (newNext > oldNext) for (let i = oldNext; i < newNext; i++) skipped.push(i);
  await db.insert(numberingAudit).values({
    docType: type, oldNext, newNext, skipped,
    reason: opts?.reason ?? null, userId: opts?.userId ?? null, userName: opts?.userName ?? null,
  });
  const [updated] = await db.select().from(documentCounters).where(eq(documentCounters.type, type));
  return updated;
}

export async function updateCounterFormat(
  type: string, fmt: { prefix?: string; digits?: number; separator?: string },
) {
  const patch: any = {};
  if (fmt.prefix !== undefined) patch.prefix = fmt.prefix;
  if (fmt.digits !== undefined) patch.digits = fmt.digits;
  if (fmt.separator !== undefined) patch.separator = fmt.separator;
  const [row] = await db.update(documentCounters).set(patch).where(eq(documentCounters.type, type)).returning();
  return row;
}

export async function getNumberingAudit() {
  return db.select().from(numberingAudit).orderBy(desc(numberingAudit.createdAt));
}

// ─── Customers ───────────────────────────────────────────────────────────────
export async function getCustomers(): Promise<Customer[]> {
  return db.select().from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name));
}

export async function getCustomer(id: number): Promise<Customer | undefined> {
  const [row] = await db.select().from(customers).where(eq(customers.id, id));
  return row;
}

export async function createCustomer(data: InsertCustomer): Promise<Customer> {
  const [row] = await db.insert(customers).values(data).returning();
  return row;
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer> {
  const [row] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
  return row;
}

export async function getCustomerBalance(customerId: number): Promise<number> {
  const docs = await db.select({ total: documents.total, status: documents.status })
    .from(documents)
    .where(and(
      eq(documents.customerId, customerId),
      eq(documents.type, "INV"),
    ));

  // Void and returned invoices are not receivable — exclude from the ledger.
  const totalInvoiced = docs
    .filter((d) => d.status !== "void" && d.status !== "returned")
    .reduce((s, d) => s + parseFloat(d.total || "0"), 0);

  const pays = await db.select({ amount: payments.amount, isRefund: payments.isRefund })
    .from(payments)
    .where(eq(payments.customerId, customerId));

  const totalPaid = pays.reduce((s, p) => {
    return s + (p.isRefund ? -parseFloat(p.amount || "0") : parseFloat(p.amount || "0"));
  }, 0);

  return Math.max(0, totalInvoiced - totalPaid);
}

// ─── Products ────────────────────────────────────────────────────────────────
export async function getProducts(): Promise<Product[]> {
  return db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
}

export async function getProduct(id: number): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row;
}

export async function createProduct(data: InsertProduct): Promise<Product> {
  const [row] = await db.insert(products).values(data).returning();
  return row;
}

export async function updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product> {
  const [row] = await db.update(products).set(data).where(eq(products.id, id)).returning();
  return row;
}

// ─── Inventory ───────────────────────────────────────────────────────────────
export async function getInventory(storeId?: number): Promise<(Inventory & { product: Product; store: Store })[]> {
  const rows = await db.select({
    inv: inventory,
    product: products,
    store: stores,
  })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(stores, eq(inventory.storeId, stores.id))
    .where(storeId ? eq(inventory.storeId, storeId) : undefined)
    .orderBy(asc(products.name));
  return rows.map(r => ({ ...r.inv, product: r.product, store: r.store }));
}

export async function getProductStock(productId: number, storeId: number): Promise<number> {
  const [row] = await db.select().from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));
  return parseFloat(row?.qty || "0");
}

export async function adjustStock(
  productId: number, storeId: number, qtyChange: number,
  type: string, reason?: string, referenceId?: number, userId?: number,
): Promise<void> {
  const existing = await db.select().from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));

  if (existing.length === 0) {
    await db.insert(inventory).values({
      productId, storeId, qty: String(Math.max(0, qtyChange)),
    });
  } else {
    const current = parseFloat(existing[0].qty || "0");
    await db.update(inventory)
      .set({ qty: String(Math.max(0, current + qtyChange)), updatedAt: new Date() })
      .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));
  }
  await db.insert(stockAdjustments).values({
    productId, storeId, qtyChange: String(qtyChange), type, reason, referenceId, userId,
  });
}

export async function getLowStockItems(): Promise<(Inventory & { product: Product; store: Store })[]> {
  const all = await getInventory();
  return all.filter(item => {
    const qty = parseFloat(item.qty || "0");
    const min = parseFloat(item.product.minStockQty || "0");
    return qty <= min && min > 0;
  });
}

// Reorder suggestions (Feature C): low-stock items enriched with a 30-day sales
// velocity and a recommended order quantity that covers ~30 days plus the minimum
// buffer, so one click can raise a PO to the product's usual supplier.
export async function getReorderSuggestions(): Promise<any[]> {
  const low = await getLowStockItems();
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const soldRows = await db.select({ productId: documentItems.productId, qty: documentItems.qty })
    .from(documentItems)
    .leftJoin(documents, eq(documentItems.documentId, documents.id))
    .where(and(eq(documents.type, "INV"), gte(documents.date, since)));
  const soldByProduct: Record<number, number> = {};
  for (const r of soldRows as any[]) if (r.productId) soldByProduct[r.productId] = (soldByProduct[r.productId] || 0) + Number(r.qty || 0);
  const sups = await db.select().from(suppliers);
  const supMap = new Map(sups.map((s: any) => [s.id, s]));

  return low.map((item: any) => {
    const p = item.product;
    const qty = Number(item.qty || 0);
    const min = Number(p.minStockQty || 0);
    const supplierId = p.supplierId ?? null;
    const sup: any = supplierId ? supMap.get(supplierId) : null;
    const velocity = (soldByProduct[p.id] || 0) / 30;          // units/day over last 30 days
    const target = min + Math.ceil(velocity * 30);             // ~30 days cover + min buffer
    const suggestedQty = Math.max(1, Math.ceil(Math.max(target - qty, min * 2 - qty)));
    return {
      productId: p.id, storeId: item.storeId, name: p.name, sku: p.sku, unit: p.unit || "PCS",
      qty, minStockQty: min, supplierId, supplierName: sup?.name ?? null,
      supplierWhatsapp: sup?.whatsapp ?? sup?.phone ?? null,
      velocityPerDay: Number(velocity.toFixed(2)), suggestedQty,
    };
  });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
export async function getSuppliers(): Promise<Supplier[]> {
  return db.select().from(suppliers).where(eq(suppliers.active, true)).orderBy(asc(suppliers.name));
}

export async function getSupplier(id: number): Promise<Supplier | undefined> {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  return row;
}

export async function createSupplier(data: InsertSupplier): Promise<Supplier> {
  const [row] = await db.insert(suppliers).values(data).returning();
  return row;
}

export async function updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier> {
  const [row] = await db.update(suppliers).set(data).where(eq(suppliers.id, id)).returning();
  return row;
}

// ─── Documents ───────────────────────────────────────────────────────────────
export async function getDocuments(type?: string, storeId?: number): Promise<DocumentWithItems[]> {
  let query = db.select().from(documents);
  const conditions = [];
  if (type) conditions.push(eq(documents.type, type));
  if (storeId) conditions.push(eq(documents.storeId, storeId));

  const docs = await db.select().from(documents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documents.createdAt));

  if (docs.length === 0) return [];

  // Batch fetch (avoid N+1: one items query + one customers query for the whole page).
  // The old per-doc loop opened 2 concurrent connections per document, exhausting the
  // Supabase pool ("Connection terminated unexpectedly") and 500-ing the list.
  const docIds = docs.map((d) => d.id);
  const custIds = Array.from(new Set(docs.map((d) => d.customerId).filter((x): x is number => x != null)));

  const allItems = await db.select().from(documentItems).where(inArray(documentItems.documentId, docIds));
  const allCustomers = custIds.length
    ? await db.select().from(customers).where(inArray(customers.id, custIds))
    : [];

  const itemsByDoc = new Map<number, typeof allItems>();
  for (const it of allItems) {
    const arr = itemsByDoc.get(it.documentId) || [];
    arr.push(it);
    itemsByDoc.set(it.documentId, arr);
  }
  const custById = new Map(allCustomers.map((c) => [c.id, c]));

  return docs.map((doc) => ({
    ...doc,
    items: itemsByDoc.get(doc.id) || [],
    customer: doc.customerId != null ? custById.get(doc.customerId) || null : null,
  }));
}

export async function getDocument(id: number): Promise<DocumentWithItems | undefined> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return undefined;
  const items = await db.select().from(documentItems).where(eq(documentItems.documentId, id));
  const pays = await db.select().from(payments).where(eq(payments.documentId, id));
  const customer = doc.customerId
    ? (await db.select().from(customers).where(eq(customers.id, doc.customerId)))[0]
    : null;
  // Invoice type (Cash / Credit) + footer terms — computed live from payments + linked
  // cheques so they always reflect the current payment composition.
  let invoiceType: string | undefined;
  let terms: any;
  if (doc.type === "INV") {
    const chqs = await db.select().from(cheques).where(eq(cheques.documentId, id));
    invoiceType = computeInvoiceType(doc.total || "0", pays as any, chqs as any);
    const cfg: any = await getSettings();
    const m = String(customer?.paymentTerms || "").match(/\d+/);
    const termDays = m ? parseInt(m[0], 10) : Number(cfg?.tierDefaultTermDays ?? 30);
    terms = computeInvoiceTerms({ total: doc.total || "0", date: doc.date, invoiceType: invoiceType as any, payments: pays as any, cheques: chqs as any, termDays });
  }
  return { ...doc, items, payments: pays, customer, invoiceType, terms } as any;
}

export async function createDocument(req: CreateDocumentRequest): Promise<DocumentWithItems> {
  // ── Credit-limit gate (server-side, money integrity) ──
  // The client (SaveInterceptorModal) blocks this too, but a direct API POST must
  // not be able to bypass it. Credit + PDC tenders are deferred credit exposure.
  if (req.type === "INV" && req.customerId && !(req as any).creditOverride) {
    const tendersForLimit: any[] = (req as any).payments || [];
    const deferred = tendersForLimit
      .filter((p) => p.method === "Credit" || p.method === "PDC")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    // If there is no split (no payments array), the whole invoice is the exposure.
    const exposure = tendersForLimit.length > 0 ? deferred : Number(req.total || 0);
    if (exposure > 0) {
      const cust = await getCustomer(req.customerId);
      const limit = Number(cust?.creditLimit || 0);
      if (limit > 0) {
        const balance = await getCustomerBalance(req.customerId);
        if (balance + exposure > limit + 0.005) {
          throw new CreditLimitExceededError(
            `Credit limit exceeded: outstanding QAR ${balance.toFixed(2)} + this credit QAR ${exposure.toFixed(2)} exceeds limit QAR ${limit.toFixed(2)}. An admin override is required.`,
          );
        }
      }
    }
  }

  const number = await resolveDocumentNumber(req.type, req.number);

  const [doc] = await db.insert(documents).values({
    type: req.type,
    number,
    date: req.date,
    poNumber: req.poNumber,
    customerId: req.customerId,
    customerName: req.customerName,
    supplierId: (req as any).supplierId,
    expectedDate: (req as any).expectedDate,
    transactionMode: (req as any).transactionMode,
    paymentType: (req as any).paymentType,
    deliveryMethod: (req as any).deliveryMethod,
    deliveryStatus: (req as any).deliveryStatus,
    deliveryAddress: (req as any).deliveryAddress,
    expectedDeliveryDate: (req as any).expectedDeliveryDate ?? null,
    driverId: (req as any).driverId ?? null,
    deliveryInstructions: (req as any).deliveryInstructions ?? null,
    footerDiscountBy: (req as any).footerDiscountBy ?? null,
    storeId: req.storeId,
    status: req.status || (req.type === "QT" || req.type === "DN" ? "draft" : (req.type === "RV" || req.type === "CN") ? "returned" : "unpaid"),
    discountType: req.discountType,
    discountAmount: req.discountAmount,
    subtotal: req.subtotal,
    taxRate: req.taxRate,
    taxAmount: req.taxAmount,
    total: req.total,
    totalWords: req.totalWords,
    notes: req.notes,
    linkedDocId: req.linkedDocId,
    originalInvoiceId: req.originalInvoiceId,
    createdBy: req.createdBy,
  }).returning();

  // Audit the internal grand-total discount (who + how much) — never printed.
  if ((req as any).footerDiscountBy && Number(req.discountAmount) > 0) {
    await db.insert(editLog).values({
      documentId: doc.id, userId: (req as any).footerDiscountBy, field: "footerDiscount",
      oldValue: "0", newValue: `${req.discountAmount} (${req.discountType})`,
      reason: "Grand-total discount applied", isAdminOverride: true,
    });
  }

  const items: DocumentItem[] = [];
  if (req.items.length > 0) {
    const inserted = await db.insert(documentItems).values(
      req.items.map(item => ({
        documentId: doc.id,
        productId: item.productId,
        sku: item.sku,
        description: item.description,
        qty: String(item.qty),
        unit: item.unit,
        price: String(item.price),
        discountType: item.discountType,
        discountAmount: String(item.discountAmount || "0"),
        amount: String(item.amount),
        locationStoreId: (item as any).locationStoreId ?? null,
      }))
    ).returning();
    items.push(...inserted);
  }

  // Deduct stock for INV — from each line's OWN location (Quick Sale per-line location),
  // falling back to the invoice store when a line has none.
  if (req.type === "INV") {
    for (const item of req.items) {
      if (item.productId) {
        const loc = (item as any).locationStoreId ?? req.storeId;
        if (loc) {
          await adjustStock(
            item.productId, loc, -parseFloat(String(item.qty)),
            "sale", "Invoice sale", doc.id, req.createdBy,
          );
        }
      }
    }
  }

  // Auto-generate the Delivery Note the MOMENT a site-delivery invoice is saved
  // (Agent 2, Bug 5). The DN starts at "pending_pick" so the warehouse sees it
  // immediately; it then flows picked → authorized → delivered. The invoice is
  // not "complete" until its DN is delivered.
  if (req.type === "INV" && (req as any).deliveryMethod === "deliver_site") {
    try {
      const dn = await createDocument({
        type: "DN",
        date: req.date,
        customerId: req.customerId,
        customerName: req.customerName,
        storeId: req.storeId,
        status: "pending_pick",
        deliveryStatus: "pending_pick",
        deliveryAddress: (req as any).deliveryAddress ?? null,
        deliveryInstructions: (req as any).deliveryInstructions ?? null,
        driverId: (req as any).driverId ?? null,
        expectedDeliveryDate: (req as any).expectedDeliveryDate ?? null,
        subtotal: "0", total: "0", taxRate: "0", taxAmount: "0",
        linkedDocId: doc.id,
        originalInvoiceId: doc.id,
        notes: `Auto-generated for site delivery of ${number}`,
        items: (req.items || []).map((i: any) => ({
          productId: i.productId, sku: i.sku, description: i.description,
          qty: i.qty, unit: i.unit, price: "0", discountType: "QAR", discountAmount: "0", amount: "0",
          locationStoreId: i.locationStoreId ?? null, // carry per-line location → DN pick grouping
        })),
        createdBy: req.createdBy,
      } as any);
      // Mark the invoice's own delivery as pending (awaiting the DN to complete).
      await db.update(documents).set({ deliveryStatus: "pending" }).where(eq(documents.id, doc.id));
      doc.deliveryStatus = "pending" as any;
      // Tell the warehouse there is a new pick waiting.
      await createNotification({
        targetRole: "warehouse", type: "pick_pending", title: "New delivery to pick",
        message: `${dn.number} for ${req.customerName || "customer"} — ${(req.items || []).length} line(s) to pick.`,
        link: `/documents/${dn.id}`, entityType: "document", entityId: dn.id, createdBy: req.createdBy,
      });
    } catch (e) { console.error("Auto-DN generation failed:", e); }
  }

  // NOTE (rule 21): a Credit Note must NOT move stock or money on creation — customer
  // returns go through the pending→approve gate (createReturn → approveReturn), which
  // re-credits stock only after an admin/manager approves. Creating a CN/RV document
  // here is a printable record only; no inventory adjustment. (Previously this branch
  // silently re-credited stock, bypassing approval — P0 fixed in Phase 6.)

  // ── Split payment: record each tender. Cash/Card/Online = collected now;
  //    PDC = a tracked cheque (receivable, not collected); Credit = deferred. ──
  const tenders: any[] = (req as any).payments || [];
  let collected = 0;
  for (const p of tenders) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0) continue;
    if (p.method === "Credit") continue; // deferred — creates no payment row, only outstanding balance

    // Mandatory confirmation fields per method — kept SIMPLE (spec rule 22).
    // Cash: nothing. Card: terminal reference only. Online: sender account/IBAN +
    // reference + bank. PDC: cheque no. + clear date + bank (who = auto from customer).
    if (p.method === "Card" && !p.referenceNumber)
      throw new Error("Card payment requires the reference number from the card terminal.");
    if (p.method === "Online Transfer" && (!p.referenceNumber || !p.bankName || !p.accountNumber))
      throw new Error("Online transfer requires sender account/IBAN, reference number and bank name.");
    if (p.method === "PDC" && (!p.chequeNumber || !p.chequeDate || !p.bankName))
      throw new Error("PDC requires cheque number, bank name and cheque date.");

    const methodLabel =
      p.method === "PDC" ? "Cheque" :
      p.method === "Card" ? "Credit Card" :
      p.method === "Online Transfer" ? "Bank Transfer" : "Cash";
    // Confirmation fields on the payment row → searchable ledger for disputes/audit.
    // Staff (recordedBy) + timestamp (createdAt) are automatic.
    const [pay] = await db.insert(payments).values({
      documentId: doc.id, customerId: req.customerId ?? null, amount: String(amt),
      method: methodLabel,
      date: p.method === "Online Transfer" ? (p.transferDate || req.date) : req.date,
      reference: p.method === "PDC" ? (p.chequeNumber || null) : (p.referenceNumber || null),
      accountNumber: p.method === "Online Transfer" ? (p.accountNumber || null) : null,
      bankName: (p.method === "Online Transfer" || p.method === "PDC") ? (p.bankName || null) : null,
      isRefund: false, recordedBy: req.createdBy ?? null,
    }).returning();
    if (p.method === "PDC") {
      // Auto-creates the PDC Tracker entry (receivable), linked to this invoice.
      await db.insert(cheques).values({
        customerId: req.customerId ?? null, paymentId: pay.id, documentId: doc.id,
        type: "receivable", who: req.customerName || null,
        chequeNumber: p.chequeNumber || "", bankName: p.bankName || "", amount: String(amt),
        chequeDate: p.chequeDate || req.date, status: "pending",
      });
      // PDC is a post-dated cheque — not collected cash until it clears.
    } else {
      collected += amt;
      // Money actually collected now → cash-in ledger entry, linked to the invoice.
      // Demo/test transactions never touch the real cash ledger.
      if ((req as any).transactionMode !== "demo") {
        await logCashflow({
          direction: "in", category: "Sales",
          amount: amt, refType: "invoice", refId: doc.id, storeId: req.storeId ?? undefined,
          notes: `${methodLabel} payment on ${number}`, createdBy: req.createdBy,
        });
      }
    }
  }
  // Status reflects money actually collected (PDC + Credit stay receivable).
  if (doc.type === "INV" && tenders.length > 0) {
    const totalNum = parseFloat(doc.total || "0");
    const status = totalNum > 0 && collected >= totalNum - 0.005 ? "paid" : collected > 0 ? "partial" : "unpaid";
    await db.update(documents).set({ status }).where(eq(documents.id, doc.id));
    doc.status = status;
  }

  return { ...doc, items, payments: [] };
}

export async function updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document> {
  const [doc] = await db.update(documents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(documents.id, id))
    .returning();
  return doc;
}

export async function updateDocumentItems(documentId: number, items: Omit<InsertDocumentItem, "documentId">[]): Promise<void> {
  await db.delete(documentItems).where(eq(documentItems.documentId, documentId));
  if (items.length > 0) {
    await db.insert(documentItems).values(
      items.map(item => ({
        documentId,
        productId: item.productId,
        sku: item.sku,
        description: item.description,
        qty: String(item.qty),
        unit: item.unit,
        price: String(item.price),
        discountType: item.discountType,
        discountAmount: String(item.discountAmount || "0"),
        amount: String(item.amount),
      }))
    );
  }
}

export async function deleteDocument(id: number): Promise<void> {
  await db.delete(documentItems).where(eq(documentItems.documentId, id));
  await db.delete(documents).where(eq(documents.id, id));
}

// Business rules (11A) — read live from Settings so the admin can change them
// anytime without code. Falls back to spec defaults if Settings row is missing.
export async function getBusinessRules(): Promise<{ pdcThreshold: number; returnPdcThreshold: number; voidWindowHours: number; pdcAlertDays: number; maintenanceChequeThreshold: number }> {
  const s: any = await getSettings();
  return {
    pdcThreshold: Number(s?.pdcThreshold ?? 4000),               // VOID refunds only
    returnPdcThreshold: Number(s?.returnPdcThreshold ?? 5000),   // RETURN refunds (separate rule)
    voidWindowHours: Number(s?.voidWindowHours ?? 12),
    pdcAlertDays: Number(s?.pdcAlertDays ?? 3),
    maintenanceChequeThreshold: Number(s?.maintenanceChequeThreshold ?? 10000),
  };
}

// Full cancel of an invoice within the void window: reverses inventory, refunds each
// collected payment by its correct method (card→cash, online→online, ≥threshold→PDC),
// cancels pending PDCs, and marks the invoice VOID (number kept, never reused).
export async function voidDocument(id: number, userId?: number): Promise<{ ok: boolean; message?: string; document?: any }> {
  const doc: any = await getDocument(id);
  if (!doc) return { ok: false, message: "Document not found" };
  if (doc.type !== "INV") return { ok: false, message: "Only invoices can be voided" };
  if (doc.status === "void") return { ok: false, message: "Invoice is already void" };
  const { pdcThreshold, voidWindowHours } = await getBusinessRules();
  const created = doc.createdAt ? new Date(doc.createdAt).getTime() : 0;
  const ageHours = created ? (Date.now() - created) / 3_600_000 : 0;
  if (created && ageHours > voidWindowHours) {
    return { ok: false, message: `The ${voidWindowHours}-hour void window has passed — use a Credit Note instead.` };
  }

  // 1. Reverse inventory — add each sold line back to its store.
  if (doc.storeId) {
    for (const it of (doc.items || [])) {
      if (it.productId) await adjustStock(it.productId, doc.storeId, parseFloat(String(it.qty || 0)), "void", "Invoice void", id, userId);
    }
  }

  // 2. Refund each collected payment by the correct method; cancel pending PDCs.
  const pays = await getPayments(id);
  const today = new Date().toISOString().slice(0, 10);
  for (const p of pays as any[]) {
    if (p.isRefund) continue;
    const amt = parseFloat(p.amount || "0");
    if (amt <= 0) continue;
    if (p.method === "Cheque") {
      // Only an uncollected cheque (pending/deposited) can be cancelled — no cash out.
      // A cheque that already CLEARED was collected money: fall through and refund it.
      const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.paymentId, p.id));
      if (!chq || ["pending", "deposited"].includes(chq.status)) {
        if (chq) await db.update(cheques).set({ status: "cancelled" }).where(eq(cheques.id, chq.id));
        continue;
      }
      if (chq.status !== "cleared") continue; // bounced/cancelled — nothing was collected
    }
    // card → cash (never back to card); online → online; else cash. ≥ threshold → PDC.
    let refundMethod = p.method === "Bank Transfer" ? "Bank Transfer" : "Cash";
    if (amt >= pdcThreshold) refundMethod = "Cheque";
    const [refundPay] = await db.insert(payments).values({
      documentId: id, customerId: doc.customerId ?? null, amount: String(amt),
      method: refundMethod, date: today, isRefund: true,
      reference: `Void refund (was ${p.method})`, recordedBy: userId ?? null,
    }).returning();
    if (refundMethod === "Cheque") {
      // Outgoing PDC refund → payable entry in the PDC Tracker, linked to the invoice.
      await db.insert(cheques).values({
        customerId: doc.customerId ?? null, paymentId: refundPay.id, documentId: id,
        type: "payable", who: doc.customerName || null,
        chequeNumber: `REFUND-${doc.number || id}`, bankName: "TBD — issue cheque",
        amount: String(amt), chequeDate: today, status: "pending",
      });
      // Cash leaves only when the payable cheque clears — no cashflow-out yet.
    } else {
      // Cash / bank refund goes out now → money-out ledger entry.
      await logCashflow({
        direction: "out", category: "Customer Refund",
        amount: amt, refType: "invoice", refId: id, storeId: doc.storeId ?? undefined,
        notes: `Void refund on ${doc.number} (${refundMethod})`, createdBy: userId,
      });
    }
  }

  // 3. Mark VOID (keep the number forever) + audit.
  await db.update(documents).set({ status: "void", updatedAt: new Date() }).where(eq(documents.id, id));
  await db.insert(editLog).values({
    documentId: id, userId: userId ?? null, field: "status",
    oldValue: doc.status, newValue: "void", reason: "12-hour void window", isAdminOverride: false,
  });
  return { ok: true, document: { ...doc, status: "void" } };
}

// ─── Payments ────────────────────────────────────────────────────────────────
export async function getPayments(documentId?: number): Promise<Payment[]> {
  if (documentId) {
    return db.select().from(payments).where(eq(payments.documentId, documentId)).orderBy(desc(payments.createdAt));
  }
  return db.select().from(payments).orderBy(desc(payments.createdAt));
}

export async function createPayment(data: InsertPayment): Promise<Payment> {
  const [row] = await db.insert(payments).values(data).returning();

  // Collected money (not cheques — those book on clearance; not refunds — callers
  // log those with their own category) → cash-in ledger entry.
  if (!data.isRefund && data.method !== "Cheque" && Number(data.amount) > 0) {
    const srcDoc: any = data.documentId ? await getDocument(data.documentId) : null;
    if (srcDoc?.transactionMode !== "demo") { // demo payments stay out of the real ledger
      await logCashflow({
        direction: "in", category: "Sales",
        amount: Number(data.amount), refType: "payment", refId: row.id,
        storeId: srcDoc?.storeId ?? undefined,
        notes: `${data.method} payment${srcDoc ? ` on ${srcDoc.number}` : ""}`,
        createdBy: (data as any).recordedBy ?? undefined, date: String(data.date),
      });
    }
  }

  // Update document status
  if (data.documentId) {
    const doc = await getDocument(data.documentId);
    if (doc) {
      const allPays = await getPayments(data.documentId);
      // Net collected = payments minus refunds. Refund rows (isRefund) must NOT
      // count as money collected, or a refund would flip an invoice to "paid".
      const totalPaid = allPays.reduce(
        (s, p) => s + (p.isRefund ? -1 : 1) * parseFloat(p.amount || "0"), 0);
      const total = parseFloat(doc.total || "0");
      // Never overwrite a terminal status (a void/returned invoice stays that way).
      if (doc.status !== "void" && doc.status !== "returned") {
        // Compare with a small epsilon so cumulative partial payments that sum to the
        // total (across any number of payments / days) correctly flip to "paid" despite
        // floating-point drift (e.g. 1944.999999 ≥ 1945).
        const status = total > 0 && totalPaid >= total - 0.005 ? "paid" : totalPaid > 0.005 ? "partial" : "unpaid";
        await updateDocument(data.documentId, { status });
      }
    }
  }
  return row;
}

// ─── Cheques ─────────────────────────────────────────────────────────────────
export async function getCheques(opts?: { start?: string; end?: string }): Promise<(Cheque & { customer?: Customer; customerName?: string | null })[]> {
  const conditions = [];
  if (opts?.start) conditions.push(gte(cheques.chequeDate, opts.start));
  if (opts?.end) conditions.push(lte(cheques.chequeDate, opts.end));

  const rows = conditions.length
    ? await db.select().from(cheques).where(and(...conditions)).orderBy(asc(cheques.chequeDate))
    : await db.select().from(cheques).orderBy(asc(cheques.chequeDate));

  return Promise.all(rows.map(async (c) => {
    const customer = c.customerId
      ? (await db.select().from(customers).where(eq(customers.id, c.customerId)))[0]
      : undefined;
    return { ...c, customer, customerName: customer?.name ?? null };
  }));
}

export async function createCheque(data: InsertCheque): Promise<Cheque> {
  const [row] = await db.insert(cheques).values(data).returning();
  return row;
}

export async function updateCheque(id: number, data: Partial<InsertCheque>): Promise<Cheque> {
  const [row] = await db.update(cheques).set(data).where(eq(cheques.id, id)).returning();
  return row;
}

// ─── Cash Flow ledger ─────────────────────────────────────────────────────────
// Every money movement (in/out) lands here, linked to its source document,
// the staff member, the location, and stamped with date+time.
export async function logCashflow(data: {
  direction: "in" | "out"; category: string; amount: number;
  refType?: string; refId?: number; storeId?: number | null;
  notes?: string; createdBy?: number | null; date?: string;
}): Promise<void> {
  if (!(Number(data.amount) > 0)) return;
  await db.insert(cashflow).values({
    direction: data.direction, category: data.category,
    amount: String(Number(data.amount)),
    refType: data.refType ?? null, refId: data.refId ?? null,
    storeId: data.storeId ?? null, notes: data.notes ?? null,
    date: data.date || new Date().toISOString().slice(0, 10),
    createdBy: data.createdBy ?? null,
  });
}

export async function getCashflow(opts?: { start?: string; end?: string; storeId?: number; direction?: string }): Promise<Cashflow[]> {
  const conds: any[] = [];
  if (opts?.start) conds.push(gte(cashflow.date, opts.start));
  if (opts?.end) conds.push(lte(cashflow.date, opts.end));
  if (opts?.storeId) conds.push(eq(cashflow.storeId, opts.storeId));
  if (opts?.direction) conds.push(eq(cashflow.direction, opts.direction));
  const q = conds.length ? db.select().from(cashflow).where(and(...conds)) : db.select().from(cashflow);
  return q.orderBy(desc(cashflow.id)).limit(500);
}

// Real-time cash position: per-location + company total, split cash-in-hand vs
// bank vs PDC-pending (receivable cheques not yet cleared).
export async function getCashPosition(): Promise<{
  perStore: Array<{ storeId: number | null; storeName: string; net: number }>;
  total: number; cashInHand: number; bank: number; pdcPending: number; pdcPayable: number;
}> {
  const rows = await db.select().from(cashflow);
  const allStores = await db.select().from(stores);
  // Opening balances (Go-Live) seed the position so it never shows spuriously
  // negative just because outflows were booked before any opening float.
  const [cfg] = await db.select().from(settings).limit(1);
  const openingCash = Number(cfg?.openingCash || 0);
  const openingBank = Number(cfg?.openingBank || 0);
  const byStore = new Map<number | null, number>();
  let total = openingCash + openingBank;
  for (const r of rows) {
    const amt = Number(r.amount || 0) * (r.direction === "in" ? 1 : -1);
    total += amt;
    byStore.set(r.storeId ?? null, (byStore.get(r.storeId ?? null) || 0) + amt);
  }
  // Split by instrument: cashflow notes tag the method. Only genuine Cash hits the
  // till; Bank Transfer / Online / Cheque / Card all move through the bank — a
  // cheque-paid expense (e.g. shop rent) must NOT drain cash-in-hand.
  let cashInHand = openingCash, bank = openingBank;
  for (const r of rows) {
    const amt = Number(r.amount || 0) * (r.direction === "in" ? 1 : -1);
    if (/bank transfer|online|cheque|card/i.test(r.notes || "")) bank += amt; else cashInHand += amt;
  }
  const pend = await db.select().from(cheques).where(eq(cheques.status, "pending"));
  const pdcPending = pend.filter((c: any) => c.type !== "payable").reduce((s, c) => s + Number(c.amount || 0), 0);
  const pdcPayable = pend.filter((c: any) => c.type === "payable").reduce((s, c) => s + Number(c.amount || 0), 0);
  return {
    perStore: Array.from(byStore.entries()).map(([storeId, net]) => ({
      storeId,
      storeName: storeId ? (allStores.find((s) => s.id === storeId)?.nameEn || `#${storeId}`) : "Unassigned",
      net: Number(net.toFixed(2)),
    })),
    total: Number(total.toFixed(2)),
    cashInHand: Number(cashInHand.toFixed(2)),
    bank: Number(bank.toFixed(2)),
    pdcPending: Number(pdcPending.toFixed(2)),
    pdcPayable: Number(pdcPayable.toFixed(2)),
  };
}

// ─── Insufficient-funds guard ────────────────────────────────────────────────
// Never let a payment drain more than we actually hold. Blocks cash / bank
// outflows above the live balance of that instrument. Admin may override with a
// reason (e.g. real till count differs) — the override is permanently logged.
export class InsufficientFundsError extends Error {
  code = "INSUFFICIENT_FUNDS";
  instrument: "cash" | "bank";
  balance: number;
  requested: number;
  constructor(instrument: "cash" | "bank", balance: number, requested: number) {
    const label = instrument === "bank" ? "bank balance" : "cash in hand";
    super(`Insufficient ${label} — current balance is QAR ${balance.toFixed(2)}, cannot pay QAR ${requested.toFixed(2)}.`);
    this.name = "InsufficientFundsError";
    this.instrument = instrument;
    this.balance = balance;
    this.requested = requested;
  }
}

/** Which instrument does a payment method draw from? Cash → till, everything
    else (Bank Transfer / Online / Cheque / Card) → bank. Mirrors getCashPosition. */
export function methodInstrument(method?: string): "cash" | "bank" {
  return /bank transfer|online|cheque|card/i.test(method || "") ? "bank" : "cash";
}

/** Throw InsufficientFundsError if `amount` exceeds the live balance of
    `instrument`, unless an admin `override` (with non-empty reason) is given — in
    which case the override is written to the audit trail and the outflow proceeds. */
export async function ensureFunds(opts: {
  instrument: "cash" | "bank";
  amount: number;
  override?: boolean;
  overrideReason?: string;
  userId?: number;
  context: string;
}): Promise<void> {
  const amount = Number(opts.amount || 0);
  if (!(amount > 0)) return;
  const pos = await getCashPosition();
  const balance = opts.instrument === "bank" ? pos.bank : pos.cashInHand;
  if (amount <= balance + 1e-9) return; // enough on the books — allow
  if (opts.override) {
    const reason = (opts.overrideReason || "").trim();
    if (!reason) throw new Error("Override requires a reason.");
    await createNotification({
      targetRole: "admin",
      type: "cash_override",
      title: "Cash/bank balance override used",
      message: `${opts.context}: paid QAR ${amount.toFixed(2)} from ${opts.instrument === "bank" ? "bank" : "cash in hand"} while the system balance was QAR ${balance.toFixed(2)}. Reason: ${reason}`,
      link: "/reports/finance?tab=cash-position",
      createdBy: opts.userId,
    });
    return;
  }
  throw new InsufficientFundsError(opts.instrument, balance, amount);
}

// ─── PDC Tracker: status transitions + alerts ────────────────────────────────
// Pending → Deposited → Cleared | Bounced. Clearing books the money movement
// (in for receivable, out for payable). Bouncing flags the customer/supplier
// record (customData bag — dynamic, no migration) and alerts the admin.
export async function setChequeStatus(id: number, status: string, userId?: number, fundsOverride?: { override?: boolean; overrideReason?: string }): Promise<Cheque> {
  const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.id, id));
  if (!chq) throw new Error("Cheque not found");
  const ALLOWED = ["pending", "deposited", "cleared", "bounced", "cancelled"];
  if (!ALLOWED.includes(status)) throw new Error(`Invalid cheque status: ${status}`);
  if (chq.status === status) return chq;
  if (["cleared", "bounced", "cancelled"].includes(chq.status))
    throw new Error(`Cheque is already ${chq.status} — terminal state.`);

  // Clearing a PAYABLE cheque is the moment its money actually leaves the bank — this
  // is the single point a cheque expense is booked. Guard it against overdraw here
  // (admin may override with a reason). Check BEFORE marking cleared so a block leaves
  // no half-cleared cheque.
  if (status === "cleared" && chq.type === "payable") {
    await ensureFunds({
      instrument: "bank",
      amount: Number(chq.amount || 0),
      override: fundsOverride?.override, overrideReason: fundsOverride?.overrideReason, userId,
      context: `Cheque ${chq.chequeNumber} clearing (${chq.who || "payable"})`,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const patch: any = { status };
  if (status === "deposited") patch.depositedDate = today;
  if (status === "cleared") patch.clearedDate = today;
  if (status === "bounced") patch.bouncedDate = today;
  const [row] = await db.update(cheques).set(patch).where(eq(cheques.id, id)).returning();

  if (status === "cleared") {
    // Money actually moves on clearance.
    const doc: any = chq.documentId ? await getDocument(chq.documentId) : null;
    await logCashflow({
      direction: chq.type === "payable" ? "out" : "in",
      category: chq.type === "payable" ? "PDC Payment Issued" : "PDC Cleared",
      amount: Number(chq.amount || 0), refType: "cheque", refId: chq.id,
      storeId: doc?.storeId ?? undefined,
      notes: `Cheque ${chq.chequeNumber} cleared (${chq.bankName})`, createdBy: userId,
    });
  }

  if (status === "bounced") {
    // Flag the party record via the dynamic customData bag.
    if (chq.customerId) {
      const [cust]: any[] = await db.select().from(customers).where(eq(customers.id, chq.customerId));
      if (cust) {
        const bag = { ...(cust.customData || {}), chequeBounced: true, lastBouncedCheque: chq.chequeNumber, lastBouncedDate: today };
        await db.update(customers).set({ customData: bag }).where(eq(customers.id, chq.customerId));
      }
    }
    if (chq.supplierId) {
      const [sup]: any[] = await db.select().from(suppliers).where(eq(suppliers.id, chq.supplierId));
      if (sup) {
        const bag = { ...(sup.customData || {}), chequeBounced: true, lastBouncedCheque: chq.chequeNumber, lastBouncedDate: today };
        await db.update(suppliers).set({ customData: bag }).where(eq(suppliers.id, chq.supplierId));
      }
    }
    await createNotification({
      targetRole: "admin", type: "cheque_bounced", title: "Cheque bounced",
      message: `Cheque ${chq.chequeNumber} (${chq.bankName}) QAR ${Number(chq.amount || 0).toFixed(2)} from ${chq.who || "unknown"} BOUNCED.`,
      link: "/pdc", entityType: "cheque", entityId: chq.id, createdBy: userId,
    });
  }
  return row;
}

// Cheque detail bundle: the cheque, its linked document (invoice/PO/expense) and a
// status timeline built from the cheque's own dates + any logged corrections.
export async function getChequeDetail(id: number) {
  const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.id, id));
  if (!chq) return undefined;
  const linkedDoc = chq.documentId ? await getDocument(chq.documentId).catch(() => null) : null;
  const history: { at: string; label: string; note?: string }[] = [];
  if (chq.createdAt) history.push({ at: new Date(chq.createdAt).toISOString().slice(0, 10), label: "Recorded" });
  if (chq.depositedDate) history.push({ at: chq.depositedDate, label: "Deposited" });
  if (chq.clearedDate) history.push({ at: chq.clearedDate, label: "Cleared" });
  if (chq.bouncedDate) history.push({ at: chq.bouncedDate, label: "Bounced" });
  const corr = await getCorrections("cheque", id);
  for (const c of corr as any[]) history.push({ at: new Date(c.createdAt).toISOString().slice(0, 10), label: `Corrected: ${c.oldValue} → ${c.newValue}`, note: c.reason });
  history.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  return { ...chq, linkedDoc, history };
}

// Attach/replace a scanned cheque image (base64 data URL, validated + size-capped).
export async function setChequePhoto(id: number, photoUrl: string): Promise<Cheque> {
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(photoUrl)) throw new Error("Photo must be a PNG/JPG/WebP image.");
  if (photoUrl.length > 6_000_000) throw new Error("Image too large — keep it under ~4 MB.");
  const [row] = await db.update(cheques).set({ photoUrl }).where(eq(cheques.id, id)).returning();
  if (!row) throw new Error("Cheque not found");
  return row;
}

// Alert admin + manager N days (Settings) before each pending cheque's date.
// Idempotent per cheque: skips if an alert notification already exists.
export async function checkPdcAlerts(): Promise<number> {
  const { pdcAlertDays } = await getBusinessRules();
  const horizon = new Date(); horizon.setDate(horizon.getDate() + pdcAlertDays);
  const horizonStr = horizon.toISOString().slice(0, 10);
  const due = await db.select().from(cheques)
    .where(and(inArray(cheques.status, ["pending", "deposited"]), lte(cheques.chequeDate, horizonStr)));
  let created = 0;
  for (const chq of due as any[]) {
    const existing = await db.select().from(notifications)
      .where(and(eq(notifications.type, "pdc_due"), eq(notifications.entityType, "cheque"), eq(notifications.entityId, chq.id)));
    if (existing.length) continue;
    const msg = `Cheque ${chq.chequeNumber} (${chq.bankName}) QAR ${Number(chq.amount || 0).toFixed(2)} — ${chq.type === "payable" ? "we must cover it" : "deposit"} by ${chq.chequeDate}.`;
    await createNotification({ targetRole: "admin", type: "pdc_due", title: "PDC due soon", message: msg, link: "/pdc", entityType: "cheque", entityId: chq.id });
    await createNotification({ targetRole: "manager", type: "pdc_due", title: "PDC due soon", message: msg, link: "/pdc", entityType: "cheque", entityId: chq.id });
    created++;
  }
  return created;
}

// ─── Expenses (Module 5) ─────────────────────────────────────────────────────
export async function createExpense(data: InsertExpense & { createdBy?: number; override?: boolean; overrideReason?: string }): Promise<Expense> {
  // Spec Module 6: maintenance payments above the (Settings-driven) threshold
  // must be issued by cheque, not cash. Enforced here, adjustable in Settings.
  if (/maintenance/i.test(data.category || "")) {
    const { maintenanceChequeThreshold } = await getBusinessRules();
    if (Number(data.amount) > maintenanceChequeThreshold && data.paymentMethod !== "Cheque") {
      throw new Error(
        `Maintenance payments above QAR ${maintenanceChequeThreshold.toFixed(0)} must be paid by cheque (Settings → Business Rules).`,
      );
    }
  }
  // A cheque is post-dated: the money only leaves the bank when it CLEARS, not when
  // it is written. So a cheque expense does NOT need funds today and is NOT booked to
  // cashflow here — it is booked exactly once, at clearance (setChequeStatus →
  // "PDC Payment Issued"). Cash / Bank Transfer / Card / Online move immediately.
  const isCheque = data.paymentMethod === "Cheque";
  if (!isCheque) {
    // Guard: don't let an immediate expense pay out more than we hold in that instrument.
    await ensureFunds({
      instrument: methodInstrument(data.paymentMethod),
      amount: Number(data.amount),
      override: data.override, overrideReason: data.overrideReason, userId: data.createdBy,
      context: `Expense: ${data.category}`,
    });
  }
  const [row] = await db.insert(expenses).values({
    ...data,
    amount: String(data.amount),
    // Recurring: schedule the first reminder from the expense date.
    nextDueDate: data.isRecurring
      ? (data.nextDueDate || nextDue(String(data.date), data.frequency || "monthly"))
      : null,
  }).returning();
  if (isCheque) {
    // Track a PAYABLE cheque (details editable in PDC Tracker). Linked to the expense
    // via refId so clearance/update/delete can find it. No immediate cashflow row.
    await db.insert(cheques).values({
      type: "payable", who: data.category, documentId: null,
      refType: "expense", refId: row.id,
      chequeNumber: (data as any).chequeNumber || "—", bankName: (data as any).bankName || "—",
      amount: String(data.amount), chequeDate: String(data.date), status: "pending",
    });
  } else {
    // Money out immediately, linked to the expense + location + staff.
    await logCashflow({
      direction: "out", category: `Expense: ${data.category}`,
      amount: Number(data.amount), refType: "expense", refId: row.id,
      storeId: data.storeId ?? undefined,
      notes: `${data.category}${data.notes ? ` — ${data.notes}` : ""} (${data.paymentMethod || "Cash"})`,
      createdBy: data.createdBy, date: String(data.date),
    });
  }
  return row;
}

function nextDue(fromDate: string, frequency: string): string {
  const d = new Date(fromDate);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1); // monthly default
  return d.toISOString().slice(0, 10);
}

export async function getExpenses(opts?: { start?: string; end?: string; storeId?: number; category?: string; includeDeleted?: boolean }): Promise<Expense[]> {
  const conds: any[] = [];
  if (!opts?.includeDeleted) conds.push(isNull(expenses.deletedAt)); // soft-deleted hidden by default
  if (opts?.start) conds.push(gte(expenses.date, opts.start));
  if (opts?.end) conds.push(lte(expenses.date, opts.end));
  if (opts?.storeId) conds.push(eq(expenses.storeId, opts.storeId));
  if (opts?.category) conds.push(eq(expenses.category, opts.category));
  const q = conds.length ? db.select().from(expenses).where(and(...conds)) : db.select().from(expenses);
  return q.orderBy(desc(expenses.date), desc(expenses.id));
}

export async function updateExpense(id: number, data: Partial<InsertExpense>): Promise<Expense> {
  const patch: any = { ...data };
  if (patch.amount !== undefined) patch.amount = String(patch.amount);
  const [row] = await db.update(expenses).set(patch).where(eq(expenses.id, id)).returning();
  const touchedMoney = data.amount !== undefined || data.category !== undefined || data.storeId !== undefined || data.date !== undefined;
  if (touchedMoney) {
    if (row.paymentMethod === "Cheque") {
      // Cheque expense has NO expense cashflow (money moves at clearance). Keep the
      // linked payable cheque in sync while it's still pending — don't log anything.
      await db.update(cheques)
        .set({ amount: String(row.amount), chequeDate: String(row.date), who: row.category })
        .where(and(eq(cheques.refType, "expense"), eq(cheques.refId, id), eq(cheques.status, "pending")));
    } else {
      // Immediate-payment expense: re-log the money-out row so cash position never drifts.
      await db.delete(cashflow).where(and(eq(cashflow.refType, "expense"), eq(cashflow.refId, id)));
      await logCashflow({
        direction: "out", category: `Expense: ${row.category}`,
        amount: Number(row.amount), refType: "expense", refId: row.id,
        storeId: row.storeId ?? undefined,
        notes: `${row.category}${row.notes ? ` — ${row.notes}` : ""} (${row.paymentMethod || "Cash"})`,
        createdBy: row.createdBy ?? undefined, date: String(row.date),
      });
    }
  }
  return row;
}

export async function deleteExpense(id: number): Promise<void> {
  // Remove the ledger row too — a deleted expense must not keep skewing cash position.
  await db.delete(cashflow).where(and(eq(cashflow.refType, "expense"), eq(cashflow.refId, id)));
  // Cancel a still-pending linked payable cheque so it can't clear into a phantom
  // payment later. A cheque that already CLEARED is left alone (real money moved).
  await db.delete(cheques).where(and(eq(cheques.refType, "expense"), eq(cheques.refId, id), eq(cheques.status, "pending")));
  await db.delete(expenses).where(eq(expenses.id, id));
}

// Recurring reminders: for every recurring expense whose nextDueDate has arrived,
// notify the admin and roll the date forward. Idempotent per occurrence (the roll
// forward is the dedupe). Admin then confirms by logging the occurrence.
export async function checkRecurringExpenses(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const due = await db.select().from(expenses)
    .where(and(eq(expenses.isRecurring, true), lte(expenses.nextDueDate, today)));
  let created = 0;
  for (const ex of due as any[]) {
    await createNotification({
      targetRole: "admin", type: "recurring_expense_due",
      title: "Recurring expense due",
      message: `${ex.category} QAR ${Number(ex.amount || 0).toFixed(2)} (${ex.frequency}) is due — confirm and log this occurrence.`,
      link: "/expenses", entityType: "expense", entityId: ex.id,
    });
    await db.update(expenses)
      .set({ nextDueDate: nextDue(ex.nextDueDate || today, ex.frequency || "monthly") })
      .where(eq(expenses.id, ex.id));
    created++;
  }
  return created;
}

// ─── Corrections (undo/reversal system — admin/manager only, append-only log) ─
export async function logCorrection(data: {
  entityType: string; entityId: number; field: string;
  oldValue?: string | null; newValue?: string | null; reason: string; correctedBy?: number;
}): Promise<void> {
  await db.insert(corrections).values({
    entityType: data.entityType, entityId: data.entityId, field: data.field,
    oldValue: data.oldValue ?? null, newValue: data.newValue ?? null,
    reason: data.reason, correctedBy: data.correctedBy ?? null,
  });
}

export async function getCorrections(entityType?: string, entityId?: number): Promise<Correction[]> {
  const conds: any[] = [];
  if (entityType) conds.push(eq(corrections.entityType, entityType));
  if (entityId) conds.push(eq(corrections.entityId, entityId));
  const q = conds.length ? db.select().from(corrections).where(and(...conds)) : db.select().from(corrections);
  return q.orderBy(desc(corrections.id)).limit(200);
}

// Reverse a cheque status entered by mistake (cleared→deposited→pending etc.).
// If the wrong "cleared" already booked a cashflow movement, book the opposite
// entry — history is never deleted, only added to.
export async function reverseChequeStatus(id: number, targetStatus: string, reason: string, userId?: number): Promise<Cheque> {
  const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.id, id));
  if (!chq) throw new Error("Cheque not found");
  const ALLOWED = ["pending", "deposited", "cleared"];
  if (!ALLOWED.includes(targetStatus)) throw new Error(`Cannot reverse to '${targetStatus}'`);
  if (chq.status === targetStatus) return chq;
  if (!reason?.trim()) throw new Error("A reason note is mandatory for corrections.");

  // Undo the money movement if we are stepping back from CLEARED.
  if (chq.status === "cleared" && targetStatus !== "cleared") {
    const doc: any = chq.documentId ? await getDocument(chq.documentId) : null;
    await logCashflow({
      direction: chq.type === "payable" ? "in" : "out", // opposite of the clear booking
      category: "Correction — cheque clear reversed",
      amount: Number(chq.amount || 0), refType: "cheque", refId: chq.id,
      storeId: doc?.storeId ?? undefined,
      notes: `Reversal: cheque ${chq.chequeNumber} un-cleared (${reason.trim().slice(0, 120)})`,
      createdBy: userId,
    });
  }

  const patch: any = { status: targetStatus };
  if (targetStatus === "pending") { patch.depositedDate = null; patch.clearedDate = null; }
  if (targetStatus === "deposited") patch.clearedDate = null;
  const [row] = await db.update(cheques).set(patch).where(eq(cheques.id, id)).returning();
  await logCorrection({ entityType: "cheque", entityId: id, field: "status", oldValue: chq.status, newValue: targetStatus, reason, correctedBy: userId });
  return row;
}

// Correct a payment recorded with the wrong method or amount. The original
// values are preserved permanently in the corrections log; the row is updated
// so ledgers and statuses recompute correctly.
export async function correctPayment(
  id: number,
  patch: { method?: string; amount?: number },
  reason: string,
  userId?: number,
): Promise<Payment> {
  const [pay]: any[] = await db.select().from(payments).where(eq(payments.id, id));
  if (!pay) throw new Error("Payment not found");
  if (!reason?.trim()) throw new Error("A reason note is mandatory for corrections.");
  const VALID_METHODS = ["Cash", "Bank Transfer", "Credit Card", "Cheque"];
  if (patch.method && !VALID_METHODS.includes(patch.method)) throw new Error(`Invalid method: ${patch.method}`);
  if (patch.method === "Cheque" || pay.method === "Cheque")
    throw new Error("Cheque payments are corrected in the PDC Tracker (status reversal), not here.");

  const upd: any = {};
  if (patch.method && patch.method !== pay.method) {
    upd.method = patch.method;
    await logCorrection({ entityType: "payment", entityId: id, field: "method", oldValue: pay.method, newValue: patch.method, reason, correctedBy: userId });
  }
  if (patch.amount != null && Number(patch.amount) !== Number(pay.amount)) {
    if (!(Number(patch.amount) > 0)) throw new Error("Corrected amount must be positive.");
    upd.amount = String(Number(patch.amount));
    await logCorrection({ entityType: "payment", entityId: id, field: "amount", oldValue: String(pay.amount), newValue: upd.amount, reason, correctedBy: userId });
  }
  if (!Object.keys(upd).length) return pay;

  const [row] = await db.update(payments).set(upd).where(eq(payments.id, id)).returning();

  // Reconcile the cashflow entry tied to this payment (delete+relog keeps one source row;
  // the correction log preserves the original values permanently).
  if (!pay.isRefund && pay.method !== "Cheque") {
    await db.delete(cashflow).where(and(eq(cashflow.refType, "payment"), eq(cashflow.refId, id)));
    const srcDoc: any = pay.documentId ? await getDocument(pay.documentId) : null;
    await logCashflow({
      direction: "in", category: "Sales",
      amount: Number(row.amount), refType: "payment", refId: row.id,
      storeId: srcDoc?.storeId ?? undefined,
      notes: `${row.method} payment${srcDoc ? ` on ${srcDoc.number}` : ""} (corrected)`,
      createdBy: userId, date: String(row.date),
    });
  }

  // Recompute the document's paid/partial/unpaid status with corrected numbers.
  if (pay.documentId) {
    const doc = await getDocument(pay.documentId);
    if (doc && doc.status !== "void" && doc.status !== "returned") {
      const allPays = await getPayments(pay.documentId);
      const totalPaid = allPays.reduce((s, p) => s + (p.isRefund ? -1 : 1) * parseFloat(p.amount || "0"), 0);
      const total = parseFloat(doc.total || "0");
      const status = total > 0 && totalPaid >= total - 0.005 ? "paid" : totalPaid > 0 ? "partial" : "unpaid";
      await updateDocument(pay.documentId, { status });
    }
  }
  return row;
}

// Soft-delete an expense (never truly removed). Reason mandatory.
export async function softDeleteExpense(id: number, reason: string, userId?: number): Promise<Expense> {
  const [ex]: any[] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!ex) throw new Error("Expense not found");
  if (ex.deletedAt) return ex;
  if (!reason?.trim()) throw new Error("A reason note is mandatory to delete an expense.");
  const [row] = await db.update(expenses)
    .set({ deletedAt: new Date(), deletedBy: userId ?? null, deleteReason: reason.trim() })
    .where(eq(expenses.id, id)).returning();
  // Money-out entry no longer counts toward cash position.
  await db.delete(cashflow).where(and(eq(cashflow.refType, "expense"), eq(cashflow.refId, id)));
  await logCorrection({ entityType: "expense", entityId: id, field: "deleted", oldValue: "active", newValue: "deleted", reason, correctedBy: userId });
  return row;
}

// Delivery marked Delivered by mistake → back to pending (in transit).
export async function reverseDelivery(documentId: number, reason: string, userId?: number): Promise<void> {
  const doc: any = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");
  if (doc.deliveryStatus !== "delivered") throw new Error("This delivery is not marked delivered.");
  if (!reason?.trim()) throw new Error("A reason note is mandatory for corrections.");
  await updateDocument(documentId, { deliveryStatus: "pending" } as any);
  await logCorrection({ entityType: "delivery", entityId: documentId, field: "deliveryStatus", oldValue: "delivered", newValue: "pending", reason, correctedBy: userId });
  await logEdit({ documentId, userId, field: "deliveryStatus", oldValue: "delivered", newValue: "pending", reason: `Correction: ${reason.trim().slice(0, 120)}`, isAdminOverride: true });
  if (doc.driverId) {
    await createNotification({
      targetUserId: doc.driverId, type: "delivery_reversed", title: "Delivery reversed",
      message: `${doc.number} was reverted to pending: ${reason.trim().slice(0, 120)}`,
      link: "/", entityType: "document", entityId: documentId, createdBy: userId,
    });
  }
}

// Return approved by mistake → back to pending. Stock re-deducted; any refund
// reversed with a counter-entry (history is append-only, nothing deleted).
export async function reverseReturnApproval(id: number, reason: string, userId?: number): Promise<Return> {
  const ret = await getReturn(id);
  if (!ret) throw new Error("Return not found");
  if (ret.status !== "approved") throw new Error("Only an approved return can be reversed.");
  if (!reason?.trim()) throw new Error("A reason note is mandatory for corrections.");

  // 1. Take the returned stock back OUT (approval had added it in).
  if (ret.storeId) {
    for (const it of (ret.items || []) as any[]) {
      if (it.productId) {
        await adjustStock(Number(it.productId), Number(ret.storeId), -Number(it.qty || 0),
          "correction", `Return ${ret.voucherNumber} approval reversed`, ret.originalInvoiceId, userId);
      }
    }
  }

  // 2. Reverse the refund with a counter-entry (never delete the original).
  const refunds = (await db.select().from(payments)
    .where(and(eq(payments.reference, ret.voucherNumber || ""), eq(payments.isRefund, true)))) as any[];
  for (const r of refunds) {
    if (r.method === "Cheque") {
      // Cancel the outgoing refund cheque if it hasn't cleared.
      await db.update(cheques).set({ status: "cancelled" })
        .where(and(eq(cheques.paymentId, r.id), inArray(cheques.status, ["pending", "deposited"])));
    } else {
      await db.insert(payments).values({
        customerId: r.customerId, amount: r.amount, method: r.method,
        date: new Date().toISOString().slice(0, 10), isRefund: false,
        reference: ret.voucherNumber, notes: `Reversal of refund for ${ret.voucherNumber} (approval undone)`,
        recordedBy: userId ?? null,
      });
      await logCashflow({
        direction: "in", category: "Correction — refund reversed",
        amount: Number(r.amount), refType: "return", refId: ret.id, storeId: ret.storeId ?? undefined,
        notes: `Refund reversal for ${ret.voucherNumber}`, createdBy: userId,
      });
    }
  }

  // 3. Back to pending + permanent log + notify submitter.
  const [row] = await db.update(returnsTable)
    .set({ status: "pending", processedBy: null, processedAt: null })
    .where(eq(returnsTable.id, id)).returning();
  await logCorrection({ entityType: "return", entityId: id, field: "status", oldValue: "approved", newValue: "pending", reason, correctedBy: userId });
  if (ret.submittedBy) {
    await createNotification({
      targetUserId: ret.submittedBy, type: "return_reversed", title: "Return approval reversed",
      message: `${ret.voucherNumber} is back to pending: ${reason.trim().slice(0, 120)}`,
      link: "/approvals", entityType: "return", entityId: id, createdBy: userId,
    });
  }
  return row;
}

// ─── Warehouse Issues (Module 6 scaffold) ────────────────────────────────────
export async function createWarehouseIssue(data: InsertWarehouseIssue): Promise<WarehouseIssue> {
  const [row] = await db.insert(warehouseIssues).values(data).returning();
  // Module 13 matrix: issue-logged notifies admin AND manager.
  for (const role of ["admin", "manager"]) {
    await createNotification({
      targetRole: role, type: "issue_logged", title: "Warehouse issue logged",
      message: `${data.urgency || "normal"} — ${data.description}`.slice(0, 200),
      link: "/expenses", entityType: "issue", entityId: row.id, createdBy: data.reportedBy ?? undefined,
    });
  }
  return row;
}

export async function getWarehouseIssues(): Promise<WarehouseIssue[]> {
  return db.select().from(warehouseIssues).orderBy(desc(warehouseIssues.id));
}

export async function updateWarehouseIssue(id: number, data: Partial<InsertWarehouseIssue>): Promise<WarehouseIssue> {
  const patch: any = { ...data };
  if (patch.status === "resolved" && !patch.resolvedAt) patch.resolvedAt = new Date();
  const [row] = await db.update(warehouseIssues).set(patch).where(eq(warehouseIssues.id, id)).returning();
  return row;
}

// ─── Edit Log ────────────────────────────────────────────────────────────────
export async function logEdit(data: {
  documentId: number; userId?: number; userName?: string;
  field: string; oldValue?: string; newValue?: string;
  reason?: string; isAdminOverride?: boolean;
}): Promise<EditLog> {
  const [row] = await db.insert(editLog).values(data).returning();
  return row;
}

export async function getEditLog(documentId: number): Promise<EditLog[]> {
  return db.select().from(editLog)
    .where(eq(editLog.documentId, documentId))
    .orderBy(desc(editLog.createdAt));
}

// ─── Returns ─────────────────────────────────────────────────────────────────
export async function createReturn(data: {
  originalInvoiceId: number;
  originalInvoiceNumber?: string;
  customerId?: number | null;
  customerName?: string | null;
  storeId?: number | null;
  type: string;
  reason?: string;
  refundMethod?: string;
  refundAmount?: number;
  items: Array<{
    productId?: number; documentItemId?: number; description: string; qty: number;
    unit?: string; price?: number; amount?: number;
    condition?: string; damageDescription?: string;
  }>;
  submittedBy?: number;
  processedBy?: number;
}): Promise<Return> {
  // Own serial counter — Return Vouchers are an independent ledger.
  const voucherNumber = await getNextDocNumber("RV");
  const total = data.items.reduce((s, i) => s + Number(i.amount || 0), 0);

  // Created PENDING. Nothing moves (no stock, no refund) until admin/manager approves.
  const [ret] = await db.insert(returnsTable).values({
    voucherNumber,
    originalInvoiceId: data.originalInvoiceId,
    originalInvoiceNumber: data.originalInvoiceNumber,
    date: new Date().toISOString().slice(0, 10),
    customerId: data.customerId ?? undefined,
    customerName: data.customerName ?? undefined,
    storeId: data.storeId ?? undefined,
    type: data.type,
    status: "pending",
    submittedBy: data.submittedBy ?? undefined,
    reason: data.reason,
    refundMethod: data.refundMethod,
    refundAmount: data.refundAmount ? String(data.refundAmount) : undefined,
    total: String(total),
  }).returning();

  if (data.items.length > 0) {
    await db.insert(returnItems).values(
      data.items.map(item => ({
        returnId: ret.id,
        productId: item.productId,
        documentItemId: item.documentItemId,
        description: item.description,
        qty: String(item.qty),
        unit: item.unit,
        price: item.price ? String(item.price) : undefined,
        amount: item.amount ? String(item.amount) : undefined,
        condition: item.condition || "original",
        damageDescription: item.damageDescription,
      }))
    );
  }

  // Notify admin + manager — they can approve from any device.
  await createNotification({
    targetRole: "admin",
    type: "return_approval",
    title: "Return awaiting approval",
    message: `${voucherNumber} vs ${data.originalInvoiceNumber || "invoice"} — QAR ${total.toFixed(2)}${data.reason ? ` (${data.reason})` : ""}`,
    link: "/approvals",
    entityType: "return",
    entityId: ret.id,
    createdBy: data.submittedBy,
  });
  await createNotification({
    targetRole: "manager",
    type: "return_approval",
    title: "Return awaiting approval",
    message: `${voucherNumber} vs ${data.originalInvoiceNumber || "invoice"} — QAR ${total.toFixed(2)}`,
    link: "/approvals",
    entityType: "return",
    entityId: ret.id,
    createdBy: data.submittedBy,
  });

  return ret;
}

// Approve a pending return: THEN and only then reverse stock, refund, finalize.
// refundMethodOverride: the approving manager may choose the payout method
// (relevant at/above the return PDC threshold: PDC cheque or online transfer).
export async function approveReturn(id: number, userId?: number, refundMethodOverride?: string, fundsOverride?: { override?: boolean; overrideReason?: string }): Promise<Return> {
  const ret = await getReturn(id);
  if (!ret) throw new Error("Return not found");
  if (ret.status === "approved") return ret;                 // idempotent
  if (ret.status === "rejected") throw new Error("This return was already rejected.");

  const storeId = ret.storeId ?? null;

  // 1. Reverse inventory back into the correct location.
  if (storeId) {
    for (const it of (ret.items || []) as any[]) {
      if (it.productId) {
        await adjustStock(
          Number(it.productId), Number(storeId), Number(it.qty || 0),
          "return", `Return ${ret.voucherNumber} approved vs ${ret.originalInvoiceNumber}`,
          ret.originalInvoiceId, userId,
        );
      }
    }
  }

  // 2. RETURN refund rules: **Cash (preferred) or Online Transfer only — never PDC,
  //    never card.** Returns are small amounts; PDC on returns is not a real-business
  //    flow. (PDC stays only for invoice payments + supplier payments.)
  const refundAmt = Number(ret.refundAmount || 0);
  let appliedMethod = refundMethodOverride || ret.refundMethod || "Cash";
  if (refundAmt > 0) {
    // Coerce anything that isn't Bank Transfer down to Cash (Card/Cheque/PDC/unknown).
    if (appliedMethod !== "Bank Transfer") appliedMethod = "Cash";
    // Guard: a refund is money OUT — block if it exceeds the instrument's balance.
    await ensureFunds({
      instrument: methodInstrument(appliedMethod),
      amount: refundAmt,
      override: fundsOverride?.override, overrideReason: fundsOverride?.overrideReason, userId,
      context: `Return refund ${ret.voucherNumber}`,
    });
    await createPayment({
      customerId: ret.customerId ?? null,
      amount: String(refundAmt),
      method: appliedMethod,
      date: new Date().toISOString().slice(0, 10),
      notes: `Refund for approved return ${ret.voucherNumber}`,
      isRefund: true,
      reference: ret.voucherNumber,
      recordedBy: userId ?? null,
    } as any);
    await logCashflow({
      direction: "out", category: "Customer Refund",
      amount: refundAmt, refType: "return", refId: ret.id, storeId: ret.storeId ?? undefined,
      notes: `Return refund ${ret.voucherNumber} (${appliedMethod})`, createdBy: userId,
    });
  }

  // 3. Generate the printable Credit Note as an RV document linked to the original
  //    invoice. This is a RECORD only — approveReturn already reversed the stock and
  //    booked the refund above, and createDocument never moves stock/money for RV/CN
  //    (rule 21), so there is no double-count. The dashboard/reports deduct returns
  //    from RV/CN document totals, so this is also what makes the return show up there.
  let creditNoteId: number | null = null;
  try {
    const rvItems = ((ret.items || []) as any[]).filter((it) => Number(it.qty || 0) > 0);
    const rvTotal = rvItems.reduce(
      (s, it) => s + Number(it.amount ?? Number(it.price || 0) * Number(it.qty || 0)), 0,
    );
    const rvNumber = await resolveDocumentNumber("CN", undefined);
    const [rvDoc] = await db.insert(documents).values({
      type: "CN",
      number: rvNumber,
      date: new Date().toISOString().slice(0, 10),
      customerId: ret.customerId ?? null,
      customerName: ret.customerName ?? null,
      storeId: ret.storeId ?? null,
      status: "returned",
      originalInvoiceId: ret.originalInvoiceId ?? null,
      linkedDocId: ret.originalInvoiceId ?? null,
      subtotal: String(rvTotal),
      total: String(refundAmt || rvTotal),
      notes: `Credit note for return ${ret.voucherNumber} vs ${ret.originalInvoiceNumber}. Refund ${appliedMethod}.`,
      createdBy: userId ?? null,
    }).returning();
    creditNoteId = rvDoc.id;
    if (rvItems.length) {
      await db.insert(documentItems).values(rvItems.map((it) => ({
        documentId: rvDoc.id,
        productId: it.productId ?? null,
        sku: it.sku ?? null,
        description: it.description,
        qty: String(it.qty),
        unit: it.unit || "PCS",
        price: String(it.price || 0),
        discountType: "QAR",
        discountAmount: "0",
        amount: String(it.amount ?? Number(it.price || 0) * Number(it.qty || 0)),
      })));
    }
  } catch (e) {
    // The CN document is a convenience record — never fail an approval because of it.
    console.error("approveReturn: CN document generation failed:", e);
  }

  // 4. Finalize.
  const [updated] = await db.update(returnsTable)
    .set({ status: "approved", refundMethod: appliedMethod, creditNoteId, processedBy: userId ?? undefined, processedAt: new Date() })
    .where(eq(returnsTable.id, id))
    .returning();

  // 5. Notify the staff member who raised it.
  if (ret.submittedBy) {
    await createNotification({
      targetUserId: ret.submittedBy,
      type: "return_approved",
      title: "Return approved",
      message: `${ret.voucherNumber} approved. Stock reversed${refundAmt > 0 ? `, refund ${appliedMethod} QAR ${refundAmt.toFixed(2)}` : ""}.`,
      link: `/documents/${ret.originalInvoiceId}`,
      entityType: "return", entityId: ret.id, createdBy: userId,
    });
  }
  return updated;
}

export async function rejectReturn(id: number, userId?: number, reason?: string): Promise<Return> {
  const ret = await getReturn(id);
  if (!ret) throw new Error("Return not found");
  if (ret.status === "approved") throw new Error("This return was already approved.");
  if (ret.status === "rejected") return ret;

  const [updated] = await db.update(returnsTable)
    .set({ status: "rejected", rejectionReason: reason || "Rejected", processedBy: userId ?? undefined, processedAt: new Date() })
    .where(eq(returnsTable.id, id))
    .returning();

  if (ret.submittedBy) {
    await createNotification({
      targetUserId: ret.submittedBy,
      type: "return_rejected",
      title: "Return rejected",
      message: `${ret.voucherNumber} was rejected${reason ? `: ${reason}` : ""}. Nothing changed.`,
      link: `/documents/${ret.originalInvoiceId}`,
      entityType: "return", entityId: ret.id, createdBy: userId,
    });
  }
  return updated;
}

// ─── Product activity (Agent 5 — clickable product detail) ───────────────────────
// Aggregates everything the product profile needs in one call: stock movements,
// recent sales, sales stats, per-location stock, and the linked supplier.
export async function getProductActivity(productId: number): Promise<any> {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return null;
  const allStores = await db.select().from(stores);
  const storeName = (id: any) => allStores.find((s) => s.id === id)?.nameEn || (id ? `Store ${id}` : "—");

  // Stock on hand per location.
  const invRows = await db.select().from(inventory).where(eq(inventory.productId, productId));
  const stockByLocation = invRows.map((r: any) => ({ storeId: r.storeId, storeName: storeName(r.storeId), qty: Number(r.qty || 0) }));

  // Stock movements (received / sold / returned / adjusted / transferred).
  const movesRaw = await db.select().from(stockAdjustments)
    .where(eq(stockAdjustments.productId, productId)).orderBy(desc(stockAdjustments.id)).limit(60);
  const movements = movesRaw.map((m: any) => ({
    id: m.id, type: m.type, qtyChange: Number(m.qtyChange || 0), storeName: storeName(m.storeId),
    reason: m.reason, referenceId: m.referenceId, date: m.createdAt,
  }));

  // Sales history — line items of non-void invoices containing this product.
  const itemRows = await db.select({
    docId: documentItems.documentId, qty: documentItems.qty, price: documentItems.price, amount: documentItems.amount,
    number: documents.number, date: documents.date, customerName: documents.customerName,
    type: documents.type, status: documents.status,
  }).from(documentItems)
    .leftJoin(documents, eq(documentItems.documentId, documents.id))
    .where(eq(documentItems.productId, productId));
  const invItems = itemRows.filter((r: any) => r.type === "INV" && r.status !== "void");
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;
  let soldMonth = 0, soldYear = 0, revenue = 0, unitsAll = 0;
  const byCustomer: Record<string, number> = {};
  for (const r of invItems as any[]) {
    const q = Number(r.qty || 0), amt = Number(r.amount || 0);
    unitsAll += q; revenue += amt;
    if (r.date >= monthStart) soldMonth += q;
    if (r.date >= yearStart) soldYear += q;
    if (r.customerName) byCustomer[r.customerName] = (byCustomer[r.customerName] || 0) + amt;
  }
  const bestCustomer = Object.entries(byCustomer).sort((a, b) => b[1] - a[1])[0] || null;
  const sales = (invItems as any[])
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 20)
    .map((r) => ({ docId: r.docId, number: r.number, date: r.date, customerName: r.customerName, qty: Number(r.qty || 0), price: Number(r.price || 0), amount: Number(r.amount || 0) }));

  let supplier: any = null;
  if (product.supplierId) {
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, product.supplierId));
    if (sup) supplier = { id: sup.id, name: sup.name, phone: (sup as any).phone ?? null };
  }

  return {
    product,
    stockByLocation,
    movements,
    sales,
    stats: {
      soldThisMonth: soldMonth, soldThisYear: soldYear,
      avgPrice: unitsAll > 0 ? revenue / unitsAll : 0,
      bestCustomer: bestCustomer ? { name: bestCustomer[0], total: bestCustomer[1] } : null,
      totalRevenue: revenue,
    },
    supplier,
  };
}

// ─── Delivery Note workflow (Agent 2) ───────────────────────────────────────────
// Lifecycle: pending_pick → picked → authorized → delivered. The DN is created the
// moment a site-delivery invoice is saved (see createDocument). Each stage notifies
// the next role. An invoice is only "complete" once its DN reaches delivered.

// Find the auto-generated DN for an invoice (or return the doc itself if it IS a DN).
export async function resolveDeliveryNote(id: number): Promise<any | undefined> {
  const doc = await getDocument(id);
  if (!doc) return undefined;
  if (doc.type === "DN") return doc;
  const [dn] = await db.select().from(documents)
    .where(and(eq(documents.type, "DN"), eq(documents.linkedDocId, id)))
    .orderBy(desc(documents.id));
  return dn ? await getDocument(dn.id) : undefined;
}

// Warehouse marks the pick complete.
export async function pickDeliveryNote(dnId: number, userId?: number): Promise<any> {
  const dn = await getDocument(dnId);
  if (!dn || dn.type !== "DN") throw new Error("Delivery note not found");
  if (dn.deliveryStatus === "delivered") throw new Error("This delivery is already completed.");
  await updateDocument(dnId, { deliveryStatus: "picked" } as any);
  await logEdit({ documentId: dnId, userId, field: "deliveryStatus", oldValue: dn.deliveryStatus || "pending_pick", newValue: "picked", reason: "Warehouse picked all items" });
  await createNotification({
    targetRole: "manager", type: "dn_ready_authorize", title: "Delivery ready to authorise",
    message: `${dn.number} is picked and awaiting your authorisation.`,
    link: `/documents/${dnId}`, entityType: "document", entityId: dnId, createdBy: userId,
  });
  return getDocument(dnId);
}

// Manager authorises the picked DN (digital approval, logged permanently).
export async function authorizeDeliveryNote(dnId: number, userId?: number): Promise<any> {
  const dn = await getDocument(dnId);
  if (!dn || dn.type !== "DN") throw new Error("Delivery note not found");
  if (dn.deliveryStatus === "delivered") throw new Error("This delivery is already completed.");
  if (dn.deliveryStatus === "pending_pick") throw new Error("Items must be picked by the warehouse before authorisation.");
  await updateDocument(dnId, { deliveryStatus: "authorized", authorizedBy: userId ?? null, authorizedAt: new Date() } as any);
  await logEdit({ documentId: dnId, userId, field: "deliveryStatus", oldValue: dn.deliveryStatus || "picked", newValue: "authorized", reason: "Manager authorised delivery" });
  await createNotification({
    ...(dn.driverId ? { targetUserId: dn.driverId } : { targetRole: "driver" }),
    type: "dn_authorized", title: "Delivery authorised — ready to dispatch",
    message: `${dn.number} to ${dn.customerName || "customer"} is authorised. Deliver when ready.`,
    link: `/documents/${dnId}`, entityType: "document", entityId: dnId, createdBy: userId,
  });
  return getDocument(dnId);
}

// Driver confirms delivery on site. Requires manager authorisation first. Completes
// both the DN and its parent invoice.
export async function markDeliveryNoteDelivered(dnId: number, userId?: number): Promise<any> {
  const dn = await getDocument(dnId);
  if (!dn || dn.type !== "DN") throw new Error("Delivery note not found");
  if (dn.deliveryStatus === "delivered") return dn; // idempotent
  if (dn.deliveryStatus !== "authorized" && dn.deliveryStatus !== "in_transit")
    throw new Error("A manager must authorise this delivery before it can be marked delivered.");
  await updateDocument(dnId, { deliveryStatus: "delivered", status: "delivered" } as any);
  if (dn.linkedDocId) await updateDocument(dn.linkedDocId, { deliveryStatus: "delivered" } as any);
  await logEdit({ documentId: dnId, userId, field: "deliveryStatus", oldValue: dn.deliveryStatus || "authorized", newValue: "delivered", reason: "Driver confirmed delivery on site" });
  // Notify the salesman who raised the invoice + admin.
  const inv = dn.linkedDocId ? await getDocument(dn.linkedDocId) : null;
  if (inv?.createdBy) {
    await createNotification({
      targetUserId: inv.createdBy, type: "delivery_done", title: "Delivery completed",
      message: `${inv.number} delivered to ${inv.customerName || "customer"} — ${dn.number} completed.`,
      link: `/documents/${inv.id}`, entityType: "document", entityId: inv.id, createdBy: userId,
    });
  }
  return getDocument(dnId);
}

// ─── Notifications ─────────────────────────────────────────────────────────────
export async function createNotification(data: {
  targetRole?: string; targetUserId?: number; type: string; title: string;
  message?: string; link?: string; entityType?: string; entityId?: number; createdBy?: number;
}): Promise<Notification> {
  const [row] = await db.insert(notifications).values({
    targetRole: data.targetRole ?? null,
    targetUserId: data.targetUserId ?? null,
    type: data.type, title: data.title, message: data.message ?? null,
    link: data.link ?? null, entityType: data.entityType ?? null, entityId: data.entityId ?? null,
    createdBy: data.createdBy ?? null,
  }).returning();
  return row;
}

export async function getNotifications(opts: { role?: string; userId?: number; unreadOnly?: boolean }): Promise<Notification[]> {
  const targets: any[] = [];
  if (opts.role) targets.push(eq(notifications.targetRole, opts.role));
  if (opts.userId) targets.push(eq(notifications.targetUserId, opts.userId));
  const audience = targets.length ? or(...targets) : sql`false`;
  const where = opts.unreadOnly ? and(audience, eq(notifications.isRead, false)) : audience;
  return db.select().from(notifications).where(where).orderBy(desc(notifications.id)).limit(100);
}

export async function markNotificationRead(id: number): Promise<void> {
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(opts: { role?: string; userId?: number }): Promise<void> {
  const targets: any[] = [];
  if (opts.role) targets.push(eq(notifications.targetRole, opts.role));
  if (opts.userId) targets.push(eq(notifications.targetUserId, opts.userId));
  if (!targets.length) return;
  await db.update(notifications).set({ isRead: true }).where(and(or(...targets), eq(notifications.isRead, false)));
}

export async function getReturns(invoiceId?: number): Promise<Return[]> {
  if (invoiceId) {
    return db.select().from(returnsTable)
      .where(eq(returnsTable.originalInvoiceId, invoiceId))
      .orderBy(desc(returnsTable.id));
  }
  return db.select().from(returnsTable).orderBy(desc(returnsTable.id));
}

export async function getReturn(id: number): Promise<(Return & { items: any[] }) | undefined> {
  const [ret] = await db.select().from(returnsTable).where(eq(returnsTable.id, id));
  if (!ret) return undefined;
  const items = await db.select().from(returnItems).where(eq(returnItems.returnId, id));
  return { ...ret, items };
}

// ─── Messages ─────────────────────────────────────────────────────────────────
export async function getMessages(): Promise<MessagesLog[]> {
  return db.select().from(messagesLog).orderBy(desc(messagesLog.sentAt));
}

export async function logMessage(data: {
  customerId?: number; documentId?: number; type: string;
  content?: string; sentBy?: number; skipped?: boolean;
}): Promise<MessagesLog> {
  const [row] = await db.insert(messagesLog).values(data).returning();
  return row;
}

export async function getLastMessageDate(customerId: number): Promise<Date | null> {
  const [row] = await db.select().from(messagesLog)
    .where(and(eq(messagesLog.customerId, customerId), eq(messagesLog.skipped, false)))
    .orderBy(desc(messagesLog.sentAt))
    .limit(1);
  return row ? new Date(row.sentAt!) : null;
}

// ─── Supplier Orders (PO lifecycle: draft → sent → partial → received) ────────
export async function createSupplierOrder(data: {
  supplierId: number; poNumber: string; notes?: string; storeId?: number;
  status?: string; paymentTermsDays?: number;
  items: Array<{ productId: number; name: string; qty: number; unit: string }>;
}): Promise<SupplierOrder> {
  const [row] = await db.insert(supplierOrders).values({
    supplierId: data.supplierId,
    poNumber: data.poNumber,
    status: data.status || "draft", // starts as an editable draft
    storeId: data.storeId,
    paymentTermsDays: data.paymentTermsDays ?? 0,
    notes: data.notes,
    // seed receivedQty:0 on each line so partial receipts track cleanly
    items: (data.items || []).map((i) => ({ ...i, receivedQty: 0 })),
  }).returning();
  return row;
}

// Explicit status transition. Draft can be edited; sending locks it.
export async function updateSupplierOrderStatus(id: number, status: string, _userId?: number): Promise<SupplierOrder> {
  const [order] = await db.select().from(supplierOrders).where(eq(supplierOrders.id, id));
  if (!order) throw new Error("Purchase order not found");
  const ALLOWED = ["draft", "sent", "partial", "received", "cancelled"];
  if (!ALLOWED.includes(status)) throw new Error(`Invalid PO status: ${status}`);
  const [row] = await db.update(supplierOrders).set({ status }).where(eq(supplierOrders.id, id)).returning();
  return row;
}

export async function getSupplierOrders(supplierId?: number): Promise<SupplierOrder[]> {
  if (supplierId) {
    return db.select().from(supplierOrders)
      .where(eq(supplierOrders.supplierId, supplierId))
      .orderBy(desc(supplierOrders.sentAt));
  }
  return db.select().from(supplierOrders).orderBy(desc(supplierOrders.sentAt));
}

export async function updateSupplierOrder(
  id: number,
  data: Partial<{ status: string; receivedAt: string; notes: string }>
): Promise<SupplierOrder> {
  const [row] = await db
    .update(supplierOrders)
    .set({
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.receivedAt !== undefined
        ? { receivedAt: new Date(data.receivedAt) }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    })
    .where(eq(supplierOrders.id, id))
    .returning();
  return row;
}

// Partial receive: staff selects which items/qty arrived. Adds only the received
// delta to inventory, tracks receivedQty per line, and flips status to
// partial / received. Full receipt starts the payment-terms clock.
export async function receiveSupplierOrderItems(
  id: number,
  storeId: number,
  receipts: Array<{ productId?: number; index?: number; qty: number }>,
  userId?: number,
): Promise<SupplierOrder> {
  const [order] = await db.select().from(supplierOrders).where(eq(supplierOrders.id, id));
  if (!order) throw new Error("Purchase order not found");
  if (order.status === "received") return order; // fully received already — no double count
  if (order.status === "draft") throw new Error("Send the PO to the supplier before receiving against it.");
  if (!storeId) throw new Error("Destination store is required to receive stock.");

  const items = (Array.isArray(order.items) ? (order.items as any[]) : []).map((i) => ({ ...i }));

  for (const r of receipts || []) {
    // Match by explicit index, else by productId.
    let line = typeof r.index === "number" ? items[r.index] : undefined;
    if (!line && r.productId) line = items.find((it) => Number(it.productId) === Number(r.productId));
    if (!line) continue;
    const ordered = Number(line.qty || 0);
    const already = Number(line.receivedQty || 0);
    const room = Math.max(0, ordered - already);
    const take = Math.min(Math.max(0, Number(r.qty || 0)), room); // never over-receive
    if (take <= 0) continue;
    line.receivedQty = already + take;
    if (line.productId) {
      await adjustStock(Number(line.productId), storeId, take, "purchase",
        `PO ${order.poNumber || id} receipt`, id, userId);
    }
  }

  const fully = items.every((it) => Number(it.receivedQty || 0) >= Number(it.qty || 0));
  const anyReceived = items.some((it) => Number(it.receivedQty || 0) > 0);
  const status = fully ? "received" : anyReceived ? "partial" : order.status;

  const patch: any = { items, status, storeId };
  if (fully) {
    const today = new Date().toISOString().slice(0, 10);
    const terms = Number(order.paymentTermsDays || 0);
    const due = new Date(); due.setDate(due.getDate() + terms);
    patch.receivedAt = new Date();
    patch.receiptDate = today;
    patch.paymentDueDate = due.toISOString().slice(0, 10); // terms clock starts on full receipt
  }
  const [row] = await db.update(supplierOrders).set(patch).where(eq(supplierOrders.id, id)).returning();
  return row;
}

// Legacy full-receive → receive all remaining qty in one shot.
export async function receiveSupplierOrder(id: number, storeId: number, userId?: number): Promise<SupplierOrder> {
  const [order] = await db.select().from(supplierOrders).where(eq(supplierOrders.id, id));
  if (!order) throw new Error("Purchase order not found");
  if (order.status === "received") return order;
  if (order.status === "draft") await updateSupplierOrderStatus(id, "sent");
  const items = Array.isArray(order.items) ? (order.items as any[]) : [];
  const receipts = items.map((it, index) => ({ index, qty: Math.max(0, Number(it.qty || 0) - Number(it.receivedQty || 0)) }));
  return receiveSupplierOrderItems(id, storeId, receipts, userId);
}

// ─── Supplier Returns (goods back to supplier) ───────────────────────────────
export async function createSupplierReturn(data: {
  poId?: number; supplierId?: number; storeId?: number;
  returnType: "initiated" | "rejected_delivery";
  items: Array<{ productId?: number; name?: string; qty: number; unit?: string; amount?: number }>;
  notes?: string; refundAmount?: number; createdBy?: number;
}): Promise<SupplierReturn> {
  const total = (data.items || []).reduce((s, i) => s + Number(i.amount || 0), 0);
  const [row] = await db.insert(supplierReturns).values({
    poId: data.poId, supplierId: data.supplierId, storeId: data.storeId,
    returnType: data.returnType, status: "pending_confirmation",
    items: data.items || [], total: String(total),
    refundAmount: data.refundAmount != null ? String(data.refundAmount) : String(total),
    notes: data.notes, createdBy: data.createdBy,
  }).returning();

  // Type 1 (you initiate): stock physically leaves your warehouse → deduct.
  // Type 2 (rejected on delivery inspection): never properly entered stock → no deduction.
  if (data.returnType === "initiated" && data.storeId) {
    for (const it of data.items || []) {
      if (it.productId) {
        await adjustStock(Number(it.productId), Number(data.storeId), -Number(it.qty || 0),
          "supplier_return", `Supplier return #${row.id}`, undefined, data.createdBy);
      }
    }
  }
  return row;
}

export async function getSupplierReturns(filter?: { poId?: number; supplierId?: number }): Promise<SupplierReturn[]> {
  const conds: any[] = [];
  if (filter?.poId) conds.push(eq(supplierReturns.poId, filter.poId));
  if (filter?.supplierId) conds.push(eq(supplierReturns.supplierId, filter.supplierId));
  const q = conds.length ? db.select().from(supplierReturns).where(and(...conds)) : db.select().from(supplierReturns);
  return q.orderBy(desc(supplierReturns.id));
}

// pending_confirmation → confirmed → refund_received.
// On refund_received: log a cash-in entry under "Supplier Refund", linked to the PO.
export async function updateSupplierReturnStatus(id: number, status: string, userId?: number): Promise<SupplierReturn> {
  const [ret] = await db.select().from(supplierReturns).where(eq(supplierReturns.id, id));
  if (!ret) throw new Error("Supplier return not found");
  const ALLOWED = ["pending_confirmation", "confirmed", "refund_received"];
  if (!ALLOWED.includes(status)) throw new Error(`Invalid supplier-return status: ${status}`);

  const patch: any = { status };
  if (status === "refund_received" && !ret.refundReceivedAt) {
    patch.refundReceivedAt = new Date();
    await db.insert(cashflow).values({
      direction: "in", category: "Supplier Refund",
      amount: String(Number(ret.refundAmount || ret.total || 0)),
      refType: "supplier_return", refId: ret.id, storeId: ret.storeId ?? undefined,
      notes: `Refund received for supplier return #${ret.id}${ret.poId ? ` (PO ${ret.poId})` : ""}`,
      date: new Date().toISOString().slice(0, 10), createdBy: userId,
    });
  }
  const [row] = await db.update(supplierReturns).set(patch).where(eq(supplierReturns.id, id)).returning();
  return row;
}

// ─── Reports ─────────────────────────────────────────────────────────────────
// ─── Owner Loans / Cash Injections ───────────────────────────────────────────
export async function createOwnerLoan(data: {
  type: string; amount: number; source?: string; method?: string; date: string; note?: string; createdBy?: number;
  override?: boolean; overrideReason?: string;
}) {
  const method = data.method === "Bank Transfer" ? "Bank Transfer" : "Cash";
  // Guard: a repayment is money OUT — block if it exceeds the instrument's balance.
  if (data.type === "repayment") {
    await ensureFunds({
      instrument: methodInstrument(method),
      amount: Number(data.amount),
      override: data.override, overrideReason: data.overrideReason, userId: data.createdBy,
      context: `Loan repayment — ${data.source || "Owner"}`,
    });
  }
  const [row] = await db.insert(ownerLoans).values({
    type: data.type, amount: String(data.amount), source: data.source ?? null,
    method, date: data.date, note: data.note ?? null, createdBy: data.createdBy ?? null,
  }).returning();
  // Reflect in the cash ledger. Note tags the method so cash-vs-bank splits correctly.
  await logCashflow({
    direction: data.type === "injection" ? "in" : "out",
    category: data.type === "injection" ? "Owner Contribution" : "Loan Repayment",
    amount: data.amount, refType: "owner_loan", refId: row.id,
    notes: `${data.type === "injection" ? "Cash injection" : "Loan repayment"} — ${data.source || "Owner"} (${method})`,
    createdBy: data.createdBy,
  });
  return row;
}

export async function getOwnerLoans() {
  const rows = await db.select().from(ownerLoans).orderBy(desc(ownerLoans.id));
  const injected = rows.filter((r) => r.type === "injection").reduce((s, r) => s + Number(r.amount || 0), 0);
  const repaid = rows.filter((r) => r.type === "repayment").reduce((s, r) => s + Number(r.amount || 0), 0);
  return {
    rows,
    summary: { injected: Number(injected.toFixed(2)), repaid: Number(repaid.toFixed(2)), outstanding: Number((injected - repaid).toFixed(2)) },
  };
}

export async function getDailySalesSummary(startDate: string, endDate: string, storeId?: number) {
  const conditions = [
    eq(documents.type, "INV"),
    gte(documents.date, startDate),
    lte(documents.date, endDate),
  ];
  if (storeId) conditions.push(eq(documents.storeId, storeId));

  const docs = await db.select().from(documents).where(and(...conditions));
  const payRows = await db.select({ amount: payments.amount, method: payments.method, date: payments.date })
    .from(payments)
    .innerJoin(documents, eq(payments.documentId, documents.id))
    .where(and(
      gte(documents.date, startDate),
      lte(documents.date, endDate),
      storeId ? eq(documents.storeId, storeId) : undefined,
    ));

  const totalRevenue = docs.reduce((s, d) => s + parseFloat(d.total || "0"), 0);
  const cashSales = payRows.filter(p => p.method === "Cash").reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  const creditSales = totalRevenue - cashSales;

  // Best customer (by spend) + best product (by qty) over the period (Bug 5).
  const byCustomer: Record<string, number> = {};
  for (const d of docs as any[]) {
    const name = d.customerName || "Walk-in Customer";
    byCustomer[name] = (byCustomer[name] || 0) + parseFloat(d.total || "0");
  }
  const bcEntry = Object.entries(byCustomer).sort((a, b) => b[1] - a[1])[0];
  const bestCustomer = bcEntry ? { name: bcEntry[0], total: Number(bcEntry[1].toFixed(2)) } : null;

  let bestProduct: { name: string; qty: number } | null = null;
  const ids = docs.map((d: any) => d.id);
  if (ids.length) {
    const { inArray } = await import("drizzle-orm");
    const items = await db.select({ description: documentItems.description, qty: documentItems.qty })
      .from(documentItems).where(inArray(documentItems.documentId, ids));
    const byProduct: Record<string, number> = {};
    for (const it of items as any[]) byProduct[it.description] = (byProduct[it.description] || 0) + Number(it.qty || 0);
    const bpEntry = Object.entries(byProduct).sort((a, b) => b[1] - a[1])[0];
    if (bpEntry) bestProduct = { name: bpEntry[0], qty: Number(bpEntry[1]) };
  }

  return {
    totalRevenue,
    invoiceCount: docs.length,
    avgInvoiceValue: docs.length > 0 ? totalRevenue / docs.length : 0,
    cashSales,
    creditSales,
    returnsTotal: 0,
    bestCustomer,
    bestProduct,
  };
}

export async function getUnpaidInvoices(opts?: { start?: string; end?: string }) {
  const conditions = [
    eq(documents.type, "INV"),
    ne(documents.status, "paid"),
    ne(documents.status, "returned"),
    ne(documents.status, "void"),
  ];
  if (opts?.start) conditions.push(gte(documents.date, opts.start));
  if (opts?.end) conditions.push(lte(documents.date, opts.end));

  const docs = await db.select().from(documents)
    .where(and(...conditions))
    .orderBy(asc(documents.date));

  if (docs.length === 0) return [];

  // Batch payments for ALL these invoices in one query (council D2: kill the N+1 —
  // this runs on the hot dashboard-summary path). paid = payments − refunds per doc.
  const ids = docs.map((d) => d.id);
  const allPays = await db.select().from(payments).where(inArray(payments.documentId, ids));
  const paidByDoc = new Map<number, number>();
  for (const p of allPays) {
    const amt = parseFloat(p.amount || "0") * (p.isRefund ? -1 : 1);
    paidByDoc.set(p.documentId as number, (paidByDoc.get(p.documentId as number) || 0) + amt);
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = docs.map((doc) => {
    const paid = paidByDoc.get(doc.id) || 0;
    const total = parseFloat(doc.total || "0");
    const remaining = total - paid;
    const daysOverdue = Math.max(0, Math.floor((Date.parse(today) - Date.parse(doc.date)) / 86400000));
    return {
      id: doc.id,
      number: doc.number,
      date: doc.date,
      customerId: doc.customerId,
      customerName: doc.customerName,
      total,
      paid,
      remaining,
      daysOverdue,
      daysOld: daysOverdue,
      totalPaid: paid,
    };
  });

  return rows.filter((row) => row.remaining > 0.005);
}

// ─── Profit detail (dashboard "Profit Today" drill-down) ─────────────────────
// Profit = Sell − Cost only (expenses are NOT part of gross profit).
export async function getProfitDetail(start: string, end: string, storeId?: number) {
  const conds: any[] = [eq(documents.type, "INV"), gte(documents.date, start), lte(documents.date, end), ne(documents.status, "void")];
  if (storeId) conds.push(eq(documents.storeId, storeId));
  const docs = await db.select().from(documents).where(and(...conds));
  const ids = docs.map((d) => d.id);
  const cogsByDoc: Record<number, number> = {};
  const itemsByDoc: Record<number, any[]> = {};
  if (ids.length) {
    const items = await db.select({
      documentId: documentItems.documentId, qty: documentItems.qty, price: documentItems.price,
      amount: documentItems.amount, description: documentItems.description, cost: products.costPrice,
    }).from(documentItems).leftJoin(products, eq(documentItems.productId, products.id))
      .where(inArray(documentItems.documentId, ids));
    for (const it of items as any[]) {
      const c = Number(it.cost || 0) * Number(it.qty || 0);
      cogsByDoc[it.documentId] = (cogsByDoc[it.documentId] || 0) + c;
      (itemsByDoc[it.documentId] ||= []).push({
        description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0),
        cost: Number(it.cost || 0), amount: Number(it.amount || 0),
        profit: Number((Number(it.amount || 0) - Number(it.cost || 0) * Number(it.qty || 0)).toFixed(2)),
      });
    }
  }
  let realProfit = 0, imaginaryProfit = 0, realSales = 0, totalSales = 0;
  const invoices = docs.map((d: any) => {
    const total = Number(d.total || 0), cogs = cogsByDoc[d.id] || 0, profit = total - cogs;
    imaginaryProfit += profit; totalSales += total;
    if (d.status === "paid") { realProfit += profit; realSales += total; }
    return {
      id: d.id, number: d.number, date: d.date, status: d.status, customerName: d.customerName,
      total, cogs: Number(cogs.toFixed(2)), profit: Number(profit.toFixed(2)), items: itemsByDoc[d.id] || [],
    };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  return {
    invoices,
    realProfit: Number(realProfit.toFixed(2)), imaginaryProfit: Number(imaginaryProfit.toFixed(2)),
    realSales: Number(realSales.toFixed(2)), totalSales: Number(totalSales.toFixed(2)),
  };
}

// ─── Credit exposure (all unpaid credit, grouped by customer) ────────────────
export async function getCreditExposure() {
  const unpaid = await getUnpaidInvoices({});
  const byCust: Record<string, any> = {};
  for (const inv of unpaid as any[]) {
    const key = inv.customerId != null ? `id:${inv.customerId}` : `name:${inv.customerName || "Walk-in"}`;
    const c = (byCust[key] ||= { customerId: inv.customerId ?? null, name: inv.customerName || "Walk-in Customer", outstanding: 0, oldestDate: inv.date, maxDaysOverdue: 0, invoices: [] as any[] });
    c.outstanding += inv.remaining;
    if ((inv.date || "") < (c.oldestDate || "")) c.oldestDate = inv.date;
    c.maxDaysOverdue = Math.max(c.maxDaysOverdue, inv.daysOverdue || 0);
    c.invoices.push({ id: inv.id, number: inv.number, date: inv.date, remaining: Number(inv.remaining.toFixed(2)), daysOverdue: inv.daysOverdue || 0 });
  }
  const customers = Object.values(byCust)
    .map((c: any) => ({ ...c, outstanding: Number(c.outstanding.toFixed(2)) }))
    .sort((a: any, b: any) => b.outstanding - a.outstanding);
  const total = customers.reduce((s: number, c: any) => s + c.outstanding, 0);
  return { total: Number(total.toFixed(2)), customers };
}

// Customer overview + behaviour-tier engine. One row per active customer with money
// metrics AND a system-calculated tier (best/better/good/watch/bad). Batched (no N+1).
//   Positive tiers rank customers by PROFIT contributed over a rolling window
//   (Settings.tierWindowMonths): best = top tierBestPct%, better = top tierBetterPct%
//   band, everyone else good. Best also requires repeat buying (≥2 invoices in window).
//   Negative tiers apply ONLY to credit accounts (creditLimit>0):
//     bad   = any invoice ≥ tierBadOverdueDays past its term, OR ≥ tierBadLateCount
//             late-paid invoices in window, OR a bounced PDC on record.
//     watch = ≥1 invoice past term (and not bad).
//   Negative ALWAYS overrides positive — payment risk beats purchase volume. Cash
//   customers (creditLimit≤0) can never be watch/bad. Recomputed live every call
//   (no stored tier to go stale). NEVER surfaced on any customer-facing document.
export async function getCustomerOverview() {
  const today = new Date().toISOString().slice(0, 10);
  const r2 = (n: number) => Number(n.toFixed(2));
  const cfg: any = (await getSettings()) || {};
  const windowMonths = Number(cfg.tierWindowMonths ?? 6);
  const bestPct = Number(cfg.tierBestPct ?? 10);
  const betterPct = Number(cfg.tierBetterPct ?? 30);
  const defaultTermDays = Number(cfg.tierDefaultTermDays ?? 30);
  const badOverdueDays = Number(cfg.tierBadOverdueDays ?? 60);
  const badLateCount = Number(cfg.tierBadLateCount ?? 2);

  // rolling-window cutoff (YYYY-MM-DD)
  const cut = new Date(today + "T00:00:00Z");
  cut.setUTCMonth(cut.getUTCMonth() - windowMonths);
  const cutoff = cut.toISOString().slice(0, 10);

  const [custs, invs, chqs] = await Promise.all([
    db.select().from(customers),
    db.select().from(documents).where(and(eq(documents.type, "INV"), ne(documents.status, "void"))),
    db.select().from(cheques),
  ]);
  const invIds = invs.map((d) => d.id);
  const pays = invIds.length ? await db.select().from(payments).where(inArray(payments.documentId, invIds)) : [];

  // net collected + last real (non-refund) payment date, per invoice
  const paidByInv = new Map<number, number>();
  const lastPayByInv = new Map<number, string>();
  for (const p of pays as any[]) {
    const amt = parseFloat(p.amount || "0") * (p.isRefund ? -1 : 1);
    paidByInv.set(p.documentId, (paidByInv.get(p.documentId) || 0) + amt);
    if (!p.isRefund && p.date) {
      const cur = lastPayByInv.get(p.documentId);
      if (!cur || p.date > cur) lastPayByInv.set(p.documentId, p.date);
    }
  }

  // COGS + qty per fully-paid in-window invoice — one batched join for margin.
  const paidWindowIds = (invs as any[]).filter((d) => d.status === "paid" && (d.date || "") >= cutoff).map((d) => d.id);
  const marginByInv = new Map<number, number>();
  const qtyByInv = new Map<number, number>();
  if (paidWindowIds.length) {
    const items = await db.select({
      documentId: documentItems.documentId, qty: documentItems.qty,
      amount: documentItems.amount, cost: products.costPrice,
    }).from(documentItems).leftJoin(products, eq(documentItems.productId, products.id))
      .where(inArray(documentItems.documentId, paidWindowIds));
    for (const it of items as any[]) {
      const qty = parseFloat(it.qty || "0");
      const rev = parseFloat(it.amount || "0");
      const cogs = qty * parseFloat(it.cost || "0");
      marginByInv.set(it.documentId, (marginByInv.get(it.documentId) || 0) + (rev - cogs));
      qtyByInv.set(it.documentId, (qtyByInv.get(it.documentId) || 0) + qty);
    }
  }

  const parseTerm = (t: any): number | null => { const m = String(t || "").match(/\d+/); return m ? parseInt(m[0], 10) : null; };
  const daysBetween = (a: string, b: string) => Math.floor((Date.parse(a) - Date.parse(b)) / 86400000);
  const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  const map = new Map<number, any>();
  for (const c of custs as any[]) {
    if (c.active === false) continue;
    map.set(c.id, {
      customerId: c.id, name: c.name, type: c.type, phone: c.phone ?? null,
      creditLimit: Number(c.creditLimit || 0), termDays: parseTerm(c.paymentTerms) ?? defaultTermDays,
      totalInvoiced: 0, totalPaid: 0, amountDue: 0, pdcAmount: 0,
      invoiceCount: 0, lastPurchase: "", maxDaysOverdue: 0,
      profit: 0, invoiceCountWindow: 0, qtyWindow: 0,
      maxPastDue: 0, latePaidWindow: 0, bouncedPdc: false, posTier: "good",
    });
  }

  for (const d of invs as any[]) {
    if (d.customerId == null) continue;
    const r = map.get(d.customerId); if (!r) continue;
    const total = parseFloat(d.total || "0");
    const paid = paidByInv.get(d.id) || 0;
    const dd = d.date || "";
    const dueDate = dd ? addDays(dd, r.termDays) : "";
    r.totalInvoiced += total;
    r.totalPaid += Math.max(0, paid);
    r.invoiceCount++;
    if (dd > r.lastPurchase) r.lastPurchase = dd;
    const remaining = total - paid;
    if (remaining > 0.005 && dd) {
      r.amountDue += remaining;
      r.maxDaysOverdue = Math.max(r.maxDaysOverdue, Math.max(0, daysBetween(today, dd)));
      r.maxPastDue = Math.max(r.maxPastDue, Math.max(0, daysBetween(today, dueDate)));
    } else if (remaining > 0.005) {
      r.amountDue += remaining;
    }
    // window profit + frequency (fully-paid invoices only)
    if (d.status === "paid" && dd >= cutoff) {
      r.profit += marginByInv.get(d.id) || 0;
      r.invoiceCountWindow++;
      r.qtyWindow += qtyByInv.get(d.id) || 0;
      const lp = lastPayByInv.get(d.id);   // late-paid: settled after the due date
      if (lp && dueDate && lp > dueDate) r.latePaidWindow++;
    }
  }

  for (const ch of chqs as any[]) {
    if (ch.customerId == null || (ch.type || "receivable") === "payable") continue;
    const r = map.get(ch.customerId); if (!r) continue;
    if (["pending", "deposited"].includes(ch.status)) r.pdcAmount += parseFloat(ch.amount || "0");
    if (ch.status === "bounced") r.bouncedPdc = true;
  }

  // Positive tier — rank customers with profit>0 by profit desc, cut into bands.
  const ranked = Array.from(map.values()).filter((r) => r.profit > 0.005).sort((a, b) => b.profit - a.profit);
  const N = ranked.length;
  const bestCount = Math.round((N * bestPct) / 100);
  const betterCount = Math.round((N * betterPct) / 100);
  ranked.forEach((r, i) => {
    if (i < bestCount && r.invoiceCountWindow >= 2) r.posTier = "best";
    else if (i < betterCount) r.posTier = "better";
    else r.posTier = "good";
  });

  const rows = Array.from(map.values()).map((r) => {
    const isCredit = r.creditLimit > 0;
    const overLimit = isCredit && r.amountDue > r.creditLimit + 0.005;
    const hasDue = r.amountDue > 0.005;
    let tier: string = r.posTier || "good";
    if (isCredit) { // negative override — credit accounts only
      if (r.maxPastDue >= badOverdueDays || r.latePaidWindow >= badLateCount || r.bouncedPdc) tier = "bad";
      else if (r.maxPastDue >= 1) tier = "watch";
    }
    return {
      customerId: r.customerId, name: r.name, type: r.type, phone: r.phone,
      creditLimit: r.creditLimit,
      totalInvoiced: r2(r.totalInvoiced), totalPaid: r2(r.totalPaid),
      amountDue: r2(r.amountDue), pdcAmount: r2(r.pdcAmount),
      invoiceCount: r.invoiceCount, lastPurchase: r.lastPurchase,
      maxDaysOverdue: r.maxDaysOverdue, maxPastDue: r.maxPastDue,
      profit: r2(r.profit), invoiceCountWindow: r.invoiceCountWindow,
      latePaidWindow: r.latePaidWindow, bouncedPdc: r.bouncedPdc,
      tier,                                          // best|better|good|watch|bad
      financialStatus: isCredit ? "credit" : "cash", // ACCOUNT type, not balance
      overLimit,
      hasPdc: r.pdcAmount > 0.005,                    // holds uncleared cheques (badge)
      overdue: hasDue && r.maxDaysOverdue > 0,
    };
  }).sort((a, b) => b.amountDue - a.amountDue);

  const tc = (t: string) => rows.filter((r) => r.tier === t).length;
  const totals = {
    customers: rows.length,
    totalInvoiced: r2(rows.reduce((s, r) => s + r.totalInvoiced, 0)),
    totalPaid: r2(rows.reduce((s, r) => s + r.totalPaid, 0)),
    totalDue: r2(rows.reduce((s, r) => s + r.amountDue, 0)),
    totalPdc: r2(rows.reduce((s, r) => s + r.pdcAmount, 0)),
    cash: rows.filter((r) => r.financialStatus === "cash").length,
    credit: rows.filter((r) => r.financialStatus === "credit").length,
    overdue: rows.filter((r) => r.overdue).length,
    overLimit: rows.filter((r) => r.overLimit).length,
    best: tc("best"), better: tc("better"), good: tc("good"),
    watch: tc("watch"), bad: tc("bad"),
    goodStanding: tc("best") + tc("better") + tc("good"),
  };
  return { rows, totals };
}

// ─── Seed ────────────────────────────────────────────────────────────────────
export async function seedDatabase(): Promise<void> {
  // Seed counters
  const existingCounters = await db.select().from(documentCounters);
  if (existingCounters.length === 0) {
    await db.insert(documentCounters).values([
      { type: "INV", nextNumber: 100360 },
      { type: "QT", nextNumber: 197235 },
      { type: "DN", nextNumber: 297333 },
      { type: "CN", nextNumber: 100001 },
      { type: "PO", nextNumber: 100001 },
    ]);
  }

  // Seed settings
  const existingSettings = await getSettings();
  if (!existingSettings) {
    await upsertSettings({});
  }

  // Seed stores
  const existingStores = await getStores();
  if (existingStores.length === 0) {
    await db.insert(stores).values([
      { nameEn: "Store 1 - Najma", nameAr: "المتجر 1 - النجمة", address: "Najma Street, Doha", type: "store" },
      { nameEn: "Store 2 - Main", nameAr: "المتجر 2 - الرئيسي", address: "Doha, Qatar", type: "store" },
      { nameEn: "Warehouse 1", nameAr: "المستودع 1", address: "Doha, Qatar", type: "warehouse" },
      { nameEn: "Warehouse 2", nameAr: "المستودع 2", address: "Doha, Qatar", type: "warehouse" },
      { nameEn: "Warehouse 3", nameAr: "المستودع 3", address: "Doha, Qatar", type: "warehouse" },
    ]);
  }

  // Seed admin user
  const existingUsers = await getUsers();
  if (existingUsers.length === 0) {
    await db.insert(users).values([
      { name: "Shakil", role: "admin", pin: "1234", storeId: null },
      { name: "Store Salesman", role: "salesman", pin: "1111", storeId: 1 },
      { name: "Warehouse Keeper", role: "warehouse", pin: "2222", storeId: 2 },
    ]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC SCHEMA ENGINE — managed lists, field definitions, custom modules
// ═══════════════════════════════════════════════════════════════════════════

// ── Managed lists (dynamic categories/units/terms/sub-locations) ──
export async function getManagedList(listKey: string) {
  return db.select().from(managedLists)
    .where(and(eq(managedLists.listKey, listKey), eq(managedLists.active, true)))
    .orderBy(asc(managedLists.sortOrder));
}
export async function getAllManagedLists() {
  return db.select().from(managedLists).orderBy(asc(managedLists.listKey), asc(managedLists.sortOrder));
}
export async function createManagedListItem(data: any) {
  const [row] = await db.insert(managedLists).values({
    listKey: data.listKey, value: data.value, meta: data.meta ?? {},
    sortOrder: data.sortOrder ?? 0, active: data.active ?? true,
  }).returning();
  return row;
}
export async function updateManagedListItem(id: number, data: any) {
  const [row] = await db.update(managedLists).set(data).where(eq(managedLists.id, id)).returning();
  return row;
}
export async function deleteManagedListItem(id: number) {
  await db.delete(managedLists).where(eq(managedLists.id, id));
}

// ── Field definitions (custom fields per module) ──
export async function getFieldDefinitions(moduleKey?: string) {
  const q = db.select().from(fieldDefinitions);
  const rows = moduleKey
    ? await q.where(eq(fieldDefinitions.moduleKey, moduleKey)).orderBy(asc(fieldDefinitions.sortOrder))
    : await q.orderBy(asc(fieldDefinitions.moduleKey), asc(fieldDefinitions.sortOrder));
  return rows;
}
export async function createFieldDefinition(data: any) {
  // Enforce field_key uniqueness within a module (matches the DB unique index).
  const dupe = await db.select().from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.moduleKey, data.moduleKey), eq(fieldDefinitions.fieldKey, data.fieldKey)));
  if (dupe.length) throw new Error(`Field "${data.fieldKey}" already exists in module "${data.moduleKey}"`);
  const [row] = await db.insert(fieldDefinitions).values({
    moduleKey: data.moduleKey, fieldKey: data.fieldKey, label: data.label,
    type: data.type ?? "text", options: data.options ?? [],
    required: data.required ?? false, visibleToRoles: data.visibleToRoles ?? [],
    showInList: data.showInList ?? false, sortOrder: data.sortOrder ?? 0, active: data.active ?? true,
  }).returning();
  return row;
}
export async function updateFieldDefinition(id: number, data: any) {
  const [row] = await db.update(fieldDefinitions).set(data).where(eq(fieldDefinitions.id, id)).returning();
  return row;
}
export async function deleteFieldDefinition(id: number) {
  await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, id));
}

// ── Module definitions (custom module builder) ──
export async function getModuleDefinitions() {
  return db.select().from(moduleDefinitions).where(eq(moduleDefinitions.active, true)).orderBy(asc(moduleDefinitions.sortOrder));
}
export async function createModuleDefinition(data: any) {
  const [row] = await db.insert(moduleDefinitions).values({
    moduleKey: data.moduleKey, name: data.name, description: data.description,
    icon: data.icon ?? "Box", categories: data.categories ?? [], roles: data.roles ?? [],
    isCustom: data.isCustom ?? true, active: data.active ?? true, sortOrder: data.sortOrder ?? 0,
  }).returning();
  return row;
}
export async function updateModuleDefinition(id: number, data: any) {
  const [row] = await db.update(moduleDefinitions).set(data).where(eq(moduleDefinitions.id, id)).returning();
  return row;
}
export async function deleteModuleDefinition(id: number) {
  await db.delete(moduleDefinitions).where(eq(moduleDefinitions.id, id));
}

// ── Custom records (data for admin-created modules) ──
export async function getCustomRecords(moduleKey: string) {
  return db.select().from(customRecords).where(eq(customRecords.moduleKey, moduleKey)).orderBy(desc(customRecords.createdAt));
}
export async function createCustomRecord(data: any) {
  const [row] = await db.insert(customRecords).values({
    moduleKey: data.moduleKey, data: data.data ?? {}, category: data.category ?? null, createdBy: data.createdBy ?? null,
  }).returning();
  return row;
}
export async function updateCustomRecord(id: number, data: any) {
  const [row] = await db.update(customRecords)
    .set({ data: data.data, category: data.category, updatedAt: new Date() })
    .where(eq(customRecords.id, id)).returning();
  return row;
}
export async function deleteCustomRecord(id: number) {
  await db.delete(customRecords).where(eq(customRecords.id, id));
}

// Legacy compatibility
export const storage = {
  getSettings,
  updateSettings: upsertSettings,
  createDefaultSettings: () => upsertSettings({}),
  getInvoices: () => getDocuments(),
  getInvoice: getDocument,
  createInvoice: createDocument,
  deleteInvoice: deleteDocument,
};
