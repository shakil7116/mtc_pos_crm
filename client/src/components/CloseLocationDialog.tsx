import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Lock, Loader2, AlertTriangle, ArrowRight, CheckCircle2, PackageX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── Closing a store or a warehouse ───────────────────────────────────────────
   The owner's own question: when a place closes, the stock has to be moved —
   and about 30% of what the system says is there cannot be found.

   Switching a location off was always possible and kept the history, which is
   right. What was missing was everything around it. So this walks the closure:

     1. what is inside, and what blocks the closure
     2. count each line and pick where the stock goes
     3. one page saying what the closure cost

   What is found moves as a real transfer. What is missing is written off at
   cost, in the loss ledger, with the reason and the closer's name on it.
──────────────────────────────────────────────────────────────────────────────*/

type StockLine = {
  productId: number; name: string; unit: string | null;
  qty: number; unitCost: number; value: number; tracked: boolean;
};
type Plan = {
  store: { id: number; nameEn: string; type: string; active: boolean };
  stock: StockLine[];
  stockValue: number;
  stockLines: number;
  blockers: Array<{ kind: string; count: number; detail: string }>;
  warnings: Array<{ kind: string; count: number; detail: string }>;
  canClose: boolean;
};
type Statement = {
  store: { id: number; nameEn: string };
  movedTo: { id: number; nameEn: string } | null;
  transferNumber: string | null;
  movedLines: number; movedValue: number;
  missingLines: number; missingValue: number;
  totalBefore: number;
};

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);

export default function CloseLocationDialog({
  location, open, onOpenChange, stores,
}: {
  location: { id: number; nameEn: string } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stores: Array<{ id: number; nameEn: string; active: boolean }>;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [moveTo, setMoveTo] = useState("");
  const [found, setFound] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [statement, setStatement] = useState<Statement | null>(null);

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: [`/api/stores/${location?.id}/closure-plan`],
    queryFn: () => fetch(`/api/stores/${location!.id}/closure-plan`, { credentials: "include" })
      .then((r) => r.json()),
    enabled: open && !!location,
  });

  useEffect(() => {
    if (!open) return;
    setStep(1); setMoveTo(""); setReason(""); setStatement(null);
    const seed: Record<number, string> = {};
    for (const l of plan?.stock ?? []) seed[l.productId] = String(l.qty);
    setFound(seed);
  }, [open, plan]);

  const counted = useMemo(() => (plan?.stock ?? []).map((l) => {
    const typed = found[l.productId];
    const f = typed === undefined || typed === "" ? l.qty : Number(typed);
    const ok = Number.isFinite(f) && f >= 0;
    const capped = ok ? Math.min(f, l.qty) : l.qty;
    return {
      ...l, found: capped, ok, over: ok && f > l.qty + 0.0001,
      missing: Number((l.qty - capped).toFixed(4)),
      lostValue: Number(((l.qty - capped) * l.unitCost).toFixed(2)),
      movedValue: Number((capped * l.unitCost).toFixed(2)),
    };
  }), [plan, found]);

  const missingValue = counted.reduce((a, l) => a + l.lostValue, 0);
  const movedValue = counted.reduce((a, l) => a + l.movedValue, 0);
  const anyToMove = counted.some((l) => l.found > 0.0001);
  const anyBad = counted.some((l) => !l.ok);

  const close = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/stores/${location!.id}/close`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          moveToStoreId: anyToMove ? Number(moveTo) : null,
          counts: counted.map((l) => ({ productId: l.productId, foundQty: l.found })),
          reason: reason.trim(),
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as any)?.message || "Could not close it.");
      return body as Statement;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/transfers"] });
      qc.invalidateQueries({ queryKey: ["/api/stock-losses"] });
      setStatement(res); setStep(3);
    },
    onError: (e: any) =>
      toast({ title: "Not closed", description: e?.message, variant: "destructive" }),
  });

  if (!location) return null;

  const destinations = stores.filter((s) => s.id !== location.id && s.active !== false);
  const canConfirm =
    !anyBad && reason.trim().length >= 3 && (!anyToMove || !!moveTo) && !close.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 3
              ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> {location.nameEn} is closed</>
              : <><Lock className="w-5 h-5" /> Close {location.nameEn}</>}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "What is still inside, and what has to be dealt with first."}
            {step === 2 && "Count what is actually there. What is missing gets written off."}
            {step === 3 && "What the closure cost."}
          </DialogDescription>
        </DialogHeader>

        {/* ── 1. What is inside ─────────────────────────────────────────── */}
        {step === 1 && (
          isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Looking inside…
            </p>
          ) : !plan ? (
            <p className="text-sm text-muted-foreground py-6">Could not read what is inside.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {plan.blockers.map((b, i) => (
                <div key={i} className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-red-800 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{b.detail}</span>
                </div>
              ))}
              {plan.warnings.map((w, i) => (
                <div key={i} className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-900 text-xs">
                  {w.detail}
                </div>
              ))}

              {plan.stockLines === 0 ? (
                <p className="text-muted-foreground">
                  Nothing is stored here. Closing it just switches it off — the history stays.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <p className="font-medium">{plan.stockLines} product(s) still here</p>
                    <p className="font-mono font-semibold">{money(plan.stockValue)}</p>
                  </div>
                  <div className="rounded-lg border divide-y max-h-56 overflow-y-auto">
                    {plan.stock.map((l) => (
                      <div key={l.productId} className="flex justify-between px-3 py-1.5 text-xs">
                        <span className="truncate pr-2">{l.name}</span>
                        <span className="font-mono whitespace-nowrap tabular-nums">
                          {l.qty} {l.unit || ""} · {money(l.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        )}

        {/* ── 2. Count and move ─────────────────────────────────────────── */}
        {step === 2 && plan && (
          <div className="space-y-3">
            {anyToMove && (
              <div className="space-y-1.5">
                <Label>Where does the stock go?</Label>
                <Select value={moveTo} onValueChange={setMoveTo}>
                  <SelectTrigger><SelectValue placeholder="Choose a location…" /></SelectTrigger>
                  <SelectContent>
                    {destinations.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  What you find moves as a real transfer, with a voucher.
                </p>
              </div>
            )}

            {plan.stockLines > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[1fr_4rem_5rem] gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Item</span><span className="text-right">System</span><span className="text-right">Found</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {counted.map((l) => (
                    <div key={l.productId} className={cn(
                      "grid grid-cols-[1fr_4rem_5rem] gap-2 items-center px-3 py-1.5 border-t",
                      l.missing > 0.0001 && "bg-red-50")}>
                      <div className="min-w-0">
                        <p className="text-xs truncate">{l.name}</p>
                        {l.missing > 0.0001 && (
                          <p className="text-[11px] text-red-700">
                            {Number(l.missing.toFixed(3))} {l.unit || ""} missing · {money(l.lostValue)}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-right font-mono text-muted-foreground">{l.qty}</span>
                      <Input
                        className={cn("h-7 text-xs text-right font-mono px-1.5", (!l.ok || l.over) && "border-destructive")}
                        value={found[l.productId] ?? ""}
                        inputMode="decimal"
                        onChange={(e) => setFound((f) => ({ ...f, [l.productId]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Moving out</p>
                <p className="font-mono font-bold text-lg">{money(movedValue)}</p>
              </div>
              <div className={cn("rounded-lg border p-2.5", missingValue > 0 ? "bg-red-500/5 border-red-200" : "bg-muted/30")}>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Cannot be found</p>
                <p className={cn("font-mono font-bold text-lg", missingValue > 0 && "text-red-700")}>
                  {money(missingValue)}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Why is it closing?</Label>
              <Textarea
                rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. rental shop given up end of August — stock consolidated into Store 1"
              />
              {missingValue > 0 && (
                <p className="text-[11px] text-red-700">
                  {money(missingValue)} will be written off as lost, against this location, with
                  your name on it. That number is the real cost of this closure.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 3. The statement ──────────────────────────────────────────── */}
        {step === 3 && statement && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border divide-y">
              <div className="flex justify-between px-3 py-2">
                <span>Stock held before closing</span>
                <span className="font-mono">{money(statement.totalBefore)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                  Moved{statement.movedTo ? ` to ${statement.movedTo.nameEn}` : ""}
                  {statement.transferNumber && (
                    <span className="text-xs text-muted-foreground">({statement.transferNumber})</span>
                  )}
                </span>
                <span className="font-mono text-emerald-700">{money(statement.movedValue)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="flex items-center gap-1.5">
                  <PackageX className="w-3.5 h-3.5 text-red-600" />
                  Could not be found ({statement.missingLines} line{statement.missingLines === 1 ? "" : "s"})
                </span>
                <span className="font-mono font-semibold text-red-700">− {money(statement.missingValue)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {statement.store.nameEn} is switched off — it is gone from every picker, and every
              invoice, transfer and expense that names it still works. The write-off shows in
              Profit under material losses.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 3 ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={close.isPending}>
                Cancel
              </Button>
              {step === 1 ? (
                <Button disabled={!plan || !plan.canClose || isLoading} onClick={() => setStep(2)}>
                  {plan && !plan.canClose ? "Deal with those first" : "Continue"}
                </Button>
              ) : (
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white gap-2"
                  disabled={!canConfirm}
                  onClick={() => close.mutate()}
                >
                  {close.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Close {location.nameEn}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
