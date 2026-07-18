import { forwardRef } from "react";
import { InvoicePaper } from "@/components/InvoicePaper";
import { PremiumInvoice } from "./PremiumInvoice";
import { TemplateInvoice, TemplateSettings, TemplateOptions, DocKind } from "./types";

/**
 * The document template is the original InvoicePro "InvoicePaper", in its five
 * official colour variants (template1–5). The colour theme IS the template.
 */
export type TemplateId =
  | "paper-blue"
  | "paper-yellow"
  | "paper-cyan"
  | "paper-red"
  | "paper-dark"
  | "premium-navy";

// id → InvoicePaper internal variant
const PAPER_VARIANT: Partial<Record<TemplateId, "template1" | "template2" | "template3" | "template4" | "template5">> = {
  "paper-blue": "template1",
  "paper-yellow": "template2",
  "paper-cyan": "template3",
  "paper-red": "template4",
  "paper-dark": "template5",
};

export const INVOICE_TEMPLATES: { id: TemplateId; label: string; blurb: string }[] = [
  { id: "paper-blue", label: "Blue", blurb: "Modern blue (classic)" },
  { id: "paper-yellow", label: "Yellow", blurb: "Amber / black accents" },
  { id: "paper-cyan", label: "Cyan", blurb: "Cyan header band" },
  { id: "paper-red", label: "Red", blurb: "Red professional" },
  { id: "paper-dark", label: "Dark", blurb: "Dark / minimal" },
  { id: "premium-navy", label: "Premium", blurb: "Navy enterprise letterhead" },
];

export const DEFAULT_TEMPLATE: TemplateId = "paper-blue";
const STORAGE_KEY = "mtc_invoice_template";

export function getSavedTemplate(): TemplateId {
  const v = (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) as TemplateId | null;
  const valid = v && ((PAPER_VARIANT as any)[v] || v === "premium-navy");
  return valid ? (v as TemplateId) : DEFAULT_TEMPLATE;
}

export function saveTemplate(id: TemplateId) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

/** Map a raw document (+ optional phone) to the normalized template shape. */
export function normalizeInvoice(doc: any, customerPhone?: string | null): TemplateInvoice {
  return {
    type: (doc.type as DocKind) ?? "INV",
    number: doc.number,
    date: doc.date,
    poNumber: doc.poNumber ?? null,
    paymentType: doc.paymentType ?? null,
    customerName: doc.customerName ?? null,
    customerPhone: customerPhone ?? null,
    items: (doc.items ?? []).map((it: any) => ({
      description: it.description,
      sku: it.sku ?? null,
      qty: Number(it.qty),
      unit: it.unit,
      price: Number(it.price),
      amount: Number(it.amount),
    })),
    subtotal: Number(doc.subtotal ?? 0),
    discountType: doc.discountType ?? "QAR",
    discountAmount: Number(doc.discountAmount ?? 0),
    taxRate: Number(doc.taxRate ?? 0),
    taxAmount: Number(doc.taxAmount ?? 0),
    total: Number(doc.total ?? 0),
    totalWords: doc.totalWords ?? null,
    notes: doc.notes ?? null,
  };
}

interface RendererProps {
  templateId: TemplateId;
  invoice: TemplateInvoice;
  settings: TemplateSettings;
  options?: TemplateOptions;
  className?: string;
}

const FALLBACK_SETTINGS: TemplateSettings = {
  storeNameEn: "MAMUN M TRADING AND CONTRACTING WLL",
  storeNameAr: "شركة مأمون إم للتجارة والمقاولات ذ.م.م",
  addressEn: "NAJMA STREET, NAJMA, DOHA, QATAR",
  addressAr: "شارع النجمة، النجمة، الدوحة، قطر",
  phone: "+974 30703722",
  crNumber: "72986/1",
  poBox: "17336",
};

/** Renders the original InvoicePaper in the chosen colour variant. */
export const InvoiceRenderer = forwardRef<HTMLDivElement, RendererProps>(
  ({ templateId, invoice, settings, options, className }, ref) => {
    const variant = PAPER_VARIANT[templateId] ?? "template1";

    // Adapt the normalized shape to the legacy InvoicePaper props
    const legacyInvoice = {
      id: 0,
      invoiceNumber: invoice.number,
      date: invoice.date,
      poNumber: invoice.poNumber,
      customerName: invoice.customerName ?? "CASH CUSTOMER",
      items: invoice.items.map((it) => ({
        description: it.description,
        quantity: it.qty,
        unit: it.unit,
        unitPrice: it.price.toFixed(2),
        amount: it.amount.toFixed(2),
      })),
      totalAmount: invoice.total.toFixed(2),
      // Gross subtotal + gross discount so the paper can print the discount line.
      subtotalAmount: Number(invoice.subtotal ?? invoice.total).toFixed(2),
      discountAmount: Number(invoice.discountAmount ?? 0).toFixed(2),
      totalAmountWords: invoice.totalWords ?? "",
      receiverSignature: "",
    };
    const docType =
      invoice.type === "QT" ? "quotation"
      : invoice.type === "DN" ? "delivery_note"
      : invoice.type === "CN" ? "credit_note"
      : invoice.type === "RV" ? "return"
      : "invoice";

    // Merge in safe defaults so a missing settings field can't crash the paper
    const safeSettings = { ...FALLBACK_SETTINGS, ...(settings || {}) };

    // Premium navy template renders the normalized shape directly (not the legacy paper)
    if (templateId === "premium-navy") {
      return (
        <div ref={ref}>
          <PremiumInvoice settings={safeSettings} invoice={invoice} options={options} className={className} />
        </div>
      );
    }

    return (
      <InvoicePaper
        ref={ref}
        settings={safeSettings as any}
        invoice={legacyInvoice as any}
        className={className}
        template={variant}
        docType={docType as any}
      />
    );
  }
);
InvoiceRenderer.displayName = "InvoiceRenderer";
