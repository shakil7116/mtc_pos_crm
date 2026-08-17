import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
  ChevronUp,
  Edit2,
  ShoppingCart,
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MessageSquare,
  X,
  Wallet,
  Camera,
  Upload,
  ScanLine,
  Loader2,
  DollarSign,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import CustomFields, { useFieldDefs, validateCustomFields } from "@/components/CustomFields";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { validateName, validatePhone, validateEmail, formatPhone } from "@/lib/validation";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
type Supplier = {
  id: number;
  name: string;
  company: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  paymentTerms: string | null;
  creditDays: number | null;
  paymentMode: string | null;
  active: boolean | null;
};

type Product = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  salePrice: string | null;
  costPrice: string | null;
  minStockQty: string | null;
  supplierId: number | null;
  active: boolean | null;
};

type InventoryItem = {
  id: number;
  productId: number;
  storeId: number;
  qty: string | null;
  product?: Product;
  store?: { id: number; nameEn: string };
};

type SupplierOrder = {
  id: number;
  supplierId: number;
  poNumber: string | null;
  status: string | null;
  notes: string | null;
  items: Array<{
    productId?: number;
    name: string;
    description?: string;
    qty: number;
    unit: string;
    cost?: number;
    price?: number;
    receivedQty?: number;
  }> | null;
  sentAt: string | null;
  receivedAt: string | null;
  paymentTermsDays: number | null;
  paymentDueDate: string | null;
  receiptDate: string | null;
  supplierInvoiceNumber: string | null;
  supplierInvoiceUrl: string | null;
  supplierInvoiceAmount: string | null;
};

type SupplierForm = {
  name: string;
  company: string;
  whatsapp: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  paymentTerms: string;
  creditDays: string;
  paymentMode: string;
};

type OrderItem = {
  productId: number | null;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  qty: number;
};

/* ─────────────────────────────────────────
   Constants
───────────────────────────────────────── */
const BLANK_SUPPLIER: SupplierForm = {
  name: "",
  company: "",
  whatsapp: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  paymentTerms: "",
  creditDays: "60",
  paymentMode: "credit",
};

const COMPANY_NAME = "Mamun M Trading +974 30703722";
const DELIVER_ADDRESS = "Najma Street, Najma, Doha";
const COMPANY_CONTACT = "+974 30703722";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusColor(status: string | null) {
  switch (status) {
    case "sent":
      return "bg-blue-100 text-blue-700";
    case "received":
      return "bg-green-100 text-green-700";
    case "partial":
      return "bg-amber-100 text-amber-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function cleanWa(wa: string | null | undefined): string {
  if (!wa) return "";
  return wa.replace(/[^0-9+]/g, "");
}

/* ─────────────────────────────────────────
   Supplier Form Dialog (Add / Edit)
───────────────────────────────────────── */
function SupplierDialog({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: Supplier | null;
}) {
  const [form, setForm] = useState<SupplierForm>(
    existing
      ? {
          name: existing.name ?? "",
          company: existing.company ?? "",
          whatsapp: existing.whatsapp ?? "",
          phone: existing.phone ?? "",
          email: existing.email ?? "",
          address: existing.address ?? "",
          notes: existing.notes ?? "",
          paymentTerms: existing.paymentTerms ?? "",
          creditDays: String((existing as any).creditDays ?? "60"),
          paymentMode: (existing as any).paymentMode ?? "credit",
        }
      : BLANK_SUPPLIER
  );
  const [errors, setErrors] = useState<Partial<SupplierForm>>({});
  const [customData, setCustomData] = useState<Record<string, any>>((existing as any)?.customData || {});
  const { data: supplierFieldDefs = [] } = useFieldDefs("suppliers");
  const qc = useQueryClient();
  const { toast } = useToast();

  const isEdit = Boolean(existing);

  const mut = useMutation({
    mutationFn: (body: SupplierForm) => {
      const url = isEdit ? `/api/suppliers/${existing!.id}` : "/api/suppliers";
      const method = isEdit ? "PUT" : "POST";
      return fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, creditDays: Number(body.creditDays) || 0, customData }),
      }).then((r) => {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: isEdit ? "Supplier updated" : "Supplier added" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to save supplier", variant: "destructive" });
    },
  });

  function validate(): boolean {
    const errs: Partial<SupplierForm> = {};
    const nameErr = validateName(form.name);
    if (nameErr) errs.name = nameErr;
    const waErr = validatePhone(form.whatsapp, true);
    if (waErr) errs.whatsapp = waErr;
    const phoneErr = validatePhone(form.phone);
    if (phoneErr) errs.phone = phoneErr;
    const emailErr = validateEmail(form.email);
    if (emailErr) errs.email = emailErr;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function set(field: keyof SupplierForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function handleSubmit() {
    if (!validate()) return;
    const missing = validateCustomFields(supplierFieldDefs, customData);
    if (missing) { toast({ title: `${missing} is required`, variant: "destructive" }); return; }
    mut.mutate(form);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Supplier" : "New Supplier"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="s-name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="s-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Contact / supplier name"
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <Label htmlFor="s-company">Company</Label>
            <Input
              id="s-company"
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="Company name"
            />
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <Label htmlFor="s-wa">
              WhatsApp <span className="text-red-500">*</span>
            </Label>
            <Input
              id="s-wa"
              inputMode="tel"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", formatPhone(e.target.value))}
              placeholder="+974 XXXX XXXX"
              className={cn(errors.whatsapp && "border-red-500 focus-visible:ring-red-500")}
            />
            {errors.whatsapp && (
              <p className="text-xs text-red-500">{errors.whatsapp}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="s-phone">Phone</Label>
            <Input
              id="s-phone"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set("phone", formatPhone(e.target.value))}
              placeholder="+974 XXXX XXXX"
              className={cn(errors.phone && "border-red-500 focus-visible:ring-red-500")}
            />
            {errors.phone && (
              <p className="text-xs text-red-500">{errors.phone}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="s-email">Email</Label>
            <Input
              id="s-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="supplier@example.com"
              className={cn(errors.email && "border-red-500 focus-visible:ring-red-500")}
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="s-address">Address</Label>
            <Input
              id="s-address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Street, City"
            />
          </div>

          {/* Payment Mode & Credit Days */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)}>
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Credit Days</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.creditDays} onChange={(e) => set("creditDays", e.target.value)}
                disabled={form.paymentMode === "cash"}>
                <option value="0">0 (Cash)</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </select>
            </div>
          </div>

          {/* Payment Terms (free text) */}
          <div className="space-y-1.5">
            <Label htmlFor="s-terms">Payment Terms Notes</Label>
            <Input
              id="s-terms"
              value={form.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)}
              placeholder="e.g. Net 30, Cash on delivery"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="s-notes">Notes</Label>
            <Textarea
              id="s-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Internal notes..."
              rows={3}
            />
          </div>

          <CustomFields moduleKey="suppliers" value={customData} onChange={setCustomData} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Order Builder Dialog
───────────────────────────────────────── */
function OrderBuilderDialog({
  supplier,
  open,
  onClose,
}: {
  supplier: Supplier;
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  // Fetch products for this supplier
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  // Fetch inventory to get current stock
  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    queryFn: () => fetch("/api/inventory").then((r) => r.json()),
  });

  const activeProducts = useMemo(
    () => allProducts.filter((p) => p.active !== false),
    [allProducts]
  );

  // Supplier's products
  const supplierProducts = useMemo(
    () => activeProducts.filter((p) => p.supplierId === supplier.id),
    [activeProducts, supplier.id]
  );

  // Other products (not linked to this supplier)
  const otherProducts = useMemo(
    () => activeProducts.filter((p) => p.supplierId !== supplier.id),
    [activeProducts, supplier.id]
  );

  const searchQ = productSearch.toLowerCase();
  const filteredLinked = supplierProducts.filter(
    (p) => !searchQ || p.name.toLowerCase().includes(searchQ) || (p.sku ?? "").toLowerCase().includes(searchQ)
  );
  const filteredOther = otherProducts.filter(
    (p) => !searchQ || p.name.toLowerCase().includes(searchQ) || (p.sku ?? "").toLowerCase().includes(searchQ)
  );

  // Total stock per product across all stores
  const stockMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const inv of inventory) {
      if (!inv.productId) continue;
      map[inv.productId] = (map[inv.productId] ?? 0) + toNum(inv.qty);
    }
    return map;
  }, [inventory]);

  function toggleProduct(product: Product) {
    setOrderItems((prev) => {
      const exists = prev.find((i) => i.productId === product.id);
      if (exists) return prev.filter((i) => i.productId !== product.id);
      const currentStock = stockMap[product.id] ?? 0;
      const minStock = toNum(product.minStockQty);
      const suggestedQty = Math.max(1, minStock - currentStock + minStock);
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit ?? "PCS",
          currentStock,
          minStock,
          qty: suggestedQty,
        },
      ];
    });
  }

  function updateQty(idx: number, qty: number) {
    setOrderItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, qty } : item))
    );
  }

  function removeItem(idx: number) {
    setOrderItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // Custom (free-text) item
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("PCS");
  const [customQty, setCustomQty] = useState(1);

  function addCustomItem() {
    const name = customName.trim();
    if (!name) return;
    setOrderItems((prev) => [
      ...prev,
      { productId: null, name, unit: customUnit, currentStock: 0, minStock: 0, qty: customQty },
    ]);
    setCustomName("");
    setCustomUnit("PCS");
    setCustomQty(1);
  }

  function isLowStock(product: Product): boolean {
    const stock = stockMap[product.id] ?? 0;
    const min = toNum(product.minStockQty);
    return min > 0 && stock <= min;
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Build WhatsApp message preview
  const poRef = `PO-${Date.now().toString().slice(-6)}`;
  const messagePreview = useMemo(() => {
    const lines = orderItems.map(
      (item, i) => `${i + 1}. ${item.name} — ${item.qty} ${item.unit}`
    );
    return (
      `Order from MTC — ${today}\n` +
      `${COMPANY_NAME}\n\n` +
      `Please supply:\n` +
      lines.join("\n") +
      `\n\nDeliver to: ${DELIVER_ADDRESS}\n` +
      `Contact: ${COMPANY_CONTACT}\n` +
      `Reference: ${poRef}\n\n` +
      `Thank you`
    );
  }, [orderItems, today, poRef]);

  const saveMut = useMutation({
    mutationFn: async () => {
      // Auto-link any unlinked products to this supplier
      const unlinkIds = orderItems
        .map((i) => i.productId)
        .filter((pid): pid is number => {
          if (!pid) return false;
          const p = allProducts.find((x) => x.id === pid);
          return !!p && p.supplierId !== supplier.id;
        });
      await Promise.all(
        unlinkIds.map((pid) =>
          fetch(`/api/products/${pid}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ supplierId: supplier.id }),
          })
        )
      );
      const res = await fetch("/api/supplier-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.id,
          status: "sent",
          items: orderItems.map((i) => ({
            productId: i.productId || undefined,
            name: i.name,
            qty: i.qty,
            unit: i.unit,
          })),
          notes: messagePreview,
          sentAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Order saved" });
      handleClose();
    },
    onError: () => {
      toast({ title: "Failed to save order", variant: "destructive" });
    },
  });

  function handleSendWhatsApp() {
    const waNumber = cleanWa(supplier.whatsapp);
    if (!waNumber) {
      toast({ title: "No WhatsApp number for this supplier", variant: "destructive" });
      return;
    }
    const encoded = encodeURIComponent(messagePreview);
    window.open(`https://wa.me/${waNumber}?text=${encoded}`, "_blank");
    saveMut.mutate();
  }

  function handleClose() {
    setStep(1);
    setOrderItems([]);
    setProductSearch("");
    setCustomName("");
    setCustomUnit("PCS");
    setCustomQty(1);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            New Order — {supplier.company ?? supplier.name}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 py-2">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {s}
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  step >= s ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {s === 1 ? "Select Products" : s === 2 ? "Set Quantities" : "Preview & Send"}
              </span>
              {s < 3 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        <Separator />

        {/* Step 1: Select products */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select products to include in this order. Low-stock items are highlighted.
            </p>

            {/* Search products */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search products by name or SKU…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {productSearch && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setProductSearch("")}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {/* Linked products section */}
              {filteredLinked.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Linked Products ({filteredLinked.length})
                  </p>
                  {filteredLinked.map((product) => {
                    const selected = orderItems.some((i) => i.productId === product.id);
                    const lowStock = isLowStock(product);
                    const stock = stockMap[product.id] ?? 0;
                    return (
                      <div
                        key={product.id}
                        onClick={() => toggleProduct(product)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : lowStock
                            ? "border-orange-200 bg-orange-50 hover:border-orange-300"
                            : "border-border bg-white hover:border-primary/30"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0",
                            selected ? "border-primary bg-primary" : "border-border"
                          )}
                        >
                          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{product.name}</span>
                            {lowStock && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Low Stock
                              </span>
                            )}
                          </div>
                          {product.sku && <p className="text-xs text-muted-foreground">{product.sku}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">Stock</p>
                          <p className={cn("text-sm font-mono font-bold", lowStock ? "text-orange-600" : "text-foreground")}>
                            {stock} {product.unit ?? "PCS"}
                          </p>
                          {toNum(product.minStockQty) > 0 && (
                            <p className="text-[10px] text-muted-foreground">min {product.minStockQty}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Other products section */}
              {filteredOther.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-3">
                    All Other Products ({filteredOther.length})
                  </p>
                  {filteredOther.map((product) => {
                    const selected = orderItems.some((i) => i.productId === product.id);
                    const lowStock = isLowStock(product);
                    const stock = stockMap[product.id] ?? 0;
                    return (
                      <div
                        key={product.id}
                        onClick={() => toggleProduct(product)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : lowStock
                            ? "border-orange-200 bg-orange-50 hover:border-orange-300"
                            : "border-border bg-white hover:border-primary/30"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0",
                            selected ? "border-primary bg-primary" : "border-border"
                          )}
                        >
                          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{product.name}</span>
                            {lowStock && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Low Stock
                              </span>
                            )}
                          </div>
                          {product.sku && <p className="text-xs text-muted-foreground">{product.sku}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">Stock</p>
                          <p className={cn("text-sm font-mono font-bold", lowStock ? "text-orange-600" : "text-foreground")}>
                            {stock} {product.unit ?? "PCS"}
                          </p>
                          {toNum(product.minStockQty) > 0 && (
                            <p className="text-[10px] text-muted-foreground">min {product.minStockQty}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* No results from product search */}
              {filteredLinked.length === 0 && filteredOther.length === 0 && activeProducts.length > 0 && searchQ && (
                <div className="py-4 text-center">
                  <p className="text-sm text-muted-foreground">No products match "{productSearch}"</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Add custom (free-text) item */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Add Custom Item
              </p>
              <p className="text-xs text-muted-foreground">
                Type any item description — for inquiries or products not yet in inventory.
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. 1.5mm Cable 100m Roll"
                    className="h-8 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomItem(); } }}
                  />
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={customQty}
                    onChange={(e) => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 text-sm text-center"
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="PCS">PCS</option>
                    <option value="ROLL">ROLL</option>
                    <option value="BAG">BAG</option>
                    <option value="SET">SET</option>
                    <option value="TIN">TIN</option>
                    <option value="SHEET">SHEET</option>
                    <option value="PAIR">PAIR</option>
                    <option value="BOX">BOX</option>
                    <option value="KG">KG</option>
                    <option value="MTR">MTR</option>
                    <option value="LTR">LTR</option>
                  </select>
                </div>
                <Button
                  size="sm"
                  onClick={addCustomItem}
                  disabled={!customName.trim()}
                  className="h-8 gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
            </div>

            {/* Show custom items already added */}
            {orderItems.filter((i) => !i.productId).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Custom Items ({orderItems.filter((i) => !i.productId).length})
                </p>
                {orderItems.map((item, idx) =>
                  item.productId ? null : (
                    <div key={`custom-${idx}`} className="flex items-center gap-3 p-2.5 rounded-lg border border-blue-200 bg-blue-50">
                      <Edit2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{item.qty} {item.unit}</span>
                      </div>
                      <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={orderItems.length === 0}
              >
                Next: Set Quantities ({orderItems.length})
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Set quantities */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Set the quantity to order for each item.
            </p>
            <div className="space-y-2">
              {orderItems.map((item, idx) => (
                <div
                  key={item.productId ? `p-${item.productId}` : `c-${idx}`}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border",
                    item.productId ? "border-border bg-white" : "border-blue-200 bg-blue-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      {!item.productId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">Custom</span>
                      )}
                    </div>
                    {item.productId ? (
                      <p className="text-xs text-muted-foreground">
                        Stock: {item.currentStock} | Min: {item.minStock} {item.unit}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{item.unit}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => updateQty(idx, Math.max(1, item.qty - 1))}
                    >
                      —
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) =>
                        updateQty(idx, Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-16 text-center h-7 px-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => updateQty(idx, item.qty + 1)}
                    >
                      +
                    </Button>
                    <span className="text-xs text-muted-foreground w-8">{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>Next: Preview</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Preview & Send */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {messagePreview}
              </pre>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
              <MessageSquare className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Send via WhatsApp</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Opens WhatsApp with this message pre-filled for{" "}
                  {supplier.company ?? supplier.name} ({supplier.whatsapp})
                </p>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={handleSendWhatsApp}
                disabled={saveMut.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                {saveMut.isPending ? "Saving…" : "Send via WhatsApp"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Supplier Detail Panel
───────────────────────────────────────── */
function SupplierDetail({
  supplier,
  products,
  orders,
  onEdit,
  onNewOrder,
}: {
  supplier: Supplier;
  products: Product[];
  orders: SupplierOrder[];
  onEdit: () => void;
  onNewOrder: () => void;
}) {
  const supplierProducts = products.filter(
    (p) => p.supplierId === supplier.id && p.active !== false
  );
  const supplierOrders = orders
    .filter((o) => o.supplierId === supplier.id)
    .slice(0, 5);

  return (
    <div className="border-t border-border/40 bg-secondary/10 px-4 py-4 space-y-4">
      {/* Contact row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {supplier.whatsapp && (
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-green-600 shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">WhatsApp</p>
              <p className="text-sm font-medium">{supplier.whatsapp}</p>
            </div>
          </div>
        )}
        {supplier.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Phone</p>
              <p className="text-sm font-medium">{supplier.phone}</p>
            </div>
          </div>
        )}
        {supplier.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Email</p>
              <p className="text-sm font-medium">{supplier.email}</p>
            </div>
          </div>
        )}
        {supplier.address && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Address</p>
              <p className="text-sm font-medium">{supplier.address}</p>
            </div>
          </div>
        )}
        {supplier.paymentTerms && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Payment Terms</p>
              <p className="text-sm font-medium">{supplier.paymentTerms}</p>
            </div>
          </div>
        )}
      </div>

      {supplier.notes && (
        <p className="text-xs text-muted-foreground bg-white rounded p-2 border border-border/40">
          {supplier.notes}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
          <Edit2 className="w-3.5 h-3.5" /> Edit
        </Button>
        <Button size="sm" onClick={onNewOrder} className="gap-1.5">
          <ShoppingCart className="w-3.5 h-3.5" /> New Order
        </Button>
      </div>

      {/* Products supplied */}
      {supplierProducts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Products ({supplierProducts.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {supplierProducts.slice(0, 12).map((p) => (
              <span
                key={p.id}
                className="text-xs px-2 py-0.5 bg-white border border-border/50 rounded-full text-foreground"
              >
                {p.name}
              </span>
            ))}
            {supplierProducts.length > 12 && (
              <span className="text-xs px-2 py-0.5 bg-white border border-border/50 rounded-full text-muted-foreground">
                +{supplierProducts.length - 12} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Recent orders */}
      {supplierOrders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Recent Orders
          </p>
          <div className="space-y-1.5">
            {supplierOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-3 p-2 bg-white rounded border border-border/40 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {order.poNumber ?? `#${order.id}`}
                </span>
                <Badge
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0 rounded-full border-0",
                    statusColor(order.status)
                  )}
                >
                  {order.status ?? "sent"}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {fmtDate(order.sentAt)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {Array.isArray(order.items) ? order.items.length : 0} items
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Supplier Row
───────────────────────────────────────── */
function SupplierRow({
  supplier,
  products,
  orders,
  expanded,
  onToggle,
  onEdit,
  onNewOrder,
  onLedger,
}: {
  supplier: Supplier;
  products: Product[];
  orders: SupplierOrder[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onNewOrder: () => void;
  onLedger: () => void;
}) {
  const productCount = products.filter(
    (p) => p.supplierId === supplier.id && p.active !== false
  ).length;

  const lastOrder = orders
    .filter((o) => o.supplierId === supplier.id)
    .sort(
      (a, b) =>
        new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime()
    )[0];

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={onToggle}
      >
        {/* Name / Company */}
        <TableCell>
          <div>
            <p className="font-semibold text-sm text-foreground">{supplier.name}</p>
            {supplier.company && (
              <p className="text-xs text-muted-foreground">{supplier.company}</p>
            )}
          </div>
        </TableCell>

        {/* WhatsApp */}
        <TableCell>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-green-600 shrink-0" />
            <span className="text-sm">{supplier.whatsapp ?? "—"}</span>
          </div>
        </TableCell>

        {/* Products count */}
        <TableCell>
          <span className="text-sm">
            {productCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-primary" />
                {productCount}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        </TableCell>

        {/* Last Order */}
        <TableCell>
          <span className="text-sm text-muted-foreground">
            {lastOrder ? fmtDate(lastOrder.sentAt) : "—"}
          </span>
        </TableCell>

        {/* Actions */}
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="h-7 px-2 gap-1 text-xs"
            >
              <Edit2 className="w-3 h-3" /> Edit
            </Button>
            <Button
              size="sm"
              onClick={onNewOrder}
              className="h-7 px-2 gap-1 text-xs"
            >
              <ShoppingCart className="w-3 h-3" /> New Order
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onLedger}
              className="h-7 px-2 gap-1 text-xs"
            >
              <Wallet className="w-3 h-3" /> Ledger
            </Button>
          </div>
        </TableCell>

        {/* Expand toggle */}
        <TableCell className="w-8">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="p-0">
            <SupplierDetail
              supplier={supplier}
              products={products}
              orders={orders}
              onEdit={onEdit}
              onNewOrder={onNewOrder}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* ─────────────────────────────────────────
   Orders Tab — Expanded Items Row
───────────────────────────────────────── */
function OrderItemsRow({ order }: { order: SupplierOrder }) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) return null;
  return (
    <TableRow>
      <TableCell colSpan={8} className="p-0">
        <div className="bg-secondary/10 border-t border-border/40 px-6 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Order Items
          </p>
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-xs text-muted-foreground text-right">{i + 1}.</span>
                <span className="flex-1 font-medium text-foreground">{item.name || (item as any).description}</span>
                <span className="font-mono text-foreground">{item.qty}</span>
                <span className="text-muted-foreground w-10">{item.unit}</span>
                {(item as any).receivedQty != null && (
                  <span className="text-xs text-green-600">rcvd: {(item as any).receivedQty}</span>
                )}
                {(item as any).cost != null && (
                  <span className="font-mono text-xs text-muted-foreground">@ {Number((item as any).cost).toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
          {order.supplierInvoiceNumber && (
            <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold">Supplier Invoice:</span>
              <span>#{order.supplierInvoiceNumber}</span>
              {order.supplierInvoiceAmount && <span className="font-mono">QAR {Number(order.supplierInvoiceAmount).toFixed(2)}</span>}
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ─────────────────────────────────────────
   Mark Received Mutation (inline)
───────────────────────────────────────── */
function useMarkReceived() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ orderId, storeId }: { orderId: number; storeId: number }) =>
      fetch(`/api/supplier-orders/${orderId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      toast({ title: "PO received — stock added to the chosen location" });
    },
    onError: (e: any) => {
      toast({ title: "Failed to receive PO", description: String(e?.message || ""), variant: "destructive" });
    },
  });
}

// GRN receive flow — store picker + invoice entry + AI scan + item-level receive
function ReceiveCell({ order, markReceived }: { order: any; markReceived: any }) {
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = (Array.isArray(stores) ? stores : []).filter((s: any) => s.active);
  const [storeId, setStoreId] = useState<number | "">("");
  const [grnOpen, setGrnOpen] = useState(false);
  const [invNumber, setInvNumber] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invUrl, setInvUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Items to receive — initialized from PO items when dialog opens
  type ReceiveItem = {
    name: string; qty: number; unit: string; costPrice: string;
    productId: number | null; isCustom: boolean; receive: boolean;
    receivedQty?: number;
  };
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([]);

  // Manual add item form
  const [manualName, setManualName] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const [manualUnit, setManualUnit] = useState("PCS");
  const [manualCost, setManualCost] = useState("");

  useEffect(() => { if (storeId === "" && list[0]) setStoreId(list[0].id); }, [list.length]); // eslint-disable-line

  function openGrn() {
    const items = Array.isArray(order.items) ? (order.items as any[]) : [];
    setReceiveItems(items.map((it: any) => ({
      name: it.name || it.description || "",
      qty: Number(it.qty || 0),
      unit: it.unit || "PCS",
      costPrice: String(it.cost || it.price || ""),
      productId: it.productId || null,
      isCustom: !it.productId,
      receive: true,
      receivedQty: Number(it.receivedQty || 0),
    })));
    setGrnOpen(true);
  }

  function updateReceiveItem(idx: number, patch: Partial<ReceiveItem>) {
    setReceiveItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function addManualItem() {
    if (!manualName.trim()) return;
    setReceiveItems((prev) => [...prev, {
      name: manualName.trim(), qty: manualQty, unit: manualUnit,
      costPrice: manualCost, productId: null, isCustom: true, receive: true,
    }]);
    setManualName(""); setManualQty(1); setManualUnit("PCS"); setManualCost("");
  }

  function removeReceiveItem(idx: number) {
    setReceiveItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const handleInvoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setInvUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAiScan = async () => {
    if (!fileRef.current?.files?.[0]) {
      toast({ title: "Upload invoice image first", variant: "destructive" });
      return;
    }
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", fileRef.current.files[0]);
      const res = await fetch("/api/ai/scan-supplier-invoice", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Scan failed");
      const data = await res.json();
      if (data.invoiceNumber) setInvNumber(data.invoiceNumber);
      if (data.totalAmount) setInvAmount(String(data.totalAmount));

      // Merge scanned items into receive items: match by name similarity, else add new
      if (Array.isArray(data.items) && data.items.length > 0) {
        setReceiveItems((prev) => {
          const updated = [...prev];
          for (const scanned of data.items) {
            const sName = (scanned.description || "").toLowerCase();
            const match = updated.findIndex((it) => it.name.toLowerCase().includes(sName) || sName.includes(it.name.toLowerCase()));
            if (match >= 0) {
              updated[match] = { ...updated[match], costPrice: String(scanned.unitPrice || updated[match].costPrice) };
            } else {
              updated.push({
                name: scanned.description || "", qty: Number(scanned.qty || 1),
                unit: scanned.unit || "PCS", costPrice: String(scanned.unitPrice || ""),
                productId: null, isCustom: true, receive: true,
              });
            }
          }
          return updated;
        });
        toast({ title: "Invoice scanned", description: `${data.items.length} items merged into receive list` });
      }
    } catch (err: any) {
      toast({ title: "AI scan failed", description: err.message, variant: "destructive" });
    } finally { setScanning(false); }
  };

  const handleReceive = async () => {
    if (!storeId) return;
    setReceiving(true);
    try {
      // Save invoice details on PO
      if (invNumber || invUrl || invAmount) {
        await fetch(`/api/supplier-orders/${order.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierInvoiceNumber: invNumber || null,
            supplierInvoiceUrl: invUrl || null,
            supplierInvoiceAmount: invAmount || null,
          }),
        });
      }

      const toReceive = receiveItems.filter((it) => it.receive);

      // Create products for custom items that have no productId
      for (const item of toReceive) {
        if (!item.productId && item.isCustom) {
          const res = await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.name,
              unit: item.unit,
              costPrice: item.costPrice ? Number(item.costPrice) : 0,
              supplierId: order.supplierId,
              active: true,
            }),
          });
          if (res.ok) {
            const created = await res.json();
            item.productId = created.id;
          }
        }
      }

      // Update PO items with cost prices and new productIds
      const updatedItems = receiveItems.map((it) => ({
        productId: it.productId || undefined,
        name: it.name,
        qty: it.qty,
        unit: it.unit,
        cost: it.costPrice ? Number(it.costPrice) : undefined,
        receivedQty: it.receivedQty || 0,
      }));
      await fetch(`/api/supplier-orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updatedItems }),
      });

      // Build receipts for items being received
      const receipts = toReceive.map((it, idx) => ({
        index: idx,
        productId: it.productId || undefined,
        qty: Math.max(0, it.qty - (it.receivedQty || 0)),
      })).filter((r) => r.qty > 0);

      const res = await fetch(`/api/supplier-orders/${order.id}/receive-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: Number(storeId), receipts }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed");

      qc.invalidateQueries({ queryKey: ["/api/supplier-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "PO received — stock added to inventory" });
      setGrnOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to receive", description: String(err?.message || ""), variant: "destructive" });
    } finally { setReceiving(false); }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <select
          value={storeId}
          onChange={(e) => setStoreId(Number(e.target.value))}
          className="h-7 text-xs border border-border rounded px-1 bg-white dark:bg-gray-800 max-w-[130px]"
          title="Destination location"
        >
          {list.map((s: any) => <option key={s.id} value={s.id}>{s.nameEn}</option>)}
        </select>
        <Button
          size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs"
          disabled={receiving || !storeId}
          onClick={openGrn}
        >
          <CheckCircle2 className="w-3 h-3" /> Receive
        </Button>
      </div>

      {/* GRN Dialog */}
      <Dialog open={grnOpen} onOpenChange={setGrnOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[#d4a017]" /> Goods Receipt — {order.poNumber || `PO-${order.id}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Receiving to <strong>{list.find((s: any) => s.id === storeId)?.nameEn || "store"}</strong>.
              Custom items will be created as new products in inventory.
            </p>

            {/* Items to receive */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Items to Receive ({receiveItems.length})
              </h4>
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {receiveItems.map((item, idx) => {
                  const remaining = item.qty - (item.receivedQty || 0);
                  return (
                    <div key={idx} className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border",
                      item.isCustom ? "border-blue-200 bg-blue-50/50" : "border-border bg-white",
                      !item.receive && "opacity-50"
                    )}>
                      <input type="checkbox" checked={item.receive}
                        onChange={(e) => updateReceiveItem(idx, { receive: e.target.checked })}
                        className="w-4 h-4 rounded shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{item.name}</span>
                          {item.isCustom && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold shrink-0">
                              New Product
                            </span>
                          )}
                          {remaining < item.qty && remaining > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-semibold shrink-0">
                              Partial
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {remaining > 0 ? `${remaining} ${item.unit} to receive` : "Fully received"}
                          {(item.receivedQty || 0) > 0 && ` (${item.receivedQty} already)`}
                        </p>
                      </div>
                      <div className="w-24 shrink-0">
                        <Input
                          type="number"
                          value={item.costPrice}
                          onChange={(e) => updateReceiveItem(idx, { costPrice: e.target.value })}
                          placeholder="Cost"
                          className="h-7 text-xs font-mono text-right"
                          title="Cost price per unit"
                        />
                      </div>
                      {item.isCustom && (
                        <button onClick={() => removeReceiveItem(idx)} className="text-muted-foreground hover:text-red-500 shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Add manual item */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Add Item Manually
              </h4>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={manualName} onChange={(e) => setManualName(e.target.value)}
                    placeholder="Product name from invoice" className="h-8 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManualItem(); } }} />
                </div>
                <div className="w-16 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" min={1} value={manualQty}
                    onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 text-sm text-center" />
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <select value={manualUnit} onChange={(e) => setManualUnit(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                    <option value="PCS">PCS</option><option value="ROLL">ROLL</option>
                    <option value="BAG">BAG</option><option value="SET">SET</option>
                    <option value="TIN">TIN</option><option value="SHEET">SHEET</option>
                    <option value="BOX">BOX</option><option value="KG">KG</option>
                    <option value="MTR">MTR</option><option value="LTR">LTR</option>
                  </select>
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs">Cost</Label>
                  <Input type="number" value={manualCost} onChange={(e) => setManualCost(e.target.value)}
                    placeholder="0.00" className="h-8 text-xs font-mono" />
                </div>
                <Button size="sm" onClick={addManualItem} disabled={!manualName.trim()} className="h-8 gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
            </div>

            <Separator />

            {/* Invoice details */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Supplier Invoice
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Invoice #</Label>
                  <Input value={invNumber} onChange={(e) => setInvNumber(e.target.value)}
                    placeholder="INV-12345" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total Amount</Label>
                  <Input type="number" value={invAmount} onChange={(e) => setInvAmount(e.target.value)}
                    placeholder="0.00" className="h-8 text-sm font-mono" />
                </div>
              </div>
            </div>

            <Separator />

            {/* AI scan */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" /> Scan Invoice (AI)
              </h4>
              <p className="text-xs text-muted-foreground">
                Upload supplier invoice — AI extracts items, quantities, and prices into the receive list above.
              </p>
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleInvoiceUpload} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  {invUrl ? "Replace Photo" : "Upload Invoice"}
                </Button>
                <Button variant="outline" size="sm" className="flex-1" disabled={!invUrl || scanning} onClick={handleAiScan}>
                  {scanning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5 mr-1.5" />}
                  {scanning ? "Scanning…" : "AI Scan"}
                </Button>
              </div>
              {invUrl && <img src={invUrl} className="w-full h-32 object-cover rounded border" alt="Invoice" />}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGrnOpen(false)}>Cancel</Button>
            <Button className="bg-[#1e2a3a] text-white"
              disabled={receiving || !storeId || !receiveItems.some((it) => it.receive)}
              onClick={handleReceive}>
              {receiving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
              {receiving ? "Receiving…" : "Confirm Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────────────────────────
   Supplier Return Dialog
───────────────────────────────────────── */
function SupplierReturnDialog({
  order, supplier, open, onClose,
}: {
  order: SupplierOrder; supplier?: Supplier; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const items = Array.isArray(order.items) ? (order.items as any[]) : [];
  const [returnType, setReturnType] = useState<"initiated" | "rejected_delivery">("initiated");
  const [refundMode, setRefundMode] = useState<"credit_note" | "cash_refund">(
    supplier?.paymentMode === "cash" ? "cash_refund" : "credit_note"
  );
  const [refundMethod, setRefundMethod] = useState<"cash" | "bank_transfer">("cash");
  const [returnItems, setReturnItems] = useState(
    items.map((it: any) => ({ ...it, returnQty: 0, amount: 0, selected: false }))
  );
  const [notes, setNotes] = useState("");
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then(r => r.json()),
  });
  const storeList = (Array.isArray(stores) ? stores : []).filter((s: any) => s.active);
  const [storeId, setStoreId] = useState<number | "">("");
  useEffect(() => { if (storeId === "" && storeList[0]) setStoreId(storeList[0].id); }, [storeList.length]); // eslint-disable-line

  const total = returnItems.filter(i => i.selected).reduce((s, i) =>
    s + (Number(i.returnQty) * Number(i.cost || i.price || 0)), 0);

  const mut = useMutation({
    mutationFn: async () => {
      const selected = returnItems.filter(i => i.selected && Number(i.returnQty) > 0);
      if (!selected.length) throw new Error("Select items to return");
      const res = await fetch("/api/supplier-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId: order.id,
          supplierId: order.supplierId,
          storeId: storeId || undefined,
          returnType,
          refundMode,
          refundMethod: refundMode === "cash_refund" ? refundMethod : undefined,
          items: selected.map(i => ({
            productId: i.productId || null,
            name: i.name || i.description,
            qty: Number(i.returnQty),
            unit: i.unit || "PCS",
            amount: Number(i.returnQty) * Number(i.cost || i.price || 0),
          })),
          notes,
          refundAmount: total,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/supplier-returns"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Supplier return created" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-500" /> Return to {supplier?.name || "Supplier"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Return Type</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={returnType} onChange={e => setReturnType(e.target.value as any)}>
                <option value="initiated">Initiated (goods leave our store)</option>
                <option value="rejected_delivery">Rejected on Delivery</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Store</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={storeId} onChange={e => setStoreId(Number(e.target.value))}>
                {storeList.map((s: any) => <option key={s.id} value={s.id}>{s.nameEn}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Refund Mode</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={refundMode} onChange={e => setRefundMode(e.target.value as any)}>
                <option value="credit_note">Credit Note (deduct from balance)</option>
                <option value="cash_refund">Cash Refund (supplier pays back)</option>
              </select>
            </div>
            {refundMode === "cash_refund" && (
              <div className="space-y-1">
                <Label className="text-xs">Refund Method</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={refundMethod} onChange={e => setRefundMethod(e.target.value as any)}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Select Items to Return</Label>
            {returnItems.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-muted/20">
                <input type="checkbox" checked={it.selected}
                  onChange={e => {
                    const arr = [...returnItems];
                    arr[idx] = { ...arr[idx], selected: e.target.checked };
                    setReturnItems(arr);
                  }}
                  className="w-4 h-4 rounded" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{it.name || it.description}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ordered: {it.qty} {it.unit} · Received: {it.receivedQty || 0}
                    · Cost: {Number(it.cost || it.price || 0).toFixed(2)}
                  </p>
                </div>
                <Input type="number" min={0} max={Number(it.receivedQty || it.qty)}
                  value={it.returnQty || ""} disabled={!it.selected}
                  onChange={e => {
                    const arr = [...returnItems];
                    arr[idx] = { ...arr[idx], returnQty: Number(e.target.value) || 0 };
                    setReturnItems(arr);
                  }}
                  className="w-20 h-8 text-sm text-center" placeholder="Qty" />
              </div>
            ))}
          </div>

          <div className="flex justify-between items-baseline">
            <span className="text-sm font-medium">Return Total</span>
            <span className="font-mono font-bold">QAR {total.toFixed(2)}</span>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Reason for return…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !returnItems.some(i => i.selected && Number(i.returnQty) > 0)}>
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
            Submit Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Main Page
───────────────────────────────────────── */
export default function Suppliers() {
  const [, nav] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [orderSupplier, setOrderSupplier] = useState<Supplier | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [returnOrder, setReturnOrder] = useState<SupplierOrder | null>(null);

  const markReceived = useMarkReceived();

  /* Queries */
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => fetch("/api/suppliers").then((r) => r.json()),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery<SupplierOrder[]>({
    queryKey: ["/api/supplier-orders"],
    queryFn: () => fetch("/api/supplier-orders").then((r) => r.json()),
  });

  const activeSuppliers = suppliers.filter((s) => s.active !== false);

  const filtered = activeSuppliers.filter((s) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.company ?? "").toLowerCase().includes(q) ||
      (s.whatsapp ?? "").includes(q) ||
      (s.phone ?? "").includes(q)
    );
  });

  function toggleRow(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function toggleOrderRow(id: number) {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  }

  // Get supplier name for orders tab
  const supplierMap = useMemo(() => {
    const map: Record<number, Supplier> = {};
    for (const s of suppliers) map[s.id] = s;
    return map;
  }, [suppliers]);

  const sortedOrders = [...allOrders].sort(
    (a, b) =>
      new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime()
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-teal-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {suppliersLoading
              ? "Loading..."
              : `${activeSuppliers.length} supplier${activeSuppliers.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="btn-primary-action shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers">
            Suppliers ({activeSuppliers.length})
          </TabsTrigger>
          <TabsTrigger value="orders">
            Orders ({allOrders.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Suppliers ── */}
        <TabsContent value="suppliers" className="space-y-4 mt-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, company, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Table */}
          <div className="section-card !p-0 overflow-hidden">
            {suppliersLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-10 w-40" />
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-10 w-16" />
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">
                  {search ? "No suppliers match your search" : "No suppliers yet"}
                </p>
                {!search && (
                  <Button
                    className="mt-4"
                    onClick={() => setShowAddDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Supplier
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead>Supplier</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Last Order</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((supplier) => (
                    <SupplierRow
                      key={supplier.id}
                      supplier={supplier}
                      products={products}
                      orders={allOrders}
                      expanded={expandedId === supplier.id}
                      onToggle={() => toggleRow(supplier.id)}
                      onEdit={() => setEditSupplier(supplier)}
                      onNewOrder={() => setOrderSupplier(supplier)}
                      onLedger={() => nav(`/suppliers/${supplier.id}/ledger`)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Showing {filtered.length} of {activeSuppliers.length} suppliers
            </p>
          )}
        </TabsContent>

        {/* ── Tab 2: Orders ── */}
        <TabsContent value="orders" className="mt-4">
          <div className="section-card !p-0 overflow-hidden">
            {ordersLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-12" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-28" />
                  </div>
                ))}
              </div>
            ) : sortedOrders.length === 0 ? (
              <div className="py-16 text-center">
                <ShoppingCart className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No supplier orders yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Go to Suppliers tab and click "New Order" on a supplier
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead>PO #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOrders.map((order) => {
                    const sup = supplierMap[order.supplierId];
                    const itemCount = Array.isArray(order.items)
                      ? order.items.length
                      : 0;
                    const isExpanded = expandedOrderId === order.id;
                    const canMarkReceived =
                      order.status !== "received" && order.status !== "cancelled";

                    return (
                      <Fragment key={order.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-secondary/20 transition-colors"
                          onClick={() => toggleOrderRow(order.id)}
                        >
                          <TableCell className="font-mono text-sm">
                            {order.poNumber ?? `#${order.id}`}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">
                                {sup?.name ?? "—"}
                              </p>
                              {sup?.company && (
                                <p className="text-xs text-muted-foreground">
                                  {sup.company}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {fmtDate(order.sentAt)}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{itemCount}</span>
                          </TableCell>
                          <TableCell>
                            {order.paymentDueDate ? (
                              <div className="text-xs">
                                <span className={new Date(order.paymentDueDate) < new Date() && order.status === "received" ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                                  {fmtDate(order.paymentDueDate)}
                                </span>
                                {new Date(order.paymentDueDate) < new Date() && order.status === "received" && (
                                  <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">OVERDUE</Badge>
                                )}
                                {order.paymentTermsDays ? (
                                  <p className="text-[10px] text-muted-foreground">{order.paymentTermsDays}d terms</p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "text-[10px] font-semibold px-1.5 py-0 rounded-full border-0",
                                statusColor(order.status)
                              )}
                            >
                              {order.status ?? "sent"}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap items-center gap-1">
                              {canMarkReceived && (
                                <ReceiveCell order={order} markReceived={markReceived} />
                              )}
                              {order.status === "received" && (
                                <>
                                  <span className="text-xs text-green-600 flex items-center gap-1 mr-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {fmtDate(order.receivedAt)}
                                  </span>
                                  <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs"
                                    onClick={() => nav(`/suppliers/${order.supplierId}/ledger`)}>
                                    <DollarSign className="w-3 h-3" /> Pay
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs text-amber-600 hover:text-amber-700"
                                    onClick={() => setReturnOrder(order)}>
                                    <RotateCcw className="w-3 h-3" /> Return
                                  </Button>
                                </>
                              )}
                              {sup && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                                  onClick={() => nav(`/suppliers/${order.supplierId}/ledger`)}>
                                  <Wallet className="w-3 h-3" /> Ledger
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="w-8">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <OrderItemsRow order={order} />
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}
      {/* Add supplier */}
      <SupplierDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
      />

      {/* Edit supplier */}
      {editSupplier && (
        <SupplierDialog
          open={Boolean(editSupplier)}
          onClose={() => setEditSupplier(null)}
          existing={editSupplier}
        />
      )}

      {/* Order builder */}
      {orderSupplier && (
        <OrderBuilderDialog
          supplier={orderSupplier}
          open={Boolean(orderSupplier)}
          onClose={() => setOrderSupplier(null)}
        />
      )}

      {/* Supplier Return */}
      {returnOrder && (
        <SupplierReturnDialog
          order={returnOrder}
          supplier={supplierMap[returnOrder.supplierId]}
          open={Boolean(returnOrder)}
          onClose={() => setReturnOrder(null)}
        />
      )}
    </div>
  );
}
