import bcrypt from "bcryptjs";
import { db } from "./db";
import { computeInvoiceType, computeInvoiceTerms } from "@shared/invoiceType";
import { countsForProfit, countsForBalance } from "@shared/transactionMode";
import {
  settings, stores, users, customers, products, productAliases, inventory, suppliers,
  documents, documentItems, payments, cheques, returns as returnsTable,
  returnItems, approvalRequests, editLog, messagesLog, stockAdjustments, supplierOrders,
  documentCounters, damageClaims,
  supplierReturns, supplierPayments, notifications, cashflow, expenses, warehouseIssues, corrections,
  fieldDefinitions, moduleDefinitions, customRecords, managedLists, numberingAudit,
  ownerLoans, tasks, staffPayroll,
  arrangementNotes, arrangementNoteItems,
  type Settings, type InsertSettings,
  type Store, type InsertStore,
  type User, type InsertUser,
  type Customer, type InsertCustomer,
  type Product, type InsertProduct,
  type ProductAlias, type InsertProductAlias,
  type Inventory, type InsertInventory,
  type Supplier, type InsertSupplier,
  type Document, type InsertDocument, type DocumentWithItems, type CreateDocumentRequest,
  type DocumentItem, type InsertDocumentItem,
  type Payment, type InsertPayment,
  type Cheque, type InsertCheque,
  type Return, type ReturnItem,
  type ApprovalRequest, type InsertApprovalRequest,
  type EditLog,
  type MessagesLog,
  type StockAdjustment,
  type SupplierOrder, type SupplierReturn, type SupplierPayment, type Notification,
  type Cashflow, type Expense, type InsertExpense,
  type WarehouseIssue, type InsertWarehouseIssue,
  type Correction,
  type StaffPayroll, type InsertStaffPayroll,
  type ArrangementNote, type ArrangementNoteItem,
} from "@shared/schema";
import { eq, desc, asc, and, or, gte, lte, lt, ne, isNull, sql, inArray } from "drizzle-orm";
import { normalizeName, matchProduct, type MatchResult, type MatchCandidateInput } from "./matching";

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

/** Create a staff account.
 *
 *  This used to insert whatever it was handed. The Settings form sent no username
 *  and no password, so it produced accounts that could NEVER log in — login looks
 *  a user up by username, and a null username matches nothing. Two real accounts
 *  were created that way before anyone noticed.
 *
 *  So the credentials are demanded here, at the only place accounts are made. */
export async function createUser(
  data: InsertUser & { password?: string },
): Promise<User> {
  const { password, ...rest } = data as any;
  const patch: any = { ...rest };

  const uname = String(patch.username || "").trim().toLowerCase();
  if (uname.length < 3) throw new Error("A username of at least 3 characters is required — without one this account could never log in.");
  if (uname.split(" ").length > 1) throw new Error("Username cannot contain spaces.");
  const clash = await db.select().from(users).where(eq(users.username, uname));
  if (clash.length) throw new Error(`Username "${uname}" is already taken.`);
  patch.username = uname;

  if (!patch.passwordHash) {
    if (String(password || "").length < 8) {
      throw new Error("A starting password of at least 8 characters is required.");
    }
    patch.passwordHash = bcrypt.hashSync(String(password), 10);
  }

  // Same PIN rules as changing one later. A PIN approves discounts, so two people
  // sharing one makes every approval unattributable.
  const pin = String(patch.pin || "").trim();
  if (!/^[0-9]{4,6}$/.test(pin)) throw new Error("PIN must be 4 to 6 digits.");
  if (WEAK_PINS.has(pin) || new Set(pin).size === 1) {
    throw new Error("Choose a less obvious PIN — not a sequence like 1234 or the same digit repeated.");
  }
  const pinClash = await db.select().from(users).where(eq(users.pin, pin));
  if (pinClash.length) throw new Error("That PIN is already used by someone else — every person needs their own.");
  patch.pin = pin;

  const [row] = await db.insert(users).values(patch).returning();
  return row;
}

/** Remove a staff member.
 *
 *  TWO different things, and the difference matters:
 *
 *  DEACTIVATE (active: false) is the normal one. They cannot log in — login checks
 *  active — they drop off the staff list, but every invoice they ever raised still
 *  says they raised it. Use this for someone who left.
 *
 *  DELETE erases the row. Thirty-two tables reference users: invoices, payments,
 *  stock movements, approvals, deliveries. Deleting someone who has worked would
 *  either fail on a foreign key or, if forced, destroy the record of who sold what.
 *  An accounts trail that loses its names is not an accounts trail.
 *
 *  So a delete is allowed ONLY for an account that has never done anything — a
 *  typo, a duplicate, someone created by mistake. Everyone else is deactivated,
 *  and this says so rather than failing with a database error. */
export async function deleteUser(id: number, actingUserId?: number): Promise<{ deleted: true }> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw new Error("User not found.");

  if (actingUserId && id === actingUserId) {
    throw new Error("You cannot delete your own account.");
  }

  if (u.role === "admin") {
    const admins = await db.select().from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
    if (admins.length <= 1) {
      throw new Error("This is the last admin account — deleting it would lock everyone out.");
    }
  }

  // Has this person actually done anything? Count the trails that matter most; the
  // foreign-key catch below covers the rest.
  const [docs] = await db.select({ n: sql<number>`count(*)::int` }).from(documents).where(eq(documents.createdBy, id));
  const [pays] = await db.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.recordedBy, id));
  const [moves] = await db.select({ n: sql<number>`count(*)::int` }).from(stockAdjustments).where(eq(stockAdjustments.userId, id));
  const work = Number(docs?.n || 0) + Number(pays?.n || 0) + Number(moves?.n || 0);

  if (work > 0) {
    const bits = [
      Number(docs?.n || 0) ? `${docs.n} document(s)` : null,
      Number(pays?.n || 0) ? `${pays.n} payment(s)` : null,
      Number(moves?.n || 0) ? `${moves.n} stock movement(s)` : null,
    ].filter(Boolean).join(", ");
    throw new Error(
      `${u.name} cannot be deleted — ${bits} are recorded against this account, and ` +
      `erasing it would remove the record of who did that work. Deactivate the account ` +
      `instead: they lose access immediately and the history stays intact.`);
  }

  try {
    await db.delete(users).where(eq(users.id, id));
  } catch (e: any) {
    // 23503 = foreign key violation: they are referenced by something not counted above.
    if (e?.code === "23503") {
      throw new Error(
        `${u.name} is still linked to other records, so the account cannot be erased. ` +
        `Deactivate it instead — they lose access and the history stays intact.`);
    }
    throw e;
  }
  return { deleted: true };
}

/** Turn access on or off without touching a single record they created. */
export async function setUserActive(id: number, active: boolean, actingUserId?: number): Promise<User> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw new Error("User not found.");
  if (!active && actingUserId && id === actingUserId) {
    throw new Error("You cannot deactivate your own account.");
  }
  if (!active && u.role === "admin") {
    const admins = await db.select().from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
    if (admins.length <= 1) throw new Error("This is the last active admin — deactivating it would lock everyone out.");
  }
  const [row] = await db.update(users).set({ active }).where(eq(users.id, id)).returning();
  // Bump the token version so any live session dies now, rather than lasting until
  // their token happens to expire. Same mechanism invalidateUserSessions uses.
  if (!active) {
    await db.update(users)
      .set({ tokenVersion: (Number((u as any).tokenVersion) || 0) + 1 })
      .where(eq(users.id, id));
  }
  return row;
}

export async function updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) throw new Error("User not found.");
  const patch: any = { ...data };

  // Usernames are matched lowercased at login → store lowercased + keep them unique.
  if (patch.username !== undefined && patch.username !== null) {
    const uname = String(patch.username).trim().toLowerCase();
    if (uname.length < 3) throw new Error("Username must be at least 3 characters.");
    if (/\s/.test(uname)) throw new Error("Username cannot contain spaces.");
    const clash = await db.select().from(users).where(and(eq(users.username, uname), ne(users.id, id)));
    if (clash.length) throw new Error(`Username "${uname}" is already taken.`);
    patch.username = uname;
  }

  // Never let the last active admin be demoted or disabled — that locks everyone out.
  const losingAdmin = (target.role === "admin") &&
    ((patch.role !== undefined && patch.role !== "admin") || patch.active === false);
  if (losingAdmin) {
    const admins = await db.select().from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
    if (admins.length <= 1) throw new Error("Cannot remove the last active admin — assign another admin first.");
  }

  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  return row;
}

export async function verifyUserPin(userId: number, pin: string): Promise<boolean> {
  const user = await getUser(userId);
  return user?.pin === pin && user?.active === true;
}

const WEAK_PINS = new Set(["1234", "12345", "123456", "0123", "01234", "012345", "4321", "54321", "654321"]);
// A staff member sets their own PIN. Must be non-trivial and unique across staff,
// so a supervisor override (manager PIN) can't be guessed or shared.
export async function changeOwnPin(userId: number, newPin: string): Promise<void> {
  const pin = String(newPin || "").trim();
  if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must be 4 to 6 digits.");
  if (WEAK_PINS.has(pin) || /^(\d)\1+$/.test(pin)) throw new Error("Choose a less obvious PIN — not a sequence like 1234 or the same digit repeated.");
  const clash = await db.select().from(users).where(and(eq(users.pin, pin), ne(users.id, userId)));
  if (clash.length) throw new Error("That PIN is already used by another staff member — pick a different one.");
  await db.update(users).set({ pin, mustChangePin: false }).where(eq(users.id, userId));
}

// ─── Tasks (manager → staff workflow) ────────────────────────────────────────
const TASK_STATUS = ["open", "in_progress", "pending_verification", "done"];
export async function createTask(data: {
  title: string; note?: string | null; assignedTo: number; assignedBy?: number | null;
  storeId?: number | null; dueDate?: string | null;
}): Promise<any> {
  if (!data.title?.trim()) throw new Error("Task title is required.");
  if (!data.assignedTo) throw new Error("Pick who the task is for.");
  const [row] = await db.insert(tasks).values({
    title: data.title.trim(), note: data.note?.trim() || null,
    assignedTo: data.assignedTo, assignedBy: data.assignedBy ?? null,
    storeId: data.storeId ?? null, dueDate: data.dueDate || null, status: "open",
  } as any).returning();
  await createNotification({
    targetUserId: data.assignedTo, type: "task", title: "New task assigned",
    message: data.title.trim(), entityType: "task", entityId: row.id,
  }).catch(() => {});
  return row;
}

// All tasks (admin/manager) or only those assigned to `mineUserId`.
export async function getTasks(opts?: { mineUserId?: number; storeId?: number | null }): Promise<any[]> {
  const conds: any[] = [];
  if (opts?.mineUserId) conds.push(eq(tasks.assignedTo, opts.mineUserId));
  if (opts?.storeId != null) conds.push(eq(tasks.storeId, opts.storeId));
  const rows = conds.length
    ? await db.select().from(tasks).where(and(...conds)).orderBy(desc(tasks.id))
    : await db.select().from(tasks).orderBy(desc(tasks.id));
  const allUsers = await db.select().from(users);
  const nameById: Record<number, string> = {}; for (const u of allUsers) nameById[u.id] = u.name;
  const allStores = await db.select().from(stores);
  const storeById: Record<number, string> = {}; for (const s of allStores) storeById[s.id] = s.nameEn;
  return rows.map((t) => ({
    ...t,
    assignedToName: nameById[t.assignedTo] ?? `#${t.assignedTo}`,
    assignedByName: t.assignedBy ? (nameById[t.assignedBy] ?? null) : null,
    storeName: t.storeId ? (storeById[t.storeId] ?? null) : null,
  }));
}

export async function updateTask(
  id: number,
  data: { status?: string; title?: string; note?: string | null; dueDate?: string | null; assignedTo?: number },
  actor?: { id: number; role: string },
): Promise<any> {
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!existing) throw new Error("Task not found.");
  // The assignee may update their own task (e.g. mark it done); managers/admin/
  // warehouse-managers may update any; the assigner may update the one they made.
  if (actor) {
    const boss = ["admin", "manager", "worker"].includes(actor.role);
    const owns = existing.assignedTo === actor.id || existing.assignedBy === actor.id;
    if (!boss && !owns) throw new Error("You are not allowed to change this task.");
  }
  const patch: any = {};
  if (data.title !== undefined) patch.title = String(data.title).trim();
  if (data.note !== undefined) patch.note = data.note ? String(data.note).trim() : null;
  if (data.dueDate !== undefined) patch.dueDate = data.dueDate || null;
  if (data.assignedTo !== undefined) patch.assignedTo = data.assignedTo;
  if (data.status !== undefined) {
    if (!TASK_STATUS.includes(data.status)) throw new Error("Invalid task status.");
    patch.status = data.status;
    patch.completedAt = data.status === "done" ? new Date() : (data.status === "pending_verification" ? existing.completedAt : null);
  }
  const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
  return row;
}

export async function deleteTask(id: number): Promise<void> {
  await db.delete(tasks).where(eq(tasks.id, id));
}

// ─── Document Counters ───────────────────────────────────────────────────────
const DOC_COUNTER_DEFAULTS: Record<string, number> = {
  INV: 100360, QT: 197235, DN: 297333, CN: 100001, PO: 100001, RV: 500001, AR: 900001,
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

export class PricingApprovalRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingApprovalRequiredError";
  }
}

/** Supervisor override: find an ACTIVE admin/manager whose PIN matches, used to
 *  authorise a salesman's discount / price change on the spot. Null if no match. */
export async function getManagerByPin(pin: string): Promise<User | null> {
  const clean = String(pin || "").trim();
  if (clean.length < 4) return null;
  const rows = await db.select().from(users).where(and(eq(users.pin, clean), eq(users.active, true)));
  return rows.find((u) => ["admin", "manager"].includes(String(u.role))) ?? null;
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

export async function searchCustomers(query: string): Promise<Customer[]> {
  const pattern = `%${query}%`;
  return db.select().from(customers).where(
    and(
      eq(customers.active, true),
      or(
        sql`${customers.name} ILIKE ${pattern}`,
        sql`${customers.phone} ILIKE ${pattern}`,
        sql`${customers.address} ILIKE ${pattern}`,
      ),
    ),
  ).orderBy(asc(customers.name)).limit(30);
}

export async function getCustomer(id: number): Promise<Customer | undefined> {
  const [row] = await db.select().from(customers).where(eq(customers.id, id));
  return row;
}

// Store selected text fields in UPPER CASE so names/SKUs/descriptions read the same
// everywhere — screen, print, reports and CSV. Only the listed fields are touched;
// email/phone/TRN/notes/references keep their exact case.
function upperFields<T extends Record<string, any>>(data: T, fields: string[]): T {
  const out: any = { ...data };
  for (const f of fields) if (typeof out[f] === "string" && out[f].length) out[f] = out[f].toUpperCase();
  return out;
}
const CUSTOMER_UP = ["name", "address"];
const PRODUCT_UP = ["name", "sku", "unit", "category", "description"];
const ITEM_UP = ["description", "sku", "unit"];

export async function createCustomer(data: InsertCustomer): Promise<Customer> {
  const [row] = await db.insert(customers).values(upperFields(data, CUSTOMER_UP)).returning();
  return row;
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer> {
  const [row] = await db.update(customers).set(upperFields(data, CUSTOMER_UP)).where(eq(customers.id, id)).returning();
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

export async function searchProducts(query: string): Promise<Product[]> {
  const pattern = `%${query}%`;
  return db.select().from(products).where(
    and(
      eq(products.active, true),
      or(
        sql`${products.name} ILIKE ${pattern}`,
        sql`${products.sku} ILIKE ${pattern}`,
        sql`${products.category} ILIKE ${pattern}`,
      ),
    ),
  ).orderBy(asc(products.name)).limit(30);
}

export async function getProduct(id: number): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row;
}

export async function createProduct(data: InsertProduct): Promise<Product> {
  const [row] = await db.insert(products).values(upperFields(data, PRODUCT_UP)).returning();
  return row;
}

export async function updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product> {
  const [row] = await db.update(products).set(upperFields(data, PRODUCT_UP)).where(eq(products.id, id)).returning();
  return row;
}

// ─── Product Aliases & matching ──────────────────────────────────────────────
// See server/matching.ts for the rules. In short: an alias asserts two names are
// the SAME physical item, so a bad alias silently merges two SKUs and corrupts
// both stock and COGS. Every write below is guarded against that.

export class AliasConflictError extends Error {
  constructor(public alias: string, public conflictsWith: string) {
    super(`"${alias}" already refers to ${conflictsWith}`);
    this.name = "AliasConflictError";
  }
}

export async function getProductAliases(productId?: number): Promise<(ProductAlias & { productName: string })[]> {
  const rows = await db.select({ a: productAliases, productName: products.name })
    .from(productAliases)
    .innerJoin(products, eq(productAliases.productId, products.id))
    .where(productId ? eq(productAliases.productId, productId) : undefined)
    .orderBy(asc(products.name), asc(productAliases.alias));
  return rows.map((r) => ({ ...r.a, productName: r.productName }));
}

export async function createProductAlias(
  data: { productId: number; alias: string; source?: string; confirmedBy?: number | null },
): Promise<ProductAlias> {
  const alias = String(data.alias || "").trim().toUpperCase();
  const aliasNorm = normalizeName(alias);
  if (!aliasNorm) throw new Error("Alias is empty");

  const target = await getProduct(data.productId);
  if (!target) throw new Error(`Product ${data.productId} not found`);

  // An alias that is already some OTHER product's own name would make the same
  // string resolve two ways. Refuse rather than pick a winner.
  const [nameClash] = await db.select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.active, true), ne(products.id, data.productId),
      sql`${products.name} = ${alias}`))
    .limit(1);
  if (nameClash) throw new AliasConflictError(alias, `the product "${nameClash.name}"`);

  // Already claimed by another product?
  const [existing] = await db.select({ a: productAliases, productName: products.name })
    .from(productAliases)
    .innerJoin(products, eq(productAliases.productId, products.id))
    .where(eq(productAliases.aliasNorm, aliasNorm))
    .limit(1);
  if (existing) {
    if (existing.a.productId === data.productId) return existing.a; // idempotent re-confirm
    throw new AliasConflictError(alias, `"${existing.productName}"`);
  }

  const [row] = await db.insert(productAliases).values({
    productId: data.productId,
    alias,
    aliasNorm,
    source: data.source || "manual",
    confirmedBy: data.confirmedBy ?? null,
  }).returning();
  return row;
}

export async function deleteProductAlias(id: number): Promise<void> {
  await db.delete(productAliases).where(eq(productAliases.id, id));
}

/** Active catalogue with every confirmed alias attached — the input the matcher ranks. */
export async function getMatchCatalogue(): Promise<MatchCandidateInput[]> {
  const [rows, aliases] = await Promise.all([
    db.select({ id: products.id, name: products.name, sku: products.sku })
      .from(products).where(eq(products.active, true)),
    db.select({ productId: productAliases.productId, alias: productAliases.alias }).from(productAliases),
  ]);
  const byProduct = new Map<number, string[]>();
  for (const a of aliases) {
    const list = byProduct.get(a.productId);
    if (list) list.push(a.alias); else byProduct.set(a.productId, [a.alias]);
  }
  return rows.map((p) => ({ productId: p.id, name: p.name, sku: p.sku, aliases: byProduct.get(p.id) || [] }));
}

/**
 * Match a batch of incoming descriptions against the catalogue in one pass —
 * the catalogue is loaded once, not per line, so a 40-line scanned invoice is
 * a single query.
 */
export async function matchProductNames(
  queries: { description: string; sku?: string | null }[],
  opts: { limit?: number } = {},
): Promise<MatchResult[]> {
  const catalogue = await getMatchCatalogue();
  return queries.map((q) => matchProduct(q.description, catalogue, { sku: q.sku, limit: opts.limit }));
}

// ─── Inventory ───────────────────────────────────────────────────────────────

/** Quantity of one product at one location. Used to report before/after on an import. */
export async function getProductQtyAt(productId: number, storeId: number): Promise<number> {
  const [row] = await db.select({ qty: inventory.qty }).from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));
  return row ? Number(row.qty || 0) : 0;
}
/**
 * Stock rows, optionally narrowed to one store.
 *
 * warehouseScope decides what "and its warehouses" means:
 *   "owned" — only warehouses whose ownerStoreId is this store. Used by the
 *             Inventory store-group filter, where the question really is
 *             "what does this branch own".
 *   "all"   — every warehouse, whoever owns it. This is the scope a person
 *             selling gets, because staff rotate between the shop and the
 *             warehouses; a biller who cannot see warehouse stock cannot pull
 *             from it and cannot warn anyone when the count looks wrong.
 */
export async function getInventory(
  storeId?: number,
  includeWarehouses?: boolean,
  warehouseScope: "owned" | "all" = "owned",
): Promise<(Inventory & { product: Product; store: Store })[]> {
  let filter: any = undefined;
  if (storeId) {
    if (includeWarehouses) {
      const whFilter = warehouseScope === "all"
        ? eq(stores.type, "warehouse")
        : and(eq(stores.ownerStoreId, storeId), eq(stores.type, "warehouse"));
      const owned = await db.select({ id: stores.id }).from(stores).where(whFilter);
      const ids = [storeId, ...owned.map(r => r.id)];
      filter = inArray(inventory.storeId, ids);
    } else {
      filter = eq(inventory.storeId, storeId);
    }
  }
  const rows = await db.select({
    inv: inventory,
    product: products,
    store: stores,
  })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(stores, eq(inventory.storeId, stores.id))
    .where(filter)
    .orderBy(asc(products.name));
  return rows.map(r => ({ ...r.inv, product: r.product, store: r.store }));
}

export async function getProductStock(productId: number, storeId: number): Promise<number> {
  const [row] = await db.select().from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));
  return parseFloat(row?.qty || "0");
}

/** Resolve a stock movement against the current on-hand quantity.
 *  Stock can never go negative, so a delta that would take it below zero is
 *  clamped - and `applied` then differs from what was requested. Callers must
 *  record `applied`, not the request, or the audit trail stops reconciling with
 *  the inventory it is supposed to explain. */
export function applyStockDelta(current: number, qtyChange: number): { newQty: number; applied: number; clamped: boolean } {
  const newQty = Math.max(0, current + qtyChange);
  const applied = newQty - current;
  return { newQty, applied, clamped: applied !== qtyChange };
}

/** STOCKTAKE — set stock to the number a human actually counted on the shelf.
 *
 *  adjustStock() takes a DELTA: "add 17", "remove 3". A person counting a shelf does
 *  not know the delta, they know the total: "there are 47". Making them subtract in
 *  their head is where counting errors come from.
 *
 *  This writes the absolute figure and records the VARIANCE — what the system
 *  believed minus what was actually there. That variance is the useful number: it is
 *  shrinkage, breakage, or an unrecorded sale, and it is invisible if you only ever
 *  post deltas.
 *
 *  Counting an item also marks it tracked. Before a count its quantity was unknown;
 *  afterwards it is a real number, so low-stock alerts and valuation now apply. */
export async function setStockCount(data: {
  productId: number;
  storeId: number;
  countedQty: number;
  userId?: number;
  note?: string;
}): Promise<{ productId: number; storeId: number; before: number; after: number; variance: number }> {
  const productId = Number(data.productId);
  const storeId = Number(data.storeId);
  const counted = Number(data.countedQty);

  if (!productId) throw new Error("A product is required to record a count.");
  if (!storeId) throw new Error("A location is required — a count is always of one shelf.");
  if (!Number.isFinite(counted)) throw new Error("The counted quantity must be a number.");
  if (counted < 0) throw new Error("A counted quantity cannot be negative — you cannot have less than none.");

  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) throw new Error("Product not found.");

  const existing = await db.select().from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));

  const wasTracked = (product as any).trackStock !== false;
  // An untracked product had no meaningful quantity, so there is nothing to vary from.
  const before = existing.length && wasTracked ? parseFloat(existing[0].qty || "0") : 0;
  const variance = Number((counted - before).toFixed(4));

  if (existing.length === 0) {
    await db.insert(inventory).values({ productId, storeId, qty: String(counted) });
  } else {
    await db.update(inventory)
      .set({ qty: String(counted), updatedAt: new Date() })
      .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));
  }

  // Counting it makes the quantity real from now on.
  if (!wasTracked) await db.update(products).set({ trackStock: true } as any).where(eq(products.id, productId));

  const reasonBits = [
    wasTracked
      ? `Counted ${counted}; system had ${before} (variance ${variance >= 0 ? "+" : ""}${variance})`
      : `First count: ${counted} (was not previously tracked)`,
  ];
  if (data.note) reasonBits.push(data.note);

  await db.insert(stockAdjustments).values({
    productId, storeId,
    qtyChange: String(variance),
    type: "count",
    reason: reasonBits.join(" — "),
    userId: data.userId,
  });

  return { productId, storeId, before, after: counted, variance };
}

/** Count a whole shelf in one go. Each line is independent: one bad line does not
 *  lose the rest of the shelf, it comes back in `failed` with its reason. */
export async function setStockCountBatch(
  storeId: number,
  counts: Array<{ productId: number; countedQty: number; note?: string }>,
  userId?: number,
) {
  const applied: Awaited<ReturnType<typeof setStockCount>>[] = [];
  const failed: { productId: number; reason: string }[] = [];
  for (const c of counts || []) {
    try {
      applied.push(await setStockCount({ ...c, storeId, userId }));
    } catch (e) {
      failed.push({ productId: c?.productId, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  const totalVariance = Number(applied.reduce((s2, a) => s2 + a.variance, 0).toFixed(2));
  return {
    applied, failed,
    counted: applied.length,
    discrepancies: applied.filter((a) => Math.abs(a.variance) > 0.0001).length,
    totalVariance,
  };
}

export async function adjustStock(
  productId: number, storeId: number, qtyChange: number,
  type: string, reason?: string, referenceId?: number, userId?: number,
): Promise<void> {
  const existing = await db.select().from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));

  const current = existing.length === 0 ? 0 : parseFloat(existing[0].qty || "0");
  const { newQty, applied, clamped } = applyStockDelta(current, qtyChange);

  if (existing.length === 0) {
    await db.insert(inventory).values({ productId, storeId, qty: String(newQty) });
  } else {
    await db.update(inventory)
      .set({ qty: String(newQty), updatedAt: new Date() })
      .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));
  }

  // Record what ACTUALLY moved. Recording the request instead let inventory and
  // its own audit trail disagree, and stockAdjustments.qtyChange feeds the stock
  // movement report (routes.ts), so the discrepancy was reaching a real report.
  await db.insert(stockAdjustments).values({
    productId, storeId, qtyChange: String(applied), type,
    reason: clamped
      ? [reason, "[clamped: requested " + qtyChange + ", applied " + applied + " - stock cannot go negative]"].filter(Boolean).join(" ")
      : reason,
    referenceId, userId,
  });
}

export async function getLowStockItems(): Promise<(Inventory & { product: Product; store: Store })[]> {
  const all = await getInventory();
  return all.filter(item => {
    // An uncounted product has an unknown quantity. Alerting on it would bury the
    // real alerts under thousands of items nobody maintains.
    if ((item.product as any)?.trackStock === false) return false;
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
export async function getDocuments(type?: string, storeId?: number, opts?: { lean?: boolean }): Promise<DocumentWithItems[]> {
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

  const lean = opts?.lean === true;
  return docs.map((doc) => {
    const customer = doc.customerId != null ? custById.get(doc.customerId) || null : null;
    const items = itemsByDoc.get(doc.id) || [];
    if (!lean) return { ...doc, items, customer };
    // Lean list view: null out the heavy base64 image blobs that only the
    // detail/print and delivery views need — the embedded customer logo and the
    // signed-DN / damage proof photos. A single 300 KB customer logo repeated
    // across every invoice was ballooning /api/documents to ~15 MB; the list only
    // needs names, totals and status. Detail (/api/documents/:id) and /api/deliveries
    // still return the full payload with images.
    return {
      ...doc,
      signedDnUrl: null,
      damagePhoto: null,
      items,
      customer: customer ? { ...customer, logoUrl: null } : null,
    };
  });
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
    terms = computeInvoiceTerms({ total: doc.total || "0", date: doc.date, invoiceType: invoiceType as any, payments: pays as any, cheques: chqs as any, termDays, dueDate: (doc as any).dueDate ?? null });
  }
  return { ...doc, items, payments: pays, customer, invoiceType, terms } as any;
}

// ─── Stock Transfers (TR) ────────────────────────────────────────────────────
// Ownership group of a location: a store owns itself; a warehouse belongs to its
// ownerStoreId (null = a common warehouse, its own group). SAME group → free stock
// move (no money); DIFFERENT group → cross-owner transfer valued at cost price.
function transferGroupKey(store: any): string {
  if (!store) return "unknown";
  if (store.type === "warehouse") return store.ownerStoreId != null ? `s:${store.ownerStoreId}` : "common";
  return `s:${store.id}`;
}
export async function transferIsCrossOwner(fromStoreId: number, toStoreId: number): Promise<boolean> {
  const [from] = await db.select().from(stores).where(eq(stores.id, fromStoreId));
  const [to] = await db.select().from(stores).where(eq(stores.id, toStoreId));
  return transferGroupKey(from) !== transferGroupKey(to);
}

interface TransferReq {
  date: string; fromStoreId: number; toStoreId: number; takenBy?: string | null; notes?: string | null;
  items: { productId: number; sku?: string | null; description: string; qty: number | string; unit: string }[];
  createdBy?: number | null;
  linkedDocId?: number | null;   // original TR this one returns against
}

async function priceTransferItems(fromStoreId: number, toStoreId: number, items: TransferReq["items"]) {
  const [from] = await db.select().from(stores).where(eq(stores.id, fromStoreId));
  const [to] = await db.select().from(stores).where(eq(stores.id, toStoreId));
  const crossOwner = transferGroupKey(from) !== transferGroupKey(to);
  const prodIds = items.map((i) => i.productId).filter(Boolean) as number[];
  const prods = prodIds.length ? await db.select().from(products).where(inArray(products.id, prodIds)) : [];
  const costById: Record<number, number> = {};
  for (const p of prods) costById[p.id] = Number((p as any).costPrice || 0);
  let total = 0;
  const priced = items.map((i) => {
    const qty = Number(i.qty) || 0;
    const cost = crossOwner ? (costById[i.productId] || 0) : 0; // same-owner → zero value
    const amount = qty * cost;
    total += amount;
    return { ...i, qty, cost, amount };
  });
  return { crossOwner, total, priced };
}

export async function createTransfer(req: TransferReq): Promise<any> {
  if (!req.fromStoreId || !req.toStoreId) throw new Error("Source and destination are required.");
  if (req.fromStoreId === req.toStoreId) throw new Error("Source and destination must differ.");
  if (!req.items?.length) throw new Error("Add at least one item to transfer.");
  for (const it of req.items) if (!(Number(it.qty) > 0)) throw new Error(`Quantity must be greater than zero for ${it.description || "an item"}.`);

  // A RETURN can never exceed what was originally transferred, minus what was already
  // returned. Guards against e.g. returning 155 against an original of 23.
  if (req.linkedDocId) {
    const [orig] = await db.select().from(documents).where(and(eq(documents.id, req.linkedDocId), eq(documents.type, "TR")));
    if (!orig) throw new Error("Original transfer not found.");
    if (orig.status !== "received") throw new Error(`Cannot return against ${orig.number} — it must be received first.`);
    if (orig.linkedDocId) throw new Error(`${orig.number} is itself a return — you cannot return a return.`);
    const origItems = await db.select().from(documentItems).where(eq(documentItems.documentId, req.linkedDocId));
    const origByProd: Record<number, number> = {};
    for (const it of origItems as any[]) if (it.productId != null) origByProd[it.productId] = (origByProd[it.productId] || 0) + Number(it.qty || 0);
    const priorReturns = await db.select().from(documents).where(and(eq(documents.type, "TR"), eq(documents.linkedDocId, req.linkedDocId), ne(documents.status, "cancelled")));
    const retIds = priorReturns.map((r) => r.id);
    const retItems = retIds.length ? await db.select().from(documentItems).where(inArray(documentItems.documentId, retIds)) : [];
    const returnedByProd: Record<number, number> = {};
    for (const it of retItems as any[]) if (it.productId != null) returnedByProd[it.productId] = (returnedByProd[it.productId] || 0) + Number(it.qty || 0);
    for (const item of req.items) {
      if (!(item.productId in origByProd)) throw new Error(`${item.description} was not part of ${orig.number} — cannot return it.`);
      const remaining = (origByProd[item.productId] || 0) - (returnedByProd[item.productId] || 0);
      if (Number(item.qty) > remaining + 0.005) {
        throw new Error(`Cannot return ${Number(item.qty)} of ${item.description} against ${orig.number} — only ${remaining} left to return (of ${origByProd[item.productId]} transferred).`);
      }
    }
  }

  const { total, priced } = await priceTransferItems(req.fromStoreId, req.toStoreId, req.items);
  const number = await resolveDocumentNumber("TR");
  const [doc] = await db.insert(documents).values({
    type: "TR", number, date: req.date, storeId: req.fromStoreId, toStoreId: req.toStoreId,
    takenBy: req.takenBy ? String(req.takenBy).toUpperCase() : null,
    status: "draft", transactionMode: "real",
    subtotal: String(total), total: String(total), taxRate: "0", taxAmount: "0", discountAmount: "0",
    notes: req.notes || null, linkedDocId: req.linkedDocId ?? null, createdBy: req.createdBy ?? null,
  } as any).returning();

  await db.insert(documentItems).values(priced.map((i) => ({
    documentId: doc.id, productId: i.productId,
    sku: i.sku ? String(i.sku).toUpperCase() : i.sku,
    description: String(i.description).toUpperCase(),
    qty: String(i.qty), unit: i.unit ? String(i.unit).toUpperCase() : i.unit,
    price: String(i.cost), amount: String(i.amount), locationStoreId: req.fromStoreId,
  })) as any);

  return doc;
}

export async function updateTransfer(id: number, req: Partial<TransferReq>): Promise<any> {
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.type, "TR")));
  if (!doc) throw new Error("Transfer not found.");
  if (doc.status !== "draft") throw new Error("Only a draft transfer can be edited.");
  const fromStoreId = req.fromStoreId ?? doc.storeId!;
  const toStoreId = req.toStoreId ?? (doc as any).toStoreId;
  if (fromStoreId === toStoreId) throw new Error("Source and destination must differ.");
  const items = req.items ?? [];
  const { total, priced } = await priceTransferItems(fromStoreId, toStoreId, items);
  await db.update(documents).set({
    storeId: fromStoreId, toStoreId, date: req.date ?? doc.date,
    takenBy: req.takenBy !== undefined ? (req.takenBy ? String(req.takenBy).toUpperCase() : null) : (doc as any).takenBy,
    notes: req.notes !== undefined ? req.notes : doc.notes,
    subtotal: String(total), total: String(total),
  } as any).where(eq(documents.id, id));
  if (req.items) {
    await db.delete(documentItems).where(eq(documentItems.documentId, id));
    await db.insert(documentItems).values(priced.map((i) => ({
      documentId: id, productId: i.productId,
      sku: i.sku ? String(i.sku).toUpperCase() : i.sku,
      description: String(i.description).toUpperCase(),
      qty: String(i.qty), unit: i.unit ? String(i.unit).toUpperCase() : i.unit,
      price: String(i.cost), amount: String(i.amount), locationStoreId: fromStoreId,
    })) as any);
  }
  return { ok: true };
}

export async function getTransfers(): Promise<any[]> {
  const docs = await db.select().from(documents).where(eq(documents.type, "TR")).orderBy(desc(documents.id));
  const allStores = await db.select().from(stores);
  const byId: Record<number, any> = {}; for (const s of allStores) byId[s.id] = s;
  const allUsers = await db.select().from(users);
  const userById: Record<number, any> = {}; for (const u of allUsers) userById[u.id] = u;
  const numById: Record<number, string> = {}; for (const d of docs) numById[d.id] = d.number;
  const ids = docs.map((d) => d.id);
  const items = ids.length ? await db.select().from(documentItems).where(inArray(documentItems.documentId, ids)) : [];
  const itemsByDoc: Record<number, any[]> = {};
  for (const it of items as any[]) (itemsByDoc[it.documentId] = itemsByDoc[it.documentId] || []).push(it);
  return docs.map((d) => ({
    ...d,
    fromStore: byId[d.storeId!]?.nameEn ?? `#${d.storeId}`,
    toStore: byId[(d as any).toStoreId]?.nameEn ?? `#${(d as any).toStoreId}`,
    crossOwner: transferGroupKey(byId[d.storeId!]) !== transferGroupKey(byId[(d as any).toStoreId]),
    approvedByName: (d as any).authorizedBy ? (userById[(d as any).authorizedBy]?.name ?? null) : null,
    // Off-system receipt → show the external person's name; else the staff user who confirmed.
    receivedByName: (d as any).externalReceiver
      ? (d as any).externalReceiver
      : ((d as any).receivedBy ? (userById[(d as any).receivedBy]?.name ?? null) : null),
    confirmMethod: (d as any).confirmMethod ?? null,
    externalReceiver: (d as any).externalReceiver ?? null,
    returnOfNumber: (d as any).linkedDocId ? (numById[(d as any).linkedDocId] ?? null) : null,
    items: itemsByDoc[d.id] || [],
  }));
}

async function loadTransfer(id: number) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.type, "TR")));
  if (!doc) throw new Error("Transfer not found.");
  const items = await db.select().from(documentItems).where(eq(documentItems.documentId, id));
  return { doc, items };
}

// Inter-owner settlement: net the cost-valued cross-owner transfers between each
// ownership-group pair over a period. Only RECEIVED (completed) transfers count.
// Reverse-direction transfers cancel out → the net debtor pays the difference.
export async function getTransferSettlement(start?: string, end?: string): Promise<any> {
  const r2 = (n: number) => Number(n.toFixed(2));
  const conds: any[] = [eq(documents.type, "TR"), eq(documents.status, "received")];
  if (start) conds.push(gte(documents.date, start));
  if (end) conds.push(lte(documents.date, end));
  const docs = await db.select().from(documents).where(and(...conds));
  const allStores = await db.select().from(stores);
  const byId: Record<number, any> = {}; for (const s of allStores) byId[s.id] = s;
  const groupName = (key: string) => (key === "common" ? "Common" : byId[Number(key.slice(2))]?.nameEn ?? key);

  // Directed flow between groups (source GAVE value → destination OWES it).
  const flow: Record<string, Record<string, number>> = {};
  let count = 0;
  for (const d of docs) {
    const fromG = transferGroupKey(byId[d.storeId!]);
    const toG = transferGroupKey(byId[(d as any).toStoreId]);
    if (fromG === toG) continue;
    const amt = Number(d.total || 0);
    if (amt <= 0.005) continue;
    (flow[fromG] = flow[fromG] || {});
    flow[fromG][toG] = (flow[fromG][toG] || 0) + amt;
    count++;
  }

  const groupKeys = Array.from(new Set([...Object.keys(flow), ...Object.values(flow).flatMap((o) => Object.keys(o))]));
  const seen = new Set<string>();
  const settlements: any[] = [];
  for (const a of groupKeys) for (const b of groupKeys) {
    if (a === b) continue;
    const key = [a, b].sort().join("|");
    if (seen.has(key)) continue; seen.add(key);
    const aToB = flow[a]?.[b] || 0; // a gave b → b owes a
    const bToA = flow[b]?.[a] || 0; // b gave a → a owes b
    const net = aToB - bToA;
    if (Math.abs(net) < 0.005) continue;
    const [creditorKey, debtorKey, amount] = net > 0 ? [a, b, net] : [b, a, -net];
    settlements.push({
      creditor: groupName(creditorKey), debtor: groupName(debtorKey), amount: r2(amount),
      grossCreditorGave: r2(net > 0 ? aToB : bToA), grossDebtorGave: r2(net > 0 ? bToA : aToB),
    });
  }
  return { period: { start: start ?? null, end: end ?? null }, transferCount: count, settlements };
}

export async function approveTransfer(id: number, userId?: number): Promise<any> {
  const { doc, items } = await loadTransfer(id);
  if (doc.status !== "draft") throw new Error("Only a draft transfer can be approved.");
  // Source must actually hold the stock. adjustStock clamps inventory at 0 but logs the
  // full delta, so an over-deduct would silently create phantom stock at the destination.
  // Block it here instead of corrupting the ledger.
  for (const it of items as any[]) {
    if (!it.productId) continue;
    const qty = parseFloat(it.qty || "0");
    const [inv] = await db.select().from(inventory).where(and(eq(inventory.productId, it.productId), eq(inventory.storeId, doc.storeId!)));
    const have = parseFloat(inv?.qty || "0");
    if (qty > have + 0.005) throw new Error(`Not enough stock to transfer ${qty} of ${it.description} — source has only ${have}.`);
  }
  for (const it of items as any[]) if (it.productId) await adjustStock(it.productId, doc.storeId!, -parseFloat(it.qty || "0"), "transfer", `Transfer ${doc.number} out`, id, userId); // stock leaves source
  await db.update(documents).set({ status: "approved", authorizedBy: userId ?? null, authorizedAt: new Date() } as any).where(eq(documents.id, id));
  await logEdit({ documentId: id, userId, field: "status", oldValue: "draft", newValue: "approved", reason: "Transfer approved — stock released from source" });
  return { ok: true };
}

const CONFIRM_METHODS = ["on-system", "signature", "whatsapp", "phone"];
export async function receiveTransfer(
  id: number, userId?: number,
  opts?: { method?: string; externalReceiver?: string },
): Promise<any> {
  const { doc, items } = await loadTransfer(id);
  if (doc.status !== "approved") throw new Error("Only an approved transfer can be received.");
  // How the destination acknowledged. Default on-system (our own staff clicked Confirm).
  // Off-system methods (signature/whatsapp/phone) also carry the external person's name.
  const method = opts?.method && CONFIRM_METHODS.includes(opts.method) ? opts.method : "on-system";
  const externalReceiver = method === "on-system" ? null : (opts?.externalReceiver ? String(opts.externalReceiver).toUpperCase().trim() || null : null);
  if (method !== "on-system" && !externalReceiver) throw new Error("Name of who received the goods is required for an off-system confirmation.");
  for (const it of items as any[]) if (it.productId) await adjustStock(it.productId, (doc as any).toStoreId, parseFloat(it.qty || "0"), "transfer", `Transfer ${doc.number} in`, id, userId); // stock lands at destination
  await db.update(documents).set({ status: "received", receivedBy: userId ?? null, receivedAt: new Date(), confirmMethod: method, externalReceiver } as any).where(eq(documents.id, id));
  await logEdit({ documentId: id, userId, field: "status", oldValue: "approved", newValue: "received", reason: `Transfer received (${method}${externalReceiver ? ` — ${externalReceiver}` : ""})` });
  return { ok: true };
}

export async function cancelTransfer(id: number, userId?: number): Promise<any> {
  const { doc, items } = await loadTransfer(id);
  if (doc.status === "received") throw new Error("A received transfer cannot be cancelled — do a reverse transfer.");
  if (doc.status === "approved") {
    for (const it of items as any[]) if (it.productId) await adjustStock(it.productId, doc.storeId!, parseFloat(it.qty || "0"), "transfer", `Transfer ${doc.number} cancelled`, id, userId); // return released stock to source
  }
  await db.update(documents).set({ status: "cancelled" } as any).where(eq(documents.id, id));
  await logEdit({ documentId: id, userId, field: "status", oldValue: doc.status, newValue: "cancelled", reason: "Transfer cancelled" });
  return { ok: true };
}

/** Cost of a sold line. Prefers the snapshot frozen at the moment of sale;
 *  falls back to the product CURRENT cost only for rows written before the
 *  cost_at_sale column existed. Never returns NaN.
 *
 *  Without this, changing a supplier cost silently rewrote the margin on every
 *  invoice ever sold, because profit re-read products.costPrice at report time. */
export function resolveItemCost(costAtSale: any, currentCost: any): number {
  if (costAtSale !== null && costAtSale !== undefined && costAtSale !== "") {
    const pinned = Number(costAtSale);
    if (Number.isFinite(pinned)) return pinned;
  }
  const current = Number(currentCost);
  return Number.isFinite(current) ? current : 0;
}

/** Current cost of every referenced product, keyed by id. Read at WRITE time so
 *  the cost that applied at sale is what gets stored on the line. */
async function snapshotCosts(items: Array<{ productId?: any }>): Promise<Record<number, string>> {
  const ids = Array.from(new Set(
    (items || []).map((i) => Number(i?.productId)).filter((n) => Number.isFinite(n) && n > 0)));
  if (!ids.length) return {};
  const rows = await db.select({ id: products.id, costPrice: products.costPrice })
    .from(products).where(inArray(products.id, ids));
  const out: Record<number, string> = {};
  for (const r of rows) out[r.id] = String(r.costPrice ?? "0");
  return out;
}

/** Record what a customer already owed before this system existed.
 *
 *  Eleven years of trading on paper. A customer owes QAR 50,000 built up over
 *  years; roughly 10% of that was margin and 90% was material cost, and every
 *  riyal of that profit was earned long ago. What matters now is only collecting it.
 *
 *  So this creates a plain unpaid invoice carrying the ORIGINAL paper number and
 *  the ORIGINAL date — which is what makes ageing honest, and what lets a payment
 *  be settled against the oldest debt first — marked transactionMode "opening" so
 *  it counts towards what is OWED and never towards PROFIT.
 *
 *  Deliberately NOT createDocument(): no items, so no stock moves and no cost is
 *  invented; no credit-limit gate, because the debt already exists whether it fits
 *  the limit or not; no numbering counter, because the number came off their paper. */
/** Take a payment and clear the OLDEST debt first.
 *
 *  A customer owes QAR 50,000 across a dozen invoices going back years and hands
 *  over QAR 30,000. Nobody wants to sit and decide which invoices that covers, and
 *  guessing differently each time makes ageing meaningless.
 *
 *  So it fills the oldest invoice, then the next, until the money runs out. The last
 *  one touched is usually left part-paid, which is correct and normal.
 *
 *  Each allocation goes through createPayment(), so the overpayment guard, the
 *  paid/partial status ladder and the cash ledger all behave exactly as they do for
 *  a single payment. No parallel money path. */
export async function collectOldestFirst(data: {
  customerId: number;
  amount: number;
  method: string;
  date: string;
  reference?: string;
  notes?: string;
  recordedBy?: number;
}) {
  const amount = Number(data.amount);
  if (!data.customerId) throw new Error("Choose which customer is paying.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("The amount must be more than zero.");

  // Every invoice this customer still owes on, oldest first. Demo rows are not real
  // money; opening balances ARE, and are usually the oldest debt there is.
  const docs = (await db.select().from(documents).where(and(
    eq(documents.customerId, data.customerId),
    eq(documents.type, "INV"),
  ))).filter((d: any) =>
    countsForBalance(d) && d.status !== "void" && d.status !== "returned");

  const allPays = await db.select().from(payments)
    .where(inArray(payments.documentId, docs.map((d) => d.id).length ? docs.map((d) => d.id) : [-1]));

  const owing = docs.map((d: any) => {
    const mine = allPays.filter((p: any) => p.documentId === d.id);
    return { doc: d, remaining: remainingBalance(d.total, mine) };
  })
    .filter((x) => x.remaining > 0.005)
    // Oldest date first; same date falls back to the lower id, so it is deterministic.
    .sort((a, b) => String(a.doc.date).localeCompare(String(b.doc.date)) || a.doc.id - b.doc.id);

  const totalOwed = Number(owing.reduce((s2, x) => s2 + x.remaining, 0).toFixed(2));
  if (!owing.length) throw new Error("This customer has nothing outstanding.");
  if (amount > totalOwed + PAYMENT_EPSILON) {
    throw new Error(
      `That is more than the customer owes. Outstanding is QAR ${totalOwed.toFixed(2)}, ` +
      `this payment is QAR ${amount.toFixed(2)}. There is no customer credit account for ` +
      `the difference, so take only what is owed.`);
  }

  let left = amount;
  const allocations: Array<{ documentId: number; number: string; date: string; was: number; paid: number; nowOwes: number; cleared: boolean }> = [];

  for (const item of owing) {
    if (left <= 0.005) break;
    const take = Math.min(left, item.remaining);
    await createPayment({
      documentId: item.doc.id,
      customerId: data.customerId,
      amount: String(Number(take.toFixed(2))),
      method: data.method,
      date: data.date,
      reference: data.reference ?? null,
      notes: data.notes || "Collection — applied to the oldest balance first.",
      recordedBy: data.recordedBy ?? null,
    } as any);
    left = Number((left - take).toFixed(2));
    allocations.push({
      documentId: item.doc.id,
      number: item.doc.number,
      date: item.doc.date,
      was: Number(item.remaining.toFixed(2)),
      paid: Number(take.toFixed(2)),
      nowOwes: Number((item.remaining - take).toFixed(2)),
      cleared: item.remaining - take <= 0.005,
    });
  }

  return {
    customerId: data.customerId,
    collected: Number((amount - left).toFixed(2)),
    allocations,
    invoicesCleared: allocations.filter((a) => a.cleared).length,
    owedBefore: totalOwed,
    owedAfter: Number((totalOwed - (amount - left)).toFixed(2)),
  };
}

export async function createOpeningBalance(data: {
  customerId: number;
  amount: number;
  date: string;
  number?: string;
  notes?: string;
  storeId?: number | null;
  createdBy?: number;
}): Promise<Document> {
  const amount = Number(data.amount);
  if (!data.customerId) throw new Error("Choose which customer owes this.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("The outstanding amount must be more than zero.");
  if (!data.date || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(data.date))) {
    throw new Error("A date is required (YYYY-MM-DD) — it is what makes the ageing correct.");
  }
  if (String(data.date) > new Date().toISOString().slice(0, 10)) {
    throw new Error("An opening balance cannot be dated in the future.");
  }

  const [cust] = await db.select().from(customers).where(eq(customers.id, data.customerId));
  if (!cust) throw new Error("Customer not found.");

  // Their own paper reference where there is one, so the customer recognises it.
  let number = String(data.number || "").trim().toUpperCase();
  if (number) {
    const clash = await db.select().from(documents).where(eq(documents.number, number));
    if (clash.length) throw new Error(`Invoice number "${number}" already exists in the system.`);
  } else {
    const existing = await db.select({ n: sql<number>`count(*)::int` }).from(documents)
      .where(eq(documents.transactionMode, "opening"));
    number = `OB-${String(Number(existing[0]?.n || 0) + 1).padStart(4, "0")}`;
  }

  const [doc] = await db.insert(documents).values({
    type: "INV",
    number,
    date: data.date,
    customerId: data.customerId,
    customerName: cust.name,
    storeId: data.storeId ?? null,
    status: "unpaid",
    transactionMode: "opening",
    subtotal: String(amount),
    total: String(amount),
    taxRate: "0", taxAmount: "0", discountAmount: "0",
    notes: data.notes || "Balance carried in from before the system.",
    createdBy: data.createdBy ?? null,
  } as any).returning();

  return doc;
}

/** Several at once. Each line stands alone, so one bad row does not lose the rest
 *  of an afternoon of typing. */
export async function createOpeningBalances(
  rows: Array<{ customerId: number; amount: number; date: string; number?: string; notes?: string; storeId?: number | null }>,
  createdBy?: number,
) {
  const created: Document[] = [];
  const failed: { row: number; customerId: number; reason: string }[] = [];
  for (let i = 0; i < (rows || []).length; i++) {
    try {
      created.push(await createOpeningBalance({ ...rows[i], createdBy }));
    } catch (e) {
      failed.push({ row: i + 1, customerId: rows[i]?.customerId, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  const total = created.reduce((s2, d) => s2 + Number((d as any).total || 0), 0);
  return { created, failed, count: created.length, totalOwed: Number(total.toFixed(2)) };
}

export async function createDocument(req: CreateDocumentRequest): Promise<DocumentWithItems> {
  // ── Customer gate — every invoice (cash + credit) must have a linked customer.
  // Blocks anonymous invoices at the API layer, not just in the UI.
  if (req.type === "INV" && req.customerId == null) {
    throw new Error("A customer is required for every invoice — select or add one before saving.");
  }
  if (req.type === "INV" && req.storeId == null) {
    throw new Error("A store is required for every invoice — assign the user to a store or select one.");
  }

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

  // ── Discount / price-change gate (money integrity) ──
  // Admin and manager price freely. A salesman may discount up to
  // settings.discountApprovalThreshold with NO approval — a walk-in customer will
  // not wait at the counter while someone finds a manager, and a blocking gate on
  // every small discount costs more in lost sales than it saves in margin.
  // Above the threshold a manager PIN is required. Either way the discount is
  // recorded against whoever created the invoice, so nothing is invisible.
  let pricingApprovedBy: number | null = null;
  if (req.type === "INV") {
    const invItems: any[] = (req.items as any[]) || [];
    const footerDisc = Number((req as any).discountAmount || 0) > 0;
    const lineReduced = invItems.some((i) =>
      Number(i.discountAmount || 0) > 0 ||
      (i.originalPrice != null && Number(i.price) < Number(i.originalPrice) - 0.005),
    );
    if (footerDisc || lineReduced) {
      const actor = req.createdBy ? await getUser(req.createdBy) : null;
      const isBoss = actor ? ["admin", "manager"].includes(String(actor.role)) : false;

      // How much was actually given away: the footer discount plus every line discount,
      // plus any line sold under its original price.
      const lineGiven = invItems.reduce((sum, i) => {
        const explicit = Number(i.discountAmount || 0);
        const cut = i.originalPrice != null
          ? Math.max(0, (Number(i.originalPrice) - Number(i.price)) * Number(i.qty || 0))
          : 0;
        return sum + explicit + cut;
      }, 0);
      const givenAway = Number((Number((req as any).discountAmount || 0) + lineGiven).toFixed(2));
      const { discountApprovalThreshold } = await getBusinessRules();
      const withinSalesmanLimit = givenAway <= discountApprovalThreshold + 0.005;
      // A manager approving this action (e.g. an over-limit sale replayed from the
      // Approvals inbox) authorizes any bundled discount too — no PIN needed then.
      const authorizer = (req as any).authorizedBy ? await getUser(Number((req as any).authorizedBy)) : null;
      const authorizerIsBoss = authorizer ? ["admin", "manager"].includes(String(authorizer.role)) : false;
      if (!isBoss && !withinSalesmanLimit) {
        if (authorizerIsBoss) {
          pricingApprovedBy = authorizer!.id;
        } else {
          const approver = await getManagerByPin(String((req as any).pricingOverridePin || ""));
          if (!approver) {
            throw new PricingApprovalRequiredError(
              `This discount is QAR ${givenAway.toFixed(2)}, over the QAR ${discountApprovalThreshold.toFixed(2)} a salesman may give. A manager PIN is needed.`);
          }
          pricingApprovedBy = approver.id;
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
    dueDate: (req as any).dueDate ?? null,
    pricingApprovedBy,
    customerId: req.customerId,
    customerName: req.customerName ? String(req.customerName).toUpperCase() : req.customerName,
    supplierId: (req as any).supplierId,
    expectedDate: (req as any).expectedDate,
    transactionMode: (req as any).transactionMode,
    paymentType: (req as any).paymentType,
    deliveryMethod: (req as any).deliveryMethod,
    deliveryStatus: (req as any).deliveryStatus,
    deliveryAddress: (req as any).deliveryAddress,
    mapLink: (req as any).mapLink ?? null,
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
    const costSnap = await snapshotCosts(req.items as any[]);
    const inserted = await db.insert(documentItems).values(
      req.items.map(item => ({
        documentId: doc.id,
        productId: item.productId,
        sku: item.sku ? String(item.sku).toUpperCase() : item.sku,
        description: item.description ? String(item.description).toUpperCase() : item.description,
        qty: String(item.qty),
        unit: item.unit ? String(item.unit).toUpperCase() : item.unit,
        price: String(item.price),
        discountType: item.discountType,
        discountAmount: String(item.discountAmount || "0"),
        amount: String(item.amount),
        costAtSale: costSnap[Number(item.productId)] ?? null,
        locationStoreId: (item as any).locationStoreId ?? null,
      }))
    ).returning();
    items.push(...inserted);
  }

  // ── Smart split: deduct stock per-location, generate arrangement note ──
  if (req.type === "INV") {
    const invoiceStoreId = req.storeId;
    // Find all same-owner locations (stores + warehouses under same owner).
    const allStores = await db.select().from(stores).where(eq(stores.active, true));
    let sameOwnerIds: number[] = [];
    if (invoiceStoreId) {
      const invoiceStore = allStores.find(s => s.id === invoiceStoreId);
      const ownerId = invoiceStore?.ownerStoreId ?? invoiceStoreId;
      sameOwnerIds = allStores
        .filter(s => s.id === ownerId || s.ownerStoreId === ownerId || s.id === invoiceStoreId)
        .map(s => s.id);
    }

    // Build split plan for each item.
    type SplitEntry = { productId: number; description: string; unit: string; totalQty: number;
      sourceStoreId: number; splitQty: number; documentItemId?: number };
    const splitPlan: SplitEntry[] = [];
    let needsNote = false;

    for (let idx = 0; idx < req.items.length; idx++) {
      const item = req.items[idx];
      if (!item.productId) {
        // Non-product line (custom description) — no stock to split.
        continue;
      }
      const totalQty = parseFloat(String(item.qty));
      const preferredLoc = (item as any).locationStoreId ?? invoiceStoreId;
      const insertedItem = items[idx];

      if (preferredLoc && sameOwnerIds.length <= 1) {
        // Single location — deduct directly (backward compat for simple setups).
        await adjustStock(item.productId, preferredLoc, -totalQty, "sale", "Invoice sale", doc.id, req.createdBy);
        splitPlan.push({ productId: item.productId, description: String(item.description),
          unit: String(item.unit), totalQty, sourceStoreId: preferredLoc, splitQty: totalQty,
          documentItemId: insertedItem?.id });
        continue;
      }

      // Multi-location split: check availability across all same-owner locations.
      const stockByLoc: { storeId: number; available: number }[] = [];
      for (const locId of sameOwnerIds) {
        const qty = await getProductStock(item.productId, locId);
        if (qty > 0) stockByLoc.push({ storeId: locId, available: qty });
      }

      // Sort: preferred location first (minimize transfers), then by most stock.
      stockByLoc.sort((a, b) => {
        if (a.storeId === preferredLoc) return -1;
        if (b.storeId === preferredLoc) return 1;
        return b.available - a.available;
      });

      let remaining = totalQty;
      const itemSplits: { storeId: number; take: number }[] = [];

      for (const loc of stockByLoc) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, loc.available);
        itemSplits.push({ storeId: loc.storeId, take });
        remaining -= take;
      }

      // If still remaining after all locations, deduct from preferred (goes to 0, clamped).
      if (remaining > 0 && preferredLoc) {
        itemSplits.push({ storeId: preferredLoc, take: remaining });
        remaining = 0;
      }

      // Deduct stock per split.
      for (const sp of itemSplits) {
        await adjustStock(item.productId, sp.storeId, -sp.take, "sale", "Invoice sale", doc.id, req.createdBy);
        splitPlan.push({ productId: item.productId, description: String(item.description),
          unit: String(item.unit), totalQty, sourceStoreId: sp.storeId, splitQty: sp.take,
          documentItemId: insertedItem?.id });
      }
      if (itemSplits.length > 1) needsNote = true;
      if (itemSplits.length === 1 && itemSplits[0].storeId !== preferredLoc) needsNote = true;
    }

    // Generate arrangement note when items span multiple locations.
    // Also generate for any invoice with product items — staff need to know what to prepare.
    if (splitPlan.length > 0) {
      try {
        const pickupLocId = invoiceStoreId ?? null;
        const isDelivery = (req as any).deliveryMethod === "deliver_site";
        // Determine main warehouse: type=warehouse with ownerStoreId matching invoice store.
        const mainWh = allStores.find(s => s.type === "warehouse" && s.ownerStoreId === invoiceStoreId) ?? null;
        const deliveryHub = mainWh?.id ?? invoiceStoreId;

        const [note] = await db.insert(arrangementNotes).values({
          documentId: doc.id,
          pickupLocationId: isDelivery ? deliveryHub : pickupLocId,
          deliveryMethod: isDelivery ? "delivery" : "pickup",
          status: "pending",
        }).returning();

        // Group items by staff responsibility:
        // - Main warehouse staff handles items at main warehouse.
        // - Store staff handles everything else (store + other warehouses).
        for (const sp of splitPlan) {
          const isMainWh = mainWh && sp.sourceStoreId === mainWh.id;
          const staffGroup = isMainWh ? "warehouse" : "store";
          const bringToLoc = (sp.sourceStoreId !== (isDelivery ? deliveryHub : pickupLocId))
            ? (isDelivery ? deliveryHub : pickupLocId)
            : null;

          await db.insert(arrangementNoteItems).values({
            noteId: note.id,
            documentItemId: sp.documentItemId ?? null,
            productId: sp.productId,
            description: sp.description,
            unit: sp.unit,
            totalQty: String(sp.totalQty),
            sourceStoreId: sp.sourceStoreId,
            splitQty: String(sp.splitQty),
            bringTo: bringToLoc,
            staffGroup,
            arranged: false,
          });
        }

        // Notify staff about arrangement.
        await createNotification({
          targetRole: "worker", type: "arrangement", title: "New arrangement note",
          message: `${number} for ${req.customerName || "customer"} — ${splitPlan.length} item(s) to arrange.`,
          link: `/documents/${doc.id}`, entityType: "document", entityId: doc.id, createdBy: req.createdBy,
        });
        if (needsNote || splitPlan.some(s => s.sourceStoreId !== deliveryHub)) {
          await createNotification({
            targetRole: "salesman", type: "arrangement", title: "Multi-location arrangement",
            message: `${number} — items split across locations. Check arrangement note.`,
            link: `/documents/${doc.id}`, entityType: "document", entityId: doc.id, createdBy: req.createdBy,
          });
        }

        // Also notify admin
        await createNotification({
          targetRole: "admin", type: "arrangement", title: "Arrangement note created",
          message: `${number} for ${req.customerName || "customer"} — ${splitPlan.length} item(s).`,
          link: `/documents/${doc.id}`, entityType: "document", entityId: doc.id, createdBy: req.createdBy,
        }).catch(() => {});

        // Create tasks in staff dashboard so staff see arrangement in TasksPanel
        const staffUsers = await db.select().from(users);
        const whItems = splitPlan.filter(s => mainWh && s.sourceStoreId === mainWh.id);
        const storeItems = splitPlan.filter(s => !(mainWh && s.sourceStoreId === mainWh.id));

        // Warehouse staff tasks
        if (whItems.length > 0) {
          const warehouseUsers = staffUsers.filter(u => u.role === "worker");
          const itemList = whItems.map(i => `${i.description} x${i.splitQty}`).join(", ");
          for (const wUser of warehouseUsers) {
            await createTask({
              title: `📦 Arrange: ${number}`,
              note: `Warehouse items to prepare: ${itemList}. Customer: ${req.customerName || "N/A"}. View arrangement note on document page.`,
              assignedTo: wUser.id,
              assignedBy: req.createdBy ?? null,
              storeId: mainWh?.id ?? null,
            }).catch(() => {});
          }
        }

        // Store staff tasks
        if (storeItems.length > 0) {
          const storeUsers = staffUsers.filter(u => u.role === "salesman" && u.storeId === invoiceStoreId);
          const itemList = storeItems.map(i => `${i.description} x${i.splitQty}`).join(", ");
          for (const sUser of storeUsers) {
            await createTask({
              title: `📦 Arrange: ${number}`,
              note: `Store items to prepare: ${itemList}. Customer: ${req.customerName || "N/A"}. View arrangement note on document page.`,
              assignedTo: sUser.id,
              assignedBy: req.createdBy ?? null,
              storeId: invoiceStoreId ?? null,
            }).catch(() => {});
          }
        }
      } catch (e) { console.error("Arrangement note generation failed:", e); }
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
        mapLink: (req as any).mapLink ?? null,
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
        targetRole: "worker", type: "pick_pending", title: "New delivery to pick",
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
  for (const p of tenders) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0) continue;
    if (p.method === "Credit") continue; // deferred — creates no payment row, only outstanding balance

    // Mandatory confirmation fields per method — kept SIMPLE (spec rule 22).
    // Cash: nothing. Card: terminal reference only. Online: sender account/IBAN +
    // reference + bank. PDC: cheque no. + clear date + bank (who = auto from customer).
    if (p.method === "Card" && !p.referenceNumber)
      throw new Error("Card payment requires the reference number from the card terminal.");
    if ((p.method === "Online Transfer" || p.method === "Bank Transfer") && (!p.referenceNumber || !p.bankName || !p.accountNumber))
      throw new Error("Online transfer requires sender account/IBAN, reference number and bank name.");
    if (p.method === "PDC" && (!p.chequeNumber || !p.chequeDate || !p.bankName))
      throw new Error("PDC requires cheque number, bank name and cheque date.");

    const methodLabel =
      p.method === "PDC" ? "Cheque" :
      p.method === "Card" ? "Credit Card" :
      (p.method === "Online Transfer" || p.method === "Bank Transfer") ? "Bank Transfer" : "Cash";
    // Confirmation fields on the payment row → searchable ledger for disputes/audit.
    // Staff (recordedBy) + timestamp (createdAt) are automatic.
    const [pay] = await db.insert(payments).values({
      documentId: doc.id, customerId: req.customerId ?? null, amount: String(amt),
      method: methodLabel,
      date: (p.method === "Online Transfer" || p.method === "Bank Transfer") ? (p.transferDate || req.date) : req.date,
      reference: p.method === "PDC" ? (p.chequeNumber || null) : (p.referenceNumber || null),
      accountNumber: (p.method === "Online Transfer" || p.method === "Bank Transfer") ? (p.accountNumber || null) : null,
      bankName: (p.method === "Online Transfer" || p.method === "Bank Transfer" || p.method === "PDC") ? (p.bankName || null) : null,
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
  // Recompute status from ALL payment rows (same logic as createPayment).
  if (doc.type === "INV" && tenders.length > 0) {
    const allPays = await getPayments(doc.id);
    const totalPaid = allPays.reduce(
      (s, p) => s + (p.isRefund ? -1 : 1) * parseFloat(p.amount || "0"), 0);
    const totalNum = parseFloat(doc.total || "0");
    const status = totalNum > 0 && totalPaid >= totalNum - 0.005 ? "paid" : totalPaid > 0.005 ? "partial" : "unpaid";
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
  // Clear FK-constrained child rows before deleting document items
  const oldItems = await db.select({ id: documentItems.id }).from(documentItems).where(eq(documentItems.documentId, documentId));
  if (oldItems.length > 0) {
    const oldIds = oldItems.map(i => i.id);
    // arrangement_note_items → document_item_id FK
    const notes = await db.select({ id: arrangementNotes.id }).from(arrangementNotes).where(eq(arrangementNotes.documentId, documentId));
    for (const n of notes) {
      await db.delete(arrangementNoteItems).where(eq(arrangementNoteItems.noteId, n.id));
    }
    if (notes.length > 0) {
      await db.delete(arrangementNotes).where(eq(arrangementNotes.documentId, documentId));
    }
  }
  await db.delete(documentItems).where(eq(documentItems.documentId, documentId));
  if (items.length > 0) {
    const costSnap = await snapshotCosts(items as any[]);
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
        costAtSale: costSnap[Number(item.productId)] ?? null,
        locationStoreId: (item as any).locationStoreId ?? null,
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
export async function getBusinessRules(): Promise<{ pdcThreshold: number; returnPdcThreshold: number; returnApprovalThreshold: number; discountApprovalThreshold: number; voidWindowHours: number; pdcAlertDays: number; maintenanceChequeThreshold: number }> {
  const s: any = await getSettings();
  return {
    pdcThreshold: Number(s?.pdcThreshold ?? 4000),               // VOID refunds only
    returnPdcThreshold: Number(s?.returnPdcThreshold ?? 5000),   // RETURN refunds (separate rule)
    returnApprovalThreshold: Number(s?.returnApprovalThreshold ?? 1000), // returns OVER this need manager
    discountApprovalThreshold: Number(s?.discountApprovalThreshold ?? 100), // discounts OVER this need a manager PIN
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

/** Recording money collected must never exceed what the invoice is owed. Blocks
    e.g. a QAR 9,000 cheque booked against an 860 invoice (the excess would sit
    untracked, since there is no customer-credit ledger). Routes map this to 400. */
export class OverpaymentError extends Error {
  code = "OVERPAYMENT";
  invoiceNumber: string;
  remaining: number;
  requested: number;
  constructor(invoiceNumber: string, remaining: number, requested: number) {
    const rem = Math.max(0, remaining);
    super(`Payment exceeds the balance due. Invoice ${invoiceNumber} has QAR ${rem.toFixed(2)} left to pay, but QAR ${requested.toFixed(2)} was entered. Record at most the remaining balance — for cash, take the tender and hand back change rather than logging the extra.`);
    this.name = "OverpaymentError";
    this.invoiceNumber = invoiceNumber;
    this.remaining = rem;
    this.requested = requested;
  }
}

/** Net money actually collected on a document = payments minus refunds.
    Refund rows must NOT count as collected, or a refund would flip an invoice
    back to "paid". Money columns are drizzle numeric -> strings at runtime. */
export function netCollected(pays: Array<{ amount?: any; isRefund?: any }>): number {
  return pays.reduce((s, p) => s + (p.isRefund ? -1 : 1) * parseFloat(p.amount || "0"), 0);
}

/** Balance still owed. May be negative only if data is already corrupt; callers
    clamp for display, never for the comparison. */
export function remainingBalance(total: any, pays: Array<{ amount?: any; isRefund?: any }>): number {
  return parseFloat(total || "0") - netCollected(pays);
}

/** Epsilon for accepting a payment (QAR, 1 fils). */
export const PAYMENT_EPSILON = 0.01;
/** Epsilon for flipping a document to paid/partial. */
export const STATUS_EPSILON = 0.005;

/** Would this non-refund payment push net collected past the total? */
export function isOverpayment(amount: any, total: any, pays: Array<{ amount?: any; isRefund?: any }>): boolean {
  return Number(amount) > remainingBalance(total, pays) + PAYMENT_EPSILON;
}

/** Payment status ladder. Epsilon absorbs float drift so partials that sum to
    the total correctly flip to "paid" (e.g. 1944.999999 >= 1945). */
export function paymentStatusFor(total: number, totalPaid: number): "paid" | "partial" | "unpaid" {
  return total > 0 && totalPaid >= total - STATUS_EPSILON ? "paid" : totalPaid > STATUS_EPSILON ? "partial" : "unpaid";
}

export async function createPayment(data: InsertPayment): Promise<Payment> {
  // Overpayment guard — a real customer payment (not a refund) may never push the
  // net collected past the invoice total. Refunds reduce the balance and are exempt;
  // void/returned invoices are terminal and not re-paid. Small epsilon absorbs rounding.
  if (!data.isRefund && data.documentId && Number(data.amount) > 0) {
    const [d] = await db.select({
      total: documents.total, status: documents.status, type: documents.type, number: documents.number,
    }).from(documents).where(eq(documents.id, data.documentId));
    if (d && d.type === "INV" && d.status !== "void" && d.status !== "returned") {
      const prior = await db.select({ amount: payments.amount, isRefund: payments.isRefund })
        .from(payments).where(eq(payments.documentId, data.documentId));
      const remaining = remainingBalance(d.total, prior);
      if (isOverpayment(data.amount, d.total, prior)) {
        throw new OverpaymentError(d.number || String(data.documentId), remaining, Number(data.amount));
      }
    }
  }

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
      const totalPaid = netCollected(allPays);
      const total = parseFloat(doc.total || "0");
      // Never overwrite a terminal status (a void/returned invoice stays that way).
      if (doc.status !== "void" && doc.status !== "returned") {
        // Compare with a small epsilon so cumulative partial payments that sum to the
        // total (across any number of payments / days) correctly flip to "paid" despite
        // floating-point drift (e.g. 1944.999999 ≥ 1945).
        const status = paymentStatusFor(total, totalPaid);
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

  // Batch the customer lookup (was one query per cheque — N+1) and drop the heavy
  // base64 logo from the embedded customer: the cheque register only needs the name,
  // and a single 300 KB customer logo repeated per cheque bloated this endpoint to ~1.2 MB.
  const custIds = Array.from(new Set(rows.map((c) => c.customerId).filter((x): x is number => x != null)));
  const custRows = custIds.length
    ? await db.select().from(customers).where(inArray(customers.id, custIds))
    : [];
  const custById = new Map(custRows.map((c) => [c.id, c]));
  return rows.map((c) => {
    const full = c.customerId != null ? custById.get(c.customerId) : undefined;
    const customer = full ? { ...full, logoUrl: null } : undefined;
    return { ...c, customer, customerName: full?.name ?? null };
  });
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
export async function getCashPosition(filterStoreId?: number | null): Promise<{
  perStore: Array<{ storeId: number | null; storeName: string; net: number }>;
  total: number; cashInHand: number; bank: number; pdcPending: number; pdcPayable: number;
}> {
  const allRows = await db.select().from(cashflow);
  const allStores = await db.select().from(stores);
  const [cfg] = await db.select().from(settings).limit(1);
  const openingCash = Number(cfg?.openingCash || 0);
  const openingBank = Number(cfg?.openingBank || 0);
  // When filtering by store, only include that store's cashflow — opening
  // balances are company-wide so they only appear in the "all" view.
  const storeFiltered = filterStoreId != null;
  const rows = storeFiltered
    ? allRows.filter((r) => r.storeId === filterStoreId)
    : allRows;
  const byStore = new Map<number | null, number>();
  let total = storeFiltered ? 0 : openingCash + openingBank;
  for (const r of rows) {
    const amt = Number(r.amount || 0) * (r.direction === "in" ? 1 : -1);
    total += amt;
    byStore.set(r.storeId ?? null, (byStore.get(r.storeId ?? null) || 0) + amt);
  }
  // Split by instrument: cashflow notes tag the method. Only genuine Cash hits the
  // till; Bank Transfer / Online / Cheque / Card all move through the bank — a
  // cheque-paid expense (e.g. shop rent) must NOT drain cash-in-hand.
  let cashInHand = storeFiltered ? 0 : openingCash;
  let bank = storeFiltered ? 0 : openingBank;
  for (const r of rows) {
    const amt = Number(r.amount || 0) * (r.direction === "in" ? 1 : -1);
    if (/bank transfer|online|cheque|card/i.test(r.notes || "")) bank += amt; else cashInHand += amt;
  }
  const pend = await db.select().from(cheques).where(inArray(cheques.status, ["pending", "deposited"]));
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
export async function setChequeStatus(id: number, status: string, userId?: number, fundsOverride?: { override?: boolean; overrideReason?: string }, extras?: { depositProofUrl?: string; depositedToAccount?: string; clearanceProofUrl?: string }): Promise<Cheque> {
  const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.id, id));
  if (!chq) throw new Error("Cheque not found");
  const ALLOWED = ["pending", "deposited", "cleared", "bounced", "cancelled"];
  if (!ALLOWED.includes(status)) throw new Error(`Invalid cheque status: ${status}`);
  if (chq.status === status) return chq;
  if (["cleared", "bounced", "cancelled"].includes(chq.status))
    throw new Error(`Cheque is already ${chq.status} — terminal state.`);

  const today = new Date().toISOString().slice(0, 10);

  // PDC banking rule: cannot deposit or clear a cheque before its written date.
  if ((status === "deposited" || status === "cleared") && chq.chequeDate > today) {
    throw new Error(`Cannot ${status === "deposited" ? "deposit" : "clear"} before the cheque date (${chq.chequeDate}). PDC cheques can only be deposited on or after their written date.`);
  }

  // Clearing requires the cheque to have been deposited first.
  if (status === "cleared" && chq.status !== "deposited") {
    throw new Error("Cheque must be deposited before it can be cleared. Mark it as deposited first.");
  }

  if (status === "cleared" && chq.type === "payable") {
    await ensureFunds({
      instrument: "bank",
      amount: Number(chq.amount || 0),
      override: fundsOverride?.override, overrideReason: fundsOverride?.overrideReason, userId,
      context: `Cheque ${chq.chequeNumber} clearing (${chq.who || "payable"})`,
    });
  }

  const patch: any = { status };
  if (status === "deposited") {
    patch.depositedDate = today;
    if (extras?.depositProofUrl) patch.depositProofUrl = extras.depositProofUrl;
    if (extras?.depositedToAccount) patch.depositedToAccount = extras.depositedToAccount;
  }
  if (status === "cleared") {
    patch.clearedDate = today;
    if (extras?.clearanceProofUrl) patch.clearanceProofUrl = extras.clearanceProofUrl;
  }
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
      notes: `Cheque ${chq.chequeNumber} cleared (${chq.bankName})${chq.depositedToAccount || extras?.depositedToAccount ? ` → ${chq.depositedToAccount || extras?.depositedToAccount}` : ""}`, createdBy: userId,
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

// PDC Swap: customer pays cash or bank transfer, takes their cheque back.
// Cancels the cheque and books the payment as cash/bank inflow.
export async function swapChequeToPayment(id: number, method: "cash" | "bank_transfer", notes: string, userId?: number): Promise<Cheque> {
  const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.id, id));
  if (!chq) throw new Error("Cheque not found");
  if (!["pending", "deposited"].includes(chq.status))
    throw new Error(`Cannot swap — cheque is already ${chq.status}.`);
  if (chq.type !== "receivable")
    throw new Error("Swap is only for receivable cheques (customer PDCs).");

  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.update(cheques).set({
    status: "cancelled",
    recoveryNotes: `Swapped to ${method === "cash" ? "cash" : "bank transfer"} on ${today}. ${notes || ""}`.trim(),
  }).where(eq(cheques.id, id)).returning();

  const doc: any = chq.documentId ? await getDocument(chq.documentId).catch(() => null) : null;
  const methodLabel = method === "cash" ? "Cash" : "Bank Transfer";
  await logCashflow({
    direction: "in",
    category: `PDC Swap — ${methodLabel}`,
    amount: Number(chq.amount || 0),
    refType: "cheque", refId: chq.id,
    storeId: doc?.storeId ?? undefined,
    notes: `Cheque ${chq.chequeNumber} swapped to ${methodLabel.toLowerCase()} (${chq.bankName}, ${chq.who || "unknown"})${notes ? ` — ${notes}` : ""}`,
    createdBy: userId,
  });

  await createNotification({
    targetRole: "admin", type: "pdc_swap", title: "PDC swapped to " + methodLabel.toLowerCase(),
    message: `Cheque ${chq.chequeNumber} (${chq.bankName}) QAR ${Number(chq.amount || 0).toFixed(2)} from ${chq.who || "unknown"} swapped to ${methodLabel.toLowerCase()}.`,
    link: "/pdc", entityType: "cheque", entityId: chq.id, createdBy: userId,
  });

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
  if (chq.depositedDate) history.push({ at: chq.depositedDate, label: `Deposited${chq.depositedToAccount ? ` → ${chq.depositedToAccount}` : ""}` });
  if (chq.clearedDate) history.push({ at: chq.clearedDate, label: "Cleared — funds credited" });
  if (chq.bouncedDate) history.push({ at: chq.bouncedDate, label: "Bounced" });
  if (chq.recoveryStatus) history.push({ at: chq.bouncedDate || new Date().toISOString().slice(0, 10), label: `Recovery: ${chq.recoveryStatus.replace(/_/g, " ")}`, note: chq.recoveryNotes });
  const corr = await getCorrections("cheque", id);
  for (const c of corr as any[]) history.push({ at: new Date(c.createdAt).toISOString().slice(0, 10), label: `Corrected: ${c.oldValue} → ${c.newValue}`, note: c.reason });
  history.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  // Replacement cheque link (if bounced and replaced)
  let replacementCheque: any = null;
  if (chq.replacementChequeId) {
    const [rep]: any[] = await db.select().from(cheques).where(eq(cheques.id, chq.replacementChequeId));
    if (rep) replacementCheque = { id: rep.id, chequeNumber: rep.chequeNumber, amount: rep.amount, status: rep.status };
  }
  // If this cheque IS a replacement, find the original bounced cheque
  let originalBouncedCheque: any = null;
  const [origBounced]: any[] = await db.select().from(cheques).where(eq(cheques.replacementChequeId, id));
  if (origBounced) originalBouncedCheque = { id: origBounced.id, chequeNumber: origBounced.chequeNumber, amount: origBounced.amount };
  return { ...chq, linkedDoc, history, replacementCheque, originalBouncedCheque };
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

// Upload / replace a deposit proof slip (bank receipt showing the cheque was deposited).
export async function setChequeDepositProof(id: number, depositProofUrl: string): Promise<Cheque> {
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(depositProofUrl)) throw new Error("Deposit proof must be a PNG/JPG/WebP image.");
  if (depositProofUrl.length > 6_000_000) throw new Error("Image too large — keep it under ~4 MB.");
  const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.id, id));
  if (!chq) throw new Error("Cheque not found");
  if (!["deposited", "cleared"].includes(chq.status)) throw new Error("Cheque must be deposited or cleared to attach proof.");
  const [row] = await db.update(cheques).set({ depositProofUrl }).where(eq(cheques.id, id)).returning();
  return row;
}

// Upload / replace clearance proof (bank statement or confirmation showing the cheque cleared).
export async function setChequeClearanceProof(id: number, clearanceProofUrl: string): Promise<Cheque> {
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(clearanceProofUrl)) throw new Error("Clearance proof must be a PNG/JPG/WebP image.");
  if (clearanceProofUrl.length > 6_000_000) throw new Error("Image too large — keep it under ~4 MB.");
  const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.id, id));
  if (!chq) throw new Error("Cheque not found");
  if (chq.status !== "cleared") throw new Error("Cheque must be cleared to attach clearance proof.");
  const [row] = await db.update(cheques).set({ clearanceProofUrl }).where(eq(cheques.id, id)).returning();
  return row;
}

// Bounced cheque recovery workflow: track what action is being taken to recover the amount.
const RECOVERY_STATUSES = ["replacement_requested", "replacement_received", "cash_requested", "cash_received", "written_off"] as const;
export async function setChequeRecovery(id: number, recoveryStatus: string, recoveryNotes: string, userId?: number): Promise<Cheque> {
  const [chq]: any[] = await db.select().from(cheques).where(eq(cheques.id, id));
  if (!chq) throw new Error("Cheque not found");
  if (chq.status !== "bounced") throw new Error("Only bounced cheques have a recovery workflow.");
  if (!RECOVERY_STATUSES.includes(recoveryStatus as any)) throw new Error(`Invalid recovery status: ${recoveryStatus}`);
  const [row] = await db.update(cheques).set({ recoveryStatus, recoveryNotes: recoveryNotes || null }).where(eq(cheques.id, id)).returning();

  // When cash is received for a bounced cheque, book the money in.
  if (recoveryStatus === "cash_received") {
    const doc: any = chq.documentId ? await getDocument(chq.documentId).catch(() => null) : null;
    await logCashflow({
      direction: "in",
      category: "Bounced cheque — cash recovered",
      amount: Number(chq.amount || 0), refType: "cheque", refId: chq.id,
      storeId: doc?.storeId ?? undefined,
      notes: `Cash recovery for bounced cheque ${chq.chequeNumber} (${chq.bankName})`,
      createdBy: userId,
    });
  }

  // Notify admin of recovery updates
  await createNotification({
    targetRole: "admin", type: "cheque_recovery",
    title: `Cheque recovery: ${recoveryStatus.replace(/_/g, " ")}`,
    message: `Bounced cheque ${chq.chequeNumber} (QAR ${Number(chq.amount || 0).toFixed(2)}) — ${recoveryStatus.replace(/_/g, " ")}.${recoveryNotes ? " Notes: " + recoveryNotes.slice(0, 120) : ""}`,
    link: `/cheques/${chq.id}`, entityType: "cheque", entityId: chq.id, createdBy: userId,
  });
  return row;
}

// Create a replacement cheque for a bounced one. The new cheque is linked back
// via replacementChequeId on the original, and the original's recovery status
// is set to replacement_received.
export async function createReplacementCheque(
  bouncedId: number,
  data: { chequeNumber: string; bankName: string; amount: string; chequeDate: string },
  userId?: number,
): Promise<Cheque> {
  const [orig]: any[] = await db.select().from(cheques).where(eq(cheques.id, bouncedId));
  if (!orig) throw new Error("Original cheque not found");
  if (orig.status !== "bounced") throw new Error("Only bounced cheques can be replaced.");

  const [replacement] = await db.insert(cheques).values({
    customerId: orig.customerId,
    supplierId: orig.supplierId,
    documentId: orig.documentId,
    type: orig.type,
    chequeNumber: data.chequeNumber,
    bankName: data.bankName,
    amount: data.amount,
    chequeDate: data.chequeDate,
    who: orig.who,
    status: "pending",
  }).returning();

  // Link the original to the replacement and mark recovery complete
  await db.update(cheques).set({
    replacementChequeId: replacement.id,
    recoveryStatus: "replacement_received",
    recoveryNotes: `Replaced by cheque #${data.chequeNumber}`,
  }).where(eq(cheques.id, bouncedId));

  await createNotification({
    targetRole: "admin", type: "cheque_recovery",
    title: "Replacement cheque received",
    message: `Bounced cheque ${orig.chequeNumber} replaced by new cheque #${data.chequeNumber} (QAR ${Number(data.amount || 0).toFixed(2)}).`,
    link: `/cheques/${replacement.id}`, entityType: "cheque", entityId: replacement.id, createdBy: userId,
  });
  return replacement;
}

// PDC action summary: counts of cheques needing attention.
export async function getPdcActionSummary(): Promise<{
  dueToday: number; overdue: number; depositedAwaitingClear: number;
  bouncedAwaitingRecovery: number; dueSoon: number;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const { pdcAlertDays } = await getBusinessRules();
  const horizon = new Date(); horizon.setDate(horizon.getDate() + pdcAlertDays);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const all = await db.select().from(cheques);
  return {
    dueToday: all.filter((c: any) => c.status === "pending" && c.chequeDate === today).length,
    overdue: all.filter((c: any) => c.status === "pending" && c.chequeDate < today).length,
    depositedAwaitingClear: all.filter((c: any) => c.status === "deposited").length,
    bouncedAwaitingRecovery: all.filter((c: any) => c.status === "bounced" && !["cash_received", "replacement_received", "written_off"].includes(c.recoveryStatus)).length,
    dueSoon: all.filter((c: any) => c.status === "pending" && c.chequeDate > today && c.chequeDate <= horizonStr).length,
  };
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
      const status = total > 0 && totalPaid >= total - 0.005 ? "paid" : totalPaid > 0.005 ? "partial" : "unpaid";
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
          "correction", `Return ${ret.voucherNumber} approval reversed`, ret.originalInvoiceId ?? undefined, userId);
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
  originalInvoiceId?: number | null;
  originalInvoiceNumber?: string;
  sourceInvoices?: { invoiceId: number; invoiceNumber: string }[];
  isManual?: boolean;
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
  const voucherNumber = await getNextDocNumber("RV");
  const total = data.items.reduce((s, i) => s + Number(i.amount || 0), 0);

  const sourceInvoices = data.sourceInvoices ?? [];
  const primaryInvoiceId = data.originalInvoiceId ?? (sourceInvoices.length > 0 ? sourceInvoices[0].invoiceId : null);
  const primaryInvoiceNumber = data.originalInvoiceNumber ?? (sourceInvoices.length > 0 ? sourceInvoices[0].invoiceNumber : undefined);

  const [ret] = await db.insert(returnsTable).values({
    voucherNumber,
    originalInvoiceId: primaryInvoiceId ?? undefined,
    originalInvoiceNumber: primaryInvoiceNumber,
    sourceInvoices: sourceInvoices.length > 0 ? sourceInvoices : undefined,
    isManual: data.isManual ?? false,
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

  const invoiceLabel = primaryInvoiceNumber || (data.isManual ? "manual return" : "invoice");
  await createNotification({
    targetRole: "admin",
    type: "return_approval",
    title: "Return awaiting approval",
    message: `${voucherNumber} vs ${invoiceLabel}${sourceInvoices.length > 1 ? ` (+${sourceInvoices.length - 1} more)` : ""} — QAR ${total.toFixed(2)}${data.reason ? ` (${data.reason})` : ""}`,
    link: "/approvals",
    entityType: "return",
    entityId: ret.id,
    createdBy: data.submittedBy,
  });
  await createNotification({
    targetRole: "manager",
    type: "return_approval",
    title: "Return awaiting approval",
    message: `${voucherNumber} vs ${invoiceLabel}${sourceInvoices.length > 1 ? ` (+${sourceInvoices.length - 1} more)` : ""} — QAR ${total.toFixed(2)}`,
    link: "/approvals",
    entityType: "return",
    entityId: ret.id,
    createdBy: data.submittedBy,
  });

  return ret;
}

/** Credit-note total for an approved return.
 *  The dashboard deducts CN totals from revenue, so this must be the credit the
 *  customer ACTUALLY received. An explicit 0 (a damage claim where no item was
 *  resaleable) stays 0 - falling back to the goods value would deduct revenue the
 *  business legitimately kept. Only a NULL/absent refundAmount (legacy rows written
 *  before the field existed) falls back to the goods value. */
export function creditNoteTotal(refundAmount: any, goodsValue: number): number {
  if (refundAmount === null || refundAmount === undefined || refundAmount === "") return goodsValue;
  return Number(refundAmount) || 0;
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

  // 0. PRE-FLIGHT. Everything that can REFUSE this approval runs before any write,
  //    so a refusal leaves the return untouched and safely re-approvable.
  const refundAmt = Number(ret.refundAmount || 0);
  let appliedMethod = refundMethodOverride || ret.refundMethod || "Cash";
  // Coerce anything that isn't Bank Transfer down to Cash (Card/Cheque/PDC/unknown).
  if (refundAmt > 0 && appliedMethod !== "Bank Transfer") appliedMethod = "Cash";

  // A return carrying stock rows but no store cannot put the goods back. Refusing
  // beats paying the refund and silently losing the inventory.
  const stockRows = ((ret.items || []) as any[]).filter((it) => it.productId);
  if (!storeId && stockRows.length) {
    throw new Error(
      "Return " + ret.voucherNumber + " has stock to reverse but no store assigned. " +
      "Set the store on the return before approving.");
  }

  // A refund is money OUT - check funds BEFORE reversing stock. Checking after meant
  // a funds failure left the goods back on the shelf with the return still pending,
  // and approving again reversed the same stock a second time.
  if (refundAmt > 0) {
    await ensureFunds({
      instrument: methodInstrument(appliedMethod),
      amount: refundAmt,
      override: fundsOverride?.override, overrideReason: fundsOverride?.overrideReason, userId,
      context: `Return refund ${ret.voucherNumber}`,
    });
  }

  // 1. Reverse inventory back into the correct location.
  if (storeId) {
    for (const it of (ret.items || []) as any[]) {
      if (it.productId) {
        await adjustStock(
          Number(it.productId), Number(storeId), Number(it.qty || 0),
          "return", `Return ${ret.voucherNumber} approved${ret.originalInvoiceNumber ? ` vs ${ret.originalInvoiceNumber}` : ""}`,
          ret.originalInvoiceId ?? undefined, userId,
        );
      }
    }
  }

  // 2. RETURN refund rules: **Cash (preferred) or Online Transfer only — never PDC,
  //    never card.** Returns are small amounts; PDC on returns is not a real-business
  //    flow. (PDC stays only for invoice payments + supplier payments.)
  // Method, amount and funds were all settled in the pre-flight above.
  if (refundAmt > 0) {
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
      total: String(creditNoteTotal(ret.refundAmount, rvTotal)),
      notes: `Credit note for return ${ret.voucherNumber}${ret.originalInvoiceNumber ? ` vs ${ret.originalInvoiceNumber}` : (ret as any).isManual ? " (manual return)" : ""}. Refund ${appliedMethod}.`,
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
    // But it must not be SILENT: with no CN the dashboard never deducts this return,
    // which overstates revenue. Tell an admin so it can be reconciled by hand.
    console.error("approveReturn: CN document generation failed:", e);
    try {
      await createNotification({
        targetRole: "admin",
        type: "return_approval",
        title: "Credit note NOT created",
        message: `Return ${ret.voucherNumber} was approved but its credit note failed to generate. Revenue stays overstated until this is reconciled by hand.`,
        link: "/approvals",
        entityType: "return", entityId: ret.id, createdBy: userId,
      });
    } catch { /* a notification failure must not fail the approval either */ }
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
      link: ret.originalInvoiceId ? `/documents/${ret.originalInvoiceId}` : "/approvals",
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
      link: ret.originalInvoiceId ? `/documents/${ret.originalInvoiceId}` : "/approvals",
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
// both the DN and its parent invoice. Proof of receipt (receiver name/phone + an
// uploaded photo of the all-party-signed paper DN) is mandatory — no blind "delivered".
export async function markDeliveryNoteDelivered(
  dnId: number,
  userId?: number,
  proof?: { receiverName?: string; receiverPhone?: string; signedDnImage?: string },
): Promise<any> {
  const dn = await getDocument(dnId);
  if (!dn || dn.type !== "DN") throw new Error("Delivery note not found");
  if (dn.deliveryStatus === "delivered") return dn; // idempotent
  if (dn.deliveryStatus !== "authorized" && dn.deliveryStatus !== "in_transit")
    throw new Error("A manager must authorise this delivery before it can be marked delivered.");

  const receiverName = (proof?.receiverName || "").trim();
  const signedDnImage = proof?.signedDnImage || dn.signedDnUrl || "";
  if (!receiverName) throw new Error("Receiver name is required to confirm the delivery.");
  if (!signedDnImage) throw new Error("Upload the signed delivery note before confirming.");

  await updateDocument(dnId, {
    deliveryStatus: "delivered", status: "delivered",
    receiverName, receiverPhone: (proof?.receiverPhone || "").trim() || null,
    signedDnUrl: signedDnImage,
  } as any);
  if (dn.linkedDocId) await updateDocument(dn.linkedDocId, { deliveryStatus: "delivered" } as any);
  await logEdit({ documentId: dnId, userId, field: "deliveryStatus", oldValue: dn.deliveryStatus || "authorized", newValue: "delivered", reason: `Driver confirmed delivery — received by ${receiverName}` });
  // Notify the salesman who raised the invoice + admin.
  const inv = dn.linkedDocId ? await getDocument(dn.linkedDocId) : null;
  if (inv?.createdBy) {
    await createNotification({
      targetUserId: inv.createdBy, type: "delivery_done", title: "Delivery completed",
      message: `${inv.number} delivered to ${inv.customerName || "customer"} — received by ${receiverName}.`,
      link: `/documents/${inv.id}`, entityType: "document", entityId: inv.id, createdBy: userId,
    });
  }
  return getDocument(dnId);
}

// Warehouse manager signs off / releases the load (validates the physical DN paper at
// dispatch). Recorded against the DN with who + when.
export async function signWarehouseRelease(dnId: number, userId?: number): Promise<any> {
  const dn = await getDocument(dnId);
  if (!dn || dn.type !== "DN") throw new Error("Delivery note not found");
  if (dn.deliveryStatus === "delivered") throw new Error("This delivery is already completed.");
  await updateDocument(dnId, { warehouseSignedBy: userId ?? null, warehouseSignedAt: new Date() } as any);
  await logEdit({ documentId: dnId, userId, field: "warehouseSignedBy", oldValue: "", newValue: String(userId ?? ""), reason: "Warehouse manager signed / released the load" });
  return getDocument(dnId);
}

// Driver reports damage found in transit / on delivery. Flags the DN and alerts a
// manager to act (partial refund, replacement, supplier claim…).
export async function reportDeliveryDamage(
  dnId: number,
  userId?: number,
  data?: { notes?: string; photo?: string },
): Promise<any> {
  const dn = await getDocument(dnId);
  if (!dn || dn.type !== "DN") throw new Error("Delivery note not found");
  const notes = (data?.notes || "").trim();
  if (!notes) throw new Error("Describe the damage before submitting.");
  await updateDocument(dnId, {
    damageReported: true, damageNotes: notes, damagePhoto: data?.photo || null, damageReportedAt: new Date(),
  } as any);
  await logEdit({ documentId: dnId, userId, field: "damageReported", oldValue: "false", newValue: "true", reason: `Damage reported: ${notes.slice(0, 120)}` });
  await createNotification({
    targetRole: "manager", type: "delivery_damage", title: "⚠ Damage reported on delivery",
    message: `${dn.number} (${dn.customerName || "customer"}): ${notes.slice(0, 140)}`,
    link: `/documents/${dnId}`, entityType: "document", entityId: dnId, createdBy: userId,
  });
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

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL REQUESTS — generic override inbox
// A single queue for any decision a manager/admin must make: an over-limit sale
// (credit_limit), an invoice void, a discount/price change, or a free-form
// request (manual). On approval the held action in `payload` is carried out.
// Returns keep their own `returns` table but are merged into the same inbox
// on the client, so they are NOT duplicated here.
// ═══════════════════════════════════════════════════════════════════════════
export const APPROVAL_APPROVERS = ["admin", "manager"] as const;

export function approvalTypeLabel(type: string): string {
  switch (type) {
    case "credit_limit": return "Credit-limit override";
    case "discount": return "Discount / price change";
    case "void": return "Invoice void";
    case "manual": return "Approval request";
    default: return "Approval request";
  }
}

export async function createApprovalRequest(data: {
  type: string;
  requestedBy?: number;
  storeId?: number | null;
  title?: string;
  summary?: string;
  message?: string;
  amount?: number | null;
  entityType?: string | null;
  entityId?: number | null;
  payload?: any;
}): Promise<ApprovalRequest> {
  const requestNumber = await getNextDocNumber("AR");
  const requester = data.requestedBy ? await getUser(data.requestedBy) : null;
  const title = data.title || approvalTypeLabel(data.type);

  const [row] = await db.insert(approvalRequests).values({
    requestNumber,
    type: data.type,
    status: "pending",
    requestedBy: data.requestedBy ?? undefined,
    requestedByName: requester?.name ?? undefined,
    storeId: data.storeId ?? undefined,
    title,
    summary: data.summary ?? undefined,
    message: data.message ?? undefined,
    amount: data.amount != null ? String(data.amount) : undefined,
    entityType: data.entityType ?? undefined,
    entityId: data.entityId ?? undefined,
    payload: data.payload ?? undefined,
  }).returning();

  // Notify the approvers (admin + manager) — same pattern as returns.
  const notifyMsg = `${requestNumber} · ${title}${data.summary ? ` — ${data.summary}` : ""}${requester?.name ? ` (by ${requester.name})` : ""}`;
  for (const role of APPROVAL_APPROVERS) {
    await createNotification({
      targetRole: role,
      type: "approval_request",
      title: "Approval requested",
      message: notifyMsg,
      link: "/approvals",
      entityType: "approval_request",
      entityId: row.id,
      createdBy: data.requestedBy,
    });
  }
  return row;
}

export async function getApprovalRequests(opts: { role?: string; userId?: number; mine?: boolean }): Promise<ApprovalRequest[]> {
  // Approvers see everything; a requester sees only their own.
  const isApprover = !!opts.role && (APPROVAL_APPROVERS as readonly string[]).includes(opts.role);
  if (!isApprover || opts.mine) {
    if (!opts.userId) return [];
    return db.select().from(approvalRequests)
      .where(eq(approvalRequests.requestedBy, opts.userId))
      .orderBy(desc(approvalRequests.id));
  }
  return db.select().from(approvalRequests).orderBy(desc(approvalRequests.id));
}

export async function getApprovalRequest(id: number): Promise<ApprovalRequest | undefined> {
  const [row] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id));
  return row;
}

// Approve → carry out the held action, stamp the decider, notify the requester.
export async function approveApprovalRequest(id: number, deciderId?: number, note?: string): Promise<ApprovalRequest> {
  const reqRow = await getApprovalRequest(id);
  if (!reqRow) throw new Error("Approval request not found");
  if (reqRow.status === "approved") return reqRow;                              // idempotent
  if (reqRow.status !== "pending") throw new Error(`This request was already ${reqRow.status}.`);

  const decider = deciderId ? await getUser(deciderId) : null;
  let resultEntityId: number | null = reqRow.entityId ?? null;
  let resultNote = note;

  if (reqRow.type === "credit_limit") {
    // Replay the held invoice now, with the credit gate overridden and the
    // approving manager as the authorizer (also clears any bundled discount gate).
    const payload = (reqRow.payload || {}) as any;
    const doc = await createDocument({ ...payload, creditOverride: true, authorizedBy: deciderId } as any);
    resultEntityId = doc?.id ?? resultEntityId;
    resultNote = note || `Invoice ${doc?.number ?? ""} created on approval.`.trim();
  } else if (reqRow.type === "void") {
    if (!reqRow.entityId) throw new Error("This void request has no linked invoice.");
    const r = await voidDocument(reqRow.entityId, deciderId);
    if (!r.ok) throw new Error(r.message || "Void failed");
    resultNote = note || "Invoice voided on approval.";
  } else if (reqRow.type === "discount") {
    const payload = (reqRow.payload || {}) as any;
    if (payload && payload.items && !reqRow.entityId) {
      // Async discount: replay the held invoice with the approving manager as authorizer.
      const doc = await createDocument({ ...payload, authorizedBy: deciderId } as any);
      resultEntityId = doc?.id ?? resultEntityId;
      resultNote = note || `Invoice ${doc?.number ?? ""} created on approval.`.trim();
    } else if (reqRow.entityId) {
      await db.update(documents).set({ pricingApprovedBy: deciderId ?? null } as any).where(eq(documents.id, reqRow.entityId));
    }
  }
  // "manual" → decision recorded only (informational authorization).

  const [row] = await db.update(approvalRequests).set({
    status: "approved",
    decidedBy: deciderId ?? undefined,
    decidedByName: decider?.name ?? undefined,
    decidedAt: new Date(),
    decisionNote: resultNote ?? undefined,
    entityId: resultEntityId ?? undefined,
  }).where(eq(approvalRequests.id, id)).returning();

  if (reqRow.requestedBy) {
    const notifLink = ((reqRow.type === "credit_limit" || reqRow.type === "discount") && resultEntityId) ? `/documents/${resultEntityId}`
      : (reqRow.type === "void" && reqRow.entityId) ? `/documents/${reqRow.entityId}`
      : "/approvals";
    await createNotification({
      targetUserId: reqRow.requestedBy,
      type: "approval_approved",
      title: "Request approved",
      message: `${reqRow.requestNumber} · ${reqRow.title} — approved${decider?.name ? ` by ${decider.name}` : ""}.${resultNote ? ` ${resultNote}` : ""}`,
      link: notifLink,
      entityType: "approval_request",
      entityId: id,
      createdBy: deciderId,
    });
  }
  return row;
}

export async function rejectApprovalRequest(id: number, deciderId?: number, note?: string): Promise<ApprovalRequest> {
  const reqRow = await getApprovalRequest(id);
  if (!reqRow) throw new Error("Approval request not found");
  if (reqRow.status === "rejected") return reqRow;
  if (reqRow.status !== "pending") throw new Error(`This request was already ${reqRow.status}.`);
  const decider = deciderId ? await getUser(deciderId) : null;

  const [row] = await db.update(approvalRequests).set({
    status: "rejected",
    decidedBy: deciderId ?? undefined,
    decidedByName: decider?.name ?? undefined,
    decidedAt: new Date(),
    decisionNote: note ?? undefined,
  }).where(eq(approvalRequests.id, id)).returning();

  if (reqRow.requestedBy) {
    await createNotification({
      targetUserId: reqRow.requestedBy,
      type: "approval_rejected",
      title: "Request rejected",
      message: `${reqRow.requestNumber} · ${reqRow.title} — rejected${decider?.name ? ` by ${decider.name}` : ""}${note ? `: ${note}` : ""}.`,
      link: "/approvals",
      entityType: "approval_request",
      entityId: id,
      createdBy: deciderId,
    });
  }
  return row;
}

// A requester withdraws their own still-pending request.
export async function cancelApprovalRequest(id: number, userId?: number): Promise<ApprovalRequest> {
  const reqRow = await getApprovalRequest(id);
  if (!reqRow) throw new Error("Approval request not found");
  if (reqRow.status !== "pending") throw new Error("Only a pending request can be cancelled.");
  if (userId && reqRow.requestedBy && reqRow.requestedBy !== userId) {
    throw new Error("You can only cancel your own request.");
  }
  const [row] = await db.update(approvalRequests).set({
    status: "cancelled",
    decidedAt: new Date(),
  }).where(eq(approvalRequests.id, id)).returning();
  return row;
}

export async function completeApprovalRequest(id: number, userId?: number): Promise<ApprovalRequest> {
  const reqRow = await getApprovalRequest(id);
  if (!reqRow) throw new Error("Approval request not found");
  if (reqRow.status !== "approved") throw new Error("Only an approved request can be marked done.");
  if (userId && reqRow.requestedBy && reqRow.requestedBy !== userId) {
    throw new Error("Only the requester can mark their request as done.");
  }
  const [row] = await db.update(approvalRequests).set({ status: "completed" } as any)
    .where(eq(approvalRequests.id, id)).returning();
  return row;
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
  data: Partial<{ status: string; receivedAt: string; notes: string;
    supplierInvoiceNumber: string; supplierInvoiceUrl: string; supplierInvoiceAmount: string }>
): Promise<SupplierOrder> {
  const patch: any = {};
  if (data.status !== undefined) patch.status = data.status;
  if (data.receivedAt !== undefined) patch.receivedAt = new Date(data.receivedAt);
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.supplierInvoiceNumber !== undefined) patch.supplierInvoiceNumber = data.supplierInvoiceNumber;
  if (data.supplierInvoiceUrl !== undefined) patch.supplierInvoiceUrl = data.supplierInvoiceUrl;
  if (data.supplierInvoiceAmount !== undefined) patch.supplierInvoiceAmount = data.supplierInvoiceAmount;
  const [row] = await db
    .update(supplierOrders)
    .set(patch)
    .where(eq(supplierOrders.id, id))
    .returning();
  return row;
}

// Partial receive: staff selects which items/qty arrived. Adds only the received
// delta to inventory, tracks receivedQty per line, and flips status to
// partial / received. Full receipt starts the payment-terms clock.
/** ONE-STEP GOODS RECEIPT — for a delivery that turns up without a purchase order.
 *
 *  The normal path is create PO -> send -> receive. That is three steps, and this
 *  business takes deliveries of its fast movers every single morning. A three-step
 *  process for a daily event does not get followed, and the moment it is skipped the
 *  counted stock starts drifting.
 *
 *  This does the whole thing in one call, but it does NOT fork the logic: it creates a
 *  real supplier order already marked "sent" and then receives against it through the
 *  same receiveSupplierOrderItems() everything else uses. So payment terms, payables,
 *  the supplier ledger and the stock audit all behave identically to a formal PO.
 *
 *  It can also create products it has never seen, so an unfamiliar item on a delivery
 *  note seeds the catalogue instead of blocking the receipt.
 *
 *  updateCost (default true) refreshes products.costPrice to what you actually just
 *  paid. That is only safe because document_items.cost_at_sale pins the cost of every
 *  past sale — see resolveItemCost. Without that pinning this would rewrite history. */
export async function quickGoodsReceipt(data: {
  supplierId: number;
  storeId: number;
  items: Array<{
    productId?: number; name: string; sku?: string; qty: number;
    unit?: string; cost?: number; salePrice?: number; category?: string;
  }>;
  supplierInvoiceNumber?: string;
  supplierInvoiceAmount?: number;
  paymentTermsDays?: number;
  notes?: string;
  updateCost?: boolean;
  userId?: number;
}) {
  if (!data.supplierId) throw new Error("A supplier is required to receive goods.");
  if (!data.storeId) throw new Error("A destination location is required — stock has to land somewhere.");
  const rawItems = (data.items || []).filter((i) => i && i.name && Number(i.qty) > 0);
  if (!rawItems.length) throw new Error("Add at least one line with a quantity greater than zero.");
  for (const i of rawItems) {
    if (i.cost !== undefined && i.cost !== null && Number(i.cost) < 0) {
      throw new Error(`Cost cannot be negative (${i.name}).`);
    }
  }

  const catalogue = await getProducts();
  const bySku = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const p of catalogue as any[]) {
    if (p.sku) bySku.set(String(p.sku).trim().toUpperCase(), p);
    if (p.name) byName.set(String(p.name).trim().toUpperCase(), p);
  }

  const productsCreated: Array<{ id: number; name: string }> = [];
  const costsUpdated: Array<{ id: number; name: string; from: number; to: number }> = [];
  const lines: Array<{ productId: number; name: string; qty: number; unit: string; cost: number }> = [];

  for (const it of rawItems) {
    const nameKey = String(it.name).trim().toUpperCase();
    const skuKey = it.sku ? String(it.sku).trim().toUpperCase() : "";
    let product: any = null;

    if (it.productId) {
      product = (catalogue as any[]).find((p) => p.id === Number(it.productId)) || null;
    }
    if (!product && skuKey) product = bySku.get(skuKey) || null;
    if (!product) product = byName.get(nameKey) || null;

    if (!product) {
      product = await createProduct({
        name: it.name, sku: it.sku || null, unit: it.unit || "PCS",
        category: it.category || null,
        costPrice: String(Number(it.cost) || 0),
        salePrice: String(Number(it.salePrice) || 0),
        supplierId: data.supplierId,
        locationStoreId: data.storeId,
      } as any);
      productsCreated.push({ id: product.id, name: product.name });
      if (product.sku) bySku.set(String(product.sku).toUpperCase(), product);
      byName.set(String(product.name).toUpperCase(), product);
    }

    lines.push({
      productId: product.id,
      name: product.name,
      qty: Number(it.qty),
      unit: it.unit || product.unit || "PCS",
      cost: it.cost !== undefined && it.cost !== null ? Number(it.cost) : Number(product.costPrice || 0),
    });

    // Refresh the standing cost when this delivery came in at a different price.
    if (data.updateCost !== false && it.cost !== undefined && it.cost !== null) {
      const from = Number(product.costPrice || 0);
      const to = Number(it.cost);
      if (Number.isFinite(to) && Math.abs(to - from) > 0.005) {
        await updateProduct(product.id, { costPrice: String(to) } as any);
        costsUpdated.push({ id: product.id, name: product.name, from, to });
      }
    }
  }

  const poNumber = await getNextDocNumber("PO");
  const order = await createSupplierOrder({
    supplierId: data.supplierId,
    poNumber,
    storeId: data.storeId,
    status: "sent",            // skip draft — the goods are physically here
    paymentTermsDays: data.paymentTermsDays ?? 0,
    notes: data.notes || `Goods received directly (no prior PO).`,
    items: lines as any,
  });

  // Receive every line in full, through the SAME path a formal PO uses.
  const received = await receiveSupplierOrderItems(
    order.id, data.storeId,
    lines.map((l, index) => ({ index, productId: l.productId, qty: l.qty })),
    data.userId,
  );

  if (data.supplierInvoiceNumber || data.supplierInvoiceAmount !== undefined) {
    await db.update(supplierOrders).set({
      supplierInvoiceNumber: data.supplierInvoiceNumber ?? null,
      supplierInvoiceAmount: data.supplierInvoiceAmount !== undefined
        ? String(data.supplierInvoiceAmount) : null,
    } as any).where(eq(supplierOrders.id, order.id));
  }

  const totalValue = lines.reduce((s2, l) => s2 + l.qty * l.cost, 0);
  return {
    order: received,
    poNumber,
    productsCreated,
    costsUpdated,
    received: lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, cost: l.cost })),
    totalValue: Number(totalValue.toFixed(2)),
  };
}

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
  refundMode?: "credit_note" | "cash_refund";
  refundMethod?: string;
  items: Array<{ productId?: number; name?: string; qty: number; unit?: string; amount?: number }>;
  notes?: string; refundAmount?: number; createdBy?: number;
}): Promise<SupplierReturn> {
  const total = (data.items || []).reduce((s, i) => s + Number(i.amount || 0), 0);
  const [row] = await db.insert(supplierReturns).values({
    poId: data.poId, supplierId: data.supplierId, storeId: data.storeId,
    returnType: data.returnType, refundMode: data.refundMode || "credit_note",
    status: "pending_confirmation",
    items: data.items || [], total: String(total),
    refundAmount: data.refundAmount != null ? String(data.refundAmount) : String(total),
    refundMethod: data.refundMethod || null,
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
// credit_note mode: confirmed = done (amount deducts from balance, no cash moves).
// cash_refund mode: confirmed → refund_received logs actual cash-in entry.
export async function updateSupplierReturnStatus(
  id: number, status: string, userId?: number, refundMethod?: string,
): Promise<SupplierReturn> {
  const [ret] = await db.select().from(supplierReturns).where(eq(supplierReturns.id, id));
  if (!ret) throw new Error("Supplier return not found");
  const ALLOWED = ["pending_confirmation", "confirmed", "refund_received"];
  if (!ALLOWED.includes(status)) throw new Error(`Invalid supplier-return status: ${status}`);

  const patch: any = { status };
  if (refundMethod) patch.refundMethod = refundMethod;

  if (status === "refund_received" && !ret.refundReceivedAt) {
    patch.refundReceivedAt = new Date();
    const method = refundMethod || ret.refundMethod || "cash";
    await db.insert(cashflow).values({
      direction: "in", category: "Supplier Refund",
      amount: String(Number(ret.refundAmount || ret.total || 0)),
      refType: "supplier_return", refId: ret.id, storeId: ret.storeId ?? undefined,
      notes: `Supplier refund (${method}) for return #${ret.id}${ret.poId ? ` (PO ${ret.poId})` : ""}`,
      date: new Date().toISOString().slice(0, 10), createdBy: userId,
    });
  }
  const [row] = await db.update(supplierReturns).set(patch).where(eq(supplierReturns.id, id)).returning();
  return row;
}

// ─── Supplier Payments (outgoing to suppliers) ──────────────────────────────
export async function createSupplierPayment(data: {
  supplierId: number; poId?: number; amount: number; method: string; date: string;
  reference?: string; supplierInvoiceNumber?: string; supplierInvoiceUrl?: string;
  receiptUrl?: string; chequeId?: number; bankName?: string; notes?: string;
  createdBy?: number; override?: boolean; overrideReason?: string;
}): Promise<SupplierPayment> {
  const instrument = data.method === "Bank Transfer" ? "bank" : "cash";
  if (data.method !== "PDC") {
    await ensureFunds({
      instrument, amount: Number(data.amount),
      override: data.override, overrideReason: data.overrideReason, userId: data.createdBy,
      context: `Supplier payment — supplier #${data.supplierId}`,
    });
  }
  const [row] = await db.insert(supplierPayments).values({
    supplierId: data.supplierId, poId: data.poId ?? null,
    amount: String(data.amount), method: data.method, date: data.date,
    reference: data.reference ?? null, supplierInvoiceNumber: data.supplierInvoiceNumber ?? null,
    supplierInvoiceUrl: data.supplierInvoiceUrl ?? null, receiptUrl: data.receiptUrl ?? null,
    chequeId: data.chequeId ?? null, bankName: data.bankName ?? null,
    notes: data.notes ?? null, createdBy: data.createdBy ?? null,
  }).returning();
  if (data.method !== "PDC") {
    await logCashflow({
      direction: "out", category: "Supplier Payment",
      amount: data.amount, refType: "supplier_payment", refId: row.id,
      notes: `Payment to supplier #${data.supplierId}${data.reference ? ` ref:${data.reference}` : ""} (${data.method})`,
      createdBy: data.createdBy,
    });
  }
  return row;
}

export async function getSupplierPayments(filter?: { supplierId?: number }): Promise<SupplierPayment[]> {
  const conds: any[] = [];
  if (filter?.supplierId) conds.push(eq(supplierPayments.supplierId, filter.supplierId));
  const q = conds.length
    ? db.select().from(supplierPayments).where(and(...conds))
    : db.select().from(supplierPayments);
  return q.orderBy(desc(supplierPayments.id));
}

export async function getSupplierLedger(supplierId: number) {
  const orders = await db.select().from(supplierOrders)
    .where(and(eq(supplierOrders.supplierId, supplierId), ne(supplierOrders.status, "draft"), ne(supplierOrders.status, "cancelled")))
    .orderBy(desc(supplierOrders.id));
  const pmts = await db.select().from(supplierPayments)
    .where(eq(supplierPayments.supplierId, supplierId))
    .orderBy(desc(supplierPayments.id));
  const rets = await db.select().from(supplierReturns)
    .where(eq(supplierReturns.supplierId, supplierId))
    .orderBy(desc(supplierReturns.id));
  const totalOrdered = orders.reduce((s, o) => {
    const items = Array.isArray(o.items) ? (o.items as any[]) : [];
    return s + items.reduce((t: number, it: any) => t + (Number(it.receivedQty || 0) * Number(it.cost || it.price || 0)), 0);
  }, 0);
  const totalReturned = rets.filter(r => r.status !== "pending_confirmation")
    .reduce((s, r) => s + Number(r.refundAmount || r.total || 0), 0);
  const totalPaid = pmts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = totalOrdered - totalReturned - totalPaid;
  return {
    orders, payments: pmts, returns: rets,
    summary: {
      totalOrdered: Number(totalOrdered.toFixed(2)),
      totalReturned: Number(totalReturned.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      balance: Number(balance.toFixed(2)),
    },
  };
}

// ─── Reports ─────────────────────────────────────────────────────────────────
// ─── Owner Loans / Cash Injections ───────────────────────────────────────────
// ── Owner-loan movement taxonomy ──────────────────────────────────────────────
// The `ownerLoans` table is a small two-sided financing ledger, keyed on `type`:
//   money IN  : injection (capital we receive), collection (a lent-out returns)
//   money OUT : repayment (we settle an injection), lend_out (we lend, expect it
//               back), profit_withdrawal (owner draws profit — not coming back)
// `refInjectionId` is the generic "parent" link: repayment→injection, collection
// →lend_out. Reusing the column avoids a migration; getOwnerLoans keys the pair
// off the child's type. Profit withdrawals are terminal (no parent, never a loan).
export const LOAN_OUT_TYPES = new Set(["repayment", "lend_out", "profit_withdrawal"]);
export const LOAN_TYPES = new Set(["injection", "repayment", "lend_out", "collection", "profit_withdrawal"]);
// A settlement (child) is capped at its parent's remaining balance.
const LOAN_SETTLEMENT: Record<string, { parent: string; missing: string; noun: string }> = {
  repayment:  { parent: "injection", missing: "The loan being repaid was not found.",            noun: "repayment" },
  collection: { parent: "lend_out",  missing: "The money-lent-out record being collected was not found.", noun: "collection" },
};
const LOAN_CATEGORY: Record<string, string> = {
  injection: "Owner Contribution", repayment: "Loan Repayment", lend_out: "Money Lent Out",
  collection: "Loan Collected", profit_withdrawal: "Profit Withdrawal",
};
const LOAN_VERB: Record<string, string> = {
  injection: "Cash injection", repayment: "Loan repayment", lend_out: "Money lent out",
  collection: "Loan collected", profit_withdrawal: "Profit withdrawal",
};

export async function createOwnerLoan(data: {
  type: string; amount: number; source?: string; method?: string; date: string; note?: string; proofUrl?: string;
  refInjectionId?: number; createdBy?: number;
  override?: boolean; overrideReason?: string;
}) {
  const method = data.method === "Bank Transfer" ? "Bank Transfer" : "Cash";
  const type = data.type;

  // LOAN_TYPES existed but was never enforced: an unknown type slipped past both
  // guards below, was inserted, and landed in the default cashflow category as
  // money IN - miscategorising money out as money in.
  if (!LOAN_TYPES.has(type)) {
    throw new Error(
      "Unknown cash/loan type \"" + type + "\". Expected one of: " + Array.from(LOAN_TYPES).join(", ") + ".");
  }

  // ── Linked settlements (repayment→injection, collection→lend_out) MUST name
  //    their parent and can never exceed its remaining balance. This is what
  //    keeps outstanding/receivable honest: no orphan money-out that reconciles
  //    to nothing, no over-payment that silently vanishes.
  const settle = LOAN_SETTLEMENT[type];
  if (settle) {
    if (!data.refInjectionId) {
      throw new Error(`A ${settle.noun} must be linked to the specific ${settle.parent === "injection" ? "loan" : "lent-out record"} it settles.`);
    }
    const [parent] = await db.select().from(ownerLoans).where(eq(ownerLoans.id, data.refInjectionId));
    if (!parent || parent.type !== settle.parent) throw new Error(settle.missing);
    const priors = await db.select().from(ownerLoans)
      .where(and(eq(ownerLoans.type, type), eq(ownerLoans.refInjectionId, data.refInjectionId)));
    const already = priors.reduce((s, r) => s + Number(r.amount || 0), 0);
    const remaining = Number(parent.amount || 0) - already;
    if (Number(data.amount) > remaining + 0.005) {
      throw new Error(`This ${settle.noun} exceeds the remaining balance (remaining QAR ${remaining.toFixed(2)}).`);
    }
  }

  // ── Every money-OUT movement (repay / lend / profit draw) checks funds. ──
  if (LOAN_OUT_TYPES.has(type)) {
    await ensureFunds({
      instrument: methodInstrument(method),
      amount: Number(data.amount),
      override: data.override, overrideReason: data.overrideReason, userId: data.createdBy,
      context: `${LOAN_VERB[type] || "Cash out"} — ${data.source || "Owner"}`,
    });
  }

  const [row] = await db.insert(ownerLoans).values({
    type, amount: String(data.amount), source: data.source ?? null,
    method, date: data.date, note: data.note ?? null, proofUrl: data.proofUrl ?? null,
    refInjectionId: data.refInjectionId ?? null,
    createdBy: data.createdBy ?? null,
  }).returning();
  await logCashflow({
    direction: LOAN_OUT_TYPES.has(type) ? "out" : "in",
    category: LOAN_CATEGORY[type] || "Owner Contribution",
    amount: data.amount, refType: "owner_loan", refId: row.id,
    notes: `${LOAN_VERB[type] || "Cash movement"} — ${data.source || "Owner"} (${method})`,
    createdBy: data.createdBy,
  });
  return row;
}

export async function updateOwnerLoan(id: number, data: {
  amount?: number; source?: string; method?: string; date?: string; note?: string; proofUrl?: string;
  updatedBy?: number;
}) {
  const [existing] = await db.select().from(ownerLoans).where(eq(ownerLoans.id, id));
  if (!existing) throw new Error("Record not found");
  const method = data.method === "Bank Transfer" ? "Bank Transfer" : (data.method === "Cash" ? "Cash" : existing.method);
  const newAmount = data.amount ?? Number(existing.amount);
  // Editing a settlement (repayment or collection) can't push it past its
  // parent's remaining balance (parent amount − every OTHER child of that parent).
  if (LOAN_SETTLEMENT[existing.type] && existing.refInjectionId && data.amount != null) {
    const [parent] = await db.select().from(ownerLoans).where(eq(ownerLoans.id, existing.refInjectionId));
    if (parent) {
      const linked = await db.select().from(ownerLoans)
        .where(and(eq(ownerLoans.type, existing.type), eq(ownerLoans.refInjectionId, existing.refInjectionId)));
      const otherSum = linked.filter((r) => r.id !== id).reduce((s, r) => s + Number(r.amount || 0), 0);
      const remaining = Number(parent.amount || 0) - otherSum;
      if (newAmount > remaining + 0.005) {
        throw new Error(`This ${LOAN_SETTLEMENT[existing.type].noun} exceeds the remaining balance (max QAR ${remaining.toFixed(2)}).`);
      }
    }
  }
  const [row] = await db.update(ownerLoans).set({
    amount: String(newAmount),
    source: data.source ?? existing.source,
    method,
    date: data.date ?? existing.date,
    note: data.note ?? existing.note,
    proofUrl: data.proofUrl !== undefined ? (data.proofUrl || null) : existing.proofUrl,
  }).where(eq(ownerLoans.id, id)).returning();
  // Sync the linked cashflow entry — amount, notes (method drives the hand/bank
  // split in getCashPosition), and date must all stay in lockstep.
  const newSource = data.source ?? existing.source;
  const newDate = data.date ?? existing.date;
  const cfPatch: Record<string, any> = {};
  if (newAmount !== Number(existing.amount)) cfPatch.amount = String(newAmount);
  if (method !== existing.method || newSource !== existing.source) {
    cfPatch.notes = `${LOAN_VERB[existing.type] || "Cash movement"} — ${newSource || "Owner"} (${method})`;
  }
  if (newDate !== existing.date) cfPatch.date = newDate;
  if (Object.keys(cfPatch).length) {
    await db.update(cashflow).set(cfPatch)
      .where(and(eq(cashflow.refType, "owner_loan"), eq(cashflow.refId, id)));
  }
  return row;
}

export async function getOwnerLoans() {
  const rows = await db.select().from(ownerLoans).orderBy(desc(ownerLoans.id));
  const r2 = (n: number) => Number((n || 0).toFixed(2));

  // Sum each child (settlement) against its parent id, keyed by child type.
  // repayment→injection, collection→lend_out. This per-parent total is the
  // single source of truth for remaining balances and the whole summary.
  const settledByParent: Record<string, Record<number, number>> = { repayment: {}, collection: {} };
  for (const r of rows) {
    if ((r.type === "repayment" || r.type === "collection") && r.refInjectionId) {
      const bucket = settledByParent[r.type];
      bucket[r.refInjectionId] = (bucket[r.refInjectionId] || 0) + Number(r.amount || 0);
    }
  }

  // Enrich each parent (injection / lend_out) with settled + remaining. Capping
  // at the parent size means a stray over-settlement can't drive remaining < 0.
  const enriched = rows.map((r) => {
    const childType = r.type === "injection" ? "repayment" : r.type === "lend_out" ? "collection" : null;
    if (!childType) return r;
    const settledRaw = settledByParent[childType][r.id] || 0;
    const settled = Math.min(settledRaw, Number(r.amount || 0));
    const remaining = Math.max(0, Number(r.amount || 0) - settled);
    // `repaidAmount` kept for backward-compat (frontend + injections); `settledAmount`
    // is the generic name that also covers collections on lent-out money.
    return { ...r, repaidAmount: r2(settled), settledAmount: r2(settled), remainingAmount: r2(remaining) };
  });

  const injections = enriched.filter((r) => r.type === "injection") as any[];
  const lendOuts   = enriched.filter((r) => r.type === "lend_out") as any[];

  // We owe (borrowed capital): outstanding = Σ each loan's real remaining. Derive
  // repaid from injected − outstanding so the tiles always reconcile and the
  // headline can never contradict a still-showing REPAY row.
  const injected    = injections.reduce((s, r) => s + Number(r.amount || 0), 0);
  const outstanding = injections.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);
  const repaid      = injected - outstanding;

  // Owed to us (money we lent out): receivable = Σ each lent-out's remaining.
  const lentOut    = lendOuts.reduce((s, r) => s + Number(r.amount || 0), 0);
  const receivable = lendOuts.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);
  const collected  = lentOut - receivable;

  // Profit drawn by the owner — a terminal cash-out. Tracked here so the Profit
  // tab can show "kept in business"; it never touches earned-profit maths.
  const profitTaken = rows.filter((r) => r.type === "profit_withdrawal").reduce((s, r) => s + Number(r.amount || 0), 0);

  // Legacy / imported junk: settlements not linked to a parent, or beyond its
  // balance. They moved real cash but settle nothing, so they're excluded from
  // repaid/collected above — surfaced here to reconcile, not silently hidden.
  const totalRepayments  = rows.filter((r) => r.type === "repayment").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalCollections = rows.filter((r) => r.type === "collection").reduce((s, r) => s + Number(r.amount || 0), 0);
  const unlinkedRepaid    = Math.max(0, totalRepayments - repaid);
  const unlinkedCollected = Math.max(0, totalCollections - collected);

  return {
    rows: enriched,
    summary: {
      injected: r2(injected), repaid: r2(repaid), outstanding: r2(outstanding),
      lentOut: r2(lentOut), collected: r2(collected), receivable: r2(receivable),
      profitTaken: r2(profitTaken),
      unlinkedRepaid: r2(unlinkedRepaid), unlinkedCollected: r2(unlinkedCollected),
    },
  };
}

export async function getDailySalesSummary(startDate: string, endDate: string, storeId?: number) {
  const r2 = (n: number) => Number((n || 0).toFixed(2));
  const conditions: any[] = [
    eq(documents.type, "INV"),
    gte(documents.date, startDate),
    lte(documents.date, endDate),
    ne(documents.status, "void"),
  ];
  if (storeId) conditions.push(eq(documents.storeId, storeId));

  const docs = await db.select().from(documents).where(and(...conditions));
  const ids = docs.map((d: any) => d.id);

  // ── Payments (cash vs credit split) ──
  const payRows = await db.select({
    documentId: payments.documentId, amount: payments.amount,
    method: payments.method, isRefund: payments.isRefund,
  }).from(payments).where(ids.length ? inArray(payments.documentId, ids) : sql`false`);
  const paidByDoc: Record<number, number> = {};
  let cashCollected = 0;
  for (const p of payRows as any[]) {
    const amt = parseFloat(p.amount || "0") * (p.isRefund ? -1 : 1);
    paidByDoc[p.documentId] = (paidByDoc[p.documentId] || 0) + amt;
    if (!p.isRefund && p.method === "Cash") cashCollected += parseFloat(p.amount || "0");
  }

  // ── Items: profit, COGS, product agg, category agg — IDENTICAL formula to business-summary ──
  const profitByDoc: Record<number, number> = {};
  const cogsByDoc: Record<number, number> = {};
  const productAgg: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
  const categoryAgg: Record<string, number> = {};
  if (ids.length) {
    const items = await db.select({
      documentId: documentItems.documentId, description: documentItems.description,
      qty: documentItems.qty, amount: documentItems.amount,
      cost: products.costPrice, costAtSale: documentItems.costAtSale, category: products.category,
    }).from(documentItems)
      .leftJoin(products, eq(documentItems.productId, products.id))
      .where(inArray(documentItems.documentId, ids));

    for (const it of items as any[]) {
      const itemCost = resolveItemCost(it.costAtSale, it.cost) * parseFloat(it.qty || "0");
      const itemRev = parseFloat(it.amount || "0");
      const itemProfit = itemRev - itemCost;
      cogsByDoc[it.documentId] = (cogsByDoc[it.documentId] || 0) + itemCost;
      profitByDoc[it.documentId] = (profitByDoc[it.documentId] || 0) + itemProfit;
      const key = it.description || "Unknown";
      const pa = productAgg[key] || { name: key, qty: 0, revenue: 0, profit: 0 };
      pa.qty += Number(it.qty || 0); pa.revenue += itemRev; pa.profit += itemProfit;
      productAgg[key] = pa;
      const cat = it.category || "Other";
      categoryAgg[cat] = (categoryAgg[cat] || 0) + itemRev;
    }
  }

  // ── Per-invoice detail + aggregation ──
  let totalRevenue = 0, totalCogs = 0, grossProfit = 0, realProfit = 0;
  const customerAgg: Record<string, { name: string; customerId: number | null; total: number; invoiceCount: number }> = {};
  const dailyMap: Record<string, { revenue: number; invoiceCount: number; cogs: number; profit: number }> = {};

  const invoices = docs.map((d: any) => {
    const total = parseFloat(d.total || "0");
    const cogs = cogsByDoc[d.id] || 0;
    const profit = profitByDoc[d.id] || 0;
    const paid = paidByDoc[d.id] || 0;
    totalRevenue += total; totalCogs += cogs; grossProfit += profit;
    if (d.status === "paid") realProfit += profit;

    const date = d.date;
    if (!dailyMap[date]) dailyMap[date] = { revenue: 0, invoiceCount: 0, cogs: 0, profit: 0 };
    dailyMap[date].revenue += total; dailyMap[date].invoiceCount += 1;
    dailyMap[date].cogs += cogs; dailyMap[date].profit += profit;

    const custKey = d.customerName || "Walk-in";
    const ca = customerAgg[custKey] || { name: custKey, customerId: d.customerId, total: 0, invoiceCount: 0 };
    ca.total += total; ca.invoiceCount += 1;
    customerAgg[custKey] = ca;

    return {
      id: d.id, number: d.number, date, status: d.status,
      customerName: d.customerName || "Walk-in", customerId: d.customerId,
      total: r2(total), paid: r2(paid), cogs: r2(cogs), profit: r2(profit),
    };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);

  const creditSales = totalRevenue - cashCollected;
  const marginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const rows = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date, revenue: r2(v.revenue), invoiceCount: v.invoiceCount,
      cogs: r2(v.cogs), profit: r2(v.profit),
    }));

  // ── Returns ──
  const retConds: any[] = [eq(returnsTable.status, "approved")];
  if (startDate) retConds.push(gte(returnsTable.date, startDate));
  if (endDate) retConds.push(lte(returnsTable.date, endDate));
  if (storeId) retConds.push(eq(returnsTable.storeId, storeId));
  const retRows = await db.select().from(returnsTable).where(and(...retConds));
  const returnsTotal = retRows.reduce((s, r: any) => s + parseFloat(r.total || "0"), 0);

  // ── Top products / customers / categories ──
  const topProducts = Object.values(productAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    .map(p => ({ name: p.name, qty: r2(p.qty), revenue: r2(p.revenue), profit: r2(p.profit) }));
  const topCustomers = Object.values(customerAgg).sort((a, b) => b.total - a.total).slice(0, 10)
    .map(c => ({ name: c.name, customerId: c.customerId, total: r2(c.total), invoiceCount: c.invoiceCount }));
  const salesByCategory = Object.entries(categoryAgg)
    .map(([category, total]) => ({ category, total: r2(total as number) }))
    .sort((a, b) => b.total - a.total);

  return {
    rows, invoices,
    totalRevenue: r2(totalRevenue),
    invoiceCount: docs.length,
    avgInvoiceValue: r2(docs.length > 0 ? totalRevenue / docs.length : 0),
    cashSales: r2(cashCollected),
    creditSales: r2(creditSales),
    returnsTotal: r2(returnsTotal),
    cogs: r2(totalCogs),
    grossProfit: r2(grossProfit),
    realProfit: r2(realProfit),
    marginPct: r2(marginPct),
    topProducts, topCustomers, salesByCategory,
  };
}

export async function getUnpaidInvoices(opts?: { start?: string; end?: string }) {
  const conditions = [
    eq(documents.type, "INV"),
    ne(documents.status, "paid"),
    ne(documents.status, "returned"),
    ne(documents.status, "void"),
    ne(documents.transactionMode, "demo"),
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
// ══════════════════════════════════════════════════════════════════════════════
// CANONICAL GROSS-PROFIT MODEL — single source of truth for every profit surface
// (Finance → Profit, Reports → Business Summary, Dashboard → Profit Today).
//
//   Gross profit per invoice = Σ( item.amount − item.cost × item.qty )   (item-level)
//   • REAL profit     = summed over PAID invoices only  (money actually collected)
//   • EXPECTED profit = summed over ALL non-void invoices (paid + credit + PDC)
//                       — what we earn once every credit/PDC invoice is collected.
//                       (Historically called "imaginary" profit.)
//
// Any page that computes profit differently WILL drift from these numbers, so all
// of them read the aggregates produced here. `expectedProfit` and `imaginaryProfit`
// are the same value under two names (back-compat).
// ══════════════════════════════════════════════════════════════════════════════
export type ProfitAgg = {
  realProfit: number; expectedProfit: number; imaginaryProfit: number;
  realSales: number; totalSales: number;
  realCogs: number; totalCogs: number;
  realCount: number; invoiceCount: number;
  realMargin: number; expectedMargin: number;
};

/** Fold per-document profit/COGS + paid status into the canonical real/expected
    aggregates. `profitByDoc` should be the item-level sum; when a doc has no items
    it falls back to (total − cogs) so nothing is silently dropped. */
export function aggregateInvoiceProfit(
  docs: Array<{ id: number; total: any; status: any }>,
  profitByDoc: Record<number, number>,
  cogsByDoc: Record<number, number>,
): ProfitAgg {
  let realProfit = 0, expectedProfit = 0, realSales = 0, totalSales = 0, realCogs = 0, totalCogs = 0, realCount = 0;
  for (const d of docs) {
    const total = Number(d.total || 0);
    const cogs = cogsByDoc[d.id] || 0;
    const profit = profitByDoc[d.id] ?? (total - cogs);
    expectedProfit += profit; totalSales += total; totalCogs += cogs;
    if (d.status === "paid") { realProfit += profit; realSales += total; realCogs += cogs; realCount++; }
  }
  const r2 = (n: number) => Number((n || 0).toFixed(2));
  return {
    realProfit: r2(realProfit), expectedProfit: r2(expectedProfit), imaginaryProfit: r2(expectedProfit),
    realSales: r2(realSales), totalSales: r2(totalSales),
    realCogs: r2(realCogs), totalCogs: r2(totalCogs),
    realCount, invoiceCount: docs.length,
    realMargin: realSales > 0 ? r2((realProfit / realSales) * 100) : 0,
    expectedMargin: totalSales > 0 ? r2((expectedProfit / totalSales) * 100) : 0,
  };
}

export async function getProfitDetail(start: string, end: string, storeId?: number) {
  const conds: any[] = [eq(documents.type, "INV"), gte(documents.date, start), lte(documents.date, end), ne(documents.status, "void")];
  if (storeId) conds.push(eq(documents.storeId, storeId));
  // Exclude demo/test transactions so Finance matches Reports (business-summary does
  // the same). NULL/"real" both count; only "demo" is dropped (matches JS !== "demo").
  const docs = (await db.select().from(documents).where(and(...conds)))
    .filter(countsForProfit);
  const ids = docs.map((d) => d.id);
  const cogsByDoc: Record<number, number> = {};
  const itemsByDoc: Record<number, any[]> = {};
  if (ids.length) {
    const items = await db.select({
      documentId: documentItems.documentId, qty: documentItems.qty, price: documentItems.price,
      amount: documentItems.amount, description: documentItems.description, cost: products.costPrice, costAtSale: documentItems.costAtSale,
    }).from(documentItems).leftJoin(products, eq(documentItems.productId, products.id))
      .where(inArray(documentItems.documentId, ids));
    for (const it of items as any[]) {
      const unitCost = resolveItemCost(it.costAtSale, it.cost);
      const c = unitCost * Number(it.qty || 0);
      cogsByDoc[it.documentId] = (cogsByDoc[it.documentId] || 0) + c;
      (itemsByDoc[it.documentId] ||= []).push({
        description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0),
        cost: unitCost, amount: Number(it.amount || 0),
        profit: Number((Number(it.amount || 0) - c).toFixed(2)),
      });
    }
  }
  // Item-level profit: sum(item.amount - item.cost×qty) per doc — the canonical formula.
  const profitByDoc: Record<number, number> = {};
  for (const [docId, items] of Object.entries(itemsByDoc)) {
    profitByDoc[Number(docId)] = items.reduce((s: number, it: any) => s + it.profit, 0);
  }
  const invoices = docs.map((d: any) => {
    const total = Number(d.total || 0), cogs = cogsByDoc[d.id] || 0;
    const profit = profitByDoc[d.id] ?? (total - cogs);
    return {
      id: d.id, number: d.number, date: d.date, status: d.status, customerName: d.customerName,
      total, cogs: Number(cogs.toFixed(2)), profit: Number(profit.toFixed(2)), items: itemsByDoc[d.id] || [],
    };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  const agg = aggregateInvoiceProfit(docs as any[], profitByDoc, cogsByDoc);
  return { period: { start, end }, invoices, ...agg };
}

export async function getProfitSummary() {
  const docs = (await db.select({ id: documents.id, total: documents.total, status: documents.status, transactionMode: documents.transactionMode })
    .from(documents).where(and(eq(documents.type, "INV"), ne(documents.status, "void"))))
    .filter(countsForProfit); // match business-summary + profit-detail
  const ids = docs.map((d) => d.id);
  const cogsByDoc: Record<number, number> = {};
  const profitByDoc: Record<number, number> = {};
  if (ids.length) {
    const items = await db.select({
      documentId: documentItems.documentId, qty: documentItems.qty,
      amount: documentItems.amount, cost: products.costPrice, costAtSale: documentItems.costAtSale,
    }).from(documentItems).leftJoin(products, eq(documentItems.productId, products.id))
      .where(inArray(documentItems.documentId, ids));
    for (const it of items as any[]) {
      const itemCost = resolveItemCost(it.costAtSale, it.cost) * Number(it.qty || 0);
      cogsByDoc[it.documentId] = (cogsByDoc[it.documentId] || 0) + itemCost;
      profitByDoc[it.documentId] = (profitByDoc[it.documentId] || 0) + (Number(it.amount || 0) - itemCost);
    }
  }
  const agg = aggregateInvoiceProfit(docs as any[], profitByDoc, cogsByDoc);
  // Back-compat aliases (older callers): totalProfit == expected, totalRevenue == totalSales.
  return { ...agg, totalProfit: agg.expectedProfit, totalRevenue: agg.totalSales };
}

// ─── Location overview (per store/warehouse workflow over a date range) ──────
// One row per location with the full picture: revenue, cash actually collected,
// invoices rung, paid-vs-credit split, expenses, returns, COGS and profit — plus a
// day-by-day revenue series for the trend chart. Powers the "Location Overview"
// (owner dashboard summary + Reports tab). Batched: no N+1.
export async function getLocationOverview(start: string, end: string) {
  const r2 = (n: number) => Number((n || 0).toFixed(2));
  const allStores = await db.select().from(stores);
  const storeName = (id: number | null) =>
    id == null ? "Unassigned" : (allStores.find((s) => s.id === id)?.nameEn || `#${id}`);

  // Sales invoices in range (revenue / count / paid-vs-credit / COGS source).
  const invDocs = await db.select().from(documents).where(and(
    eq(documents.type, "INV"), gte(documents.date, start), lte(documents.date, end), ne(documents.status, "void"),
  ));
  const invIds = invDocs.map((d) => d.id);
  const cogsByDoc: Record<number, number> = {};
  const profitByDoc: Record<number, number> = {};
  if (invIds.length) {
    const items = await db.select({
      documentId: documentItems.documentId, qty: documentItems.qty,
      amount: documentItems.amount, cost: products.costPrice, costAtSale: documentItems.costAtSale,
    }).from(documentItems).leftJoin(products, eq(documentItems.productId, products.id))
      .where(inArray(documentItems.documentId, invIds));
    for (const it of items as any[]) {
      const itemCost = resolveItemCost(it.costAtSale, it.cost) * Number(it.qty || 0);
      const itemProfit = Number(it.amount || 0) - itemCost;
      cogsByDoc[it.documentId] = (cogsByDoc[it.documentId] || 0) + itemCost;
      profitByDoc[it.documentId] = (profitByDoc[it.documentId] || 0) + itemProfit;
    }
  }

  // Cash actually collected + expenses paid, per location, in range.
  const cfRows = await db.select().from(cashflow).where(and(gte(cashflow.date, start), lte(cashflow.date, end)));
  // Approved returns (refund value) per location, in range.
  const retRows = await db.select().from(returnsTable).where(and(
    eq(returnsTable.status, "approved"), gte(returnsTable.date, start), lte(returnsTable.date, end),
  ));

  type Bucket = {
    storeId: number | null; storeName: string; revenue: number; cogs: number; profit: number;
    invoiceCount: number; paidSales: number; creditSales: number;
    cashCollected: number; expenses: number; returns: number;
  };
  const map = new Map<number | null, Bucket>();
  const bucket = (id: number | null): Bucket => {
    const k = id ?? null;
    let b = map.get(k);
    if (!b) {
      b = { storeId: k, storeName: storeName(k), revenue: 0, cogs: 0, profit: 0, invoiceCount: 0,
            paidSales: 0, creditSales: 0, cashCollected: 0, expenses: 0, returns: 0 };
      map.set(k, b);
    }
    return b;
  };

  for (const d of invDocs) {
    const b = bucket(d.storeId ?? null);
    const t = Number(d.total || 0);
    b.revenue += t; b.invoiceCount += 1;
    b.cogs += cogsByDoc[d.id] || 0;
    b.profit += profitByDoc[d.id] || 0;
    if (d.status === "paid") b.paidSales += t; else b.creditSales += t;
  }
  for (const r of cfRows as any[]) {
    const amt = Number(r.amount || 0);
    if (r.direction === "in" && /sales|pdc cleared/i.test(r.category || "")) bucket(r.storeId ?? null).cashCollected += amt;
    else if (r.direction === "out" && /^expense/i.test(r.category || "")) bucket(r.storeId ?? null).expenses += amt;
  }
  for (const r of retRows as any[]) {
    bucket(r.storeId ?? null).returns += Number(r.refundAmount ?? r.total ?? 0);
  }

  const locations = Array.from(map.values()).map((b) => ({
    storeId: b.storeId, storeName: b.storeName,
    revenue: r2(b.revenue), cogs: r2(b.cogs), profit: r2(b.profit),
    invoiceCount: b.invoiceCount, paidSales: r2(b.paidSales), creditSales: r2(b.creditSales),
    cashCollected: r2(b.cashCollected), expenses: r2(b.expenses), returns: r2(b.returns),
  })).sort((a, b) => b.revenue - a.revenue);

  // Day-by-day revenue series (one key per location: s<storeId>, 0 = Unassigned).
  const dates: string[] = [];
  for (let d = new Date(start + "T00:00:00"); d <= new Date(end + "T00:00:00"); d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  const dailyMap: Record<string, any> = {};
  for (const dt of dates) dailyMap[dt] = { date: dt, total: 0 };
  for (const d of invDocs) {
    const row = dailyMap[String(d.date)];
    if (!row) continue;
    const key = `s${d.storeId ?? 0}`;
    const t = Number(d.total || 0);
    row[key] = (row[key] || 0) + t; row.total += t;
  }
  const daily = dates.map((dt) => dailyMap[dt]);

  const totals = locations.reduce((a, l) => ({
    revenue: a.revenue + l.revenue, profit: a.profit + l.profit, cogs: a.cogs + l.cogs,
    invoiceCount: a.invoiceCount + l.invoiceCount, paidSales: a.paidSales + l.paidSales,
    creditSales: a.creditSales + l.creditSales, cashCollected: a.cashCollected + l.cashCollected,
    expenses: a.expenses + l.expenses, returns: a.returns + l.returns,
  }), { revenue: 0, profit: 0, cogs: 0, invoiceCount: 0, paidSales: 0, creditSales: 0, cashCollected: 0, expenses: 0, returns: 0 });
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = r2(totals[k]);

  // Top customers by revenue in the period.
  const custMap = new Map<string, { customerId: number | null; name: string; revenue: number; invoices: number }>();
  for (const d of invDocs) {
    const name = d.customerName || "Walk-in";
    const key = d.customerId != null ? `id:${d.customerId}` : `name:${name}`;
    let c = custMap.get(key);
    if (!c) { c = { customerId: d.customerId ?? null, name, revenue: 0, invoices: 0 }; custMap.set(key, c); }
    c.revenue += Number(d.total || 0); c.invoices += 1;
  }
  const topCustomers = Array.from(custMap.values())
    .map((c) => ({ ...c, revenue: r2(c.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  return {
    start, end,
    locations,
    daily,
    totals,
    topCustomers,
    seriesKeys: locations.map((l) => ({ key: `s${l.storeId ?? 0}`, name: l.storeName })),
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
    db.select().from(documents).where(and(eq(documents.type, "INV"), ne(documents.status, "void"), ne(documents.transactionMode, "demo"))),
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
      amount: documentItems.amount, cost: products.costPrice, costAtSale: documentItems.costAtSale,
    }).from(documentItems).leftJoin(products, eq(documentItems.productId, products.id))
      .where(inArray(documentItems.documentId, paidWindowIds));
    for (const it of items as any[]) {
      const qty = parseFloat(it.qty || "0");
      const rev = parseFloat(it.amount || "0");
      const cogs = qty * resolveItemCost(it.costAtSale, it.cost);
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
    const isUnpaid = d.status !== "paid" && d.status !== "returned";
    if (remaining > 0.005 && isUnpaid && dd) {
      r.amountDue += remaining;
      r.maxDaysOverdue = Math.max(r.maxDaysOverdue, Math.max(0, daysBetween(today, dd)));
      r.maxPastDue = Math.max(r.maxPastDue, Math.max(0, daysBetween(today, dueDate)));
    } else if (remaining > 0.005 && isUnpaid) {
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
      { nameEn: "MAMUN TRADING OLD (72986/1)", nameAr: "مأمون للتجارة القديم", address: "Najma Street, Doha", type: "store" },
      { nameEn: "Mamun TRADING (72986/4)", nameAr: "مأمون للتجارة", address: "Doha, Qatar", type: "store" },
      { nameEn: "3rd Floor", nameAr: "الطابق الثالث", address: "Doha, Qatar", type: "warehouse", ownerStoreId: 1 },
      { nameEn: "2nd Warehouse Rental Shop", nameAr: "المستودع الثاني - محل إيجار", address: "Doha, Qatar", type: "warehouse", ownerStoreId: 1 },
      { nameEn: "Basement of 27 Villa", nameAr: "قبو فيلا 27", address: "Doha, Qatar", type: "warehouse", ownerStoreId: 1 },
      { nameEn: "Main Warehouse/Store1", nameAr: "المستودع الرئيسي", address: "Doha, Qatar", type: "warehouse", ownerStoreId: 1 },
    ]);
  }

  // Seed admin user
  const existingUsers = await getUsers();
  if (existingUsers.length === 0) {
    await db.insert(users).values([
      { name: "Shakil", role: "admin", pin: "1234", storeId: null },
      { name: "Store Salesman", role: "salesman", pin: "1111", storeId: 1 },
      { name: "General Worker", role: "worker", pin: "2222", storeId: 2 },
    ]);
  }

  // Void orphan invoices — unpaid INVs without a customerId (walk-in/cash
  // sales with no registered customer). These can't be chased or attributed,
  // so void them to keep credit calculations clean.
  const orphans = await db.select({ id: documents.id, number: documents.number })
    .from(documents)
    .where(and(
      eq(documents.type, "INV"),
      isNull(documents.customerId),
      ne(documents.status, "void"),
      ne(documents.status, "paid"),
      ne(documents.status, "returned"),
    ));
  if (orphans.length > 0) {
    await db.update(documents)
      .set({ status: "void" })
      .where(inArray(documents.id, orphans.map((o) => o.id)));
    console.log(`Voided ${orphans.length} orphan invoice(s): ${orphans.map((o) => o.number).join(", ")}`);
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

// ─── Staff Payroll ───────────────────────────────────────────────────────────
export async function getStaffPayroll(opts?: { userId?: number; month?: string }): Promise<StaffPayroll[]> {
  const conds: any[] = [];
  if (opts?.userId) conds.push(eq(staffPayroll.userId, opts.userId));
  if (opts?.month) conds.push(eq(staffPayroll.month, opts.month));
  return db.select().from(staffPayroll)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(staffPayroll.date));
}

export async function createStaffPayrollEntry(data: InsertStaffPayroll): Promise<StaffPayroll> {
  const [row] = await db.insert(staffPayroll).values(data).returning();
  return row;
}

export async function deleteStaffPayrollEntry(id: number): Promise<void> {
  await db.delete(staffPayroll).where(eq(staffPayroll.id, id));
}

export async function updateUserSalary(id: number, salary: string, dayRate: string) {
  const [row] = await db.update(users).set({ salary, dayRate }).where(eq(users.id, id)).returning();
  return row;
}

export async function getStaffPayrollSummary(month: string) {
  const allUsers = await db.select().from(users).where(eq(users.active, true));
  const entries = await db.select().from(staffPayroll).where(eq(staffPayroll.month, month));

  return allUsers.map(u => {
    // Day-off tracking was removed — exclude any legacy day_off rows from every
    // computation and the log so they neither display nor deduct from salary.
    const userEntries = entries.filter(e => e.userId === u.id && e.type !== "day_off");
    const advances = userEntries.filter(e => e.type === "advance").reduce((s, e) => s + Number(e.amount), 0);
    const deductions = userEntries.filter(e => e.type === "deduction").reduce((s, e) => s + Number(e.amount), 0);
    const bonuses = userEntries.filter(e => e.type === "bonus").reduce((s, e) => s + Number(e.amount), 0);
    const salaryPaid = userEntries.filter(e => e.type === "salary_payment").reduce((s, e) => s + Number(e.amount), 0);
    const baseSalary = Number(u.salary || 0);
    const netSalary = baseSalary - advances - deductions + bonuses;

    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      baseSalary,
      advances,
      deductions,
      bonuses,
      netSalary,
      salaryPaid,
      remaining: netSalary - salaryPaid,
      entries: userEntries,
    };
  }).filter(u => u.baseSalary > 0 || u.entries.length > 0);
}

// ─── Arrangement Notes ──────────────────────────────────────────────────────

export async function getArrangementNote(documentId: number): Promise<{
  note: ArrangementNote; items: (ArrangementNoteItem & { store: Store })[];
} | null> {
  const [note] = await db.select().from(arrangementNotes).where(eq(arrangementNotes.documentId, documentId));
  if (!note) return null;
  const rows = await db.select({ item: arrangementNoteItems, store: stores })
    .from(arrangementNoteItems)
    .innerJoin(stores, eq(arrangementNoteItems.sourceStoreId, stores.id))
    .where(eq(arrangementNoteItems.noteId, note.id));
  const noteItems = rows.map(r => ({ ...r.item, store: r.store }));
  return { note, items: noteItems };
}

// ─── Helper Pick Note Queue ─────────────────────────────────────────────────

export async function getPickNoteQueue(storeId: number | null): Promise<{
  note: ArrangementNote;
  doc: { id: number; number: string; customerName: string | null; total: string; createdAt: Date | null };
  items: (ArrangementNoteItem & { store: Store })[];
  pickedByName?: string;
}[]> {
  const conditions = [
    eq(documents.type, "INV"),
    or(
      eq(arrangementNotes.status, "pending"),
      eq(arrangementNotes.status, "picking"),
      eq(arrangementNotes.status, "ready"),
    ),
  ];
  if (storeId) conditions.unshift(eq(documents.storeId, storeId));
  const notes = await db.select().from(arrangementNotes)
    .innerJoin(documents, eq(arrangementNotes.documentId, documents.id))
    .where(and(...conditions))
    .orderBy(desc(arrangementNotes.createdAt));

  const results: Awaited<ReturnType<typeof getPickNoteQueue>> = [];
  for (const row of notes) {
    const itemRows = await db.select({ item: arrangementNoteItems, store: stores })
      .from(arrangementNoteItems)
      .innerJoin(stores, eq(arrangementNoteItems.sourceStoreId, stores.id))
      .where(eq(arrangementNoteItems.noteId, row.arrangement_notes.id));
    const noteItems = itemRows.map(r => ({ ...r.item, store: r.store }));
    let pickedByName: string | undefined;
    if (row.arrangement_notes.pickedById) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.arrangement_notes.pickedById));
      pickedByName = u?.name ?? undefined;
    }
    results.push({
      note: row.arrangement_notes,
      doc: {
        id: row.documents.id,
        number: row.documents.number,
        customerName: row.documents.customerName,
        total: row.documents.total,
        createdAt: row.documents.createdAt,
      },
      items: noteItems,
      pickedByName,
    });
  }
  return results;
}

export async function claimPickNote(noteId: number, userId: number): Promise<{ ok: boolean; message?: string }> {
  const [note] = await db.select().from(arrangementNotes).where(eq(arrangementNotes.id, noteId));
  if (!note) return { ok: false, message: "Note not found" };
  if (note.status !== "pending") return { ok: false, message: "Already claimed by another helper" };
  await db.update(arrangementNotes).set({
    status: "picking",
    pickedById: userId,
    pickedAt: new Date(),
  }).where(and(eq(arrangementNotes.id, noteId), eq(arrangementNotes.status, "pending")));
  const [updated] = await db.select().from(arrangementNotes).where(eq(arrangementNotes.id, noteId));
  if (updated.pickedById !== userId) return { ok: false, message: "Already claimed by another helper" };
  return { ok: true };
}

export async function markPickNoteReady(noteId: number, userId: number): Promise<{ ok: boolean; message?: string }> {
  const [note] = await db.select().from(arrangementNotes).where(eq(arrangementNotes.id, noteId));
  if (!note) return { ok: false, message: "Note not found" };
  if (note.status !== "picking") return { ok: false, message: "Note is not being picked" };
  if (note.pickedById !== userId) return { ok: false, message: "You are not the one picking this note" };
  await db.update(arrangementNotes).set({
    status: "ready",
    readyAt: new Date(),
  }).where(eq(arrangementNotes.id, noteId));
  return { ok: true };
}

// ─── Pick Item Update (per-item issue reporting during picking) ──────────────

export async function updatePickItem(
  noteId: number,
  itemId: number,
  data: { pickedQty?: number | string; issueType?: string | null; issueNote?: string | null },
  userId: number,
): Promise<{ ok: boolean; message?: string }> {
  const [note] = await db.select().from(arrangementNotes).where(eq(arrangementNotes.id, noteId));
  if (!note) return { ok: false, message: "Note not found" };
  if (!["picking", "ready"].includes(note.status)) return { ok: false, message: "Note is not in picking state" };

  const [item] = await db.select().from(arrangementNoteItems)
    .where(and(eq(arrangementNoteItems.id, itemId), eq(arrangementNoteItems.noteId, noteId)));
  if (!item) return { ok: false, message: "Item not found in this note" };

  const patch: Record<string, any> = { pickedAt: new Date() };
  if (data.pickedQty !== undefined) patch.pickedQty = String(data.pickedQty);
  if (data.issueType !== undefined) patch.issueType = data.issueType;
  if (data.issueNote !== undefined) patch.issueNote = data.issueNote;

  if (data.issueType && data.issueType !== "partial") {
    patch.pickedQty = "0";
  }

  await db.update(arrangementNoteItems).set(patch).where(eq(arrangementNoteItems.id, itemId));
  return { ok: true };
}

// ─── Complete Pick Note (Done button — notify salesman about issues) ────────

export async function completePickNote(
  noteId: number,
  userId: number,
): Promise<{ ok: boolean; message?: string; hasIssues?: boolean; issueCount?: number }> {
  const [note] = await db.select().from(arrangementNotes).where(eq(arrangementNotes.id, noteId));
  if (!note) return { ok: false, message: "Note not found" };
  if (!["picking", "ready"].includes(note.status)) return { ok: false, message: "Note is not in picking state" };

  const items = await db.select().from(arrangementNoteItems).where(eq(arrangementNoteItems.noteId, noteId));

  const issueItems = items.filter(i => i.issueType);
  const hasIssues = issueItems.length > 0;

  await db.update(arrangementNotes).set({
    status: "completed",
    completedAt: new Date(),
    completedById: userId,
    hasIssues,
  }).where(eq(arrangementNotes.id, noteId));

  const [doc] = await db.select().from(documents).where(eq(documents.id, note.documentId));
  if (!doc) return { ok: true, hasIssues, issueCount: issueItems.length };

  const [picker] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const pickerName = picker?.name ?? "Helper";

  if (hasIssues && doc.createdBy) {
    const issueLines = issueItems.map(i => {
      const label = { not_found: "Not Found", partial: "Partial", damaged: "Damaged", wrong_item: "Wrong Item" }[i.issueType!] ?? i.issueType;
      const qty = i.issueType === "partial" ? ` (${i.pickedQty}/${i.totalQty})` : "";
      return `${i.description}: ${label}${qty}${i.issueNote ? ` — ${i.issueNote}` : ""}`;
    }).join("\n");

    await createNotification({
      targetUserId: doc.createdBy,
      type: "pick_issues",
      title: `Pick issues on ${doc.number}`,
      message: `${pickerName} completed picking with ${issueItems.length} issue${issueItems.length > 1 ? "s" : ""}:\n${issueLines}`,
      link: `/documents/${doc.id}`,
      entityType: "document",
      entityId: doc.id,
      createdBy: userId,
    });
  }

  if (!hasIssues && doc.createdBy) {
    await createNotification({
      targetUserId: doc.createdBy,
      type: "pick_complete",
      title: `${doc.number} picked — ready`,
      message: `${pickerName} has finished picking all items. No issues found.`,
      link: `/documents/${doc.id}`,
      entityType: "document",
      entityId: doc.id,
      createdBy: userId,
    });
  }

  return { ok: true, hasIssues, issueCount: issueItems.length };
}

// ─── Reassign Pick Note (manager override) ──────────────────────────────────

export async function reassignPickNote(
  noteId: number,
  newUserId: number,
): Promise<{ ok: boolean; message?: string }> {
  const [note] = await db.select().from(arrangementNotes).where(eq(arrangementNotes.id, noteId));
  if (!note) return { ok: false, message: "Note not found" };
  if (note.status === "completed" || note.status === "arranged") {
    return { ok: false, message: "Cannot reassign a completed note" };
  }

  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, newUserId));
  if (!u) return { ok: false, message: "User not found" };

  await db.update(arrangementNotes).set({
    status: "picking",
    pickedById: newUserId,
    pickedAt: new Date(),
  }).where(eq(arrangementNotes.id, noteId));

  return { ok: true };
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
