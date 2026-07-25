import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  ArrowRightLeft,
  Minus,
  MessageSquare,
  FileText,
  ArrowLeftRight,
  Pencil,
  Check,
  Warehouse,
  Store,
  ClipboardList,
} from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import CustomFields, { useFieldDefs, validateCustomFields } from "@/components/CustomFields";
import { validateSku, validatePositivePrice, validateNonNegative } from "@/lib/validation";
import { Link, useSearch } from "wouter";
import TransferModal from "@/components/TransferModal";
import TransferVoucher from "@/components/TransferVoucher";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
type InventoryRow = {
  id: number;
  productId: number;
  storeId: number;
  qty: number | string;
  updatedAt: string;
  // joined fields from the API report endpoint
  sku?: string;
  name?: string;
  category?: string;
  unit?: string;
  salePrice?: number | string;
  costPrice?: number | string;
  minStockQty?: number | string;
  supplierId?: number | null;
  storeName?: string;
  storeType?: string;
  productActive?: boolean;
};

type Product = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  salePrice: number | string | null;
  wholesalePrice?: number | string | null;
  costPrice: number | string | null;
  minStockQty: number | string | null;
  supplierId: number | null;
  active: boolean | null;
  locationStoreId: number | null;
  locationArea: string | null;
  locationRack: string | null;
  locationShelf: string | null;
  imageUrl: string | null;
};

/** Full physical path: Store → Area → Rack → Shelf (skips empty levels). */
export function locationPath(p: Partial<Product>, stores: { id: number; nameEn: string }[]): string {
  const parts = [
    p.locationStoreId ? stores.find((s) => s.id === p.locationStoreId)?.nameEn : null,
    p.locationArea, p.locationRack, p.locationShelf,
  ].filter(Boolean);
  return parts.join(" → ");
}

type Supplier = {
  id: number;
  name: string;
  company: string | null;
  whatsapp: string | null;
  phone: string | null;
};

type StoreItem = {
  id: number;
  nameEn: string;
  type: "store" | "warehouse";
  active: boolean | null;
};

type AdjustmentLog = {
  id: number;
  productId: number;
  storeId: number;
  qtyChange: number | string;
  type: "add" | "remove" | "transfer" | "sale" | "return";
  reason: string | null;
  referenceId: number | null;
  userId: number | null;
  createdAt: string;
  productName?: string;
  storeName?: string;
  userName?: string;
};

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(v as string) || 0;
}

function fmtQAR(v: number | string | null | undefined) {
  return "QAR " + toNum(v).toFixed(2);
}

function stockStatus(qty: number, min: number): "OK" | "LOW" | "OUT" {
  if (qty <= 0) return "OUT";
  if (qty <= min) return "LOW";
  return "OK";
}

function StatusBadge({ qty, min }: { qty: number; min: number }) {
  const s = stockStatus(qty, min);
  if (s === "OUT")
    return (
      <Badge className="bg-red-100 text-red-700 border-0 font-semibold">
        OUT
      </Badge>
    );
  if (s === "LOW")
    return (
      <Badge className="bg-orange-100 text-orange-700 border-0 font-semibold">
        LOW
      </Badge>
    );
  return (
    <Badge className="bg-green-100 text-green-700 border-0 font-semibold">
      OK
    </Badge>
  );
}

function rowBg(qty: number, min: number) {
  const s = stockStatus(qty, min);
  if (s === "OUT") return "bg-red-50/60";
  if (s === "LOW") return "bg-orange-50/60";
  return "";
}

function storeIcon(type?: string) {
  return type === "warehouse" ? (
    <Warehouse className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
  ) : (
    <Store className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
  );
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

/* ─────────────────────────────────────────
   Stock Adjustment Dialog
───────────────────────────────────────── */
type AdjMode = "add" | "remove" | "transfer";

type AdjForm = {
  mode: AdjMode;
  productId: string;
  fromStoreId: string;
  toStoreId: string;
  qty: string;
  reason: string;
};

const BLANK_ADJ: AdjForm = {
  mode: "add",
  productId: "",
  fromStoreId: "",
  toStoreId: "",
  qty: "",
  reason: "",
};

function AdjustmentDialog({
  open,
  onClose,
  products,
  stores,
  prefillProductId,
  prefillStoreId,
  prefillMode,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  stores: StoreItem[];
  prefillProductId?: number;
  prefillStoreId?: number;
  prefillMode?: AdjMode;
}) {
  const [form, setForm] = useState<AdjForm>(() => ({
    ...BLANK_ADJ,
    mode: prefillMode ?? "add",
    productId: prefillProductId ? String(prefillProductId) : "",
    fromStoreId: prefillStoreId ? String(prefillStoreId) : "",
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof AdjForm, string>>>(
    {}
  );
  const qc = useQueryClient();
  const { toast } = useToast();

  // Reset when dialog opens with new prefill
  const handleOpen = () => {
    setForm({
      ...BLANK_ADJ,
      mode: prefillMode ?? "add",
      productId: prefillProductId ? String(prefillProductId) : "",
      fromStoreId: prefillStoreId ? String(prefillStoreId) : "",
    });
    setErrors({});
  };

  const mut = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.message || "Adjustment failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/inventory"] });
      toast({ title: "Stock adjusted" });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: e.message || "Failed", variant: "destructive" });
    },
  });

  function set<K extends keyof AdjForm>(field: K, value: AdjForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof AdjForm, string>> = {};
    if (!form.productId) errs.productId = "Select a product";
    if (!form.fromStoreId) errs.fromStoreId = "Select a store";
    if (form.mode === "transfer" && !form.toStoreId)
      errs.toStoreId = "Select destination store";
    if (form.mode === "transfer" && form.fromStoreId === form.toStoreId)
      errs.toStoreId = "Source and destination must differ";
    const qty = parseFloat(form.qty);
    if (!form.qty || isNaN(qty) || qty <= 0)
      errs.qty = "Enter a positive quantity";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // For transfer we need two sequential adjust calls
  const transferMut = useMutation({
    mutationFn: async (body: {
      productId: number;
      fromStoreId: number;
      toStoreId: number;
      qty: number;
      reason: string;
    }) => {
      const base = {
        productId: body.productId,
        qtyChange: body.qty,
        type: "transfer" as const,
        reason: body.reason || "Transfer",
      };
      const r1 = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, storeId: body.fromStoreId, qtyChange: -body.qty }),
      });
      if (!r1.ok) throw new Error("Transfer out failed");
      const r2 = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, storeId: body.toStoreId, qtyChange: body.qty }),
      });
      if (!r2.ok) throw new Error("Transfer in failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      toast({ title: "Stock transferred" });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: e.message || "Transfer failed", variant: "destructive" });
    },
  });

  function handleSubmitFinal() {
    if (!validate()) return;
    const qty = parseFloat(form.qty);
    if (form.mode === "transfer") {
      transferMut.mutate({
        productId: Number(form.productId),
        fromStoreId: Number(form.fromStoreId),
        toStoreId: Number(form.toStoreId),
        qty,
        reason: form.reason,
      });
    } else {
      mut.mutate({
        productId: Number(form.productId),
        storeId: Number(form.fromStoreId),
        qtyChange: form.mode === "add" ? qty : -qty,
        type: form.mode,
        reason: form.reason || null,
      });
    }
  }

  const isPending = mut.isPending || transferMut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else handleOpen();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Mode */}
          <div className="space-y-1.5">
            <Label>Adjustment Type</Label>
            <div className="flex gap-2">
              {(["add", "remove", "transfer"] as AdjMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("mode", m)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors capitalize",
                    form.mode === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {m === "add" && "+ Add"}
                  {m === "remove" && "- Remove"}
                  {m === "transfer" && "↔ Transfer"}
                </button>
              ))}
            </div>
          </div>

          {/* Product */}
          <div className="space-y-1.5">
            <Label>
              Product <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.productId}
              onValueChange={(v) => set("productId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products
                  .filter((p) => p.active !== false)
                  .map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.sku ? `[${p.sku}] ` : ""}
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.productId && (
              <p className="text-xs text-red-500">{errors.productId}</p>
            )}
          </div>

          {/* From Store */}
          <div className="space-y-1.5">
            <Label>
              {form.mode === "transfer" ? "From Store" : "Store"}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.fromStoreId}
              onValueChange={(v) => set("fromStoreId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                {stores
                  .filter((s) => s.active !== false)
                  .map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nameEn}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.fromStoreId && (
              <p className="text-xs text-red-500">{errors.fromStoreId}</p>
            )}
          </div>

          {/* To Store (transfer only) */}
          {form.mode === "transfer" && (
            <div className="space-y-1.5">
              <Label>
                To Store <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.toStoreId}
                onValueChange={(v) => set("toStoreId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {stores
                    .filter(
                      (s) =>
                        s.active !== false && String(s.id) !== form.fromStoreId
                    )
                    .map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.nameEn}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.toStoreId && (
                <p className="text-xs text-red-500">{errors.toStoreId}</p>
              )}
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label>
              Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={form.qty}
              onChange={(e) => set("qty", e.target.value)}
              placeholder="0"
            />
            {errors.qty && (
              <p className="text-xs text-red-500">{errors.qty}</p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              rows={2}
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="Optional note..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmitFinal} disabled={isPending}>
            {isPending ? "Saving…" : "Apply Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Product Dialog (Add / Edit)
───────────────────────────────────────── */
type ProductForm = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  salePrice: string;
  wholesalePrice: string;
  costPrice: string;
  minStockQty: string;
  openingQty: string;
  supplierId: string;
  active: boolean;
  locationStoreId: string;
  locationArea: string;
  locationRack: string;
  locationShelf: string;
  imageUrl: string;
};

const BLANK_PRODUCT: ProductForm = {
  sku: "",
  name: "",
  category: "",
  unit: "",
  salePrice: "",
  wholesalePrice: "",
  costPrice: "",
  openingQty: "",
  minStockQty: "",
  supplierId: "",
  active: true,
  locationStoreId: "",
  locationArea: "",
  locationRack: "",
  locationShelf: "",
  imageUrl: "",
};

function ProductDialog({
  open,
  onClose,
  editProduct,
  suppliers,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  editProduct?: Product | null;
  suppliers: Supplier[];
  isAdmin: boolean;
}) {
  const isEdit = !!editProduct;
  const [form, setForm] = useState<ProductForm>(() =>
    editProduct
      ? {
          sku: editProduct.sku ?? "",
          name: editProduct.name,
          category: editProduct.category ?? "",
          unit: editProduct.unit ?? "",
          salePrice: editProduct.salePrice != null ? String(editProduct.salePrice) : "",
          wholesalePrice: (editProduct as any).wholesalePrice != null ? String((editProduct as any).wholesalePrice) : "",
          costPrice: editProduct.costPrice != null ? String(editProduct.costPrice) : "",
          minStockQty: editProduct.minStockQty != null ? String(editProduct.minStockQty) : "",
          openingQty: "", // current stock is managed via adjustments on existing products
          supplierId: editProduct.supplierId != null ? String(editProduct.supplierId) : "",
          active: editProduct.active !== false,
          locationStoreId: editProduct.locationStoreId != null ? String(editProduct.locationStoreId) : "",
          locationArea: editProduct.locationArea ?? "",
          locationRack: editProduct.locationRack ?? "",
          locationShelf: editProduct.locationShelf ?? "",
          imageUrl: editProduct.imageUrl ?? "",
        }
      : BLANK_PRODUCT
  );
  const [customData, setCustomData] = useState<Record<string, any>>((editProduct as any)?.customData || {});
  const { data: fieldDefs = [] } = useFieldDefs("products");

  // Location options — live from Settings (stores + managed lists). New options
  // added in Settings appear here instantly (spec rule 23).
  const { data: locStores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });
  const useList = (key: string) =>
    useQuery<any[]>({ queryKey: [`/api/lists/${key}`], queryFn: () => fetch(`/api/lists/${key}`).then((r) => r.json()) });
  const { data: areas = [] } = useList("location_areas");
  const { data: racks = [] } = useList("location_racks");
  const { data: shelves = [] } = useList("location_shelves");
  // Category + unit options from Settings managed lists (spec 11B) — combobox:
  // pick an existing value or type a new one (datalist).
  const { data: categoryOpts = [] } = useList("product_categories");
  const { data: unitOpts = [] } = useList("product_units");
  const [errors, setErrors] = useState<Partial<Record<keyof ProductForm, string>>>({});
  const qc = useQueryClient();
  const { toast } = useToast();

  function set<K extends keyof ProductForm>(field: K, value: ProductForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  const mut = useMutation({
    mutationFn: async (body: object) => {
      const url = isEdit ? `/api/products/${editProduct!.id}` : "/api/products";
      const method = isEdit ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed to save product");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: isEdit ? "Product updated" : "Product created" });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Cannot save product", description: String(e?.message || ""), variant: "destructive" });
    },
  });

  function validate() {
    const errs: Partial<Record<keyof ProductForm, string>> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    const skuErr = validateSku(form.sku);
    if (skuErr) errs.sku = skuErr;
    const priceErr = validatePositivePrice(form.salePrice, "Sell price");
    if (priceErr) errs.salePrice = priceErr;
    const costErr = validateNonNegative(form.costPrice, "Cost price");
    if (costErr) errs.costPrice = costErr;
    const minErr = validateNonNegative(form.minStockQty, "Minimum stock");
    if (minErr) errs.minStockQty = minErr;
    setErrors(errs);
    if (Object.keys(errs).length) return false;
    const missing = validateCustomFields(fieldDefs, customData);
    if (missing) { toast({ title: `${missing} is required`, variant: "destructive" }); return false; }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    mut.mutate({
      customData,
      sku: form.sku || null,
      name: form.name.trim(),
      category: form.category || null,
      unit: form.unit || null,
      salePrice: form.salePrice ? parseFloat(form.salePrice) : null,
      wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice) : null,
      costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
      minStockQty: form.minStockQty ? parseFloat(form.minStockQty) : null,
      // Opening stock — only on create; seeds inventory at the product's location.
      ...(!isEdit && form.openingQty ? { openingQty: parseFloat(form.openingQty) } : {}),
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      active: form.active,
      locationStoreId: form.locationStoreId ? Number(form.locationStoreId) : null,
      locationArea: form.locationArea || null,
      locationRack: form.locationRack || null,
      locationShelf: form.locationShelf || null,
      imageUrl: form.imageUrl || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-sku">SKU</Label>
              <Input
                id="p-sku"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="e.g. MTC-001"
                className={cn(errors.sku && "border-red-500 focus-visible:ring-red-500")}
              />
              {errors.sku && (
                <p className="text-xs text-red-500">{errors.sku}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Product name"
              />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-cat">Category</Label>
              <Input
                id="p-cat"
                list="product-category-options"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Pick or type…"
              />
              <datalist id="product-category-options">
                {categoryOpts.map((c: any) => <option key={c.id} value={c.value} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-unit">Unit</Label>
              <Input
                id="p-unit"
                list="product-unit-options"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="Pick or type…"
              />
              <datalist id="product-unit-options">
                {unitOpts.map((u: any) => <option key={u.id} value={u.value} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-sale">Retail Price (QAR) <span className="text-red-500">*</span></Label>
              <Input
                id="p-sale"
                type="number"
                min="0"
                step="0.01"
                value={form.salePrice}
                onChange={(e) => set("salePrice", e.target.value)}
                placeholder="0.00"
                className={cn(errors.salePrice && "border-red-500 focus-visible:ring-red-500")}
              />
              {errors.salePrice && (
                <p className="text-xs text-red-500">{errors.salePrice}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-wholesale">Wholesale Price (QAR)</Label>
              <Input
                id="p-wholesale"
                type="number"
                min="0"
                step="0.01"
                value={form.wholesalePrice}
                onChange={(e) => set("wholesalePrice", e.target.value)}
                placeholder="blank = same as retail"
              />
              <p className="text-[11px] text-muted-foreground">Used for contractor / corporate / government customers.</p>
            </div>
            {isAdmin && (
              <div className="space-y-1.5">
                <Label htmlFor="p-cost">Cost Price (QAR)</Label>
                <Input
                  id="p-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costPrice}
                  onChange={(e) => set("costPrice", e.target.value)}
                  placeholder="0.00"
                  className={cn(errors.costPrice && "border-red-500 focus-visible:ring-red-500")}
                />
                {errors.costPrice && (
                  <p className="text-xs text-red-500">{errors.costPrice}</p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="p-qty">Quantity (current stock)</Label>
                <Input
                  id="p-qty"
                  type="number"
                  min="0"
                  step="1"
                  value={form.openingQty}
                  onChange={(e) => set("openingQty", e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground">Opening stock, added at the location below. Later changes go through Stock Adjustments.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="p-min">Min Stock Qty</Label>
              <Input
                id="p-min"
                type="number"
                min="0"
                step="1"
                value={form.minStockQty}
                onChange={(e) => set("minStockQty", e.target.value)}
                placeholder="0"
                className={cn(errors.minStockQty && "border-red-500 focus-visible:ring-red-500")}
              />
              {errors.minStockQty && (
                <p className="text-xs text-red-500">{errors.minStockQty}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select
                value={form.supplierId || "none"}
                onValueChange={(v) => set("supplierId", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                      {s.company ? ` (${s.company})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Physical location path — dropdowns fed by Settings (rule 22/23) */}
          <div className="rounded-lg border border-dashed p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Physical Location — so any staff can find it
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location (store / warehouse)</Label>
                <Select value={form.locationStoreId || "none"} onValueChange={(v) => set("locationStoreId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {locStores.filter((s: any) => s.active !== false).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Area / Side</Label>
                <Select value={form.locationArea || "none"} onValueChange={(v) => set("locationArea", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {areas.map((a: any) => <SelectItem key={a.id} value={a.value}>{a.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rack / Section</Label>
                <Select value={form.locationRack || "none"} onValueChange={(v) => set("locationRack", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {racks.map((a: any) => <SelectItem key={a.id} value={a.value}>{a.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Shelf / Position</Label>
                <Select value={form.locationShelf || "none"} onValueChange={(v) => set("locationShelf", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {shelves.map((a: any) => <SelectItem key={a.id} value={a.value}>{a.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(form.locationStoreId || form.locationArea) && (
              <p className="text-xs font-mono text-[#1e2a3a] bg-slate-50 rounded px-2 py-1">
                📍 {[
                  form.locationStoreId ? locStores.find((s: any) => String(s.id) === form.locationStoreId)?.nameEn : null,
                  form.locationArea, form.locationRack, form.locationShelf,
                ].filter(Boolean).join(" → ")}
              </p>
            )}
          </div>

          {/* Optional product photo — helps tell similar items apart (Phase 9) */}
          <div className="space-y-1.5">
            <Label>Product Photo <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex items-center gap-3">
              {form.imageUrl
                ? <img src={form.imageUrl} alt="product" className="w-16 h-16 object-cover rounded-lg border" />
                : <div className="w-16 h-16 rounded-lg border border-dashed flex items-center justify-center text-[10px] text-muted-foreground">No photo</div>}
              <div className="flex flex-col gap-1.5">
                <input type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    if (f.size > 2 * 1024 * 1024) { toast({ title: "Image too large", description: "Max 2 MB.", variant: "destructive" }); return; }
                    const reader = new FileReader();
                    reader.onload = () => set("imageUrl", String(reader.result));
                    reader.readAsDataURL(f);
                  }}
                  className="text-xs" />
                {form.imageUrl && <button type="button" onClick={() => set("imageUrl", "")} className="text-[11px] text-red-600 text-left">Remove photo</button>}
                <p className="text-[10px] text-muted-foreground">JPG / PNG / WEBP · max 2 MB</p>
              </div>
            </div>
          </div>

          {/* Admin-defined custom fields (spec 11C) */}
          <CustomFields moduleKey="products" value={customData} onChange={setCustomData} />

          {isEdit && (
            <div className="flex items-center gap-3">
              <Switch
                id="p-active"
                checked={form.active}
                onCheckedChange={(v) => set("active", v)}
              />
              <Label htmlFor="p-active">Active</Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Tab 1 — All Stock
───────────────────────────────────────── */
function AllStockTab({
  stores,
  products,
  isAdmin,
}: {
  stores: StoreItem[];
  products: Product[];
  isAdmin: boolean;
}) {
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjPrefill, setAdjPrefill] = useState<{
    productId?: number;
    storeId?: number;
    mode?: AdjMode;
  }>({});

  const url =
    storeFilter === "all"
      ? "/api/inventory"
      : `/api/inventory?storeId=${storeFilter}`;

  const { data: rawInventory, isLoading } = useQuery<InventoryRow[]>({
    queryKey: ["/api/inventory", storeFilter],
    queryFn: () => fetch(url).then((r) => r.json()),
  });

  const inventory = Array.isArray(rawInventory) ? rawInventory : [];

  // Enrich inventory with product / store info
  const storeMap = useMemo(
    () => Object.fromEntries(stores.map((s) => [s.id, s])),
    [stores]
  );
  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  const enriched = useMemo(() => {
    return inventory.map((row) => {
      const product = productMap[row.productId] ?? {};
      const store = storeMap[row.storeId] ?? {};
      return {
        ...row,
        sku: row.sku ?? (product as Product).sku ?? "",
        name: row.name ?? (product as Product).name ?? `Product #${row.productId}`,
        category: row.category ?? (product as Product).category ?? "",
        unit: row.unit ?? (product as Product).unit ?? "",
        minStockQty: row.minStockQty ?? (product as Product).minStockQty ?? 0,
        storeName: row.storeName ?? (store as StoreItem).nameEn ?? `Store #${row.storeId}`,
        storeType: row.storeType ?? (store as StoreItem).type ?? "store",
      };
    });
  }, [inventory, productMap, storeMap]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter((row) => {
      if (!q) return true;
      return (
        (row.name ?? "").toLowerCase().includes(q) ||
        (row.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [enriched, search]);

  function openAdj(mode: AdjMode, productId?: number, storeId?: number) {
    setAdjPrefill({ mode, productId, storeId });
    setAdjOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search product name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="All Stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stores</SelectItem>
            {stores
              .filter((s) => s.active !== false)
              .map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {storeIcon(s.type)}
                  {s.nameEn}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">Product</TableHead>
                <TableHead className="font-semibold">SKU</TableHead>
                <TableHead className="font-semibold">Category</TableHead>
                <TableHead className="font-semibold">Store</TableHead>
                <TableHead className="font-semibold text-right">Qty</TableHead>
                <TableHead className="font-semibold text-right">Min Qty</TableHead>
                <TableHead className="font-semibold">Unit</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No inventory records found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const qty = toNum(row.qty);
                  const min = toNum(row.minStockQty);
                  return (
                    <TableRow
                      key={row.id}
                      className={cn("transition-colors", rowBg(qty, min))}
                    >
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {row.sku || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.category || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {storeIcon(row.storeType)}
                        {row.storeName}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {qty}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {min}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.unit || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge qty={qty} min={min} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => openAdj("add", row.productId, row.storeId)}
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => openAdj("remove", row.productId, row.storeId)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => openAdj("transfer", row.productId, row.storeId)}
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      <AdjustmentDialog
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        products={products}
        stores={stores}
        prefillProductId={adjPrefill.productId}
        prefillStoreId={adjPrefill.storeId}
        prefillMode={adjPrefill.mode}
      />
    </div>
  );
}

/* ─────────────────────────────────────────
   Tab 2 — Low Stock Alerts
───────────────────────────────────────── */
function LowStockTab({
  stores,
  products,
  suppliers,
}: {
  stores: StoreItem[];
  products: Product[];
  suppliers: Supplier[];
}) {
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjPrefill, setAdjPrefill] = useState<{
    productId?: number;
    storeId?: number;
  }>({});

  const { data: rawLow, isLoading } = useQuery<InventoryRow[]>({
    queryKey: ["/api/inventory/low-stock"],
    queryFn: () => fetch("/api/inventory/low-stock").then((r) => r.json()),
  });

  // Velocity-based reorder suggestions (Feature C) — keyed by productId+storeId.
  const { data: rawSuggest } = useQuery<any[]>({
    queryKey: ["/api/inventory/reorder-suggestions"],
    queryFn: () => fetch("/api/inventory/reorder-suggestions").then((r) => r.json()),
  });
  const suggestMap = useMemo(() => {
    const m: Record<string, any> = {};
    (Array.isArray(rawSuggest) ? rawSuggest : []).forEach((s) => { m[`${s.productId}-${s.storeId}`] = s; });
    return m;
  }, [rawSuggest]);

  const qc = useQueryClient();
  const { toast } = useToast();
  const createPO = useMutation({
    mutationFn: (row: any) => {
      if (!row.supplierId) throw new Error("This product has no supplier — set one on the product first.");
      return fetch("/api/supplier-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: row.supplierId, storeId: row.storeId, status: "draft",
          notes: `Auto-suggested reorder — ${row.name} low on stock`,
          items: [{ productId: row.productId, name: row.name, qty: row.suggestedQty, unit: row.unit }],
        }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed to create PO"); return r.json(); });
    },
    onSuccess: (po: any) => {
      qc.invalidateQueries({ queryKey: ["/api/supplier-orders"] });
      toast({ title: "Purchase order drafted", description: `${po.poNumber} created — review it under Suppliers → Purchase Orders.` });
    },
    onError: (e: any) => toast({ title: "Cannot create PO", description: String(e?.message || ""), variant: "destructive" }),
  });

  const lowStock = Array.isArray(rawLow) ? rawLow : [];

  const storeMap = useMemo(
    () => Object.fromEntries(stores.map((s) => [s.id, s])),
    [stores]
  );
  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );
  const supplierMap = useMemo(
    () => Object.fromEntries(suppliers.map((s) => [s.id, s])),
    [suppliers]
  );

  const enriched = useMemo(() => {
    return lowStock
      .map((row) => {
        const product = productMap[row.productId] ?? ({} as Product);
        const store = storeMap[row.storeId] ?? ({} as StoreItem);
        const supplierId =
          row.supplierId ?? (product as Product).supplierId ?? null;
        const supplier = supplierId ? supplierMap[supplierId] : null;
        const qty = toNum(row.qty);
        const min = toNum(row.minStockQty ?? (product as Product).minStockQty);
        return {
          ...row,
          sku: row.sku ?? product.sku ?? "",
          name: row.name ?? product.name ?? `Product #${row.productId}`,
          unit: row.unit ?? product.unit ?? "pcs",
          minStockQty: min,
          storeName: row.storeName ?? store.nameEn ?? `Store #${row.storeId}`,
          storeType: row.storeType ?? store.type ?? "store",
          supplierId,
          supplier,
          qty,
          suggestedQty: suggestMap[`${row.productId}-${row.storeId}`]?.suggestedQty ?? Math.max(min * 2, min - qty + min),
          velocityPerDay: suggestMap[`${row.productId}-${row.storeId}`]?.velocityPerDay ?? null,
        };
      })
      // OUT first, then LOW
      .sort((a, b) => {
        const sa = stockStatus(a.qty, a.minStockQty);
        const sb = stockStatus(b.qty, b.minStockQty);
        if (sa === "OUT" && sb !== "OUT") return -1;
        if (sa !== "OUT" && sb === "OUT") return 1;
        return a.qty - b.qty;
      });
  }, [lowStock, productMap, storeMap, supplierMap, suggestMap]);

  function buildWhatsAppMsg(row: (typeof enriched)[0]) {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const poRef = `PO-${Date.now().toString().slice(-6)}`;
    const msg = [
      `Order from MTC — ${today}`,
      ``,
      `${row.name} — ${row.suggestedQty} ${row.unit}`,
      ``,
      `Deliver to: Najma Street, Doha`,
      `Ref: ${poRef}`,
      `+974 30703722`,
    ].join("\n");
    return msg;
  }

  function handleOrderNow(row: (typeof enriched)[0]) {
    if (!row.supplier?.whatsapp && !row.supplier?.phone) {
      alert("No WhatsApp number for this supplier");
      return;
    }
    const phone = (row.supplier.whatsapp || row.supplier.phone || "")
      .replace(/\D/g, "");
    const msg = encodeURIComponent(buildWhatsAppMsg(row));
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : enriched.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border/40 shadow-sm py-20 text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-foreground">All stock levels are OK</p>
          <p className="text-sm text-muted-foreground mt-1">
            No products are at or below minimum quantity
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <p className="text-sm font-medium text-orange-700">
              {enriched.length} product{enriched.length !== 1 ? "s" : ""} need
              restocking
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Product</TableHead>
                    <TableHead className="font-semibold">Store</TableHead>
                    <TableHead className="font-semibold text-right">Qty</TableHead>
                    <TableHead className="font-semibold text-right">Min</TableHead>
                    <TableHead className="font-semibold text-right">Suggest Order</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Supplier</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enriched.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(rowBg(row.qty, row.minStockQty))}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.name}</p>
                          {row.sku && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {row.sku}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {storeIcon(row.storeType)}
                        {row.storeName}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {row.qty}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {row.minStockQty}
                      </TableCell>
                      <TableCell className="text-right font-mono text-blue-700 font-semibold">
                        {row.suggestedQty} {row.unit}
                        {row.velocityPerDay != null && row.velocityPerDay > 0 && (
                          <span className="block text-[10px] font-normal text-muted-foreground">~{row.velocityPerDay}/day sold</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge qty={row.qty} min={row.minStockQty} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.supplier ? (
                          <span>
                            {row.supplier.name}
                            {row.supplier.company
                              ? ` / ${row.supplier.company}`
                              : ""}
                          </span>
                        ) : (
                          <span className="italic opacity-50">No supplier</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => {
                              setAdjPrefill({ productId: row.productId, storeId: row.storeId });
                              setAdjOpen(true);
                            }}
                          >
                            <Plus className="w-3 h-3" />
                            Add Stock
                          </Button>
                          {row.supplier && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                                disabled={createPO.isPending}
                                onClick={() => createPO.mutate(row)}
                                title={`Draft a PO to ${row.supplier.name} for ${row.suggestedQty} ${row.unit}`}
                              >
                                <FileText className="w-3 h-3" />
                                Create PO
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleOrderNow(row)}
                              >
                                <MessageSquare className="w-3 h-3" />
                                WhatsApp
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      <AdjustmentDialog
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        products={products}
        stores={stores}
        prefillProductId={adjPrefill.productId}
        prefillStoreId={adjPrefill.storeId}
        prefillMode="add"
      />
    </div>
  );
}

/* ─────────────────────────────────────────
   Tab 3 — Products
───────────────────────────────────────── */
function ProductsTab({
  isAdmin,
  suppliers,
}: {
  isAdmin: boolean;
  suppliers: Supplier[];
}) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: rawProducts, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  const products = Array.isArray(rawProducts) ? rawProducts : [];

  const { data: locStores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      if (!showInactive && p.active === false) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, showInactive]);

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product updated" });
    },
    onError: () =>
      toast({ title: "Failed to update", variant: "destructive" }),
  });

  const supplierMap = useMemo(
    () => Object.fromEntries(suppliers.map((s) => [s.id, s])),
    [suppliers]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Switch
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            Show inactive
          </label>
          <Button
            onClick={() => {
              setEditProduct(null);
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">SKU</TableHead>
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Category</TableHead>
                <TableHead className="font-semibold">Unit</TableHead>
                <TableHead className="font-semibold text-right">Sale Price</TableHead>
                {isAdmin && (
                  <TableHead className="font-semibold text-right">Cost Price</TableHead>
                )}
                <TableHead className="font-semibold text-right">Min Stock</TableHead>
                <TableHead className="font-semibold">Supplier</TableHead>
                <TableHead className="font-semibold text-center">Active</TableHead>
                <TableHead className="font-semibold text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isAdmin ? 10 : 9 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 10 : 9}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No products found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const supplier = p.supplierId
                    ? supplierMap[p.supplierId]
                    : null;
                  return (
                    <TableRow
                      key={p.id}
                      className={cn(
                        "transition-colors",
                        p.active === false && "opacity-50"
                      )}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.sku || "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {p.imageUrl && <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover border shrink-0" />}
                          <div>
                            <Link href={`/inventory/${p.id}`} className="hover:text-primary hover:underline">
                              {p.name}
                            </Link>
                            {locationPath(p, locStores) && (
                              <span className="block text-[11px] font-normal text-muted-foreground">
                                📍 {locationPath(p, locStores)}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.category || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.unit || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.salePrice != null ? fmtQAR(p.salePrice) : "—"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {p.costPrice != null ? fmtQAR(p.costPrice) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-mono text-sm">
                        {toNum(p.minStockQty)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {supplier ? supplier.name : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={p.active !== false}
                          onCheckedChange={(v) =>
                            toggleActiveMut.mutate({ id: p.id, active: v })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditProduct(p);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} product{filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      <ProductDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditProduct(null);
        }}
        editProduct={editProduct}
        suppliers={suppliers}
        isAdmin={isAdmin}
      />
    </div>
  );
}

/* ─────────────────────────────────────────
   Tab 4 — Adjustments Log
───────────────────────────────────────── */
function AdjustmentsTab({
  products,
  stores,
}: {
  products: Product[];
  stores: StoreItem[];
}) {
  const storeMap = useMemo(
    () => Object.fromEntries(stores.map((s) => [s.id, s])),
    [stores]
  );
  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  // We use the inventory report endpoint which should return adjustments
  const { data: rawAdj, isLoading } = useQuery<AdjustmentLog[]>({
    queryKey: ["/api/stock-adjustments"],
    queryFn: () =>
      fetch("/api/stock-adjustments")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
  });

  const adjustments = Array.isArray(rawAdj) ? rawAdj : [];

  const enriched = useMemo(() => {
    return adjustments.map((a) => ({
      ...a,
      productName:
        a.productName ?? productMap[a.productId]?.name ?? `#${a.productId}`,
      storeName:
        a.storeName ?? storeMap[a.storeId]?.nameEn ?? `#${a.storeId}`,
    }));
  }, [adjustments, productMap, storeMap]);

  function typeColor(type: string) {
    switch (type) {
      case "add":
      case "return":
        return "bg-green-100 text-green-700";
      case "remove":
      case "sale":
        return "bg-red-100 text-red-700";
      case "transfer":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Product</TableHead>
                <TableHead className="font-semibold">Store</TableHead>
                <TableHead className="font-semibold text-right">Qty Change</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Reason</TableHead>
                <TableHead className="font-semibold">User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : enriched.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No adjustment records yet
                  </TableCell>
                </TableRow>
              ) : (
                enriched.map((a) => {
                  const change = toNum(a.qtyChange);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {fmtDate(a.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {a.productName}
                      </TableCell>
                      <TableCell className="text-sm">{a.storeName}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        <span
                          className={
                            change >= 0 ? "text-green-700" : "text-red-700"
                          }
                        >
                          {change >= 0 ? "+" : ""}
                          {change}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "capitalize border-0 font-semibold text-xs",
                            typeColor(a.type)
                          )}
                        >
                          {a.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {a.reason || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.userName ?? (a.userId ? `#${a.userId}` : "—")}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {enriched.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {enriched.length} adjustment{enriched.length !== 1 ? "s" : ""} on record
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Main Page
───────────────────────────────────────── */
/* ─────────────────────────────────────────
   Tab — Transfers (TR)
───────────────────────────────────────── */
function TransfersTab({ isAdmin, stores, products, onNew }: { isAdmin: boolean; stores: any[]; products: any[]; onNew: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canApprove = ["admin", "manager"].includes(user?.role || "");
  const [editT, setEditT] = useState<any>(null);
  const [reverseT, setReverseT] = useState<any>(null);
  const [receiveT, setReceiveT] = useState<any>(null); // transfer awaiting a "Confirm receipt" dialog
  const { data: transfers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/transfers"],
    queryFn: () => fetch("/api/transfers").then((r) => r.json()).catch(() => []),
  });
  const [voucher, setVoucher] = useState<any>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of month
  const { data: settlement } = useQuery<any>({
    queryKey: ["/api/transfers/settlement", monthStart, monthEnd],
    queryFn: () => fetch(`/api/transfers/settlement?start=${monthStart}&end=${monthEnd}`).then((r) => r.json()).catch(() => ({ settlements: [] })),
  });
  const act = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: string; body?: any }) => {
      const r = await fetch(`/api/transfers/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body || {}) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Action failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/transfers"] });
      qc.invalidateQueries({ queryKey: ["/api/transfers/settlement"] }); // net owed changes on receive/return/cancel
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });
  const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);
  // Share a transfer note to any WhatsApp contact (chooser opens — no stored number needed).
  // For an off-system store: they get the note, reply to confirm, staff logs receipt.
  const waShare = (t: any) => {
    const lines = (t.items || []).map((i: any) => `• ${i.description} ×${Number(i.qty)} ${i.unit || ""}`.trim()).join("\n");
    const msg =
      `*STOCK TRANSFER — ${t.number}*\n` +
      `${t.fromStore} → ${t.toStore}\n` +
      `Date: ${t.date}${t.takenBy ? `\nTaken by: ${t.takenBy}` : ""}\n\n` +
      `${lines}\n\n` +
      (t.crossOwner ? `Value (at cost): ${money(t.total)}\n\n` : "") +
      `Please confirm you received these goods — reply *RECEIVED* with your name.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
  };
  const STATUS: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700", approved: "bg-amber-100 text-amber-700",
    received: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-3">
      {/* Inter-store settlement — net who-owes-whom for the chosen month */}
      <div className="rounded-2xl border border-border/40 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h3 className="text-sm font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-[#d4a017]" /> Inter-store Settlement</h3>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 rounded-lg border px-2 text-xs" />
        </div>
        {(!settlement?.settlements || settlement.settlements.length === 0) ? (
          <p className="text-xs text-muted-foreground">No cross-store balances this month — all internal moves, or already even.</p>
        ) : (
          <div className="space-y-1.5">
            {settlement.settlements.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm rounded-lg bg-amber-50/60 border border-amber-100 px-3 py-2">
                <span><b>{s.debtor}</b> owes <b>{s.creditor}</b></span>
                <span className="font-mono font-bold text-amber-700">{money(s.amount)}</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Net of both directions ({settlement.transferCount} received transfer{settlement.transferCount === 1 ? "" : "s"}) — the net debtor pays.</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={onNew} className="gap-2"><ArrowLeftRight className="w-4 h-4" /> New Transfer</Button>
      </div>
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No transfers yet.</p>
        ) : (
          <div className="divide-y">
            {transfers.map((t: any) => (
              <div key={t.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm">{t.number}</span>
                    <Badge className={cn("text-[10px] capitalize border-0", STATUS[t.status] || "bg-gray-100")}>{t.status}</Badge>
                    {t.crossOwner
                      ? <Badge className="text-[10px] border-0 bg-amber-500 text-white">Cross-owner · {money(t.total)}</Badge>
                      : <Badge className="text-[10px] border-0 bg-green-100 text-green-700">Internal · no charge</Badge>}
                    {t.returnOfNumber && <Badge className="text-[10px] border-0 bg-blue-100 text-blue-700">↩ Return of {t.returnOfNumber}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.fromStore} <ArrowLeftRight className="w-3 h-3 inline mx-0.5" /> {t.toStore}
                    {" · "}{t.date}{t.takenBy ? ` · taken by ${t.takenBy}` : ""}
                    {t.receivedByName ? ` · received by ${t.receivedByName}${t.confirmMethod && t.confirmMethod !== "on-system" ? ` (via ${t.confirmMethod})` : ""}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {(t.items || []).map((i: any) => `${i.description} ×${Number(i.qty)}`).join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setVoucher(t)}>Voucher</Button>
                  {(t.status === "approved" || t.status === "received") && (
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-green-700 border-green-300" onClick={() => waShare(t)} title="Send this note on WhatsApp"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</Button>
                  )}
                  {t.status === "draft" && (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setEditT(t)}>Edit</Button>
                  )}
                  {t.status === "draft" && canApprove && (
                    <Button size="sm" className="h-8 bg-[#1e2a3a] text-white" disabled={act.isPending} onClick={() => act.mutate({ id: t.id, action: "approve" })}>Send for confirmation</Button>
                  )}
                  {t.status === "approved" && (
                    <Button size="sm" className="h-8 bg-green-600 text-white" disabled={act.isPending} onClick={() => setReceiveT(t)}>Confirm receipt</Button>
                  )}
                  {t.status === "received" && !t.returnOfNumber && (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setReverseT(t)}>Return</Button>
                  )}
                  {(t.status === "draft" || t.status === "approved") && (
                    <Button size="sm" variant="outline" className="h-8" disabled={act.isPending} onClick={() => { if (window.confirm("Cancel this transfer?")) act.mutate({ id: t.id, action: "cancel" }); }}>Cancel</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <TransferVoucher transfer={voucher} onClose={() => setVoucher(null)} />
      <ReceiveConfirmDialog
        transfer={receiveT}
        currentUserName={user?.name || ""}
        pending={act.isPending}
        onClose={() => setReceiveT(null)}
        onConfirm={(body) => act.mutate({ id: receiveT.id, action: "receive", body }, { onSuccess: () => setReceiveT(null) })}
      />
      <TransferModal
        open={!!editT || !!reverseT}
        onClose={() => { setEditT(null); setReverseT(null); }}
        stores={stores}
        products={products}
        editTransfer={editT || undefined}
        reverseTransfer={reverseT || undefined}
      />
    </div>
  );
}

// Confirm-receipt dialog. Default = on-system (our own staff took delivery, one click).
// For an off-system store, pick how they confirmed (signature/WhatsApp/phone) and name them.
const CONFIRM_METHODS: { key: string; label: string }[] = [
  { key: "on-system", label: "Our staff (on-system)" },
  { key: "signature", label: "Signed voucher" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "phone", label: "Phone" },
];
function ReceiveConfirmDialog({
  transfer, currentUserName, pending, onClose, onConfirm,
}: {
  transfer: any | null;
  currentUserName: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (body: { method: string; externalReceiver?: string }) => void;
}) {
  const [method, setMethod] = useState("on-system");
  const [name, setName] = useState("");
  useEffect(() => { if (transfer) { setMethod("on-system"); setName(""); } }, [transfer]);
  if (!transfer) return null;
  const offSystem = method !== "on-system";
  const canSubmit = !offSystem || name.trim().length > 0;

  return (
    <Dialog open={!!transfer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Confirm receipt — {transfer.number}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            {transfer.fromStore} → <b>{transfer.toStore}</b>. Records who took delivery and how it was confirmed.
          </p>
          <div>
            <Label className="text-xs">How was receipt confirmed?</Label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {CONFIRM_METHODS.map((m) => (
                <button key={m.key} type="button" onClick={() => setMethod(m.key)}
                  className={cn("text-xs rounded-md border px-2 py-1.5 text-left", method === m.key ? "border-[#1e2a3a] bg-[#1e2a3a] text-white" : "border-border hover:bg-muted")}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {offSystem ? (
            <div>
              <Label className="text-xs">Received by (name at destination) <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Who signed / replied for the goods" className="h-9" />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Will record <b>{currentUserName || "you"}</b> as the receiver.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className="bg-green-600 text-white" disabled={pending || !canSubmit}
            onClick={() => onConfirm(offSystem ? { method, externalReceiver: name.trim() } : { method: "on-system" })}>
            {pending ? "Saving…" : "Confirm receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Global data fetches shared across tabs
  const { data: rawStores } = useQuery<StoreItem[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });
  const stores = (Array.isArray(rawStores) ? rawStores : []).filter(
    (s) => s.active !== false
  );

  const { data: rawProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });
  const products = Array.isArray(rawProducts) ? rawProducts : [];

  const { data: rawSuppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => fetch("/api/suppliers").then((r) => r.json()),
  });
  const suppliers = Array.isArray(rawSuppliers) ? rawSuppliers : [];

  // Low stock count for badge
  const { data: rawLow } = useQuery<InventoryRow[]>({
    queryKey: ["/api/inventory/low-stock"],
    queryFn: () => fetch("/api/inventory/low-stock").then((r) => r.json()),
  });
  const lowCount = Array.isArray(rawLow) ? rawLow.length : 0;

  // On-hand qty per product (summed across locations) for the CSV export.
  const { data: rawInv } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    queryFn: () => fetch("/api/inventory").then((r) => r.json()),
  });
  const qtyByProduct = useMemo(() => {
    const m: Record<number, number> = {};
    (Array.isArray(rawInv) ? rawInv : []).forEach((r: any) => {
      const pid = r.productId ?? r.product?.id;
      if (pid != null) m[pid] = (m[pid] || 0) + Number(r.qty || 0);
    });
    return m;
  }, [rawInv]);

  function exportCsv() {
    const headers = ["Name", "SKU", "Category", "Unit", ...(isAdmin ? ["Cost"] : []), "Sell", "Profit", "Quantity", "Location"];
    const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [headers.join(",")];
    for (const p of products) {
      const sell = Number(p.salePrice) || 0, cost = Number(p.costPrice) || 0;
      const row = [p.name, p.sku || "", p.category || "", p.unit || "", ...(isAdmin ? [cost.toFixed(2)] : []),
        sell.toFixed(2), (sell - cost).toFixed(2), String(qtyByProduct[p.id] ?? 0), locationPath(p, stores)];
      lines.push(row.map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "inventory.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const [adjOpen, setAdjOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferPrefill, setTransferPrefill] = useState<{ productId?: number; fromStoreId?: number } | undefined>(undefined);

  // Dashboard "N products low on stock" widget deep-links here with ?filter=low-stock →
  // open the Low Stock tab (same /api/inventory/low-stock source as the widget count).
  // Plain sidebar nav has no param → defaults to All Stock.
  const urlSearch = useSearch();
  const [tab, setTab] = useState(
    () => (new URLSearchParams(urlSearch).get("filter") === "low-stock" ? "low" : "stock"),
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {products.filter((p) => p.active !== false).length} active products
            across {stores.length} locations
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={exportCsv} className="gap-2">
            <FileText className="w-4 h-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => { setTransferPrefill(undefined); setTransferOpen(true); }} className="gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            Transfer
          </Button>
          <Button onClick={() => setAdjOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Stock Adjustment
          </Button>
        </div>
      </div>

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} stores={stores} products={products} prefill={transferPrefill} />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="stock">All Stock</TabsTrigger>
          <TabsTrigger value="low" className="gap-2">
            Low Stock
            {lowCount > 0 && (
              <Badge className="bg-red-500 text-white border-0 text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center">
                {lowCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <AllStockTab stores={stores} products={products} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="low">
          <LowStockTab
            stores={stores}
            products={products}
            suppliers={suppliers}
          />
        </TabsContent>

        <TabsContent value="products">
          <ProductsTab isAdmin={isAdmin} suppliers={suppliers} />
        </TabsContent>

        <TabsContent value="transfers">
          <TransfersTab isAdmin={isAdmin} stores={stores} products={products} onNew={() => { setTransferPrefill(undefined); setTransferOpen(true); }} />
        </TabsContent>

        <TabsContent value="adjustments">
          <AdjustmentsTab products={products} stores={stores} />
        </TabsContent>
      </Tabs>

      {/* Global Quick Adjustment from header button */}
      <AdjustmentDialog
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        products={products}
        stores={stores}
      />
    </div>
  );
}
