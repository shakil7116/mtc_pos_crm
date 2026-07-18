/**
 * In-memory demo backend.
 *
 * Active ONLY when no DATABASE_URL is configured, so the full POS flow
 * (create invoice → list → open → edit) works without a Postgres instance.
 * State lives for the lifetime of the server process; it resets on restart.
 * Once a real DB is connected this module is never touched.
 */

type AnyObj = Record<string, any>;

const counters: Record<string, number> = {
  INV: 100360, QT: 197235, DN: 297333, CN: 100001, PO: 100001, RV: 500001,
};

let docSeq = 1;
let itemSeq = 1;
let paySeq = 1;
let retSeq = 1;

const documents: AnyObj[] = [];
const documentItems: AnyObj[] = [];
const payments: AnyObj[] = [];
const cheques: AnyObj[] = [];
const returns: AnyObj[] = []; // separate Return Voucher ledger

// ── Seed reference data so the editor is immediately usable ──
const customers: AnyObj[] = [
  { id: 1, name: "Al Rayyan Contracting", phone: "+974 5512 8842", type: "Contractor", creditLimit: 50000, trn: "", active: true },
  { id: 2, name: "Doha Build Supplies", phone: "+974 3398 1170", type: "Retailer", creditLimit: 25000, trn: "", active: true },
  { id: 3, name: "Khalid Al Marri", phone: "+974 6644 2093", type: "Walk-in", creditLimit: 0, trn: "", active: true },
  { id: 4, name: "Lusail Interiors WLL", phone: "+974 7011 5526", type: "Contractor", creditLimit: 80000, trn: "", active: true },
];

const products: AnyObj[] = [
  { id: 1, sku: "CEM-OPC-50", name: "Portland Cement OPC 50kg", category: "Cement", unit: "BAG", salePrice: 17.5, costPrice: 14, active: true },
  { id: 2, sku: "STL-12MM", name: "Steel Rebar 12mm (12m)", category: "Steel", unit: "PCS", salePrice: 46, costPrice: 39, active: true },
  { id: 3, sku: "BLK-20-HOLLOW", name: "Hollow Block 20cm", category: "Blocks", unit: "PCS", salePrice: 3.25, costPrice: 2.4, active: true },
  { id: 4, sku: "PNT-WHT-20L", name: "Emulsion Paint White 20L", category: "Paint", unit: "GALLON", salePrice: 92, costPrice: 71, active: true },
  { id: 5, sku: "PIP-PVC-4", name: 'PVC Pipe 4" (6m)', category: "Plumbing", unit: "PCS", salePrice: 38.75, costPrice: 30, active: true },
  { id: 6, sku: "SND-WASH-T", name: "Washed Sand (per tonne)", category: "Aggregates", unit: "PCS", salePrice: 55, costPrice: 42, active: true },
];

const settings: AnyObj = {
  id: 1,
  storeNameEn: "MAMUN M TRADING AND CONTRACTING W.L.L",
  storeNameAr: "مأمون م للتجارة والمقاولات ذ.م.م",
  addressEn: "NAJMA STREET, NAJMA, DOHA, QATAR",
  addressAr: "شارع النجمة، النجمة، الدوحة، قطر",
  phone: "+974 30703722",
  crNumber: "72986/1",
  poBox: "17336",
  email: "",
  brands: [],
  returnPolicyText: "Goods sold are not returnable after 7 days. Original invoice required.",
};

const stores: AnyObj[] = [
  { id: 1, nameEn: "Store 1 — Najma", nameAr: "", type: "store", active: true },
  { id: 2, nameEn: "Store 2 — Industrial Area", nameAr: "", type: "store", active: true },
  { id: 3, nameEn: "Warehouse A", nameAr: "", type: "warehouse", active: true },
  { id: 4, nameEn: "Warehouse B", nameAr: "", type: "warehouse", active: true },
  { id: 5, nameEn: "Warehouse C", nameAr: "", type: "warehouse", active: true },
];

function nextNumber(type: string): string {
  if (counters[type] == null) counters[type] = 100001;
  const n = counters[type];
  counters[type] = n + 1;
  return `${type}-${n}`;
}

function peekNumber(type: string): string {
  if (counters[type] == null) counters[type] = 100001;
  return `${type}-${counters[type]}`;
}

function reserveNumber(type: string, requested?: string): string {
  const trimmed = requested?.trim();
  if (!trimmed) return nextNumber(type);

  const numPart = trimmed.match(new RegExp(`^${type}-(\\d+)$`, "i"))?.[1]
    ?? trimmed.match(/^(\d+)$/)?.[1];
  if (!numPart) throw new Error("INVALID_NUMBER");

  const normalized = `${type}-${numPart}`;
  if (documents.some((d) => d.number === normalized)) {
    throw new Error(`DUPLICATE_NUMBER:${normalized}`);
  }

  const used = parseInt(numPart, 10);
  if (counters[type] == null) counters[type] = 100001;
  if (used >= counters[type]) counters[type] = used + 1;
  return normalized;
}

function itemsFor(docId: number) {
  return documentItems.filter((i) => i.documentId === docId);
}

function paymentsFor(docId: number) {
  return payments.filter((p) => p.documentId === docId);
}

function hydrate(doc: AnyObj): AnyObj {
  return { ...doc, items: itemsFor(doc.id), payments: paymentsFor(doc.id) };
}

export const demo = {
  // ── reference data ──
  settings: () => settings,
  updateSettings: (patch: AnyObj) => Object.assign(settings, patch),
  stores: () => stores,
  customers: () => customers.filter((c) => c.active),
  getCustomer: (id: number) => customers.find((c) => c.id === id) ?? null,
  createCustomer: (data: AnyObj) => {
    const row = { id: customers.length + 1, active: true, creditLimit: 0, ...data };
    customers.push(row);
    return row;
  },
  customerBalance: (id: number) => {
    const custDocs = documents.filter((d) => d.customerId === id && d.type === "INV");
    const totalInvoiced = custDocs.reduce((s, d) => s + Number(d.total || 0), 0);
    const pays = payments.filter((p) => p.customerId === id);
    const totalPaid = pays.reduce((s, p) => s + (p.isRefund ? -Number(p.amount || 0) : Number(p.amount || 0)), 0);
    const customer = customers.find((c) => c.id === id);
    return {
      balance: Math.max(0, totalInvoiced - totalPaid),
      creditLimit: Number(customer?.creditLimit || 0),
      totalInvoiced,
      totalPaid,
    };
  },
  products: () => products.filter((p) => p.active),
  getProduct: (id: number) => products.find((p) => p.id === id) ?? null,

  // ── documents ──
  listDocuments: (type?: string, storeId?: number) => {
    let rows = documents.slice();
    if (type) rows = rows.filter((d) => d.type === type);
    if (storeId) rows = rows.filter((d) => d.storeId === storeId);
    return rows
      .sort((a, b) => b.id - a.id)
      .map((d) => ({ ...d }));
  },
  getDocument: (id: number) => {
    const doc = documents.find((d) => d.id === id);
    return doc ? hydrate(doc) : null;
  },
  createDocument: (body: AnyObj) => {
    const id = docSeq++;
    const number = reserveNumber(body.type || "INV", body.number);
    const status =
      body.status || (body.type === "QT" || body.type === "DN" ? "draft" : "unpaid");
    const doc: AnyObj = {
      id,
      type: body.type || "INV",
      number,
      date: body.date,
      poNumber: body.poNumber ?? null,
      customerId: body.customerId ?? null,
      customerName: body.customerName ?? null,
      supplierId: body.supplierId ?? null,
      expectedDate: body.expectedDate ?? null,
      storeId: body.storeId ?? null,
      status,
      discountType: body.discountType ?? "QAR",
      discountAmount: Number(body.discountAmount || 0),
      subtotal: Number(body.subtotal || 0),
      taxRate: Number(body.taxRate || 0),
      taxAmount: Number(body.taxAmount || 0),
      total: Number(body.total || 0),
      totalWords: body.totalWords ?? "",
      notes: body.notes ?? "",
      linkedDocId: body.linkedDocId ?? null,
      originalInvoiceId: body.originalInvoiceId ?? null,
      createdBy: body.createdBy ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    documents.push(doc);
    (body.items || []).forEach((it: AnyObj) => {
      documentItems.push({
        id: itemSeq++,
        documentId: id,
        productId: it.productId ?? null,
        sku: it.sku ?? "",
        description: it.description ?? "",
        qty: Number(it.qty || 0),
        unit: it.unit ?? "PCS",
        price: Number(it.price || 0),
        discountType: it.discountType ?? "QAR",
        discountAmount: Number(it.discountAmount || 0),
        amount: Number(it.amount || 0),
      });
    });
    return hydrate(doc);
  },
  updateDocument: (id: number, body: AnyObj) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return null;
    const { items, ...rest } = body;
    Object.assign(doc, rest, { updatedAt: new Date().toISOString() });
    if (Array.isArray(items)) {
      // replace items
      for (let i = documentItems.length - 1; i >= 0; i--) {
        if (documentItems[i].documentId === id) documentItems.splice(i, 1);
      }
      items.forEach((it: AnyObj) => {
        documentItems.push({
          id: itemSeq++,
          documentId: id,
          productId: it.productId ?? null,
          sku: it.sku ?? "",
          description: it.description ?? "",
          qty: Number(it.qty || 0),
          unit: it.unit ?? "PCS",
          price: Number(it.price || 0),
          discountType: it.discountType ?? "QAR",
          discountAmount: Number(it.discountAmount || 0),
          amount: Number(it.amount || 0),
        });
      });
    }
    return hydrate(doc);
  },
  deleteDocument: (id: number) => {
    const idx = documents.findIndex((d) => d.id === id);
    if (idx >= 0) documents.splice(idx, 1);
    for (let i = documentItems.length - 1; i >= 0; i--) {
      if (documentItems[i].documentId === id) documentItems.splice(i, 1);
    }
  },
  convertDocument: (id: number) => {
    const qt = documents.find((d) => d.id === id);
    if (!qt) return null;
    const inv = demo.createDocument({
      ...qt,
      type: "INV",
      status: "unpaid",
      linkedDocId: qt.id,
      items: itemsFor(qt.id),
    });
    qt.status = "converted";
    return inv;
  },

  // ── Return Vouchers (separate ledger; never mutates invoices) ──
  listReturns: (invoiceId?: number) => {
    let rows = returns.slice().sort((a, b) => b.id - a.id);
    if (invoiceId) rows = rows.filter((r) => r.originalInvoiceId === invoiceId);
    return rows.map((r) => ({ ...r }));
  },
  getReturn: (id: number) => returns.find((r) => r.id === id) ?? null,
  createReturn: (body: AnyObj) => {
    const refund = Number(body.refundAmount || 0);
    const items = (body.items || []).map((it: AnyObj) => ({
      documentItemId: it.documentItemId ?? null,
      productId: it.productId ?? null,
      description: it.description,
      qty: Number(it.qty || 0),
      unit: it.unit,
      price: Number(it.price || 0),
      amount: Number(it.amount || 0),
      condition: it.condition || "original",
    }));
    const orig = documents.find((d) => d.id === body.originalInvoiceId);
    const voucherNumber = nextNumber("RV");
    const rv: AnyObj = {
      id: retSeq++,
      voucherNumber,
      originalInvoiceId: body.originalInvoiceId ?? null,
      originalInvoiceNumber: orig?.number ?? null,
      date: new Date().toISOString().slice(0, 10),
      customerId: body.customerId ?? orig?.customerId ?? null,
      customerName: body.customerName ?? orig?.customerName ?? null,
      storeId: body.storeId ?? orig?.storeId ?? null,
      type: body.type,
      status: "approved",
      reason: body.reason ?? "",
      refundMethod: body.refundMethod ?? null,
      refundAmount: refund,
      total: refund,
      items,
      createdAt: new Date().toISOString(),
    };
    returns.push(rv);
    // Refund recorded as a customer-ledger entry only (no documentId → invoice untouched)
    if (body.refundMethod && refund > 0 && ["Cash", "Bank Transfer"].includes(body.refundMethod)) {
      demo.createPayment({
        customerId: rv.customerId,
        amount: refund,
        method: body.refundMethod,
        isRefund: true,
        reference: voucherNumber,
      });
    }
    return { returnVoucher: rv };
  },

  peekNextNumber: (type: string) => peekNumber(type),

  // ── Reports / dashboard metrics, computed live from the in-memory ledger ──
  reports: {
    dailySales: (start?: string, end?: string, storeId?: number) => {
      const inRange = (d: string) => (!start || d >= start) && (!end || d <= end);
      let invs = documents.filter((d) => d.type === "INV" && inRange(d.date));
      if (storeId) invs = invs.filter((d) => d.storeId === storeId);

      const totalRevenue = invs.reduce((s, d) => s + Number(d.total || 0), 0);
      const invoiceCount = invs.length;
      const cashSales = invs.filter((d) => d.status === "paid").reduce((s, d) => s + Number(d.total || 0), 0);
      const creditSales = totalRevenue - cashSales;
      const retRows = returns.filter((r) => inRange(r.date));
      const returnsTotal = retRows.reduce((s, r) => s + Number(r.refundAmount || 0), 0);

      // COGS from product cost prices
      let cogs = 0;
      for (const inv of invs) {
        for (const it of itemsFor(inv.id)) {
          const p = products.find((x) => x.id === it.productId);
          if (p) cogs += Number(p.costPrice || 0) * Number(it.qty || 0);
        }
      }
      const grossProfit = totalRevenue - cogs;
      const marginPct = totalRevenue ? (grossProfit / totalRevenue) * 100 : 0;

      // daily rows
      const byDate: Record<string, { revenue: number; invoiceCount: number }> = {};
      invs.forEach((d) => {
        byDate[d.date] = byDate[d.date] || { revenue: 0, invoiceCount: 0 };
        byDate[d.date].revenue += Number(d.total || 0);
        byDate[d.date].invoiceCount += 1;
      });
      const rows = Object.entries(byDate)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, v]) => ({ date, revenue: v.revenue, invoiceCount: v.invoiceCount, profit: v.revenue }));

      const paysInRange = payments.filter((p) => inRange((p.date || "").slice(0, 10)));

      return {
        rows, totalRevenue, invoiceCount,
        avgInvoiceValue: invoiceCount ? totalRevenue / invoiceCount : 0,
        cashSales, creditSales, returnsTotal,
        cogs, grossProfit, marginPct,
        totalProfit: grossProfit,   // alias consumed by the Dashboard
        payments: paysInRange,      // Dashboard derives "cash sales today" from these
      };
    },

    unpaidInvoices: (start?: string, end?: string) => {
      const inRange = (d: string) => (!start || d >= start) && (!end || d <= end);
      return documents
        .filter((d) => d.type === "INV" && (d.status === "unpaid" || d.status === "partial") && inRange(d.date))
        .map((d) => {
          const paid = paymentsFor(d.id).reduce((s, p) => s + (p.isRefund ? -Number(p.amount) : Number(p.amount)), 0);
          const total = Number(d.total || 0);
          const daysOverdue = Math.max(0, Math.floor((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(d.date)) / 86400000));
          return { id: d.id, number: d.number, date: d.date, customerName: d.customerName, customerId: d.customerId, total, paid, remaining: Math.max(0, total - paid), daysOverdue };
        })
        .filter((row) => row.remaining > 0.005)
        .sort((a, b) => b.daysOverdue - a.daysOverdue);
    },

    chequeCalendar: (start?: string, end?: string) => {
      const inRange = (d: string) => (!start || d >= start) && (!end || d <= end);
      const today = new Date().toISOString().slice(0, 10);
      return cheques
        .filter((c) => inRange(c.chequeDate))
        .map((c) => ({
          ...c,
          customerName: customers.find((x) => x.id === c.customerId)?.name ?? null,
          status: c.status === "pending" && c.chequeDate < today ? "overdue" : c.status,
        }));
    },

    topCustomers: (start?: string, end?: string) => {
      const inRange = (d: string) => (!start || d >= start) && (!end || d <= end);
      const map: Record<number, AnyObj> = {};
      documents.filter((d) => d.type === "INV" && d.customerId && inRange(d.date)).forEach((d) => {
        const k = d.customerId;
        map[k] = map[k] || { customerId: k, name: d.customerName || "—", totalPurchases: 0, invoiceCount: 0 };
        map[k].totalPurchases += Number(d.total || 0);
        map[k].invoiceCount += 1;
      });
      return Object.values(map)
        .map((c): AnyObj => ({ ...c, outstanding: demo.customerBalance(c.customerId).balance }))
        .sort((a, b) => b.totalPurchases - a.totalPurchases)
        .slice(0, 20);
    },

    topProducts: (start?: string, end?: string) => {
      const inRange = (d: string) => (!start || d >= start) && (!end || d <= end);
      const invIds = new Set(documents.filter((d) => d.type === "INV" && inRange(d.date)).map((d) => d.id));
      const map: Record<string, AnyObj> = {};
      documentItems.filter((it) => invIds.has(it.documentId)).forEach((it) => {
        const k = it.productId ?? it.description;
        map[k] = map[k] || { productId: it.productId ?? 0, name: it.description, qtySold: 0, revenue: 0 };
        map[k].qtySold += Number(it.qty || 0);
        map[k].revenue += Number(it.amount || 0);
      });
      return Object.values(map)
        .map((p): AnyObj => ({ ...p, stockLeft: 0 }))
        .sort((a, b) => b.qtySold - a.qtySold)
        .slice(0, 20);
    },

    returnsReport: (start?: string, end?: string) => {
      const inRange = (d: string) => (!start || d >= start) && (!end || d <= end);
      const rows = returns.filter((r) => inRange(r.date));
      const byTypeMap: Record<string, { count: number; amount: number }> = {};
      rows.forEach((r) => {
        const type = r.type || "unknown";
        if (!byTypeMap[type]) byTypeMap[type] = { count: 0, amount: 0 };
        byTypeMap[type].count += 1;
        byTypeMap[type].amount += Number(r.refundAmount || r.total || 0);
      });
      const byType = Object.entries(byTypeMap).map(([type, stats]) => ({
        type,
        count: stats.count,
        amount: stats.amount,
      }));
      const invoiceCount = documents.filter((d) => d.type === "INV" && inRange(d.date)).length;
      return {
        total: rows.length,
        rate: invoiceCount > 0 ? (rows.length / invoiceCount) * 100 : 0,
        byType: byType ?? [],
        topProducts: [] as { name: string; count: number; amount: number }[],
      };
    },
  },

  // ── payments ──
  listPayments: (docId: number) => paymentsFor(docId),
  createPayment: (body: AnyObj) => {
    const pay = {
      id: paySeq++,
      ...body,
      amount: Number(body.amount || 0),
      date: body.date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    payments.push(pay);
    // update doc status
    const doc = documents.find((d) => d.id === body.documentId);
    if (doc) {
      const paid = paymentsFor(doc.id).reduce(
        (s, p) => s + (p.isRefund ? -Number(p.amount) : Number(p.amount)),
        0,
      );
      doc.status = paid <= 0 ? "unpaid" : paid >= Number(doc.total) ? "paid" : "partial";
    }
    return pay;
  },
};
