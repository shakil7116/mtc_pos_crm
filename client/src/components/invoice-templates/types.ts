// Normalized shapes consumed by every selectable invoice template.

export type DocKind = "INV" | "QT" | "DN" | "CN" | "PO" | "RV";

export interface TemplateItem {
  description: string;
  sku?: string | null;
  qty: number;
  unit: string;
  price: number;
  amount: number;
}

export interface TemplateInvoice {
  type: DocKind;
  number: string;
  date: string;
  poNumber?: string | null;
  paymentType?: string | null;
  /** Payment-composition label carried by the heading (INV only): "Cash Invoice" | "Credit Invoice". */
  invoiceType?: string | null;
  /** Footer terms (INV only, customer-facing): cheque due dates + standard credit due date. */
  terms?: {
    isCredit: boolean;
    chequeDue: { number: string; dueDate: string }[];
    standardDue: string | null;
  } | null;
  customerName?: string | null;
  customerPhone?: string | null;
  items: TemplateItem[];
  subtotal: number;
  discountType?: string | null;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  totalWords?: string | null;
  notes?: string | null;
}

export interface TemplateSettings {
  storeNameEn?: string;
  storeNameAr?: string;
  addressEn?: string;
  addressAr?: string;
  phone?: string;
  crNumber?: string;
  poBox?: string;
  email?: string;
  brands?: string[];
  returnPolicyText?: string;
}

export interface TemplateOptions {
  showSignature?: boolean;
  showReturnPolicy?: boolean;
  showAmountInWords?: boolean;
  /** Theme accent colour (hex) for the document */
  accent?: string;
}

export interface TemplateProps {
  invoice: TemplateInvoice;
  settings: TemplateSettings;
  options?: TemplateOptions;
}

export const DOC_TITLE: Record<DocKind, string> = {
  INV: "Tax Invoice",
  QT: "Quotation",
  DN: "Delivery Note",
  CN: "Credit Note",
  PO: "Purchase Order",
  RV: "Return Voucher",
};

// Arabic document titles (RTL)
export const DOC_TITLE_AR: Record<DocKind, string> = {
  INV: "فاتورة ضريبية",
  QT: "عرض سعر",
  DN: "سند تسليم",
  CN: "إشعار دائن",
  PO: "أمر شراء",
  RV: "سند إرجاع",
};

// Bilingual field labels reused across templates
export const LABELS_AR = {
  billTo: "فاتورة إلى",
  number: "رقم",
  date: "التاريخ",
  poNumber: "أمر الشراء",
  description: "الوصف",
  qty: "الكمية",
  unit: "الوحدة",
  price: "السعر",
  amount: "المبلغ",
  subtotal: "المجموع الفرعي",
  discount: "الخصم",
  tax: "الضريبة",
  total: "الإجمالي",
  amountInWords: "المبلغ كتابةً",
  receiver: "المستلم",
  forCompany: "عن الشركة",
};

export function qar(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
