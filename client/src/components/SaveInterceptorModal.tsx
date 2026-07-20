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
  dueDate?: string | null;   // credit payment deadline (invoice date + chosen term)
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: InterceptorResult) => void;
  docLabel: string;
  total: number;
  saving?: boolean;
  /** Invoice date (YYYY-MM-DD) — drives the credit due date + the PDC 45-day check. */
  invoiceDate?: string;
  /** Remaining credit headroom for the customer; undefined = unknown/no limit. */
  creditRemaining?: number;
  /** Selected customer (for the Cash→Credit upgrade guard). creditLimit≤0 = Cash account. */
  customer?: { id: number; name: string; creditLimit: number };
  /** Called after a Cash account is upgraded to Credit so the parent can refetch. */
  onCustomerUpgraded?: () => void;
  /** Invoice Type toggle (INV only): "cash" = full non-PDC payment required; "credit" = anything. */
  invoiceMode?: "cash" | "credit";
}

const METHODS: TenderMethod[] = ["Cash", "Card", "Online Transfer", "PDC", "Credit"];
const isDeferred = (m: TenderMethod) => m === "PDC" || m === "Credit"; // not collected now

export default function SaveInterceptorModal({ open, onClose, onConfirm, docLabel, total, saving, creditRemaining, customer, onCustomerUpgraded, invoiceMode, invoiceDate }: Props) {
  // Date helpers for the credit due date + PDC 45-day timeline check.
  const baseDate = invoiceDate || new Date().toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  const PDC_MAX_DAYS = 45;
  const [transactionMode, setTransactionMode] = useState<TransactionMode>("real");
  const [lines, setLines] = useState<TenderLine[]>([{ method: "Cash", amount: total }]);
  const [override, setOverride] = useState(false);
  const [upgraded, setUpgraded] = useState(false);   // Cash account promoted to Credit this session
  const [newLimit, setNewLimit] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  // Credit term options come from Settings (11A) — zero hardcoded values.
  const { data: bizSettings } = useQuery<any>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 60_000,
  });
  const creditTermOptions: number[] = Array.from(new Set([
    7,
    ...(Array.isArray(bizSettings?.creditTerms) && bizSettings.creditTerms.length > 0 ? bizSettings.creditTerms : [30, 60, 90]),
  ])).sort((a, b) => a - b);

  useEffect(() => {
    if (open) {
      setTransactionMode("real");
      setLines([{ method: "Cash", amount: Number(total.toFixed(2)) }]);
      setOverride(false);
      setUpgraded(false);
      setNewLimit("");
      setUpgrading(false);
    }
  }, [open, total]);

  const cashOnly = invoiceMode === "cash";
  const availableMethods: TenderMethod[] = cashOnly ? ["Cash", "Card", "Online Transfer"] : METHODS;

  const setLine = (i: number, patch: Partial<TenderLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => {
    const remaining = Math.max(0, total - tendered);
    // Cash Invoice: extra tender lines are collected-now methods, never a deferred Credit line.
    setLines((prev) => cashOnly
      ? [...prev, { method: "Cash", amount: Number(remaining.toFixed(2)) }]
      : [...prev, { method: "Credit", amount: Number(remaining.toFixed(2)), creditTerm: 30 }]);
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

  // Cash-account guard: a Cash customer (creditLimit≤0) cannot use PDC/Credit until the
  // account is upgraded to Credit — no silent deferred balance without an account-type change.
  const customerIsCash = !!customer && Number(customer.creditLimit || 0) <= 0 && !upgraded;
  const hasDeferred = lines.some((l) => isDeferred(l.method) && Number(l.amount) > 0);
  const cashNeedsUpgrade = customerIsCash && hasDeferred;

  const upgradeToCredit = async () => {
    if (!customer || !(Number(newLimit) > 0)) return;
    setUpgrading(true);
    try {
      const r = await fetch(`/api/customers/${customer.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditLimit: Number(newLimit) }),
      });
      if (!r.ok) throw new Error("upgrade failed");
      setUpgraded(true);
      onCustomerUpgraded?.();
    } catch { /* keep the guard up; staff can retry or remove the deferred line */ }
    finally { setUpgrading(false); }
  };

  // Cash Invoice: no PDC/Credit (deferred) allowed, and must be paid in full now.
  const cashHasDeferred = cashOnly && lines.some((l) => isDeferred(l.method) && Number(l.amount) > 0);
  const cashViolation = cashOnly && (!balanced || cashHasDeferred);

  const canConfirm = linesValid && balanced && (!exceedsLimit || override) && !cashNeedsUpgrade && !cashViolation &&
    (transactionMode === "real" || transactionMode === "demo");

  const derivedLabel = (): string => {
    if (lines.length === 1) return lines[0].method;
    return "Split · " + lines.map((l) => l.method).join(" + ");
  };

  // Credit due date = invoice date + the chosen Credit term (the deferred, non-PDC portion).
  const creditLine = lines.find((l) => l.method === "Credit" && Number(l.amount) > 0);
  const dueDate = creditLine ? addDays(baseDate, Number(creditLine.creditTerm ?? 30)) : null;

  // PDC cheques whose clear date is more than 45 days out — warn (does not block).
  const pdcBeyond45 = lines.filter((l) => l.method === "PDC" && l.chequeDate && daysBetween(l.chequeDate, baseDate) > PDC_MAX_DAYS);

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({ transactionMode, payments: lines, paymentType: derivedLabel(), creditOverride: exceedsLimit ? override : undefined, dueDate });
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
                        <SelectContent>{availableMethods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
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
                      <Input value={l.referenceNumber || ""} onChange={(e) => setLine(i, { referenceNumber: e.target.value })} className="h-8 text-xs no-uppercase" placeholder="Reference # from card terminal *" />
                    )}
                    {l.method === "Online Transfer" && (
                      <div className="grid grid-cols-3 gap-2">
                        <Input value={l.accountNumber || ""} onChange={(e) => setLine(i, { accountNumber: e.target.value })} className="h-8 text-xs no-uppercase" placeholder="Sender account / IBAN *" />
                        <Input value={l.referenceNumber || ""} onChange={(e) => setLine(i, { referenceNumber: e.target.value })} className="h-8 text-xs no-uppercase" placeholder="Reference # *" />
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

              {/* PDC clear date beyond 45 days — timeline warning (does not block). */}
              {pdcBeyond45.length > 0 && (
                <div className="mt-2 text-[12px] bg-amber-50 border border-amber-300 text-amber-800 rounded p-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {pdcBeyond45.length === 1 ? "A PDC cheque is" : `${pdcBeyond45.length} PDC cheques are`} dated more than {PDC_MAX_DAYS} days out
                    ({pdcBeyond45.map((l) => `${l.chequeNumber || "cheque"} · ${daysBetween(l.chequeDate!, baseDate)}d`).join(", ")}).
                    Long collection timeline — you can still save.
                  </span>
                </div>
              )}
              {/* Credit due date preview */}
              {dueDate && (
                <div className="mt-2 text-[12px] bg-slate-50 border border-slate-200 text-slate-600 rounded p-2">
                  Credit due date: <strong>{dueDate.split("-").reverse().join("/")}</strong> ({creditLine?.creditTerm ?? 30} days from invoice).
                </div>
              )}

              {/* Cash Invoice guard — full non-PDC payment required */}
              {cashViolation && (
                <div className="mt-2 text-[12px] bg-red-50 border border-red-200 text-red-700 rounded p-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Cash Invoice requires full payment now via Cash, Card, or Online Transfer only. Switch to Credit Invoice or complete payment to save.</span>
                </div>
              )}

              {/* Cash account trying to defer (PDC/Credit) → must upgrade the account first */}
              {cashNeedsUpgrade && (
                <div className="mt-2 text-[12px] bg-amber-50 border border-amber-300 text-amber-800 rounded p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-4 h-4" /> Cash account — deferred payment not allowed</div>
                  <p><strong>{customer!.name}</strong> is a Cash account. PDC/Credit needs a Credit account. Upgrade it now (records the account-type change), or remove the PDC/Credit line.</p>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} value={newLimit} onChange={(e) => setNewLimit(e.target.value)} className="h-8 text-xs w-36 font-mono" placeholder="Credit limit *" />
                    <Button type="button" size="sm" onClick={upgradeToCredit} disabled={upgrading || !(Number(newLimit) > 0)} className="h-8 bg-[#1e2a3a] text-white text-xs">
                      {upgrading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Upgrade to Credit"}
                    </Button>
                  </div>
                </div>
              )}
              {upgraded && (
                <div className="mt-2 text-[12px] bg-green-50 border border-green-200 text-green-700 rounded p-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Account upgraded to Credit — deferred payment allowed.
                </div>
              )}

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
