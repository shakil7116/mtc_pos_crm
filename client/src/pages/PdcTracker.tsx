import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Landmark, Download, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, AlertOctagon,
  ExternalLink, AlertTriangle, Clock, RotateCcw, CalendarClock, Banknote, Upload,
  XCircle, RefreshCw, DollarSign, X, Search, ChevronRight, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CorrectButton, CorrectedBadge } from "@/components/CorrectionModal";
import { money, StatusBadge, ActionButton } from "@/components/finance/kit";

const RECOVERY_LABEL: Record<string, string> = {
  replacement_requested: "Replacement requested",
  replacement_received: "Replaced",
  cash_requested: "Cash requested",
  cash_received: "Cash recovered",
  written_off: "Written off",
};

const RECOVERY_STYLE: Record<string, string> = {
  replacement_requested: "bg-orange-500/10 text-orange-600",
  replacement_received: "bg-emerald-500/10 text-emerald-600",
  cash_requested: "bg-orange-500/10 text-orange-600",
  cash_received: "bg-emerald-500/10 text-emerald-600",
  written_off: "bg-slate-500/10 text-slate-500",
};

/* Lens = the single active "what am I looking at" filter. The three headline
   cards set receivable/payable/attention; the side list sets the time-based
   ones. Only one is ever active, which keeps the filtered set easy to reason
   about and lets the active lens light up wherever it is represented. */
type Lens =
  | "all" | "receivable" | "payable" | "attention"
  | "dueToday" | "awaitingClearance" | "dueSoon";
const CARD_LENSES: Lens[] = ["receivable", "payable", "attention"];
const ACTIVE_ST = ["pending", "deposited", "overdue"];

const TONE = {
  emerald: { chip: "bg-emerald-500/12 text-emerald-600", value: "text-emerald-600", ring: "ring-emerald-500/45", tint: "bg-emerald-500/[0.05]", border: "border-emerald-500/40" },
  rose: { chip: "bg-rose-500/12 text-rose-600", value: "text-rose-600", ring: "ring-rose-500/45", tint: "bg-rose-500/[0.05]", border: "border-rose-500/40" },
  amber: { chip: "bg-amber-500/12 text-amber-600", value: "text-amber-600", ring: "ring-amber-500/45", tint: "bg-amber-500/[0.05]", border: "border-amber-500/40" },
  blue: { chip: "bg-blue-500/12 text-blue-600", value: "text-blue-600", ring: "ring-blue-500/45", tint: "bg-blue-500/[0.05]", border: "border-blue-500/40" },
  slate: { chip: "bg-slate-500/12 text-slate-500", value: "text-foreground", ring: "ring-slate-400/45", tint: "bg-muted/50", border: "border-border" },
} as const;
type ToneKey = keyof typeof TONE;

const AGING_ROWS = [
  { key: "overdue", label: "Overdue", bar: "bg-rose-500" },
  { key: "week", label: "This week", bar: "bg-amber-500" },
  { key: "month", label: "This month", bar: "bg-blue-500" },
  { key: "later", label: "Later", bar: "bg-slate-400" },
] as const;

const recoveryDone = (r: any) => ["cash_received", "replacement_received", "written_off"].includes(r.recoveryStatus);
const isActive = (r: any) => ACTIVE_ST.includes(r.displayStatus || r.status);
const sum = (rows: any[]) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
const fmtDay = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");
function nextDue(rows: any[], today: string): string | null {
  const up = rows.map((r) => r.chequeDate).filter((d) => d && d >= today).sort();
  return up[0] || null;
}
function relDue(dateStr: string, today: string): { label: string; cls: string } | null {
  if (!dateStr) return null;
  const days = Math.round((new Date(dateStr + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 864e5);
  if (days === 0) return { label: "today", cls: "bg-amber-500/12 text-amber-600" };
  if (days < 0) return { label: `${Math.abs(days)}d late`, cls: "bg-rose-500/12 text-rose-600" };
  if (days <= 7) return { label: `in ${days}d`, cls: "bg-blue-500/12 text-blue-600" };
  return { label: `in ${days}d`, cls: "bg-muted text-muted-foreground" };
}
function agingBuckets(rows: any[], today: string, in7: string, in30: string) {
  const b: Record<string, number> = { overdue: 0, week: 0, month: 0, later: 0 };
  for (const r of rows) {
    const d = r.chequeDate || ""; const amt = Number(r.amount || 0);
    if (!d || d < today) b.overdue += amt;
    else if (d <= in7) b.week += amt;
    else if (d <= in30) b.month += amt;
    else b.later += amt;
  }
  return b;
}

export default function PdcTracker({ embedded }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const urlp = (() => { try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); } })();
  const initialLens: Lens =
    urlp.get("due") === "today" ? "dueToday"
      : urlp.get("type") === "payable" ? "payable"
        : urlp.get("type") === "receivable" ? "receivable"
          : "all";
  const [lens, setLens] = useState<Lens>(initialLens);
  const [statusRefine, setStatusRefine] = useState("all");
  const [bank, setBank] = useState("");
  const [search, setSearch] = useState("");

  // Modals
  const [depositModal, setDepositModal] = useState<{ id: number; chequeNumber: string; chequeDate: string } | null>(null);
  const [clearModal, setClearModal] = useState<{ id: number; chequeNumber: string; depositedToAccount?: string } | null>(null);
  const [recoveryModal, setRecoveryModal] = useState<{ id: number; chequeNumber: string; amount: string; who: string } | null>(null);
  const [replaceModal, setReplaceModal] = useState<{ id: number; chequeNumber: string; bankName: string; amount: string } | null>(null);
  const [swapModal, setSwapModal] = useState<{ id: number; chequeNumber: string; amount: string; who: string } | null>(null);

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/cheques"],
    queryFn: () => fetch("/api/cheques").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const reverseMut = useMutation({
    mutationFn: ({ id, targetStatus, reason }: { id: number; targetStatus: string; reason: string }) =>
      fetch(`/api/corrections/cheque/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus, reason }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Reversal failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      qc.invalidateQueries({ queryKey: ["/api/cashflow"] });
      qc.invalidateQueries({ queryKey: ["/api/corrections"] });
      qc.invalidateQueries({ queryKey: ["/api/pdc/summary"] });
      toast({ title: "Status reversed", description: "Correction logged permanently." });
    },
    onError: (e: any) => toast({ title: "Cannot reverse", description: String(e?.message || ""), variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, next, depositProofUrl, depositedToAccount, clearanceProofUrl }: { id: number; next: string; depositProofUrl?: string; depositedToAccount?: string; clearanceProofUrl?: string }) =>
      fetch(`/api/cheques/${id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, depositProofUrl, depositedToAccount, clearanceProofUrl }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Update failed"); return r.json(); }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      qc.invalidateQueries({ queryKey: ["/api/cashflow"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/pdc/summary"] });
      toast({ title: `Cheque ${v.next}`, description: v.next === "cleared" ? "Money movement booked in cash flow." : v.next === "bounced" ? "Party record flagged; admin alerted." : v.next === "deposited" ? "Cheque deposited at bank." : undefined });
    },
    onError: (e: any) => toast({ title: "Cannot update", description: String(e?.message || ""), variant: "destructive" }),
  });

  const recoveryMut = useMutation({
    mutationFn: ({ id, recoveryStatus, recoveryNotes }: { id: number; recoveryStatus: string; recoveryNotes: string }) =>
      fetch(`/api/cheques/${id}/recovery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryStatus, recoveryNotes }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      qc.invalidateQueries({ queryKey: ["/api/pdc/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      setRecoveryModal(null);
      toast({ title: "Recovery updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const replaceMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetch(`/api/cheques/${id}/replace`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      qc.invalidateQueries({ queryKey: ["/api/pdc/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      setReplaceModal(null);
      toast({ title: "Replacement cheque created", description: "New cheque is now pending in the tracker." });
    },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const swapMut = useMutation({
    mutationFn: ({ id, method, notes }: { id: number; method: string; notes: string }) =>
      fetch(`/api/cheques/${id}/swap`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, notes }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed"); return r.json(); }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      qc.invalidateQueries({ queryKey: ["/api/cashflow"] });
      qc.invalidateQueries({ queryKey: ["/api/pdc/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      setSwapModal(null);
      toast({ title: "PDC swapped", description: `Cheque cancelled, payment recorded as ${v.method === "cash" ? "cash" : "bank transfer"}.` });
    },
    onError: (e: any) => toast({ title: "Swap failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  // ── Derived sets (client-side so headline numbers, chip counts and the
  //    filtered rows can never drift apart) ──────────────────────────────
  const recv = rows.filter((r) => (r.type || "receivable") === "receivable" && isActive(r));
  const pay = rows.filter((r) => r.type === "payable" && isActive(r));
  const overdueItems = rows.filter((r) => (r.displayStatus || r.status) === "overdue");
  const bouncedItems = rows.filter((r) => r.status === "bounced" && !recoveryDone(r));
  const attentionItems = [...overdueItems, ...bouncedItems];
  const dueTodayItems = rows.filter((r) => isActive(r) && r.chequeDate === today);
  const awaitingItems = rows.filter((r) => r.status === "deposited");
  const dueSoonItems = rows.filter((r) => isActive(r) && r.chequeDate > today && r.chequeDate <= in7);

  const recvTotal = sum(recv), payTotal = sum(pay), attnTotal = sum(attentionItems);
  const recvAging = agingBuckets(recv, today, in7, in30);
  const payAging = agingBuckets(pay, today, in7, in30);

  // ── Lens predicate ────────────────────────────────────────────────────
  function passesLens(r: any): boolean {
    const st = r.displayStatus || r.status;
    const dir = r.type || "receivable";
    switch (lens) {
      case "receivable": return dir === "receivable" && isActive(r);
      case "payable": return dir === "payable" && isActive(r);
      case "attention": return st === "overdue" || (r.status === "bounced" && !recoveryDone(r));
      case "dueToday": return isActive(r) && r.chequeDate === today;
      case "awaitingClearance": return r.status === "deposited";
      case "dueSoon": return isActive(r) && r.chequeDate > today && r.chequeDate <= in7;
      default: return true;
    }
  }
  const filtered = rows.filter((r) => {
    if (!passesLens(r)) return false;
    const st = r.displayStatus || r.status;
    if (statusRefine !== "all" && st !== statusRefine) return false;
    if (bank && !(r.bankName || "").toLowerCase().includes(bank.toLowerCase())) return false;
    if (search && !(r.chequeNumber || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const anyFilter = lens !== "all" || statusRefine !== "all" || !!bank || !!search;

  const chooseLens = (l: Lens) => { setLens((cur) => (cur === l ? "all" : l)); setStatusRefine("all"); };
  const chooseStatus = (s: string) => { setStatusRefine(s); if (s !== "all") setLens("all"); };
  const reset = () => { setLens("all"); setStatusRefine("all"); setBank(""); setSearch(""); };

  // Export honours whatever slice is on screen (best-effort mapping to the API params).
  const expType = lens === "receivable" ? "receivable" : lens === "payable" ? "payable" : "";
  const expStatus = statusRefine !== "all" ? statusRefine : lens === "awaitingClearance" ? "deposited" : lens === "attention" ? "bounced" : "";
  const exportUrl = `/api/cheques/export.csv?status=${expStatus}&type=${expType}&bank=${encodeURIComponent(bank)}&q=${encodeURIComponent(search)}`;

  const LENS_LABEL: Record<string, string> = {
    receivable: "Receivable — to collect", payable: "Payable — to honour",
    attention: "Needs attention", dueToday: "Due today",
    awaitingClearance: "Awaiting clearance", dueSoon: "Due soon",
  };

  return (
    <div className={cn("max-w-5xl mx-auto space-y-4", embedded ? "px-4 sm:px-6 pb-6" : "p-4 sm:p-6")}>
      {!embedded && (
        <header className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Cheque Register</h1>
            <p className="text-sm text-muted-foreground">Post-dated cheques — receivable &amp; payable</p>
          </div>
        </header>
      )}

      {/* ── Headline lenses — the three cards ARE the primary filter ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FocusCard
          tone="emerald" icon={ArrowDownToLine} label="Receivable pending" value={money(recvTotal)}
          active={lens === "receivable"} dim={CARD_LENSES.includes(lens) && lens !== "receivable"}
          onClick={() => chooseLens("receivable")}
          meta={<>{recv.length} to collect{nextDue(recv, today) && <> · next {fmtDay(nextDue(recv, today)!)}</>}</>} />
        <FocusCard
          tone="rose" icon={ArrowUpFromLine} label="Payable pending" value={money(payTotal)}
          active={lens === "payable"} dim={CARD_LENSES.includes(lens) && lens !== "payable"}
          onClick={() => chooseLens("payable")}
          meta={<>{pay.length} to honour{nextDue(pay, today) && <> · next {fmtDay(nextDue(pay, today)!)}</>}</>} />
        <FocusCard
          tone="amber" icon={AlertTriangle} label="Needs attention" value={money(attnTotal)}
          active={lens === "attention"} dim={CARD_LENSES.includes(lens) && lens !== "attention"}
          onClick={() => chooseLens("attention")}
          meta={attentionItems.length === 0
            ? <span className="text-emerald-600">nothing overdue</span>
            : <>{overdueItems.length} overdue · {bouncedItems.length} bounced</>} />
      </div>

      {/* ── Command panel: adaptive timeline + needs-action list ── */}
      {rows.length > 0 && (
        <div className="section-card">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Timelines — which ones show follows the active lens */}
            <div className="lg:col-span-2 space-y-5">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-muted-foreground/70" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Payment schedule</h2>
              </div>
              {(lens === "all" || lens === "receivable" || lens === "attention" || lens === "dueToday" || lens === "dueSoon") && recvTotal > 0 && (
                <AgingGroup title="Receivable — when your money lands" hint="expected inflow" buckets={recvAging} />
              )}
              {(lens === "all" || lens === "payable" || lens === "dueToday" || lens === "dueSoon") && payTotal > 0 && (
                <AgingGroup title="Payable — when you must pay" hint="scheduled outflow" buckets={payAging} />
              )}
              {recvTotal === 0 && payTotal === 0 && (
                <p className="text-sm text-muted-foreground py-4">No cheques are currently scheduled — nothing pending in or out.</p>
              )}
            </div>

            {/* Needs-action rail */}
            <div className="lg:border-l lg:border-border/50 lg:pl-6">
              <h2 className="section-heading mb-3">Needs action</h2>
              {dueTodayItems.length + awaitingItems.length + dueSoonItems.length + bouncedItems.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 py-2">
                  <CheckCircle2 className="w-4 h-4" /> You're all caught up.
                </div>
              ) : (
                <div className="space-y-1">
                  <SmartAction tone="amber" icon={Clock} label="Due today" count={dueTodayItems.length} active={lens === "dueToday"} onClick={() => chooseLens("dueToday")} />
                  <SmartAction tone="rose" icon={AlertOctagon} label="Bounced — recover" count={bouncedItems.length} active={lens === "attention"} onClick={() => chooseLens("attention")} />
                  <SmartAction tone="blue" icon={RotateCcw} label="Awaiting clearance" count={awaitingItems.length} active={lens === "awaitingClearance"} onClick={() => chooseLens("awaitingClearance")} />
                  <SmartAction tone="slate" icon={CalendarClock} label="Due within 7 days" count={dueSoonItems.length} active={lens === "dueSoon"} onClick={() => chooseLens("dueSoon")} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar: active-lens chip + refine + export ── */}
      <div className="flex flex-wrap items-center gap-2">
        {anyFilter ? (
          <button onClick={reset} className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-lg bg-foreground/[0.04] border border-border/60 text-xs font-semibold hover:bg-foreground/[0.07] transition-colors">
            {LENS_LABEL[lens] || "Filtered"}<X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground px-1">All cheques</span>
        )}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cheque #…" className="h-8 w-36 text-xs pl-8" />
        </div>
        <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Bank…" className="h-8 w-32 text-xs" />
        <Select value={statusRefine} onValueChange={chooseStatus}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "pending", "overdue", "deposited", "cleared", "bounced", "cancelled"].map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground tabular-nums hidden sm:inline">
            {filtered.length} of {rows.length}
          </span>
          <a href={exportUrl}>
            <Button variant="outline" size="sm" className="gap-1.5 h-8"><Download className="w-3.5 h-3.5" /> Export</Button>
          </a>
        </div>
      </div>

      {/* ── Register table ── */}
      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2.5 shadow-[var(--shadow-card)]">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-11 rounded-lg bg-muted/50 animate-pulse" />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 overflow-x-auto bg-card shadow-[var(--shadow-card)]">
          <table className="w-full text-sm min-w-[880px]">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground/70 border-b border-border/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Cheque #</th>
                <th className="text-left px-3 py-2.5 font-semibold">Direction</th>
                <th className="text-left px-3 py-2.5 font-semibold">Party</th>
                <th className="text-left px-3 py-2.5 font-semibold">Bank</th>
                <th className="text-left px-3 py-2.5 font-semibold">Due</th>
                <th className="text-right px-3 py-2.5 font-semibold">Amount</th>
                <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const st = r.displayStatus || r.status;
                const active = ["pending", "overdue", "deposited"].includes(st);
                const isBounced = r.status === "bounced";
                const done = recoveryDone(r);
                const payable = r.type === "payable";
                const rel = active ? relDue(r.chequeDate, today) : null;
                return (
                  <tr key={r.id} className={cn("border-t border-border/30 hover:bg-muted/25 transition-colors", isBounced && !done && "bg-rose-500/[0.04]")}>
                    <td className="px-4 py-3 font-mono font-medium">
                      <Link href={`/cheques/${r.id}`} className="text-blue-600 hover:underline">{r.chequeNumber}</Link>
                      {r.documentId && (
                        <Link href={`/documents/${r.documentId}`} title="Linked document" className="ml-1.5 text-blue-500/70 hover:text-blue-500 inline-flex"><ExternalLink className="w-3 h-3" /></Link>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", payable ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-700")}>
                        {payable ? <ArrowUpFromLine className="w-3 h-3" /> : <ArrowDownToLine className="w-3 h-3" />}
                        {payable ? "Payable" : "Receivable"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground truncate max-w-[8rem]">{r.who || r.customerName || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{r.bankName}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="tabular-nums">{r.chequeDate}</span>
                      {rel && <span className={cn("ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold", rel.cls)}>{rel.label}</span>}
                    </td>
                    <td className={cn("px-3 py-3 text-right font-mono font-semibold tabular-nums", st === "cancelled" ? "text-muted-foreground line-through" : payable ? "text-rose-600" : "text-emerald-600")}>{money(r.amount)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={st} />
                        {r.recoveryStatus && (
                          <span className={cn("text-[10px] font-semibold rounded-full px-2 py-0.5", RECOVERY_STYLE[r.recoveryStatus] || "bg-slate-500/10")}>
                            {RECOVERY_LABEL[r.recoveryStatus] || r.recoveryStatus}
                          </span>
                        )}
                        {r.depositedToAccount && <span className="text-[10px] text-blue-600 font-medium" title={`Deposited to: ${r.depositedToAccount}`}>{r.depositedToAccount}</span>}
                        {r.depositProofUrl && <span className="text-[10px] text-blue-600 font-medium" title="Deposit slip attached">slip</span>}
                        {r.clearanceProofUrl && <span className="text-[10px] text-green-600 font-medium" title="Clearance proof attached">proof</span>}
                        <CorrectedBadge entityType="cheque" entityId={r.id} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {active && (
                          <>
                            {st !== "deposited" && (
                              <ActionButton icon={ArrowDownToLine} label="Deposit" tone="blue"
                                onClick={() => setDepositModal({ id: r.id, chequeNumber: r.chequeNumber, chequeDate: r.chequeDate })} />
                            )}
                            {r.status === "deposited" && (
                              <ActionButton icon={CheckCircle2} label="Clear" tone="green"
                                onClick={() => setClearModal({ id: r.id, chequeNumber: r.chequeNumber, depositedToAccount: r.depositedToAccount })} />
                            )}
                            {(r.type || "receivable") === "receivable" && r.status !== "deposited" && (
                              <ActionButton icon={Banknote} label="Swap" tone="amber"
                                onClick={() => setSwapModal({ id: r.id, chequeNumber: r.chequeNumber, amount: r.amount, who: r.who || r.customerName || "Unknown" })} />
                            )}
                            <ActionButton icon={AlertOctagon} label="Bounce" tone="red"
                              onClick={() => { if (window.confirm("Mark this cheque BOUNCED? The customer/supplier record is flagged and admin alerted.")) statusMut.mutate({ id: r.id, next: "bounced" }); }} />
                          </>
                        )}
                        {(r.status === "cleared" || r.status === "deposited") && (
                          <CorrectButton
                            label="Undo"
                            title={`Reverse cheque ${r.chequeNumber}`}
                            current={r.status}
                            next={r.status === "cleared" ? "deposited" : "pending"}
                            onConfirm={(reason) => reverseMut.mutateAsync({ id: r.id, targetStatus: r.status === "cleared" ? "deposited" : "pending", reason })}
                          />
                        )}
                        {isBounced && !done && (
                          <>
                            <ActionButton icon={DollarSign} label="Recover" tone="amber"
                              onClick={() => setRecoveryModal({ id: r.id, chequeNumber: r.chequeNumber, amount: r.amount, who: r.who || r.customerName || "Unknown" })} />
                            <ActionButton icon={RefreshCw} label="Replace" tone="blue"
                              onClick={() => setReplaceModal({ id: r.id, chequeNumber: r.chequeNumber, bankName: r.bankName, amount: r.amount })} />
                          </>
                        )}
                        {!active && !isBounced && r.status !== "cleared" && <span className="text-[11px] text-muted-foreground/40">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-14 text-center">
                    <ScrollText className="w-8 h-8 mx-auto text-muted-foreground/30" />
                    <p className="mt-2 text-sm font-medium text-muted-foreground">No cheques in this view</p>
                    {anyFilter && (
                      <button onClick={reset} className="mt-2 text-xs font-semibold text-blue-600 hover:underline">Clear filters</button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Cleared cheques post to bank cash flow, bounced cheques flag the party and alert admin, and reminders fire before each due date.
      </p>

      {/* Deposit modal — mark deposited + optional proof upload */}
      {depositModal && (
        <DepositModal
          chequeNumber={depositModal.chequeNumber}
          chequeDate={depositModal.chequeDate}
          onConfirm={(proofUrl, depositedToAccount) => {
            statusMut.mutate({ id: depositModal.id, next: "deposited", depositProofUrl: proofUrl || undefined, depositedToAccount });
            setDepositModal(null);
          }}
          onClose={() => setDepositModal(null)}
        />
      )}

      {/* Clear modal — mark deposited cheque as cleared + optional clearance proof */}
      {clearModal && (
        <ClearModal
          chequeNumber={clearModal.chequeNumber}
          depositedToAccount={clearModal.depositedToAccount}
          onConfirm={(clearanceProofUrl) => {
            statusMut.mutate({ id: clearModal.id, next: "cleared", clearanceProofUrl: clearanceProofUrl || undefined });
            setClearModal(null);
          }}
          onClose={() => setClearModal(null)}
        />
      )}

      {/* Swap modal — PDC to cash/bank transfer */}
      {swapModal && (
        <SwapModal
          chequeNumber={swapModal.chequeNumber}
          amount={swapModal.amount}
          who={swapModal.who}
          onConfirm={(method, notes) => swapMut.mutate({ id: swapModal.id, method, notes })}
          onClose={() => setSwapModal(null)}
          isPending={swapMut.isPending}
        />
      )}

      {/* Recovery modal — bounced cheque actions */}
      {recoveryModal && (
        <RecoveryModal
          chequeNumber={recoveryModal.chequeNumber}
          amount={recoveryModal.amount}
          who={recoveryModal.who}
          onConfirm={(recoveryStatus, notes) => recoveryMut.mutate({ id: recoveryModal.id, recoveryStatus, recoveryNotes: notes })}
          onClose={() => setRecoveryModal(null)}
          isPending={recoveryMut.isPending}
        />
      )}

      {/* Replace modal — create a replacement cheque for a bounced one */}
      {replaceModal && (
        <ReplaceModal
          originalNumber={replaceModal.chequeNumber}
          defaultBank={replaceModal.bankName}
          defaultAmount={replaceModal.amount}
          onConfirm={(data) => replaceMut.mutate({ id: replaceModal.id, data })}
          onClose={() => setReplaceModal(null)}
          isPending={replaceMut.isPending}
        />
      )}
    </div>
  );
}

/* ── Focus card — a clickable headline KPI that filters the register ── */
function FocusCard({ tone, icon: Icon, label, value, meta, active, dim, onClick }: {
  tone: ToneKey; icon: any; label: string; value: string; meta: React.ReactNode;
  active?: boolean; dim?: boolean; onClick: () => void;
}) {
  const t = TONE[tone];
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        "group text-left rounded-2xl border bg-card p-4 transition-all duration-200",
        "hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2",
        t.ring,
        active ? cn("ring-2 shadow-[var(--shadow-md)]", t.ring, t.tint, t.border) : "border-border/60",
        dim && !active && "opacity-60 hover:opacity-100",
      )}>
      <div className="flex items-center justify-between">
        <span className={cn("w-8 h-8 rounded-xl grid place-items-center", t.chip)}>
          <Icon className="w-4 h-4" />
        </span>
        <ChevronRight className={cn("w-4 h-4 transition-all", active ? cn("opacity-100", t.value) : "opacity-0 -translate-x-1 group-hover:opacity-40 group-hover:translate-x-0 text-muted-foreground")} />
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("font-mono font-bold text-xl tracking-tight tabular-nums mt-0.5", t.value)}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{meta}</p>
    </button>
  );
}

/* ── Aging group — one timeline (overdue / week / month / later) ── */
function AgingGroup({ title, hint, buckets }: { title: string; hint: string; buckets: Record<string, number> }) {
  const rows = AGING_ROWS.map((r) => ({ ...r, amt: buckets[r.key] || 0 }));
  const max = Math.max(1, ...rows.map((r) => r.amt));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5 gap-2">
        <h3 className="text-[12px] font-semibold text-foreground/90">{title}</h3>
        <span className="text-[10px] text-muted-foreground shrink-0">{hint}</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{r.label}</span>
            <div className="flex-1 h-5 rounded-md bg-muted/40 overflow-hidden">
              <div className={cn("h-full rounded-md transition-all duration-500", r.bar)}
                style={{ width: `${r.amt > 0 ? Math.max(6, (r.amt / max) * 100) : 0}%`, opacity: 0.9 }} />
            </div>
            <span className={cn("w-24 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums", r.amt > 0 ? "text-foreground" : "text-muted-foreground/50")}>{money(r.amt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Smart action — a clickable "needs action" line ── */
function SmartAction({ tone, icon: Icon, label, count, active, onClick }: {
  tone: ToneKey; icon: any; label: string; count: number; active?: boolean; onClick: () => void;
}) {
  if (!count) return null;
  const t = TONE[tone];
  return (
    <button type="button" onClick={onClick}
      className={cn("w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors", active ? "bg-muted" : "hover:bg-muted/60")}>
      <span className={cn("w-7 h-7 rounded-lg grid place-items-center shrink-0", t.chip)}><Icon className="w-3.5 h-3.5" /></span>
      <span className="flex-1 text-[13px] font-medium">{label}</span>
      <span className={cn("font-mono text-xs font-bold tabular-nums", t.value)}>{count}</span>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
    </button>
  );
}

/* ── Deposit Modal ── */
function DepositModal({ chequeNumber, chequeDate, onConfirm, onClose }: {
  chequeNumber: string;
  chequeDate: string;
  onConfirm: (proofUrl?: string, depositedToAccount?: string) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState("");
  const [reading, setReading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const tooEarly = chequeDate > today;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return;
    if (file.size > 4_000_000) return;
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => { setProofUrl(String(reader.result)); setReading(false); };
    reader.onerror = () => setReading(false);
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Deposit Cheque #{chequeNumber}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {tooEarly ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Cannot deposit yet</p>
            <p className="mt-1">This is a post-dated cheque (PDC) dated <strong>{chequeDate}</strong>. Banks will not accept it before that date. You can deposit on or after {chequeDate}.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Mark this cheque as deposited at the bank. Specify which account and optionally attach the deposit slip.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Deposited to bank account *</label>
                <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="e.g. QNB Current A/C, CBQ Savings" className="mt-1" />
              </div>
              <div className="space-y-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} />
                <Button variant="outline" size="sm" className="gap-1.5 w-full" disabled={reading} onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4" /> {proofUrl ? "Replace deposit slip" : "Upload deposit slip (optional)"}
                </Button>
                {proofUrl && (
                  <div className="relative">
                    <img src={proofUrl} alt="Deposit slip" className="w-full max-h-48 object-contain rounded-lg border bg-slate-50" />
                    <button onClick={() => setProofUrl(null)} className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {!tooEarly && (
            <Button size="sm" disabled={!bankAccount.trim()} onClick={() => onConfirm(proofUrl || undefined, bankAccount.trim())} className="gap-1.5">
              <ArrowDownToLine className="w-4 h-4" /> Confirm Deposit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Clear Modal — mark cheque as cleared + optional clearance proof ── */
function ClearModal({ chequeNumber, depositedToAccount, onConfirm, onClose }: {
  chequeNumber: string;
  depositedToAccount?: string;
  onConfirm: (clearanceProofUrl?: string) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return;
    if (file.size > 4_000_000) return;
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => { setProofUrl(String(reader.result)); setReading(false); };
    reader.onerror = () => setReading(false);
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Clear Cheque #{chequeNumber}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <p>This marks the cheque as <strong>cleared</strong> — funds have been credited to your bank account.</p>
          {depositedToAccount && <p className="mt-1 font-medium">Deposited to: {depositedToAccount}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a screenshot of your bank statement or confirmation as proof that the amount has been credited (recommended for future verification).
        </p>
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} />
          <Button variant="outline" size="sm" className="gap-1.5 w-full" disabled={reading} onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4" /> {proofUrl ? "Replace clearance proof" : "Upload clearance proof (recommended)"}
          </Button>
          {proofUrl && (
            <div className="relative">
              <img src={proofUrl} alt="Clearance proof" className="w-full max-h-48 object-contain rounded-lg border bg-green-50" />
              <button onClick={() => setProofUrl(null)} className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(proofUrl || undefined)} className="gap-1.5 bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="w-4 h-4" /> Confirm Cleared
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Swap Modal — PDC to cash / bank transfer ── */
function SwapModal({ chequeNumber, amount, who, onConfirm, onClose, isPending }: {
  chequeNumber: string; amount: string; who: string;
  onConfirm: (method: string, notes: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Swap PDC to Payment</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-sm">
          <p className="font-semibold text-amber-800">Cheque #{chequeNumber}</p>
          <p className="text-amber-700">{money(amount)} from {who}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Customer is paying by cash or bank transfer instead. The cheque will be cancelled and returned, and the payment recorded.
        </p>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Customer paid cash at counter" className="mt-1" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment method:</p>
          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" className="justify-start gap-2 h-auto py-2.5" disabled={isPending}
              onClick={() => onConfirm("cash", notes)}>
              <Banknote className="w-4 h-4 text-green-600" />
              <div className="text-left"><p className="font-semibold text-sm">Cash</p><p className="text-[11px] text-muted-foreground">Customer paid in cash — cheque returned</p></div>
            </Button>
            <Button variant="outline" className="justify-start gap-2 h-auto py-2.5" disabled={isPending}
              onClick={() => onConfirm("bank_transfer", notes)}>
              <Landmark className="w-4 h-4 text-blue-600" />
              <div className="text-left"><p className="font-semibold text-sm">Bank Transfer</p><p className="text-[11px] text-muted-foreground">Customer transferred to our account — cheque returned</p></div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Recovery Modal ── */
function RecoveryModal({ chequeNumber, amount, who, onConfirm, onClose, isPending }: {
  chequeNumber: string; amount: string; who: string;
  onConfirm: (status: string, notes: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Recover Bounced Cheque</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-sm">
          <p className="font-semibold text-rose-700">Cheque #{chequeNumber}</p>
          <p className="text-rose-600">{money(amount)} from {who}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recovery notes (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Contacted customer, will provide replacement by Thursday" className="mt-1" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Choose action:</p>
          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" className="justify-start gap-2 h-auto py-2.5" disabled={isPending}
              onClick={() => onConfirm("replacement_requested", notes)}>
              <RefreshCw className="w-4 h-4 text-orange-600" />
              <div className="text-left"><p className="font-semibold text-sm">Request Replacement Cheque</p><p className="text-[11px] text-muted-foreground">Ask the customer/supplier for a new cheque</p></div>
            </Button>
            <Button variant="outline" className="justify-start gap-2 h-auto py-2.5" disabled={isPending}
              onClick={() => onConfirm("cash_requested", notes)}>
              <Banknote className="w-4 h-4 text-green-600" />
              <div className="text-left"><p className="font-semibold text-sm">Request Cash Payment</p><p className="text-[11px] text-muted-foreground">Ask for the amount in cash instead</p></div>
            </Button>
            <Button variant="outline" className="justify-start gap-2 h-auto py-2.5" disabled={isPending}
              onClick={() => onConfirm("cash_received", notes)}>
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <div className="text-left"><p className="font-semibold text-sm">Cash Already Received</p><p className="text-[11px] text-muted-foreground">Amount already recovered in cash — books to cash flow</p></div>
            </Button>
            <Button variant="outline" className="justify-start gap-2 h-auto py-2.5 border-red-200 hover:bg-red-50" disabled={isPending}
              onClick={() => { if (window.confirm("Write off this bounced cheque? This marks it as an unrecoverable loss.")) onConfirm("written_off", notes); }}>
              <XCircle className="w-4 h-4 text-red-500" />
              <div className="text-left"><p className="font-semibold text-sm text-red-700">Write Off</p><p className="text-[11px] text-muted-foreground">Mark as unrecoverable loss</p></div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Replacement Cheque Modal ── */
function ReplaceModal({ originalNumber, defaultBank, defaultAmount, onConfirm, onClose, isPending }: {
  originalNumber: string; defaultBank: string; defaultAmount: string;
  onConfirm: (data: { chequeNumber: string; bankName: string; amount: string; chequeDate: string }) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState(defaultBank);
  const [amount, setAmount] = useState(defaultAmount);
  const [chequeDate, setChequeDate] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Replacement Cheque</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter the details of the replacement cheque for bounced #{originalNumber}. The bounced cheque will be marked as "Replacement received".
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">New cheque number *</label>
            <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="e.g. 987654" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">Bank *</label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">Amount *</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">Cheque date *</label>
            <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!chequeNumber || !bankName || !amount || !chequeDate || isPending}
            onClick={() => onConfirm({ chequeNumber, bankName, amount, chequeDate })}>
            Create Replacement
          </Button>
        </div>
      </div>
    </div>
  );
}
