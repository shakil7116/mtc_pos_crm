import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, Loader2, Plus, Trash2, Check, Search, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/* ── Goods receipt ────────────────────────────────────────────────────────────
   A delivery that arrives without a purchase order — which is most of them.

   The formal route is create PO -> mark sent -> receive. Three steps for
   something that happens every morning does not get done, and the moment it
   stops being done the counted stock drifts and the counting was wasted.

   Underneath this still creates and receives a real purchase order, so the
   supplier ledger, payment terms and stock audit are exactly the same.
──────────────────────────────────────────────────────────────────────────────*/

type Store = { id: number; nameEn?: string; name_en?: string; name?: string };
type Supplier = { id: number; name: string; company?: string | null };
type Product = {
  id: number; name: string; sku?: string | null; unit?: string | null;
  costPrice?: string | number | null; salePrice?: string | number | null;
};

type Line = {
  key: string;
  productId: number | null;
  name: string;
  unit: string;
  qty: string;
  cost: string;
  isNew: boolean;
};

const blankLine = (): Line => ({
  key: Math.random().toString(36).slice(2),
  productId: null, name: "", unit: "PCS", qty: "", cost: "", isNew: false,
});

export default function GoodsReceiptDialog({
  open, onClose, stores, suppliers,
}: { open: boolean; onClose: () => void; stores: Store[]; suppliers: Supplier[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [supplierId, setSupplierId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [terms, setTerms] = useState("0");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"], enabled: open,
  });

  const storeName = (s: Store) => s.nameEn || (s as any).name_en || s.name || `Store ${s.id}`;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) =>
      (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [products, search]);

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function choose(key: string, p: Product) {
    setLine(key, {
      productId: p.id, name: p.name, unit: p.unit || "PCS",
      cost: p.costPrice != null ? String(p.costPrice) : "", isNew: false,
    });
    setPicking(null); setSearch("");
  }

  function useTypedName(key: string) {
    // Not in the catalogue — the receipt will create it.
    setLine(key, { productId: null, isNew: true, name: search.trim().toUpperCase() });
    setPicking(null); setSearch("");
  }

  const valid = lines.filter((l) => l.name.trim() && Number(l.qty) > 0);
  const total = valid.reduce((s, l) => s + Number(l.qty) * (Number(l.cost) || 0), 0);

  function reset() {
    setSupplierId(""); setStoreId(""); setInvoiceNo(""); setTerms("0");
    setLines([blankLine()]); setPicking(null); setSearch(""); setResult(null);
  }

  async function submit() {
    if (!supplierId) { toast({ title: "Choose the supplier", variant: "destructive" }); return; }
    if (!storeId) { toast({ title: "Choose where the stock is going", variant: "destructive" }); return; }
    if (!valid.length) { toast({ title: "Add at least one line with a quantity", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/goods-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          supplierId: Number(supplierId),
          storeId: Number(storeId),
          supplierInvoiceNumber: invoiceNo.trim() || undefined,
          paymentTermsDays: Number(terms) || 0,
          items: valid.map((l) => ({
            productId: l.productId ?? undefined,
            name: l.name.trim(),
            unit: l.unit || "PCS",
            qty: Number(l.qty),
            cost: l.cost === "" ? undefined : Number(l.cost),
          })),
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.message || "Could not record the delivery.");
      setResult(body);
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/supplier-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      toast({ title: "Delivery recorded", description: body.poNumber });
    } catch (e: any) {
      toast({ title: "Not recorded", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck size={18} /> Record a delivery</DialogTitle>
          <DialogDescription>
            Goods that arrived from a supplier. Stock goes up, the cost is updated to
            what you actually paid, and what you owe is recorded.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <Check size={16} /> Recorded as {result.poNumber}
              </p>
              <p>{result.received?.length} line(s) received · total QAR {Number(result.totalValue).toFixed(2)}</p>
              {result.productsCreated?.length > 0 && (
                <p className="text-muted-foreground">
                  {result.productsCreated.length} new product(s) added to the catalogue:{" "}
                  {result.productsCreated.map((p: any) => p.name).join(", ")}
                </p>
              )}
              {result.costsUpdated?.length > 0 && (
                <div className="text-amber-700">
                  <p className="font-medium">Cost changed on {result.costsUpdated.length} item(s):</p>
                  <ul className="list-disc ml-5">
                    {result.costsUpdated.map((c: any) => (
                      <li key={c.id}>{c.name}: {Number(c.from).toFixed(2)} → {Number(c.to).toFixed(2)}</li>
                    ))}
                  </ul>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Sales you already made keep their old cost, so past profit does not change.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); }}>Record another</Button>
              <Button onClick={() => { reset(); onClose(); }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Who delivered?" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}{s.company ? ` — ${s.company}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Goes to</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger><SelectValue placeholder="Which location?" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{storeName(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Supplier invoice no. <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="e.g. 40231" />
              </div>
              <div className="space-y-1.5">
                <Label>Payment terms (days)</Label>
                <Input type="number" min="0" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="0 = paid now" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-2 space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="rounded-lg border p-2.5 space-y-2">
                  {picking === l.key ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoFocus className="pl-9" placeholder="Search the catalogue, or type a new name…"
                          value={search} onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto border rounded-md divide-y">
                        {matches.map((p) => (
                          <button
                            key={p.id} type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                            onClick={() => choose(l.key, p)}
                          >
                            {p.name}
                            {p.sku && <span className="text-xs text-muted-foreground ml-2">{p.sku}</span>}
                          </button>
                        ))}
                        {search.trim() && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-emerald-700 font-medium"
                            onClick={() => useTypedName(l.key)}
                          >
                            <Plus size={13} className="inline mr-1.5" />
                            Add "{search.trim().toUpperCase()}" as a new product
                          </button>
                        )}
                        {!matches.length && !search.trim() && (
                          <p className="px-3 py-4 text-sm text-muted-foreground">Start typing to search.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem_6rem_2rem] sm:items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Item</Label>
                        <button
                          type="button"
                          onClick={() => { setPicking(l.key); setSearch(""); }}
                          className="w-full h-9 px-3 rounded-md border text-sm text-left truncate hover:bg-muted"
                        >
                          {l.name || <span className="text-muted-foreground">Choose or type…</span>}
                          {l.isNew && <Badge variant="outline" className="ml-2 text-[10px]">new</Badge>}
                        </button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <Input className="h-9" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value.toUpperCase() })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Quantity</Label>
                        <Input className="h-9 text-right" type="number" min="0" step="any" inputMode="decimal"
                          value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cost each</Label>
                        <Input className="h-9 text-right" type="number" min="0" step="any" inputMode="decimal"
                          value={l.cost} onChange={(e) => setLine(l.key, { cost: e.target.value })} />
                      </div>
                      <Button
                        variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                        onClick={() => setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((x) => x.key !== l.key)))}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                <Plus size={14} className="mr-1.5" /> Add another item
              </Button>

              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-1">
                <Info size={13} className="mt-0.5 shrink-0" />
                Entering a cost here updates that product's standing cost. Sales you have
                already made keep the cost they were sold at, so past profit never changes.
              </p>
            </div>

            <DialogFooter className="border-t pt-3 gap-2 sm:justify-between">
              <div className="text-sm">
                {valid.length ? (
                  <>{valid.length} line(s) · <span className="font-semibold">QAR {total.toFixed(2)}</span></>
                ) : <span className="text-muted-foreground">Nothing added yet</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>Cancel</Button>
                <Button onClick={submit} disabled={saving || !valid.length}>
                  {saving ? <><Loader2 size={15} className="mr-1.5 animate-spin" /> Saving…</> : "Record delivery"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
