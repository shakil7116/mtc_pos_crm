import { useState, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, AlertTriangle, Check, X, FileSpreadsheet, Info, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Candidate = { productId: number; name: string; sku: string | null; score: number };

type Row = {
  row: number;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  salePrice: number | null;
  costPrice: number | null;
  wholesalePrice: number | null;
  minStockQty: number | null;
  quantity: number;
  supplierName: string | null;
  supplierId: number | null;
  action: "create" | "update" | "reject";
  matchedProductId: number | null;
  matchedProductName: string | null;
  matchReason: "sku" | "name" | null;
  candidates: Candidate[];
  rejectReason: string | null;
  warnings: string[];
};

type Preview = {
  rows: Row[];
  headers: string[];
  fileWarnings: string[];
  summary: { total: number; create: number; update: number; reject: number; withQty: number };
  stores: { id: number; name: string; type: string }[];
};

/** What the reviewer decided for one row. */
type Choice = { include: boolean; productId: number | null; storeId: string };

export default function ImportProductsCsv({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [storeId, setStoreId] = useState("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<any>(null);

  function reset() {
    setPreview(null); setError(null); setChoices({}); setStoreId("");
    setLoading(false); setApplying(false); setResult(null);
  }

  async function analyse(file: File) {
    reset();
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/products/import/preview", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) { setError(body?.message || "Could not read that file."); return; }
      const p = body as Preview;
      setPreview(p);
      const c: Record<number, Choice> = {};
      p.rows.forEach((r) => {
        c[r.row] = {
          include: r.action !== "reject",
          productId: r.action === "update" ? r.matchedProductId : null,
          storeId: "",
        };
      });
      setChoices(c);
    } catch (e: any) {
      setError(e?.message || "Could not read that file.");
    } finally {
      setLoading(false);
    }
  }

  const set = (row: number, patch: Partial<Choice>) =>
    setChoices((c) => ({ ...c, [row]: { ...c[row], ...patch } }));

  const included = useMemo(
    () => preview?.rows.filter((r) => choices[r.row]?.include) ?? [],
    [preview, choices],
  );
  const qtyRows = included.filter((r) => r.quantity > 0);
  const needsLocation = qtyRows.some((r) => !choices[r.row]?.storeId) && !storeId;

  async function apply() {
    if (!preview) return;
    if (needsLocation) {
      toast({ title: "Choose a location", description: "Some rows carry a quantity and need somewhere to go.", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/products/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeId ? Number(storeId) : null,
          rows: included.map((r) => ({
            row: r.row, name: r.name, sku: r.sku, category: r.category, unit: r.unit,
            salePrice: r.salePrice, costPrice: r.costPrice, wholesalePrice: r.wholesalePrice,
            minStockQty: r.minStockQty, quantity: r.quantity, supplierId: r.supplierId,
            productId: choices[r.row].productId,
            storeId: choices[r.row].storeId ? Number(choices[r.row].storeId) : null,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) { toast({ title: "Could not apply", description: body?.message, variant: "destructive" }); return; }
      setResult(body);
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
    } finally {
      setApplying(false);
    }
  }

  const money = (n: number | null) => (n == null ? "—" : n.toFixed(2));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Import products from CSV
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: choose a file ── */}
        {!preview && !result && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-6 text-center space-y-3">
              <input
                type="file" accept=".csv,.txt" ref={fileRef} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) analyse(f); if (fileRef.current) fileRef.current.value = ""; }}
              />
              <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Choose a CSV file</p>
                <p className="text-[13px] text-muted-foreground">Nothing is saved until you review it on the next screen.</p>
              </div>
              <Button onClick={() => fileRef.current?.click()} disabled={loading} className="gap-2">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Reading…</> : <><Upload className="w-4 h-4" /> Choose file</>}
              </Button>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-[13px] text-sky-900">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p><span className="font-medium">Don't put the location in the file.</span> You pick it here after the preview, against your real store list — a spreadsheet or an AI assistant has no way to spell your store names correctly.</p>
                <p>Columns understood: <code className="font-mono text-[11px]">sku, name, category, unit, sale_price, cost_price, wholesale_price, min_stock_qty, qty, supplier_name</code>. Only <code className="font-mono text-[11px]">name</code> is required; a new product also needs both prices.</p>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13px] text-red-900">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><p>{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: review, set location ── */}
        {preview && !result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Badge variant="outline">{preview.summary.total} rows</Badge>
              <Badge className="bg-emerald-100 text-emerald-800 border-0">{preview.summary.create} new</Badge>
              <Badge className="bg-blue-100 text-blue-800 border-0">{preview.summary.update} existing</Badge>
              {preview.summary.reject > 0 && <Badge className="bg-red-100 text-red-800 border-0">{preview.summary.reject} unusable</Badge>}
              {preview.summary.withQty > 0 && <Badge variant="outline">{preview.summary.withQty} carry stock</Badge>}
            </div>

            {/* Location first — it is the thing the file cannot supply. */}
            <div className={cn(
              "rounded-xl border p-3.5 space-y-2",
              needsLocation ? "border-amber-300 bg-amber-50" : "border-border",
            )}>
              <Label className="text-[13px] font-medium flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> Where does the stock go?
              </Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="h-9 text-[13px] max-w-md"><SelectValue placeholder="Choose a location" /></SelectTrigger>
                <SelectContent>
                  {preview.stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.type === "warehouse" ? " (warehouse)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">
                Applies to every row that carries a quantity. Individual rows can be sent elsewhere below.
                {preview.summary.withQty === 0 && " No row in this file has a quantity, so this is optional."}
              </p>
            </div>

            {!!preview.fileWarnings.length && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900 space-y-0.5">
                {preview.fileWarnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}

            <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
              {preview.rows.map((r) => {
                const c = choices[r.row];
                if (!c) return null;
                const rejected = r.action === "reject";
                return (
                  <div key={r.row} className={cn(
                    "rounded-xl border p-3 space-y-2",
                    !c.include && "opacity-50",
                    rejected ? "border-red-200" : r.action === "update" ? "border-blue-200" : "border-emerald-200",
                  )}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => set(r.row, { include: !c.include })}
                        disabled={rejected}
                        className={cn(
                          "mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0",
                          c.include ? "bg-[#1e2a3a] border-[#1e2a3a] text-white" : "border-border",
                          rejected && "cursor-not-allowed",
                        )}
                      >
                        {c.include ? <Check className="w-3 h-3" /> : null}
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{r.name}</span>
                          {r.sku && <Badge variant="outline" className="text-[10px]">{r.sku}</Badge>}
                          <Badge className={cn(
                            "text-[10px] border-0",
                            rejected ? "bg-red-100 text-red-800"
                              : r.action === "update" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800",
                          )}>
                            {rejected ? "unusable" : r.action === "update" ? `updates ${r.matchedProductName}` : "new product"}
                          </Badge>
                        </div>
                        <p className="text-[12px] text-muted-foreground">
                          cost {money(r.costPrice)} · sells {money(r.salePrice)} · {r.quantity > 0 ? `${r.quantity} ${r.unit || "PCS"}` : "no stock"}
                          {r.category ? ` · ${r.category}` : ""}
                        </p>
                        {rejected && <p className="text-[12px] text-red-700">{r.rejectReason}</p>}
                        {r.warnings.map((w, i) => (
                          <p key={i} className="text-[12px] text-amber-700 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}
                          </p>
                        ))}
                      </div>
                    </div>

                    {!rejected && (
                      <div className="pl-8 grid gap-2 sm:grid-cols-2">
                        {(r.candidates.length > 0 || r.action === "update") && (
                          <Select
                            value={c.productId == null ? "new" : String(c.productId)}
                            onValueChange={(v) => set(r.row, { productId: v === "new" ? null : Number(v) })}
                          >
                            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {r.matchedProductId && (
                                <SelectItem value={String(r.matchedProductId)}>
                                  Update {r.matchedProductName} (matched by {r.matchReason})
                                </SelectItem>
                              )}
                              {r.candidates
                                .filter((x) => x.productId !== r.matchedProductId)
                                .map((x) => (
                                  <SelectItem key={x.productId} value={String(x.productId)}>
                                    Update {x.name} ({Math.round(x.score * 100)}% similar)
                                  </SelectItem>
                                ))}
                              <SelectItem value="new">➕ Create as a new product</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {r.quantity > 0 && (
                          <Select value={c.storeId} onValueChange={(v) => set(r.row, { storeId: v })}>
                            <SelectTrigger className="h-8 text-[12px]">
                              <SelectValue placeholder="Use the location above" />
                            </SelectTrigger>
                            <SelectContent>
                              {preview.stores.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 3: what happened ── */}
        {result && (
          <div className="space-y-4 text-sm max-h-[60vh] overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-100 text-emerald-800 border-0">{result.createdCount} added</Badge>
              <Badge className="bg-blue-100 text-blue-800 border-0">{result.updatedCount} updated</Badge>
              {result.failedCount > 0 && <Badge className="bg-red-100 text-red-800 border-0">{result.failedCount} failed</Badge>}
            </div>

            {!!result.stockAdded?.length && (
              <div className="space-y-1.5">
                <p className="font-medium">Stock received</p>
                <p className="text-xs text-muted-foreground">
                  Quantities were <span className="font-medium text-foreground">added</span> to what was already there.
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left font-medium py-1 pr-3">Product</th>
                        <th className="text-right font-medium py-1 px-2">Was</th>
                        <th className="text-right font-medium py-1 px-2">Added</th>
                        <th className="text-right font-medium py-1 pl-2">Now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.stockAdded.map((m: any, i: number) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="py-1 pr-3">{m.name}</td>
                          <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{m.before}</td>
                          <td className="py-1 px-2 text-right tabular-nums text-emerald-700">+{m.added}</td>
                          <td className="py-1 pl-2 text-right tabular-nums font-medium">{m.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!!result.stockSkipped?.length && (
              <div className="space-y-1">
                <p className="font-medium text-amber-700">Quantities not applied</p>
                {result.stockSkipped.map((m: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">Row {m.row}: {m.name} — {m.qty} not added. {m.reason}</p>
                ))}
              </div>
            )}

            {!!result.failed?.length && (
              <div className="space-y-1">
                <p className="font-medium text-red-700">Failed rows</p>
                {result.failed.map((m: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">Row {m.row}: {m.name} — {m.reason}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {preview && !result && <Button variant="outline" onClick={reset}>Start over</Button>}
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>
            <X className="w-4 h-4 mr-1.5" /> {result ? "Done" : "Cancel"}
          </Button>
          {preview && !result && (
            <Button onClick={apply} disabled={applying || !included.length}>
              {applying
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Applying…</>
                : `Apply ${included.length} row${included.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
