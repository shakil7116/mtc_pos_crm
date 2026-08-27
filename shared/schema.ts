import {
  pgTable, text, serial, integer, numeric, timestamp, date, boolean, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export * from "./models/chat";

// ─── Settings ────────────────────────────────────────────────────────────────
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  storeNameEn: text("store_name_en").notNull().default("MAMUN M TRADING AND CONTRACTING W.L.L"),
  storeNameAr: text("store_name_ar").notNull().default("مأمون م للتجارة والمقاولات ذ.م.م"),
  addressEn: text("address_en").notNull().default("NAJMA STREET, NAJMA, DOHA, QATAR"),
  addressAr: text("address_ar").notNull().default("شارع النجمة، النجمة، الدوحة، قطر"),
  phone: text("phone").notNull().default("+974 30703722"),
  whatsapp: text("whatsapp").default("+974 30703722"),
  email: text("email").default("info@mtc.com"),
  crNumber: text("cr_number").notNull().default("72986/1"),
  poBox: text("po_box").notNull().default("17336"),
  logoUrl: text("logo_url"),
  taxRate: numeric("tax_rate").default("0"),
  returnPolicyText: text("return_policy_text").default(
    "Returns accepted within 7 days with original invoice — materials must be undamaged and in original condition. Management decision is final.",
  ),
  largeOrderThreshold: numeric("large_order_threshold").default("5000"),
  // ── 11A configurable business rules (admin-editable, zero-hardcoded) ──
  pdcThreshold: numeric("pdc_threshold").default("4000"),      // VOID refunds ≥ this go out as PDC
  returnPdcThreshold: numeric("return_pdc_threshold").default("5000"), // RETURN refunds ≥ this → PDC or online (manager decides)
  returnApprovalThreshold: numeric("return_approval_threshold").default("1000"), // returns OVER this need manager/admin; at/under → salesman can process
  showPoField: boolean("show_po_field").default(true), // show the PO Number field on the invoice builder
  voidWindowHours: integer("void_window_hours").default(12),   // hours an invoice stays voidable
  creditTerms: integer("credit_terms").array().default([30, 60, 90]),
  pdcAlertDays: integer("pdc_alert_days").default(3),          // days before cheque date to alert
  maintenanceChequeThreshold: numeric("maintenance_cheque_threshold").default("10000"),
  // ── Customer behaviour-tier engine (system-calculated; NEVER printed on customer-facing docs) ──
  tierWindowMonths: integer("tier_window_months").default(6),          // rolling period for profit + frequency
  tierBestPct: numeric("tier_best_pct").default("10"),                 // top X% by profit → BEST
  tierBetterPct: numeric("tier_better_pct").default("30"),             // top X% by profit → BETTER (best..this band)
  tierDefaultTermDays: integer("tier_default_term_days").default(30),  // credit term used when paymentTerms unset/unparseable
  tierBadOverdueDays: integer("tier_bad_overdue_days").default(60),    // an invoice ≥ this many days past term → BAD
  tierBadLateCount: integer("tier_bad_late_count").default(2),         // ≥ this many late-paid invoices in window → BAD
  // Store hours → business-day boundary. "Today" runs open→close, not midnight.
  storeOpenTime: text("store_open_time").default("05:00"),
  storeCloseTime: text("store_close_time").default("22:00"),
  // Opening balances (Go-Live) — cash position starts here, never spuriously negative.
  openingCash: numeric("opening_cash").default("0"),
  openingBank: numeric("opening_bank").default("0"),
  quietHoursStart: text("quiet_hours_start").default("21:00"),
  quietHoursEnd: text("quiet_hours_end").default("08:00"),
  maxMessagesPerDay: integer("max_messages_per_day").default(1),
  autoQueueMessages: boolean("auto_queue_messages").default(true),
  googleMapsUrl: text("google_maps_url"),
  youtube: text("youtube"),
  tiktok: text("tiktok"),
  instagram: text("instagram"),
  facebook: text("facebook"),
  brands: text("brands").array().default([
    "DEWALT","STANLEY","TOTAL TOOLS","MILANO","NATIONAL",
    "BQ","BR","MÜLLER","KISTENMACHER","ORYX PAINTS","BERGER PAINTS",
  ]),
  setupComplete: boolean("setup_complete").default(false),
});

// ─── Stores ──────────────────────────────────────────────────────────────────
export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar"),
  address: text("address"),
  type: text("type").notNull().default("store"), // store | warehouse
  // For a warehouse: which store OWNS it. Same owner = free stock move; different
  // owner (or null = common) = cross-owner transfer that carries cost value.
  // For a store row this is null (a store owns itself).
  ownerStoreId: integer("owner_store_id"),
  active: boolean("active").notNull().default(true),
});

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // 5 roles: admin | manager | worker | salesman | driver  (legacy "staff"→salesman, "warehouse"/"warehouse_manager"/"salesman_helper"→worker)
  role: text("role").notNull().default("salesman"),
  pin: text("pin").notNull(),
  // ── JWT auth (Phase 7 — Go-Live blocker 1) ──
  email: text("email"),                           // owner/admin email (Google or business)
  username: text("username").unique(),           // login identifier
  passwordHash: text("password_hash"),           // bcrypt
  mustChangePassword: boolean("must_change_password").default(true), // first login forces change
  mustChangePin: boolean("must_change_pin").default(false), // force a fresh unique PIN on next login
  tokenVersion: integer("token_version").notNull().default(0), // bump → all tokens invalid
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),        // 10-min lock after too many failures
  storeId: integer("store_id").references(() => stores.id),
  active: boolean("active").notNull().default(true),
  salary: numeric("salary").default("0"),
  dayRate: numeric("day_rate").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Staff Payroll (advances, days off, salary payments) ────────────────────
export const staffPayroll = pgTable("staff_payroll", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),       // advance | day_off | salary_payment | deduction | bonus
  amount: numeric("amount").notNull().default("0"),
  date: date("date").notNull(),
  month: text("month").notNull(),     // YYYY-MM — payroll period this belongs to
  note: text("note"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Document Counters ───────────────────────────────────────────────────────
export const documentCounters = pgTable("document_counters", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().unique(),
  nextNumber: integer("next_number").notNull(),
  prefix: text("prefix"),                        // null → defaults to `type`
  digits: integer("digits").default(0),          // 0 → no zero-padding
  separator: text("separator").default("-"),     // "-" | "/" | ""  (INV-10034 | INV/10034 | INV10034)
});

// Audit trail for manual number jumps / skipped numbers (spec Step 1)
export const numberingAudit = pgTable("numbering_audit", {
  id: serial("id").primaryKey(),
  docType: text("doc_type").notNull(),
  oldNext: integer("old_next"),
  newNext: integer("new_next"),
  skipped: jsonb("skipped").default([]),         // e.g. [10035, 10036]
  reason: text("reason"),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Customers ───────────────────────────────────────────────────────────────
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  type: text("type").notNull().default("walk-in"), // walk-in | contractor | corporate | government
  creditLimit: numeric("credit_limit").default("0"),
  trn: text("trn"),
  address: text("address"),
  notes: text("notes"),
  paymentTerms: text("payment_terms"),
  logoUrl: text("logo_url"),
  customData: jsonb("custom_data").default({}), // admin-defined custom fields (dynamic schema)
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Suppliers ───────────────────────────────────────────────────────────────
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  whatsapp: text("whatsapp"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  paymentTerms: text("payment_terms"),
  creditDays: integer("credit_days").default(0),  // 0=cash supplier, 30/60/90=credit
  paymentMode: text("payment_mode").default("credit"), // cash | credit
  customData: jsonb("custom_data").default({}), // admin-defined custom fields (dynamic schema)
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Products ────────────────────────────────────────────────────────────────
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku"),
  name: text("name").notNull(),
  category: text("category"),
  unit: text("unit").notNull().default("PCS"),
  salePrice: numeric("sale_price").default("0"),        // retail (walk-in) price
  wholesalePrice: numeric("wholesale_price").default("0"), // contractor/corporate/government price
  costPrice: numeric("cost_price").default("0"),
  minStockQty: numeric("min_stock_qty").default("0"),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  // ── Physical location path (spec rule 22): Location → Area → Rack → Shelf.
  //    Options come from Settings (stores table + managed lists) — never hardcoded.
  locationStoreId: integer("location_store_id").references(() => stores.id),
  locationArea: text("location_area"),   // from managed list location_areas
  locationRack: text("location_rack"),   // from managed list location_racks
  locationShelf: text("location_shelf"), // from managed list location_shelves
  imageUrl: text("image_url"),           // optional product photo (Phase 9)
  // STOCK COUNTED? True for the handful of fast movers that get counted and kept
  // accurate. FALSE for the long tail: thousands of items that sell a few pieces a
  // month and are not worth counting. An uncounted product keeps its cost and sale
  // price, so profit on it is still exact - only its QUANTITY is unknown. It is
  // therefore never hidden from the sales picker, never raises a low-stock alert,
  // and is reported as "unknown" in stock valuation rather than counted as zero.
  trackStock: boolean("track_stock").notNull().default(true),
  customData: jsonb("custom_data").default({}), // admin-defined custom fields (dynamic schema)
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Product Aliases ─────────────────────────────────────────────────────────
// One physical product, many names. "PVC GOLMALA" is the trade name for the
// same item the catalogue calls "PVC TROWEL"; "RUNNER CHANNEL" and "TRACK
// CHANNEL" are one product. Recording those equivalences here is what stops a
// scanned supplier invoice from creating a second copy of a product you already
// stock (duplicates split the stock count and skew profit-per-product).
//
// Only TRUE equivalence belongs here — same physical item, different name.
// "SHOWER MIXER" and "FAUCET" must NOT be aliases: a shower mixer is a *kind
// of* faucet, and treating them as interchangeable ships the wrong goods. That
// relationship goes in products.category. See server/matching.ts.
export const productAliases = pgTable("product_aliases", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  alias: text("alias").notNull(),           // as typed/scanned, stored UPPERCASE
  aliasNorm: text("alias_norm").notNull(),  // normalizeName(alias) — UNIQUE, the lookup key
  source: text("source").notNull().default("manual"), // manual | ocr | import | ai
  confirmedBy: integer("confirmed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Inventory ───────────────────────────────────────────────────────────────
export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  storeId: integer("store_id").notNull().references(() => stores.id),
  qty: numeric("qty").notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Documents ───────────────────────────────────────────────────────────────
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // INV | QT | DN | CN
  number: text("number").notNull().unique(),
  date: date("date").notNull(),
  poNumber: text("po_number"),
  dueDate: date("due_date"), // credit payment deadline (invoice date + chosen term) — drives the footer Payment Due
  toStoreId: integer("to_store_id"),   // TR transfer destination location (storeId = source)
  takenBy: text("taken_by"),           // TR — who physically picked up the goods
  receivedBy: integer("received_by"),  // TR — the user who confirmed receipt at destination
  receivedAt: timestamp("received_at"),
  confirmMethod: text("confirm_method"),   // TR — how receipt was confirmed: on-system | signature | whatsapp | phone
  externalReceiver: text("external_receiver"), // TR — name of an off-system party who took delivery
  pricingApprovedBy: integer("pricing_approved_by"), // INV — manager who authorised a salesman's discount / price change
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name"),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  expectedDate: date("expected_date"),
  storeId: integer("store_id").references(() => stores.id),
  status: text("status").notNull().default("unpaid"),
  // unpaid | partial | paid | returned | partial_return | converted | void
  transactionMode: text("transaction_mode").default("real"), // real | demo
  paymentType: text("payment_type"), // Cash | Credit | Partial Credit | PDC Cheque (legacy summary label)
  deliveryMethod: text("delivery_method"), // pickup_store | pickup_warehouse | deliver_site
  // INV: pending | in_transit | delivered.  DN lifecycle: pending_pick | picked | authorized | in_transit | delivered
  deliveryStatus: text("delivery_status"),
  deliveryAddress: text("delivery_address"),
  expectedDeliveryDate: date("expected_delivery_date"), // when the DN is expected on site
  authorizedBy: integer("authorized_by").references(() => users.id),   // manager who authorised the DN
  authorizedAt: timestamp("authorized_at"),
  driverId: integer("driver_id").references(() => users.id), // assigned driver for site deliveries
  deliveryInstructions: text("delivery_instructions"),
  // ── Site-delivery proof + navigation (DN-level; NEVER printed on the invoice) ──
  mapLink: text("map_link"),                        // pasted Google Maps pin URL → navigate to site
  receiverName: text("receiver_name"),              // who received the goods on site
  receiverPhone: text("receiver_phone"),            // receiver contact number at delivery
  warehouseSignedBy: integer("warehouse_signed_by").references(() => users.id), // WH manager who released the load
  warehouseSignedAt: timestamp("warehouse_signed_at"),
  signedDnUrl: text("signed_dn_url"),               // uploaded photo (base64 data URL) of the all-party-signed paper DN
  damageReported: boolean("damage_reported").default(false),
  damageNotes: text("damage_notes"),
  damagePhoto: text("damage_photo"),                // base64 data URL of the damage photo
  damageReportedAt: timestamp("damage_reported_at"),
  damageResolution: text("damage_resolution"),         // returned_to_warehouse | customer_accepted | redelivery_requested
  damageResolutionNotes: text("damage_resolution_notes"),
  damageResolvedAt: timestamp("damage_resolved_at"),
  damageResolvedBy: integer("damage_resolved_by").references(() => users.id),
  footerDiscountBy: integer("footer_discount_by").references(() => users.id), // admin/manager who applied grand-total discount
  discountType: text("discount_type").default("QAR"),
  discountAmount: numeric("discount_amount").default("0"),
  subtotal: numeric("subtotal").notNull().default("0"),
  taxRate: numeric("tax_rate").default("0"),
  taxAmount: numeric("tax_amount").default("0"),
  total: numeric("total").notNull().default("0"),
  totalWords: text("total_words"),
  notes: text("notes"),
  customData: jsonb("custom_data").default({}), // admin-defined custom fields (dynamic schema)
  linkedDocId: integer("linked_doc_id"),
  originalInvoiceId: integer("original_invoice_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Document Items ───────────────────────────────────────────────────────────
export const documentItems = pgTable("document_items", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id),
  productId: integer("product_id").references(() => products.id),
  sku: text("sku"),
  description: text("description").notNull(),
  qty: numeric("qty").notNull(),
  unit: text("unit").notNull().default("PCS"),
  price: numeric("price").notNull(),
  discountType: text("discount_type").default("QAR"),
  discountAmount: numeric("discount_amount").default("0"),
  amount: numeric("amount").notNull(),
  // COGS SNAPSHOT: the product cost at the moment this line was sold. Profit used to
  // re-read products.cost_price at REPORT time, so a supplier price change silently
  // rewrote every historical margin. NULL on rows written before this column existed —
  // those fall back to the current cost (see resolveItemCost in server/storage.ts).
  costAtSale: numeric("cost_at_sale"),
  // Physical location this line is pulled from (per-line, staff-only — NEVER printed on
  // the customer copy). Drives per-location stock deduction + Delivery Note pick grouping.
  locationStoreId: integer("location_store_id").references(() => stores.id),
});

// ─── Payments ────────────────────────────────────────────────────────────────
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id),
  customerId: integer("customer_id").references(() => customers.id),
  amount: numeric("amount").notNull(),
  method: text("method").notNull(), // Cash | Bank Transfer | Cheque | Credit Card
  date: date("date").notNull(),
  reference: text("reference"),     // card ref no. OR online txn ref OR cheque no.
  phone: text("phone"),             // (legacy) customer phone
  bankName: text("bank_name"),      // bank for online transfer / cheque
  accountNumber: text("account_number"), // online transfer sender account / IBAN
  notes: text("notes"),
  isRefund: boolean("is_refund").default(false),
  recordedBy: integer("recorded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Cheques ─────────────────────────────────────────────────────────────────
export const cheques = pgTable("cheques", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  paymentId: integer("payment_id").references(() => payments.id),
  documentId: integer("document_id").references(() => documents.id), // linked invoice/PO
  refType: text("ref_type"), // e.g. "expense" — links a payable cheque back to its source
  refId: integer("ref_id"),
  type: text("type").notNull().default("receivable"), // receivable (customer→us) | payable (us→them)
  chequeNumber: text("cheque_number").notNull(),
  bankName: text("bank_name").notNull(),
  amount: numeric("amount").notNull(),
  chequeDate: date("cheque_date").notNull(),
  who: text("who"), // free-text name of giver/receiver (auto-filled from customer/supplier)
  status: text("status").notNull().default("pending"), // pending | deposited | cleared | bounced | cancelled
  depositedDate: date("deposited_date"),
  clearedDate: date("cleared_date"),
  bouncedDate: date("bounced_date"),
  photoUrl: text("photo_url"), // scanned cheque image (base64 data URL)
  depositProofUrl: text("deposit_proof_url"), // bank deposit slip photo (base64 data URL)
  depositedToAccount: text("deposited_to_account"), // which company bank account the cheque was deposited into
  clearanceProofUrl: text("clearance_proof_url"), // bank clearance confirmation (base64 data URL)
  recoveryStatus: text("recovery_status"), // bounced cheque recovery: replacement_requested | replacement_received | cash_requested | cash_received | written_off
  recoveryNotes: text("recovery_notes"),
  replacementChequeId: integer("replacement_cheque_id"), // new cheque that replaced a bounced one
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Returns ─────────────────────────────────────────────────────────────────
// ─── Return Vouchers (a.k.a. Sales Returns) — fully separate ledger ────────────
// Never mutates the original invoice; links back via originalInvoiceId for audit.
export const returns = pgTable("returns", {
  id: serial("id").primaryKey(),
  voucherNumber: text("voucher_number").unique(), // own serial: RV-xxxxxx
  originalInvoiceId: integer("original_invoice_id").references(() => documents.id), // nullable for manual/multi-invoice returns
  originalInvoiceNumber: text("original_invoice_number"), // denormalized for audit display
  sourceInvoices: jsonb("source_invoices").default([]), // [{invoiceId, invoiceNumber}] for multi-invoice returns
  isManual: boolean("is_manual").default(false), // true = ad-hoc return without invoice
  creditNoteId: integer("credit_note_id").references(() => documents.id),
  date: date("date"),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name"),
  storeId: integer("store_id").references(() => stores.id),
  type: text("type").notNull(), // full | partial | exchange | damage_claim | billing_correction
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  submittedBy: integer("submitted_by").references(() => users.id), // staff who raised it
  rejectionReason: text("rejection_reason"),
  reason: text("reason"),
  refundMethod: text("refund_method"),
  refundAmount: numeric("refund_amount"),
  total: numeric("total").default("0"),
  processedBy: integer("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  adminPin: text("admin_pin"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Return Items ─────────────────────────────────────────────────────────────
export const returnItems = pgTable("return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull().references(() => returns.id),
  documentItemId: integer("document_item_id").references(() => documentItems.id),
  productId: integer("product_id").references(() => products.id), // for stock reversal on approval
  description: text("description").notNull(),
  qty: numeric("qty").notNull(),
  unit: text("unit"),
  price: numeric("price"),
  amount: numeric("amount"),
  condition: text("condition").default("original"), // original | damaged
  damageDescription: text("damage_description"),
});

// ─── Approval Requests (generic override/approval inbox) ─────────────────────
// One row per override that needs a manager/admin decision: an over-limit sale,
// an invoice void, a discount/price change, or a free-form request a salesman
// raises. Returns keep their own `returns` table but surface in the same inbox
// on the client. On approval, the held action (see `payload`) is carried out.
export const approvalRequests = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  requestNumber: text("request_number").unique(),         // own serial: AR-######
  type: text("type").notNull(),                           // credit_limit | discount | void | manual
  status: text("status").notNull().default("pending"),    // pending | approved | rejected | cancelled
  requestedBy: integer("requested_by").references(() => users.id),
  requestedByName: text("requested_by_name"),             // denormalized for audit display
  storeId: integer("store_id").references(() => stores.id),
  title: text("title").notNull(),                         // short headline, e.g. "Credit-limit override"
  summary: text("summary"),                               // one-line context (customer, over-by, etc.)
  message: text("message"),                               // requester's free-form letter
  amount: numeric("amount"),                              // money at stake (exposure / refund / discount)
  entityType: text("entity_type"),                        // document | customer
  entityId: integer("entity_id"),                         // source doc/customer AND/OR doc created on approval
  payload: jsonb("payload"),                              // held action data (e.g. the full invoice draft)
  decidedBy: integer("decided_by").references(() => users.id),
  decidedByName: text("decided_by_name"),
  decidedAt: timestamp("decided_at"),
  decisionNote: text("decision_note"),                    // approver's note / rejection reason
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Edit Log ────────────────────────────────────────────────────────────────
export const editLog = pgTable("edit_log", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name"),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  isAdminOverride: boolean("is_admin_override").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Messages Log ────────────────────────────────────────────────────────────
export const messagesLog = pgTable("messages_log", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  documentId: integer("document_id").references(() => documents.id),
  type: text("type").notNull(),
  content: text("content"),
  sentAt: timestamp("sent_at").defaultNow(),
  sentBy: integer("sent_by").references(() => users.id),
  skipped: boolean("skipped").default(false),
});

// ─── Stock Adjustments ───────────────────────────────────────────────────────
export const stockAdjustments = pgTable("stock_adjustments", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  storeId: integer("store_id").notNull().references(() => stores.id),
  qtyChange: numeric("qty_change").notNull(),
  type: text("type").notNull(), // add | remove | transfer | sale | return
  reason: text("reason"),
  referenceId: integer("reference_id"),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Supplier Orders ─────────────────────────────────────────────────────────
export const supplierOrders = pgTable("supplier_orders", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  poNumber: text("po_number"),
  status: text("status").notNull().default("draft"), // draft | sent | partial | received | cancelled
  storeId: integer("store_id").references(() => stores.id), // destination location for received stock
  notes: text("notes"),
  items: jsonb("items").notNull().default([]), // [{productId,name,qty,unit,receivedQty}]
  paymentTermsDays: integer("payment_terms_days").default(0), // 30/60/90 — activated on full receipt
  receiptDate: date("receipt_date"),        // date fully received (terms clock start)
  paymentDueDate: date("payment_due_date"),  // receiptDate + terms
  supplierInvoiceNumber: text("supplier_invoice_number"), // supplier's own invoice #
  supplierInvoiceUrl: text("supplier_invoice_url"),       // uploaded photo/scan of supplier invoice
  supplierInvoiceAmount: numeric("supplier_invoice_amount"), // amount on supplier invoice (for 3-way match)
  sentAt: timestamp("sent_at").defaultNow(),
  receivedAt: timestamp("received_at"),
});

// ─── Supplier Returns (goods returned to supplier) ───────────────────────────
export const supplierReturns = pgTable("supplier_returns", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").references(() => supplierOrders.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  storeId: integer("store_id").references(() => stores.id),
  returnType: text("return_type").notNull(),   // initiated | rejected_delivery
  refundMode: text("refund_mode").notNull().default("credit_note"), // credit_note | cash_refund
  status: text("status").notNull().default("pending_confirmation"), // pending_confirmation | confirmed | refund_received
  items: jsonb("items").notNull().default([]), // [{productId,name,qty,unit,amount}]
  total: numeric("total").default("0"),
  refundAmount: numeric("refund_amount"),
  refundReceivedAt: timestamp("refund_received_at"),
  refundMethod: text("refund_method"),         // cash | bank_transfer (only for cash_refund mode)
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Supplier Payments (outgoing payments TO suppliers) ──────────────────────
// Tracks every cash/cheque/PDC/bank payment made to a supplier. Running balance:
// goods received (supplierOrders) = credit (we owe), payment = debit (we paid).
export const supplierPayments = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  poId: integer("po_id").references(() => supplierOrders.id), // optional link to specific PO
  amount: numeric("amount").notNull(),
  method: text("method").notNull().default("Cash"), // Cash | Cheque | PDC | Bank Transfer
  date: date("date").notNull(),
  reference: text("reference"),              // cheque # / transfer ref / receipt #
  supplierInvoiceNumber: text("supplier_invoice_number"), // which supplier invoice this pays
  supplierInvoiceUrl: text("supplier_invoice_url"),       // uploaded supplier invoice photo
  receiptUrl: text("receipt_url"),           // uploaded cash receipt from supplier
  chequeId: integer("cheque_id").references(() => cheques.id), // link to PDC cheque if applicable
  bankName: text("bank_name"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Notifications (in-app + WhatsApp-ready) ─────────────────────────────────
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  targetRole: text("target_role"),   // notify all users of this role (e.g. admin/manager)
  targetUserId: integer("target_user_id").references(() => users.id),
  type: text("type").notNull(),      // return_approval | return_approved | return_rejected | ...
  title: text("title").notNull(),
  message: text("message"),
  link: text("link"),                // in-app deep link, e.g. /approvals
  entityType: text("entity_type"),   // return | po | document
  entityId: integer("entity_id"),
  isRead: boolean("is_read").default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Warehouse Maintenance Issues (Module 6 — scaffold for expense linkage) ──
export const warehouseIssues = pgTable("warehouse_issues", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id),
  description: text("description").notNull(),
  urgency: text("urgency").notNull().default("normal"), // critical | normal | low
  status: text("status").notNull().default("open"),     // open | approved | in_progress | resolved
  isManagerOverride: boolean("is_manager_override").default(false), // entered after phone-call resolution
  reportedBy: integer("reported_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Expenses (Module 5) ─────────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),          // from managed list expense_categories
  amount: numeric("amount").notNull(),
  date: date("date").notNull(),
  paymentMethod: text("payment_method").notNull().default("Cash"), // Cash | Cheque | Bank Transfer
  storeId: integer("store_id").references(() => stores.id),        // location (optional per spec)
  notes: text("notes"),
  attachmentUrl: text("attachment_url"),
  isRecurring: boolean("is_recurring").default(false),
  frequency: text("frequency"),                  // weekly | monthly (when recurring)
  nextDueDate: date("next_due_date"),            // system reminds when reached
  // Soft delete — records never truly removed (correction system)
  deletedAt: timestamp("deleted_at"),
  deletedBy: integer("deleted_by").references(() => users.id),
  deleteReason: text("delete_reason"),
  linkedIssueId: integer("linked_issue_id").references(() => warehouseIssues.id), // maintenance traceability
  customData: jsonb("custom_data").default({}),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Corrections (undo/reversal audit trail — permanent, append-only) ────────
export const corrections = pgTable("corrections", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // cheque | payment | expense | delivery | return
  entityId: integer("entity_id").notNull(),
  field: text("field").notNull(),            // e.g. status | method | amount | deleted
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason").notNull(),          // mandatory on every correction
  correctedBy: integer("corrected_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Cash Flow ledger (cash-in / cash-out) ───────────────────────────────────
export const cashflow = pgTable("cashflow", {
  id: serial("id").primaryKey(),
  direction: text("direction").notNull(), // in | out
  category: text("category").notNull(),   // Supplier Refund | Expense | ...
  amount: numeric("amount").notNull(),
  refType: text("ref_type"),              // supplier_return | po | expense | ...
  refId: integer("ref_id"),
  storeId: integer("store_id").references(() => stores.id),
  notes: text("notes"),
  date: date("date").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Owner Loans / Cash Injections ───────────────────────────────────────────
// Money the owner/office lends the business (in), and repayments (out). Tracked
// separately from expenses so cash position stays accurate and outstanding-owed is clear.
export const ownerLoans = pgTable("owner_loans", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),              // injection | repayment
  amount: numeric("amount").notNull(),
  source: text("source"),                    // Owner | Office | Bank Loan | Other
  method: text("method").notNull().default("Cash"), // Cash | Bank Transfer
  date: date("date").notNull(),
  note: text("note"),
  proofUrl: text("proof_url"),
  refInjectionId: integer("ref_injection_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Damage Claims ───────────────────────────────────────────────────────────
export const damageClaims = pgTable("damage_claims", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => documents.id),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  photos: text("photos").array().default([]),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC SCHEMA ENGINE (JSONB + metadata) — custom fields, custom modules,
// managed lists. Admin adds fields/modules/lists at runtime with NO migration.
// ═══════════════════════════════════════════════════════════════════════════════

// Admin-defined custom fields for any module (built-in or custom). Values live in
// each record's `customData` jsonb bag (built-ins) or customRecords.data (custom).
export const fieldDefinitions = pgTable("field_definitions", {
  id: serial("id").primaryKey(),
  moduleKey: text("module_key").notNull(), // customers | products | documents | suppliers | expenses | <customModuleKey>
  fieldKey: text("field_key").notNull(),   // machine key, unique within a module
  label: text("label").notNull(),
  type: text("type").notNull().default("text"), // text | number | date | dropdown | checkbox | file
  options: jsonb("options").default([]),   // dropdown options
  required: boolean("required").notNull().default(false),
  visibleToRoles: jsonb("visible_to_roles").default([]), // [] = all roles
  showInList: boolean("show_in_list").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin-created modules (Marketing, Fleet, HR…). Appear in nav for chosen roles.
export const moduleDefinitions = pgTable("module_definitions", {
  id: serial("id").primaryKey(),
  moduleKey: text("module_key").notNull().unique(), // slug
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").default("Box"),
  categories: jsonb("categories").default([]),
  roles: jsonb("roles").default([]),       // roles that can access; [] = admin only
  isCustom: boolean("is_custom").notNull().default(true),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Row storage for custom modules — one physical table, moduleKey partitions it.
export const customRecords = pgTable("custom_records", {
  id: serial("id").primaryKey(),
  moduleKey: text("module_key").notNull(),
  data: jsonb("data").notNull().default({}),
  category: text("category"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin-managed dynamic lists: product categories, units, expense categories,
// credit terms, sub-locations, etc. Replaces hardcoded lists across the app.
export const managedLists = pgTable("managed_lists", {
  id: serial("id").primaryKey(),
  listKey: text("list_key").notNull(), // product_categories | product_units | expense_categories | credit_terms | sub_locations | ...
  value: text("value").notNull(),
  meta: jsonb("meta").default({}),     // e.g. { locationId } for sub_locations
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Relations ───────────────────────────────────────────────────────────────
export const documentsRelations = relations(documents, ({ many, one }) => ({
  items: many(documentItems),
  payments: many(payments),
  customer: one(customers, { fields: [documents.customerId], references: [customers.id] }),
  store: one(stores, { fields: [documents.storeId], references: [stores.id] }),
  editLogs: many(editLog),
}));

export const documentItemsRelations = relations(documentItems, ({ one }) => ({
  document: one(documents, { fields: [documentItems.documentId], references: [documents.id] }),
  product: one(products, { fields: [documentItems.productId], references: [products.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  documents: many(documents),
  payments: many(payments),
  cheques: many(cheques),
  messages: many(messagesLog),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, { fields: [inventory.productId], references: [products.id] }),
  store: one(stores, { fields: [inventory.storeId], references: [stores.id] }),
}));

export const productsRelations = relations(products, ({ many, one }) => ({
  inventory: many(inventory),
  supplier: one(suppliers, { fields: [products.supplierId], references: [suppliers.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  orders: many(supplierOrders),
  payments: many(supplierPayments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  document: one(documents, { fields: [payments.documentId], references: [documents.id] }),
  customer: one(customers, { fields: [payments.customerId], references: [customers.id] }),
  cheque: one(cheques, { fields: [payments.id], references: [cheques.paymentId] }),
}));

// ─── Tasks (manager → staff workflow) ────────────────────────────────────────
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  note: text("note"),
  assignedTo: integer("assigned_to").notNull(),   // user who must do it
  assignedBy: integer("assigned_by"),             // user who created it
  storeId: integer("store_id"),                   // store context (optional)
  dueDate: date("due_date"),
  status: text("status").notNull().default("open"), // open | in_progress | done
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Arrangement Notes (auto-split pick notes per invoice) ───────────────────
// Generated on INV save when items span multiple locations. One note per invoice,
// items grouped by source location → staff see who picks what from where.
export const arrangementNotes = pgTable("arrangement_notes", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id),
  pickupLocationId: integer("pickup_location_id").references(() => stores.id),
  deliveryMethod: text("delivery_method"), // pickup | delivery
  status: text("status").notNull().default("pending"), // pending | picking | ready | arranged | corrected | completed
  pickedById: integer("picked_by_id").references(() => users.id),
  pickedAt: timestamp("picked_at"),
  readyAt: timestamp("ready_at"),
  completedAt: timestamp("completed_at"),
  completedById: integer("completed_by_id").references(() => users.id),
  hasIssues: boolean("has_issues").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const arrangementNoteItems = pgTable("arrangement_note_items", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull().references(() => arrangementNotes.id),
  documentItemId: integer("document_item_id").references(() => documentItems.id),
  productId: integer("product_id").notNull().references(() => products.id),
  description: text("description").notNull(),
  unit: text("unit").notNull().default("PCS"),
  totalQty: numeric("total_qty").notNull(),
  sourceStoreId: integer("source_store_id").notNull().references(() => stores.id),
  splitQty: numeric("split_qty").notNull(),
  bringTo: integer("bring_to").references(() => stores.id),
  staffGroup: text("staff_group").notNull(), // "store" | "warehouse" — who arranges this
  arranged: boolean("arranged").notNull().default(false),
  pickedQty: numeric("picked_qty"),
  issueType: text("issue_type"), // not_found | partial | damaged | wrong_item
  issueNote: text("issue_note"),
  pickedAt: timestamp("picked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Arrangement Corrections ─────────────────────────────────────────────────
export const arrangementCorrections = pgTable("arrangement_corrections", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull().references(() => arrangementNotes.id),
  noteItemId: integer("note_item_id").references(() => arrangementNoteItems.id),
  reason: text("reason").notNull(), // wrong_product | wrong_qty | damaged | wrong_location | customer_changed
  productId: integer("product_id").references(() => products.id),
  storeId: integer("store_id").references(() => stores.id),
  qtyReturned: numeric("qty_returned"),
  qtyCorrect: numeric("qty_correct"),
  correctedBy: integer("corrected_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Insert Schemas ───────────────────────────────────────────────────────────
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export const insertStoreSchema = createInsertSchema(stores).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, completedAt: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertProductAliasSchema = createInsertSchema(productAliases).omit({ id: true, createdAt: true, aliasNorm: true });
export const insertInventorySchema = createInsertSchema(inventory).omit({ id: true, updatedAt: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentItemSchema = createInsertSchema(documentItems).omit({ id: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertChequeSchema = createInsertSchema(cheques).omit({ id: true, createdAt: true });
export const insertReturnSchema = createInsertSchema(returns).omit({ id: true, createdAt: true });
export const insertReturnItemSchema = createInsertSchema(returnItems).omit({ id: true });
export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({ id: true, createdAt: true });
export const insertEditLogSchema = createInsertSchema(editLog).omit({ id: true, createdAt: true });
export const insertMessagesLogSchema = createInsertSchema(messagesLog).omit({ id: true, sentAt: true });
export const insertStockAdjustmentSchema = createInsertSchema(stockAdjustments).omit({ id: true, createdAt: true });
export const insertSupplierOrderSchema = createInsertSchema(supplierOrders).omit({ id: true, sentAt: true });
export const insertFieldDefinitionSchema = createInsertSchema(fieldDefinitions).omit({ id: true, createdAt: true });
export const insertModuleDefinitionSchema = createInsertSchema(moduleDefinitions).omit({ id: true, createdAt: true });
export const insertCustomRecordSchema = createInsertSchema(customRecords).omit({ id: true, createdAt: true, updatedAt: true });
export const insertManagedListSchema = createInsertSchema(managedLists).omit({ id: true, createdAt: true });
export const insertNumberingAuditSchema = createInsertSchema(numberingAudit).omit({ id: true, createdAt: true });
export const insertSupplierReturnSchema = createInsertSchema(supplierReturns).omit({ id: true, createdAt: true });
export const insertSupplierPaymentSchema = createInsertSchema(supplierPayments).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertCashflowSchema = createInsertSchema(cashflow).omit({ id: true, createdAt: true });
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true });
export const insertStaffPayrollSchema = createInsertSchema(staffPayroll).omit({ id: true, createdAt: true });
export const insertCorrectionSchema = createInsertSchema(corrections).omit({ id: true, createdAt: true });
export const insertWarehouseIssueSchema = createInsertSchema(warehouseIssues).omit({ id: true, createdAt: true });
export const insertArrangementNoteSchema = createInsertSchema(arrangementNotes).omit({ id: true, createdAt: true });
export const insertArrangementNoteItemSchema = createInsertSchema(arrangementNoteItems).omit({ id: true, createdAt: true });
export const insertArrangementCorrectionSchema = createInsertSchema(arrangementCorrections).omit({ id: true, createdAt: true });

// ─── Types ───────────────────────────────────────────────────────────────────
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Product = typeof products.$inferSelect;
export type ProductAlias = typeof productAliases.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertProductAlias = z.infer<typeof insertProductAliasSchema>;
export type Inventory = typeof inventory.$inferSelect;
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentItem = typeof documentItems.$inferSelect;
export type InsertDocumentItem = z.infer<typeof insertDocumentItemSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Cheque = typeof cheques.$inferSelect;
export type InsertCheque = z.infer<typeof insertChequeSchema>;
export type Return = typeof returns.$inferSelect;
export type ReturnItem = typeof returnItems.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;
export type EditLog = typeof editLog.$inferSelect;
export type MessagesLog = typeof messagesLog.$inferSelect;
export type StockAdjustment = typeof stockAdjustments.$inferSelect;
export type SupplierOrder = typeof supplierOrders.$inferSelect;
export type SupplierReturn = typeof supplierReturns.$inferSelect;
export type InsertSupplierReturn = z.infer<typeof insertSupplierReturnSchema>;
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Cashflow = typeof cashflow.$inferSelect;
export type InsertCashflow = z.infer<typeof insertCashflowSchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type StaffPayroll = typeof staffPayroll.$inferSelect;
export type InsertStaffPayroll = z.infer<typeof insertStaffPayrollSchema>;
export type Correction = typeof corrections.$inferSelect;
export type InsertCorrection = z.infer<typeof insertCorrectionSchema>;
export type WarehouseIssue = typeof warehouseIssues.$inferSelect;
export type InsertWarehouseIssue = z.infer<typeof insertWarehouseIssueSchema>;
export type ArrangementNote = typeof arrangementNotes.$inferSelect;
export type InsertArrangementNote = z.infer<typeof insertArrangementNoteSchema>;
export type ArrangementNoteItem = typeof arrangementNoteItems.$inferSelect;
export type InsertArrangementNoteItem = z.infer<typeof insertArrangementNoteItemSchema>;
export type ArrangementCorrection = typeof arrangementCorrections.$inferSelect;
export type InsertArrangementCorrection = z.infer<typeof insertArrangementCorrectionSchema>;
export type DamageClaim = typeof damageClaims.$inferSelect;
export type FieldDefinition = typeof fieldDefinitions.$inferSelect;
export type InsertFieldDefinition = z.infer<typeof insertFieldDefinitionSchema>;
export type ModuleDefinition = typeof moduleDefinitions.$inferSelect;
export type InsertModuleDefinition = z.infer<typeof insertModuleDefinitionSchema>;
export type CustomRecord = typeof customRecords.$inferSelect;
export type InsertCustomRecord = z.infer<typeof insertCustomRecordSchema>;
export type ManagedList = typeof managedLists.$inferSelect;
export type InsertManagedList = z.infer<typeof insertManagedListSchema>;
export type NumberingAudit = typeof numberingAudit.$inferSelect;
export type InsertNumberingAudit = z.infer<typeof insertNumberingAuditSchema>;

// ─── Roles & Permissions — defined in ./permissions (client-safe), re-exported here ──
export { ROLES, normalizeRole, type Role } from "./permissions";

export type DocumentWithItems = Document & {
  items: DocumentItem[];
  customer?: Customer | null;
  payments?: Payment[];
};

export type CreateDocumentRequest = Omit<InsertDocument, "number" | "createdBy"> & {
  items: Omit<InsertDocumentItem, "documentId">[];
  createdBy?: number;
  /** Optional manual override; auto-generated when omitted. */
  number?: string;
};

// Legacy aliases for backward compat
export const invoices = documents;
export const invoiceItems = documentItems;
export type Invoice = Document;
export type InvoiceItem = DocumentItem;
export type InvoiceWithItems = DocumentWithItems;
export type InsertInvoice = InsertDocument;
export type InsertInvoiceItem = InsertDocumentItem;
export type CreateInvoiceRequest = CreateDocumentRequest;

export type ParsedVoiceItem = {
  description: string;
  quantity: string | number;
  unit: string;
  unitPrice: string | number;
  currency: string;
};
