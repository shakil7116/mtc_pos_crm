import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet, Loader2, TrendingDown, TrendingUp, Check } from "lucide-react";
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
import {
  QAR_DENOMINATIONS, breakdownTotal, cashDifference, needsExplanation, splitClose,
} from "@shared/cashCount";
import { cn } from "@/lib/utils";

/* ── Counting the drawer at close ─────────────────────────────────────────────
   The oldest hole in retail is a cash sale that never gets entered, and no
   system prevents it. What a system can do is make it visible: count the money,
   compare it with what the day says was taken, and write the difference down.

   One day short is nothing. The same till short every day is the only evidence
   anybody will ever get — and it does not exist until somebody records it.

   So the notes are counted the way they are actually counted: how many 500s, how
   many 100s, adding up as you go.
──────────────────────────────────────────────────────────────────────────────*/

type StoreItem = { id: number; nameEn: string; active?: boolean | null };
type Plan = {
  store: { id: number; nameEn: string } | null;
  date: string;
  openingFloat: number;
  cashIn: number;
  cashOut: number;
  expected: number;
  movements: Array<{ direction: string; category: string; amount: number; notes: string | null }>;
  lastCount: { date: string; counted: number; closingFloat: number; difference: number } | null;
  tolerance: number;
};

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);
const label = (d: number) => (d >= 1 ? String(d) : `${d * 100}dh`);

export default function CashCountDialog({
  open, onClose, stores, defaultStoreId,
}: {
  open: boolean;
  onClose: () => void;
  stores: StoreItem[];
  defaultStoreId?: number | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [storeId, setStoreId] = useState(defaultStoreId ? String(defaultStoreId) : "");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [keepFloat, setKeepFloat] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!storeId && stores.length) setStoreId(String(stores[0].id));
  }, [stores, storeId]);

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: ["/api/cash-count/plan", storeId, date],
    queryFn: () => fetch(`/api/cash-count/plan?storeId=${storeId}&date=${date}`, { credentials: "include" })
      .then((r) => r.json()),
    enabled: open && !!storeId,
  });

  const counted = useMemo(() => breakdownTotal(notes), [notes]);
  const diff = useMemo(
    () => cashDifference(counted, plan?.expected ?? 0),
    [counted, plan]);
  const mustExplain = plan ? needsExplanation(diff, plan.tolerance) : false;
  const anyCounted = Object.values(notes).some((v) => Number(v) > 0);
  const { keep, bank } = splitClose(counted, keepFloat === "" ? counted : Number(keepFloat));

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/cash-count", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId: Number(storeId), date,
          breakdown: notes,
          closingFloat: keepFloat === "" ? counted : Number(keepFloat),
          reason: reason.trim() || null,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as any)?.message || "Could not save the count.");
      return body;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/cash-count/plan"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-counts"] });
      qc.invalidateQueries({ queryKey: ["/api/cashflow"] });
      qc.invalidateQueries({ queryKey: ["/api/finance/cash-position"] });
      toast({
        title: res.direction === "exact"
          ? "Till counted — exact"
          : res.direction === "short"
            ? `Till short by ${money(Math.abs(res.difference))}`
            : `Till over by ${money(res.difference)}`,
        description: res.banked > 0 ? `${money(res.banked)} recorded as banked.` : undefined,
        variant: res.direction === "short" ? "destructive" : undefined,
      });
      setNotes({}); setReason(""); setKeepFloat("");
      onClose();
    },
    onError: (e: any) =>
      toast({ title: "Not saved", description: e?.message, variant: "destructive" }),
  });

  const canSave = !!storeId && anyCounted && (!mustExplain || reason.trim().length >= 3) && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Count the till
          </DialogTitle>
          <DialogDescription>
            Count the drawer and compare it with what the day says was taken. The
            difference is recorded either way.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Which till?</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Location…" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Day</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* What the day says */}
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Adding up the day…
            </p>
          ) : plan && (
            <div className="rounded-lg border divide-y text-sm">
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-muted-foreground">Left in yesterday</span>
                <span className="font-mono">{money(plan.openingFloat)}</span>
              </div>
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-muted-foreground">Cash taken today</span>
                <span className="font-mono text-emerald-700">+ {money(plan.cashIn)}</span>
              </div>
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-muted-foreground">Cash paid out today</span>
                <span className="font-mono text-red-700">− {money(plan.cashOut)}</span>
              </div>
              <div className="flex justify-between px-3 py-2 bg-muted/40 font-semibold">
                <span>Should be in the drawer</span>
                <span className="font-mono">{money(plan.expected)}</span>
              </div>
            </div>
          )}

          {/* Count it */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              How many of each
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
              {QAR_DENOMINATIONS.map((d) => {
                const n = Number(notes[String(d)] || 0);
                return (
                  <div key={d} className="flex items-center gap-1.5">
                    <span className="w-12 text-right text-xs font-mono text-muted-foreground shrink-0">
                      {label(d)}
                    </span>
                    <span className="text-muted-foreground text-xs">×</span>
                    <Input
                      className="h-8 text-sm font-mono px-2"
                      inputMode="numeric"
                      value={notes[String(d)] ?? ""}
                      onChange={(e) => setNotes((c) => ({ ...c, [String(d)]: e.target.value }))}
                    />
                    <span className="w-16 text-right text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {n > 0 ? (d * n).toFixed(2) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* The answer */}
          <div className={cn(
            "rounded-lg border p-3",
            !anyCounted ? "bg-muted/30"
              : diff.direction === "exact" ? "border-emerald-300 bg-emerald-50"
              : diff.direction === "short" ? "border-red-300 bg-red-50"
              : "border-amber-300 bg-amber-50")}>
            <div className="flex justify-between items-baseline">
              <span className="text-sm">In the drawer</span>
              <span className="font-mono font-bold text-xl">{money(counted)}</span>
            </div>
            {anyCounted && (
              <p className={cn(
                "text-sm mt-1 flex items-center gap-1.5",
                diff.direction === "exact" ? "text-emerald-800"
                  : diff.direction === "short" ? "text-red-800" : "text-amber-900")}>
                {diff.direction === "exact" ? (
                  <><Check className="w-4 h-4" /> Exactly what the day says. Nothing to explain.</>
                ) : diff.direction === "short" ? (
                  <><TrendingDown className="w-4 h-4" /> <b>{money(Math.abs(diff.difference))} short</b> of what the day says.</>
                ) : (
                  <><TrendingUp className="w-4 h-4" /> <b>{money(diff.difference)} more</b> than the day says.</>
                )}
              </p>
            )}
          </div>

          {mustExplain && (
            <div className="space-y-1.5">
              <Label>What do you think happened?</Label>
              <Textarea
                rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. a cash sale not entered, or change given wrong this morning"
              />
              <p className="text-[11px] text-muted-foreground">
                Anything over {money(plan?.tolerance ?? 5)} needs a note — a difference nobody
                explained is the one that repeats.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Left in for tomorrow</Label>
              <Input
                inputMode="decimal" value={keepFloat}
                onChange={(e) => setKeepFloat(e.target.value)}
                placeholder={String(counted.toFixed(2))}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Going to the bank</Label>
              <div className="h-10 flex items-center font-mono text-sm">{money(bank)}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button className="gap-2" disabled={!canSave} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Record the count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
