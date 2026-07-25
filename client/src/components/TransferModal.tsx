import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ArrowRight, AlertTriangle } from "lucide-react";

type Store = { id: number; nameEn: string; type: string; ownerStoreId?: number | null; active?: boolean | null };
type Product = { id: number; name: string; sku?: string | null; unit?: string | null; costPrice?: number | string | null };
type TLine = { productId: number; name: string; sku: string | null; unit: string; qty: number; cost: number; max?: number };

// Ownership group — same as the server: store owns itself; warehouse belongs to its
// owner store (null = common). Same group → free move; different → cost value.
const groupKey = (s?: Store) =>
  !s ? "?" : s.type === "warehouse" ? (s.ownerStoreId != null ? `s:${s.ownerStoreId}` : "common") : `s:${s.id}`;

const money = (n: number) => "QAR " + (Number(n) || 0).toFixed(2);

export default function TransferModal({
  open, onClose, stores, products, prefill, editTransfer, reverseTransfer,
}: {
  open: boolean;
  onClose: () => void;
  stores: Store[];
  products: Product[];
  prefill?: { productId?: number; fromStoreId?: number };
  editTransfer?: any;      // draft being re-edited → PUT
  reverseTransfer?: any;   // received transfer being returned → seed reversed, POST new
}) {
  const isEdit = !!editTransfer;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [fromStoreId, setFromStoreId] = useState<string>("");
  const [toStoreId, setToStoreId] = useState<string>("");
  const [takenBy, setTakenBy] = useState("");
  const [lines, setLines] = useState<TLine[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const activeStores = stores.filter((s) => s.active !== false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    const seedFromItems = (src: any, fromId: number, toId: number, capToOriginal: boolean) => {
      setFromStoreId(String(fromId));
      setToStoreId(String(toId));
      setTakenBy(isEdit ? (src.takenBy || "") : "");
      setLines((src.items || []).map((it: any) => {
        const p = products.find((x) => x.id === it.productId);
        const origQty = Number(it.qty) || 1;
        // On a return, a line can never exceed what was originally transferred.
        return { productId: it.productId, name: it.description || p?.name || "", sku: it.sku ?? p?.sku ?? null, unit: it.unit || p?.unit || "PCS", qty: origQty, cost: Number(p?.costPrice) || Number(it.price) || 0, max: capToOriginal ? origQty : undefined };
      }));
    };
    if (editTransfer) { seedFromItems(editTransfer, editTransfer.storeId, editTransfer.toStoreId, false); return; }
    if (reverseTransfer) { seedFromItems(reverseTransfer, reverseTransfer.toStoreId, reverseTransfer.storeId, true); return; } // reversed, capped
    setFromStoreId(prefill?.fromStoreId ? String(prefill.fromStoreId) : "");
    setToStoreId("");
    setTakenBy("");
    const p = prefill?.productId ? products.find((x) => x.id === prefill.productId) : null;
    setLines(p ? [{ productId: p.id, name: p.name, sku: p.sku ?? null, unit: p.unit || "PCS", qty: 1, cost: Number(p.costPrice) || 0 }] : []);
  }, [open, prefill, editTransfer, reverseTransfer, products, isEdit]);

  const from = activeStores.find((s) => s.id === Number(fromStoreId));
  const to = activeStores.find((s) => s.id === Number(toStoreId));
  const crossOwner = !!from && !!to && groupKey(from) !== groupKey(to);
  const totalCost = useMemo(() => (crossOwner ? lines.reduce((s, l) => s + l.qty * l.cost, 0) : 0), [crossOwner, lines]);

  const addLine = (pid: number) => {
    const p = products.find((x) => x.id === pid);
    if (!p || lines.some((l) => l.productId === pid)) return;
    setLines((prev) => [...prev, { productId: p.id, name: p.name, sku: p.sku ?? null, unit: p.unit || "PCS", qty: 1, cost: Number(p.costPrice) || 0 }]);
  };
  const setQty = (pid: number, qty: number) => setLines((prev) => prev.map((l) => (l.productId === pid ? { ...l, qty: Math.max(1, l.max != null ? Math.min(qty, l.max) : qty) } : l)));
  const removeLine = (pid: number) => setLines((prev) => prev.filter((l) => l.productId !== pid));

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {
        date: new Date().toISOString().slice(0, 10),
        fromStoreId: Number(fromStoreId), toStoreId: Number(toStoreId), takenBy: takenBy.trim() || null,
        items: lines.map((l) => ({ productId: l.productId, sku: l.sku, description: l.name, qty: l.qty, unit: l.unit })),
      };
      if (reverseTransfer) { body.linkedDocId = reverseTransfer.id; body.notes = `Return against ${reverseTransfer.number}`; }
      const url = isEdit ? `/api/transfers/${editTransfer.id}` : "/api/transfers";
      const r = await fetch(url, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Transfer failed");
      return r.json();
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/transfers"] });
      qc.invalidateQueries({ queryKey: ["/api/transfers/settlement"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: isEdit ? "Transfer updated" : `Transfer ${d.number} created`, description: isEdit ? "" : "Draft — awaiting approval." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Transfer failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const submit = () => {
    if (!fromStoreId) { setErr("Pick a source location."); return; }
    if (!toStoreId) { setErr("Pick a destination location."); return; }
    if (fromStoreId === toStoreId) { setErr("Source and destination must differ."); return; }
    if (lines.length === 0) { setErr("Add at least one product."); return; }
    setErr(null);
    save.mutate();
  };

  const StoreSelect = ({ value, onChange, exclude }: { value: string; onChange: (v: string) => void; exclude?: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9"><SelectValue placeholder="Select location" /></SelectTrigger>
      <SelectContent>
        {activeStores.filter((s) => String(s.id) !== exclude).map((s) => (
          <SelectItem key={s.id} value={String(s.id)}>{s.nameEn} · {s.type === "warehouse" ? "Warehouse" : "Store"}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRight className="w-5 h-5 text-[#d4a017]" /> {isEdit ? "Edit Transfer" : reverseTransfer ? "Return / Reverse Transfer" : "Stock Transfer"}</DialogTitle></DialogHeader>
        {reverseTransfer && <p className="text-[11px] text-muted-foreground -mt-2 px-1">Returning against {reverseTransfer.number}. Set the qty going back — the settlement nets it against the original.</p>}
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs">From <span className="text-destructive">*</span></Label><StoreSelect value={fromStoreId} onChange={setFromStoreId} exclude={toStoreId} /></div>
            <div><Label className="text-xs">To <span className="text-destructive">*</span></Label><StoreSelect value={toStoreId} onChange={setToStoreId} exclude={fromStoreId} /></div>
          </div>

          {from && to && (
            <div className={crossOwner ? "text-[12px] bg-amber-50 border border-amber-300 text-amber-800 rounded p-2 flex items-start gap-1.5" : "text-[12px] bg-green-50 border border-green-200 text-green-700 rounded p-2"}>
              {crossOwner ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : null}
              <span>{crossOwner
                ? `Cross-owner transfer — valued at COST. Destination will owe ${money(totalCost)} (settled month-end).`
                : "Same owner — free stock move, no money. Tracks pickup + qty only."}</span>
            </div>
          )}

          <div>
            <Label className="text-xs">Taken by</Label>
            <Input value={takenBy} onChange={(e) => setTakenBy(e.target.value)} placeholder="Who picked up the goods" className="h-9" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Items <span className="text-destructive">*</span></Label>
              <Select value="" onValueChange={(v) => addLine(Number(v))}>
                <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="+ Add product" /></SelectTrigger>
                <SelectContent>
                  {products.filter((p) => !lines.some((l) => l.productId === p.id)).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border divide-y">
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Add products to transfer.</p>
              ) : lines.map((l) => (
                <div key={l.productId} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-[11px] text-muted-foreground">{l.sku || "—"} · {l.unit}{crossOwner ? ` · cost ${money(l.cost)}` : ""}{l.max != null ? ` · max ${l.max}` : ""}</p>
                  </div>
                  <Input type="number" min={1} max={l.max} value={l.qty} onChange={(e) => setQty(l.productId, parseInt(e.target.value) || 1)} className="h-8 w-20 text-sm font-mono" />
                  {crossOwner && <span className="w-24 text-right text-sm font-mono">{money(l.qty * l.cost)}</span>}
                  <button onClick={() => removeLine(l.productId)} className="text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            {crossOwner && lines.length > 0 && (
              <div className="flex justify-between mt-1.5 text-sm font-semibold px-1"><span>Total (at cost)</span><span className="font-mono text-amber-700">{money(totalCost)}</span></div>
            )}
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} className="bg-[#1e2a3a] text-white gap-2">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {isEdit ? "Save Changes" : reverseTransfer ? "Create Return" : "Create Transfer Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
