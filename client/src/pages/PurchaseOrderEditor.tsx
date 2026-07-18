import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Trash2, PackagePlus, PenLine, Save, Loader2, Search, Truck, ArrowLeft, Send,
} from "lucide-react";

interface Supplier { id: number; name: string; phone?: string; whatsapp?: string; active: boolean; }
interface Product { id: number; sku: string; name: string; category: string; unit: string; costPrice: number; active: boolean; }
interface POItem { id: string; productId?: number; sku: string; description: string; qty: number; unit: string; cost: number; amount: number; }

const UNITS = ["PCS", "BAG", "MTR", "PAIR", "BOX", "ROLL", "SET", "KG", "LTR", "GALLON"];
const uid = () => Math.random().toString(36).slice(2, 10);
const blank = (): POItem => ({ id: uid(), sku: "", description: "", qty: 1, unit: "PCS", cost: 0, amount: 0 });

export default function PurchaseOrderEditor() {
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [date] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [items, setItems] = useState<POItem[]>([blank()]);
  const [notes, setNotes] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => fetch("/api/suppliers").then((r) => r.json()),
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  const supplier = suppliers.find((s) => String(s.id) === supplierId);
  const total = items.reduce((s, i) => s + i.amount, 0);

  const setItem = (id: string, patch: Partial<POItem>) =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const u = { ...it, ...patch };
        u.amount = u.qty * u.cost;
        return u;
      }),
    );

  const addProduct = (p: Product) => {
    setItems((prev) => [
      ...prev.filter((i) => i.description.trim()),
      { id: uid(), productId: p.id, sku: p.sku, description: p.name, qty: 1, unit: p.unit || "PCS", cost: p.costPrice, amount: p.costPrice },
    ]);
    setPickerOpen(false);
    setSearch("");
  };

  const filtered = useMemo(
    () => products.filter((p) => p.active && (p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))),
    [products, search],
  );

  const save = useMutation({
    mutationFn: async (status: "draft" | "sent") => {
      if (!supplier) throw new Error("Select a supplier");
      const valid = items.filter((i) => i.description.trim());
      if (!valid.length) throw new Error("Add at least one line item");
      const payload = {
        type: "PO",
        date,
        expectedDate: expectedDate || null,
        supplierId: supplier.id,
        customerName: supplier.name, // reuse name field so list/detail show the party
        status,
        subtotal: total,
        taxRate: 0,
        taxAmount: 0,
        total,
        notes,
        createdBy: user?.id ?? null,
        items: valid.map((i) => ({
          productId: i.productId ?? null,
          sku: i.sku,
          description: i.description,
          qty: i.qty,
          unit: i.unit,
          price: i.cost,
          discountType: "QAR",
          discountAmount: 0,
          amount: i.amount,
        })),
      };
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Failed to save PO");
      return res.json();
    },
    onSuccess: (data, status) => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: status === "sent" ? "Purchase Order sent" : "Draft saved", description: data.number });
      nav(`/documents/${data.id}`);
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function sendWhatsApp() {
    if (!supplier?.whatsapp && !supplier?.phone) { toast({ title: "Supplier has no phone/WhatsApp", variant: "destructive" }); return; }
    const lines = items.filter((i) => i.description.trim()).map((i, n) => `${n + 1}. ${i.description} — ${i.qty} ${i.unit}`).join("\n");
    const msg = `*Purchase Order — Mamun M Trading*\nSupplier: ${supplier.name}\nExpected: ${expectedDate || "ASAP"}\n\n${lines}\n\nPlease confirm availability & pricing.\n+974 30703722`;
    const num = (supplier.whatsapp || supplier.phone || "").replace(/\D/g, "");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/documents")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="w-6 h-6 text-[#d4a017]" /> New Purchase Order
            </h1>
            <p className="text-sm text-muted-foreground">PO-###### · procurement to supplier</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Supplier + dates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.filter((s) => s.active).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Order date</Label>
                <Input type="date" value={date} readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label>Expected delivery</Label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="font-semibold text-base">Order Items</h3>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                    <PackagePlus size={15} className="mr-1.5" /> From Products
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setItems((p) => [...p, blank()])}>
                    <PenLine size={15} className="mr-1.5" /> Manual
                  </Button>
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-2">Material / SKU</th>
                      <th className="text-center py-2 px-2 w-20">Qty</th>
                      <th className="text-center py-2 px-2 w-24">Unit</th>
                      <th className="text-right py-2 px-2 w-28">Unit Cost</th>
                      <th className="text-right py-2 px-2 w-28">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b last:border-0 group">
                        <td className="py-2 px-2 align-top">
                          <Input value={it.description} onChange={(e) => setItem(it.id, { description: e.target.value })} placeholder="Material" className="mb-1" />
                          <Input value={it.sku} onChange={(e) => setItem(it.id, { sku: e.target.value })} placeholder="SKU (optional)" className="h-7 text-xs" />
                        </td>
                        <td className="py-2 px-2 align-top">
                          <Input type="number" min={0} value={it.qty || ""} onChange={(e) => setItem(it.id, { qty: Number(e.target.value) || 0 })} className="text-center" />
                        </td>
                        <td className="py-2 px-2 align-top">
                          <Select value={it.unit} onValueChange={(v) => setItem(it.id, { unit: v })}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-2 align-top">
                          <Input type="number" min={0} value={it.cost || ""} onChange={(e) => setItem(it.id, { cost: Number(e.target.value) || 0 })} className="text-right font-mono" />
                        </td>
                        <td className="py-2 px-2 align-top text-right font-mono font-semibold pt-4">{it.amount.toFixed(2)}</td>
                        <td className="py-2 align-top pt-3.5">
                          <button onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {items.map((it, idx) => (
                  <div key={it.id} className="border rounded-lg p-3 space-y-3 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Item #{idx + 1}</span>
                      <button onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={15} /></button>
                    </div>
                    <Input value={it.description} onChange={(e) => setItem(it.id, { description: e.target.value })} placeholder="Material" />
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Qty</Label><Input type="number" min={0} value={it.qty || ""} onChange={(e) => setItem(it.id, { qty: Number(e.target.value) || 0 })} className="mt-1" /></div>
                      <div><Label className="text-xs">Unit Cost</Label><Input type="number" min={0} value={it.cost || ""} onChange={(e) => setItem(it.id, { cost: Number(e.target.value) || 0 })} className="mt-1 text-right font-mono" /></div>
                    </div>
                    <div className="text-right font-mono font-semibold">QAR {it.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Total + notes */}
            <div className="flex justify-end">
              <div className="w-full sm:w-72 flex justify-between items-baseline">
                <span className="font-semibold">Total Order Value</span>
                <span className="text-xl font-bold font-mono">QAR {total.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes / terms</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery terms, payment terms…" rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 justify-end">
          <Button variant="outline" onClick={sendWhatsApp} disabled={!supplier}>
            <Send size={16} className="mr-2" /> WhatsApp Supplier
          </Button>
          <Button variant="outline" onClick={() => save.mutate("draft")} disabled={save.isPending}>
            {save.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            Save Draft
          </Button>
          <Button className="bg-[#1e2a3a] text-white min-w-36" onClick={() => save.mutate("sent")} disabled={save.isPending}>
            {save.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Truck size={16} className="mr-2" />}
            Issue PO
          </Button>
        </div>
      </div>

      {/* Product picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Select Materials</DialogTitle></DialogHeader>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="overflow-y-auto flex-1 space-y-1">
            {filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">No products found.</div>
            ) : filtered.map((p) => (
              <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-3 rounded-lg hover:bg-muted transition flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">SKU {p.sku} · {p.category} · {p.unit}</div>
                </div>
                <div className="text-right font-mono text-sm">cost QAR {Number(p.costPrice).toFixed(2)}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
