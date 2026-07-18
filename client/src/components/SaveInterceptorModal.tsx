import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ShieldCheck, FlaskConical, Building2, Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type TransactionMode = "real" | "demo";
export type TenderMethod = "Cash" | "Card" | "Online Transfer" | "PDC" | "Credit";

export interface TenderLine {
  method: TenderMethod;
  amount: number;
  chequeNumber?: string;
  chequeDate?: string;
  bankName?: string;
  creditTerm?: number;       // 30 | 60 | 90
  referenceNumber?: string;  // Card terminal ref no. OR Online transfer ref no.
  accountNumber?: string;    // Online transfer: sender account / IBAN
}

export interface InterceptorResult {
  transactionMode: TransactionMode;
  payments: TenderLine[];
  paymentType: string;       // derived summary label (legacy field)
  creditOverride?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: InterceptorResult) => void;
  docLabel: string;
  total: number;
  saving?: boolean;
  /** Remaining credit headroom for the customer; undefined = unknown/no limit. */
  creditRemaining?: number;
}

const METHODS: TenderMethod[] = ["Cash", "Card", "Online Transfer", "PDC", "Credit"];
const isDeferred = (m: TenderMethod) => m === "PDC" || m === "Credit"; // not collected now

export default function SaveInterceptorModal({ open, onClose, onConfirm, docLabel, total, saving, creditRemaining }: Props) {
  const [transactionMode, setTransactionMode] = useState<TransactionMode>("real");
  const [lines, setLines] = useState<TenderLine[]>([{ method: "Cash", amount: total }]);
  const [override, setOverride] = useState(false);

  // Credit term options come from Settings (11A) — zero hardcoded values.
  const { data: bizSettings } = useQuery<any>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 60_000,
  });
  const creditTermOptions: number[] =
    Array.isArray(bizSettings?.creditTerms) && bizSettings.creditTerms.length > 0
      ? bizSettings.creditTerms
      : [30, 60, 90];

  useEffect(() => {
    if (open) {
      setTransactionMode("real");
      setLines([{ method: "Cash", amount: Number(total.toFixed(2)) }]);
      setOverride(false);
    }
  }, [open, total]);

  const setLine = (i: number, patch: Partial<TenderLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => {
    const remaining = Math.max(0, total - tendered);
    setLines((prev) => [...prev, { method: "Credit", amount: Number(remaining.toFixed(2)), creditTerm: 30 }]);
  };
  const removeLine = (i: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const tendered = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const remaining = Number((total - tendered).toFixed(2));
  const creditPortion = lines.filter((l) => isDeferred(l.method)).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const exceedsLimit = creditRemaining !== undefined && creditPortion > creditRemaining + 0.005;

  // Each line valid; confirmation fields kept SIMPLE per method (spec rule 22).
  // Cash: nothing. Card: terminal reference. Online: account/IBAN + ref + bank.
  // PDC: cheque no. + clear date + bank (who = auto from customer).
  const lineComplete = (l: TenderLine): boolean => {
    if (!(Number(l.amount) > 0)) return false;
    if (l.method === "PDC") return !!(l.chequeNumber && l.chequeDate && l.bankName);
    if (l.method === "Card") return !!l.referenceNumber;
    if (l.method === "Online Transfer") return !!(l.referenceNumber && l.bankName && l.accountNumber);
    return true; // Cash / Credit
  };
  const linesValid = lines.every(lineComplete);
  const balanced = Math.abs(remaining) < 0.01;
  const canConfirm = linesValid && balanced && (!exceedsLimit || override) &&
    (transactionMode === "real" || transactionMode === "demo");

  const derivedLabel = (): string => {
    if (lines.length === 1) return lines[0].method;
    return "Split · " + lines.map((l) => l.method).join(" + ");
  };

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({ transactionMode, payments: lines, paymentType: derivedLabel(), creditOverride: exceedsLimit ? override : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#d4a017]" />
            Confirm before saving
          </DialogTitle>
          <DialogDescription>
            Record how this {docLabel} (QAR {total.toFixed(2)}) is paid — one method or a split.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* 1. Transaction Mode */}
          <section>
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Transaction Mode</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button type="button" onClick={() => setTransactionMode("real")}
                className={cn("flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-all",
                  transactionMode === "real" ? "border-green-600 bg-green-50" : "border-border hover:border-green-600/40")}>
                <Building2 className={cn("w-5 h-5 shrink-0", transactionMode === "real" ? "text-green-600" : "text-muted-foreground")} />
                <div><div className="font-semibold text-sm">Real / Production</div><div className="text-[11px] text-muted-foreground">Counts in books</div></div>
              </button>
              <button type="button" onClick={() => setTransactionMode("demo")}
                className={cn("flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-all",
                  transactionMode === "demo" ? "border-amber-500 bg-amber-50" : "border-border hover:border-amber-500/40")}>
                <FlaskConical className={cn("w-5 h-5 shrink-0", transactionMode === "demo" ? "text-amber-600" : "text-muted-foreground")} />
                <div><div className="font-semibold text-sm">Demo / Test</div><div className="text-[11px] text-muted-foreground">Practice only</div></div>
              </button>
            </div>
          </section>

          {/* 2. Split payment builder */}
          <ErrorBoundary label="split-payment">
            <section>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment <span className="text-destructive">*</span></Label>
                <button type="button" onClick={addLine} className="flex items-center gap-1 text-xs font-semibold text-[#1e2a3a] hover:opacity-70">
                  <Plus className="w-3.5 h-3.5" /> Add method
                </button>
              </div>

              <div className="mt-2 space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Select value={l.method} onValueChange={(v) => setLine(i, { method: v as TenderMethod })}>
                        <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" min={0} value={l.amount || ""} onChange={(e) => setLine(i, { amount: Number(e.target.value) || 0 })}
                        className="h-8 text-sm text-right font-mono" placeholder="0.00" />
                      <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-30 shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>

                    {l.method === "PDC" && (
                      <div className="grid grid-cols-3 gap-2">
                        <Input value={l.chequeNumber || ""} onChange={(e) => setLine(i, { chequeNumber: e.target.value })} className="h-8 text-xs" placeholder="Cheque # *" />
                        <Input value={l.bankName || ""} onChange={(e) => setLine(i, { bankName: e.target.value })} className="h-8 text-xs" placeholder="Bank *" />
                        <Input type="date" value={l.chequeDate || ""} onChange={(e) => setLine(i, { chequeDate: e.target.value })} className="h-8 text-xs" title="Cheque clear date" />
                      </div>
                    )}
                    {l.method === "Card" && (
                      <Input value={l.referenceNumber || ""} onChange={(e) => setLine(i, { referenceNumber: e.target.value })} className="h-8 text-xs" placeholder="Reference # from card terminal *" />
                    )}
                    {l.method === "Online Transfer" && (
                      <div className="grid grid-cols-3 gap-2">
                        <Input value={l.accountNumber || ""} onChange={(e) => setLine(i, { accountNumber: e.target.value })} className="h-8 text-xs" placeholder="Sender account / IBAN *" />
                        <Input value={l.referenceNumber || ""} onChange={(e) => setLine(i, { referenceNumber: e.target.value })} className="h-8 text-xs" placeholder="Reference # *" />
                        <Input value={l.bankName || ""} onChange={(e) => setLine(i, { bankName: e.target.value })} className="h-8 text-xs" placeholder="Bank *" />
                      </div>
                    )}
                    {!lineComplete(l) && Number(l.amount) > 0 && l.method !== "Cash" && l.method !== "Credit" && (
                      <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Confirmation fields required for {l.method}.</p>
                    )}
                    {l.method === "Credit" && (
                      <Select value={String(l.creditTerm ?? 30)} onValueChange={(v) => setLine(i, { creditTerm: Number(v) })}>
                        <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{creditTermOptions.map((d) => <SelectItem key={d} value={String(d)}>{d} days credit</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>

              {/* tender summary */}
              <div className="mt-2 flex items-center justify-between text-xs px-1">
                <span className="text-muted-foreground">Tendered <span className="font-mono font-semibold text-foreground">{tendered.toFixed(2)}</span> / {total.toFixed(2)}</span>
                <span className={cn("font-mono font-semibold", Math.abs(remaining) < 0.01 ? "text-green-600" : "text-amber-600")}>
                  {Math.abs(remaining) < 0.01 ? "Balanced" : `Remaining ${remaining.toFixed(2)}`}
                </span>
              </div>

              {exceedsLimit && (
                <div className="mt-2 text-[12px] bg-red-50 border border-red-200 text-red-700 rounded p-2">
                  <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-4 h-4" /> Credit limit exceeded</div>
                  <p className="mt-0.5">Credit/PDC portion QAR {creditPortion.toFixed(2)} exceeds remaining limit QAR {creditRemaining!.toFixed(2)}.</p>
                  <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                    <span className="font-semibold">Admin override — proceed anyway</span>
                  </label>
                </div>
              )}
            </section>
          </ErrorBoundary>

          {transactionMode === "demo" && (
            <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded p-2">
              ⚠️ Saved as a <strong>Demo / Test</strong> document — excluded from real reports.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={confirm} disabled={!canConfirm || saving} className="bg-[#1e2a3a] text-white min-w-32">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {saving ? "Saving…" : "Confirm & Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
