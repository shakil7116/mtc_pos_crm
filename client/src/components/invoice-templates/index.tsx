import { forwardRef } from "react";
import { InvoicePaper } from "@/components/InvoicePaper";
import { SpineTemplate } from "./SpineTemplate";
import { LedgerTemplate } from "./LedgerTemplate";
import { TemplateInvoice, TemplateSettings, TemplateOptions, DocKind } from "./types";

/**
 * Three templates, each a different document — not three colours of one.
 *
 *   Blue    the original InvoicePaper. The default, and unchanged.
 *   Spine   a mirrored bilingual sheet in Qatar maroon: one axis down the page,
 *           English left, Arabic right, every row level across it.
 *   Ledger  ink and hairlines only, no filled areas — photocopies and faxes
 *           intact, and costs almost nothing to print.
 *
 * The five extra colour variants of the blue paper were retired: a colour is not
 * a template, and six near-identical choices only made the picker harder to use.
 */
export type TemplateId = "paper-blue" | "spine" | "ledger";

// id → InvoicePaper internal variant (blue only; the paper's other variants are
// no longer reachable from the picker).
const PAPER_VARIANT: Partial<Record<TemplateId, "template1">> = {
  "paper-blue": "template1",
};

export const INVOICE_TEMPLATES: { id: TemplateId; label: string; blurb: string }[] = [
  { id: "paper-blue", label: "Blue", blurb: "The original — modern blue" },
  { id: "spine", label: "Spine", blurb: "Mirrored bilingual, Qatar maroon" },
  { id: "ledger", label: "Ledger", blurb: "Ink and hairline, no colour" },
];

export const DEFAULT_TEMPLATE: TemplateId = "paper-blue";
const STORAGE_KEY = "mtc_invoice_template";

export function getSavedTemplate(): TemplateId {
  const v = (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) as TemplateId | null;
  // A retired id left in a browser (paper-red, premium-navy…) falls back to Blue
  // rather than rendering nothing.
  const valid = !!v && INVOICE_TEMPLATES.some((t) => t.id === v);
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
    invoiceType: doc.invoiceType
      ?? (doc.type === "INV" && doc.paymentType
        ? (doc.paymentType === "Cash" ? "Cash Invoice" : "Credit Invoice")
        : null),
    terms: doc.terms ?? null,
    customerName: doc.customerName ?? null,
    customerPhone: customerPhone ?? null,
    deliveryAddress: doc.deliveryAddress ?? null,
    mapLink: doc.mapLink ?? null,
    deliveryInstructions: doc.deliveryInstructions ?? null,
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
      invoiceTypeLabel: invoice.invoiceType ?? null,
      terms: invoice.terms ?? null,
      // Site-delivery fields for the DN paper (address + contact + map QR). DN only.
      customerPhone: invoice.customerPhone ?? null,
      deliveryAddress: invoice.deliveryAddress ?? null,
      mapLink: invoice.mapLink ?? null,
      deliveryInstructions: invoice.deliveryInstructions ?? null,
    };
    const docType =
      invoice.type === "QT" ? "quotation"
      : invoice.type === "DN" ? "delivery_note"
      : invoice.type === "CN" ? "credit_note"
      : invoice.type === "RV" ? "return"
      : "invoice";

    // Merge in safe defaults so a missing settings field can't crash the paper
    const safeSettings = { ...FALLBACK_SETTINGS, ...(settings || {}) };

    // Spine and Ledger read the normalized shape directly — no legacy adapter.
    if (templateId === "spine") {
      return <SpineTemplate ref={ref} settings={safeSettings} invoice={invoice} options={options} className={className} />;
    }
    if (templateId === "ledger") {
      return <LedgerTemplate ref={ref} settings={safeSettings} invoice={invoice} options={options} className={className} />;
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
