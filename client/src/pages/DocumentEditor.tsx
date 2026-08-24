import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2,
  Mic,
  MicOff,
  Search,
  Save,
  ArrowRight,
  ArrowLeft,
  PackagePlus,
  Loader2,
  SlidersHorizontal,
  Upload,
  Plus,
} from "lucide-react";
import AdminSettingsModal from "@/components/AdminSettingsModal";
import SaveInterceptorModal, { type InterceptorResult } from "@/components/SaveInterceptorModal";
import ManagerPinModal from "@/components/ManagerPinModal";
import InlineAddCustomerDialog, { type QuickCustomer } from "@/components/InlineAddCustomerDialog";
import { cn } from "@/lib/utils";
import CustomFields, { useFieldDefs } from "@/components/CustomFields";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useInvoiceConfig } from "@/lib/invoiceConfig";
import { useSettings } from "@/hooks/use-settings";
import {
  InvoiceRenderer,
  normalizeInvoice,
  getSavedTemplate,
  saveTemplate,
  INVOICE_TEMPLATES,
  type TemplateId,
} from "@/components/invoice-templates";

// ─── Types ───────────────────────────────────────────────────────────────────

type DocType = "INV" | "QT" | "DN" | "CN" | "RV";

interface LineItem {
  id: string;
  productId?: number;
  sku: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  discountType: "QAR" | "%";
  discountAmount: number;
  amount: number;
  originalPrice?: number;
  costPrice?: number; // staff-only, shown on screen, never printed/persisted per line
  locationStoreId?: number | null; // which store/warehouse this line's stock is pulled FROM
}

interface Customer {
  id: number;
  name: string;
  phone: string;
  type: string;
  creditLimit: number;
  trn?: string;
  active: boolean;
}
interface CustomerBalance { balance: number; creditLimit: number; totalInvoiced: number; totalPaid: number; }
interface Product { id: number; sku: string; name: string; category: string; unit: string; salePrice: number; wholesalePrice?: number; costPrice: number; active: boolean; locationStoreId?: number | null; locationArea?: string | null; locationRack?: string | null; locationShelf?: string | null; imageUrl?: string | null; }
interface Store { id: number; nameEn: string; nameAr: string; type: string; active: boolean; ownerStoreId?: number | null; }
interface ExistingDocument {
  id: number; type: string; number: string; date: string;
  customerId?: number; customerName: string; storeId: number; status: string; poNumber?: string;
  discountType: "QAR" | "%"; discountAmount: number; subtotal: number; taxRate: number; taxAmount: number; total: number; notes?: string;
  items?: Array<{ id: number; productId?: number; sku: string; description: string; qty: number; unit: string; price: number; discountType: "QAR" | "%"; discountAmount: number; amount: number; }>;
}

// ─── Amount in words ─────────────────────────────────────────────────────────
const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
function numberToWords(n: number): string {
  if (n === 0) return "ZERO";
  if (n < 0) return "MINUS " + numberToWords(-n);
  let words = "";
  if (n >= 1000000) { words += numberToWords(Math.floor(n / 1000000)) + " MILLION "; n %= 1000000; }
  if (n >= 1000) { words += numberToWords(Math.floor(n / 1000)) + " THOUSAND "; n %= 1000; }
  if (n >= 100) { words += ones[Math.floor(n / 100)] + " HUNDRED "; n %= 100; }
  if (n >= 20) { words += tens[Math.floor(n / 10)] + " "; n %= 10; }
  if (n > 0) words += ones[n] + " ";
  return words.trim();
}
function amountInWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const intPart = Math.floor(rounded);
  const decPart = Math.round((rounded - intPart) * 100);
  let result = numberToWords(intPart) + " QATARI RIYALS";
  if (decPart > 0) result += " AND " + numberToWords(decPart) + " DIRHAMS";
  result += " ONLY";
  return result;
}

function uid(): string { return Math.random().toString(36).slice(2, 10); }
function makeBlankItem(): LineItem {
  return { id: uid(), sku: "", description: "", qty: 1, unit: "PCS", price: 0, discountType: "QAR", discountAmount: 0, amount: 0, locationStoreId: null };
}
// Line total. QAR discount is PER-UNIT: qty × (price − perUnitDiscount).
// % discount is a percentage off the unit price (equivalent per-unit).
function calcLineAmount(item: LineItem): number {
  if (item.discountType === "QAR") {
    const netUnit = Math.max(0, item.price - item.discountAmount);
    return item.qty * netUnit;
  }
  return Math.max(0, item.qty * item.price * (1 - item.discountAmount / 100));
}

const UNITS = [
  "PCS", "NOS", "SET", "PAIR", "DOZEN",
  "BOX", "BAG", "PKT", "PACK", "BUNDLE", "CTN", "CASE", "CARTON", "PALLET",
  "KG", "GM", "TON", "LB",
  "LTR", "ML", "GLN", "DRUM", "BUCKET", "BARREL",
  "MTR", "CM", "MM", "FT", "IN", "YD",
  "SQFT", "SQM",
  "ROLL", "SHEET", "SPOOL", "COIL", "REAM",
  "TUBE", "BOTTLE", "CAN", "JAR",
  "LENGTH", "LOT", "LOAD", "TRIP",
];

// ─── Color themes (accent for active pills + document) ──
type ThemeKey = "blue" | "yellow" | "cyan" | "red" | "dark" | "premium";
const THEMES: { key: ThemeKey; label: string; accent: string }[] = [
  { key: "blue", label: "Blue", accent: "#2563eb" },
  { key: "yellow", label: "Yellow", accent: "#ca8a04" },
  { key: "cyan", label: "Cyan", accent: "#0891b2" },
  { key: "red", label: "Red", accent: "#dc2626" },
  { key: "dark", label: "Dark", accent: "#1e2a3a" },
  { key: "premium", label: "Premium", accent: "#1e3a8a" },
];
// Theme key ↔ template id (premium maps to a distinct template, the rest are paper-*)
const themeToTemplate = (k: ThemeKey): TemplateId => (k === "premium" ? "premium-navy" : `paper-${k}`) as TemplateId;
const templateToTheme = (id: TemplateId): ThemeKey => (id === "premium-navy" ? "premium" : id.replace("paper-", "")) as ThemeKey;

const DOC_PILLS: { type: DocType; label: string }[] = [
  { type: "INV", label: "Invoice" },
  { type: "QT", label: "Quotation" },
  { type: "DN", label: "Delivery Note" },
  // Credit Note is the single unified token for all material returns + inventory re-crediting
  { type: "CN", label: "Credit Note" },
];

// Focus a specific grid cell by row/column coordinate (Excel-like nav)
function focusGridCell(r: number, c: number) {
  const el = document.querySelector<HTMLInputElement>(`input[data-grid="1"][data-r="${r}"][data-c="${c}"]`);
  if (el) { el.focus(); try { el.select(); } catch { /* number inputs */ } }
}

// ─── Main Component ───────────────────────────────────────────────────────────
type Props = { type?: string; params?: { id?: string; type?: string } };

export default function DocumentEditor({ type, params }: Props) {
  const [matchEdit, editParams] = useRoute("/documents/:id/edit");
  const editId = matchEdit ? editParams?.id : params?.id;
  const isEdit = Boolean(editId);

  const rawType: DocType = (type ?? params?.type ?? "INV") as DocType;
  const [docType, setDocType] = useState<DocType>(rawType);
  // Return Invoice can be opened pre-filled from an existing invoice: /documents/new/RV?ref=<id>
  const refInvoiceId = (() => { try { return new URLSearchParams(window.location.search).get("ref"); } catch { return null; } })();
  // New invoice pre-filled with a customer: /documents/new/INV?customerId=<id> (from the customer profile).
  const prefillCustomerId = (() => { try { return new URLSearchParams(window.location.search).get("customerId"); } catch { return null; } })();

  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  // ── Form state ──
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [storeId, setStoreId] = useState<number | null>(user?.storeId ?? null);
  // Live-preview fit: scale the A4 paper to whatever width the preview box has, so
  // the WHOLE invoice is always visible (never clipped) at the largest readable size.
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [poNumber, setPoNumber] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("pickup_store"); // pickup_store | pickup_warehouse | deliver_site
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [mapLink, setMapLink] = useState(""); // pasted Google Maps pin URL for the site
  const [driverId, setDriverId] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [docCustomData, setDocCustomData] = useState<Record<string, any>>({});
  const { data: docFieldDefs = [] } = useFieldDefs("documents");
  const { data: allUsers = [] } = useQuery<any[]>({ queryKey: ["/api/users"], queryFn: () => fetch("/api/users").then((r) => r.json()) });
  const drivers = allUsers.filter((u: any) => u.role === "driver" && u.active !== false);
  const [customerInput, setCustomerInput] = useState("");
  const [receiver, setReceiver] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [creditBannerDismissed, setCreditBannerDismissed] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  // Invoice Type toggle (INV only) — exactly two: cash | credit. Defaults from the
  // customer's Financial Status (creditLimit>0 = Credit), staff can override before payment.
  const [invoiceMode, setInvoiceMode] = useState<"cash" | "credit">("cash");
  const [invoiceModeTouched, setInvoiceModeTouched] = useState(false);
  const [items, setItems] = useState<LineItem[]>([makeBlankItem()]);
  const [docDiscountType, setDocDiscountType] = useState<"QAR" | "%">("QAR");
  const [docDiscountAmount, setDocDiscountAmount] = useState<number>(0);
  // Footer/grand-total discount is an internal management decision — admin/manager only.
  const canFooterDiscount = user?.role === "admin" || user?.role === "manager";
  const [notes] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [numberTouched, setNumberTouched] = useState(false);
  const [numberLoading, setNumberLoading] = useState(false);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [savedDocId, setSavedDocId] = useState<number | null>(null);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [interceptorOpen, setInterceptorOpen] = useState(false);
  // Manager approval for a salesman's discount / price change (supervisor PIN).
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pendingIntercept, setPendingIntercept] = useState<InterceptorResult | null>(null);
  const pricingPinRef = useRef("");
  // Colour theme === document template (the old InvoicePaper's 5 variants)
  const [theme, setTheme] = useState<ThemeKey>(() => {
    const k = templateToTheme(getSavedTemplate());
    return THEMES.some((t) => t.key === k) ? k : "blue";
  });
  const accent = THEMES.find((t) => t.key === theme)?.accent ?? "#2563eb";
  const previewTemplate = themeToTemplate(theme);
  const changeTheme = (k: ThemeKey) => { setTheme(k); saveTemplate(themeToTemplate(k)); };

  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const addRowAfterAndFocus = useCallback((afterId: string) => {
    const fresh = makeBlankItem();
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === afterId);
      if (idx === -1) return [...prev, fresh];
      return [...prev.slice(0, idx + 1), fresh, ...prev.slice(idx + 1)];
    });
    setFocusRowId(fresh.id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLInputElement>(`input[data-row-id="${fresh.id}"]`);
        el?.focus();
        el?.select();
      });
    });
  }, []);

  const invoiceCfg = useInvoiceConfig();
  const { data: settings } = useSettings();

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice
  const [voiceMode, setVoiceMode] = useState<"customer" | "items" | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);

  // ── Data fetching (always arrays → never crash) ──
  const safeArray = async (url: string) => {
    try { const r = await fetch(url); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; }
    catch { return []; }
  };
  const { data: stores = [] } = useQuery<Store[]>({ queryKey: ["stores"], queryFn: () => safeArray("/api/stores") });
  const userStoreId = user?.storeId ?? null;
  const allowedLocations = useMemo(() => {
    if (isAdmin) return stores.filter((s) => s.active);
    if (!userStoreId) return stores.filter((s) => s.active);
    return stores.filter((s) => s.active && (
      s.id === userStoreId ||
      (s.type === "warehouse" && s.ownerStoreId === userStoreId) ||
      (s.type === "warehouse" && s.ownerStoreId == null)
    ));
  }, [stores, isAdmin, userStoreId]);
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["customers"], queryFn: () => safeArray("/api/customers") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => safeArray("/api/products") });
  const { data: existingDoc } = useQuery<ExistingDocument>({
    queryKey: ["document", editId],
    queryFn: () => fetch(`/api/documents/${editId}`).then((r) => r.json()),
    enabled: isEdit && Boolean(editId),
  });
  const editNetPaid = useMemo(() => {
    if (!isEdit || !existingDoc) return 0;
    const pays: any[] = (existingDoc as any).payments || [];
    return pays.reduce((s: number, p: any) =>
      s + (p.isRefund ? -1 : 1) * parseFloat(p.amount || "0"), 0);
  }, [isEdit, existingDoc]);

  const { data: customerBalance } = useQuery<CustomerBalance>({
    queryKey: ["customer-balance", selectedCustomer?.id],
    queryFn: () => fetch(`/api/customers/${selectedCustomer!.id}/balance`).then((r) => r.json()),
    enabled: Boolean(selectedCustomer?.id),
  });

  useEffect(() => {
    if (!existingDoc) return;
    setDocType(existingDoc.type as DocType);
    setDate(existingDoc.date.slice(0, 10));
    setStoreId(existingDoc.storeId);
    setPoNumber(existingDoc.poNumber ?? "");
    setDeliveryMethod((existingDoc as any).deliveryMethod ?? "pickup_store");
    setDeliveryAddress((existingDoc as any).deliveryAddress ?? "");
    setMapLink((existingDoc as any).mapLink ?? "");
    setDriverId((existingDoc as any).driverId ? String((existingDoc as any).driverId) : "");
    setDeliveryInstructions((existingDoc as any).deliveryInstructions ?? "");
    setCustomerInput(existingDoc.customerName);
    setDocNumber(existingDoc.number);
    setNumberTouched(true);
    setDocDiscountAmount(Number((existingDoc as any).discountAmount) || 0);
    setDocCustomData((existingDoc as any).customData || {});
    if (existingDoc.items && existingDoc.items.length > 0) {
      setItems(existingDoc.items.map((i) => {
        const qty = Number(i.qty) || 0;
        const price = Number(i.price) || 0;
        const discountAmount = Number(i.discountAmount) || 0;
        const amount = Number(i.amount) || 0;
        return {
          id: uid(), productId: i.productId, sku: i.sku ?? "", description: i.description, qty, unit: i.unit,
          price, discountType: i.discountType ?? "QAR", discountAmount, amount, originalPrice: price,
          locationStoreId: (i as any).locationStoreId ?? null,
        };
      }));
    }
    if (existingDoc.customerId) {
      const c = customers.find((c) => c.id === existingDoc.customerId);
      if (c) setSelectedCustomer(c);
    }
    if (existingDoc.type === "INV") {
      const pt = (existingDoc as any).paymentType ?? "";
      const mode = /credit/i.test(pt) ? "credit" : "cash";
      setInvoiceMode(mode);
      setInvoiceModeTouched(true);
    }
  }, [existingDoc, customers]);

  // Prefill a Return Invoice from the referenced original invoice
  const { data: refDoc } = useQuery<ExistingDocument>({
    queryKey: ["ref-document", refInvoiceId],
    queryFn: () => fetch(`/api/documents/${refInvoiceId}`).then((r) => r.json()),
    enabled: !isEdit && Boolean(refInvoiceId),
  });
  useEffect(() => {
    if (!refDoc || isEdit) return;
    setCustomerInput(refDoc.customerName ?? "");
    setPoNumber(refDoc.poNumber ?? "");
    if (refDoc.customerId) {
      const c = customers.find((c) => c.id === refDoc.customerId);
      if (c) setSelectedCustomer(c);
    }
    if (Array.isArray(refDoc.items) && refDoc.items.length > 0) {
      setItems(refDoc.items.map((i) => {
        const qty = Number(i.qty) || 0;
        const price = Number(i.price) || 0;
        const discountAmount = Number(i.discountAmount) || 0;
        const amount = Number(i.amount) || 0;
        return {
          id: uid(), productId: i.productId, sku: i.sku ?? "", description: i.description, qty, unit: i.unit,
          price, discountType: i.discountType ?? "QAR", discountAmount, amount, originalPrice: price,
        };
      }));
    }
  }, [refDoc, isEdit, customers]);

  // Prefill the customer when arriving from a customer profile's "New Invoice".
  useEffect(() => {
    if (isEdit || refInvoiceId || !prefillCustomerId || selectedCustomer) return;
    const c = customers.find((c) => c.id === Number(prefillCustomerId));
    if (c) { setSelectedCustomer(c); setCustomerInput(c.name); }
  }, [prefillCustomerId, customers, isEdit, refInvoiceId, selectedCustomer]);

  // Default the Invoice Type from the selected customer's Financial Status.
  // If customer has no credit limit, always force cash — even if staff manually picked credit.
  useEffect(() => {
    if (!selectedCustomer) { setInvoiceMode("cash"); return; }
    const hasCredit = Number(selectedCustomer.creditLimit) > 0;
    if (!hasCredit) { setInvoiceMode("cash"); return; }
    if (!invoiceModeTouched) setInvoiceMode("credit");
  }, [selectedCustomer, invoiceModeTouched]);

  const fetchNextNumber = useCallback(async (type: DocType) => {
    if (isEdit) return;
    setNumberLoading(true);
    setNumberError(null);
    try {
      const res = await fetch(`/api/documents/next-number?type=${type}`);
      if (!res.ok) throw new Error("Failed to load next number");
      const data = await res.json();
      const next = typeof data === "string" ? data : data?.number;
      if (typeof next === "string" && next.trim()) {
        setDocNumber(next);
      } else {
        throw new Error("Invalid number response");
      }
    } catch {
      setNumberError("Could not auto-generate number");
      setDocNumber((prev) => prev || `${type}-`);
    } finally {
      setNumberLoading(false);
    }
  }, [isEdit]);

  useEffect(() => {
    if (isEdit || numberTouched) return;
    fetchNextNumber(docType);
  }, [docType, isEdit, numberTouched, fetchNextNumber]);

  const handleDocTypeChange = (type: DocType) => {
    if (isEdit) return;
    setDocType(type);
    if (numberTouched) {
      const suffix = docNumber.replace(/^(INV|QT|DN|CN|RV)-/i, "");
      setDocNumber(`${type}-${suffix}`);
      return;
    }
    fetchNextNumber(type);
  };

  const handleDocNumberChange = (value: string) => {
    setNumberTouched(true);
    setNumberError(null);
    setDocNumber(value);
  };

  // ── Totals ──
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const docDiscount = docDiscountType === "QAR" ? docDiscountAmount : (subtotal * docDiscountAmount) / 100;
  const total = Math.max(0, subtotal - docDiscount);
  const totalWords = amountInWords(total);

  // Scale the A4 live preview to fit its box width (full invoice, never clipped).
  useEffect(() => {
    const box = previewBoxRef.current;
    if (!box) return;
    const fit = () => {
      const paper = box.querySelector(".paper-fit") as HTMLElement | null;
      const inner = paper?.firstElementChild as HTMLElement | null;
      if (!paper || !inner) return;
      paper.style.zoom = "1";                       // reset to read natural width
      const natural = inner.offsetWidth || 794;     // A4 @96dpi
      const avail = box.clientWidth - 24;           // minus p-3
      paper.style.zoom = String(Math.min(1, Math.max(0.3, avail / natural)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [settings, previewTemplate, docType]);

  const previewInvoice = useMemo(
    () => normalizeInvoice({
      type: docType, number: docNumber || `${docType}-DRAFT`, date, poNumber: poNumber.trim() || null,
      customerName: customerInput.trim() || null,
      invoiceType: docType === "INV" ? (invoiceMode === "credit" ? "Credit Invoice" : "Cash Invoice") : undefined,
      items: items.filter((i) => i.description.trim() || i.amount > 0),
      subtotal, discountType: "QAR", discountAmount: docDiscount, taxRate: 0, taxAmount: 0, total, totalWords, notes,
    }, selectedCustomer?.phone),
    [docType, docNumber, date, poNumber, customerInput, items, subtotal, docDiscount, total, totalWords, notes, selectedCustomer?.phone, invoiceMode],
  );
  const previewOptions = {
    showSignature: invoiceCfg.showSignature,
    showReturnPolicy: invoiceCfg.showReturnPolicy,
    showAmountInWords: invoiceCfg.showAmountInWords,
    accent,
  };

  const updateItem = useCallback((id: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, ...patch };
      updated.amount = calcLineAmount(updated);
      return updated;
    }));
  }, []);

  // ── Credit limit check ──
  const creditWarning = !creditBannerDismissed && selectedCustomer && customerBalance &&
    customerBalance.creditLimit > 0 && customerBalance.balance + total > customerBalance.creditLimit;
  const exceededBy = creditWarning ? customerBalance.balance + total - customerBalance.creditLimit : 0;

  // ── Customer autocomplete ──
  const filteredCustomers = customers.filter((c) =>
    c.active && (c.name.toLowerCase().includes(customerInput.toLowerCase()) || c.phone.includes(customerInput)));
  const handleCustomerSelect = (c: Customer) => {
    setSelectedCustomer(c); setCustomerInput(c.name); setShowCustomerDropdown(false); setCreditBannerDismissed(false);
  };

  // ── Product dialog ──
  const filteredProducts = products.filter((p) =>
    p.active && (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(productSearch.toLowerCase())));
  // Price tier: wholesale customers (contractor/corporate/government) get the
  // wholesale price when set; walk-in/retail get the retail price. Staff can still
  // override the line price after it is added.
  const tierPrice = (p: Product): number => {
    const retail = Number(p.salePrice) || 0;
    const wholesale = Number((p as any).wholesalePrice) || 0;
    const isWholesale = !!selectedCustomer && selectedCustomer.type !== "walk-in";
    return isWholesale && wholesale > 0 ? wholesale : retail;
  };
  const addProductToItems = (p: Product) => {
    const sp = tierPrice(p);
    // Same product already on the bill → bump its qty; else add a line. Keep the
    // dialog OPEN so the biller can add many items fast without reopening.
    setItems((prev) => {
      const base = prev.filter((i) => i.description || i.qty > 1);
      const existing = base.find((i) => i.productId === p.id);
      if (existing) {
        const q = existing.qty + 1;
        const net = existing.discountType === "QAR" ? Math.max(0, existing.price - existing.discountAmount) : existing.price * (1 - existing.discountAmount / 100);
        return base.map((i) => i.id === existing.id ? { ...i, qty: q, amount: Math.max(0, q * net) } : i);
      }
      const newItem: LineItem = { id: uid(), productId: p.id, sku: p.sku, description: p.name, qty: 1, unit: p.unit || "PCS", price: sp, discountType: "QAR", discountAmount: 0, amount: sp, originalPrice: sp, costPrice: Number(p.costPrice) || 0, locationStoreId: p.locationStoreId ?? null };
      return [...base, newItem];
    });
  };

  // ── File upload (PDF / image / CSV → parse to items) ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    toast({ title: "Uploading…", description: file.name });
    try {
      const res = await fetch("/api/parse-file", { method: "POST", body: form });
      if (!res.ok) throw new Error("parse failed");
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length) {
        const newItems: LineItem[] = data.items.map((vi: any) => ({
          id: uid(), sku: vi.sku ?? "", description: vi.description ?? vi.name ?? "", qty: vi.qty ?? 1,
          unit: vi.unit ?? "PCS", price: vi.price ?? 0, discountType: "QAR" as const, discountAmount: 0, amount: (vi.qty ?? 1) * (vi.price ?? 0),
        }));
        setItems((prev) => [...prev.filter((i) => i.description), ...newItems]);
        toast({ title: `Imported ${newItems.length} item(s)` });
      } else {
        toast({ title: "No items found in file", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not parse that file", description: "Try a clearer scan or a CSV.", variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Voice input ──
  const startVoice = (mode: "customer" | "items") => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Voice not supported", description: "Your browser does not support Web Speech API.", variant: "destructive" });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      if (mode === "customer") {
        setCustomerInput(transcript); setShowCustomerDropdown(true);
      } else {
        fetch("/api/voice-parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript }) })
          .then((r) => r.json())
          .then((data) => {
            if (data.items && Array.isArray(data.items)) {
              const newItems: LineItem[] = data.items.map((vi: any) => ({
                id: uid(), sku: vi.sku ?? "", description: vi.description ?? vi.name ?? "", qty: vi.qty ?? 1, unit: vi.unit ?? "PCS", price: vi.price ?? 0, discountType: "QAR" as const, discountAmount: 0, amount: (vi.qty ?? 1) * (vi.price ?? 0),
              }));
              setItems((prev) => [...prev.filter((i) => i.description), ...newItems]);
              toast({ title: `Added ${newItems.length} item(s) from voice` });
            }
          })
          .catch(() => toast({ title: "Voice parse failed", variant: "destructive" }));
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => stopVoice(), 2000);
    };
    recognition.onerror = () => stopVoice();
    recognition.start();
    recognitionRef.current = recognition;
    setVoiceMode(mode);
  };
  const stopVoice = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setVoiceMode(null);
  };

  // ── Save mutation (network only after interceptor) ──
  // Assemble the full document body from the current editor state + the interceptor
  // result. Shared by the normal save AND the credit-limit approval request (which
  // stores this payload and replays it via createDocument once a manager approves).
  const buildDocPayload = (intercept: InterceptorResult) => ({
    type: docType, date, poNumber: poNumber.trim() || null,
    number: docNumber.trim() || undefined,
    customerId: selectedCustomer?.id ?? null, customerName: customerInput.trim(),
    storeId: storeId ?? user?.storeId ?? null,
    transactionMode: intercept.transactionMode, paymentType: intercept.paymentType,
    payments: (intercept as any).payments || [],
    creditOverride: (intercept as any).creditOverride || false,
    dueDate: (intercept as any).dueDate ?? null,
    ...(docType === "INV" ? {
      deliveryMethod,
      deliveryAddress: deliveryMethod === "deliver_site" ? deliveryAddress.trim() || null : null,
      mapLink: deliveryMethod === "deliver_site" ? mapLink.trim() || null : null,
      deliveryStatus: deliveryMethod === "deliver_site" ? "pending" : null,
      driverId: deliveryMethod === "deliver_site" && driverId ? Number(driverId) : null,
      deliveryInstructions: deliveryMethod === "deliver_site" ? deliveryInstructions.trim() || null : null,
    } : {}),
    // Persist the footer discount as a resolved QAR amount (not the raw %
    // input) so the customer copy's net subtotal and every downstream total
    // stay consistent whether it was entered as QAR or %.
    discountType: "QAR", discountAmount: docDiscount,
    footerDiscountBy: docDiscount > 0 && canFooterDiscount ? (user?.id ?? null) : null,
    subtotal, taxRate: 0, taxAmount: 0, total, totalWords,
    customData: docCustomData,
    notes: receiver.trim() ? `Received by: ${receiver.trim()}` : notes,
    // originalPrice lets the server detect a salesman price reduction; the PIN
    // (from the manager-approval modal) authorises it.
    pricingOverridePin: pricingPinRef.current || undefined,
    items: items.filter((i) => i.description.trim()).map((i) => ({
      productId: i.productId ?? null, sku: i.sku, description: i.description, qty: i.qty, unit: i.unit, price: i.price, originalPrice: i.originalPrice ?? i.price, discountType: i.discountType, discountAmount: i.discountAmount, amount: i.amount,
      locationStoreId: i.locationStoreId ?? storeId ?? user?.storeId ?? null, // pull stock FROM this location
    })),
    createdBy: user?.id ?? null,
  });

  const saveMutation = useMutation({
    mutationFn: async (intercept: InterceptorResult) => {
      const payload = buildDocPayload(intercept);
      const url = isEdit ? `/api/documents/${editId}` : "/api/documents";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409 && err.code === "DUPLICATE_NUMBER") {
          throw new Error(`Invoice number ${err.number ?? docNumber} already exists. Please choose a different number.`);
        }
        if (res.status === 400 && err.code === "INVALID_NUMBER") {
          throw new Error("Invalid document number. Use format INV-123456 or enter digits only.");
        }
        if (res.status === 400 && err.code === "PRICING_APPROVAL_REQUIRED") {
          throw new Error("PRICING_PIN_NEEDED");
        }
        throw new Error(err.message ?? "Failed to save document");
      }
      return res.json();
    },
    onSuccess: (data) => {
      pricingPinRef.current = ""; // consume the approval
      const docId = data.id ?? editId;
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      if (docId) qc.invalidateQueries({ queryKey: [`/api/documents/${docId}`] });
      toast({ title: isEdit ? "Document updated" : "Document created" });
      setInterceptorOpen(false);
      setSavedDocId(docId);
      navigate(`/documents/${docId}`);
    },
    onError: (err: Error, intercept) => {
      // A salesman discount / price change → collect a manager's PIN, then retry.
      if (err.message === "PRICING_PIN_NEEDED") {
        // If a PIN was already tried (ref still set), it was wrong.
        if (pricingPinRef.current) { setPinError("Incorrect manager PIN — try again."); pricingPinRef.current = ""; }
        setPendingIntercept(intercept);
        setPinModalOpen(true);
        return;
      }
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  // Credit-limit async: a salesman over the limit sends the assembled sale to a manager.
  // The invoice is NOT created now — the manager approves it in the Approvals Center, and
  // the server then replays this payload (with the override) to create the invoice.
  const requestApprovalMutation = useMutation({
    mutationFn: async ({ intercept, reason }: { intercept: InterceptorResult; reason: string }) => {
      const docPayload = { ...buildDocPayload(intercept), number: undefined }; // fresh number at approval time
      const deferred = ((intercept as any).payments || [])
        .filter((p: any) => p.method === "Credit" || p.method === "PDC")
        .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
      const remaining = customerBalance && Number(customerBalance.creditLimit || 0) > 0
        ? Math.max(0, Number(customerBalance.creditLimit) - Number(customerBalance.balance || 0)) : 0;
      const over = Math.max(0, deferred - remaining);
      const body = {
        type: "credit_limit",
        title: "Credit-limit override",
        summary: `${customerInput.trim() || "Customer"} · over limit by QAR ${over.toFixed(2)} (invoice QAR ${total.toFixed(2)})`,
        message: reason || undefined,
        amount: deferred,
        entityType: "customer",
        entityId: selectedCustomer?.id ?? undefined,
        payload: docPayload,
      };
      const res = await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not send the request");
      return res.json();
    },
    onSuccess: (ar: any) => {
      setInterceptorOpen(false);
      toast({ title: "Approval request sent", description: `${ar?.requestNumber || "Request"} is with a manager — the invoice is created once approved.` });
      navigate("/approvals");
    },
    onError: (e: any) => toast({ title: "Could not send request", description: String(e?.message || ""), variant: "destructive" }),
  });

  // Discount async approval: when manager isn't present, salesman sends the held invoice
  // as a "discount" approval request. On approval the server replays + creates the invoice.
  const discountApprovalMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!pendingIntercept) throw new Error("No pending invoice");
      const docPayload = { ...buildDocPayload(pendingIntercept), number: undefined };
      const body = {
        type: "discount",
        title: "Discount / price change",
        summary: `${customerInput.trim() || "Customer"} · invoice QAR ${total.toFixed(2)}`,
        message: reason || undefined,
        amount: total,
        entityType: "customer",
        entityId: selectedCustomer?.id ?? undefined,
        payload: docPayload,
      };
      const res = await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not send the request");
      return res.json();
    },
    onSuccess: (ar: any) => {
      setPinModalOpen(false);
      setInterceptorOpen(false);
      toast({ title: "Discount approval sent", description: `${ar?.requestNumber || "Request"} is with a manager — the invoice is created once approved.` });
      navigate("/approvals");
    },
    onError: (e: any) => toast({ title: "Could not send request", description: String(e?.message || ""), variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/documents/${savedDocId ?? editId}/convert`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to convert");
      return res.json();
    },
    onSuccess: (data) => { toast({ title: "Converted to Invoice" }); navigate(`/documents/${data.id}`); },
    onError: (err: Error) => toast({ title: "Convert failed", description: err.message, variant: "destructive" }),
  });

  const validate = (): string | null => {
    // Every invoice must have a LINKED customer record (walk-in cash sales included) —
    // not just a typed name. Other doc types keep the lighter name-only requirement.
    if (docType === "INV") {
      if (!selectedCustomer?.id) return "Select an existing customer or add a new one before saving.";
      if (invoiceMode === "credit" && Number(selectedCustomer.creditLimit) <= 0)
        return "Credit invoices require a customer with a credit limit. Register the customer with a credit limit first, or switch to Cash Invoice.";
    } else if (!customerInput.trim()) {
      return "Customer name is required.";
    }
    const effectiveStoreId = storeId ?? user?.storeId ?? null;
    if ((docType === "INV" || docType === "QT") && !effectiveStoreId) return "Select a store before saving.";
    const lines = items.filter((i) => i.description.trim());
    if (lines.length === 0) return "At least one line item is required.";
    // Per-line sanity: whole positive qty, price > 0 (except DN/QT drafts where
    // pricing may be zero), discount never larger than the line itself.
    const priceMatters = docType === "INV" || docType === "CN" || docType === "RV";
    for (let idx = 0; idx < lines.length; idx++) {
      const i = lines[idx];
      const n = idx + 1;
      if (!Number.isFinite(i.qty) || i.qty <= 0) return `Line ${n}: quantity must be greater than zero.`;
      if (!Number.isInteger(i.qty)) return `Line ${n}: quantity must be a whole number.`;
      if (priceMatters && (!Number.isFinite(i.price) || i.price <= 0)) return `Line ${n}: price must be greater than zero.`;
      if (i.price < 0) return `Line ${n}: price cannot be negative.`;
      if (i.discountAmount < 0) return `Line ${n}: discount cannot be negative.`;
      if (i.discountType === "QAR" && i.discountAmount > i.price) return `Line ${n}: per-unit discount cannot exceed the unit price.`;
      if (i.discountType === "%" && i.discountAmount > 100) return `Line ${n}: percentage discount cannot exceed 100%.`;
    }
    // Footer/grand-total discount can never exceed the subtotal.
    if (docDiscountType === "QAR" && docDiscountAmount > subtotal) return "Footer discount cannot exceed the subtotal.";
    if (docDiscountType === "%" && docDiscountAmount > 100) return "Footer discount percentage cannot exceed 100%.";
    if (!isEdit) {
      const trimmed = docNumber.trim();
      if (!trimmed) return "Document number is required.";
      if (!/^(INV|QT|DN|CN|RV)-\d+$/i.test(trimmed) && !/^\d+$/.test(trimmed)) {
        return "Document number must be like INV-100360 or numeric digits only.";
      }
    }
    return null;
  };
  const handleSave = () => {
    const err = validate();
    if (err) { toast({ title: "Validation error", description: err, variant: "destructive" }); return; }
    if (docType === "INV") {
      if (isEdit) {
        const editBalance = Math.max(0, total - editNetPaid);
        if (invoiceMode === "credit" || editBalance < 0.01) {
          saveMutation.mutate({ transactionMode: "real", paymentType: invoiceMode === "credit" ? "Credit" : "Cash", payments: [], creditOverride: false, dueDate: null } as any);
          return;
        }
      }
      setInterceptorOpen(true);
    } else {
      saveMutation.mutate({ transactionMode: "real", paymentType: null, payments: [], creditOverride: false, dueDate: null } as any);
    }
  };

  const docTypeLabel: Record<DocType, string> = { INV: "Invoice", QT: "Quotation", DN: "Delivery Note", CN: "Credit Note", RV: "Return Invoice" };
  const isDeliveryNote = docType === "DN";

  const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium outline-none hover:border-slate-400 focus:border-[#1e2a3a] focus:ring-2 focus:ring-[#1e2a3a]/15 transition";

  return (
    <div id="invoice-editor-root" className="min-h-screen bg-slate-50">
      <datalist id="unit-options">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>

      <div className="max-w-[1500px] mx-auto px-4 lg:px-8 pt-6 pb-28">
        {/* ── Top bar ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate("/documents")} className="mt-1 text-slate-400 hover:text-slate-700 transition" title="Back">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase" style={{ fontFamily: "var(--font-sans)" }}>
                {isEdit ? `Edit ${docTypeLabel[docType]}` : `New ${docTypeLabel[docType]}`}
              </h1>
              {/* doc-type pills */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {DOC_PILLS.map((p) => (
                  <button
                    key={p.type}
                    disabled={isEdit}
                    onClick={() => handleDocTypeChange(p.type)}
                    className="px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition disabled:opacity-50"
                    style={docType === p.type
                      ? { background: accent, color: "#fff" }
                      : { background: "#f1f5f9", color: "#64748b" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {/* theme — compact color picker (decluttered from 6 chips) */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-3.5 h-3.5 rounded-full ring-1 ring-slate-200 shrink-0" style={{ background: accent }} title="Document colour" />
                <select
                  value={theme}
                  onChange={(e) => changeTheme(e.target.value as ThemeKey)}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-md pl-2 pr-1 py-1 outline-none cursor-pointer transition"
                  title="Document colour theme"
                >
                  {THEMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="icon" className="rounded-xl" title="Manual Settings" onClick={() => setAdminSettingsOpen(true)}>
                <SlidersHorizontal size={16} />
              </Button>
            )}
            {docType === "QT" && (savedDocId || editId) && (
              <Button variant="outline" className="rounded-xl" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
                {convertMutation.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <ArrowRight size={16} className="mr-2" />}
                Convert
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold tracking-wide uppercase px-6 h-11 shadow-lg"
            >
              {saveMutation.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
              {isEdit ? "Update" : "Save"} {docTypeLabel[docType]}
            </Button>
          </div>
        </div>

        {/* ── Main grid: product grid + work area + right rail ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">

          {/* ── POS Product Grid: always visible, tap a card to add / bump qty ── */}
          <aside className="lg:sticky lg:top-6 self-start bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-col print:hidden" style={{ maxHeight: "calc(100vh - 7rem)" }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2 px-1">Product Grid</p>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input className="pl-8 h-9 text-sm" placeholder="Search product / SKU…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
            </div>
            <div className="overflow-y-auto flex-1 -mx-1 px-1">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No products.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filteredProducts.slice(0, 60).map((p) => {
                    const inCart = items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0);
                    return (
                      <button key={p.id} onClick={() => addProductToItems(p)}
                        className={`relative text-left rounded-xl border p-2 transition ${inCart > 0 ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-slate-400 hover:shadow-sm"}`}>
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt="" className="w-full h-14 object-cover rounded-lg mb-1.5" />
                          : <div className="w-full h-14 rounded-lg bg-slate-100 mb-1.5 flex items-center justify-center text-slate-300"><PackagePlus size={20} /></div>}
                        <p className="text-[11px] font-semibold leading-tight line-clamp-2 min-h-[28px]">{p.name}</p>
                        <p className="text-[11px] font-bold text-[#d4a017] mt-0.5">QAR {Number(p.salePrice || 0).toFixed(2)}</p>
                        <span className={`absolute top-1 right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold ${inCart > 0 ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"}`}>{inCart > 0 ? inCart : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2">Tap to add · tap again for more</p>
          </aside>

          <div className="space-y-6 min-w-0">

            {/* LIVE PREVIEW card */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-7">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-4">Live Preview</p>
              <div ref={previewBoxRef} id="invoice-print-area" className="rounded-xl bg-slate-50/60 border border-slate-100 p-3 overflow-auto flex justify-center" style={{ maxHeight: "72vh" }}>
                {settings && (
                  <div className="paper-fit origin-top shadow-xl">
                    <InvoiceRenderer
                      templateId={previewTemplate}
                      settings={settings as any}
                      invoice={previewInvoice}
                      options={previewOptions}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Always-on credit info panel for a credit customer (limit > 0).
                Staff sees balance / limit / remaining before committing a sale. */}
            {selectedCustomer && customerBalance && Number(customerBalance.creditLimit || 0) > 0 && !creditWarning && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <p className="font-bold text-sm text-blue-900">{selectedCustomer.name}</p>
                  <div className="flex items-center gap-1.5">
                    {selectedCustomer.type !== "walk-in" && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-100 rounded px-2 py-0.5">Wholesale price</span>
                    )}
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 rounded px-2 py-0.5">Credit Account</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-blue-900/80">
                  <span>Balance: <b className="font-mono">QAR {Number(customerBalance.balance).toFixed(2)}</b></span>
                  <span>Limit: <b className="font-mono">QAR {Number(customerBalance.creditLimit).toFixed(2)}</b></span>
                  <span>Remaining: <b className="font-mono text-green-700">QAR {Math.max(0, Number(customerBalance.creditLimit) - Number(customerBalance.balance)).toFixed(2)}</b></span>
                </div>
              </div>
            )}

            {/* Credit warning */}
            {creditWarning && customerBalance && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-red-600">Credit limit exceeded</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-red-500/80 text-xs">
                    <span>Balance: QAR {customerBalance.balance.toFixed(2)}</span>
                    <span>Limit: QAR {customerBalance.creditLimit.toFixed(2)}</span>
                    <span className="font-bold">Over by: QAR {exceededBy.toFixed(2)}</span>
                  </div>
                </div>
                <button onClick={() => setCreditBannerDismissed(true)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
              </div>
            )}

          </div>{/* end space-y-6 right column */}
        </div>{/* end product-grid + preview grid */}

            {/* Side-by-side: Invoice Details (narrow) + Items (wide) — full width below product grid */}
            <div className="flex flex-col lg:flex-row gap-4 lg:items-start">

            {/* INVOICE DETAILS card */}
            <ErrorBoundary label="invoice-details">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 lg:w-[420px] lg:min-w-[420px] lg:shrink-0">
                <h2 className="text-sm font-black uppercase tracking-tight text-slate-900 mb-3" style={{ fontFamily: "var(--font-sans)" }}>
                  {docTypeLabel[docType]} Details
                </h2>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <Field label={`${docTypeLabel[docType]} Number`}>
                    <div className="relative">
                      <input
                        className={inputCls + " font-mono pr-10"}
                        value={docNumber}
                        readOnly={isEdit}
                        placeholder={numberLoading ? "Loading…" : `${docType}-`}
                        onChange={(e) => handleDocNumberChange(e.target.value)}
                      />
                      {numberLoading && !isEdit && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
                      )}
                    </div>
                    {numberError && !isEdit && (
                      <p className="text-xs text-amber-600 mt-1">{numberError} — you can type a custom number.</p>
                    )}
                  </Field>
                  <Field label="Date">
                    <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>

                  <Field label={docType === "INV" ? "Customer *" : "Customer Name"} className="relative col-span-2">
                    <input
                      ref={customerInputRef}
                      className={inputCls}
                      placeholder="Search name or phone…"
                      value={customerInput}
                      autoComplete="off"
                      onChange={(e) => { setCustomerInput(e.target.value); setSelectedCustomer(null); setShowCustomerDropdown(e.target.value.length > 0); setCreditBannerDismissed(false); }}
                      onFocus={() => customerInput && setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                    />
                    {showCustomerDropdown && filteredCustomers.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-56 overflow-y-auto">
                        {filteredCustomers.slice(0, 8).map((c) => (
                          <button key={c.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-slate-50 text-sm" onMouseDown={() => handleCustomerSelect(c)}>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-slate-400 text-xs">{c.phone} · {c.type} · {Number(c.creditLimit) > 0 ? "Credit" : "Cash"}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      {selectedCustomer ? (
                        <span className="text-[11px] font-semibold text-green-700">✓ {selectedCustomer.name} linked · {Number(selectedCustomer.creditLimit) > 0 ? "Credit" : "Cash"}</span>
                      ) : (
                        <span className="text-[11px] text-amber-600">{docType === "INV" ? "Select or add a customer before saving" : "Type a customer name"}</span>
                      )}
                      <button type="button" onClick={() => setAddCustomerOpen(true)} className="text-[11px] font-bold text-[#1e2a3a] hover:opacity-70 shrink-0">+ Add new customer</button>
                    </div>
                  </Field>

                  {docType === "INV" && (() => {
                    const hasCreditAccount = !!selectedCustomer && Number(selectedCustomer.creditLimit) > 0;
                    return (
                    <Field label="Invoice Type" className="col-span-2">
                      <div className="grid grid-cols-2 gap-2">
                        {([["cash", "Cash Invoice"], ["credit", "Credit Invoice"]] as const).map(([val, label]) => {
                          const disabled = val === "credit" && !hasCreditAccount;
                          return (
                          <button
                            key={val}
                            type="button"
                            disabled={disabled}
                            onClick={() => { if (!disabled) { setInvoiceMode(val); setInvoiceModeTouched(true); } }}
                            className={cn(
                              "px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                              disabled
                                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60"
                                : "cursor-pointer active:scale-[0.98]",
                              !disabled && invoiceMode === val
                                ? (val === "credit" ? "border-amber-500 bg-amber-500 text-white shadow-md" : "border-green-600 bg-green-600 text-white shadow-md")
                                : !disabled ? "border-slate-300 bg-white text-slate-600 hover:border-slate-500 hover:bg-slate-50" : "",
                            )}
                          >
                            {label}
                          </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {!hasCreditAccount
                          ? "Credit invoice requires a registered customer with a credit limit."
                          : invoiceMode === "cash"
                          ? "Full payment now via Cash / Card / Online Transfer. No PDC."
                          : "Allows partial, zero, or PDC payment. Needs a Credit account."}
                      </p>
                    </Field>
                    );
                  })()}

                  {(settings as any)?.showPoField !== false && (
                    <Field label="PO Number">
                      <input className={inputCls + " font-mono"} placeholder="Customer PO # (optional)" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                    </Field>
                  )}

                  {docType === "INV" && (
                    <Field label="Delivery Method">
                      <select
                        className={inputCls}
                        value={deliveryMethod}
                        onChange={(e) => setDeliveryMethod(e.target.value)}
                      >
                        <option value="pickup_store">Pick up from Store</option>
                        <option value="pickup_warehouse">Pick up from Warehouse</option>
                        <option value="deliver_site">Deliver to Site</option>
                      </select>
                    </Field>
                  )}

                  {docType === "INV" && deliveryMethod === "deliver_site" && (
                    <>
                      <Field label="Delivery Address" className="col-span-2">
                        <input className={inputCls} placeholder="Site address for delivery…" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                      </Field>
                      <Field label="Google Maps Pin (link)" className="col-span-2">
                        <input className={inputCls} placeholder="Paste the Google Maps location link — driver taps it to navigate…" value={mapLink} onChange={(e) => setMapLink(e.target.value)} />
                        <p className="text-[11px] text-slate-400 mt-1">Shows on the delivery note only — never on the invoice. In Google Maps: drop a pin → Share → Copy link.</p>
                      </Field>
                      <Field label="Assign Driver">
                        <select className={inputCls} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                          <option value="">— unassigned —</option>
                          {drivers.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Special Instructions">
                        <input className={inputCls} placeholder="e.g. call before arrival…" value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} />
                      </Field>
                    </>
                  )}

                  <Field label="Receiver Signature" className="col-span-2">
                    <input className={inputCls} placeholder="Enter receiver name…" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
                  </Field>

                  <div className="col-span-2">
                    <CustomFields moduleKey="documents" value={docCustomData} onChange={setDocCustomData} />
                  </div>

                  {isAdmin && (
                    <Field label="Store" className="col-span-2">
                      <ErrorBoundary label="store-select">
                        <Select value={storeId ? storeId.toString() : undefined} onValueChange={(v) => setStoreId(Number(v))}>
                          <SelectTrigger className="rounded-xl h-11 bg-slate-50/60"><SelectValue placeholder="Select store" /></SelectTrigger>
                          <SelectContent>
                            {(Array.isArray(stores) ? stores : []).filter((s) => s.active && s.type === "store").map((s) => (
                              <SelectItem key={s.id} value={s.id.toString()}>{s.nameEn}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </ErrorBoundary>
                    </Field>
                  )}
                </div>
              </section>
            </ErrorBoundary>

            {/* ITEMS card */}
            <ErrorBoundary label="items-grid">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5 lg:flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-black uppercase tracking-tight text-slate-900" style={{ fontFamily: "var(--font-sans)" }}>Items</h2>
                  <div className="flex gap-2 items-center">
                    <button onClick={() => (voiceMode === "items" ? stopVoice() : startVoice("items"))}
                      title="Speak items — e.g. 'add 20 bags of cement at 15'"
                      className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide transition ${voiceMode === "items" ? "text-red-500 animate-pulse" : "text-slate-500 hover:text-slate-900"}`}>
                      {voiceMode === "items" ? <MicOff size={15} /> : <Mic size={15} />} Voice
                    </button>
                    <button onClick={() => setProductDialogOpen(true)} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-900 transition">
                      <PackagePlus size={15} /> Products
                    </button>
                    <button onClick={() => setItems((p) => [...p, makeBlankItem()])} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-900 hover:opacity-70 transition">
                      <Plus size={15} /> Add Item
                    </button>
                  </div>
                </div>

                {/* Flat Excel grid — desktop */}
                <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide select-none">
                        <th className="border border-slate-200 w-8 py-1.5 font-semibold">#</th>
                        <th className="border border-slate-200 text-left px-2 py-1.5 font-semibold min-w-[200px]">Description</th>
                        <th className="border border-slate-200 text-left px-2 py-1.5 font-semibold w-20">SKU</th>
                        <th className="border border-slate-200 text-center py-1.5 font-semibold w-14">Qty</th>
                        <th className="border border-slate-200 text-center py-1.5 font-semibold w-16">Unit</th>
                        <th className="border border-slate-200 text-left px-2 py-1.5 font-semibold w-28" title="Which store/warehouse this line's stock comes from">From</th>
                        {!isDeliveryNote && (<>
                          <th className="border border-slate-200 text-right px-2 py-1.5 font-semibold w-16 text-amber-700" title="Cost price — staff reference only, never printed">Cost*</th>
                          <th className="border border-slate-200 text-right px-2 py-1.5 font-semibold w-20">Price</th>
                          <th className="border border-slate-200 text-right px-2 py-1.5 font-semibold w-20">Disc.</th>
                          <th className="border border-slate-200 text-right px-2 py-1.5 font-semibold w-24">Total</th>
                        </>)}
                        <th className="border border-slate-200 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <LineItemRow
                          key={item.id}
                          item={item}
                          index={idx}
                          isDeliveryNote={isDeliveryNote}
                          stores={allowedLocations}
                          defaultStoreId={storeId ?? user?.storeId ?? null}
                          onChange={(patch) => updateItem(item.id, patch)}
                          onDelete={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                          autoFocusName={item.id === focusRowId}
                          onEnterKey={() => addRowAfterAndFocus(item.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {items.map((item, idx) => (
                    <LineItemCard key={item.id} item={item} index={idx} isDeliveryNote={isDeliveryNote} stores={allowedLocations} defaultStoreId={storeId ?? user?.storeId ?? null}
                      onChange={(patch) => updateItem(item.id, patch)}
                      onDelete={() => setItems((prev) => prev.filter((i) => i.id !== item.id))} />
                  ))}
                </div>

                {/* Upload dropzone */}
                <input ref={fileInputRef} type="file" accept=".csv,.pdf,image/*" className="hidden" onChange={handleFileUpload} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 text-sm font-semibold hover:border-slate-400 hover:text-slate-700 transition"
                >
                  <Upload size={16} /> Upload File / PDF / Image / CSV
                </button>
                {!isDeliveryNote && (
                  <p className="mt-2 text-[11px] text-amber-700/70">
                    <span className="font-semibold">Cost*</span> is shown for staff pricing decisions only — it never appears on the printed / PDF document.
                  </p>
                )}

                {/* Totals */}
                {!isDeliveryNote && (
                  <div className="mt-7 pt-5 border-t border-slate-100 space-y-2">
                    <div className="flex justify-end items-center gap-6 text-sm">
                      <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">Subtotal (after line discounts)</span>
                      <span className="font-mono font-bold tabular-nums w-32 text-right">{subtotal.toFixed(2)}</span>
                    </div>
                    {/* Grand-total (footer) discount — admin/manager only, logged, NOT printed. */}
                    {canFooterDiscount && (
                      <div className="flex justify-end items-center gap-3 text-sm">
                        <span className="text-amber-600 font-semibold uppercase tracking-wider text-[11px]">Gross Discount (internal)</span>
                        <input type="number" min={0} value={docDiscountAmount || ""}
                          onChange={(e) => setDocDiscountAmount(Number(e.target.value) || 0)}
                          className="h-8 w-24 text-right font-mono border border-amber-200 rounded px-2" placeholder="0" />
                        <button type="button" onClick={() => setDocDiscountType(docDiscountType === "QAR" ? "%" : "QAR")}
                          className="px-2 h-8 text-xs font-bold border border-amber-200 rounded">{docDiscountType}</button>
                        <span className="font-mono text-amber-600 w-24 text-right">−{docDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    {docDiscount > 0 && !canFooterDiscount && (
                      <p className="text-right text-[11px] text-amber-600">Gross Discount −{docDiscount.toFixed(2)} (manager applied)</p>
                    )}
                    <div className="flex justify-end">
                      <div className="text-right">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Grand Total</p>
                        <p className="text-4xl font-black tabular-nums" style={{ color: accent }}>{total.toFixed(2)}</p>
                        <p className="text-xs font-bold text-slate-400">QAR</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Amount in words */}
                {!isDeliveryNote && (
                  <div className="mt-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Amount in Words</p>
                    <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm italic text-slate-600" style={{ fontFamily: "var(--font-sans)" }}>
                      {totalWords}
                    </div>
                  </div>
                )}
              </section>
            </ErrorBoundary>

            </div>{/* end side-by-side flex */}
      </div>

      {/* ── Product Search Dialog ── */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Select Products</DialogTitle></DialogHeader>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name, SKU, category…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} autoFocus />
          </div>
          <div className="overflow-y-auto flex-1 -mx-1 px-1">
            {filteredProducts.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">No products found.</div>
            ) : (
              <div className="space-y-1">
                {filteredProducts.map((p) => {
                  const inCart = items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0);
                  return (
                  <button key={p.id} className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center gap-3 ${inCart > 0 ? "bg-emerald-50 hover:bg-emerald-100" : "hover:bg-muted"}`} onClick={() => addProductToItems(p)}>
                    {p.imageUrl && <img src={p.imageUrl} alt="" className="w-10 h-10 rounded object-cover border shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{p.name}</span>
                      <div className="text-xs text-muted-foreground mt-0.5">SKU: {p.sku} · {p.category} · {p.unit}</div>
                      {(p.locationStoreId || p.locationArea) && (
                        <div className="text-[11px] text-emerald-700 mt-0.5 truncate">
                          📍 {[
                            p.locationStoreId ? stores.find((s: any) => s.id === p.locationStoreId)?.nameEn : null,
                            p.locationArea, p.locationRack, p.locationShelf,
                          ].filter(Boolean).join(" → ")}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div className="font-semibold whitespace-nowrap">QAR {Number(p.salePrice || 0).toFixed(2)}</div>
                      {inCart > 0
                        ? <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold">{inCart}</span>
                        : <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-white shrink-0"><Plus size={16} /></span>}
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="mt-2">
            <span className="text-xs text-muted-foreground mr-auto self-center">Tap a product to add · tap again for more</span>
            <Button onClick={() => { setProductDialogOpen(false); setProductSearch(""); }} className="rounded-xl">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manager approval for a discount / price change ── */}
      <ManagerPinModal
        open={pinModalOpen}
        error={pinError}
        pending={saveMutation.isPending}
        onClose={() => { setPinModalOpen(false); setPinError(null); }}
        onApprove={(pin) => {
          setPinError(null);
          pricingPinRef.current = pin;
          setPinModalOpen(false);
          if (pendingIntercept) saveMutation.mutate(pendingIntercept);
        }}
        onRequestRemote={!isEdit ? (reason) => discountApprovalMutation.mutate(reason) : undefined}
        requestingRemote={discountApprovalMutation.isPending}
      />

      {/* ── Admin Manual Settings ── */}
      <AdminSettingsModal open={adminSettingsOpen} onClose={() => setAdminSettingsOpen(false)} />

      {/* ── Inline add-customer (mid-invoice, no navigation) ── */}
      <InlineAddCustomerDialog
        open={addCustomerOpen}
        onClose={() => setAddCustomerOpen(false)}
        onCreated={(c: QuickCustomer) => {
          setSelectedCustomer(c as unknown as Customer);
          setCustomerInput(c.name);
          setShowCustomerDropdown(false);
          setCreditBannerDismissed(false);
        }}
      />

      {/* ── Pre-save interceptor ── */}
      <SaveInterceptorModal
        open={interceptorOpen}
        onClose={() => setInterceptorOpen(false)}
        onConfirm={(result) => saveMutation.mutate(result)}
        docLabel={docTypeLabel[docType]}
        total={total}
        saving={saveMutation.isPending}
        invoiceDate={date}
        invoiceMode={docType === "INV" ? invoiceMode : undefined}
        editBalance={isEdit ? Math.max(0, total - editNetPaid) : undefined}
        creditRemaining={customerBalance && Number(customerBalance.creditLimit || 0) > 0 ? Math.max(0, Number(customerBalance.creditLimit || 0) - Number(customerBalance.balance || 0)) : undefined}
        customer={selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name, creditLimit: Number(selectedCustomer.creditLimit || 0) } : undefined}
        currentUserRole={user?.role}
        onRequestApproval={isEdit ? undefined : (intercept, reason) => requestApprovalMutation.mutate({ intercept, reason })}
        requestingApproval={requestApprovalMutation.isPending}
        onCustomerUpgraded={() => {
          qc.invalidateQueries({ queryKey: ["customers"] });
          qc.invalidateQueries({ queryKey: ["/api/customers"] });
          qc.invalidateQueries({ queryKey: ["customer-balance", selectedCustomer?.id] });
        }}
      />

      {/* ── Sticky action bar — payable total + save, always in reach ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur shadow-[0_-4px_20px_rgba(0,0,0,0.07)] print:hidden">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-8 py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">Grand Total</p>
            <p className="text-2xl font-black text-slate-900 leading-tight font-mono">QAR {total.toFixed(2)}</p>
            <p className="text-[11px] text-slate-400 truncate leading-none">
              {items.filter((i) => i.description.trim()).length} item(s){docDiscount > 0 ? ` · disc −${docDiscount.toFixed(2)}` : ""}
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold tracking-wide uppercase px-8 h-12 shadow-lg shrink-0"
          >
            {saveMutation.isPending ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Save size={18} className="mr-2" />}
            {isEdit ? "Update" : "Save"} {docTypeLabel[docType]}
          </Button>
        </div>
      </div>

      {/* Print-only invoice, portalled to <body>. On print we hide the whole app
          (#root) and show only this, so it flows in normal document order and
          paginates cleanly — no trailing blank page from the hidden editor's height. */}
      {settings && createPortal(
        <div id="print-root" className="hidden">
          <InvoiceRenderer templateId={previewTemplate} settings={settings as any} invoice={previewInvoice} options={previewOptions} />
        </div>,
        document.body,
      )}

      {/* ── Responsive A4 preview fit + print ── */}
      <style>{`
        /* iOS Safari auto-zooms any focused input below 16px — force 16px on mobile */
        @media (max-width: 767px) {
          #invoice-editor-root input,
          #invoice-editor-root textarea,
          #invoice-editor-root select { font-size: 16px !important; }
        }
        /* Fallback before the JS fit runs; the fit effect sets an inline zoom that wins. */
        .paper-fit { zoom: 0.5; }
        /* The @page margin is the ONLY print margin; A4 keeps the paper's 210mm design
           exact. In print the paper drops its fixed 210×297mm + inner padding, then FILLS
           one A4 page via flex + min-height so the amount-in-words, totals and signatures
           sit at the BOTTOM of the page instead of leaving a big empty gap. height:auto
           still lets a long invoice grow onto extra pages — no forced full height, no blank tail. */
        @page { size: A4; margin: 10mm; }
        /* Screen: the print-only portal is hidden. */
        #print-root { display: none; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          /* Hide the entire app; show ONLY the portalled invoice, in normal flow, so
             it paginates cleanly with no trailing blank page. */
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; }
          #print-root .paper-fit { zoom: 1 !important; transform: none !important; }
          /* Keep the flex column + a one-page min-height so the existing flex-1 (items)
             and mt-auto (footer block) push the bottom section down to the page bottom.
             272mm ≈ A4 printable (297 − 2×10mm) with a small buffer so a short invoice
             never spills a hairline onto a blank 2nd page; height:auto allows real
             overflow to page 2+ for long invoices. */
          #print-root .invoice-paper {
            display: flex !important; flex-direction: column !important;
            width: 100% !important; min-height: 272mm !important; height: auto !important;
            padding: 0 !important; margin: 0 !important; box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Field wrapper ── */
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ─── LineItemRow (flat Excel desktop row) ───────────────────────────────────
interface LineItemRowProps {
  item: LineItem;
  index: number;
  isDeliveryNote: boolean;
  stores?: Store[];
  defaultStoreId?: number | null;
  onChange: (patch: Partial<LineItem>) => void;
  onDelete: () => void;
  autoFocusName?: boolean;
  onEnterKey?: () => void;
}
function LineItemRow({ item, index, isDeliveryNote, stores = [], defaultStoreId = null, onChange, onDelete, autoFocusName, onEnterKey }: LineItemRowProps) {
  const priceChanged = item.originalPrice !== undefined && item.price !== item.originalPrice;
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocusName) nameRef.current?.focus(); }, [autoFocusName]);
  // Excel-like keyboard nav. lastCol = last editable column index for this row type.
  const lastCol = isDeliveryNote ? 3 : 5;
  const onNav = (e: React.KeyboardEvent<HTMLInputElement>, c: number) => {
    const input = e.currentTarget;
    const isText = input.type !== "number";
    const atStart = isText ? input.selectionStart === 0 && input.selectionEnd === 0 : true;
    const atEnd = isText ? input.selectionStart === input.value.length && input.selectionEnd === input.value.length : true;
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (c >= lastCol) onEnterKey?.();        // last column → append new row + focus its Description
        else focusGridCell(index, c + 1);        // else move right
        break;
      case "ArrowDown": e.preventDefault(); focusGridCell(index + 1, c); break;
      case "ArrowUp":   e.preventDefault(); focusGridCell(index - 1, c); break;
      case "ArrowRight": if (atEnd && c < lastCol) { e.preventDefault(); focusGridCell(index, c + 1); } break;
      case "ArrowLeft":  if (atStart && c > 0)     { e.preventDefault(); focusGridCell(index, c - 1); } break;
    }
  };
  const cell = "w-full h-9 px-2 bg-transparent border-0 outline-none text-base md:text-sm placeholder:text-slate-300 focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-400";
  return (
    <tr className="group">
      <td className="border border-slate-200 text-center text-xs text-slate-400 w-8">{index + 1}</td>
      <td className="border border-slate-200 p-0">
        <input ref={nameRef} data-row-id={item.id} data-grid="1" data-r={index} data-c={0} value={item.description} onChange={(e) => onChange({ description: e.target.value })} onKeyDown={(e) => onNav(e, 0)} placeholder="Item description" autoComplete="off" className={cell} />
      </td>
      <td className="border border-slate-200 p-0 w-28">
        <input data-grid="1" data-r={index} data-c={1} value={item.sku} onChange={(e) => onChange({ sku: e.target.value })} onKeyDown={(e) => onNav(e, 1)} placeholder="—" autoComplete="off" className={cell + " font-mono text-xs text-slate-500"} />
      </td>
      <td className="border border-slate-200 p-0 w-16">
        <input data-grid="1" data-r={index} data-c={2} type="number" min={0} value={item.qty || ""} onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })} onKeyDown={(e) => onNav(e, 2)} className={cell + " text-center font-mono"} />
      </td>
      <td className="border border-slate-200 p-0 w-20">
        <input data-grid="1" data-r={index} data-c={3} list="unit-options" value={item.unit} onChange={(e) => onChange({ unit: e.target.value })} onKeyDown={(e) => onNav(e, 3)} className={cell + " text-center uppercase"} />
      </td>
      <td className="border border-slate-200 p-0 w-32">
        <select value={String((item.locationStoreId ?? defaultStoreId) ?? "")} onChange={(e) => onChange({ locationStoreId: e.target.value ? Number(e.target.value) : null })}
          className={cell + " text-xs cursor-pointer"} title="Stock pulled from this location" tabIndex={-1}>
          {stores.filter((s) => s.active).map((s) => (
            <option key={s.id} value={String(s.id)}>{s.nameEn.replace(/ —.*| -.*/, "")}</option>
          ))}
        </select>
      </td>
      {!isDeliveryNote && (<>
        <td className="border border-slate-200 px-2 text-right font-mono text-xs text-amber-700/80 w-20 bg-amber-50/30" title="Cost — staff only, never printed">
          {item.costPrice != null && Number(item.costPrice) > 0 ? Number(item.costPrice).toFixed(2) : "—"}
        </td>
        <td className="border border-slate-200 p-0 w-24 relative">
          <input data-grid="1" data-r={index} data-c={4} type="number" min={0} value={item.price || ""} onChange={(e) => onChange({ price: Number(e.target.value) || 0 })} onKeyDown={(e) => onNav(e, 4)} className={cell + " text-right font-mono"} />
          {priceChanged && <span className="absolute top-0.5 right-0.5 text-[8px] leading-none px-1 py-0.5 rounded bg-yellow-100 text-yellow-800 pointer-events-none">mod</span>}
        </td>
        <td className="border border-slate-200 p-0 w-24">
          <div className="flex items-center">
            <input data-grid="1" data-r={index} data-c={5} type="number" min={0} value={item.discountAmount || ""} onChange={(e) => onChange({ discountAmount: Number(e.target.value) || 0 })} onKeyDown={(e) => onNav(e, 5)} placeholder="0" className={cell + " text-right font-mono"} />
            <button type="button" tabIndex={-1} onClick={() => onChange({ discountType: item.discountType === "QAR" ? "%" : "QAR" })} className="px-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-900 shrink-0" title="Toggle discount type (QAR / %)">{item.discountType === "%" ? "%" : "QAR"}</button>
          </div>
        </td>
        <td className="border border-slate-200 px-2 text-right font-mono font-bold text-sm text-slate-900 tabular-nums w-28 bg-slate-50/60">{item.amount.toFixed(2)}</td>
      </>)}
      <td className="border border-slate-200 text-center w-8">
        <button onClick={onDelete} tabIndex={-1} className="text-slate-300 hover:text-destructive transition-colors p-1 opacity-0 group-hover:opacity-100" title="Remove row"><Trash2 size={14} /></button>
      </td>
    </tr>
  );
}

// ─── LineItemCard (mobile) ───────────────────────────────────────────────────
function LineItemCard({ item, index, isDeliveryNote, stores = [], defaultStoreId = null, onChange, onDelete }: LineItemRowProps) {
  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-white">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">Item #{index + 1}</span>
        <button onClick={onDelete} className="text-slate-300 hover:text-destructive p-1"><Trash2 size={15} /></button>
      </div>
      <Input value={item.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Description" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-slate-400">Qty</Label>
          <Input type="number" min={0} value={item.qty || ""} onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Unit</Label>
          <Input list="unit-options" value={item.unit} onChange={(e) => onChange({ unit: e.target.value })} className="mt-1 uppercase" />
        </div>
      </div>
      <div className="mt-2">
        <Label className="text-xs text-slate-400">From (stock location)</Label>
        <select value={String((item.locationStoreId ?? defaultStoreId) ?? "")} onChange={(e) => onChange({ locationStoreId: e.target.value ? Number(e.target.value) : null })}
          className="mt-1 w-full h-9 px-2 rounded-md border border-slate-300 text-sm">
          {stores.filter((s) => s.active).map((s) => <option key={s.id} value={String(s.id)}>{s.nameEn}</option>)}
        </select>
      </div>
      {!isDeliveryNote && (
        <>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <Label className="text-xs text-slate-400">Price (QAR)</Label>
              <Input type="number" min={0} value={item.price || ""} onChange={(e) => onChange({ price: Number(e.target.value) || 0 })} className="mt-1 text-right" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Discount</Label>
              <div className="flex items-center gap-1 mt-1">
                <Input type="number" min={0} value={item.discountAmount || ""} onChange={(e) => onChange({ discountAmount: Number(e.target.value) || 0 })} className="text-right" />
                <button type="button" onClick={() => onChange({ discountType: item.discountType === "QAR" ? "%" : "QAR" })} className="px-2 h-9 text-xs font-bold border border-slate-200 rounded shrink-0">{item.discountType}</button>
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-amber-700/80">Cost*: {item.costPrice != null && Number(item.costPrice) > 0 ? Number(item.costPrice).toFixed(2) : "—"}</span>
            <span className="font-semibold text-base">QAR {item.amount.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  );
}
