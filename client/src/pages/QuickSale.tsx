import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, Plus, Minus, Trash2, Banknote, Loader2, Zap, Printer, RotateCcw, Package, User, WifiOff } from "lucide-react";
import { isOnline, cacheSet, cacheGet, enqueueSale, useOffline } from "@/lib/offline";

/* Quick Sale — one-screen fast retail checkout for walk-in customers.
   Search/scan → add → qty → Cash → done. No customer account; prints a receipt. */

type Product = {
  id: number; sku: string | null; name: string; unit: string | null;
  salePrice: number | string | null; imageUrl?: string | null; active?: boolean;
};
type Line = { productId: number; name: string; sku: string | null; unit: string; price: number; qty: number };

const money = (n: number) => "QAR " + n.toFixed(2);

export default function QuickSale() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [receipt, setReceipt] = useState<{ number: string; total: number; id: number } | null>(null);
  // Customer: defaults to the walk-in "Cash Customer" (null) but can attach an account.
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(null);
  const [custSearch, setCustSearch] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const offlineStatus = useOffline();

  // Products / customers are cached locally so the POS works fully offline.
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/products");
        if (!r.ok) throw new Error("offline");
        const d = await r.json();
        cacheSet("products", d);
        return d;
      } catch { return cacheGet<Product[]>("products") ?? []; }
    },
    initialData: () => cacheGet<Product[]>("products") ?? undefined,
  });
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/customers");
        if (!r.ok) throw new Error("offline");
        const d = await r.json();
        cacheSet("customers", d);
        return d;
      } catch { return cacheGet<any[]>("customers") ?? []; }
    },
    initialData: () => cacheGet<any[]>("customers") ?? undefined,
    staleTime: 30_000,
  });
  const custMatches = (() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return (customers as any[]).slice(0, 8);
    return (customers as any[]).filter((c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)).slice(0, 8);
  })();
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
    staleTime: 60_000,
  });
  // Sell from the user's own store, else the first active store location.
  const storeId = user?.storeId ?? stores.find((s: any) => s.type === "store" && s.active !== false)?.id ?? stores[0]?.id ?? null;

  useEffect(() => { searchRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (products as Product[]).filter((p) => p.active !== false);
    if (!q) return list.slice(0, 40);
    return list.filter((p) => p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)).slice(0, 40);
  }, [products, search]);

  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);

  function addProduct(p: Product) {
    const price = Number(p.salePrice) || 0;
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) { const next = [...c]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next; }
      return [...c, { productId: p.id, name: p.name, sku: p.sku, unit: p.unit || "PCS", price, qty: 1 }];
    });
    setSearch("");
    searchRef.current?.focus();
  }
  function setQty(productId: number, qty: number) {
    setCart((c) => c.map((l) => (l.productId === productId ? { ...l, qty: Math.max(1, qty) } : l)));
  }
  function removeLine(productId: number) {
    setCart((c) => c.filter((l) => l.productId !== productId));
  }

  const sale = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        type: "INV", date: today, customerId: customer?.id ?? null, customerName: customer?.name ?? "Cash Customer",
        storeId, transactionMode: "real", paymentType: "Cash", deliveryMethod: "pickup_store",
        discountType: "QAR", discountAmount: 0, subtotal: total, taxRate: 0, taxAmount: 0, total,
        payments: [{ method: "Cash", amount: total }],
        items: cart.map((l) => ({
          productId: l.productId, sku: l.sku, description: l.name, qty: l.qty, unit: l.unit,
          price: l.price, discountType: "QAR", discountAmount: 0, amount: l.price * l.qty,
        })),
        createdBy: user?.id ?? null,
      };
      // Offline (or the request fails): queue the sale locally — it syncs on reconnect.
      if (!isOnline()) { enqueueSale("/api/documents", payload); return { queued: true }; }
      try {
        const res = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Sale failed");
        return res.json();
      } catch (e) {
        // network dropped mid-request → queue rather than lose the sale
        if (!isOnline()) { enqueueSale("/api/documents", payload); return { queued: true }; }
        throw e;
      }
    },
    onSuccess: (doc: any) => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      setReceipt(doc.queued ? { number: "QUEUED (offline)", total, id: 0 } : { number: doc.number, total, id: doc.id });
      setCart([]);
    },
    onError: (e: any) => toast({ title: "Sale failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  function newSale() { setReceipt(null); setSearch(""); setCart([]); setCustomer(null); setCustSearch(""); searchRef.current?.focus(); }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-6 h-6 text-amber-500" />
        <h1 className="text-2xl font-bold tracking-tight">Quick Sale</h1>
        <span className="text-xs text-muted-foreground ml-auto">
          {stores.find((s: any) => s.id === storeId)?.nameEn ?? "—"} · Cash
        </span>
        {!offlineStatus.online && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
            <WifiOff className="w-3.5 h-3.5" /> Offline{offlineStatus.pending > 0 ? ` · ${offlineStatus.pending} queued` : ""}
          </span>
        )}
      </div>

      {/* Customer — defaults to Cash Customer; searchable select for accounts. */}
      <div className="mb-4 flex items-center gap-2 relative max-w-md">
        <User className="w-4 h-4 text-muted-foreground shrink-0" />
        {customer ? (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-semibold">{customer.name}</span>
            <button onClick={() => { setCustomer(null); setCustSearch(""); }} className="text-xs text-blue-600 hover:underline">change</button>
          </div>
        ) : (
          <div className="flex-1 relative">
            <Input
              value={custSearch}
              onChange={(e) => { setCustSearch(e.target.value); setCustOpen(true); }}
              onFocus={() => setCustOpen(true)}
              onBlur={() => setTimeout(() => setCustOpen(false), 150)}
              placeholder="Cash Customer (search to attach an account…)"
              className="h-9 text-sm"
            />
            {custOpen && custMatches.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {custMatches.map((c: any) => (
                  <button
                    key={c.id}
                    onMouseDown={() => { setCustomer({ id: c.id, name: c.name }); setCustOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/40 flex justify-between"
                  >
                    <span>{c.name}</span>
                    {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Product picker */}
        <div className="lg:col-span-3 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or scan product name / SKU…"
              className="pl-9 h-12 text-base"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="text-left rounded-xl border border-border/50 bg-white p-3 hover:border-amber-400 hover:shadow-sm transition active:scale-95"
              >
                <div className="flex items-center gap-2 mb-1">
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                    : <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                  <span className="font-mono text-[10px] text-muted-foreground truncate">{p.sku || "—"}</span>
                </div>
                <p className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</p>
                <p className="text-sm font-mono font-bold text-amber-600 mt-1">{money(Number(p.salePrice) || 0)}</p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-sm text-muted-foreground py-8">No products match “{search}”.</p>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-border/50 bg-white shadow-sm sticky top-4 flex flex-col max-h-[80vh]">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-bold text-sm">Cart</h2>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-muted-foreground hover:text-red-600">Clear</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y">
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Tap a product to add it.</p>
              ) : cart.map((l) => (
                <div key={l.productId} className="px-4 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{money(l.price)} × {l.qty} {l.unit}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.productId, l.qty - 1)} className="w-7 h-7 rounded border flex items-center justify-center hover:bg-muted"><Minus className="w-3.5 h-3.5" /></button>
                    <input
                      type="number" min={1} value={l.qty}
                      onChange={(e) => setQty(l.productId, parseInt(e.target.value) || 1)}
                      className="w-12 h-7 text-center text-sm border rounded font-mono"
                    />
                    <button onClick={() => setQty(l.productId, l.qty + 1)} className="w-7 h-7 rounded border flex items-center justify-center hover:bg-muted"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="w-20 text-right font-mono font-semibold text-sm">{money(l.price * l.qty)}</span>
                  <button onClick={() => removeLine(l.productId)} className="text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="px-4 py-4 border-t space-y-3">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span className="font-mono text-amber-600">{money(total)}</span>
              </div>
              <Button
                className="w-full h-14 text-base bg-green-600 hover:bg-green-700 text-white gap-2"
                disabled={cart.length === 0 || !storeId || sale.isPending}
                onClick={() => sale.mutate()}
              >
                {sale.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Banknote className="w-5 h-5" />}
                Charge {money(total)} · Cash
              </Button>
              {!storeId && <p className="text-xs text-red-500 text-center">No store location set — add one in Settings.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Receipt overlay */}
      {receipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={newSale}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Banknote className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold">{receipt.id === 0 ? "Sale queued" : "Sale complete"}</h3>
            <p className="text-sm text-muted-foreground mt-1">{receipt.number}</p>
            <p className="font-mono font-bold text-2xl text-amber-600 mt-2">{money(receipt.total)}</p>
            <p className="text-xs text-muted-foreground">{receipt.id === 0 ? "saved offline — syncs automatically when back online" : "paid in cash"}</p>
            <div className="flex gap-2 mt-5">
              {receipt.id !== 0 && (
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => nav(`/documents/${receipt.id}`)}>
                  <Printer className="w-4 h-4" /> Receipt
                </Button>
              )}
              <Button className="flex-1 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" onClick={newSale}>
                <RotateCcw className="w-4 h-4" /> New Sale
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
