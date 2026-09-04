import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, Package, TrendingUp, History, Factory, MapPin, Camera, Loader2, Pencil, X, Save } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { shrinkImage, PHOTO } from "@/lib/image";

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);
const moveColor: Record<string, string> = {
  sale: "text-red-600", return: "text-green-600", add: "text-green-600",
  remove: "text-red-600", transfer: "text-blue-600", receive: "text-green-600",
};

export default function ProductDetail() {
  const [, params] = useRoute("/inventory/:id");
  const [, nav] = useLocation();
  const id = Number(params?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5 MB allowed.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const compressed = await shrinkImage(file, PHOTO);
      setPreviewImage(compressed);
      setForm((f) => ({ ...f, imageUrl: compressed }));
    } catch {
      toast({ title: "Error", description: "Could not process image.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startEdit = (product: any) => {
    setForm({
      name: product.name || "",
      sku: product.sku || "",
      category: product.category || "",
      unit: product.unit || "",
      salePrice: product.salePrice || "",
      wholesalePrice: product.wholesalePrice || "",
      costPrice: product.costPrice || "",
      minStockQty: product.minStockQty || "",
      supplierId: product.supplierId ? String(product.supplierId) : "",
    });
    setPreviewImage(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm({});
    setPreviewImage(null);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      if (form.name) body.name = form.name;
      if (form.sku !== undefined) body.sku = form.sku;
      if (form.category !== undefined) body.category = form.category;
      if (form.unit) body.unit = form.unit;
      if (form.salePrice !== undefined) body.salePrice = form.salePrice;
      if (form.wholesalePrice !== undefined) body.wholesalePrice = form.wholesalePrice;
      if (form.costPrice !== undefined) body.costPrice = form.costPrice;
      if (form.minStockQty !== undefined) body.minStockQty = form.minStockQty;
      if (form.supplierId !== undefined) body.supplierId = form.supplierId ? Number(form.supplierId) : null;
      if (form.imageUrl) body.imageUrl = form.imageUrl;
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      queryClient.invalidateQueries({ queryKey: [`/api/products/${id}/activity`] });
      toast({ title: "Product updated" });
      setEditing(false);
      setForm({});
      setPreviewImage(null);
    } catch {
      toast({ title: "Save failed", description: "Could not update product.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/products/${id}/activity`],
    queryFn: () => fetch(`/api/products/${id}/activity`).then((r) => r.json()),
    enabled: !!id,
  });

  const { data: suppliersList = [] } = useQuery<any[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => fetch("/api/suppliers").then((r) => r.json()),
  });

  if (isLoading) {
    return <div className="p-6 max-w-5xl mx-auto space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (!data?.product) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Product not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => nav("/inventory")}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
      </div>
    );
  }
  const p = data.product;
  const cost = p.costPrice != null ? Number(p.costPrice) : null;
  const sell = Number(p.salePrice) || 0;
  const margin = cost != null && sell > 0 ? ((sell - cost) / sell) * 100 : null;
  const displayImage = previewImage || p.imageUrl;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => nav("/inventory")}>
          <ArrowLeft className="w-4 h-4" /> Inventory
        </Button>
        {!editing && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => startEdit(p)}>
            <Pencil className="w-3.5 h-3.5" /> Edit Product
          </Button>
        )}
      </div>

      {/* Header card with large image */}
      <div className="section-card">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />

        <div className="flex flex-col sm:flex-row gap-5">
          {/* Product image — large, prominent */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <div className={cn(
              "relative w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden border-2 shadow-sm",
              editing ? "border-primary/30 cursor-pointer group" : "border-border/40",
            )}
              onClick={editing ? () => fileInputRef.current?.click() : undefined}
            >
              {displayImage
                ? <img src={displayImage} alt={p.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-muted flex items-center justify-center"><Package className="w-16 h-16 text-muted-foreground/50" /></div>}
              {editing && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                  {uploading
                    ? <Loader2 className="w-7 h-7 text-white animate-spin" />
                    : <>
                        <Camera className="w-7 h-7 text-white" />
                        <span className="text-white text-xs font-medium">Change Image</span>
                      </>}
                </div>
              )}
            </div>
            {editing && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Camera className="w-3.5 h-3.5" />
                {displayImage ? "Change Image" : "Upload Image"}
              </Button>
            )}
          </div>

          {/* Product info */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            {!editing ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-muted-foreground">
                    <span className="font-mono">{p.sku || "—"}</span>
                    {p.category && <span className="px-2 py-0.5 rounded-full bg-secondary text-xs">{p.category}</span>}
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", p.active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {p.active !== false ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-3xl font-mono font-bold text-amber-600">{money(sell)}</p>
                  {margin != null && <p className="text-sm text-muted-foreground mt-0.5">{margin.toFixed(1)}% margin</p>}
                  <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                    <Factory className="w-3.5 h-3.5" />
                    <span>{data.supplier ? data.supplier.name : "No supplier"}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Product Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">SKU</Label>
                    <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Unit</Label>
                    <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Sale Price</Label>
                    <Input type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Wholesale Price</Label>
                    <Input type="number" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Cost Price</Label>
                    <Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Min Stock Qty</Label>
                    <Input type="number" value={form.minStockQty} onChange={(e) => setForm({ ...form, minStockQty: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Supplier</Label>
                    <Select value={form.supplierId || "none"} onValueChange={(v) => setForm({ ...form, supplierId: v === "none" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {suppliersList.map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}{s.company ? ` (${s.company})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="gap-1.5" onClick={saveEdit} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Changes
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={cancelEdit} disabled={saving}>
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="details"><Package className="w-3.5 h-3.5 mr-1.5" />Details</TabsTrigger>
          <TabsTrigger value="sales"><TrendingUp className="w-3.5 h-3.5 mr-1.5" />Sales History</TabsTrigger>
          <TabsTrigger value="movement"><History className="w-3.5 h-3.5 mr-1.5" />Stock Movement</TabsTrigger>
          <TabsTrigger value="supplier"><Factory className="w-3.5 h-3.5 mr-1.5" />Supplier</TabsTrigger>
        </TabsList>

        {/* Details */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Sell price" value={money(sell)} />
            <Stat label="Cost price" value={cost != null ? money(cost) : "Admin only"} />
            <Stat label="Unit" value={p.unit || "—"} />
            <Stat label="Min stock" value={String(p.minStockQty ?? "—")} />
          </div>
          <div className="bg-white rounded-xl border border-border/40 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Stock on hand by location</h2></div>
            {(data.stockByLocation || []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">No stock recorded.</p> : (
              <div className="divide-y">
                {data.stockByLocation.map((s: any) => (
                  <div key={s.storeId} className="px-4 py-2.5 flex justify-between text-sm">
                    <span>{s.storeName}</span>
                    <span className={cn("font-mono font-semibold", s.qty <= (Number(p.minStockQty) || 0) ? "text-red-600" : "text-foreground")}>{s.qty} {p.unit || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Sales history */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Sold this month" value={String(data.stats?.soldThisMonth ?? 0)} />
            <Stat label="Sold this year" value={String(data.stats?.soldThisYear ?? 0)} />
            <Stat label="Avg sell price" value={money(data.stats?.avgPrice)} />
            <Stat label="Best customer" value={data.stats?.bestCustomer?.name || "—"} />
          </div>
          <TableCard
            head={["Invoice", "Date", "Customer", "Qty", "Price", "Amount"]}
            rows={(data.sales || []).map((s: any) => [
              <Link key="l" href={`/documents/${s.docId}`} className="font-mono text-blue-600 hover:underline">{s.number}</Link>,
              s.date ? format(new Date(s.date), "dd MMM yy") : "—",
              s.customerName || "—", s.qty, money(s.price), money(s.amount),
            ])}
            empty="No sales yet for this product."
          />
        </TabsContent>

        {/* Stock movement */}
        <TabsContent value="movement">
          <TableCard
            head={["Type", "Change", "Location", "Reason", "Date"]}
            rows={(data.movements || []).map((m: any) => [
              <span key="t" className={cn("font-semibold capitalize", moveColor[m.type] || "")}>{m.type}</span>,
              <span key="c" className={cn("font-mono", m.qtyChange >= 0 ? "text-green-600" : "text-red-600")}>{m.qtyChange >= 0 ? "+" : ""}{m.qtyChange}</span>,
              m.storeName, m.reason || "—", m.date ? format(new Date(m.date), "dd MMM yy HH:mm") : "—",
            ])}
            empty="No stock movements recorded."
          />
        </TabsContent>

        {/* Supplier */}
        <TabsContent value="supplier" className="space-y-3">
          {data.supplier ? (
            <div className="bg-white rounded-xl border border-border/40 shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{data.supplier.name}</p>
                {data.supplier.phone && <p className="text-sm text-muted-foreground">{data.supplier.phone}</p>}
              </div>
              <Link href="/suppliers"><Button variant="outline" size="sm">View supplier</Button></Link>
            </div>
          ) : <p className="text-sm text-muted-foreground">No supplier linked to this product.</p>}
          <Link href="/purchase-orders/new"><Button size="sm" className="gap-1.5"><Factory className="w-4 h-4" />Create Purchase Order</Button></Link>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-border/40 shadow-sm p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono font-bold text-sm mt-0.5 truncate">{value}</p>
    </div>
  );
}

function TableCard({ head, rows, empty }: { head: string[]; rows: any[][]; empty: string }) {
  return (
    <div className="bg-white rounded-xl border border-border/40 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            {head.map((h) => <th key={h} className="text-left px-4 py-2.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border/30">
            {rows.length === 0 ? (
              <tr><td colSpan={head.length} className="px-4 py-8 text-center text-muted-foreground">{empty}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="hover:bg-secondary/10">
                {r.map((c, j) => <td key={j} className="px-4 py-2.5">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
