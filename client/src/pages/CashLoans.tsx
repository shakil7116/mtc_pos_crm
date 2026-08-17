import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Landmark, ArrowDownCircle, ArrowUpCircle, HandCoins, Coins, PiggyBank,
  RotateCcw, Camera, ImageIcon, X, Pencil, Check, AlertTriangle,
} from "lucide-react";
import { money, CHART, MetricCard, HeroBalance, pctDelta, runningTotal } from "@/components/finance/kit";

const today = () => new Date().toISOString().slice(0, 10);

type Kind = "injection" | "repayment" | "lend_out" | "collection" | "profit_withdrawal";

/* Movement taxonomy — mirrors the server ledger. `dir` sets the sign/side;
   colours drive the badge + amount; `btn` styles the entry button. */
const KIND: Record<Kind, { label: string; short: string; dir: "in" | "out"; icon: any; badge: string; amt: string; btn: string; accent: string }> = {
  injection:         { label: "Cash Injection",   short: "Injection",   dir: "in",  icon: ArrowDownCircle, badge: "bg-emerald-500/10 text-emerald-700", amt: "text-emerald-700", btn: "bg-emerald-600 text-white hover:bg-emerald-700", accent: CHART.emerald },
  repayment:         { label: "Repay a Loan",      short: "Repayment",   dir: "out", icon: ArrowUpCircle,   badge: "bg-red-500/10 text-red-700",         amt: "text-red-600",     btn: "bg-[#1e2a3a] text-white hover:bg-[#2a3a4f]",     accent: CHART.red },
  lend_out:          { label: "Lend Money Out",    short: "Lent Out",    dir: "out", icon: HandCoins,       badge: "bg-blue-500/10 text-blue-700",       amt: "text-blue-600",    btn: "bg-blue-600 text-white hover:bg-blue-700",       accent: CHART.blue },
  collection:        { label: "Collect Money",     short: "Collected",   dir: "in",  icon: Coins,           badge: "bg-emerald-500/10 text-emerald-700", amt: "text-emerald-700", btn: "bg-emerald-600 text-white hover:bg-emerald-700", accent: CHART.emerald },
  profit_withdrawal: { label: "Profit Withdrawal", short: "Profit Draw", dir: "out", icon: PiggyBank,       badge: "bg-purple-500/10 text-purple-700",   amt: "text-purple-600",  btn: "bg-purple-600 text-white hover:bg-purple-700",   accent: CHART.purple },
};

// Parent kinds that accept a settlement → child kind + row-action label.
const SETTLE_OF: Partial<Record<Kind, { kind: Kind; label: string }>> = {
  injection: { kind: "repayment", label: "Repay" },
  lend_out:  { kind: "collection", label: "Collect" },
};
const isSettlement = (k: Kind | null) => k === "repayment" || k === "collection";

// Party parsing — new kinds store the person as "To:"/"Taken by:", injections as
// "From:". One helper reads them all; another strips the prefix for editing.
const partyOf = (row: any) => {
  const m = (row?.note || "").match(/^(?:From|To|Taken by):\s*([^·]+)/i);
  return m ? m[1].trim() : "";
};
const extraNote = (row: any) =>
  (row?.note || "").replace(/^(?:From|To|Taken by):\s*[^·]+\s*·?\s*/i, "").replace(/\s*·?\s*to be repaid\s*$/i, "").trim();

const blankForm = () => ({ amount: "", source: "Owner", sourceName: "", method: "Cash", date: today(), note: "", willRepay: true, proofUrl: "" });

export default function CashLoans({ embedded }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mode, setMode] = useState<Kind | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [repayingRef, setRepayingRef] = useState<any>(null); // the parent being settled
  const [f, setF] = useState<any>(blankForm());
  const [viewProof, setViewProof] = useState<string | null>(null);
  const proofRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setF(blankForm());
    setMode(null);
    setEditingId(null);
    setRepayingRef(null);
    if (proofRef.current) proofRef.current.value = "";
  };

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/owner-loans"],
    queryFn: () => fetch("/api/owner-loans").then((r) => r.json()),
  });

  const mut = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch("/api/owner-loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const err: any = new Error(j.message || "Failed");
        if (r.status === 409 && j.code === "INSUFFICIENT_FUNDS") err.funds = j;
        throw err;
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/owner-loans"] });
      qc.invalidateQueries({ queryKey: ["/api/cashflow/position"] });
      toast({ title: "Recorded", description: "Cash position updated." });
      resetForm();
    },
    onError: (e: any, variables: any) => {
      if (e?.funds && isAdmin && !variables?.override) {
        const fn = e.funds;
        const where = fn.instrument === "bank" ? "bank" : "till (cash in hand)";
        const reason = window.prompt(
          `${fn.message}\n\nIf the real ${where} balance is higher than the system shows, you can override.\nType a reason to override (leave blank to cancel):`,
        );
        if (reason && reason.trim()) mut.mutate({ ...variables, override: true, overrideReason: reason.trim() });
        return;
      }
      if (e?.funds) { toast({ title: "Insufficient funds", description: String(e.message || ""), variant: "destructive" }); return; }
      toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" });
    },
  });

  const editMut = useMutation({
    mutationFn: async ({ id, ...body }: any) => {
      const r = await fetch(`/api/owner-loans/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/owner-loans"] });
      qc.invalidateQueries({ queryKey: ["/api/cashflow/position"] });
      toast({ title: "Updated", description: "Record updated successfully." });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  // Reconstruct note + source from the form, per kind — used by create AND edit
  // so the "From:/To:/Taken by:" convention stays consistent everywhere.
  function noteSourceFor(k: Kind) {
    if (k === "injection") return { source: f.source, note: [f.sourceName && `From: ${f.sourceName}`, f.note, f.willRepay ? "to be repaid" : ""].filter(Boolean).join(" · ") };
    if (k === "lend_out") return { source: "Lent Out", note: [f.sourceName && `To: ${f.sourceName}`, f.note].filter(Boolean).join(" · ") };
    if (k === "profit_withdrawal") return { source: "Profit", note: [f.sourceName && `Taken by: ${f.sourceName}`, f.note].filter(Boolean).join(" · ") };
    return { source: f.source, note: f.note }; // repayment / collection
  }

  function submit() {
    if (!mode) return;
    const { source, note } = noteSourceFor(mode);
    if (editingId) {
      editMut.mutate({ id: editingId, amount: Number(f.amount), source, method: f.method, date: f.date, note: note || f.note, proofUrl: f.proofUrl || undefined });
      return;
    }
    const payload: any = { type: mode, amount: Number(f.amount), source, method: f.method, date: f.date, note, proofUrl: f.proofUrl || undefined };
    if (isSettlement(mode) && repayingRef?.id) payload.refInjectionId = repayingRef.id;
    mut.mutate(payload);
  }

  // Point a settlement form at a specific parent (row "Repay"/"Collect" click or
  // the picker). Every settlement is tied to a real parent → no orphans possible.
  function applySettleTarget(row: any, kind: Kind) {
    const party = partyOf(row) || row.source;
    const remaining = row.remainingAmount ?? Number(row.amount);
    setRepayingRef(row);
    setEditingId(null);
    setMode(kind);
    setF({ ...blankForm(), amount: remaining > 0 ? String(remaining) : "", source: row.source, method: row.method,
      note: kind === "repayment" ? `Repaying ${party}` : `Collecting from ${party}` });
  }
  function startSettleFor(row: any) {
    const st = SETTLE_OF[row.type as Kind];
    if (!st) return;
    applySettleTarget(row, st.kind);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openForm(k: Kind) {
    resetForm();
    setMode(k);
    if (k === "profit_withdrawal") setF({ ...blankForm(), sourceName: "Owner" });
  }

  function startEdit(row: any) {
    const hasParty = ["injection", "lend_out", "profit_withdrawal"].includes(row.type);
    setEditingId(row.id);
    setRepayingRef(null);
    setMode(row.type);
    setF({
      amount: String(Number(row.amount)),
      source: row.source || "Owner",
      sourceName: hasParty ? partyOf(row) : "",
      method: row.method || "Cash",
      date: row.date || today(),
      note: hasParty ? extraNote(row) : (row.note || ""),
      willRepay: (row.note || "").includes("to be repaid"),
      proofUrl: row.proofUrl || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (isLoading) return <div className="p-6 max-w-4xl mx-auto space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /></div>;
  const s = data?.summary || {};
  const rows = data?.rows || [];

  // Settlement candidates for the picker (parents with a balance left).
  const settleParents = mode === "repayment" ? rows.filter((r: any) => r.type === "injection" && (r.remainingAmount ?? Number(r.amount)) > 0)
    : mode === "collection" ? rows.filter((r: any) => r.type === "lend_out" && (r.remainingAmount ?? Number(r.amount)) > 0) : [];
  const settleRemaining = repayingRef ? (repayingRef.remainingAmount ?? Number(repayingRef.amount)) : Infinity;
  const needsTarget = isSettlement(mode) && !editingId && !repayingRef;
  const overLimit = isSettlement(mode) && !editingId && !!repayingRef && Number(f.amount) > settleRemaining + 0.005;

  const whoLabel = mode === "injection" ? "Source name (who gave)" : mode === "lend_out" ? "Lent to (who)" : "Taken by (who)";
  const hasWho = mode === "injection" || mode === "lend_out" || mode === "profit_withdrawal";
  const km = mode ? KIND[mode] : null;

  // "We owe" trend — only injections (+) and repayments (−) move what we owe.
  const oweSeries = runningTotal((rows as any[]).map((r: any) => ({
    date: r.date, net: r.type === "injection" ? (Number(r.amount) || 0) : r.type === "repayment" ? -(Number(r.amount) || 0) : 0,
  })));
  const oweDelta = oweSeries.length ? pctDelta(Number(s.outstanding || 0), oweSeries[0].y) : null;

  return (
    <div className={cn("space-y-5", embedded ? "max-w-5xl mx-auto px-4 md:px-6 pb-6" : "p-4 md:p-6 max-w-4xl mx-auto")}>
      {!embedded && (
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cash &amp; Loans</h1>
            <span className="text-[13px] text-muted-foreground">financing — borrowed, lent, and owner draws (kept separate from expenses)</span>
          </div>
        </div>
      )}

      {/* Headline: what we still owe, with its trend */}
      <HeroBalance
        label="We owe — still outstanding"
        value={money(s.outstanding || 0)}
        delta={oweDelta}
        deltaInvert
        deltaSub={`${money(s.injected || 0)} borrowed · ${money(s.repaid || 0)} repaid`}
        color={CHART.purple}
        trend={oweSeries.length >= 2 ? oweSeries : undefined}
      />

      {/* Other side of the ledger + owner draws */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-children">
        <MetricCard icon={HandCoins} label="Owed to us" accent={CHART.blue}
          value={money(s.receivable || 0)} valueClassName={(s.receivable || 0) > 0.005 ? "text-blue-700" : "text-emerald-700"}
          sub={`${money(s.lentOut || 0)} lent out · ${money(s.collected || 0)} back`} />
        <MetricCard icon={PiggyBank} label="Profit taken by owner" accent={CHART.purple}
          value={money(s.profitTaken || 0)} valueClassName="text-purple-700"
          sub="withdrawn from the business" />
      </div>

      {/* Legacy reconciliation notice — settlements linked to nothing (or over a
          balance). New ones can't be created this way; these are historical. */}
      {((s.unlinkedRepaid || 0) > 0.005 || (s.unlinkedCollected || 0) > 0.005) && (
        <div className="rounded-lg border border-amber-200 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {(s.unlinkedRepaid || 0) > 0.005 && <><b className="font-mono">{money(s.unlinkedRepaid)}</b> in repayments</>}
            {(s.unlinkedRepaid || 0) > 0.005 && (s.unlinkedCollected || 0) > 0.005 && " and "}
            {(s.unlinkedCollected || 0) > 0.005 && <><b className="font-mono">{money(s.unlinkedCollected)}</b> in collections</>}
            {" "}aren&apos;t linked to any loan (legacy entries or over-payments). They moved cash but settle nothing, so they&apos;re excluded from the tiles above. Edit those rows to correct them.
          </span>
        </div>
      )}

      {/* Entry buttons — grouped IN / OUT */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold mr-1">In</span>
        <Button size="sm" className={cn("gap-1.5", KIND.injection.btn)} onClick={() => openForm("injection")}><ArrowDownCircle className="w-4 h-4" /> Cash Injection</Button>
        <Button size="sm" className={cn("gap-1.5", KIND.collection.btn)} onClick={() => openForm("collection")}><Coins className="w-4 h-4" /> Collect Money</Button>
        <span className="w-px h-5 bg-border mx-1" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold mr-1">Out</span>
        <Button size="sm" className={cn("gap-1.5", KIND.repayment.btn)} onClick={() => openForm("repayment")}><ArrowUpCircle className="w-4 h-4" /> Repay a Loan</Button>
        <Button size="sm" className={cn("gap-1.5", KIND.lend_out.btn)} onClick={() => openForm("lend_out")}><HandCoins className="w-4 h-4" /> Lend Money Out</Button>
        <Button size="sm" className={cn("gap-1.5", KIND.profit_withdrawal.btn)} onClick={() => openForm("profit_withdrawal")}><PiggyBank className="w-4 h-4" /> Profit Withdrawal</Button>
      </div>

      {/* Form */}
      {mode && km && (
        <div className="section-card !bg-muted/30 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-3">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <km.icon className="w-4 h-4" style={{ color: km.accent }} />
              {editingId ? `Edit ${km.short}` : km.label}
              <span className="text-[11px] font-normal text-muted-foreground">· {km.dir === "in" ? "money in" : "money out"}</span>
            </div>
            {isSettlement(mode) && repayingRef && !editingId && (
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <RotateCcw className="w-3 h-3" />
                {mode === "repayment" ? "Repaying" : "Collecting from"}: <span className="font-semibold text-foreground">{partyOf(repayingRef) || repayingRef.source}</span>
                <span>· Original: {money(repayingRef.amount)}</span>
                {repayingRef.settledAmount > 0 && <span>· Already {mode === "repayment" ? "repaid" : "collected"}: {money(repayingRef.settledAmount)}</span>}
                {repayingRef.remainingAmount > 0 && <span className="font-semibold text-purple-700">· Remaining: {money(repayingRef.remainingAmount)}</span>}
              </div>
            )}
          </div>

          {/* Settlement parent picker */}
          {isSettlement(mode) && !editingId && (
            <div className="col-span-2 sm:col-span-3">
              <label className="text-xs font-medium">{mode === "repayment" ? "Repaying which loan?" : "Collecting which lent-out amount?"}</label>
              {settleParents.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Nothing outstanding to {mode === "repayment" ? "repay" : "collect"} — all settled.</p>
              ) : (
                <select className="w-full h-9 border rounded px-2 text-sm bg-background" value={repayingRef?.id ?? ""}
                  onChange={(e) => {
                    const inj = settleParents.find((x: any) => x.id === Number(e.target.value));
                    if (inj) applySettleTarget(inj, mode); else setRepayingRef(null);
                  }}>
                  <option value="">— Select —</option>
                  {settleParents.map((p: any) => {
                    const who = partyOf(p);
                    return <option key={p.id} value={p.id}>{`${who || p.source} — remaining ${money(p.remainingAmount ?? p.amount)}`}</option>;
                  })}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium">Amount (QAR)</label>
            <Input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={cn("h-9", overLimit && "border-red-400")} />
            {overLimit && <p className="mt-1 text-[11px] text-red-600">Max {money(settleRemaining)} — can&apos;t {mode === "repayment" ? "repay" : "collect"} more than the remaining balance.</p>}
          </div>

          {mode === "injection" && (
            <div><label className="text-xs font-medium">Source type</label>
              <select className="w-full h-9 border rounded px-2 text-sm bg-background" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
                {["Owner", "Office Fund", "Customer Loan", "Bank Loan", "Other"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          )}

          {hasWho ? (
            <div><label className="text-xs font-medium">{whoLabel}</label>
              <Input value={f.sourceName} onChange={(e) => setF({ ...f, sourceName: e.target.value })}
                placeholder={mode === "injection" ? "e.g. Shakil personal" : mode === "lend_out" ? "e.g. main owner" : "e.g. Owner"} className="h-9" />
            </div>
          ) : (
            <div><label className="text-xs font-medium">Note</label>
              <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="reference" className="h-9" /></div>
          )}

          <div><label className="text-xs font-medium">Method</label>
            <select className="w-full h-9 border rounded px-2 text-sm bg-background" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              {["Cash", "Bank Transfer"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium">Date</label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-9" /></div>

          {hasWho && <div><label className="text-xs font-medium">Notes</label><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="optional" className="h-9" /></div>}

          {mode === "injection" && (
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer self-end pb-2">
              <input type="checkbox" checked={f.willRepay} onChange={(e) => setF({ ...f, willRepay: e.target.checked })} className="rounded" />
              This is a loan (we&apos;ll repay it)
            </label>
          )}

          <div className="col-span-2 sm:col-span-3">
            <label className="text-xs font-medium">Proof of Payment</label>
            <input ref={proofRef} type="file" accept="image/*" className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setF((p: any) => ({ ...p, proofUrl: reader.result as string }));
                reader.readAsDataURL(file);
              }} />
            <div className="flex items-center gap-2 mt-1">
              <Button variant="outline" size="sm" type="button" className="gap-1.5" onClick={() => proofRef.current?.click()}>
                <Camera className="w-3.5 h-3.5" />
                {f.proofUrl ? "Change Photo" : "Upload Receipt / Screenshot"}
              </Button>
              {f.proofUrl && (
                <Button variant="ghost" size="sm" className="text-red-500 gap-1 px-2" onClick={() => { setF((p: any) => ({ ...p, proofUrl: "" })); if (proofRef.current) proofRef.current.value = ""; }}>
                  <X className="w-3.5 h-3.5" /> Remove
                </Button>
              )}
            </div>
            {f.proofUrl && <img src={f.proofUrl} className="mt-2 h-24 object-cover rounded border cursor-pointer" alt="Proof" onClick={() => setViewProof(f.proofUrl)} />}
          </div>
          <div className="col-span-2 sm:col-span-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
            <Button size="sm" className={cn(editingId ? "bg-blue-600 text-white" : km.btn)}
              disabled={!(Number(f.amount) > 0) || mut.isPending || editMut.isPending || needsTarget || overLimit} onClick={submit}>
              {editingId ? "Save Changes" : "Record"}
            </Button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="section-card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30"><h2 className="font-semibold text-sm">All money movements</h2></div>
        {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No entries yet.</p> : (
          <div className="divide-y">
            {rows.map((l: any) => {
              const k = KIND[l.type as Kind] || KIND.injection;
              const st = SETTLE_OF[l.type as Kind];
              const fullySettled = !!st && l.remainingAmount !== undefined && l.remainingAmount <= 0;
              const canSettle = !!st && !fullySettled;
              return (
                <div key={l.id} className={cn(
                  "px-4 py-2.5 flex items-center justify-between text-sm gap-2 group",
                  canSettle && "cursor-pointer hover:bg-muted/40 transition-colors",
                  fullySettled && "opacity-60",
                )} onClick={() => canSettle && startSettleFor(l)}>
                  <div className="min-w-0 flex-1">
                    <span className={cn("text-xs font-bold uppercase px-1.5 py-0.5 rounded mr-2", fullySettled ? "bg-muted text-muted-foreground" : k.badge)}>
                      {k.short}{fullySettled ? " ✓" : ""}
                    </span>
                    <span>{l.source} · {l.method} · {l.date ? format(new Date(l.date), "dd MMM yy") : ""}</span>
                    {l.note && <span className="text-muted-foreground"> · {l.note}</span>}
                    {st && !fullySettled && l.settledAmount > 0 && (
                      <span className="text-xs text-purple-600 ml-1.5">({l.type === "injection" ? "repaid" : "collected"} {money(l.settledAmount)}, remaining {money(l.remainingAmount)})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {l.proofUrl && (
                      <button className="text-muted-foreground hover:text-foreground p-1" title="View proof"
                        onClick={(e) => { e.stopPropagation(); setViewProof(l.proofUrl); }}>
                        <ImageIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button className="text-muted-foreground/40 hover:text-blue-600 p-1 transition-colors" title="Edit"
                      onClick={(e) => { e.stopPropagation(); startEdit(l); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {canSettle && (
                      <span className="text-[10px] font-semibold text-muted-foreground/50 group-hover:text-blue-600 uppercase tracking-wide transition-colors">{st!.label}</span>
                    )}
                    {fullySettled && <Check className="w-4 h-4 text-emerald-500" />}
                    <span className={cn("font-mono font-semibold", k.amt)}>{k.dir === "in" ? "+" : "−"} {money(l.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewProof && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setViewProof(null)}>
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <button className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg hover:bg-gray-100" onClick={() => setViewProof(null)}>
              <X className="w-5 h-5" />
            </button>
            <img src={viewProof} className="w-full rounded-lg shadow-2xl" alt="Payment proof" />
          </div>
        </div>
      )}
    </div>
  );
}
