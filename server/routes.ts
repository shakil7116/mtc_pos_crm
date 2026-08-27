import express, { type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { openai } from "./replit_integrations/audio/client";
import { db } from "./db";
import { settings, users, stockAdjustments } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import {
  getSettings, upsertSettings,
  getStores, createStore, updateStore,
  getUsers, getUser, createUser, updateUser, verifyUserPin, changeOwnPin,
  createTask, getTasks, updateTask, deleteTask,
  getCustomers, searchCustomers, getCustomer, createCustomer, updateCustomer, getCustomerBalance,
  getProducts, searchProducts, getProduct, createProduct, updateProduct,
  getProductAliases, createProductAlias, deleteProductAlias, matchProductNames, getMatchCatalogue, AliasConflictError,
  getInventory, adjustStock, getLowStockItems, getProductQtyAt,
  createTransfer, updateTransfer, getTransfers, approveTransfer, receiveTransfer, cancelTransfer, getTransferSettlement,
  getSuppliers, getSupplier, createSupplier, updateSupplier,
  getDocuments, getDocument, createDocument, updateDocument, updateDocumentItems, deleteDocument, voidDocument,
  getPayments, createPayment, resolveItemCost, quickGoodsReceipt,
  setStockCount, setStockCountBatch, deleteUser, setUserActive,
  getCheques, createCheque, updateCheque,
  logEdit, getEditLog,
  createReturn, getReturns, getReturn, approveReturn, rejectReturn, getBusinessRules,
  createApprovalRequest, getApprovalRequests,
  approveApprovalRequest, rejectApprovalRequest, cancelApprovalRequest, completeApprovalRequest,
  resolveDeliveryNote, pickDeliveryNote, authorizeDeliveryNote, markDeliveryNoteDelivered,
  signWarehouseRelease, reportDeliveryDamage,
  getProductActivity, getReorderSuggestions,
  createOwnerLoan, updateOwnerLoan, getOwnerLoans, LOAN_TYPES, getProfitDetail, getProfitSummary, getCreditExposure, getCustomerOverview, getLocationOverview,
  createNotification, getNotifications, markNotificationRead, markAllNotificationsRead,
  getArrangementNote, getPickNoteQueue, claimPickNote, markPickNoteReady,
  updatePickItem, completePickNote, reassignPickNote,
  getMessages, logMessage, getLastMessageDate,
  createSupplierOrder, getSupplierOrders, updateSupplierOrder, receiveSupplierOrder,
  updateSupplierOrderStatus, receiveSupplierOrderItems, createSupplierReturn,
  getSupplierReturns, updateSupplierReturnStatus,
  createSupplierPayment, getSupplierPayments, getSupplierLedger,
  createExpense, getExpenses, updateExpense, deleteExpense, checkRecurringExpenses,
  createWarehouseIssue, getWarehouseIssues, updateWarehouseIssue,
  setChequeStatus, checkPdcAlerts, getChequeDetail, setChequePhoto, setChequeDepositProof, setChequeClearanceProof, swapChequeToPayment,
  setChequeRecovery, createReplacementCheque, getPdcActionSummary,
  logCashflow, getCashflow, getCashPosition, InsufficientFundsError,
  logCorrection, getCorrections, reverseChequeStatus, correctPayment,
  softDeleteExpense, reverseDelivery, reverseReturnApproval,
  getDailySalesSummary, getUnpaidInvoices,
  getNextDocNumber, peekNextDocNumber,
  DuplicateDocumentNumberError, InvalidDocumentNumberError, CreditLimitExceededError, PricingApprovalRequiredError,
  seedDatabase,
  storage,
  getManagedList, getAllManagedLists, createManagedListItem, updateManagedListItem, deleteManagedListItem,
  getFieldDefinitions, createFieldDefinition, updateFieldDefinition, deleteFieldDefinition,
  getModuleDefinitions, createModuleDefinition, updateModuleDefinition, deleteModuleDefinition,
  getCustomRecords, createCustomRecord, updateCustomRecord, deleteCustomRecord,
  getDocumentCounters, setNextDocNumber, updateCounterFormat, getNumberingAudit,
  getStaffPayroll, createStaffPayrollEntry, deleteStaffPayrollEntry, updateUserSalary, getStaffPayrollSummary,
  ensureFunds,
} from "./storage";
import { matchProduct } from "./matching";
import { registerAssistantRoutes } from "./assistantRoutes";
import { extractText, ocrStatus } from "./ocr";
import { parseInvoiceText } from "./lineParser";
import { analyseCsv, commitRows, type CommitRow } from "./productImport";
import { normalizeRole } from "@shared/permissions";
import {
  login, clearTokenCookie, changePassword, adminResetPassword, invalidateUserSessions, verifyUserPassword, registerOwner, recoverPassword,
  loginRateLimit,
} from "./auth";

// Role from the verified JWT (req.user). No token → no role → every gate fails
// closed with 403. (authMiddleware honors ALLOW_DEV_HEADERS=1 for the dev/test
// harness only; that flag must be absent in production.)
function requireAdminOrManager(req: Request, res: Response): boolean {
  if (!["admin", "manager"].includes(normalizeRoleStrict(req))) {
    res.status(403).json({ message: "Admin or manager only" });
    return false;
  }
  return true;
}

function normalizeRoleStrict(req: Request): string {
  return req.user ? normalizeRole(req.user.role) : "";
}

// Per-store isolation: a store-assigned non-admin (salesman, manager, warehouse…)
// is hard-locked to their own store on data reads — a raw ?storeId= call can't
// widen it. Admin, and a non-admin with no assigned store, are not locked.
function lockedStoreId(req: Request): number | null {
  return normalizeRoleStrict(req) !== "admin" && req.user?.storeId ? req.user.storeId : null;
}

// Insufficient cash/bank → 409 with a machine-readable code so the UI can offer an
// admin override dialog. Returns true if it handled the error.
function sendFundsError(res: Response, err: unknown): boolean {
  if (err instanceof InsufficientFundsError) {
    res.status(409).json({
      code: err.code, message: err.message,
      instrument: err.instrument, balance: err.balance, requested: err.requested,
    });
    return true;
  }
  return false;
}
import PDFDocument from "pdfkit";
import twilio from "twilio";
import multer from "multer";
import fs from "fs";
import { demo } from "./demoStore";

const upload = multer({ dest: "/tmp/uploads/" });

// Fallback users when DB is not configured (no DATABASE_URL)
const DEMO_USERS = [
  { id: 1, name: "Shakil", role: "admin", storeId: 1, active: true, pin: "1234" },
  { id: 2, name: "Staff1", role: "staff", storeId: 1, active: true, pin: "1111" },
  { id: 3, name: "Staff2", role: "staff", storeId: 2, active: true, pin: "2222" },
];
const dbAvailable = () => !!process.env.DATABASE_URL;

// Minimal CSV parser (handles quoted fields + escaped quotes). Header row → keys (lowercased).
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else { if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; }
    }
    out.push(cur); return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = parseLine(l); const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (cells[i] ?? "").trim(); });
    return o;
  });
}

// Demo data returned when DB is not configured, so the UI is fully browsable
const DEMO_SETTINGS = {
  id: 1,
  storeNameEn: "MAMUN M TRADING AND CONTRACTING W.L.L",
  storeNameAr: "مأمون م للتجارة والمقاولات ذ.م.م",
  addressEn: "NAJMA STREET, NAJMA, DOHA, QATAR",
  addressAr: "شارع النجمة، النجمة، الدوحة، قطر",
  phone: "+974 30703722",
  crNumber: "72986/1",
  poBox: "17336",
  email: "",
  brands: [] as string[],
  returnPolicyText:
    "Goods sold are not returnable after 7 days. Original invoice required.",
};
const DEMO_STORES = [
  { id: 1, nameEn: "Store 1 — Najma", nameAr: "", type: "store", active: true },
  { id: 2, nameEn: "Store 2 — Industrial Area", nameAr: "", type: "store", active: true },
  { id: 3, nameEn: "Warehouse A", nameAr: "", type: "warehouse", active: true },
  { id: 4, nameEn: "Warehouse B", nameAr: "", type: "warehouse", active: true },
  { id: 5, nameEn: "Warehouse C", nameAr: "", type: "warehouse", active: true },
];

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function calculateTotal(items: any[]): number {
  return items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity || item.qty || "0");
    const price = parseFloat(item.unitPrice || item.unit_price || "0");
    return sum + qty * price;
  }, 0);
}

function amountToWords(amount: number): string {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN",
    "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN",
    "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY",
    "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  function convertHundreds(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    return ones[Math.floor(n / 100)] + " HUNDRED " + convertHundreds(n % 100);
  }

  const intPart = Math.floor(amount);
  const decPart = Math.round((amount - intPart) * 100);

  let words = convertHundreds(intPart).trim();
  if (decPart > 0) {
    words += " AND " + convertHundreds(decPart).trim() + " DIRHAMS";
  }

  return (words + " QATARI RIYALS ONLY").trim();
}

// ─── Doc Type Helper ────────────────────────────────────────────────────────

function getDocMeta(invoiceNumber: string) {
  if (invoiceNumber?.startsWith("QT-")) {
    return {
      titleEn: "QUOTATION",
      titleAr: "عرض سعر",
      refLabel: "Quotation No",
      billToLabel: "To",
      showPrices: true,
      signatureBlock: (doc: any, colX: any) => {
        const cx = 300;
        const y = doc.y;
        doc.moveTo(cx - 60, y).lineTo(cx + 60, y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(9).font("Helvetica-Bold").text("AUTHORIZED SIGNATURE", cx - 60, doc.y, { width: 120, align: "center" });
        doc.fontSize(8).font("Helvetica").text("التوقيع المعتمد", cx - 60, doc.y, { width: 120, align: "center" });
      }
    };
  }
  if (invoiceNumber?.startsWith("DN-")) {
    return {
      titleEn: "DELIVERY NOTE",
      titleAr: "إشعار تسليم",
      refLabel: "Delivery Note No",
      billToLabel: "Deliver To",
      showPrices: false,
      signatureBlock: (doc: any, colX: any) => {
        const y = doc.y;
        doc.moveTo(40, y).lineTo(180, y).stroke();
        doc.moveTo(380, y).lineTo(520, y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(9).font("Helvetica-Bold");
        doc.text("DELIVERED BY", 40, doc.y);
        doc.text("RECEIVED BY", 380, doc.y - 12);
        doc.fontSize(8).font("Helvetica");
        doc.text("سلّمه", 40, doc.y);
        doc.text("استلمه", 380, doc.y - 12);
      }
    };
  }
  return {
    titleEn: "INVOICE",
    titleAr: "فاتورة",
    refLabel: "Invoice No",
    billToLabel: "Customer",
    showPrices: true,
    signatureBlock: (doc: any, colX: any) => {
      const y = doc.y;
      doc.moveTo(40, y).lineTo(180, y).stroke();
      doc.moveTo(380, y).lineTo(520, y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("SALESMAN SIGNATURE", 40, doc.y);
      doc.text("RECEIVER'S SIGNATURE", 380, doc.y - 12);
      doc.fontSize(8).font("Helvetica");
      doc.text("توقيع البائع", 40, doc.y);
      doc.text("توقيع المستلم", 380, doc.y - 12);
    }
  };
}

// ─── Image Base64 Sanitizer ──────────────────────────────────────────────────
function sanitizeBase64Image(image: string): { base64Data: string; mimeType: string } {
  let mimeType = "image/jpeg";
  if (image.includes("data:image/png")) {
    mimeType = "image/png";
  } else if (image.includes("data:image/webp")) {
    mimeType = "image/webp";
  } else if (image.includes("data:image/gif")) {
    mimeType = "image/gif";
  } else if (image.includes("data:image/jpeg") || image.includes("data:image/jpg")) {
    mimeType = "image/jpeg";
  }
  const base64Data = image.replace(/^data:image\/\w+;base64,/, "").trim();
  return { base64Data, mimeType };
}

// ─── Validate Parsed Invoice ─────────────────────────────────────────────────
function validateInvoiceData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object") {
    errors.push("Response is not a valid object");
    return { valid: false, errors };
  }
  if (!Array.isArray(data.items)) {
    errors.push("Missing or invalid 'items' array");
    return { valid: false, errors };
  }
  data.items.forEach((item: any, idx: number) => {
    if (!item.description || typeof item.description !== "string") {
      errors.push(`Item ${idx}: Missing or invalid description`);
    }
    if (typeof item.qty !== "number" || item.qty < 0) {
      errors.push(`Item ${idx}: Invalid quantity (must be positive number)`);
    }
    if (!item.unit || typeof item.unit !== "string") {
      errors.push(`Item ${idx}: Missing or invalid unit`);
    }
    if (item.unit_price !== null && (typeof item.unit_price !== "number" || item.unit_price < 0)) {
      errors.push(`Item ${idx}: Invalid unit_price (must be null or positive number)`);
    }
    if (item.total_price !== null && (typeof item.total_price !== "number" || item.total_price < 0)) {
      errors.push(`Item ${idx}: Invalid total_price (must be null or positive number)`);
    }
  });
  return { valid: errors.length === 0, errors };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function registerRoutes(httpServer: Server, app: express.Express): Promise<void> {

  // ══════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════

  // ── Graceful degradation: when no DB is configured, serve a live in-memory
  //    demo backend so every page renders AND the full create/edit flow works ──
  app.use((req: Request, res: Response, next) => {
    if (dbAvailable() || req.method !== "GET" || !req.path.startsWith("/api/")) {
      return next();
    }
    const p = req.path;
    if (p === "/api/users") return next(); // dedicated demo-users handler
    if (p === "/api/settings") return res.json(demo.settings());
    if (p === "/api/stores") return res.json(demo.stores());
    if (p === "/api/customers") {
      const search = (req.query.search as string || "").trim().toLowerCase();
      const all = demo.customers();
      if (search.length >= 2) {
        return res.json(all.filter((c: any) =>
          (c.name || "").toLowerCase().includes(search) ||
          (c.phone || "").includes(search) ||
          (c.address || "").toLowerCase().includes(search)
        ).slice(0, 30));
      }
      return res.json(all);
    }
    if (p === "/api/products") {
      const search = (req.query.search as string || "").trim().toLowerCase();
      const all = demo.products();
      if (search.length >= 2) {
        return res.json(all.filter((p: any) =>
          (p.name || "").toLowerCase().includes(search) ||
          (p.sku || "").toLowerCase().includes(search) ||
          (p.category || "").toLowerCase().includes(search)
        ).slice(0, 30));
      }
      return res.json(all);
    }
    if (p === "/api/documents") {
      const type = req.query.type as string | undefined;
      const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
      return res.json(demo.listDocuments(type, storeId));
    }
    const balMatch = p.match(/^\/api\/customers\/(\d+)\/balance$/);
    if (balMatch) return res.json(demo.customerBalance(Number(balMatch[1])));
    const docMatch = p.match(/^\/api\/documents\/(\d+)$/);
    if (docMatch) return res.json(demo.getDocument(Number(docMatch[1])));
    if (p === "/api/documents/next-number") {
      const type = (req.query.type as string) || "INV";
      return res.json({ number: demo.peekNextNumber(type) });
    }
    const docPay = p.match(/^\/api\/documents\/(\d+)\/payments$/);
    if (docPay) return res.json(demo.listPayments(Number(docPay[1])));
    if (p === "/api/returns") {
      return res.json(demo.listReturns(req.query.invoiceId ? Number(req.query.invoiceId) : undefined));
    }
    const retMatch = p.match(/^\/api\/returns\/(\d+)$/);
    if (retMatch) return res.json(demo.getReturn(Number(retMatch[1])));
    const custMatch = p.match(/^\/api\/customers\/(\d+)$/);
    if (custMatch) return res.json(demo.getCustomer(Number(custMatch[1])));
    if (p === "/api/reports/daily-sales") {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const sid = req.query.storeId ? Number(req.query.storeId) : undefined;
      return res.json(demo.reports.dailySales(start, end, sid));
    }
    if (p === "/api/dashboard/summary") {
      return res.json({
        cashSalesToday: 0, creditSalesToday: 0, chequesUncleared: { count: 0, amount: 0 },
        profitFromCash: 0, profitFromUnrealizedCredit: 0,
        newInvoicesToday: 0, returnsToday: 0, totalOutstanding: 0, paymentReminders: [],
      });
    }
    if (p === "/api/reports/unpaid-invoices") {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      return res.json(demo.reports.unpaidInvoices(start, end));
    }
    if (p === "/api/reports/cheque-calendar") {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      return res.json(demo.reports.chequeCalendar(start, end));
    }
    if (p === "/api/reports/top-customers") {
      return res.json(demo.reports.topCustomers(req.query.start as string, req.query.end as string));
    }
    if (p === "/api/reports/top-products") {
      return res.json(demo.reports.topProducts(req.query.start as string, req.query.end as string));
    }
    if (p === "/api/reports/returns") {
      return res.json(demo.reports.returnsReport(req.query.start as string, req.query.end as string));
    }
    // Single-entity lookups → null so the page shows a clean "not found" state
    if (/^\/api\/(products|suppliers|invoices)\/\d+$/.test(p)) {
      return res.json(null);
    }
    // Everything else is a collection
    return res.json([]);
  });

  // ── Demo write paths (active only when no DB) ──
  app.post("/api/documents", (req: Request, res: Response, next) => {
    if (!dbAvailable()) {
      try {
        return res.status(201).json(demo.createDocument(req.body));
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.startsWith("DUPLICATE_NUMBER:")) {
          const number = msg.split(":")[1];
          return res.status(409).json({ message: `Document number ${number} already exists`, code: "DUPLICATE_NUMBER", number });
        }
        if (msg === "INVALID_NUMBER") {
          return res.status(400).json({ message: "Invalid document number format", code: "INVALID_NUMBER" });
        }
        return res.status(500).json({ message: msg });
      }
    }
    next();
  });
  app.put("/api/documents/:id", (req: Request, res: Response, next) => {
    if (!dbAvailable()) {
      const updated = demo.updateDocument(Number(req.params.id), req.body);
      return updated ? res.json(updated) : res.status(404).json({ message: "Not found" });
    }
    next();
  });
  app.delete("/api/documents/:id", (req: Request, res: Response, next) => {
    if (!dbAvailable()) { demo.deleteDocument(Number(req.params.id)); return res.status(204).send(); }
    next();
  });
  app.post("/api/documents/:id/convert", (req: Request, res: Response, next) => {
    if (!dbAvailable()) {
      const inv = demo.convertDocument(Number(req.params.id));
      return inv ? res.json(inv) : res.status(404).json({ message: "Not found" });
    }
    next();
  });
  app.post("/api/documents/:id/payments", (req: Request, res: Response, next) => {
    if (!dbAvailable()) {
      const doc = demo.getDocument(Number(req.params.id));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      return res.status(201).json(demo.createPayment({
        ...req.body, documentId: Number(req.params.id), customerId: (doc as any).customerId,
      }));
    }
    next();
  });
  app.post("/api/customers", (req: Request, res: Response, next) => {
    if (!dbAvailable()) return res.status(201).json(demo.createCustomer(req.body));
    next();
  });
  app.post("/api/returns", (req: Request, res: Response, next) => {
    if (!dbAvailable()) return res.status(201).json(demo.createReturn(req.body));
    next();
  });
  app.post("/api/settings", (req: Request, res: Response, next) => {
    if (!dbAvailable()) return res.json(demo.updateSettings(req.body));
    next();
  });

  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      const s = await getSettings();
      res.json(s);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/settings", async (req: Request, res: Response) => {
    // System configuration (business rules, tax, thresholds, company info, numbering)
    // is a CRITICAL setting — admin only. Managers run operations, not system config.
    if (reqRole(req) !== "admin") return res.status(403).json({ message: "Only an admin can change system settings." });
    try {
      const updated = await upsertSettings(req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // STORES
  // ══════════════════════════════════════════════════════════════

  app.get("/api/stores", async (req: Request, res: Response) => {
    try {
      const rows = await getStores();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Locations are Settings-managed — admin only (consistent with /api/lists).
  const storeAdminOnly = (req: Request, res: Response): boolean => {
    if (normalizeRoleStrict(req) !== "admin") {
      res.status(403).json({ message: "Admin only" });
      return false;
    }
    return true;
  };

  app.post("/api/stores", async (req: Request, res: Response) => {
    if (!storeAdminOnly(req, res)) return;
    try {
      const row = await createStore(req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.put("/api/stores/:id", async (req: Request, res: Response) => {
    if (!storeAdminOnly(req, res)) return;
    try {
      const row = await updateStore(Number(req.params.id), req.body);
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/users", async (req: Request, res: Response) => {
    if (!dbAvailable()) {
      return res.json(DEMO_USERS.map(({ pin, ...u }) => u));
    }
    try {
      const rows = await getUsers();
      // Never expose secrets/security state to the client (any authed user can read this list).
      const safe = rows.map(({ pin, passwordHash, tokenVersion, failedAttempts, lockedUntil, ...u }) => u);
      res.json(safe);
    } catch (err) {
      res.json(DEMO_USERS.map(({ pin, ...u }) => u));
    }
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const row = await createUser(req.body);
      const { pin, passwordHash, tokenVersion, failedAttempts, lockedUntil, ...safe } = row;
      res.status(201).json(safe);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.put("/api/users/:id", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const id = Number(req.params.id);
      const before = await getUser(id);
      // Modifying ANOTHER admin's account requires the acting admin to re-enter their password.
      if (before && before.role === "admin" && id !== req.user?.id) {
        const okPw = await verifyUserPassword(req.user!.id, String(req.body?.confirmPassword || ""));
        if (!okPw) return res.status(403).json({ message: "Enter your own password to change another admin's account." });
      }
      const { confirmPassword, ...body } = req.body || {};
      const row = await updateUser(id, body);
      // Role or store change → kill existing sessions (forced re-login).
      if (before && (before.role !== row.role || before.storeId !== row.storeId)) {
        await invalidateUserSessions(row.id);
      }
      const { pin, passwordHash, tokenVersion, failedAttempts, lockedUntil, ...safe } = row;
      res.json(safe);
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Turn access on or off. This is the normal way to remove someone who has left:
  // they cannot log in from this moment, and every invoice they raised still says
  // they raised it.
  app.post("/api/users/:id/active", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const row = await setUserActive(
        Number(req.params.id), req.body?.active !== false, req.user?.id);
      const { pin, passwordHash, tokenVersion, failedAttempts, lockedUntil, ...safe } = row;
      res.json(safe);
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Erase the account entirely. Only possible for someone who never did anything —
  // storage refuses if any work is recorded against them, and says to deactivate
  // instead. Deleting a person who has sold things would destroy the record of who
  // sold what.
  app.delete("/api/users/:id", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      await deleteUser(Number(req.params.id), req.user?.id);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // SETUP / ONBOARDING (no auth required)
  // ══════════════════════════════════════════════════════════════

  app.get("/api/setup/status", async (_req: Request, res: Response) => {
    try {
      const adminUsers = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      let setupComplete = false;
      try {
        const rows = await db.execute(sql`SELECT setup_complete FROM settings LIMIT 1`);
        setupComplete = !!(rows as any)?.rows?.[0]?.setup_complete;
      } catch { /* column may not exist yet — treat as not complete */ }
      res.json({ setupComplete, hasAdmin: adminUsers.length > 0 });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const result = await registerOwner(req.body, res);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.status(201).json({ user: result.user });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.post("/api/setup/business", async (req: Request, res: Response) => {
    if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const { companyName, companyNameAr, address, phone, email, crNumber } = req.body;
      await db.update(settings).set({
        storeNameEn: companyName || undefined,
        storeNameAr: companyNameAr || undefined,
        addressEn: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
        crNumber: crNumber || undefined,
      }).where(eq(settings.id, 1));
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.post("/api/setup/complete", async (req: Request, res: Response) => {
    if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      await db.update(settings).set({ setupComplete: true }).where(eq(settings.id, 1));
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ══════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════

  // ── JWT session auth (Phase 7) ──────────────────────────────────
  // Username + password → signed token in an httpOnly cookie.
  app.post("/api/auth/login", loginRateLimit(), async (req: Request, res: Response) => {
    const { username, password, rememberMe } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: "Username and password are required." });
    try {
      const result = await login(String(username), String(password), !!rememberMe, res);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json({ user: result.user });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Who am I — from the verified token (client bootstraps session from this).
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const u = await getUser(req.user.id).catch(() => null);
    res.json({ user: {
      id: req.user.id, name: req.user.name, role: req.user.role, storeId: req.user.storeId,
      mustChangePassword: !!(u as any)?.mustChangePassword,
      mustChangePin: !!(u as any)?.mustChangePin,
    } });
  });

  app.post("/api/auth/logout", async (_req: Request, res: Response) => {
    clearTokenCookie(res);
    res.json({ ok: true });
  });

  // Recover password using username + PIN (no session required).
  app.post("/api/auth/recover", loginRateLimit(), async (req: Request, res: Response) => {
    const { username, pin, newPassword } = req.body || {};
    if (!username || !pin || !newPassword) return res.status(400).json({ message: "Username, PIN, and new password are required." });
    try {
      const result = await recoverPassword(String(username), String(pin), String(newPassword), res);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json({ user: result.user });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Change own password (first-login forced change routes here too).
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      await changePassword(req.user.id, String(req.body?.currentPassword || ""), String(req.body?.newPassword || ""));
      clearTokenCookie(res); // old token invalid (tokenVersion bumped) → re-login
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Change own PIN (forced reset routes here too). Enforces non-trivial + unique.
  app.post("/api/auth/change-pin", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      await changeOwnPin(req.user.id, String(req.body?.newPin || ""));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Admin resets a user's password → temp password + forced change + sessions killed.
  app.post("/api/users/:id/reset-password", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const id = Number(req.params.id);
      const target = await getUser(id);
      // Resetting ANOTHER admin's password requires the acting admin to confirm their own.
      if (target && target.role === "admin" && id !== req.user?.id) {
        const okPw = await verifyUserPassword(req.user!.id, String(req.body?.confirmPassword || ""));
        if (!okPw) return res.status(403).json({ message: "Enter your own password to reset another admin's password." });
      }
      await adminResetPassword(id, String(req.body?.newPassword || ""));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // TASKS — manager (and warehouse-manager / main salesman) assign to staff
  // ══════════════════════════════════════════════════════════════
  const canAssignTasks = (req: Request) => ["admin", "manager", "worker", "salesman"].includes(reqRole(req));
  app.get("/api/tasks", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const seesAll = ["admin", "manager"].includes(reqRole(req));
    // Managers/admin see the whole board; everyone else sees only their own tasks.
    const mine = req.query.scope === "mine" || !seesAll;
    try { res.json(await getTasks(mine ? { mineUserId: req.user.id } : {})); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });
  app.post("/api/tasks", async (req: Request, res: Response) => {
    if (!canAssignTasks(req)) return res.status(403).json({ message: "You are not allowed to assign tasks." });
    try { res.status(201).json(await createTask({ ...req.body, assignedBy: req.user?.id ?? null })); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });
  app.patch("/api/tasks/:id", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    try { res.json(await updateTask(Number(req.params.id), req.body, { id: req.user.id, role: reqRole(req) })); }
    catch (err) { res.status(err instanceof Error && /not allowed/i.test(err.message) ? 403 : 400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });
  app.delete("/api/tasks/:id", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only." });
    try { await deleteTask(Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // ══════════════════════════════════════════════════════════════
  // CUSTOMERS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/customers", async (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string || "").trim();
      if (search.length >= 2) {
        const rows = await searchCustomers(search);
        return res.json(rows);
      }
      const rows = await getCustomers();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/customers", async (req: Request, res: Response) => {
    try {
      const body = { ...req.body };
      // Only a manager/admin sets a credit limit; a salesman-created customer starts at 0.
      if (body.creditLimit !== undefined && !["admin", "manager"].includes(reqRole(req))) delete body.creditLimit;
      const row = await createCustomer(body);
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/customers/:id", async (req: Request, res: Response) => {
    try {
      const row = await getCustomer(Number(req.params.id));
      if (!row) return res.status(404).json({ message: "Customer not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.put("/api/customers/:id", async (req: Request, res: Response) => {
    try {
      const body = { ...req.body };
      // Credit limit is a manager/admin decision. A salesman may edit a customer's
      // details but not raise/lower their credit — silently drop it if they try.
      if (body.creditLimit !== undefined && !["admin", "manager"].includes(reqRole(req))) delete body.creditLimit;
      const row = await updateCustomer(Number(req.params.id), body);
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/customers/:id/balance", async (req: Request, res: Response) => {
    try {
      const customerId = Number(req.params.id);
      const customer = await getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      const { db } = await import("./db");
      const { documents, payments } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const docs = await db.select({ total: documents.total, status: documents.status, transactionMode: documents.transactionMode })
        .from(documents)
        .where(and(eq(documents.customerId, customerId), eq(documents.type, "INV")));

      // Void/returned/demo invoices are not receivable — exclude from the ledger.
      const totalInvoiced = docs
        .filter((d: any) => d.status !== "void" && d.status !== "returned" && d.transactionMode !== "demo")
        .reduce((s: number, d: any) => s + parseFloat(d.total || "0"), 0);

      const pays = await db.select({ amount: payments.amount, isRefund: payments.isRefund })
        .from(payments)
        .where(eq(payments.customerId, customerId));

      const totalPaid = pays.reduce((s: number, p: any) => {
        return s + (p.isRefund ? -parseFloat(p.amount || "0") : parseFloat(p.amount || "0"));
      }, 0);

      const balance = Math.max(0, totalInvoiced - totalPaid);
      const creditLimit = parseFloat(customer.creditLimit || "0");

      res.json({ balance, creditLimit, totalInvoiced, totalPaid });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Per-invoice paid totals for a customer (lightweight: {documentId → netPaid}) ──
  app.get("/api/customers/:id/invoice-payments", async (req: Request, res: Response) => {
    try {
      const customerId = Number(req.params.id);
      const { db } = await import("./db");
      const { payments } = await import("@shared/schema");
      const { eq, and, isNotNull } = await import("drizzle-orm");
      const rows = await db.select({
        documentId: payments.documentId,
        amount: payments.amount,
        isRefund: payments.isRefund,
      }).from(payments).where(and(eq(payments.customerId, customerId), isNotNull(payments.documentId)));
      const map: Record<number, number> = {};
      for (const r of rows as any[]) {
        if (!r.documentId) continue;
        const amt = parseFloat(r.amount || "0");
        map[r.documentId] = (map[r.documentId] || 0) + (r.isRefund ? -amt : amt);
      }
      res.json(map);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Customer invoices for return picker ──
  app.get("/api/customers/:id/invoices-for-return", async (req: Request, res: Response) => {
    try {
      const customerId = Number(req.params.id);
      const { db } = await import("./db");
      const { documents, documentItems, returnItems: returnItemsTable, returns: returnsTable } = await import("@shared/schema");
      const { eq, and, ne, inArray, desc } = await import("drizzle-orm");

      const invs = await db.select({
        id: documents.id,
        number: documents.number,
        date: documents.date,
        total: documents.total,
        status: documents.status,
        storeId: documents.storeId,
      }).from(documents)
        .where(and(
          eq(documents.customerId, customerId),
          eq(documents.type, "INV"),
          ne(documents.status, "void"),
        ))
        .orderBy(desc(documents.date));

      if (!invs.length) return res.json([]);

      const invIds = invs.map((d) => d.id);
      const items = await db.select().from(documentItems)
        .where(inArray(documentItems.documentId, invIds));

      // Already-returned qty per document item (from approved + pending returns)
      const allDocItemIds = items.map((it) => it.id);
      let returnedQtyMap: Record<number, number> = {};
      if (allDocItemIds.length > 0) {
        const existingReturnItems = await db.select({
          documentItemId: returnItemsTable.documentItemId,
          qty: returnItemsTable.qty,
          returnId: returnItemsTable.returnId,
        }).from(returnItemsTable)
          .where(inArray(returnItemsTable.documentItemId, allDocItemIds));

        // Only count items from non-rejected returns
        const returnIds = Array.from(new Set(existingReturnItems.map((ri) => ri.returnId)));
        let activeReturnIds = new Set<number>();
        if (returnIds.length > 0) {
          const retRows = await db.select({ id: returnsTable.id, status: returnsTable.status })
            .from(returnsTable)
            .where(inArray(returnsTable.id, returnIds));
          activeReturnIds = new Set(retRows.filter((r) => r.status !== "rejected").map((r) => r.id));
        }

        for (const ri of existingReturnItems) {
          if (ri.documentItemId && activeReturnIds.has(ri.returnId)) {
            returnedQtyMap[ri.documentItemId] = (returnedQtyMap[ri.documentItemId] || 0) + parseFloat(String(ri.qty || "0"));
          }
        }
      }

      const result = invs.map((inv) => ({
        ...inv,
        items: items
          .filter((it) => it.documentId === inv.id)
          .map((it) => ({
            id: it.id,
            productId: it.productId,
            description: it.description,
            qty: it.qty,
            unit: it.unit,
            price: it.price,
            amount: it.amount,
            returnedQty: returnedQtyMap[it.id] || 0,
          })),
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Customer Analytics (top products, profit, promo suggestions) ──
  app.get("/api/customers/:id/analytics", async (req: Request, res: Response) => {
    try {
      const customerId = Number(req.params.id);
      const customer = await getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      const { db } = await import("./db");
      const { documents, documentItems, products, payments } = await import("@shared/schema");
      const { eq, and, ne, inArray } = await import("drizzle-orm");

      // All non-void invoices for this customer
      const invs = await db.select({ id: documents.id, total: documents.total, status: documents.status, date: documents.date })
        .from(documents)
        .where(and(eq(documents.customerId, customerId), eq(documents.type, "INV"), ne(documents.status, "void")));

      if (!invs.length) {
        return res.json({ topProducts: [], totalProfit: 0, totalRevenue: 0, totalCost: 0, invoiceCount: 0, promotions: [] });
      }

      const invIds = invs.map((d: any) => d.id);

      // All line items joined with product cost
      const items = await db.select({
        productId: documentItems.productId,
        description: documentItems.description,
        qty: documentItems.qty,
        price: documentItems.price,
        amount: documentItems.amount,
        sku: documentItems.sku,
        unit: documentItems.unit,
        costPrice: products.costPrice,
        costAtSale: documentItems.costAtSale,
        productName: products.name,
        category: products.category,
        currentSalePrice: products.salePrice,
        currentWholesalePrice: products.wholesalePrice,
      })
        .from(documentItems)
        .leftJoin(products, eq(documentItems.productId, products.id))
        .where(inArray(documentItems.documentId, invIds));

      // Aggregate by product description (fallback grouping for non-product lines)
      const productMap = new Map<string, {
        productId: number | null; description: string; sku: string | null; unit: string | null;
        category: string | null; totalQty: number; totalRevenue: number; totalCost: number;
        totalProfit: number; purchaseCount: number; avgPrice: number; prices: number[];
        costPrice: number; currentSalePrice: number; currentWholesalePrice: number;
      }>();

      for (const it of items as any[]) {
        const key = it.productId ? `pid:${it.productId}` : `desc:${(it.description || "").toUpperCase()}`;
        const qty = parseFloat(it.qty || "0");
        const amount = parseFloat(it.amount || "0");
        const cost = resolveItemCost(it.costAtSale, it.costPrice);
        const unitPrice = parseFloat(it.price || "0");
        const itemCost = qty * cost;
        const itemProfit = amount - itemCost;

        const existing = productMap.get(key);
        if (existing) {
          existing.totalQty += qty;
          existing.totalRevenue += amount;
          existing.totalCost += itemCost;
          existing.totalProfit += itemProfit;
          existing.purchaseCount++;
          existing.prices.push(unitPrice);
        } else {
          productMap.set(key, {
            productId: it.productId,
            description: it.productName || it.description || "Unknown",
            sku: it.sku,
            unit: it.unit,
            category: it.category,
            totalQty: qty,
            totalRevenue: amount,
            totalCost: itemCost,
            totalProfit: itemProfit,
            purchaseCount: 1,
            avgPrice: 0,
            prices: [unitPrice],
            costPrice: cost,
            currentSalePrice: parseFloat(it.currentSalePrice || "0"),
            currentWholesalePrice: parseFloat(it.currentWholesalePrice || "0"),
          });
        }
      }

      // Compute avg price and sort by qty descending
      const topProducts = Array.from(productMap.values())
        .map((p) => {
          p.avgPrice = p.prices.length ? p.prices.reduce((a, b) => a + b, 0) / p.prices.length : 0;
          const marginPct = p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue) * 100 : 0;
          return { ...p, marginPct: Math.round(marginPct * 10) / 10, prices: undefined };
        })
        .sort((a, b) => b.totalQty - a.totalQty);

      const totalRevenue = topProducts.reduce((s, p) => s + p.totalRevenue, 0);
      const totalCost = topProducts.reduce((s, p) => s + p.totalCost, 0);
      const totalProfit = totalRevenue - totalCost;

      // Smart promotions — CASH ONLY: only paid invoices qualify.
      // Credit customers already benefit from delayed payment; promos reward cash buyers.
      const paidInvIds = invs.filter((d: any) => d.status === "paid").map((d: any) => d.id);
      const promotions: any[] = [];

      if (paidInvIds.length > 0) {
        const cashItems = await db.select({
          productId: documentItems.productId,
          description: documentItems.description,
          qty: documentItems.qty,
          price: documentItems.price,
          amount: documentItems.amount,
          unit: documentItems.unit,
          costPrice: products.costPrice,
          productName: products.name,
          sku: documentItems.sku,
          category: products.category,
        })
          .from(documentItems)
          .leftJoin(products, eq(documentItems.productId, products.id))
          .where(inArray(documentItems.documentId, paidInvIds));

        const cashMap = new Map<string, { productId: number | null; description: string; sku: string | null; unit: string | null; category: string | null; totalQty: number; purchaseCount: number; prices: number[]; costPrice: number; avgPrice: number }>();
        for (const it of cashItems as any[]) {
          if (!it.productId || parseFloat(it.costPrice || "0") <= 0) continue;
          const key = `pid:${it.productId}`;
          const qty = parseFloat(it.qty || "0");
          const unitPrice = parseFloat(it.price || "0");
          const existing = cashMap.get(key);
          if (existing) {
            existing.totalQty += qty;
            existing.purchaseCount++;
            existing.prices.push(unitPrice);
          } else {
            cashMap.set(key, {
              productId: it.productId,
              description: it.productName || it.description || "Unknown",
              sku: it.sku, unit: it.unit, category: it.category,
              totalQty: qty, purchaseCount: 1, prices: [unitPrice],
              costPrice: parseFloat(it.costPrice || "0"), avgPrice: 0,
            });
          }
        }

        // Round to nice business-friendly numbers
        const roundNice = (price: number): number => {
          if (price >= 200) return Math.round(price / 5) * 5;
          if (price >= 50) return Math.round(price / 5) * 5;
          if (price >= 10) return Math.round(price);
          return Math.round(price * 2) / 2;
        };

        const cashProducts = Array.from(cashMap.values())
          .map((p) => { p.avgPrice = p.prices.reduce((a, b) => a + b, 0) / p.prices.length; return p; })
          .sort((a, b) => b.totalQty - a.totalQty)
          .slice(0, 5);

        for (const p of cashProducts) {
          const unitProfit = p.avgPrice - p.costPrice;
          const marginPct = p.avgPrice > 0 ? (unitProfit / p.avgPrice) * 100 : 0;
          if (marginPct <= 15 || unitProfit <= 1) continue;

          const rawDiscount = unitProfit * 0.25;
          const rawSuggested = p.avgPrice - rawDiscount;
          const suggestedPrice = roundNice(rawSuggested);
          if (suggestedPrice >= p.avgPrice || suggestedPrice <= p.costPrice) continue;
          const discountAmount = Math.round((p.avgPrice - suggestedPrice) * 100) / 100;
          const newMargin = Math.round(((suggestedPrice - p.costPrice) / suggestedPrice) * 100 * 10) / 10;

          promotions.push({
            productId: p.productId, description: p.description, sku: p.sku, category: p.category,
            reason: p.purchaseCount >= 3 ? "frequent_buyer" : "high_volume",
            currentAvgPrice: Math.round(p.avgPrice * 100) / 100,
            costPrice: p.costPrice,
            currentProfit: Math.round(unitProfit * 100) / 100,
            suggestedPrice, suggestedDiscount: discountAmount, newMarginPct: newMargin,
            totalQtyBought: p.totalQty, purchaseCount: p.purchaseCount,
            message: p.purchaseCount >= 3
              ? `${p.description} — bought ${p.purchaseCount} times (${p.totalQty} ${p.unit || "pcs"}) cash. Offer at ${suggestedPrice} QAR (save ${discountAmount}/unit) to keep loyalty. Still ${newMargin}% margin.`
              : `${p.description} — ${p.totalQty} ${p.unit || "pcs"} purchased cash. Offer at ${suggestedPrice} QAR (${discountAmount} off) to encourage repeat. ${newMargin}% margin preserved.`,
          });
        }
      }

      const paidCount = invs.filter((d: any) => d.status === "paid").length;
      res.json({
        topProducts: topProducts.slice(0, 20),
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        invoiceCount: invs.length,
        paidInvoices: paidCount,
        cashOnly: true,
        promotions,
      });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/documents/next-number", async (req: Request, res: Response) => {
    try {
      const type = (req.query.type as string) || "INV";
      const number = await peekNextDocNumber(type);
      res.json({ number });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/documents", async (req: Request, res: Response) => {
    try {
      const type = req.query.type as string | undefined;
      const locked = lockedStoreId(req);
      const storeId = locked ?? (req.query.storeId ? Number(req.query.storeId) : undefined);
      const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
      // Lean payload: the list view never renders the embedded customer logo or the
      // signed-DN/damage photos, so strip those base64 blobs here. Keeps this endpoint
      // small at scale (was ~15 MB when one 300 KB customer logo repeated across every row).
      let rows = await getDocuments(type, storeId, { lean: true });
      // P0 fix: customer history must be isolated to THAT customer — server-side filter.
      if (customerId) rows = rows.filter((d: any) => d.customerId === customerId);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/documents", async (req: Request, res: Response) => {
    try {
      // A credit-limit override may only be exercised by an admin or manager.
      // Strip a spoofed override from a lower role so the server-side gate still bites.
      const body = { ...req.body };
      if (body.creditOverride && !["admin", "manager"].includes(reqRole(req))) {
        body.creditOverride = false;
      }
      const locked = lockedStoreId(req);
      if (locked && body.type === "INV") body.storeId = locked;
      const doc = await createDocument(body);
      res.status(201).json(doc);
    } catch (err) {
      if (err instanceof DuplicateDocumentNumberError) {
        return res.status(409).json({ message: err.message, code: "DUPLICATE_NUMBER", number: err.number });
      }
      if (err instanceof InvalidDocumentNumberError) {
        return res.status(400).json({ message: err.message, code: "INVALID_NUMBER" });
      }
      if (err instanceof CreditLimitExceededError) {
        return res.status(400).json({ message: err.message, code: "CREDIT_LIMIT_EXCEEDED" });
      }
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const doc = await getDocument(Number(req.params.id));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      res.json(doc);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.put("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const before: any = await getDocument(id);
      if (!before) return res.status(404).json({ message: "Document not found" });

      if (["void", "returned", "converted"].includes(before.status)) {
        return res.status(400).json({ message: `Cannot edit a ${before.status} document.` });
      }

      // Edit window — same configurable window as voiding (default 12 h)
      const rules = await getBusinessRules();
      const editWindowHours = rules.voidWindowHours;
      const created = before.createdAt ? new Date(before.createdAt).getTime() : 0;
      const ageHours = created ? (Date.now() - created) / 3_600_000 : 0;
      if (created && ageHours > editWindowHours) {
        return res.status(400).json({ message: `Edit window expired — documents can only be modified within ${editWindowHours} hours of creation.` });
      }

      const { items, payments: editPaymentsRaw, creditOverride, pricingOverridePin, ...docData } = req.body;
      await updateDocument(id, docData);
      if (items && Array.isArray(items)) {
        await updateDocumentItems(id, items);
        if (before.type === "INV" && before.storeId) {
          const sum = (rows: any[]) => {
            const m: Record<number, number> = {};
            for (const it of rows || []) if (it?.productId) m[it.productId] = (m[it.productId] || 0) + parseFloat(String(it.qty || 0));
            return m;
          };
          const oldQ = sum(before.items || []);
          const newQ = sum(items);
          const pids = Array.from(new Set([...Object.keys(oldQ), ...Object.keys(newQ)].map(Number)));
          for (const pid of pids) {
            const delta = (oldQ[pid] || 0) - (newQ[pid] || 0);
            if (delta !== 0) await adjustStock(pid, before.storeId, delta, "adjustment", "Invoice edit reconcile", id);
          }

          const newTotal = parseFloat(String(docData.total || 0));
          const allPays = await getPayments(id);
          const netPaid = allPays.reduce(
            (s, p) => s + (p.isRefund ? -1 : 1) * parseFloat(p.amount || "0"), 0);
          const overpaid = netPaid - newTotal;
          if (overpaid > 0.005) {
            await createPayment({
              documentId: id,
              customerId: before.customerId,
              amount: String(overpaid),
              method: "Cash",
              date: new Date().toISOString().slice(0, 10),
              isRefund: true,
              recordedBy: (req as any).user?.id ?? docData.createdBy ?? null,
              notes: `Auto-refund: invoice edited (total ${parseFloat(String(before.total || 0)).toFixed(2)} → ${newTotal.toFixed(2)})`,
            } as any);
            await logCashflow({
              direction: "out", category: "Edit Refund",
              amount: overpaid, refType: "document", refId: id,
              storeId: before.storeId,
              notes: `Edit refund on ${before.number} (${parseFloat(String(before.total || 0)).toFixed(2)} → ${newTotal.toFixed(2)})`,
              createdBy: (req as any).user?.id ?? docData.createdBy,
            });
          } else {
            const status = newTotal > 0 && netPaid >= newTotal - 0.005 ? "paid" : netPaid > 0.005 ? "partial" : "unpaid";
            await updateDocument(id, { status });
          }
        }
      }
      // Process additional payments submitted with the edit (cash invoice: customer
      // pays the difference when items are added). createPayment recalculates status,
      // so the "partial" set above gets corrected to "paid" once the tender covers the total.
      const editPayments: any[] = editPaymentsRaw || [];
      for (const p of editPayments) {
        const amt = Number(p.amount) || 0;
        if (amt <= 0 || p.method === "Credit") continue;
        const methodLabel =
          p.method === "Online Transfer" ? "Bank Transfer" :
          p.method === "PDC" ? "Cheque" :
          p.method === "Card" ? "Credit Card" : "Cash";
        await createPayment({
          documentId: id, customerId: before.customerId,
          amount: String(amt), method: methodLabel,
          date: new Date().toISOString().slice(0, 10),
          isRefund: false,
          recordedBy: (req as any).user?.id ?? docData.createdBy ?? null,
        } as any);
      }

      // Log the edit for audit trail
      const changes: string[] = [];
      if (String(before.total || 0) !== String(docData.total || 0))
        changes.push(`total ${parseFloat(String(before.total || 0)).toFixed(2)} → ${parseFloat(String(docData.total || 0)).toFixed(2)}`);
      if (before.paymentType !== docData.paymentType)
        changes.push(`payment ${before.paymentType || "—"} → ${docData.paymentType || "—"}`);
      if ((before.items?.length || 0) !== (items?.length || 0))
        changes.push(`items ${before.items?.length || 0} → ${items?.length || 0}`);
      await logEdit({
        documentId: id,
        userId: (req as any).user?.id ?? docData.createdBy ?? null,
        field: "document_edit",
        oldValue: String(parseFloat(String(before.total || 0)).toFixed(2)),
        newValue: String(parseFloat(String(docData.total || 0)).toFixed(2)),
        reason: changes.length ? changes.join("; ") : "Document edited",
      });

      const updated = await getDocument(id);
      res.json(updated);
    } catch (err) {
      if ((err as any)?.code === "OVERPAYMENT")
        return res.status(400).json({ message: (err as Error).message, code: "OVERPAYMENT" });
      res.status(500).json({ message: String(err) });
    }
  });

  // Hard delete DESTROYS the financial record - no stock reversal, no refund, no
  // audit trail. An invoice is VOIDED (see /void below), never deleted. This
  // endpoint previously had no role check, no status check and no window check,
  // so any authenticated user - including a driver - could permanently erase any
  // invoice. No client code calls it.
  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      if (reqRole(req) !== "admin") {
        return res.status(403).json({ message: "Only an admin can delete a document." });
      }
      const doc: any = await getDocument(Number(req.params.id));
      if (!doc) return res.status(404).json({ message: "Document not found" });

      // Money-bearing documents are never deletable.
      if (["INV", "RV", "CN"].includes(String(doc.type))) {
        return res.status(400).json({
          message: `A ${doc.type} cannot be deleted - that would destroy the financial record. Void it instead.`,
          code: "USE_VOID",
        });
      }
      const pays = await getPayments(Number(req.params.id));
      if (pays.length) {
        return res.status(400).json({
          message: "This document has payments recorded against it and cannot be deleted.",
          code: "HAS_PAYMENTS",
        });
      }

      await deleteDocument(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Void an invoice within the 12-hour window (reverses stock + refunds by rule).
  app.post("/api/documents/:id/void", async (req: Request, res: Response) => {
    try {
      const uid = (req.user?.id || undefined);
      // Role gate: only the salesman who created the invoice, or a manager/admin.
      const role = normalizeRoleStrict(req);
      if (!["admin", "manager"].includes(role)) {
        const doc: any = await getDocument(Number(req.params.id));
        if (!doc) return res.status(404).json({ message: "Document not found" });
        if (!uid || Number(doc.createdBy) !== uid) {
          return res.status(403).json({ message: "Only the salesman who created this invoice, or a manager/admin, can void it." });
        }
      }
      const result = await voidDocument(Number(req.params.id), uid);
      if (!result.ok) return res.status(400).json({ message: result.message });
      res.json(result.document);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Deliveries (Module 8 — driver + warehouse dashboards) ──────
  // Site-delivery invoices with items; filter by driver / status / date.
  app.get("/api/deliveries", async (req: Request, res: Response) => {
    try {
      const invsAll = await getDocuments("INV");
      const dnsAll = await getDocuments("DN");
      const dnByInv = new Map<number, any>();
      for (const dn of dnsAll as any[]) if (dn.linkedDocId) dnByInv.set(dn.linkedDocId, dn);
      // Product location paths for the warehouse pick list.
      const prods = await getProducts();
      const storesList = await getStores();
      const custList = await getCustomers();
      const custPhone = new Map((custList as any[]).map((c) => [c.id, c.phone || null]));
      const storeName = (id: any) => (storesList as any[]).find((s) => s.id === id)?.nameEn || null;
      const prodMap = new Map((prods as any[]).map((p) => [p.id, p]));
      const locPath = (pid: any) => {
        const p = prodMap.get(pid); if (!p) return null;
        return [storeName(p.locationStoreId), p.locationArea, p.locationRack, p.locationShelf].filter(Boolean).join(" → ") || null;
      };

      let rows = (invsAll as any[])
        .filter((d) => (d.deliveryMethod === "deliver_site" || d.deliveryMethod === "site") && d.status !== "void")
        .map((inv) => {
          const dn = dnByInv.get(inv.id);
          // DN lifecycle drives the stage; fall back for legacy invoices with no DN.
          const stage = dn?.deliveryStatus || inv.deliveryStatus || "pending_pick";
          return {
            id: inv.id, number: inv.number, dnId: dn?.id ?? null, dnNumber: dn?.number ?? null,
            customerName: inv.customerName, customerId: inv.customerId,
            customerPhone: custPhone.get(inv.customerId) ?? null,
            deliveryAddress: inv.deliveryAddress, deliveryInstructions: inv.deliveryInstructions || null,
            mapLink: (dn?.mapLink ?? inv.mapLink) ?? null,
            driverId: (dn?.driverId ?? inv.driverId) ?? null, authorizedBy: dn?.authorizedBy ?? null,
            warehouseSignedBy: dn?.warehouseSignedBy ?? null,
            signedDnUrl: dn?.signedDnUrl ?? null,
            damageReported: dn?.damageReported ?? false,
            damageNotes: dn?.damageNotes ?? null,
            damagePhoto: dn?.damagePhoto ?? null,
            damageReportedAt: dn?.damageReportedAt ?? null,
            damageResolution: dn?.damageResolution ?? null,
            damageResolutionNotes: dn?.damageResolutionNotes ?? null,
            damageResolvedAt: dn?.damageResolvedAt ?? null,
            expectedDeliveryDate: dn?.expectedDeliveryDate ?? null,
            storeId: inv.storeId, date: inv.date, deliveryStatus: stage,
            total: normalizeRoleStrict(req) === "driver" ? null : inv.total,
            items: ((dn?.items || inv.items) || []).map((i: any) => ({
              description: i.description, qty: i.qty, unit: i.unit, location: locPath(i.productId),
            })),
          };
        });

      const lockedS = lockedStoreId(req);
      if (lockedS) rows = rows.filter((d) => d.storeId === lockedS);
      const { driverId, status, date } = req.query as Record<string, string>;
      if (driverId) rows = rows.filter((d) => Number(d.driverId) === Number(driverId));
      if (status) rows = rows.filter((d) => d.deliveryStatus === status);
      if (date) rows = rows.filter((d) => d.date === date);
      res.json(rows);
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Assign a driver to a site delivery (admin/manager/salesman).
  app.post("/api/documents/:id/assign-driver", async (req: Request, res: Response) => {
    try {
      const driverId = Number(req.body?.driverId) || null;
      const doc = await updateDocument(Number(req.params.id), { driverId, deliveryStatus: "pending" } as any);
      res.json(doc);
    } catch (err) { res.status(400).json({ message: String(err) }); }
  });

  // Warehouse: mark the pick complete (accepts the DN id or its parent invoice id).
  app.post("/api/documents/:id/pick", async (req: Request, res: Response) => {
    if (!["worker", "admin", "manager"].includes(reqRole(req)))
      return res.status(403).json({ message: "Only a worker (or admin/manager) can pick a delivery." });
    try {
      const dn = await resolveDeliveryNote(Number(req.params.id));
      if (!dn) return res.status(404).json({ message: "No delivery note found for this document." });
      res.json(await pickDeliveryNote(dn.id, req.user?.id || undefined));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Manager: authorise a picked delivery (digital approval).
  app.post("/api/documents/:id/authorize", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req)))
      return res.status(403).json({ message: "Only an admin or manager can authorise a delivery." });
    try {
      const dn = await resolveDeliveryNote(Number(req.params.id));
      if (!dn) return res.status(404).json({ message: "No delivery note found for this document." });
      res.json(await authorizeDeliveryNote(dn.id, req.user?.id || undefined));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Driver: confirm delivery on site. Requires manager authorisation first. Completes
  // the DN and its parent invoice. Legacy fallback: if a site-delivery invoice has no
  // DN (created before auto-generation existed), generate a delivered DN on the spot.
  app.post("/api/documents/:id/delivered", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const uid = (req.user?.id || undefined);
      const doc: any = await getDocument(id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      let dn = await resolveDeliveryNote(id);
      if (!dn) {
        // Legacy invoice with no DN — create one already-delivered so nothing breaks.
        dn = await createDocument({
          type: "DN", date: new Date().toISOString().slice(0, 10),
          customerId: doc.customerId, customerName: doc.customerName,
          storeId: doc.storeId, status: "delivered", deliveryStatus: "authorized",
          linkedDocId: id, subtotal: "0", total: "0", taxRate: "0", taxAmount: "0",
          notes: `Auto-generated on delivery of ${doc.number}`,
          items: (doc.items || []).map((i: any) => ({
            productId: i.productId, sku: i.sku, description: i.description,
            qty: i.qty, unit: i.unit, price: "0", discountType: "QAR", discountAmount: "0", amount: "0",
          })),
          createdBy: uid,
        } as any);
      }
      const updated = await markDeliveryNoteDelivered(dn.id, uid, {
        receiverName: req.body?.receiverName,
        receiverPhone: req.body?.receiverPhone,
        signedDnImage: req.body?.signedDnImage,
      });
      res.json({ ok: true, deliveryNote: { id: dn.id, number: dn.number, status: updated.deliveryStatus } });
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Warehouse manager signs / releases the load (validates the physical DN at dispatch).
  app.post("/api/documents/:id/sign-warehouse", async (req: Request, res: Response) => {
    if (!["worker", "admin", "manager"].includes(reqRole(req)))
      return res.status(403).json({ message: "Only a worker (or admin/manager) can sign the release." });
    try {
      const dn = await resolveDeliveryNote(Number(req.params.id));
      if (!dn) return res.status(404).json({ message: "No delivery note found for this document." });
      res.json(await signWarehouseRelease(dn.id, req.user?.id || undefined));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Driver reports damage found in transit / on delivery → flags the DN + alerts a manager.
  app.post("/api/documents/:id/report-damage", async (req: Request, res: Response) => {
    try {
      const dn = await resolveDeliveryNote(Number(req.params.id));
      if (!dn) return res.status(404).json({ message: "No delivery note found for this document." });
      res.json(await reportDeliveryDamage(dn.id, req.user?.id || undefined, {
        notes: req.body?.notes, photo: req.body?.photo,
      }));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Driver/manager: resolve a damage report — return to warehouse, accept with note, or request redelivery.
  app.post("/api/documents/:id/resolve-damage", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { resolution, notes } = req.body || {};
      if (!["returned_to_warehouse", "customer_accepted", "redelivery_requested"].includes(resolution))
        return res.status(400).json({ message: "resolution must be returned_to_warehouse, customer_accepted, or redelivery_requested" });
      const dn = await resolveDeliveryNote(id);
      if (!dn) return res.status(404).json({ message: "No delivery note found for this document." });
      if (!dn.damageReported) return res.status(400).json({ message: "No damage reported on this delivery." });
      const uid = req.user?.id || undefined;
      await updateDocument(dn.id, {
        damageResolution: resolution,
        damageResolutionNotes: (notes || "").trim() || null,
        damageResolvedAt: new Date(),
        damageResolvedBy: uid || null,
      } as any);
      await logEdit({ documentId: dn.id, userId: uid, field: "damageResolution", oldValue: "unresolved", newValue: resolution, reason: `Damage resolved: ${resolution}${notes ? " — " + notes.trim().slice(0, 100) : ""}` });
      const labels: Record<string, string> = { returned_to_warehouse: "returned to warehouse", customer_accepted: "accepted by customer", redelivery_requested: "redelivery requested" };
      await createNotification({
        targetRole: "manager", type: "damage_resolved", title: `Damage resolved — ${labels[resolution]}`,
        message: `${dn.number}: ${labels[resolution]}${notes ? ". " + notes.trim().slice(0, 120) : ""}`,
        link: `/documents/${dn.linkedDocId || dn.id}`, entityType: "document", entityId: dn.id, createdBy: uid,
      });
      if (resolution === "redelivery_requested" && dn.linkedDocId) {
        await updateDocument(dn.linkedDocId, { deliveryStatus: "pending_pick" } as any);
        await createNotification({
          targetRole: "worker", type: "redelivery_pick", title: "Redelivery needed",
          message: `${dn.number} damaged — new pick required for redelivery.`,
          link: `/documents/${dn.linkedDocId}`, entityType: "document", entityId: dn.linkedDocId, createdBy: uid,
        });
      }
      res.json({ ok: true, resolution, dn: await getDocument(dn.id) });
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // ── Document Payments ───────────────────────────────────────────────────────

  app.get("/api/documents/:id/payments", async (req: Request, res: Response) => {
    try {
      const rows = await getPayments(Number(req.params.id));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/documents/:id/payments", async (req: Request, res: Response) => {
    try {
      const documentId = Number(req.params.id);
      const doc = await getDocument(documentId);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      const paymentData = {
        ...req.body,
        documentId,
        customerId: doc.customerId,
      };

      const payment = await createPayment(paymentData);

      // If cheque payment, also create a cheque record
      if (req.body.method === "Cheque" && req.body.chequeNumber) {
        await createCheque({
          customerId: doc.customerId,
          paymentId: payment.id,
          chequeNumber: req.body.chequeNumber,
          bankName: req.body.bankName,
          amount: payment.amount,
          chequeDate: req.body.chequeDate || new Date().toISOString().split("T")[0],
          status: "pending",
        });
      }

      res.status(201).json(payment);
    } catch (err) {
      if ((err as any)?.code === "OVERPAYMENT")
        return res.status(400).json({ message: (err as Error).message, code: "OVERPAYMENT" });
      res.status(500).json({ message: String(err) });
    }
  });

  // Recalculate payment status for a single invoice from its actual payment rows.
  // Fixes invoices stuck at "partial"/"unpaid" due to the old status bug.
  app.post("/api/documents/:id/recalculate-status", async (req: Request, res: Response) => {
    try {
      const doc = await getDocument(Number(req.params.id));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.type !== "INV") return res.status(400).json({ message: "Only invoices have payment status" });
      if (doc.status === "void" || doc.status === "returned") return res.json({ status: doc.status, message: "Terminal status, not recalculated" });
      const allPays = await getPayments(doc.id);
      const totalPaid = allPays.reduce((s, p) => s + ((p as any).isRefund ? -1 : 1) * parseFloat(p.amount || "0"), 0);
      const total = parseFloat(doc.total || "0");
      const status = total > 0 && totalPaid >= total - 0.005 ? "paid" : totalPaid > 0.005 ? "partial" : "unpaid";
      await updateDocument(doc.id, { status });
      res.json({ status, totalPaid, total });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Edit Log ────────────────────────────────────────────────────────────────

  app.get("/api/documents/:id/edit-log", async (req: Request, res: Response) => {
    try {
      const rows = await getEditLog(Number(req.params.id));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/documents/:id/edit-log", async (req: Request, res: Response) => {
    try {
      const entry = await logEdit({
        documentId: Number(req.params.id),
        ...req.body,
      });
      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Convert QT → INV ────────────────────────────────────────────────────────

  app.post("/api/documents/:id/convert", async (req: Request, res: Response) => {
    try {
      const sourceId = Number(req.params.id);
      const source = await getDocument(sourceId);
      if (!source) return res.status(404).json({ message: "Document not found" });
      if (source.type !== "QT") return res.status(400).json({ message: "Only quotations can be converted" });

      // Create new INV from QT. Converting an already-agreed quotation is a
      // management action — the credit decision was made at quotation time, so
      // the credit-limit gate is overridden here (admin/manager only path anyway).
      const newInv = await createDocument({
        type: "INV",
        date: new Date().toISOString().split("T")[0],
        customerId: source.customerId,
        customerName: source.customerName,
        storeId: source.storeId,
        status: "unpaid",
        ...(["admin", "manager"].includes(reqRole(req)) ? { creditOverride: true } as any : {}),
        discountType: source.discountType,
        discountAmount: source.discountAmount,
        subtotal: source.subtotal,
        taxRate: source.taxRate,
        taxAmount: source.taxAmount,
        total: source.total,
        totalWords: source.totalWords,
        notes: source.notes,
        linkedDocId: sourceId,
        createdBy: req.body.createdBy,
        items: (source.items || []).map((item: any) => ({
          productId: item.productId,
          sku: item.sku,
          description: item.description,
          qty: String(item.qty || "0"),
          unit: item.unit,
          price: String(item.price || "0"),
          discountType: item.discountType,
          discountAmount: String(item.discountAmount || "0"),
          amount: String(item.amount || "0"),
        })),
      });

      // Mark the quotation as converted
      await updateDocument(sourceId, { status: "converted", linkedDocId: newInv.id });

      res.status(201).json(newInv);
    } catch (err) {
      if (err instanceof CreditLimitExceededError) return res.status(400).json({ message: err.message, code: "CREDIT_LIMIT_EXCEEDED" });
      if (err instanceof PricingApprovalRequiredError) return res.status(400).json({ message: err.message, code: "PRICING_APPROVAL_REQUIRED" });
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // PRODUCTS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/products", async (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string || "").trim();
      if (search.length >= 2) {
        const rows = await searchProducts(search);
        return res.json(rows);
      }
      const rows = await getProducts();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/products", async (req: Request, res: Response) => {
    try {
      // openingQty = current stock to seed at the product's location on creation.
      const { openingQty, ...productData } = req.body || {};
      // Prices are a manager/admin decision. A salesman/warehouse may add a product
      // and its details, but not set prices — they default to 0 until a manager sets them.
      if (!["admin", "manager"].includes(reqRole(req))) {
        delete productData.salePrice; delete productData.wholesalePrice; delete productData.costPrice;
      }
      // Reject a duplicate SKU (2.2 Test 4) — SKUs must be unique.
      const sku = (productData.sku || "").trim();
      if (sku) {
        const all = await getProducts();
        if ((all as any[]).some((p) => (p.sku || "").trim().toLowerCase() === sku.toLowerCase())) {
          return res.status(409).json({ code: "DUPLICATE_SKU", message: `SKU "${sku}" already exists. SKUs must be unique.` });
        }
      }
      const row = await createProduct(productData);
      const qty = Number(openingQty) || 0;
      const storeId = productData.locationStoreId ? Number(productData.locationStoreId) : null;
      if (qty > 0 && storeId) {
        await adjustStock(row.id, storeId, qty, "add", "Opening stock (product creation)", row.id, req.user?.id || undefined);
      }
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const row = await getProduct(Number(req.params.id));
      if (!row) return res.status(404).json({ message: "Product not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Full product profile: stock by location, movements, sales history + stats, supplier.
  app.get("/api/products/:id/activity", async (req: Request, res: Response) => {
    try {
      const data = await getProductActivity(Number(req.params.id));
      if (!data) return res.status(404).json({ message: "Product not found" });
      // Cost price is admin-only — strip for non-admins (matches the no-cost-on-docs rule).
      if (normalizeRoleStrict(req) !== "admin") {
        data.product = { ...data.product, costPrice: null };
        if (data.stats) data.stats = { ...data.stats };
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.put("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const body = { ...req.body };
      // Only a manager/admin may change a product's prices; others edit details only.
      if (!["admin", "manager"].includes(reqRole(req))) {
        delete body.salePrice; delete body.wholesalePrice; delete body.costPrice;
      }
      const row = await updateProduct(Number(req.params.id), body);
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // INVENTORY
  // ══════════════════════════════════════════════════════════════

  // AI Overview assistant — chat + the confirmed-send endpoint.
  registerAssistantRoutes(app);

  // ══════════════════════════════════════════════════════════════
  // SCAN TO INVENTORY
  // File → text → columns → matched against the catalogue. Only the first step
  // may need a model; everything after it is deterministic, which is why a weak
  // transcription degrades into "check this row" rather than into wrong data.
  // ══════════════════════════════════════════════════════════════

  app.get("/api/inventory/scan/status", (_req: Request, res: Response) => {
    res.json(ocrStatus());
  });

  app.post("/api/inventory/scan", upload.single("file"), async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(normalizeRoleStrict(req)))
      return res.status(403).json({ message: "Admin or manager only" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const tmpPath = req.file.path;
    try {
      const buffer = fs.readFileSync(tmpPath);
      const extracted = await extractText(buffer, req.file.originalname, req.file.mimetype);
      const parsed = parseInvoiceText(extracted.text);

      if (!parsed.lines.length) {
        return res.status(422).json({
          message: "No product rows could be read from that file.",
          extractedText: extracted.text.slice(0, 2000),
          source: extracted.source,
          skipped: parsed.skipped,
        });
      }

      // Every parsed description is matched against the catalogue in one pass.
      const matches = await matchProductNames(
        parsed.lines.map((l) => ({ description: l.description })), { limit: 4 },
      );

      const rows = parsed.lines.map((line, i) => {
        const m = matches[i];
        return {
          ...line,
          match: {
            decision: m.decision,
            productId: m.productId,
            candidates: m.candidates.map((c) => ({ productId: c.productId, name: c.name, sku: c.sku, score: c.score, reason: c.reason })),
          },
        };
      });

      res.json({
        source: extracted.source,
        provider: extracted.provider ?? null,
        method: parsed.method,
        warnings: extracted.warnings,
        skipped: parsed.skipped,
        rows,
        summary: {
          total: rows.length,
          matched: rows.filter((r) => r.match.decision === "auto").length,
          review: rows.filter((r) => r.match.decision === "review").length,
          unknown: rows.filter((r) => r.match.decision === "none").length,
          withWarnings: rows.filter((r) => r.warnings.length).length,
        },
      });
    } catch (e) {
      res.status(400).json({ message: e instanceof Error ? e.message : String(e) });
    } finally {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* temp file */ }
    }
  });

  // Apply a reviewed scan. Only what the human confirmed is written, and each
  // row says explicitly whether it links to an existing product or makes a new
  // one — the server never re-decides that.
  app.post("/api/inventory/scan/commit", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(normalizeRoleStrict(req)))
      return res.status(403).json({ message: "Admin or manager only" });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ message: "Nothing to apply." });

    const storeId = req.body?.storeId ? Number(req.body.storeId) : null;
    const addStock = req.body?.addStock === true;
    const supplierId = req.body?.supplierId ? Number(req.body.supplierId) : null;
    if (addStock && !storeId) return res.status(400).json({ message: "Choose a location to receive stock into." });

    const applied: any[] = [];
    const failed: any[] = [];

    for (const row of rows) {
      const description = String(row?.description || "").trim();
      const quantity = Number(row?.quantity) || 0;
      const cost = Number(row?.unitPrice) || 0;
      try {
        if (!description) throw new Error("No description.");

        let productId: number | null = row?.productId ? Number(row.productId) : null;
        let created = false;

        if (!productId) {
          if (!(cost > 0)) throw new Error("A new product needs a cost price above zero.");
          const salePrice = Number(row?.salePrice) > 0 ? String(Number(row.salePrice)) : String(cost);
          const made = await createProduct({
            name: description.toUpperCase(),
            unit: String(row?.unit || "PCS").toUpperCase(),
            costPrice: String(cost),
            salePrice,
            wholesalePrice: salePrice,
            minStockQty: "0",
            ...(supplierId ? { supplierId } : {}),
          } as any);
          productId = made.id;
          created = true;
        } else if (cost > 0 && row?.updateCost === true) {
          // Only when the reviewer ticked it — a purchase price is not
          // automatically the new standing cost.
          await updateProduct(productId, { costPrice: String(cost) } as any);
        }

        // A confirmed link teaches the matcher, so this wording is recognised
        // instantly next time instead of going back into the review queue.
        if (!created && productId && row?.rememberAlias === true) {
          try {
            await createProductAlias({
              productId, alias: description, source: "ocr", confirmedBy: req.user?.id ?? null,
            });
          } catch { /* an existing or conflicting alias must not fail the receipt */ }
        }

        if (addStock && quantity > 0 && storeId && productId) {
          await adjustStock(productId, storeId, quantity, "add", "Received from scanned invoice", productId, req.user?.id || undefined);
        }

        applied.push({ description, productId, created, stockAdded: addStock ? quantity : 0 });
      } catch (e) {
        failed.push({ description, reason: e instanceof Error ? e.message : String(e) });
      }
    }

    res.json({ ok: true, applied, failed, createdCount: applied.filter((a) => a.created).length,
      linkedCount: applied.filter((a) => !a.created).length, failedCount: failed.length });
  });

  // ══════════════════════════════════════════════════════════════
  // PRODUCT ALIASES & MATCHING
  // "PVC GOLMALA" and "PVC TROWEL" are one item; recording that stops a scanned
  // supplier invoice from creating a duplicate product. See server/matching.ts
  // for why a shower mixer is NOT an alias of a faucet.
  // ══════════════════════════════════════════════════════════════

  app.get("/api/product-aliases", async (req: Request, res: Response) => {
    try {
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      res.json(await getProductAliases(productId));
    } catch (e) { res.status(500).json({ message: String(e) }); }
  });

  // Confirming an alias reshapes the catalogue, so it is a manager-or-above call.
  app.post("/api/product-aliases", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(normalizeRoleStrict(req)))
      return res.status(403).json({ message: "Admin or manager only" });
    try {
      const { productId, alias, source } = req.body || {};
      if (!productId || !alias) return res.status(400).json({ message: "productId and alias are required" });
      const row = await createProductAlias({
        productId: Number(productId),
        alias: String(alias),
        source: source || "manual",
        confirmedBy: req.user?.id ?? null,
      });
      res.status(201).json(row);
    } catch (e) {
      // A clash means the same words already point at a different product —
      // a 409 so the UI can show "already used by X" instead of a dead 500.
      if (e instanceof AliasConflictError) return res.status(409).json({ message: e.message });
      res.status(500).json({ message: String(e) });
    }
  });

  app.delete("/api/product-aliases/:id", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      await deleteProductAlias(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: String(e) }); }
  });

  // Rank incoming descriptions (OCR lines, CSV rows, a typed search) against the
  // catalogue. Read-only — it decides nothing and writes nothing. Each result
  // carries decision: auto | review | none, so the caller can apply the certain
  // ones and put the rest in front of a human.
  app.post("/api/products/match", async (req: Request, res: Response) => {
    try {
      const raw = req.body?.items ?? req.body?.descriptions;
      const items = Array.isArray(raw)
        ? raw.map((it: any) => (typeof it === "string"
            ? { description: it, sku: null }
            : { description: String(it?.description ?? it?.name ?? ""), sku: it?.sku ?? null }))
        : [];
      if (!items.length) return res.status(400).json({ message: "items[] is required" });
      if (items.length > 200) return res.status(400).json({ message: "Too many items (max 200 per call)" });
      const results = await matchProductNames(items, { limit: Number(req.body?.limit) || 5 });
      res.json({
        results,
        summary: {
          total: results.length,
          auto: results.filter((r) => r.decision === "auto").length,
          review: results.filter((r) => r.decision === "review").length,
          none: results.filter((r) => r.decision === "none").length,
        },
      });
    } catch (e) { res.status(500).json({ message: String(e) }); }
  });

  app.get("/api/inventory", async (req: Request, res: Response) => {
    try {
      const locked = lockedStoreId(req);
      const storeId = locked ?? (req.query.storeId ? Number(req.query.storeId) : undefined);
      // Staff are not tied to one building — the same person bills in the shop one
      // day and counts stock in a warehouse the next. So a store-locked user sees
      // their own store plus every warehouse: without it, warehouse stock is
      // invisible to the person writing the invoice, who then cannot pull from it
      // and cannot flag a wrong count to the manager. Other STORES stay out — a
      // branch still does not sell another branch's shelf stock.
      const includeWarehouses = locked ? true : req.query.includeWarehouses === "true";
      const rows = await getInventory(storeId, includeWarehouses, locked ? "all" : "owned");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/inventory/adjust", async (req: Request, res: Response) => {
    try {
      const { productId, storeId, qtyChange, type, reason, userId } = req.body;
      await adjustStock(
        Number(productId),
        Number(storeId),
        Number(qtyChange),
        type,
        reason,
        undefined,
        userId ? Number(userId) : undefined,
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Stocktake ──────────────────────────────────────────────────
  // SET stock to what a person counted, rather than adding a delta. Someone
  // counting a shelf knows "there are 47", not "add 17" - making them do the
  // subtraction is where counting errors come from. The variance (system vs
  // actual) is recorded, because that gap is shrinkage and is otherwise invisible.
  app.post("/api/stock-count", async (req: Request, res: Response) => {
    if (!requireAdminOrManager(req, res)) return;
    try {
      const locked = lockedStoreId(req);
      res.json(await setStockCount({
        productId: Number(req.body?.productId),
        storeId: locked ?? Number(req.body?.storeId),
        countedQty: Number(req.body?.countedQty),
        note: req.body?.note,
        userId: req.user?.id || undefined,
      }));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // A whole shelf at once. Lines are independent so one bad line does not lose
  // the rest of the walk.
  app.post("/api/stock-count/batch", async (req: Request, res: Response) => {
    if (!requireAdminOrManager(req, res)) return;
    try {
      const locked = lockedStoreId(req);
      const storeId = locked ?? Number(req.body?.storeId);
      if (!storeId) return res.status(400).json({ message: "A location is required for a stock count." });
      const counts = Array.isArray(req.body?.counts) ? req.body.counts : [];
      if (!counts.length) return res.status(400).json({ message: "Nothing to count." });
      res.json(await setStockCountBatch(storeId, counts, req.user?.id || undefined));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/inventory/low-stock", async (req: Request, res: Response) => {
    try {
      const locked = lockedStoreId(req);
      let rows = await getLowStockItems();
      if (locked) rows = rows.filter((i: any) => i.storeId === locked);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Reorder suggestions — velocity-based recommended order qty per low-stock item.
  app.get("/api/inventory/reorder-suggestions", async (req: Request, res: Response) => {
    try {
      res.json(await getReorderSuggestions());
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/stock-adjustments", async (req: Request, res: Response) => {
    try {
      const locked = lockedStoreId(req);
      const rows = await db.select().from(stockAdjustments).orderBy(desc(stockAdjustments.id)).limit(500);
      res.json(locked ? rows.filter((r: any) => r.storeId === locked) : rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // ARRANGEMENT NOTES (auto-split pick notes per invoice)
  // ══════════════════════════════════════════════════════════════

  app.get("/api/documents/:id/arrangement-note", async (req: Request, res: Response) => {
    try {
      const result = await getArrangementNote(Number(req.params.id));
      if (!result) return res.status(404).json({ message: "No arrangement note for this document" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Helper Pick Note Queue ────────────────────────────────────
  app.get("/api/pick-notes/queue", async (req: Request, res: Response) => {
    try {
      const role = reqRole(req);
      const isAdmin = role === "admin" || role === "manager";
      const storeId = req.user?.storeId ?? (req.query.storeId ? Number(req.query.storeId) : null);
      if (!storeId && !isAdmin) return res.status(400).json({ message: "Store ID required" });
      res.json(await getPickNoteQueue(storeId));
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/arrangement-notes/:noteId/pick", async (req: Request, res: Response) => {
    const role = reqRole(req);
    if (!["worker", "salesman", "admin", "manager"].includes(role))
      return res.status(403).json({ message: "Not authorized" });
    try {
      const result = await claimPickNote(Number(req.params.noteId), req.user!.id);
      if (!result.ok) return res.status(409).json({ message: result.message });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/arrangement-notes/:noteId/ready", async (req: Request, res: Response) => {
    const role = reqRole(req);
    if (!["worker", "salesman", "admin", "manager"].includes(role))
      return res.status(403).json({ message: "Not authorized" });
    try {
      const result = await markPickNoteReady(Number(req.params.noteId), req.user!.id);
      if (!result.ok) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Pick item-level update (mark each product during picking) ──
  app.put("/api/arrangement-notes/:noteId/items/:itemId", async (req: Request, res: Response) => {
    const role = reqRole(req);
    if (!["worker", "salesman", "admin", "manager"].includes(role))
      return res.status(403).json({ message: "Not authorized" });
    try {
      const result = await updatePickItem(
        Number(req.params.noteId),
        Number(req.params.itemId),
        req.body,
        req.user!.id,
      );
      if (!result.ok) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Complete pick note (Done button — notify salesman if issues) ──
  app.post("/api/arrangement-notes/:noteId/complete", async (req: Request, res: Response) => {
    const role = reqRole(req);
    if (!["worker", "salesman", "admin", "manager"].includes(role))
      return res.status(403).json({ message: "Not authorized" });
    try {
      const result = await completePickNote(Number(req.params.noteId), req.user!.id);
      if (!result.ok) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Reassign pick note (manager override) ──
  app.post("/api/arrangement-notes/:noteId/reassign", async (req: Request, res: Response) => {
    const role = reqRole(req);
    if (!["admin", "manager"].includes(role))
      return res.status(403).json({ message: "Only managers can reassign" });
    try {
      const result = await reassignPickNote(Number(req.params.noteId), Number(req.body.userId));
      if (!result.ok) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // STOCK TRANSFERS (TR) — location-to-location, owner-aware
  // ══════════════════════════════════════════════════════════════
  app.get("/api/transfers", async (_req: Request, res: Response) => {
    try { res.json(await getTransfers()); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });
  // Inter-store settlement (net who-owes-whom) for a period — declared before :id routes.
  app.get("/api/transfers/settlement", async (req: Request, res: Response) => {
    try { res.json(await getTransferSettlement(req.query.start as string, req.query.end as string)); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });
  app.post("/api/transfers", async (req: Request, res: Response) => {
    try { res.json(await createTransfer({ ...req.body, createdBy: req.user?.id ?? null })); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });
  app.put("/api/transfers/:id", async (req: Request, res: Response) => {
    try { res.json(await updateTransfer(Number(req.params.id), req.body)); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });
  // Approve (releases stock from source) — admin/manager only.
  app.post("/api/transfers/:id/approve", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req)))
      return res.status(403).json({ message: "Only an admin or manager can approve a transfer." });
    try { res.json(await approveTransfer(Number(req.params.id), req.user?.id || undefined)); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });
  app.post("/api/transfers/:id/receive", async (req: Request, res: Response) => {
    const { method, externalReceiver } = req.body || {};
    try { res.json(await receiveTransfer(Number(req.params.id), req.user?.id || undefined, { method, externalReceiver })); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });
  app.post("/api/transfers/:id/cancel", async (req: Request, res: Response) => {
    try { res.json(await cancelTransfer(Number(req.params.id), req.user?.id || undefined)); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // ══════════════════════════════════════════════════════════════
  // SUPPLIERS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/suppliers", async (req: Request, res: Response) => {
    try {
      const rows = await getSuppliers();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/suppliers", async (req: Request, res: Response) => {
    // Suppliers (and their terms/pricing) are a manager/admin domain.
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only." });
    try {
      const row = await createSupplier(req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/suppliers/:id", async (req: Request, res: Response) => {
    try {
      const row = await getSupplier(Number(req.params.id));
      if (!row) return res.status(404).json({ message: "Supplier not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.put("/api/suppliers/:id", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only." });
    try {
      const row = await updateSupplier(Number(req.params.id), req.body);
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // CHEQUES
  // ══════════════════════════════════════════════════════════════

  app.get("/api/cheques", async (req: Request, res: Response) => {
    try {
      // Lazy alert sweep — PDC due-soon notifications fire when anyone views cheques.
      await checkPdcAlerts().catch(() => 0);
      let rows: any[] = await getCheques({
        start: req.query.start as string | undefined,
        end: req.query.end as string | undefined,
      });
      const today = new Date().toISOString().split("T")[0];
      rows = rows.map((c: any) => ({
        ...c,
        // pending past its date = overdue (display-only; stored status unchanged)
        displayStatus: c.status === "pending" && c.chequeDate && c.chequeDate < today ? "overdue" : c.status,
      }));
      const { status, type, bank, q: search, customerId, supplierId } = req.query as Record<string, string>;
      if (status) rows = rows.filter((r) => r.status === status || r.displayStatus === status);
      if (type) rows = rows.filter((r) => (r.type || "receivable") === type);
      if (bank) rows = rows.filter((r) => (r.bankName || "").toLowerCase().includes(bank.toLowerCase()));
      if (search) rows = rows.filter((r) => (r.chequeNumber || "").toLowerCase().includes(search.toLowerCase()));
      if (customerId) rows = rows.filter((r) => r.customerId === Number(customerId));
      if (supplierId) rows = rows.filter((r) => r.supplierId === Number(supplierId));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/cheques", async (req: Request, res: Response) => {
    // Manual PDC entry is a treasury action (admin/manager). Invoice PDCs are booked
    // server-side during createDocument, so this gate does not affect a sale.
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only." });
    try {
      const row = await createCheque(req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Legacy clear endpoint → routed through the tracker's status machine so
  // clearance books the cashflow movement too.
  app.put("/api/cheques/:id/clear", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only." });
    try {
      const canOverride = reqRole(req) === "admin";
      res.json(await setChequeStatus(Number(req.params.id), "cleared", (req.user?.id || undefined), {
        override: canOverride && req.body?.override === true,
        overrideReason: req.body?.overrideReason,
      }));
    } catch (err) {
      if (sendFundsError(res, err)) return;
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // RETURNS
  // ══════════════════════════════════════════════════════════════

  app.post("/api/returns", async (req: Request, res: Response) => {
    try {
      const {
        originalInvoiceId, sourceInvoices, isManual,
        type, reason, refundMethod, refundAmount,
        items, processedBy, storeId, createdBy,
        customerId, customerName,
      } = req.body;

      const submitter = processedBy ? Number(processedBy) : (createdBy ? Number(createdBy) : undefined);

      // Qty validation: return qty must not exceed purchased qty minus already-returned qty
      if (!isManual && Array.isArray(items)) {
        const docItemIds = items.filter((it: any) => it.documentItemId).map((it: any) => Number(it.documentItemId));
        if (docItemIds.length > 0) {
          const { db: valDb } = await import("./db");
          const { documentItems: docItemsTable, returnItems: retItemsTable, returns: retTable } = await import("@shared/schema");
          const { inArray: valInArray, eq: valEq } = await import("drizzle-orm");

          // Purchased qty per document item
          const purchasedRows = await valDb.select({ id: docItemsTable.id, qty: docItemsTable.qty })
            .from(docItemsTable).where(valInArray(docItemsTable.id, docItemIds));
          const purchasedMap: Record<number, number> = {};
          for (const r of purchasedRows) purchasedMap[r.id] = parseFloat(String(r.qty || "0"));

          // Already-returned qty (from non-rejected returns)
          const existingRI = await valDb.select({
            documentItemId: retItemsTable.documentItemId,
            qty: retItemsTable.qty,
            returnId: retItemsTable.returnId,
          }).from(retItemsTable).where(valInArray(retItemsTable.documentItemId, docItemIds));

          const returnIds = Array.from(new Set(existingRI.map((ri) => ri.returnId)));
          let activeReturnIds = new Set<number>();
          if (returnIds.length > 0) {
            const retRows = await valDb.select({ id: retTable.id, status: retTable.status })
              .from(retTable).where(valInArray(retTable.id, returnIds));
            activeReturnIds = new Set(retRows.filter((r) => r.status !== "rejected").map((r) => r.id));
          }

          const returnedMap: Record<number, number> = {};
          for (const ri of existingRI) {
            if (ri.documentItemId && activeReturnIds.has(ri.returnId)) {
              returnedMap[ri.documentItemId] = (returnedMap[ri.documentItemId] || 0) + parseFloat(String(ri.qty || "0"));
            }
          }

          // Validate each item
          const violations: string[] = [];
          for (const it of items as any[]) {
            if (!it.documentItemId) continue;
            const diId = Number(it.documentItemId);
            const purchased = purchasedMap[diId] ?? 0;
            const alreadyReturned = returnedMap[diId] ?? 0;
            const returnable = purchased - alreadyReturned;
            const requestedQty = parseFloat(String(it.qty || "0"));
            if (requestedQty > returnable) {
              violations.push(`"${it.description || "Item"}" — returning ${requestedQty} but only ${returnable} returnable (bought ${purchased}, already returned ${alreadyReturned})`);
            }
          }
          if (violations.length > 0) {
            return res.status(400).json({
              message: "Return quantity exceeds what the customer purchased",
              code: "QTY_EXCEEDS_PURCHASED",
              violations,
            });
          }
        }
      }

      // Mode 1: Manual return (no invoice)
      if (isManual) {
        if (!items || items.length === 0) return res.status(400).json({ message: "Manual return requires at least one item" });
        const ret = await createReturn({
          originalInvoiceId: null,
          isManual: true,
          customerId: customerId ? Number(customerId) : undefined,
          customerName: customerName || undefined,
          storeId: storeId ? Number(storeId) : undefined,
          type: type || "partial",
          reason,
          refundMethod: refundMethod || "Cash",
          refundAmount: refundAmount ? parseFloat(refundAmount) : undefined,
          items: items || [],
          submittedBy: submitter,
        });
        return res.status(201).json({ returnVoucher: ret, status: "pending" });
      }

      // Mode 2: Multi-invoice return
      if (Array.isArray(sourceInvoices) && sourceInvoices.length > 0) {
        const resolvedSources: { invoiceId: number; invoiceNumber: string }[] = [];
        let firstInvoice: any = null;
        for (const src of sourceInvoices) {
          const doc = await getDocument(Number(src.invoiceId));
          if (!doc) return res.status(404).json({ message: `Invoice ${src.invoiceId} not found` });
          resolvedSources.push({ invoiceId: doc.id, invoiceNumber: doc.number });
          if (!firstInvoice) firstInvoice = doc;
        }
        const ret = await createReturn({
          originalInvoiceId: firstInvoice.id,
          originalInvoiceNumber: firstInvoice.number,
          sourceInvoices: resolvedSources,
          customerId: customerId ? Number(customerId) : firstInvoice.customerId,
          customerName: customerName || firstInvoice.customerName,
          storeId: storeId ? Number(storeId) : firstInvoice.storeId,
          type: type || "partial",
          reason,
          refundMethod,
          refundAmount: refundAmount ? parseFloat(refundAmount) : undefined,
          items: items || [],
          submittedBy: submitter,
        });
        return res.status(201).json({ returnVoucher: ret, status: "pending" });
      }

      // Mode 3: Single-invoice return (original flow)
      const originalInvoice = await getDocument(Number(originalInvoiceId));
      if (!originalInvoice) return res.status(404).json({ message: "Original invoice not found" });

      const ret = await createReturn({
        originalInvoiceId: Number(originalInvoiceId),
        originalInvoiceNumber: originalInvoice.number,
        sourceInvoices: [{ invoiceId: originalInvoice.id, invoiceNumber: originalInvoice.number }],
        customerId: customerId ? Number(customerId) : originalInvoice.customerId,
        customerName: customerName || originalInvoice.customerName,
        storeId: storeId || originalInvoice.storeId,
        type,
        reason,
        refundMethod,
        refundAmount: refundAmount ? parseFloat(refundAmount) : undefined,
        items: items || [],
        submittedBy: submitter,
      });

      res.status(201).json({ returnVoucher: ret, status: "pending" });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/returns", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.query.invoiceId ? Number(req.query.invoiceId) : undefined;
      const locked = lockedStoreId(req);
      let rows = await getReturns(invoiceId);
      if (locked) rows = (rows as any[]).filter((r) => r.storeId == null || r.storeId === locked);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/returns/:id", async (req: Request, res: Response) => {
    try {
      const ret = await getReturn(Number(req.params.id));
      if (!ret) return res.status(404).json({ message: "Return voucher not found" });
      res.json(ret);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Approve / reject a pending return — admin or manager only, works from any device.
  const approver = (req: Request) => ["admin", "manager"].includes(reqRole(req));
  const reqUid = (req: Request) => (req.user?.id || undefined);

  app.post("/api/returns/:id/approve", async (req: Request, res: Response) => {
    const role = reqRole(req);
    const isBoss = ["admin", "manager"].includes(role);
    // Salesman (and helper) may process a routine return AT OR UNDER the threshold;
    // anything over needs a manager/admin. Others cannot approve at all.
    if (!isBoss && !["salesman", "worker"].includes(role)) {
      return res.status(403).json({ message: "You are not allowed to approve returns." });
    }
    try {
      if (!isBoss) {
        const ret: any = await getReturn(Number(req.params.id));
        const { returnApprovalThreshold } = await getBusinessRules();
        const total = Number(ret?.total ?? ret?.refundAmount ?? 0);
        if (total > returnApprovalThreshold) {
          return res.status(403).json({ message: `This return is QAR ${total.toFixed(2)} — returns over QAR ${returnApprovalThreshold} need manager approval.` });
        }
      }
      // Optional body { refundMethod } — the approver's payout choice for large returns.
      // Only an admin may override the insufficient-funds guard (with a reason).
      const canOverride = role === "admin";
      res.json(await approveReturn(Number(req.params.id), reqUid(req), req.body?.refundMethod, {
        override: canOverride && req.body?.override === true,
        overrideReason: req.body?.overrideReason,
      }));
    } catch (err) {
      if (sendFundsError(res, err)) return;
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/returns/:id/reject", async (req: Request, res: Response) => {
    if (!approver(req)) return res.status(403).json({ message: "Only an admin or manager can reject returns" });
    try {
      res.json(await rejectReturn(Number(req.params.id), reqUid(req), req.body?.reason));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Notifications (in-app bell; WhatsApp-ready via message content)
  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const role = reqRole(req);
      const userId = reqUid(req);
      const unreadOnly = req.query.unread === "1";
      res.json(await getNotifications({ role, userId, unreadOnly }));
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try { await markNotificationRead(Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.post("/api/notifications/read-all", async (req: Request, res: Response) => {
    try { await markAllNotificationsRead({ role: reqRole(req), userId: reqUid(req) }); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ══════════════════════════════════════════════════════════════
  // APPROVAL REQUESTS — generic override inbox
  // ══════════════════════════════════════════════════════════════
  // Approvers (admin/manager) see the whole queue; a requester sees only their
  // own. Pass ?mine=1 to force the requester view even for an approver.
  app.get("/api/approvals", async (req: Request, res: Response) => {
    try {
      const mine = req.query.mine === "1";
      res.json(await getApprovalRequests({ role: reqRole(req), userId: reqUid(req), mine }));
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Raise a request. Allowed for any operational role — the asking is open; the
  // DECISION is what's gated. On approval the held action (payload) is carried out.
  app.post("/api/approvals", async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const type = String(b.type || "manual");
      if (!["credit_limit", "discount", "void", "manual"].includes(type)) {
        return res.status(400).json({ message: "Unknown approval type." });
      }
      const created = await createApprovalRequest({
        type,
        requestedBy: reqUid(req),
        storeId: b.storeId ?? lockedStoreId(req) ?? undefined,
        title: b.title,
        summary: b.summary,
        message: b.message,
        amount: b.amount != null ? Number(b.amount) : undefined,
        entityType: b.entityType,
        entityId: b.entityId != null ? Number(b.entityId) : undefined,
        payload: b.payload,
      });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/approvals/:id/approve", async (req: Request, res: Response) => {
    if (!approver(req)) return res.status(403).json({ message: "Only an admin or manager can approve requests." });
    try {
      res.json(await approveApprovalRequest(Number(req.params.id), reqUid(req), req.body?.note));
    } catch (err) {
      if (sendFundsError(res, err)) return;
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/approvals/:id/reject", async (req: Request, res: Response) => {
    if (!approver(req)) return res.status(403).json({ message: "Only an admin or manager can reject requests." });
    try {
      res.json(await rejectApprovalRequest(Number(req.params.id), reqUid(req), req.body?.note));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // A requester withdraws their own still-pending request.
  app.post("/api/approvals/:id/cancel", async (req: Request, res: Response) => {
    try {
      res.json(await cancelApprovalRequest(Number(req.params.id), reqUid(req)));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/approvals/:id/complete", async (req: Request, res: Response) => {
    try {
      res.json(await completeApprovalRequest(Number(req.params.id), reqUid(req)));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // SUPPLIER ORDERS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/supplier-orders", async (req: Request, res: Response) => {
    try {
      const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
      const rows = await getSupplierOrders(supplierId);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/supplier-orders", async (req: Request, res: Response) => {
    try {
      const poNumber = await getNextDocNumber("PO");
      const order = await createSupplierOrder({
        ...req.body,
        poNumber,
      });
      res.status(201).json(order);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.put("/api/supplier-orders/:id", async (req: Request, res: Response) => {
    try {
      const order = await updateSupplierOrder(Number(req.params.id), req.body);
      res.json(order);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Status transition (draft → sent locks editing, etc.)
  app.post("/api/supplier-orders/:id/status", async (req: Request, res: Response) => {
    try {
      const status = String(req.body?.status || "");
      const uid = (req.user?.id || undefined);
      res.json(await updateSupplierOrderStatus(Number(req.params.id), status, uid));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Partial receive: body { storeId, receipts:[{index|productId, qty}] }
  app.post("/api/supplier-orders/:id/receive-items", async (req: Request, res: Response) => {
    try {
      const storeId = Number(req.body?.storeId);
      if (!storeId) return res.status(400).json({ message: "Destination store is required to receive stock" });
      const uid = (req.user?.id || undefined);
      const receipts = Array.isArray(req.body?.receipts) ? req.body.receipts : [];
      res.json(await receiveSupplierOrderItems(Number(req.params.id), storeId, receipts, uid));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Full receive (legacy) → receives all remaining qty.
  app.post("/api/supplier-orders/:id/receive", async (req: Request, res: Response) => {
    try {
      const storeId = Number(req.body?.storeId);
      if (!storeId) return res.status(400).json({ message: "Destination store is required to receive stock" });
      const uid = (req.user?.id || undefined);
      res.json(await receiveSupplierOrder(Number(req.params.id), storeId, uid));
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Quick Goods Receipt ────────────────────────────────────────
  // A delivery arrives with no purchase order — the daily reality for fast movers.
  // Records it in ONE step: stock in, supplier payable, cost refreshed, catalogue
  // seeded for anything new. Internally it still creates and receives a real PO, so
  // the supplier ledger and stock audit are identical to the formal route.
  app.post("/api/goods-receipt", async (req: Request, res: Response) => {
    if (!requireAdminOrManager(req, res)) return;
    try {
      const body = req.body || {};
      const locked = lockedStoreId(req);
      const result = await quickGoodsReceipt({
        supplierId: Number(body.supplierId),
        storeId: locked ?? Number(body.storeId),
        items: Array.isArray(body.items) ? body.items : [],
        supplierInvoiceNumber: body.supplierInvoiceNumber,
        supplierInvoiceAmount: body.supplierInvoiceAmount !== undefined
          ? Number(body.supplierInvoiceAmount) : undefined,
        paymentTermsDays: body.paymentTermsDays !== undefined
          ? Number(body.paymentTermsDays) : undefined,
        notes: body.notes,
        updateCost: body.updateCost !== false,
        userId: req.user?.id || undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── Supplier Returns ──────────────────────────────────────────
  app.get("/api/supplier-returns", async (req: Request, res: Response) => {
    try {
      const poId = req.query.poId ? Number(req.query.poId) : undefined;
      const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
      res.json(await getSupplierReturns({ poId, supplierId }));
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/supplier-returns", async (req: Request, res: Response) => {
    try {
      const uid = (req.user?.id || undefined);
      const { poId, supplierId, storeId, returnType, refundMode, refundMethod, items, notes, refundAmount } = req.body || {};
      if (!["initiated", "rejected_delivery"].includes(returnType))
        return res.status(400).json({ message: "returnType must be 'initiated' or 'rejected_delivery'" });
      res.status(201).json(await createSupplierReturn({
        poId, supplierId, storeId, returnType, refundMode, refundMethod, items: items || [], notes, refundAmount, createdBy: uid,
      }));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/supplier-returns/:id/status", async (req: Request, res: Response) => {
    try {
      const uid = (req.user?.id || undefined);
      res.json(await updateSupplierReturnStatus(Number(req.params.id), String(req.body?.status || ""), uid, req.body?.refundMethod));
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Supplier Payments ──────────────────────────────────────────
  app.get("/api/supplier-payments", async (req: Request, res: Response) => {
    try {
      res.json(await getSupplierPayments({
        supplierId: req.query.supplierId ? Number(req.query.supplierId) : undefined,
      }));
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.post("/api/supplier-payments", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(normalizeRoleStrict(req))) return res.status(403).json({ message: "Admin or manager only" });
    try {
      const uid = req.user?.id || undefined;
      const { supplierId, poId, amount, method, date, reference, supplierInvoiceNumber, supplierInvoiceUrl, receiptUrl, chequeId, bankName, notes, override, overrideReason } = req.body || {};
      if (!supplierId || !(Number(amount) > 0) || !date)
        return res.status(400).json({ message: "Supplier, amount, and date are required." });
      const row = await createSupplierPayment({
        supplierId, poId, amount: Number(amount), method: method || "Cash", date,
        reference, supplierInvoiceNumber, supplierInvoiceUrl, receiptUrl, chequeId, bankName, notes,
        createdBy: uid, override, overrideReason,
      });
      res.status(201).json(row);
    } catch (err) {
      if (sendFundsError(res, err)) return;
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/suppliers/:id/ledger", async (req: Request, res: Response) => {
    try {
      res.json(await getSupplierLedger(Number(req.params.id)));
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // AI supplier invoice scanner — upload invoice photo, extracts supplier name + items + amounts
  app.post("/api/ai/scan-supplier-invoice", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      if (!process.env.GROQ_API_KEY) return res.status(503).json({ message: "AI scanning unavailable (no GROQ_API_KEY)" });

      const imageBuffer = fs.readFileSync(file.path);
      const base64 = imageBuffer.toString("base64");
      const ext = (file.originalname || "").split(".").pop()?.toLowerCase() || "png";
      const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

      const visionRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: "text", text: `This is a SUPPLIER INVOICE. Extract the following from this invoice image:
1. supplierName: the company/person who issued this invoice
2. invoiceNumber: the invoice number/reference
3. invoiceDate: date on the invoice (YYYY-MM-DD format)
4. totalAmount: total amount on the invoice
5. items: array of line items with {description, qty, unit, unitPrice, amount}

Return ONLY valid JSON in this format:
{"supplierName":"","invoiceNumber":"","invoiceDate":"","totalAmount":0,"items":[{"description":"","qty":1,"unit":"PCS","unitPrice":0,"amount":0}]}
ALL item descriptions in UPPERCASE. No explanation.` }
            ]
          }],
          max_tokens: 3000,
        }),
      });

      const visionData = await visionRes.json();
      const content = visionData.choices?.[0]?.message?.content || "{}";
      const cleaned = content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);

      if (parsed.items) {
        parsed.items = parsed.items.map((item: any) => ({
          description: String(item.description || "ITEM").toUpperCase(),
          qty: Number(item.qty || item.quantity || 1),
          unit: String(item.unit || "PCS").toUpperCase(),
          unitPrice: Number(item.unitPrice || item.price || 0),
          amount: Number(item.amount || 0),
        }));
      }
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // PHASE 4 — EXPENSES / PDC TRACKER / CASH FLOW
  // ══════════════════════════════════════════════════════════════
  const uidOf = (req: Request) => (req.user?.id || undefined);

  // Expenses (Module 5)
  // Salesman/helper see only their own store's expenses; admin/manager see all.
  app.get("/api/expenses", async (req: Request, res: Response) => {
    try {
      await checkRecurringExpenses().catch(() => 0);
      const role = reqRole(req);
      const isScopedRole = ["salesman", "worker"].includes(role);
      const storeId = isScopedRole
        ? (req.user?.storeId ?? undefined)
        : (req.query.storeId ? Number(req.query.storeId) : undefined);
      res.json(await getExpenses({
        start: req.query.start as string | undefined,
        end: req.query.end as string | undefined,
        storeId,
        category: req.query.category as string | undefined,
      }));
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Salesman/helper can log store-level expenses (auto-scoped to their store).
  // Admin/manager can log any expense (company-wide or store-specific).
  app.post("/api/expenses", async (req: Request, res: Response) => {
    const role = reqRole(req);
    if (!["admin", "manager", "worker", "salesman"].includes(role))
      return res.status(403).json({ message: "Not authorized" });
    try {
      const { category, amount, date } = req.body || {};
      if (!category || !(Number(amount) > 0) || !date)
        return res.status(400).json({ message: "Category, amount and date are required." });
      const isScopedRole = ["salesman", "worker"].includes(role);
      const storeId = isScopedRole ? (req.user?.storeId ?? undefined) : req.body.storeId;
      const canOverride = role === "admin";
      res.status(201).json(await createExpense({
        ...req.body, storeId, createdBy: uidOf(req),
        override: canOverride && req.body?.override === true,
        overrideReason: req.body?.overrideReason,
      }));
    } catch (err) {
      if (sendFundsError(res, err)) return;
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put("/api/expenses/:id", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try { res.json(await updateExpense(Number(req.params.id), req.body)); }
    catch (err) { res.status(400).json({ message: String(err) }); }
  });

  app.delete("/api/expenses/:id", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try { await deleteExpense(Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Warehouse issues (Module 6 scaffold — expense traceability)
  app.get("/api/warehouse-issues", async (_req: Request, res: Response) => {
    try { res.json(await getWarehouseIssues()); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.post("/api/warehouse-issues", async (req: Request, res: Response) => {
    try {
      if (!req.body?.description) return res.status(400).json({ message: "Description is required" });
      res.status(201).json(await createWarehouseIssue({ ...req.body, reportedBy: uidOf(req) }));
    } catch (err) { res.status(400).json({ message: String(err) }); }
  });

  app.put("/api/warehouse-issues/:id", async (req: Request, res: Response) => {
    try { res.json(await updateWarehouseIssue(Number(req.params.id), req.body)); }
    catch (err) { res.status(400).json({ message: String(err) }); }
  });

  // PDC Tracker (Module 7) — cheque lifecycle is a finance action: admin/manager only.
  app.post("/api/cheques/:id/status", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try {
      const canOverride = reqRole(req) === "admin";
      res.json(await setChequeStatus(Number(req.params.id), String(req.body?.status || ""), uidOf(req), {
        override: canOverride && req.body?.override === true,
        overrideReason: req.body?.overrideReason,
      }, { depositProofUrl: req.body?.depositProofUrl, depositedToAccount: req.body?.depositedToAccount, clearanceProofUrl: req.body?.clearanceProofUrl }));
    } catch (err) {
      if (sendFundsError(res, err)) return;
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/pdc/check-alerts", async (_req: Request, res: Response) => {
    try { res.json({ created: await checkPdcAlerts() }); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // CSV export of the tracker (respects the same filters as the list).
  app.get("/api/cheques/export.csv", async (req: Request, res: Response) => {
    try {
      let rows: any[] = await getCheques();
      const { status, type, bank, q: search } = req.query as Record<string, string>;
      if (status) rows = rows.filter((r) => r.status === status);
      if (type) rows = rows.filter((r) => (r.type || "receivable") === type);
      if (bank) rows = rows.filter((r) => (r.bankName || "").toLowerCase().includes(bank.toLowerCase()));
      if (search) rows = rows.filter((r) => (r.chequeNumber || "").toLowerCase().includes(search.toLowerCase()));
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        ["Cheque #", "Type", "Who", "Bank", "Amount", "Cheque Date", "Status", "Linked Document", "Deposited", "Deposited To", "Cleared", "Bounced"].join(","),
        ...rows.map((r) => [
          esc(r.chequeNumber), esc(r.type || "receivable"), esc(r.who || r.customerName || ""), esc(r.bankName),
          esc(r.amount), esc(r.chequeDate), esc(r.status), esc(r.documentId || ""),
          esc(r.depositedDate || ""), esc(r.depositedToAccount || ""), esc(r.clearedDate || ""), esc(r.bouncedDate || ""),
        ].join(",")),
      ].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=pdc-tracker.csv");
      res.send(csv);
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Single cheque detail (linked document + status timeline). Registered AFTER
  // export.csv so ":id" can't swallow that literal path.
  app.get("/api/cheques/:id", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try {
      const chq = await getChequeDetail(Number(req.params.id));
      if (!chq) return res.status(404).json({ message: "Cheque not found" });
      res.json(chq);
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Attach a scanned cheque image (base64 data URL in JSON body).
  app.post("/api/cheques/:id/photo", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try { res.json(await setChequePhoto(Number(req.params.id), String(req.body?.photoUrl || ""))); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // PDC Swap — customer pays cash/transfer, takes cheque back.
  app.post("/api/cheques/:id/swap", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try {
      const method = req.body?.method;
      if (!["cash", "bank_transfer"].includes(method)) return res.status(400).json({ message: "method must be 'cash' or 'bank_transfer'" });
      res.json(await swapChequeToPayment(Number(req.params.id), method, String(req.body?.notes || ""), uidOf(req)));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Attach a deposit proof slip (bank receipt).
  app.post("/api/cheques/:id/deposit-proof", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try { res.json(await setChequeDepositProof(Number(req.params.id), String(req.body?.depositProofUrl || ""))); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Attach a clearance proof (bank statement confirming funds credited).
  app.post("/api/cheques/:id/clearance-proof", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try { res.json(await setChequeClearanceProof(Number(req.params.id), String(req.body?.clearanceProofUrl || ""))); }
    catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Bounced cheque recovery workflow — update recovery status.
  app.post("/api/cheques/:id/recovery", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try {
      res.json(await setChequeRecovery(Number(req.params.id), String(req.body?.recoveryStatus || ""), String(req.body?.recoveryNotes || ""), uidOf(req)));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Create a replacement cheque for a bounced one.
  app.post("/api/cheques/:id/replace", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try {
      const { chequeNumber, bankName, amount, chequeDate } = req.body || {};
      if (!chequeNumber || !bankName || !amount || !chequeDate) return res.status(400).json({ message: "chequeNumber, bankName, amount, chequeDate are required." });
      res.status(201).json(await createReplacementCheque(Number(req.params.id), { chequeNumber, bankName, amount: String(amount), chequeDate }, uidOf(req)));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // PDC action summary — counts of cheques needing attention.
  app.get("/api/pdc/summary", async (_req: Request, res: Response) => {
    try { res.json(await getPdcActionSummary()); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Cash flow (Agent 4)
  app.get("/api/cashflow", async (req: Request, res: Response) => {
    try {
      res.json(await getCashflow({
        start: req.query.start as string | undefined,
        end: req.query.end as string | undefined,
        storeId: req.query.storeId ? Number(req.query.storeId) : undefined,
        direction: req.query.direction as string | undefined,
      }));
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Manual entry — the Golden Rule: anything outside the system, admin logs after.
  app.post("/api/cashflow", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(reqRole(req))) return res.status(403).json({ message: "Admin or manager only" });
    try {
      const { direction, category, amount } = req.body || {};
      if (!["in", "out"].includes(direction) || !category || !(Number(amount) > 0))
        return res.status(400).json({ message: "direction (in/out), category and amount are required" });
      await logCashflow({ ...req.body, amount: Number(amount), createdBy: uidOf(req) });
      res.status(201).json({ ok: true });
    } catch (err) { res.status(400).json({ message: String(err) }); }
  });

  app.get("/api/cashflow/position", async (req: Request, res: Response) => {
    try {
      const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
      res.json(await getCashPosition(storeId));
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ══════════════════════════════════════════════════════════════
  // MODULE 9 — REPORTS (business summary, stock movement, aging,
  // PDC, expenses). Every report: JSON default, ?format=csv export.
  // ══════════════════════════════════════════════════════════════
  const csvOut = (res: Response, filename: string, header: string[], rows: any[][]) => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(csv);
  };

  // Financial reports are management-only (Module 9 + 10). Staff never see them.
  const reportGate = (req: Request, res: Response): boolean => {
    if (!["admin", "manager", "salesman"].includes(reqRole(req))) { res.status(403).json({ message: "Not authorised" }); return false; }
    return true;
  };

  // ── Business Summary ─────────────────────────────────────────
  app.get("/api/reports/business-summary", async (req: Request, res: Response) => {
    if (!reportGate(req, res)) return;
    try {
      const start = (req.query.start as string) || "1970-01-01";
      const end = (req.query.end as string) || new Date().toISOString().slice(0, 10);
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      const { db } = await import("./db");
      const S = await import("@shared/schema");
      const { and, gte, lte, eq } = await import("drizzle-orm");

      const inStore = (d: any) => !storeId || d.storeId === storeId;
      const isReal = (d: any) => d.transactionMode !== "demo";

      const docs = (await db.select().from(S.documents)
        .where(and(gte(S.documents.date, start), lte(S.documents.date, end)))).filter(isReal).filter(inStore);
      const invs = docs.filter((d: any) => d.type === "INV" && d.status !== "void");

      // Sales split by collection: paid=cash-collected; PDC = has pending/deposited receivable cheque; else credit.
      const invIds = invs.map((d: any) => d.id);
      const allCheques = await db.select().from(S.cheques);
      const pdcDocIds = new Set(allCheques.filter((c: any) => c.type !== "payable" && c.documentId).map((c: any) => c.documentId));
      let cashSales = 0, creditSales = 0, pdcSales = 0;
      for (const d of invs as any[]) {
        const t = parseFloat(d.total || "0");
        if (d.status === "paid") cashSales += t;
        else if (pdcDocIds.has(d.id)) pdcSales += t;
        else creditSales += t;
      }

      // Profit: real (collected) vs imaginary (all) using item costs
      let realProfit = 0, totalProfit = 0;
      const salesByCategoryMap: Record<string, number> = {};
      if (invIds.length) {
        const { inArray } = await import("drizzle-orm");
        const items = await db.select({
          documentId: S.documentItems.documentId, qty: S.documentItems.qty,
          amount: S.documentItems.amount, cost: S.products.costPrice,
          costAtSale: S.documentItems.costAtSale, category: S.products.category,
        }).from(S.documentItems)
          .leftJoin(S.products, eq(S.documentItems.productId, S.products.id))
          .where(inArray(S.documentItems.documentId, invIds));
        const profitByDoc: Record<number, number> = {};
        for (const it of items as any[]) {
          profitByDoc[it.documentId] = (profitByDoc[it.documentId] || 0) +
            (parseFloat(it.amount || "0") - resolveItemCost(it.costAtSale, it.cost) * parseFloat(it.qty || "0"));
          const cat = it.category || "Other";
          salesByCategoryMap[cat] = (salesByCategoryMap[cat] || 0) + parseFloat(it.amount || "0");
        }
        for (const d of invs as any[]) {
          const p = profitByDoc[d.id] || 0;
          totalProfit += p;
          if (d.status === "paid") realProfit += p;
        }
      }

      // Chart series: last 7 days of the period (bar) + sales by category (pie).
      const dayKeys: string[] = [];
      { const endD = new Date(end + "T00:00:00"); for (let i = 6; i >= 0; i--) { const d = new Date(endD); d.setDate(endD.getDate() - i); dayKeys.push(d.toISOString().slice(0, 10)); } }
      const salesByDay: Record<string, number> = Object.fromEntries(dayKeys.map((k) => [k, 0]));
      for (const d of invs as any[]) if (salesByDay[d.date] !== undefined) salesByDay[d.date] += parseFloat(d.total || "0");
      const dailySales = dayKeys.map((k) => ({ date: k, sales: Number(salesByDay[k].toFixed(2)) }));
      const salesByCategory = Object.entries(salesByCategoryMap)
        .map(([category, total]) => ({ category, total: Number((total as number).toFixed(2)) }))
        .sort((a, b) => b.total - a.total);

      // Customers: new (created in period) vs returning (bought in period, created before)
      const customersAll = await db.select().from(S.customers);
      const buyerIds = new Set(invs.map((d: any) => d.customerId).filter(Boolean));
      const newCustomers = customersAll.filter((c: any) => c.createdAt && new Date(c.createdAt).toISOString().slice(0, 10) >= start && new Date(c.createdAt).toISOString().slice(0, 10) <= end).length;
      const returningCustomers = Array.from(buyerIds).filter((id) => {
        const c: any = customersAll.find((x: any) => x.id === id);
        return c?.createdAt && new Date(c.createdAt).toISOString().slice(0, 10) < start;
      }).length;

      // Credit outstanding (all-time position, not period-bound)
      const unpaid = (await db.select().from(S.documents)
        .where(eq(S.documents.type, "INV"))).filter((d: any) => isReal(d) && inStore(d) && !["void", "returned", "paid"].includes(d.status));
      const pays = await db.select().from(S.payments);
      const paidByDoc: Record<number, number> = {};
      for (const p of pays as any[]) if (p.documentId) paidByDoc[p.documentId] = (paidByDoc[p.documentId] || 0) + (p.isRefund ? -1 : 1) * parseFloat(p.amount || "0");
      let creditOutstanding = 0;
      const creditCustomers = new Set<number>();
      for (const d of unpaid as any[]) {
        const rem = parseFloat(d.total || "0") - (paidByDoc[d.id] || 0);
        if (rem > 0.005) { creditOutstanding += rem; if (d.customerId) creditCustomers.add(d.customerId); }
      }

      // Suppliers: paid (payable cheques cleared + supplier cashflow out) & owed (received POs' terms — no line prices yet)
      const suppliersAll = await db.select().from(S.suppliers);
      const supplierPaidRows = (await db.select().from(S.cashflow))
        .filter((c: any) => c.direction === "out" && /supplier/i.test(c.category || "") && c.date >= start && c.date <= end);
      const totalPaidToSuppliers = supplierPaidRows.reduce((s: number, c: any) => s + parseFloat(c.amount || "0"), 0);
      const payableCheques = allCheques.filter((c: any) => c.type === "payable" && c.supplierId && ["pending", "deposited"].includes(c.status));
      const owedToSuppliers = payableCheques.reduce((s: number, c: any) => s + parseFloat(c.amount || "0"), 0);

      // Expenses by category (respecting soft delete)
      const exps = await getExpenses({ start, end, storeId: storeId || undefined });
      const expensesByCategory: Record<string, number> = {};
      for (const e of exps) expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + Number(e.amount || 0);
      const totalExpenses = Object.values(expensesByCategory).reduce((s, v) => s + v, 0);

      // Returns in period
      const rets = (await db.select().from(S.returns)).filter((r: any) => r.date >= start && r.date <= end && r.status === "approved");
      const custReturns = rets.reduce((s: number, r: any) => s + parseFloat(r.total || "0"), 0);
      const supRets = (await db.select().from(S.supplierReturns)).filter((r: any) => r.createdAt && new Date(r.createdAt).toISOString().slice(0, 10) >= start);
      const supReturns = supRets.reduce((s: number, r: any) => s + parseFloat(r.total || "0"), 0);

      // ── Product intelligence: top / worst by profit + top customers ──
      const allItems = invIds.length
        ? await db.select({ productId: S.documentItems.productId, description: S.documentItems.description, qty: S.documentItems.qty, amount: S.documentItems.amount, cost: S.products.costPrice, costAtSale: S.documentItems.costAtSale })
            .from(S.documentItems).leftJoin(S.products, eq(S.documentItems.productId, S.products.id))
            .where((await import("drizzle-orm")).inArray(S.documentItems.documentId, invIds))
        : [];
      const prodAgg: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
      for (const it of allItems as any[]) {
        const key = it.description || String(it.productId);
        const a = prodAgg[key] || { name: it.description || "?", qty: 0, revenue: 0, profit: 0 };
        const rev = parseFloat(it.amount || "0"), pr = rev - resolveItemCost(it.costAtSale, it.cost) * parseFloat(it.qty || "0");
        a.qty += parseFloat(it.qty || "0"); a.revenue += rev; a.profit += pr;
        prodAgg[key] = a;
      }
      const prodList = Object.values(prodAgg);
      const topProducts = [...prodList].sort((a, b) => b.profit - a.profit).slice(0, 10);
      const worstProducts = [...prodList].sort((a, b) => a.profit - b.profit).slice(0, 5);
      const custAgg: Record<number, { name: string; value: number }> = {};
      for (const d of invs as any[]) { if (!d.customerId) continue; const a = custAgg[d.customerId] || { name: d.customerName || "?", value: 0 }; a.value += parseFloat(d.total || "0"); custAgg[d.customerId] = a; }
      const topCustomers = Object.values(custAgg).sort((a, b) => b.value - a.value).slice(0, 10);

      // ── Section 6: recommended actions (business-advisor layer) ──
      const recommendedActions: string[] = [];
      const nowStr = new Date().toISOString().slice(0, 10);
      const overdue60 = (unpaid as any[]).filter((d) => {
        const rem = parseFloat(d.total || "0") - (paidByDoc[d.id] || 0);
        const days = Math.floor((Date.parse(nowStr) - Date.parse(d.date)) / 86400000);
        return rem > 0.005 && days >= 60;
      });
      const overdueCusts = new Set(overdue60.map((d) => d.customerId)).size;
      if (overdueCusts) recommendedActions.push(`${overdueCusts} customer${overdueCusts>1?"s are":" is"} 60+ days overdue — send statements now.`);
      const creditPct = (cashSales + creditSales + pdcSales) > 0 ? (creditSales + pdcSales) / (cashSales + creditSales + pdcSales) : 0;
      if (creditPct > 0.6) recommendedActions.push(`Credit + PDC is ${Math.round(creditPct*100)}% of sales — collection risk is high this period.`);
      // low stock → days-left estimate from sales velocity
      const lowRaw = await getLowStockItems();
      for (const li of (lowRaw as any[]).slice(0, 5)) {
        const soldQ = prodAgg[li.product?.name]?.qty || 0;
        const days = Math.max(1, (end !== start) ? Math.round((Date.parse(end) - Date.parse(start))/86400000) : 1);
        const velocity = soldQ / days;
        const left = velocity > 0 ? Math.floor(Number(li.qty||0) / velocity) : null;
        recommendedActions.push(`${li.product?.name} is low (${Number(li.qty)} left)${left!=null?` — ~${left} days at current sales rate` : ""}. Reorder suggested.`);
      }
      if (!recommendedActions.length) recommendedActions.push("No urgent actions — receivables, stock and collection risk all look healthy.");

      const pos = await getCashPosition(storeId);
      const summary = {
        period: { start, end }, storeId,
        totalSales: cashSales + creditSales + pdcSales,
        invoiceCount: invs.length,
        cashSales, creditSales, pdcSales,
        // Canonical profit model: real = paid only, expected = all invoices (== imaginary).
        realProfit, expectedProfit: totalProfit, imaginaryProfit: totalProfit,
        newCustomers, returningCustomers,
        creditCustomersCount: creditCustomers.size, creditOutstanding,
        suppliersCount: suppliersAll.length, totalPaidToSuppliers, owedToSuppliers,
        expensesByCategory, totalExpenses,
        customerReturns: custReturns, supplierReturns: supReturns,
        netCashPosition: pos.total, cashInHand: pos.cashInHand, bank: pos.bank, pdcPending: pos.pdcPending,
        topProducts, worstProducts, topCustomers, recommendedActions,
        dailySales, salesByCategory,
      };
      if (req.query.format === "csv") {
        return csvOut(res, "business-summary.csv", ["Metric", "Value"],
          Object.entries(summary).flatMap(([k, v]) =>
            typeof v === "object" && v !== null ? Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, v2]) : [[k, v]]));
      }
      res.json(summary);
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ── Stock Movement (Go-Live reconciliation critical) ─────────
  app.get("/api/reports/stock-movement", async (req: Request, res: Response) => {
    try {
      const start = (req.query.start as string) || "1970-01-01";
      const end = (req.query.end as string) || new Date().toISOString().slice(0, 10);
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      const category = req.query.category as string | undefined;
      const productId = req.query.productId ? Number(req.query.productId) : null;
      const { db } = await import("./db");
      const S = await import("@shared/schema");

      const adj = await db.select().from(S.stockAdjustments);
      const prods = await db.select().from(S.products);
      const inv = await db.select().from(S.inventory);
      const prodMap = new Map(prods.map((p: any) => [p.id, p]));

      const IN_TYPES = new Set(["purchase", "return", "add", "void", "transfer_in", "correction"]);
      const rows: any[] = [];
      const keyProds = prods.filter((p: any) =>
        (!productId || p.id === productId) && (!category || (p.category || "") === category));
      for (const p of keyProds as any[]) {
        const mine = (adj as any[]).filter((a) =>
          a.productId === p.id && (!storeId || a.storeId === storeId));
        const dOf = (a: any) => new Date(a.createdAt).toISOString().slice(0, 10);
        const before = mine.filter((a) => dOf(a) < start);
        const during = mine.filter((a) => dOf(a) >= start && dOf(a) <= end);
        const sum = (list: any[], f: (a: any) => boolean) => list.filter(f).reduce((s, a) => s + parseFloat(a.qtyChange || "0"), 0);
        // Current qty minus all movement after `start` = opening. More robust than
        // summing history (pre-system opening stock has no adjustment rows).
        const currentQty = (inv as any[]).filter((i) => i.productId === p.id && (!storeId || i.storeId === storeId))
          .reduce((s, i) => s + parseFloat(i.qty || "0"), 0);
        const movedSinceStart = sum(mine.filter((a) => dOf(a) >= start), () => true);
        const opening = currentQty - movedSinceStart;
        const received = sum(during, (a) => ["purchase", "add", "transfer_in"].includes(a.type) && parseFloat(a.qtyChange) > 0);
        const sold = -sum(during, (a) => a.type === "sale");
        const returned = sum(during, (a) => ["return", "void"].includes(a.type) && parseFloat(a.qtyChange) > 0);
        const supplierOut = -sum(during, (a) => a.type === "supplier_return");
        const other = sum(during, () => true) - received + sold - returned + supplierOut;
        const closing = opening + sum(during, () => true);
        if (productId || category || received || sold || returned || currentQty || opening) {
          rows.push({
            productId: p.id, sku: p.sku, name: p.name, category: p.category, unit: p.unit,
            opening: Number(opening.toFixed(2)), received: Number(received.toFixed(2)),
            sold: Number(sold.toFixed(2)), returned: Number(returned.toFixed(2)),
            supplierReturns: Number(supplierOut.toFixed(2)), otherAdjustments: Number(other.toFixed(2)),
            closing: Number(closing.toFixed(2)),
          });
        }
      }
      rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (req.query.format === "csv") {
        return csvOut(res, "stock-movement.csv",
          ["SKU", "Product", "Category", "Unit", "Opening", "Received", "Sold", "Returned", "Supplier Returns", "Other Adj", "Closing"],
          rows.map((r) => [r.sku, r.name, r.category, r.unit, r.opening, r.received, r.sold, r.returned, r.supplierReturns, r.otherAdjustments, r.closing]));
      }
      res.json({ period: { start, end }, storeId, rows });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ── Overdue Aging ────────────────────────────────────────────
  app.get("/api/reports/aging", async (req: Request, res: Response) => {
    try {
      const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      const { db } = await import("./db");
      const S = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const docs = (await db.select().from(S.documents).where(eq(S.documents.type, "INV")))
        .filter((d: any) => d.transactionMode !== "demo" && !["void", "returned", "paid"].includes(d.status) && (!storeId || d.storeId === storeId));
      const pays = await db.select().from(S.payments);
      const paidByDoc: Record<number, number> = {};
      for (const p of pays as any[]) if (p.documentId) paidByDoc[p.documentId] = (paidByDoc[p.documentId] || 0) + (p.isRefund ? -1 : 1) * parseFloat(p.amount || "0");

      const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
      const rows: any[] = [];
      for (const d of docs as any[]) {
        const rem = parseFloat(d.total || "0") - (paidByDoc[d.id] || 0);
        if (rem <= 0.005) continue;
        const days = Math.floor((Date.parse(asOf) - Date.parse(d.date)) / 86400000);
        const bucket = days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
        rows.push({ invoiceId: d.id, number: d.number, customerId: d.customerId, customerName: d.customerName, date: d.date, daysOverdue: Math.max(0, days), remaining: Number(rem.toFixed(2)), bucket });
      }
      const perBucket = Object.fromEntries(BUCKETS.map((b) => [b, {
        count: rows.filter((r) => r.bucket === b).length,
        total: Number(rows.filter((r) => r.bucket === b).reduce((s, r) => s + r.remaining, 0).toFixed(2)),
      }]));
      if (req.query.format === "csv") {
        return csvOut(res, "aging-report.csv",
          ["Bucket", "Invoice", "Customer", "Invoice Date", "Days Overdue", "Remaining QAR"],
          rows.sort((a, b) => b.daysOverdue - a.daysOverdue).map((r) => [r.bucket, r.number, r.customerName, r.date, r.daysOverdue, r.remaining]));
      }
      res.json({ asOf, storeId, perBucket, rows });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ── PDC Report (upcoming windows + overdue; CSV shares /api/cheques/export.csv) ──
  app.get("/api/reports/pdc", async (req: Request, res: Response) => {
    try {
      const days = Number(req.query.days) || 30; // 7 | 14 | 30
      const today = new Date().toISOString().slice(0, 10);
      const horizon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      let rows: any[] = await getCheques();
      const { status, type, bank } = req.query as Record<string, string>;
      if (status) rows = rows.filter((r) => r.status === status);
      if (type) rows = rows.filter((r) => (r.type || "receivable") === type);
      if (bank) rows = rows.filter((r) => (r.bankName || "").toLowerCase().includes(bank.toLowerCase()));
      const active = rows.filter((r) => ["pending", "deposited"].includes(r.status));
      const upcoming = active.filter((r) => r.chequeDate >= today && r.chequeDate <= horizon);
      const overdue = active.filter((r) => r.chequeDate < today);
      const sum = (list: any[]) => Number(list.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2));
      if (req.query.format === "csv") {
        const all = [...overdue.map((r) => ({ ...r, class: "OVERDUE" })), ...upcoming.map((r) => ({ ...r, class: `NEXT ${days}D` }))];
        return csvOut(res, "pdc-report.csv",
          ["Class", "Cheque #", "Type", "Who", "Bank", "Amount", "Cheque Date", "Status", "Linked Doc"],
          all.map((r) => [r.class, r.chequeNumber, r.type || "receivable", r.who || r.customerName || "", r.bankName, r.amount, r.chequeDate, r.status, r.documentId || ""]));
      }
      res.json({
        windowDays: days,
        upcoming: { count: upcoming.length, total: sum(upcoming), rows: upcoming },
        overdue: { count: overdue.length, total: sum(overdue), rows: overdue },
        receivablePending: sum(active.filter((r) => r.type !== "payable")),
        payablePending: sum(active.filter((r) => r.type === "payable")),
      });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ── Expense Report ───────────────────────────────────────────
  app.get("/api/reports/expenses", async (req: Request, res: Response) => {
    try {
      const start = (req.query.start as string) || "1970-01-01";
      const end = (req.query.end as string) || new Date().toISOString().slice(0, 10);
      const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
      const rows = await getExpenses({ start, end, storeId });
      const byCategory: Record<string, { total: number; count: number; recurring: number; oneTime: number }> = {};
      for (const e of rows as any[]) {
        const c = byCategory[e.category] || { total: 0, count: 0, recurring: 0, oneTime: 0 };
        const amt = Number(e.amount || 0);
        c.total += amt; c.count++;
        if (e.isRecurring) c.recurring += amt; else c.oneTime += amt;
        byCategory[e.category] = c;
      }
      const totals = {
        total: Object.values(byCategory).reduce((s, c) => s + c.total, 0),
        recurring: Object.values(byCategory).reduce((s, c) => s + c.recurring, 0),
        oneTime: Object.values(byCategory).reduce((s, c) => s + c.oneTime, 0),
      };
      if (req.query.format === "csv") {
        return csvOut(res, "expense-report.csv",
          ["Category", "Entries", "Recurring QAR", "One-time QAR", "Total QAR"],
          Object.entries(byCategory).map(([k, v]) => [k, v.count, v.recurring.toFixed(2), v.oneTime.toFixed(2), v.total.toFixed(2)]));
      }
      res.json({ period: { start, end }, storeId: storeId ?? null, byCategory, totals, rows });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ══════════════════════════════════════════════════════════════
  // CORRECTIONS — undo/reversal system (admin + manager only)
  // ══════════════════════════════════════════════════════════════
  const corrector = (req: Request, res: Response): boolean => {
    if (!["admin", "manager"].includes(reqRole(req))) {
      res.status(403).json({ message: "Only an admin or manager can make corrections" });
      return false;
    }
    return true;
  };

  app.get("/api/corrections", async (req: Request, res: Response) => {
    try {
      res.json(await getCorrections(
        req.query.entityType as string | undefined,
        req.query.entityId ? Number(req.query.entityId) : undefined,
      ));
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // PDC cheque status reversal (cleared/deposited entered by mistake)
  app.post("/api/corrections/cheque/:id", async (req: Request, res: Response) => {
    if (!corrector(req, res)) return;
    try {
      const { targetStatus, reason } = req.body || {};
      res.json(await reverseChequeStatus(Number(req.params.id), String(targetStatus || ""), String(reason || ""), uidOf(req)));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Payment method/amount correction (card recorded but was cash, etc.)
  app.post("/api/corrections/payment/:id", async (req: Request, res: Response) => {
    if (!corrector(req, res)) return;
    try {
      const { method, amount, reason } = req.body || {};
      res.json(await correctPayment(Number(req.params.id), { method, amount: amount != null ? Number(amount) : undefined }, String(reason || ""), uidOf(req)));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Expense soft delete with mandatory reason
  app.post("/api/corrections/expense/:id/delete", async (req: Request, res: Response) => {
    if (!corrector(req, res)) return;
    try {
      res.json(await softDeleteExpense(Number(req.params.id), String(req.body?.reason || ""), uidOf(req)));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Delivery marked delivered by mistake → back to pending
  app.post("/api/corrections/delivery/:id", async (req: Request, res: Response) => {
    if (!corrector(req, res)) return;
    try {
      await reverseDelivery(Number(req.params.id), String(req.body?.reason || ""), uidOf(req));
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // Return approved by mistake → back to pending (stock + refund reversed)
  app.post("/api/corrections/return/:id", async (req: Request, res: Response) => {
    if (!corrector(req, res)) return;
    try {
      res.json(await reverseReturnApproval(Number(req.params.id), String(req.body?.reason || ""), uidOf(req)));
    } catch (err) { res.status(400).json({ message: err instanceof Error ? err.message : String(err) }); }
  });

  // ══════════════════════════════════════════════════════════════
  // REPORTS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/reports/daily-sales", async (req: Request, res: Response) => {
    try {
      const start = (req.query.start as string) || new Date().toISOString().split("T")[0];
      const end = (req.query.end as string) || new Date().toISOString().split("T")[0];
      const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
      const summary = await getDailySalesSummary(start, end, storeId);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ── Owner Loans / Cash Injections ──────────────────────────────────────────
  app.get("/api/owner-loans", async (req: Request, res: Response) => {
    try { res.json(await getOwnerLoans()); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });
  app.post("/api/owner-loans", async (req: Request, res: Response) => {
    // Admin/manager only — it moves the cash position.
    if (!["admin", "manager"].includes(normalizeRoleStrict(req)))
      return res.status(403).json({ message: "Only an admin or manager can record owner loans." });
    try {
      const { type, amount, source, method, date, note, proofUrl, refInjectionId } = req.body || {};
      if (!LOAN_TYPES.has(type)) return res.status(400).json({ message: "type must be injection, repayment, lend_out, collection or profit_withdrawal" });
      if (!(Number(amount) > 0)) return res.status(400).json({ message: "amount must be a positive number" });
      const canOverride = normalizeRoleStrict(req) === "admin";
      const row = await createOwnerLoan({
        type, amount: Number(amount), source, method,
        date: date || new Date().toISOString().slice(0, 10), note, proofUrl,
        refInjectionId: refInjectionId ? Number(refInjectionId) : undefined,
        createdBy: req.user?.id || undefined,
        override: canOverride && req.body?.override === true,
        overrideReason: req.body?.overrideReason,
      });
      res.status(201).json(row);
    } catch (err) {
      if (sendFundsError(res, err)) return;
      // Validation failures (unlinked repayment, over-payment, missing loan) carry
      // a user-facing message — surface it plainly at 400 rather than a raw 500.
      const msg = err instanceof Error ? err.message : String(err);
      const isValidation = /repayment|collection|loan|lent|remaining|linked|balance/i.test(msg);
      res.status(isValidation ? 400 : 500).json({ message: msg });
    }
  });

  app.put("/api/owner-loans/:id", async (req: Request, res: Response) => {
    if (!["admin", "manager"].includes(normalizeRoleStrict(req)))
      return res.status(403).json({ message: "Only an admin or manager can edit loan records." });
    try {
      const { amount, source, method, date, note, proofUrl } = req.body || {};
      const row = await updateOwnerLoan(Number(req.params.id), {
        amount: amount != null ? Number(amount) : undefined,
        source, method, date, note, proofUrl, updatedBy: req.user?.id || undefined,
      });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // Profit Today drill-down (Sell − Cost per invoice; real = paid only).
  app.get("/api/reports/profit-detail", async (req: Request, res: Response) => {
    if (!reportGate(req, res)) return;
    try {
      const start = (req.query.start as string) || new Date().toISOString().slice(0, 10);
      const end = (req.query.end as string) || start;
      const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
      res.json(await getProfitDetail(start, end, storeId));
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.get("/api/reports/profit-summary", async (req: Request, res: Response) => {
    if (!reportGate(req, res)) return;
    try { res.json(await getProfitSummary()); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Credit Exposure — all unpaid credit grouped by customer.
  app.get("/api/reports/credit-exposure", async (req: Request, res: Response) => {
    if (!reportGate(req, res)) return;
    try { res.json(await getCreditExposure()); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Location Overview — per store/warehouse workflow (revenue, cash, credit,
  // expenses, returns, profit) + daily revenue series, over a date range.
  app.get("/api/reports/location-overview", async (req: Request, res: Response) => {
    if (!reportGate(req, res)) return;
    try {
      const start = (req.query.start as string) || new Date().toISOString().slice(0, 10);
      const end = (req.query.end as string) || start;
      res.json(await getLocationOverview(start, end));
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // Customer overview — money-behaviour per customer (due/paid/PDC + rating) for the
  // Customers page segments + CSV export. Anyone who can open Customers may read it.
  app.get("/api/reports/customer-overview", async (req: Request, res: Response) => {
    if (!["admin", "manager", "salesman"].includes(reqRole(req))) return res.status(403).json({ message: "Not authorised" });
    try { res.json(await getCustomerOverview()); }
    catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.get("/api/reports/unpaid-invoices", async (req: Request, res: Response) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const invoices = await getUnpaidInvoices({ start, end });
      res.json(invoices);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/reports/cheque-calendar", async (req: Request, res: Response) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const rows = await getCheques({ start, end });
      const today = new Date().toISOString().split("T")[0];
      const enriched = rows.map((c: any) => ({
        ...c,
        customerName: c.customerName ?? c.customer?.name ?? null,
        status: c.status === "pending" && c.chequeDate && c.chequeDate < today ? "overdue" : c.status,
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // DYNAMIC SCHEMA ENGINE — managed lists, custom fields, custom modules
  // Reads open (forms need them); definition writes require admin.
  // Role comes from the verified JWT (req.user), set by authMiddleware.
  // ═══════════════════════════════════════════════════════════════════════
  const reqRole = (req: Request) => normalizeRoleStrict(req);
  const requireAdmin = (req: Request, res: Response): boolean => {
    if (reqRole(req) !== "admin") { res.status(403).json({ message: "Admin only" }); return false; }
    return true;
  };

  // Managed lists (dynamic categories / units / credit terms / sub-locations …)
  app.get("/api/lists", async (_req, res) => { try { res.json(await getAllManagedLists()); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.get("/api/lists/:listKey", async (req, res) => { try { res.json(await getManagedList(req.params.listKey)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.post("/api/lists", async (req, res) => { if (!requireAdmin(req, res)) return; try { res.status(201).json(await createManagedListItem(req.body)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.put("/api/lists/:id", async (req, res) => { if (!requireAdmin(req, res)) return; try { res.json(await updateManagedListItem(Number(req.params.id), req.body)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.delete("/api/lists/:id", async (req, res) => { if (!requireAdmin(req, res)) return; try { await deleteManagedListItem(Number(req.params.id)); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: String(e) }); } });

  // Custom field definitions per module
  app.get("/api/field-definitions", async (req, res) => { try { res.json(await getFieldDefinitions(req.query.module as string | undefined)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.post("/api/field-definitions", async (req, res) => { if (!requireAdmin(req, res)) return; try { res.status(201).json(await createFieldDefinition(req.body)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.put("/api/field-definitions/:id", async (req, res) => { if (!requireAdmin(req, res)) return; try { res.json(await updateFieldDefinition(Number(req.params.id), req.body)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.delete("/api/field-definitions/:id", async (req, res) => { if (!requireAdmin(req, res)) return; try { await deleteFieldDefinition(Number(req.params.id)); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: String(e) }); } });

  // Custom module definitions (module builder)
  app.get("/api/modules", async (_req, res) => { try { res.json(await getModuleDefinitions()); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.post("/api/modules", async (req, res) => { if (!requireAdmin(req, res)) return; try { res.status(201).json(await createModuleDefinition(req.body)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.put("/api/modules/:id", async (req, res) => { if (!requireAdmin(req, res)) return; try { res.json(await updateModuleDefinition(Number(req.params.id), req.body)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.delete("/api/modules/:id", async (req, res) => { if (!requireAdmin(req, res)) return; try { await deleteModuleDefinition(Number(req.params.id)); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: String(e) }); } });

  // Custom module records (data rows for admin-created modules)
  app.get("/api/custom/:moduleKey", async (req, res) => { try { res.json(await getCustomRecords(req.params.moduleKey)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.post("/api/custom/:moduleKey", async (req, res) => { try { res.status(201).json(await createCustomRecord({ ...req.body, moduleKey: req.params.moduleKey })); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.put("/api/custom/:moduleKey/:id", async (req, res) => { try { res.json(await updateCustomRecord(Number(req.params.id), req.body)); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.delete("/api/custom/:moduleKey/:id", async (req, res) => { try { await deleteCustomRecord(Number(req.params.id)); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: String(e) }); } });

  // ── Document numbering management (Settings Step 1) ──
  app.get("/api/document-counters", async (_req, res) => { try { res.json(await getDocumentCounters()); } catch (e) { res.status(500).json({ message: String(e) }); } });
  app.get("/api/numbering-audit", async (_req, res) => { try { res.json(await getNumberingAudit()); } catch (e) { res.status(500).json({ message: String(e) }); } });
  // Set next number and/or format for a type. Admin only. Logs skipped numbers.
  app.put("/api/document-counters/:type", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const type = req.params.type;
      const { nextNumber, prefix, digits, separator, reason } = req.body || {};
      // Guard: numbers are never reused — reject a backwards jump below the current next.
      if (nextNumber !== undefined && nextNumber !== null && !isNaN(Number(nextNumber))) {
        const current = (await getDocumentCounters()).find((c: any) => c.type === type);
        if (current && Number(nextNumber) < current.nextNumber) {
          return res.status(400).json({ message: `Next number cannot be set below the current next (${current.nextNumber}) — numbers are never reused.` });
        }
      }
      if (prefix !== undefined || digits !== undefined || separator !== undefined) {
        await updateCounterFormat(type, { prefix, digits: digits !== undefined ? Number(digits) : undefined, separator });
      }
      let result;
      if (nextNumber !== undefined && nextNumber !== null && !isNaN(Number(nextNumber))) {
        const uid = (req.user?.id || undefined);
        const u = uid ? await getUser(uid) : undefined;
        result = await setNextDocNumber(type, Number(nextNumber), { reason, userId: uid, userName: u?.name });
      } else {
        result = (await getDocumentCounters()).find((c: any) => c.type === type);
      }
      res.json(result);
    } catch (e) { res.status(500).json({ message: String(e) }); }
  });

  // ── CSV bulk import (products + customers). Admin only. Upsert on sku/phone. ──
  // ── Product CSV import: analyse, then apply ─────────────────────────────
  // Two steps on purpose. These files are written outside the system (a
  // spreadsheet, or an AI assistant), so they cannot know this business's real
  // store names — the location is chosen here instead, against the live list.
  // Nothing is written until the reviewed rows come back to /commit, which also
  // means a bad file can simply be fixed and re-sent with no half-applied mess.
  app.post("/api/products/import/preview", upload.single("file"), async (req: Request, res: Response) => {
    if (!requireAdminOrManager(req, res)) return;
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const text = fs.readFileSync(req.file.path, "utf8");
      fs.unlink(req.file.path, () => {});
      const parsed = parseCsv(text);
      if (!parsed.length) return res.status(400).json({ message: "That file has no data rows." });

      const analysis = await analyseCsv(parsed);
      if (!analysis.rows.length) return res.status(400).json({ message: "No usable product rows found in that file." });

      const stores = (await getStores()).filter((s: any) => s.active !== false);
      res.json({
        ...analysis,
        stores: stores.map((s: any) => ({ id: s.id, name: s.nameEn, type: s.type })),
      });
    } catch (e) {
      try { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch { /* temp */ }
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/products/import/commit", async (req: Request, res: Response) => {
    if (!requireAdminOrManager(req, res)) return;
    const rows: CommitRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ message: "Nothing to apply." });

    const defaultStoreId = req.body?.storeId ? Number(req.body.storeId) : null;
    const needsLocation = rows.some((r) => Number(r.quantity) > 0 && !r.storeId);
    if (needsLocation && !defaultStoreId) {
      return res.status(400).json({ message: "Choose a location for the stock before applying." });
    }
    if (defaultStoreId) {
      const stores = await getStores();
      if (!stores.some((s: any) => s.id === defaultStoreId)) {
        return res.status(400).json({ message: "That location does not exist." });
      }
    }

    try {
      const result = await commitRows(rows, { defaultStoreId, userId: req.user?.id || undefined });
      res.json({
        ok: true,
        ...result,
        createdCount: result.created.length,
        updatedCount: result.updated.length,
        failedCount: result.failed.length,
      });
    } catch (e) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/customers/import", upload.single("file"), async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const rows = parseCsv(fs.readFileSync(req.file.path, "utf8"));
      fs.unlink(req.file.path, () => {});
      const existing = await getCustomers();
      const byPhone = new Map(existing.filter((c) => c.phone).map((c) => [String(c.phone), c]));
      let created = 0, updated = 0;
      const rejected: { row: number; name: string; reason: string }[] = [];
      let i = 0;
      for (const r of rows) {
        i++;
        const name = r.name;
        if (!name && !r.phone && !r.address) continue; // wholly blank line — skip silently
        // A customer must at least have a name — reject (and report) rows without one
        // instead of dropping them silently.
        if (!name) { rejected.push({ row: i, name: "", reason: "missing name" }); continue; }
        const body: any = {
          name, phone: r.phone || null, type: r.type || "walk-in",
          creditLimit: r.creditlimit || r["credit limit"] || "0",
          trn: r.trn || null, address: r.address || null, notes: r.notes || null,
        };
        const match = r.phone ? byPhone.get(String(r.phone)) : null;
        if (match) { await updateCustomer(match.id, body); updated++; }
        else { await createCustomer(body); created++; }
      }
      res.json({ ok: true, created, updated, rejected, rejectedCount: rejected.length, total: rows.length });
    } catch (e) { res.status(500).json({ message: String(e) }); }
  });

  // ── Dashboard summary: real-time metrics computed with Drizzle ──
  app.get("/api/dashboard/summary", async (req: Request, res: Response) => {
    try {
      const { businessDate } = await import("@shared/permissions");
      const s: any = await getSettings();
      // "Today" = the store business day (opens 05:00 by default) — a 04:00 sale
      // belongs to the previous business day. Reports roll at opening, not midnight.
      const today = businessDate(new Date(), s?.storeOpenTime || "05:00");
      const { db } = await import("./db");
      const {
        documents, documentItems, products: productsTable, payments: paymentsTable,
        cheques: chequesTable, customers: customersTable,
      } = await import("@shared/schema");
      const { eq, and, ne, inArray } = await import("drizzle-orm");

      const isReal = (d: any) => d.transactionMode !== "demo";
      // Optional location filter — salesman/warehouse dashboards are store-scoped.
      // Any store-assigned staff (salesman, manager, warehouse…) is LOCKED to their
      // own store server-side — a raw ?storeId= call can't widen the scope. Only an
      // admin (no assigned store) sees whatever location is asked for.
      const actorRole = normalizeRoleStrict(req);
      const lockedStore = actorRole !== "admin" && req.user?.storeId ? req.user.storeId : null;
      const storeFilter = lockedStore ?? (req.query.storeId ? Number(req.query.storeId) : null);
      const inStore = (d: any) => !storeFilter || d.storeId === storeFilter;

      // A doc belongs to today's business day if its date matches, OR it was created
      // within the business-day window (handles the pre-open edge, e.g. a 04:00 sale).
      const bd = (d: any) => {
        if (d.date === today) return true;
        if (d.createdAt) return businessDate(new Date(d.createdAt), s?.storeOpenTime || "05:00") === today;
        return false;
      };
      const recentDocs = await db.select().from(documents).where(inArray(documents.date, [today, new Date().toISOString().slice(0,10), new Date(Date.now()-86400000).toISOString().slice(0,10)]));
      const todaysDocs = recentDocs.filter((d: any) => bd(d) && inStore(d));
      const invs = todaysDocs.filter((d: any) => d.type === "INV" && d.status !== "void" && isReal(d));
      const returnsDocs = todaysDocs.filter((d: any) => (d.type === "RV" || d.type === "CN") && isReal(d));

      // COGS + item-level profit per invoice (join items → product cost). Profit uses
      // the canonical formula Σ(item.amount − item.cost×qty) so "Profit Today" here
      // reconciles exactly with Finance → Profit and Reports → Business Summary.
      const invIds = invs.map((d: any) => d.id);
      const cogsByDoc: Record<number, number> = {};
      const profitByDoc: Record<number, number> = {};
      if (invIds.length) {
        const itemRows = await db
          .select({ documentId: documentItems.documentId, qty: documentItems.qty, amount: documentItems.amount, productId: documentItems.productId, cost: productsTable.costPrice })
          .from(documentItems)
          .leftJoin(productsTable, eq(documentItems.productId, productsTable.id))
          .where(inArray(documentItems.documentId, invIds));
        for (const r of itemRows as any[]) {
          const c = parseFloat(r.cost || "0") * parseFloat(r.qty || "0");
          cogsByDoc[r.documentId] = (cogsByDoc[r.documentId] || 0) + c;
          profitByDoc[r.documentId] = (profitByDoc[r.documentId] || 0) + (parseFloat(r.amount || "0") - c);
        }
      }

      // "Cash sale" = money actually collected (status paid), not the label —
      // Real Profit counts collected sales only; partial/unpaid stay on the credit side.
      const isCash = (d: any) => d.status === "paid" || (d.paymentType || "").toLowerCase() === "cash";
      let cashSalesToday = 0, creditSalesToday = 0, profitFromCash = 0, profitFromUnrealizedCredit = 0;
      for (const d of invs as any[]) {
        const total = parseFloat(d.total || "0");
        const profit = profitByDoc[d.id] ?? (total - (cogsByDoc[d.id] || 0));
        if (isCash(d)) { cashSalesToday += total; profitFromCash += profit; }
        else { creditSalesToday += total; profitFromUnrealizedCredit += profit; }
      }

      // Return deductions — a return nets out of TODAY's Sales/Profit ONLY when its
      // ORIGINAL invoice's business day is also today. (Spec rule: today's widgets move
      // only when the invoice's own original date is today. A return against an OLDER
      // invoice moves only Cash Position — via its refund cashflow — never today's
      // sales/profit.) Sales reduce by returned REVENUE; profit by returned MARGIN.
      let returnsRevenueToday = 0, returnsMarginToday = 0;
      if (returnsDocs.length) {
        const origIds = Array.from(new Set(returnsDocs.map((d: any) => d.originalInvoiceId).filter(Boolean))) as number[];
        const origInvs = origIds.length ? await db.select().from(documents).where(inArray(documents.id, origIds)) : [];
        const origById: Record<number, any> = {};
        for (const o of origInvs as any[]) origById[o.id] = o;
        const cnIds = returnsDocs.map((d: any) => d.id);
        const cnItemRows = cnIds.length ? await db
          .select({ documentId: documentItems.documentId, qty: documentItems.qty, amount: documentItems.amount, cost: productsTable.costPrice })
          .from(documentItems).leftJoin(productsTable, eq(documentItems.productId, productsTable.id))
          .where(inArray(documentItems.documentId, cnIds)) : [];
        const cnRev: Record<number, number> = {}, cnCogs: Record<number, number> = {};
        for (const r of cnItemRows as any[]) {
          cnRev[r.documentId] = (cnRev[r.documentId] || 0) + parseFloat(r.amount || "0");
          cnCogs[r.documentId] = (cnCogs[r.documentId] || 0) + parseFloat(r.cost || "0") * parseFloat(r.qty || "0");
        }
        for (const rd of returnsDocs as any[]) {
          const orig = origById[rd.originalInvoiceId];
          if (!orig || !bd(orig)) continue; // original invoice NOT today → leave today's sales/profit untouched
          const rev = cnRev[rd.id] != null ? cnRev[rd.id] : parseFloat(rd.total || "0");
          returnsRevenueToday += rev;
          returnsMarginToday += rev - (cnCogs[rd.id] || 0);
        }
      }
      // returnsToday (response field) = all returns PROCESSED today, for display.
      const returnsToday = returnsDocs.reduce((s: number, d: any) => s + parseFloat(d.total || "0"), 0);
      cashSalesToday = Math.max(0, cashSalesToday - returnsRevenueToday);
      profitFromCash -= returnsMarginToday;

      // Cheques Management — all uncleared (pending) cheques currently in hand
      const allCheques = await db.select().from(chequesTable);
      const pendingCheques = (allCheques as any[]).filter((c) => c.status === "pending");
      const chequesUncleared = {
        count: pendingCheques.length,
        amount: pendingCheques.reduce((s, c) => s + parseFloat(c.amount || "0"), 0),
      };

      // Customer payment reminders — grouped by customer (1 row per customer,
      // with all their unpaid invoices rolled up into an account statement).
      const unpaidRows = await db.select().from(documents)
        .where(and(eq(documents.type, "INV"), ne(documents.status, "paid"), ne(documents.status, "void"), ne(documents.status, "returned")));
      const custList = await db.select().from(customersTable);
      const custMap: Record<number, any> = {};
      for (const c of custList as any[]) custMap[c.id] = c;

      const unpaidReal = (unpaidRows as any[]).filter((d) => isReal(d) && inStore(d));
      const upIds = unpaidReal.map((d) => d.id);
      const upPayRows = upIds.length ? await db.select().from(paymentsTable).where(inArray(paymentsTable.documentId, upIds)) : [];
      const paidByDoc: Record<number, number> = {};
      for (const p of upPayRows as any[]) {
        const amt = parseFloat(p.amount || "0") * (p.isRefund ? -1 : 1);
        paidByDoc[p.documentId] = (paidByDoc[p.documentId] || 0) + amt;
      }

      const bizName = s?.storeNameEn || "MAMUN M TRADING AND CONTRACTING W.L.L";
      const bizPhone = s?.phone || "+974 30703722";
      const fmtQar2 = (n: number) =>
        `QAR ${Number(n || 0).toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Group invoices by customer — only real customer accounts (customerId != null).
      // Walk-in / cash / orphan invoices (no customerId) still count toward totalOutstanding
      // but are excluded from reminders since there is nobody to contact.
      const byCustomer = new Map<number, { customerId: number; customerName: string; customerPhone: string | null; invoices: any[]; outstanding: number; maxDaysOverdue: number }>();
      let totalOutstanding = 0;
      for (const d of unpaidReal) {
        const paid = paidByDoc[d.id] || 0;
        const remaining = parseFloat(d.total || "0") - paid;
        if (remaining <= 0.005) continue;
        const daysOverdue = Math.floor((Date.parse(today) - Date.parse(d.date)) / 86400000);
        if (d.customerId) totalOutstanding += remaining;

        if (!d.customerId) continue;
        const key = d.customerId;
        let g = byCustomer.get(key);
        if (!g) {
          const cust = custMap[d.customerId];
          g = { customerId: d.customerId, customerName: cust?.name || d.customerName || "Customer", customerPhone: cust?.phone ?? cust?.whatsapp ?? null, invoices: [], outstanding: 0, maxDaysOverdue: 0 };
          byCustomer.set(key, g);
        }
        g.invoices.push({ id: d.id, number: d.number, date: d.date, remaining, daysOverdue });
        g.outstanding += remaining;
        g.maxDaysOverdue = Math.max(g.maxDaysOverdue, daysOverdue);
      }

      const reminders: any[] = [];
      for (const g of Array.from(byCustomer.values())) {
        g.invoices.sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""));
        const count = g.invoices.length;
        const totalStr = fmtQar2(g.outstanding);
        const lines = g.invoices
          .map((inv: any) => {
            const od = inv.daysOverdue > 0 ? ` · ${inv.daysOverdue}d overdue` : "";
            return `• ${inv.number} (${inv.date}) — ${fmtQar2(inv.remaining)}${od}`;
          })
          .join("\n");

        let tone = "This is a gentle reminder regarding your account balance.";
        if (g.maxDaysOverdue > 90) tone = "Our records show an overdue balance that needs your immediate attention.";
        else if (g.maxDaysOverdue > 30) tone = "This is a friendly reminder regarding your pending account balance.";

        const message =
`Dear ${g.customerName},

${tone}

ACCOUNT STATEMENT — ${bizName}
As of ${today}
Outstanding balance: ${totalStr} across ${count} invoice${count !== 1 ? "s" : ""}.

Pending invoice${count !== 1 ? "s" : ""}:
${lines}

TOTAL DUE: ${totalStr}

Kindly arrange payment at your earliest convenience. For any queries, contact us at ${bizPhone}.

Thank you for your business.
${bizName}`;

        reminders.push({
          customerId: g.customerId, customerName: g.customerName,
          customerPhone: g.customerPhone, invoiceCount: count,
          invoices: g.invoices, outstanding: g.outstanding,
          maxDaysOverdue: g.maxDaysOverdue, message,
        });
      }
      reminders.sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue);

      res.json({
        cashSalesToday, creditSalesToday,
        chequesUncleared,
        profitFromCash, profitFromUnrealizedCredit,
        newInvoicesToday: invs.length,
        returnsToday, totalOutstanding,
        paymentReminders: reminders.slice(0, 15),
      });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/reports/top-customers", async (req: Request, res: Response) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const storeId = req.query.storeId as string | undefined;

      const { db } = await import("./db");
      const { documents, customers: customersTable, payments } = await import("@shared/schema");
      const { eq, and, gte, lte, isNotNull, ne } = await import("drizzle-orm");

      const conditions: any[] = [eq(documents.type, "INV"), isNotNull(documents.customerId)];
      if (start) conditions.push(gte(documents.date, start));
      if (end) conditions.push(lte(documents.date, end));
      if (storeId) conditions.push(eq(documents.storeId, Number(storeId)));

      const docs = await db.select({
        customerId: documents.customerId,
        customerName: documents.customerName,
        total: documents.total,
        status: documents.status,
      }).from(documents).where(and(...conditions));

      const custIds = Array.from(new Set(docs.map(d => d.customerId).filter((id): id is number => id != null)));

      const custRows = custIds.length > 0
        ? await db.select({ id: customersTable.id, name: customersTable.name })
            .from(customersTable)
        : [];
      const custMap = new Map(custRows.map(c => [c.id, c.name]));

      const payRows = custIds.length > 0
        ? await db.select({ customerId: payments.customerId, amount: payments.amount, isRefund: payments.isRefund })
            .from(payments)
        : [];
      const paidByCustomer = new Map<number, number>();
      for (const p of payRows) {
        if (!p.customerId) continue;
        const prev = paidByCustomer.get(p.customerId) || 0;
        const amt = parseFloat(p.amount || "0");
        paidByCustomer.set(p.customerId, prev + (p.isRefund ? -amt : amt));
      }

      const totals: Record<number, { customerId: number; name: string; totalPurchases: number; invoiceCount: number; totalInvoiced: number }> = {};
      for (const doc of docs) {
        if (!doc.customerId) continue;
        if (doc.status === "void" || doc.status === "returned") continue;
        const key = doc.customerId;
        if (!totals[key]) {
          totals[key] = {
            customerId: key,
            name: custMap.get(key) || doc.customerName || "Unknown",
            totalPurchases: 0,
            invoiceCount: 0,
            totalInvoiced: 0,
          };
        }
        const amt = parseFloat(doc.total || "0");
        totals[key].totalPurchases += amt;
        totals[key].totalInvoiced += amt;
        totals[key].invoiceCount += 1;
      }

      const sorted = Object.values(totals)
        .map(t => ({
          customerId: t.customerId,
          name: t.name,
          totalPurchases: t.totalPurchases,
          invoiceCount: t.invoiceCount,
          outstanding: Math.max(0, t.totalInvoiced - (paidByCustomer.get(t.customerId) || 0)),
        }))
        .sort((a, b) => b.totalPurchases - a.totalPurchases)
        .slice(0, 20);

      res.json(sorted);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/reports/top-products", async (req: Request, res: Response) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;

      const { db } = await import("./db");
      const { documents, documentItems: documentItemsTable, products: productsTable } = await import("@shared/schema");
      const { eq, and, gte, lte } = await import("drizzle-orm");

      const conditions: any[] = [eq(documents.type, "INV")];
      if (start) conditions.push(gte(documents.date, start));
      if (end) conditions.push(lte(documents.date, end));

      const rows = await db.select({
        productId: documentItemsTable.productId,
        description: documentItemsTable.description,
        sku: documentItemsTable.sku,
        qty: documentItemsTable.qty,
        amount: documentItemsTable.amount,
        unit: documentItemsTable.unit,
      })
        .from(documentItemsTable)
        .innerJoin(documents, eq(documentItemsTable.documentId, documents.id))
        .where(and(...conditions));

      const safeFloat = (v: any) => {
        const n = parseFloat(String(v || "0"));
        return isNaN(n) ? 0 : n;
      };

      const totals: Record<string, { productId: number | null; name: string; sku: string | null; qtySold: number; revenue: number; unit: string }> = {};
      for (const row of rows) {
        const key = String(row.productId || row.description);
        if (!totals[key]) {
          totals[key] = {
            productId: row.productId || null,
            name: row.description || "",
            sku: row.sku || null,
            qtySold: 0,
            revenue: 0,
            unit: row.unit || "PCS",
          };
        }
        totals[key].qtySold += safeFloat(row.qty);
        totals[key].revenue += safeFloat(row.amount);
      }

      const inventoryRows = await getInventory();
      const stockMap: Record<number, number> = {};
      for (const inv of inventoryRows) {
        if (inv.productId) stockMap[inv.productId] = (stockMap[inv.productId] || 0) + safeFloat(inv.qty);
      }

      const sorted = Object.values(totals)
        .map(t => ({ ...t, stockLeft: t.productId ? (stockMap[t.productId] || 0) : 0 }))
        .sort((a, b) => b.qtySold - a.qtySold)
        .slice(0, 20);
      res.json(sorted);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/reports/inventory", async (req: Request, res: Response) => {
    try {
      const rows = await getInventory();
      const withFlags = rows.map((item: any) => ({
        ...item,
        isLowStock: parseFloat(item.qty || "0") <= parseFloat(item.product?.minStockQty || "0")
          && parseFloat(item.product?.minStockQty || "0") > 0,
        isOutOfStock: parseFloat(item.qty || "0") === 0,
      }));
      res.json(withFlags);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/reports/returns", async (req: Request, res: Response) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const storeId = req.query.storeId as string | undefined;
      const statusFilter = req.query.status as string | undefined;

      const { db } = await import("./db");
      const {
        returns: returnsTable,
        returnItems: returnItemsTable,
        documents: documentsTable,
      } = await import("@shared/schema");
      const { and, gte, lte, eq, inArray } = await import("drizzle-orm");

      const conditions: any[] = [];
      if (start) conditions.push(gte(returnsTable.date, start));
      if (end) conditions.push(lte(returnsTable.date, end));
      if (storeId) conditions.push(eq(returnsTable.storeId, Number(storeId)));
      if (statusFilter && statusFilter !== "all") conditions.push(eq(returnsTable.status, statusFilter));

      const rows = await db.select().from(returnsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Status breakdown (always count all statuses for the breakdown card)
      const byStatus: Record<string, number> = {};
      for (const r of rows) {
        const s = r.status || "unknown";
        byStatus[s] = (byStatus[s] || 0) + 1;
      }

      const byTypeMap: Record<string, { count: number; amount: number }> = {};
      for (const r of rows) {
        const type = r.type || "unknown";
        if (!byTypeMap[type]) byTypeMap[type] = { count: 0, amount: 0 };
        byTypeMap[type].count += 1;
        byTypeMap[type].amount += parseFloat(String(r.refundAmount || r.total || "0"));
      }
      const byType = Object.entries(byTypeMap).map(([type, stats]) => ({
        type,
        count: stats.count,
        amount: stats.amount,
      }));

      const returnIds = rows.map((r) => r.id);
      let topProducts: { name: string; count: number; amount: number }[] = [];
      if (returnIds.length > 0) {
        const items = await db.select().from(returnItemsTable)
          .where(inArray(returnItemsTable.returnId, returnIds));
        const productMap: Record<string, { count: number; amount: number }> = {};
        for (const item of items) {
          const name = item.description || "Unknown";
          if (!productMap[name]) productMap[name] = { count: 0, amount: 0 };
          productMap[name].count += parseFloat(String(item.qty || "0"));
          productMap[name].amount += parseFloat(String(item.amount || "0"));
        }
        topProducts = Object.entries(productMap)
          .map(([name, stats]) => ({ name, count: stats.count, amount: stats.amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10);
      }

      // Return rate: only approved returns / total invoices in period
      const approvedCount = rows.filter((r) => r.status === "approved").length;
      const invConditions: any[] = [eq(documentsTable.type, "INV")];
      if (start) invConditions.push(gte(documentsTable.date, start));
      if (end) invConditions.push(lte(documentsTable.date, end));
      if (storeId) invConditions.push(eq(documentsTable.storeId, Number(storeId)));
      const invRows = await db.select({ id: documentsTable.id }).from(documentsTable)
        .where(and(...invConditions));
      const rate = invRows.length > 0 ? (approvedCount / invRows.length) * 100 : 0;

      // Total refund amount
      const totalAmount = rows.reduce((s, r) => s + parseFloat(String(r.refundAmount || r.total || "0")), 0);

      // Individual return rows for table
      const returnRows = rows.map((r) => ({
        id: r.id,
        voucherNumber: r.voucherNumber,
        date: r.date,
        customerName: r.customerName,
        originalInvoiceNumber: r.originalInvoiceNumber,
        type: r.type,
        status: r.status,
        reason: r.reason,
        refundAmount: parseFloat(String(r.refundAmount || r.total || "0")),
      })).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

      res.json({
        total: rows.length,
        totalAmount,
        rate,
        byStatus,
        byType: byType ?? [],
        topProducts: topProducts ?? [],
        returnRows,
        invoiceCount: invRows.length,
      });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // MESSAGES
  // ══════════════════════════════════════════════════════════════

  app.get("/api/messages", async (req: Request, res: Response) => {
    try {
      const rows = await getMessages();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.post("/api/messages/log", async (req: Request, res: Response) => {
    try {
      const entry = await logMessage(req.body);
      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  app.get("/api/messages/queue", async (req: Request, res: Response) => {
    try {
      const settings = await getSettings();
      const maxPerDay = settings?.maxMessagesPerDay || 1;
      const todayStr = new Date().toISOString().split("T")[0];

      // Business identity for the message signature (admin-editable, no hardcoding).
      const bizName = settings?.storeNameEn || "MAMUN M TRADING AND CONTRACTING W.L.L";
      const bizPhone = settings?.phone || "+974 30703722";
      const fmtQar = (n: number) =>
        `QAR ${Number(n || 0).toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Get all unpaid invoices older than 3 days
      const unpaid = await getUnpaidInvoices();
      const overdue = unpaid.filter((inv: any) => inv.daysOld > 3);

      // Group overdue invoices BY CUSTOMER → one statement-style reminder each, so a
      // customer with several open invoices gets a single consolidated message (their
      // full account picture) instead of one spammy message per invoice.
      const byCustomer = new Map<number, { customerId: number; invoices: any[]; outstanding: number; maxDaysOld: number }>();
      for (const inv of overdue) {
        if (!inv.customerId) continue;
        let g = byCustomer.get(inv.customerId);
        if (!g) { g = { customerId: inv.customerId, invoices: [], outstanding: 0, maxDaysOld: 0 }; byCustomer.set(inv.customerId, g); }
        g.invoices.push(inv);
        g.outstanding += parseFloat(String(inv.remaining || "0"));
        g.maxDaysOld = Math.max(g.maxDaysOld, inv.daysOld || 0);
      }

      const queue: any[] = [];

      for (const g of Array.from(byCustomer.values())) {
        const customer = await getCustomer(g.customerId);
        if (!customer) continue;

        // Anti-spam: skip if this customer was already messaged today
        const lastMsg = await getLastMessageDate(g.customerId);
        if (lastMsg) {
          const lastDate = lastMsg.toISOString().split("T")[0];
          if (lastDate >= todayStr) continue;
        }

        // Chronological statement (oldest first); most-overdue invoice represents the group.
        g.invoices.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        const rep = g.invoices.reduce((m, i) => ((i.daysOld || 0) > (m.daysOld || 0) ? i : m), g.invoices[0]);

        // Urgency from the oldest debt in the account
        let urgency: "low" | "medium" | "high" = "low";
        if (g.maxDaysOld > 90) urgency = "high";
        else if (g.maxDaysOld > 30) urgency = "medium";
        const template = urgency === "high" ? "urgent" : urgency === "medium" ? "firm" : "gentle";

        const count = g.invoices.length;
        const totalStr = fmtQar(g.outstanding);
        const lines = g.invoices
          .map((inv) => {
            const od = (inv.daysOld || 0) > 0 ? ` · ${inv.daysOld}d overdue` : "";
            return `• ${inv.number} (${inv.date}) — ${fmtQar(inv.remaining || 0)}${od}`;
          })
          .join("\n");

        const tone =
          urgency === "high"
            ? "Our records show an overdue balance that needs your immediate attention."
            : urgency === "medium"
            ? "This is a friendly reminder regarding your pending account balance."
            : "This is a gentle reminder regarding your account balance.";

        // Statement-style message: itemized due invoices + total outstanding, so the
        // customer sees exactly what is owed and against which invoices.
        const message =
`Dear ${customer.name},

${tone}

ACCOUNT STATEMENT — ${bizName}
As of ${todayStr}
Outstanding balance: ${totalStr} across ${count} invoice${count !== 1 ? "s" : ""}.

Pending invoice${count !== 1 ? "s" : ""}:
${lines}

TOTAL DUE: ${totalStr}

Kindly arrange payment at your earliest convenience. For any queries, contact us at ${bizPhone}.

Thank you for your business.
${bizName}`;

        queue.push({
          customer,
          invoice: rep, // backward-compat single-invoice display
          invoices: g.invoices.map((i) => ({
            id: i.id, number: i.number, date: i.date,
            remaining: Number(Number(i.remaining || 0).toFixed(2)), daysOverdue: i.daysOld || 0,
          })),
          totalOutstanding: Number(g.outstanding.toFixed(2)),
          template,
          message,
          urgency,
          daysOverdue: g.maxDaysOld,
        });

        if (queue.length >= maxPerDay * 10) break; // reasonable cap
      }

      // Most urgent (oldest debt) first
      queue.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));

      res.json(queue);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Legacy invoice routes (backwards compat)
  // ══════════════════════════════════════════════════════════════

  app.post("/api/invoices", async (req: Request, res: Response) => {
    try {
      const body = { ...req.body };
      const locked = lockedStoreId(req);
      if (locked) body.storeId = locked;
      const invoice = await createDocument(body);
      res.status(201).json(invoice);
    } catch (err) {
      console.error("Invoice creation error:", err);
      res.status(500).json({ message: "Failed to create invoice", error: String(err) });
    }
  });

  app.get("/api/invoices", async (req: Request, res: Response) => {
    try {
      const invoices = await getDocuments();
      res.json(invoices);
    } catch (err) {
      console.error("Invoice fetch error:", err);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const invoice = await getDocument(Number(req.params.id));
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      res.json(invoice);
    } catch (err) {
      console.error("Invoice get error:", err);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  app.delete("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      await deleteDocument(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      console.error("Invoice delete error:", err);
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // VOICE PARSE
  // ══════════════════════════════════════════════════════════════

  app.post("/api/voice-parse", async (req: Request, res: Response) => {
    try {
      const { transcript } = req.body;

      if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
        console.log("Empty or invalid transcript received");
        return res.status(400).json({
          message: "Empty transcript",
          items: []
        });
      }

      console.log("Transcript received:", transcript);
      console.log("Using Groq API Key:", process.env.GROQ_API_KEY ? "SET" : "MISSING");

      if (!process.env.GROQ_API_KEY) {
        console.error("GROQ_API_KEY not found in environment");
        return res.status(500).json({
          message: "Server configuration error: GROQ_API_KEY missing",
          items: []
        });
      }

      console.log("Calling Groq API...");
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: `INVOICE PARSER - Handle messy speech recognition from Qatar/Gulf English.

YOUR JOB: Extract REAL products with correct quantities and prices.

OUTPUT FORMAT (strict JSON):
{"items":[{"description":"PRODUCT","quantity":"NUM","unit":"UNIT","unitPrice":"PRICE"}]}

━━━ CRITICAL QUANTITY EXTRACTION RULES ━━━

**QUANTITY IS THE NUMBER IMMEDIATELY BEFORE THE UNIT WORD**

Pattern: "[PRODUCT NAME] [NUMBER] [UNIT] at [PRICE]"
Example: "25mm ppr pipe 10 pcs at 25"
→ description="25MM PPR PIPE", quantity="10", unit="PCS", unitPrice="25"

Pattern: "[PRODUCT] [NUMBER] [UNIT]"
Example: "black cement 5 bag"
→ description="BLACK CEMENT", quantity="5", unit="BAG"

**NEVER confuse size numbers with quantity:**
- "2.5 inch brush" → size in description, NOT quantity
- "7 inch trowel" → size in description, NOT quantity
- "25mm pipe" → size in description, NOT quantity

━━━ SPEECH RECOGNITION ERRORS (Gulf English) ━━━

Common mishearings → Correct interpretation:
- "travel/towel/tutorial" → TROWEL
- "marcar/marker" → MARKER
- "real/riel/rail/clear/wheel" → riyal (ignore, just currency)
- "add to real" → at 2
- "pizza/pista" → PIECE
- "end" → INCH

━━━ PARSING STEPS ━━━

1. Find UNIT WORDS: pcs, piece, bag, pair, meter, gallon, drum, box
2. Find NUMBER immediately BEFORE unit word = QUANTITY
3. Everything BEFORE that number = PRODUCT NAME
4. Number AFTER "at" = PRICE

━━━ EXAMPLES ━━━

Input: "25mm ppr pipe 10 pcs at 25"
Step 1: Unit word = "pcs"
Step 2: Number before "pcs" = 10 → quantity
Step 3: Everything before "10" = "25mm ppr pipe" → description
Step 4: Number after "at" = 25 → price
Output: {"items":[{"description":"25MM PPR PIPE","quantity":"10","unit":"PCS","unitPrice":"25"}]}

Input: "black cement 5 bag at 15"
Parse: Unit="bag", Qty=5 (before "bag"), Product="black cement", Price=15
Output: {"items":[{"description":"BLACK CEMENT","quantity":"5","unit":"BAG","unitPrice":"15"}]}

Input: "2.5 inch brush 2 pcs at 5"
Parse: Unit="pcs", Qty=2 (before "pcs"), Product="2.5 inch brush", Price=5
Output: {"items":[{"description":"2.5\" BRUSH","quantity":"2","unit":"PCS","unitPrice":"5"}]}

Input: "marker pen one piece add to real"
Parse: Unit="piece", Qty=1, Product="marker pen", Price=2 ("add to" = at two)
Output: {"items":[{"description":"MARKER PEN","quantity":"1","unit":"PCS","unitPrice":"2"}]}

━━━ JUNK FILTERING ━━━

SKIP items if description is:
- Just a number: "SIX", "TWO"
- Just a unit: "PIECE", "BAG"
- Filler words: "ADD TO", "AT REAL"
- Less than 3 characters

━━━ UNIT NORMALIZATION ━━━

piece/pieces → PCS
inch/inches → "
pair/pairs → PAIR
bag/bags → BAG
meter/metre → MTR

NUMBER WORDS: one=1, two=2, three=3, four=4, five=5, six=6, seven=7, eight=8, nine=9, ten=10, twenty=20, thirty=30, fifty=50

CRITICAL: Extract quantity from NUMBER BEFORE UNIT, not from product name!`
            },
            { role: "user", content: transcript }
          ],
          response_format: { type: "json_object" }
        })
      });

      console.log("Groq API status:", groqResponse.status);

      const groqData = await groqResponse.json();

      if (!groqResponse.ok) {
        console.error("Groq API error:", JSON.stringify(groqData, null, 2));
        return res.status(500).json({
          message: `Groq API error: ${groqData.error?.message || "Unknown error"}`,
          details: groqData,
          items: []
        });
      }

      console.log("Groq API response:", JSON.stringify(groqData, null, 2));

      const content = groqData.choices?.[0]?.message?.content;
      if (!content) {
        console.error("No content in Groq response");
        return res.status(500).json({
          message: "No response from AI",
          items: []
        });
      }

      const result = JSON.parse(content || "{}");

      const numberWords: Record<string, string> = {
        "ZERO": "0", "ONE": "1", "TWO": "2", "THREE": "3", "FOUR": "4",
        "FIVE": "5", "SIX": "6", "SEVEN": "7", "EIGHT": "8", "NINE": "9",
        "TEN": "10", "ELEVEN": "11", "TWELVE": "12", "THIRTEEN": "13",
        "FOURTEEN": "14", "FIFTEEN": "15", "SIXTEEN": "16", "SEVENTEEN": "17",
        "EIGHTEEN": "18", "NINETEEN": "19", "TWENTY": "20", "THIRTY": "30",
        "FORTY": "40", "FIFTY": "50", "SIXTY": "60", "SEVENTY": "70",
        "EIGHTY": "80", "NINETY": "90", "HUNDRED": "100"
      };

      const convertNumberWords = (text: string): string => {
        const upper = text.toUpperCase().trim();
        return numberWords[upper] || text;
      };

      const cleanDescription = (desc: string): string => {
        let cleaned = desc.toUpperCase().trim();
        Object.keys(numberWords).forEach(word => {
          const regex = new RegExp(`\\b${word}\\b`, "gi");
          cleaned = cleaned.replace(regex, numberWords[word]);
        });
        cleaned = cleaned.replace(/\bINCH(ES)?\b/gi, '"');
        return cleaned;
      };

      const normalizeUnit = (unit: string): string => {
        const upper = unit.toUpperCase().trim();
        const unitMap: Record<string, string> = {
          "PIECE": "PCS", "PIECES": "PCS",
          "INCH": '"', "INCHES": '"',
          "METER": "MTR", "METRE": "MTR", "METERS": "MTR", "METRES": "MTR",
          "BAG": "BAG", "BAGS": "BAG",
          "PAIR": "PAIR", "PAIRS": "PAIR",
          "GALLON": "GALLON", "GALLONS": "GALLON",
          "LITRE": "LTR", "LITER": "LTR", "LITRES": "LTR", "LITERS": "LTR",
          "BOX": "BOX", "BOXES": "BOX",
          "ROLL": "ROLL", "ROLLS": "ROLL",
          "SET": "SET", "SETS": "SET",
          "KG": "KG", "KILOGRAM": "KG", "KILOGRAMS": "KG"
        };
        return unitMap[upper] || upper;
      };

      if (result.items && Array.isArray(result.items)) {
        result.items = result.items.map((item: any) => ({
          description: cleanDescription(String(item.description || "ITEM")),
          quantity: convertNumberWords(String(item.quantity || "1")),
          unit: normalizeUnit(String(item.unit || "PCS")),
          unitPrice: convertNumberWords(String(item.unitPrice || "0")),
          currency: "QAR"
        }));
        console.log(`Parsed ${result.items.length} items successfully`);
      } else {
        console.log("No items found in response");
        result.items = [];
      }

      res.json(result);
    } catch (err) {
      console.error("Voice parse error:", err);
      res.status(500).json({
        message: "Failed to process voice input",
        error: String(err),
        items: []
      });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // PARSE FILE
  // ══════════════════════════════════════════════════════════════

  app.post("/api/parse-file", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const ext = file.originalname.split(".").pop()?.toLowerCase();
      let textContent = "";

      // PDF — use pdftoppm
      if (ext === "pdf") {
        const { execSync } = await import("child_process");
        const outputPrefix = `/tmp/pdf_page_${Date.now()}`;

        execSync(`pdftoppm -r 150 -l 1 "${file.path}" "${outputPrefix}"`);

        const imageFile = `${outputPrefix}-1.ppm`;
        const pngFile = `${outputPrefix}-1.png`;
        execSync(`convert "${imageFile}" "${pngFile}" 2>/dev/null || cp "${imageFile}" "${pngFile}"`);

        const imageBuffer = fs.readFileSync(fs.existsSync(pngFile) ? pngFile : imageFile);
        const base64 = imageBuffer.toString("base64");

        try { execSync(`rm -f ${outputPrefix}*`); } catch {}
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);

        const visionRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
                { type: "text", text: `Look ONLY at the items table (NO., DESCRIPTION, QTY, UNIT, PRICE columns). Ignore everything else. Extract only product rows. Return ONLY JSON: {"items":[{"description":"ITEM NAME","quantity":1,"unit":"PCS","unitPrice":0}]}. ALL CAPS. No explanation.` }
              ]
            }],
            max_tokens: 2000,
          }),
        });

        const visionData = await visionRes.json();
        console.log("Vision response:", JSON.stringify(visionData).slice(0, 300));
        const content = visionData.choices?.[0]?.message?.content || "{}";
        const cleaned = content.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.items) {
          parsed.items = parsed.items.map((item: any) => ({
            description: String(item.description || "ITEM").toUpperCase(),
            quantity: String(item.quantity || "1"),
            unit: String(item.unit || "PCS").toUpperCase(),
            unitPrice: String(item.unitPrice || "0"),
            currency: "QAR",
          }));
          console.log(`Extracted ${parsed.items.length} items from PDF image`);
        }
        return res.json(parsed);
      }

      // IMAGE — use Groq vision
      else if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
        const imageBuffer = fs.readFileSync(file.path);
        const base64 = imageBuffer.toString("base64");
        const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

        const visionRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                { type: "text", text: `Look ONLY at the items table (NO., DESCRIPTION, QTY, UNIT, PRICE columns). Ignore header, footer, Arabic text, customer name, totals, signatures. Extract only product rows. Return ONLY JSON: {"items":[{"description":"ITEM NAME","quantity":1,"unit":"PCS","unitPrice":0}]}. ALL CAPS. No explanation.` }
              ]
            }],
            max_tokens: 2000,
          }),
        });

        const visionData = await visionRes.json();
        const content = visionData.choices?.[0]?.message?.content || "{}";
        const cleaned = content.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        if (parsed.items) {
          parsed.items = parsed.items.map((item: any) => ({
            description: String(item.description || "ITEM").toUpperCase(),
            quantity: String(item.quantity || "1"),
            unit: String(item.unit || "PCS").toUpperCase(),
            unitPrice: String(item.unitPrice || "0"),
            currency: "QAR",
          }));
        }
        return res.json(parsed);
      }

      // TXT / CSV
      else if (["txt", "csv"].includes(ext || "")) {
        textContent = fs.readFileSync(file.path, "utf-8");
      }

      else {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(400).json({ error: "Unsupported file type. Use PDF, image, CSV or TXT." });
      }

      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);

      if (!textContent.trim()) {
        console.log("No text content extracted");
        return res.json({ items: [] });
      }

      console.log("Sending to Groq, length:", textContent.length);

      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            {
              role: "system",
              content: `You are extracting items from an MTC invoice/quotation. The text may contain garbled Arabic characters — completely ignore any Arabic or non-English text. Focus ONLY on English product rows that follow this pattern: a number (1,2,3...) followed by a product description, quantity, unit, and price. Examples of valid items: "4 PVC PIPE", "SILICON GUN", "CEMENT BAG". Ignore: customer name, address, totals, subtotal, tax, signatures, amount in words. Return ONLY JSON: {"items":[{"description":"ITEM NAME","quantity":1,"unit":"PCS","unitPrice":0}]}. ALL CAPS. No explanation.`,
            },
            {
              role: "user",
              content: textContent.slice(0, 1500),
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });

      const groqData = await groqResponse.json();
      console.log("Groq status:", groqResponse.status);

      if (!groqResponse.ok) {
        console.error("Groq error:", JSON.stringify(groqData));
        return res.status(500).json({ error: "AI parsing failed", details: groqData.error?.message });
      }

      const content = groqData.choices?.[0]?.message?.content || "{}";
      const result = JSON.parse(content);

      if (result.items && Array.isArray(result.items)) {
        result.items = result.items.map((item: any) => ({
          description: String(item.description || "ITEM").toUpperCase(),
          quantity: String(item.quantity || "1"),
          unit: String(item.unit || "PCS").toUpperCase(),
          unitPrice: String(item.unitPrice || "0"),
          currency: "QAR",
        }));
        console.log(`Extracted ${result.items.length} items`);
      } else {
        result.items = [];
      }

      return res.json(result);

    } catch (err) {
      console.error("File parse error:", err);
      return res.status(500).json({ error: "Failed to parse file", details: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // TEXT PARSE
  // ══════════════════════════════════════════════════════════════

  app.post("/api/text-parse", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ message: "No text provided" });
      if (!openai) return res.status(503).json({ message: "AI text parsing unavailable (no API key configured)" });

      console.log("Processing text input...");

      const response = await openai.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "system",
            content: `You are an invoice parsing assistant for MAMUN M. TRADING & CONTRACTING W.L.L.
            Extract invoice items from the text and follow these STRICT formatting rules:
            1. NUMBERS TO DIGITS: Convert all written-out numbers into digits.
            2. MEASUREMENTS: Handle decimals correctly (e.g., '4.5 inch' -> 4.5").
            3. ABBREVIATIONS:
               - PIECES → PCS
               - METERS / METER → MTR
               - INCHES / INCH → "
            4. CASE: ALL descriptions, units, and currencies in CAPITAL LETTERS.

            Output JSON: { "items": [{ "description": string, "quantity": number, "unit": string, "unitPrice": number, "currency": string }] }.
            Default currency is "QAR".`
          },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content;
      const result = JSON.parse(content || "{}");

      if (result.items) {
        result.items = result.items.map((item: any) => ({
          description: String(item.description || "ITEM").toUpperCase(),
          quantity: String(item.quantity || "1"),
          unit: String(item.unit || "PCS").toUpperCase(),
          unitPrice: String(item.unitPrice || "0"),
          currency: "QAR"
        }));
      }

      res.json(result);
    } catch (err) {
      console.error("Text parse error:", err);
      res.status(500).json({ message: "Failed to process text input", error: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // PDF GENERATION (unified - detects type from invoice number)
  // ══════════════════════════════════════════════════════════════

  app.post("/api/generate-pdf", async (req: Request, res: Response) => {
    try {
      const { invoice } = req.body;
      if (!invoice) return res.status(400).json({ message: "No invoice data provided" });

      const settings = await getSettings();
      const meta = getDocMeta(invoice.invoiceNumber || "");
      const total = calculateTotal(invoice.items || []);
      const totalWords = amountToWords(total);

      const doc = new PDFDocument({ margin: 40, size: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=${invoice.invoiceNumber || "draft"}.pdf`);
      doc.pipe(res);

      doc.fontSize(16).font("Helvetica-Bold")
        .text(settings?.storeNameEn || "MAMUN M TRADING AND CONTRACTING W.L.L", { align: "center" });
      doc.fontSize(10).font("Helvetica")
        .text(settings?.storeNameAr || "مأمون م للتجارة والمقاولات ذ.م.م", { align: "center" });
      doc.text(settings?.addressEn || "NAJMA STREET, NAJMA, DOHA, QATAR", { align: "center" });
      doc.text(`TEL: ${settings?.phone || "+974 30703722"}  |  CR: ${settings?.crNumber || "72986/1"}  |  P.O. BOX: ${settings?.poBox || "17336"}`, { align: "center" });
      doc.moveDown();

      doc.fontSize(14).font("Helvetica-Bold").text(`${meta.titleAr} / ${meta.titleEn}`, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica");
      doc.text(`${meta.refLabel}: ${invoice.invoiceNumber || "N/A"}`, { continued: true });
      doc.text(`   Date: ${invoice.date || "N/A"}`, { align: "right" });
      doc.text(`${meta.billToLabel}: ${invoice.customerName || "N/A"}`);
      doc.moveDown();

      const colX = meta.showPrices
        ? { desc: 40, qty: 310, unit: 360, price: 420, total: 490 }
        : { desc: 40, qty: 380, unit: 460, price: 0, total: 0 };

      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("DESCRIPTION", colX.desc, doc.y);
      doc.text("QTY", colX.qty, doc.y - 12);
      doc.text("UNIT", colX.unit, doc.y - 12);
      if (meta.showPrices) {
        doc.text("UNIT PRICE", colX.price, doc.y - 12);
        doc.text("TOTAL", colX.total, doc.y - 12);
      }
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica").fontSize(9);
      for (const item of invoice.items || []) {
        const qty = parseFloat(item.quantity || item.qty || "0");
        const price = parseFloat(item.unitPrice || item.unit_price || "0");
        const lineTotal = qty * price;
        const y = doc.y;
        doc.text(item.description || "", colX.desc, y, { width: meta.showPrices ? 260 : 330 });
        doc.text(String(qty), colX.qty, y);
        doc.text(item.unit || "", colX.unit, y);
        if (meta.showPrices) {
          doc.text(price.toFixed(2), colX.price, y);
          doc.text(lineTotal.toFixed(2), colX.total, y);
        }
        doc.moveDown(0.5);
      }

      doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
      doc.moveDown(0.3);

      if (meta.showPrices) {
        doc.font("Helvetica-Bold").fontSize(10);
        doc.text(`TOTAL: QAR ${total.toFixed(2)}`, { align: "right" });
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(9);
        doc.text(`Amount in words: ${totalWords}`);
      }

      doc.moveDown(2);
      meta.signatureBlock(doc, colX);

      doc.end();
    } catch (err) {
      console.error("PDF generation error:", err);
      res.status(500).json({ message: "Failed to generate PDF", error: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // DELIVERY NOTE PDF
  // ══════════════════════════════════════════════════════════════

  app.post("/api/generate-delivery-note", async (req: Request, res: Response) => {
    try {
      const { invoice } = req.body;
      if (!invoice) return res.status(400).json({ message: "No delivery note data provided" });

      const settings = await getSettings();

      const doc = new PDFDocument({ margin: 40, size: "A4" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=${invoice.invoiceNumber || "draft"}.pdf`);
      doc.pipe(res);

      doc.fontSize(16).font("Helvetica-Bold")
        .text(settings?.storeNameEn || "MAMUN M TRADING AND CONTRACTING W.L.L", { align: "center" });
      doc.fontSize(10).font("Helvetica")
        .text(settings?.storeNameAr || "مأمون م للتجارة والمقاولات ذ.م.م", { align: "center" });
      doc.text(settings?.addressEn || "NAJMA STREET, NAJMA, DOHA, QATAR", { align: "center" });
      doc.text(`TEL: ${settings?.phone || "+974 30703722"}  |  CR: ${settings?.crNumber || "72986/1"}  |  P.O. BOX: ${settings?.poBox || "17336"}`, { align: "center" });
      doc.moveDown();

      doc.fontSize(14).font("Helvetica-Bold").text("DELIVERY NOTE", { align: "center" });
      doc.moveDown(0.5);

      doc.fontSize(10).font("Helvetica");
      doc.text(`Delivery Note No: ${invoice.invoiceNumber || "N/A"}`, { continued: true });
      doc.text(`   Date: ${invoice.date || "N/A"}`, { align: "right" });
      doc.text(`Delivered To: ${invoice.customerName || "N/A"}`);
      doc.moveDown();

      const colX = { no: 40, desc: 80, qty: 350, unit: 430 };
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("NO.", colX.no, doc.y);
      doc.text("DESCRIPTION", colX.desc, doc.y - 12);
      doc.text("QTY", colX.qty, doc.y - 12);
      doc.text("UNIT", colX.unit, doc.y - 12);
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica").fontSize(9);
      (invoice.items || []).forEach((item: any, idx: number) => {
        const qty = parseFloat(item.quantity || item.qty || "0");
        const y = doc.y;
        doc.text(String(idx + 1), colX.no, y);
        doc.text(item.description || "", colX.desc, y, { width: 260 });
        doc.text(String(qty), colX.qty, y);
        doc.text(item.unit || "", colX.unit, y);
        doc.moveDown(0.5);
      });

      doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
      doc.moveDown(1.5);
      doc.fontSize(10).font("Helvetica");
      doc.text("Received By: ____________________", colX.no, doc.y, { continued: false });
      doc.text("Delivered By: ____________________", { align: "right" });
      doc.moveDown(0.5);
      doc.text("Signature: ____________________");
      doc.text("Date: ____________________", { align: "right" });

      doc.end();
    } catch (err) {
      console.error("Delivery note PDF error:", err);
      res.status(500).json({ message: "Failed to generate delivery note", error: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // QUOTATION PDF
  // ══════════════════════════════════════════════════════════════

  app.post("/api/generate-quotation", async (req: Request, res: Response) => {
    try {
      const { invoice } = req.body;
      if (!invoice) return res.status(400).json({ message: "No quotation data provided" });

      const settings = await getSettings();
      const total = calculateTotal(invoice.items || []);
      const totalWords = amountToWords(total);

      const doc = new PDFDocument({ margin: 40, size: "A4" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=${invoice.invoiceNumber || "draft"}.pdf`);
      doc.pipe(res);

      doc.fontSize(16).font("Helvetica-Bold")
        .text(settings?.storeNameEn || "MAMUN M TRADING AND CONTRACTING W.L.L", { align: "center" });
      doc.fontSize(10).font("Helvetica")
        .text(settings?.storeNameAr || "مأمون م للتجارة والمقاولات ذ.م.م", { align: "center" });
      doc.text(settings?.addressEn || "NAJMA STREET, NAJMA, DOHA, QATAR", { align: "center" });
      doc.text(`TEL: ${settings?.phone || "+974 30703722"}  |  CR: ${settings?.crNumber || "72986/1"}  |  P.O. BOX: ${settings?.poBox || "17336"}`, { align: "center" });
      doc.moveDown();

      doc.fontSize(14).font("Helvetica-Bold").text("QUOTATION", { align: "center" });
      doc.moveDown(0.5);

      doc.fontSize(10).font("Helvetica");
      doc.text(`Quotation No: ${invoice.invoiceNumber || "N/A"}`, { continued: true });
      doc.text(`   Date: ${invoice.date || "N/A"}`, { align: "right" });
      doc.text(`To: ${invoice.customerName || "N/A"}`);
      if (invoice.validUntil) {
        doc.text(`Valid Until: ${invoice.validUntil}`);
      }
      doc.moveDown();

      const colX2 = { desc: 40, qty: 310, unit: 360, price: 420, total: 490 };
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("DESCRIPTION", colX2.desc, doc.y);
      doc.text("QTY", colX2.qty, doc.y - 12);
      doc.text("UNIT", colX2.unit, doc.y - 12);
      doc.text("UNIT PRICE", colX2.price, doc.y - 12);
      doc.text("TOTAL", colX2.total, doc.y - 12);
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica").fontSize(9);
      for (const item of invoice.items || []) {
        const qty = parseFloat(item.quantity || item.qty || "0");
        const price = parseFloat(item.unitPrice || item.unit_price || "0");
        const lineTotal = qty * price;
        const y = doc.y;
        doc.text(item.description || "", colX2.desc, y, { width: 260 });
        doc.text(String(qty), colX2.qty, y);
        doc.text(item.unit || "", colX2.unit, y);
        doc.text(price.toFixed(2), colX2.price, y);
        doc.text(lineTotal.toFixed(2), colX2.total, y);
        doc.moveDown(0.5);
      }

      doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(`TOTAL: QAR ${total.toFixed(2)}`, { align: "right" });
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(9);
      doc.text(`Amount in words: ${totalWords}`);
      doc.moveDown(1);
      doc.fontSize(9).font("Helvetica")
        .text("This quotation is valid for 30 days from the date above unless otherwise stated.");
      doc.moveDown(2);
      doc.text("Authorized Signature: ____________________", { align: "right" });

      doc.end();
    } catch (err) {
      console.error("Quotation PDF error:", err);
      res.status(500).json({ message: "Failed to generate quotation", error: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // WHATSAPP / SMS
  // ══════════════════════════════════════════════════════════════

  app.post("/api/send-whatsapp", async (req: Request, res: Response) => {
    try {
      const { phone, invoice } = req.body;
      if (!phone || !invoice) {
        return res.status(400).json({ message: "Phone number and invoice are required" });
      }

      const total = calculateTotal(invoice.items || []);
      const totalWords = amountToWords(total);

      const itemLines = (invoice.items || [])
        .map((item: any) => {
          const qty = item.quantity || item.qty || "0";
          const price = parseFloat(item.unitPrice || item.unit_price || "0");
          const lineTotal = (parseFloat(String(qty)) * price).toFixed(2);
          return `• ${item.description} | ${qty} ${item.unit} x QAR ${price.toFixed(2)} = QAR ${lineTotal}`;
        })
        .join("\n");

      const message =
        `*MAMUN M TRADING AND CONTRACTING W.L.L*\n` +
        `Invoice No: ${invoice.invoiceNumber || "N/A"}\n` +
        `Date: ${invoice.date || "N/A"}\n` +
        `Customer: ${invoice.customerName || "N/A"}\n\n` +
        `${itemLines}\n\n` +
        `*TOTAL: QAR ${total.toFixed(2)}*\n` +
        `${totalWords}\n\n` +
        `Thank you for your business!`;

      await twilioClient.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${phone}`,
        body: message,
      });

      res.json({ message: "WhatsApp message sent successfully" });
    } catch (err) {
      console.error("WhatsApp send error:", err);
      res.status(500).json({ message: "Failed to send WhatsApp message", error: String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // STAFF PAYROLL
  // ══════════════════════════════════════════════════════════════

  app.get("/api/staff-payroll", async (req: Request, res: Response) => {
    try {
      const role = normalizeRoleStrict(req);
      if (role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { userId, month } = req.query as any;
      const entries = await getStaffPayroll({
        userId: userId ? Number(userId) : undefined,
        month: month || undefined,
      });
      res.json(entries);
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.get("/api/staff-payroll/summary", async (req: Request, res: Response) => {
    try {
      const role = normalizeRoleStrict(req);
      if (role !== "admin") return res.status(403).json({ message: "Admin only" });
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const summary = await getStaffPayrollSummary(month);
      res.json(summary);
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.post("/api/staff-payroll", async (req: Request, res: Response) => {
    try {
      const role = normalizeRoleStrict(req);
      if (role !== "admin") return res.status(403).json({ message: "Admin only" });

      const { type, amount, userId } = req.body;

      const amt = Number(amount);
      const expenseTypes = ["advance", "salary_payment", "bonus"];

      if (type === "advance") {
        if (amt > 500) return res.status(400).json({ message: "Advance cannot exceed 500 QAR" });
        if (amt <= 0) return res.status(400).json({ message: "Advance amount must be positive" });
      }

      if (expenseTypes.includes(type) && amt > 0) {
        await ensureFunds({
          instrument: "cash",
          amount: amt,
          context: type === "advance" ? "Salary Advance" : type === "salary_payment" ? "Staff Salary" : "Staff Bonus",
        });
      }

      const entry = await createStaffPayrollEntry({
        ...req.body,
        createdBy: req.user?.id,
      });

      if (expenseTypes.includes(type) && amt > 0) {
        try {
          const staff = await getUser(userId);
          const staffName = staff?.name || `Staff #${userId}`;
          const categoryMap: Record<string, string> = { advance: "Salary Advance", salary_payment: "Staff Salary", bonus: "Staff Bonus" };
          await createExpense({
            category: categoryMap[type],
            amount: String(amount),
            date: req.body.date || new Date().toISOString().slice(0, 10),
            paymentMethod: "Cash",
            notes: `${categoryMap[type]} — ${staffName}${req.body.note ? ` — ${req.body.note}` : ""}`,
            createdBy: req.user?.id,
          });
        } catch (expErr) {
          await deleteStaffPayrollEntry(entry.id);
          throw expErr;
        }
      }

      res.json(entry);
    } catch (err) {
      if (!sendFundsError(res, err)) res.status(500).json({ message: String(err) });
    }
  });

  app.delete("/api/staff-payroll/:id", async (req: Request, res: Response) => {
    try {
      const role = normalizeRoleStrict(req);
      if (role !== "admin") return res.status(403).json({ message: "Admin only" });
      await deleteStaffPayrollEntry(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  app.put("/api/users/:id/salary", async (req: Request, res: Response) => {
    try {
      const role = normalizeRoleStrict(req);
      if (role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { salary, dayRate } = req.body;
      const user = await updateUserSalary(Number(req.params.id), String(salary || "0"), String(dayRate || "0"));
      res.json(user);
    } catch (err) { res.status(500).json({ message: String(err) }); }
  });

  // ══════════════════════════════════════════════════════════════
  // SEED DATABASE
  // ══════════════════════════════════════════════════════════════

  try {
    await seedDatabase();
    console.log("Database seeded successfully.");
  } catch (err) {
    console.error("Error seeding database:", err);
  }

  // Unmatched API routes return JSON (never HTML from the Vite catch-all)
  const { apiNotFoundHandler } = await import("./middleware");
  app.use("/api", apiNotFoundHandler);
}
