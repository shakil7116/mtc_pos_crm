import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Loader2, Search, X, TriangleAlert, Check } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { hasPack, toBaseQty } from "@shared/unit";

/* ── Stocktake ────────────────────────────────────────────────────────────────
   You type what you COUNTED, not a difference. Someone at a shelf knows "there
   are 47" — not "add 17". Making them subtract in their head is where counting
   mistakes come from.

   The gap between what the system believed and what you found is the variance.
   That is the number worth seeing: it is shrinkage, breakage, or a sale nobody
   recorded, and it is invisible if you only ever post adjustments.
──────────────────────────────────────────────────────────────────────────────*/

type Store = { id: number; nameEn?: string; name_en?: string; name?: string };
type Product = {
  id: number; name: string; sku?: string | null; unit?: string | null;
  category?: string | null; trackStock?: boolean | null;
  packUnit?: string | null; packSize?: number | string | null;
};
type InvRow = { productId: number; storeId: number; qty: string | number };

export default function StockCountDialog({
  open, onClose, stores,
}: { open: boolean; onClose: () => void; stores: Store[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [storeId, setStoreId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});
  // Whole packs counted, kept apart from the loose pieces beside them.
  const [packCounts, setPackCounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"], enabled: open,
  });
  const { data: inventory = [] } = useQuery<InvRow[]>({
    queryKey: ["/api/inventory"], enabled: open,
  });

  const storeName = (s: Store) => s.nameEn || (s as any).name_en || s.name || `Store ${s.id}`;

  // What the system currently believes, for the chosen location only.
  const systemQty = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of inventory) {
      if (String(r.storeId) !== storeId) continue;
      m.set(r.productId, (m.get(r.productId) || 0) + Number(r.qty || 0));
    }
    return m;
  }, [inventory, storeId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) =>
      !q || (p.name || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q));
    // Anything already typed stays visible even if the search moves on, so a
    // half-finished shelf is never silently dropped.
    const typed = products.filter((p) => counts[p.id] !== undefined && !list.includes(p));
    return [...typed, ...list].slice(0, 120);
  }, [products, search, counts]);

  // A row counts as entered if EITHER box was filled — five boxes and no loose
  // pieces is a complete count, not a blank one.
  const entered = Array.from(new Set([
    ...Object.entries(counts).filter(([, v]) => String(v).trim() !== "").map(([id]) => id),
    ...Object.entries(packCounts).filter(([, v]) => String(v).trim() !== "").map(([id]) => id),
  ]));

  const variances = entered.map((id) => {
    const pid = Number(id);
    const p = products.find((x) => x.id === pid);
    const before = p?.trackStock === false ? null : (systemQty.get(pid) || 0);
    const after = p ? countedBase(p) : Number(counts[pid] || 0);
    return { pid, name: p?.name || `#${pid}`, before, after, variance: before === null ? null : after - before };
  });
  const discrepancies = variances.filter((x) => x.variance !== null && Math.abs(x.variance) > 0.0001);

  function reset() {
    setCounts({}); setPackCounts({}); setSearch(""); setResult(null);
  }

  // What a row adds up to, in the unit stock is kept in.
  function countedBase(p: any): number {
    const packs = Number(packCounts[p.id] || 0);
    const loose = Number(counts[p.id] || 0);
    return Number((toBaseQty(packs, p.packUnit, p) + (Number.isFinite(loose) ? loose : 0)).toFixed(4));
  }

  async function submit() {
    if (!storeId) { toast({ title: "Choose a location first", variant: "destructive" }); return; }
    if (!entered.length) { toast({ title: "Nothing counted yet", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/stock-count/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId: Number(storeId),
          counts: entered.map((id) => ({
            productId: Number(id),
            packs: packCounts[Number(id)] ?? null,
            loose: String(counts[Number(id)] ?? "").trim() === "" ? 0 : Number(counts[Number(id)]),
          })),
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.message || "Could not save the count.");
      setResult(body);
      setCounts({});
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      toast({ title: `Counted ${body.counted} item${body.counted === 1 ? "" : "s"}` });
    } catch (e: any) {
      toast({ title: "Count not saved", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck size={18} /> Count stock
          </DialogTitle>
          <DialogDescription>
            Type what you actually counted on the shelf — the total, not the difference.
            Counting an item that was never counted before starts tracking it.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-4 space-y-2">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <Check size={16} /> {result.counted} item{result.counted === 1 ? "" : "s"} counted
              </p>
              {result.discrepancies > 0 ? (
                <p className="text-sm text-amber-700 flex items-start gap-2">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                  <span>
                    {result.discrepancies} item{result.discrepancies === 1 ? "" : "s"} did not match
                    what the system expected (net {result.totalVariance > 0 ? "+" : ""}
                    {result.totalVariance}). That gap is stock that moved without being
                    recorded — worth a look.
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Everything matched what the system expected.
                </p>
              )}
              {result.failed?.length > 0 && (
                <p className="text-sm text-red-600">
                  {result.failed.length} line(s) failed: {result.failed[0]?.reason}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResult(null)}>Count more</Button>
              <Button onClick={() => { reset(); onClose(); }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Location you are counting</Label>
                <Select value={storeId} onValueChange={(v) => { setStoreId(v); setCounts({}); }}>
                  <SelectTrigger><SelectValue placeholder="Choose a location…" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{storeName(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Find the shelf</Label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Name, SKU or category…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={!storeId}
                  />
                </div>
              </div>
            </div>

            {!storeId ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Choose a location to begin. A count is always of one shelf in one place.
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2">Product</th>
                      <th className="py-2 w-24 text-right">System</th>
                      <th className="py-2 w-28 text-right">Counted</th>
                      <th className="py-2 w-24 text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const notCounted = p.trackStock === false;
                      const before = notCounted ? null : (systemQty.get(p.id) || 0);
                      const typed = counts[p.id];
                      const has = String(typed ?? "").trim() !== "";
                      const diff = has && before !== null ? Number(typed) - before : null;
                      return (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">
                            <span className="font-medium">{p.name}</span>
                            {p.sku && <span className="text-xs text-muted-foreground ml-1.5">{p.sku}</span>}
                            {notCounted && (
                              <Badge variant="outline" className="ml-2 text-[10px] font-normal">never counted</Badge>
                            )}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                            {before === null ? "—" : before}
                          </td>
                          <td className="py-1.5 text-right">
                            {/* Nobody counts 127 pieces. They count ten boxes and
                                seven loose, so both boxes are offered. */}
                            <div className="flex items-center gap-1 justify-end">
                              {hasPack(p as any) && (
                                <>
                                  <Input
                                    type="number" min="0" step="any" inputMode="decimal"
                                    className="h-8 w-16 text-right"
                                    placeholder={String(p.packUnit || "BOX").toUpperCase()}
                                    value={packCounts[p.id] ?? ""}
                                    onChange={(e) => setPackCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                                  />
                                  <span className="text-[11px] text-muted-foreground">+</span>
                                </>
                              )}
                              <Input
                                type="number" min="0" step="any" inputMode="decimal"
                                className="h-8 w-24 text-right"
                                placeholder={p.unit || "qty"}
                                value={typed ?? ""}
                                onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                              />
                            </div>
                            {hasPack(p as any) && (packCounts[p.id] || typed) && (
                              <span className="block text-[11px] text-muted-foreground mt-0.5">
                                = {countedBase(p)} {p.unit}
                              </span>
                            )}
                          </td>
                          <td className={cn(
                            "py-1.5 text-right tabular-nums text-xs",
                            diff === null ? "text-muted-foreground"
                              : diff === 0 ? "text-emerald-600"
                              : "text-amber-600 font-semibold",
                          )}>
                            {diff === null ? (has ? "first count" : "") : diff === 0 ? "match" : (diff > 0 ? `+${diff}` : diff)}
                          </td>
                        </tr>
                      );
                    })}
                    {visible.length === 0 && (
                      <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No products match.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <DialogFooter className="border-t pt-3 gap-2 sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {entered.length > 0 ? (
                  <>
                    {entered.length} counted
                    {discrepancies.length > 0 && (
                      <span className="text-amber-600 font-medium ml-2">
                        · {discrepancies.length} do not match
                      </span>
                    )}
                  </>
                ) : "Nothing counted yet"}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>
                  <X size={15} className="mr-1.5" /> Cancel
                </Button>
                <Button onClick={submit} disabled={saving || !entered.length}>
                  {saving ? <><Loader2 size={15} className="mr-1.5 animate-spin" /> Saving…</>
                          : <>Save {entered.length || ""} count{entered.length === 1 ? "" : "s"}</>}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
