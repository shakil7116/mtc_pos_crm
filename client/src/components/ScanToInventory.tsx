import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, AlertTriangle, Check, X, ScanLine, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Candidate = { productId: number; name: string; sku: string | null; score: number; reason: string };

type ScanRow = {
  row: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number | null;
  basis: string;
  raw: string;
  warnings: string[];
  match: { decision: "auto" | "review" | "none"; productId: number | null; candidates: Candidate[] };
};

type ScanResult = {
  source: string;
  provider: string | null;
  method: string;
  warnings: string[];
  skipped: { row: number; raw: string; reason: string }[];
  rows: ScanRow[];
  summary: { total: number; matched: number; review: number; unknown: number; withWarnings: number };
};

/** Per-row decision the reviewer makes before anything is written. */
type Decision = {
  include: boolean;
  /** null = create a new product. */
  productId: number | null;
  rememberAlias: boolean;
  updateCost: boolean;
  /** Selling price for a row that creates a new product. Blank = sell at cost. */
  salePrice: string;
};

export default function ScanToInventory({
  open, onClose, stores, suppliers,
}: {
  open: boolean;
  onClose: () => void;
  stores: { id: number; nameEn: string }[];
  suppliers: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [storeId, setStoreId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [addStock, setAddStock] = useState(true);
  const [markup, setMarkup] = useState("30");
  const [committing, setCommitting] = useState(false);

  const { data: status } = useQuery<any>({
    queryKey: ["/api/inventory/scan/status"],
    queryFn: () => fetch("/api/inventory/scan/status").then((r) => r.json()),
    enabled: open,
  });

  function reset() {
    setResult(null); setError(null); setDecisions({}); setScanning(false); setCommitting(false);
  }

  async function runScan(file: File) {
    reset();
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/inventory/scan", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) { setError(body?.message || "Could not read that file."); return; }

      const scan = body as ScanResult;
      setResult(scan);
      // Default every row to what the matcher decided. A confident match is
      // pre-linked; anything less starts unlinked so it cannot slip through.
      const d: Record<number, Decision> = {};
      scan.rows.forEach((r) => {
        d[r.row] = {
          include: true,
          productId: r.match.decision === "auto" ? r.match.productId : null,
          rememberAlias: false,
          updateCost: false,
          // A new product priced at cost sells for no profit, so seed a sale
          // price from the default markup rather than leaving it to default.
          salePrice: r.unitPrice > 0 ? (r.unitPrice * 1.3).toFixed(2) : "",
        };
      });
      setDecisions(d);
    } catch (e: any) {
      setError(e?.message || "Could not read that file.");
    } finally {
      setScanning(false);
    }
  }

  const set = (row: number, patch: Partial<Decision>) =>
    setDecisions((d) => ({ ...d, [row]: { ...d[row], ...patch } }));

  /** Re-price every new-product row from the markup box. */
  function applyMarkup() {
    const pct = Number(markup);
    if (!Number.isFinite(pct) || pct < 0 || !result) return;
    setDecisions((d) => {
      const next = { ...d };
      for (const r of result.rows) {
        if (next[r.row] && next[r.row].productId == null && r.unitPrice > 0) {
          next[r.row] = { ...next[r.row], salePrice: (r.unitPrice * (1 + pct / 100)).toFixed(2) };
        }
      }
      return next;
    });
  }

  const included = result?.rows.filter((r) => decisions[r.row]?.include) ?? [];
  const willCreate = included.filter((r) => decisions[r.row]?.productId == null);
  const blockedNew = willCreate.filter((r) => !(r.unitPrice > 0));

  async function commit() {
    if (!result) return;
    if (addStock && !storeId) { toast({ title: "Choose a location first", variant: "destructive" }); return; }
    if (blockedNew.length) {
      toast({
        title: "Some new products have no cost price",
        description: `${blockedNew.length} row(s) would be created with a zero cost. Set a price or untick them.`,
        variant: "destructive",
      });
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/inventory/scan/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeId ? Number(storeId) : null,
          supplierId: supplierId ? Number(supplierId) : null,
          addStock,
          rows: included.map((r) => ({
            description: r.description,
            quantity: r.quantity,
            unit: r.unit,
            unitPrice: r.unitPrice,
            productId: decisions[r.row].productId,
            salePrice: decisions[r.row].salePrice,
            rememberAlias: decisions[r.row].rememberAlias,
            updateCost: decisions[r.row].updateCost,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) { toast({ title: "Could not apply", description: body?.message, variant: "destructive" }); return; }

      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      toast({
        title: "Applied",
        description: `${body.createdCount} new product(s), ${body.linkedCount} linked${body.failedCount ? `, ${body.failedCount} failed` : ""}.`,
        variant: body.failedCount ? "destructive" : undefined,
      });
      if (!body.failedCount) { reset(); onClose(); }
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" /> Scan invoice into inventory
          </DialogTitle>
        </DialogHeader>

        {!result && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-6 text-center space-y-3">
              <input
                type="file"
                accept=".csv,.txt,.tsv,.pdf,.png,.jpg,.jpeg,.webp"
                ref={fileRef}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) runScan(f); if (fileRef.current) fileRef.current.value = ""; }}
              />
              <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Upload a supplier invoice</p>
                <p className="text-[13px] text-muted-foreground">CSV, TXT or a text-based PDF — images need an OCR key.</p>
              </div>
              <Button onClick={() => fileRef.current?.click()} disabled={scanning} className="gap-2">
                {scanning ? <><Loader2 className="w-4 h-4 animate-spin" /> Reading…</> : <><Upload className="w-4 h-4" /> Choose file</>}
              </Button>
            </div>

            {status && (
              <div className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3.5 text-[13px]",
                status.imageExtraction ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900",
              )}>
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  {status.imageExtraction
                    ? <p><span className="font-medium">Images enabled</span> via {status.activeProvider?.label}. CSV, text and text-based PDFs are read without it.</p>
                    : <p><span className="font-medium">CSV, TXT and text-based PDFs work now.</span> Photos and scanned PDFs need a key — add any one of these to <code className="font-mono">.env</code>:</p>}
                  {!status.imageExtraction && (
                    <ul className="space-y-0.5 mt-1">
                      {status.providers?.map((p: any) => (
                        <li key={p.id}><code className="font-mono">{p.keyVar}</code> — {p.note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13px] text-red-900">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Badge variant="outline">{result.summary.total} rows read</Badge>
              <Badge className="bg-emerald-100 text-emerald-800 border-0">{result.summary.matched} matched</Badge>
              {result.summary.review > 0 && <Badge className="bg-amber-100 text-amber-800 border-0">{result.summary.review} need a choice</Badge>}
              {result.summary.unknown > 0 && <Badge className="bg-sky-100 text-sky-800 border-0">{result.summary.unknown} new</Badge>}
              <span className="text-muted-foreground">
                via {result.source === "vision" ? `${result.provider} transcription` : result.source.replace(/-/g, " ")} · {result.method}
              </span>
            </div>

            {!!result.warnings.length && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900 space-y-0.5">
                {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}

            <div className="max-h-[46vh] overflow-y-auto space-y-2 pr-1">
              {result.rows.map((r) => {
                const d = decisions[r.row];
                if (!d) return null;
                const isNew = d.productId == null;
                const chosen = r.match.candidates.find((c) => c.productId === d.productId);
                return (
                  <div key={r.row} className={cn(
                    "rounded-xl border p-3 space-y-2.5",
                    !d.include && "opacity-50",
                    r.match.decision === "auto" ? "border-emerald-200" : r.match.decision === "review" ? "border-amber-200" : "border-border",
                  )}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => set(r.row, { include: !d.include })}
                        className={cn(
                          "mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0",
                          d.include ? "bg-[#1e2a3a] border-[#1e2a3a] text-white" : "border-border",
                        )}
                        aria-label={d.include ? "Exclude this row" : "Include this row"}
                      >
                        {d.include ? <Check className="w-3 h-3" /> : null}
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium">{r.description}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {r.quantity} {r.unit} @ {r.unitPrice.toFixed(2)}
                          {r.lineTotal != null && ` = ${r.lineTotal.toFixed(2)}`}
                          <span className="ml-2 opacity-60">read as {r.basis}</span>
                        </p>
                        {r.warnings.map((w, i) => (
                          <p key={i} className="text-[12px] text-amber-700 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}
                          </p>
                        ))}
                      </div>
                    </div>

                    <div className="pl-8 space-y-2">
                      <Select
                        value={d.productId == null ? "new" : String(d.productId)}
                        onValueChange={(v) => set(r.row, { productId: v === "new" ? null : Number(v), rememberAlias: false })}
                      >
                        <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {r.match.candidates.map((c) => (
                            <SelectItem key={c.productId} value={String(c.productId)}>
                              {c.name}{c.sku ? ` · ${c.sku}` : ""} — {c.reason === "fuzzy" ? `${Math.round(c.score * 100)}% similar` : c.reason}
                            </SelectItem>
                          ))}
                          <SelectItem value="new">➕ Create as a new product</SelectItem>
                        </SelectContent>
                      </Select>

                      {isNew && !(r.unitPrice > 0) && (
                        <p className="text-[12px] text-red-700">
                          A new product needs a cost price above zero — this row has none. Untick it, or link it to an existing product.
                        </p>
                      )}

                      {isNew && r.unitPrice > 0 && (
                        <div className="flex items-center gap-2">
                          <Label className="text-[12px] whitespace-nowrap">Sell at</Label>
                          <Input
                            value={d.salePrice}
                            onChange={(e) => set(r.row, { salePrice: e.target.value })}
                            placeholder={r.unitPrice.toFixed(2)}
                            className="h-8 w-28 text-[13px]"
                            inputMode="decimal"
                          />
                          <span className="text-[12px] text-muted-foreground">
                            {Number(d.salePrice) > r.unitPrice
                              ? `${(((Number(d.salePrice) - r.unitPrice) / r.unitPrice) * 100).toFixed(0)}% margin`
                              : "sells at cost — no profit"}
                          </span>
                        </div>
                      )}

                      {!isNew && chosen && chosen.name.toUpperCase() !== r.description.toUpperCase() && (
                        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <Switch checked={d.rememberAlias} onCheckedChange={(v) => set(r.row, { rememberAlias: v })} />
                          Remember “{r.description}” as another name for {chosen.name}
                        </label>
                      )}

                      {!isNew && r.unitPrice > 0 && (
                        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <Switch checked={d.updateCost} onCheckedChange={(v) => set(r.row, { updateCost: v })} />
                          Update the stored cost price to {r.unitPrice.toFixed(2)}
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!!result.skipped.length && (
              <div className="rounded-xl border border-border p-3 text-[12px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{result.skipped.length} line(s) could not be read</p>
                {result.skipped.slice(0, 5).map((s, i) => (
                  <p key={i} className="truncate">“{s.raw.trim()}” — {s.reason}</p>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3 border-t border-border pt-3">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Receive stock into</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Choose location" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Supplier (for new products)</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Stock</Label>
                <label className="flex items-center gap-2 h-9 text-[13px]">
                  <Switch checked={addStock} onCheckedChange={setAddStock} />
                  Add the quantities
                </label>
              </div>
              {willCreate.length > 0 && (
                <div className="space-y-1.5 sm:col-span-3">
                  <Label className="text-[12px]">Markup for the {willCreate.length} new product(s)</Label>
                  <div className="flex items-center gap-2">
                    <Input value={markup} onChange={(e) => setMarkup(e.target.value)} className="h-9 w-24 text-[13px]" inputMode="decimal" />
                    <span className="text-[13px] text-muted-foreground">%</span>
                    <Button variant="outline" size="sm" onClick={applyMarkup}>Apply to all new</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {result && <Button variant="outline" onClick={reset}>Start over</Button>}
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>
            <X className="w-4 h-4 mr-1.5" /> Cancel
          </Button>
          {result && (
            <Button onClick={commit} disabled={committing || !included.length}>
              {committing
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Applying…</>
                : `Apply ${included.length} row${included.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
