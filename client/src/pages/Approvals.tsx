import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import ApprovalRequestModal from "@/components/ApprovalRequestModal";
import { CorrectButton, CorrectedBadge } from "@/components/CorrectionModal";
import {
  CheckCircle2, XCircle, Clock, PackageCheck, ExternalLink, RotateCcw,
  CreditCard, Percent, Ban, MessageSquareText, Plus, ShieldCheck, Hourglass, Inbox,
} from "lucide-react";

interface ReturnRow {
  id: number;
  voucherNumber: string | null;
  originalInvoiceId: number;
  originalInvoiceNumber: string | null;
  customerName: string | null;
  type: string;
  status: string;
  reason: string | null;
  refundMethod: string | null;
  refundAmount: string | null;
  total: string | null;
  date: string | null;
  createdAt?: string | null;
}

interface RequestRow {
  id: number;
  requestNumber: string | null;
  type: string;                 // credit_limit | discount | void | manual
  status: string;               // pending | approved | rejected | cancelled
  requestedByName: string | null;
  title: string;
  summary: string | null;
  message: string | null;
  amount: string | null;
  entityType: string | null;
  entityId: number | null;
  decidedByName: string | null;
  decisionNote: string | null;
  createdAt: string | null;
  decidedAt: string | null;
}

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;

const timeAgo = (iso?: string | null) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Per-type icon + accent, tuned for both light and dark.
const TYPE_META: Record<string, { label: string; icon: any; tint: string }> = {
  credit_limit: { label: "Credit override", icon: CreditCard, tint: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  discount:     { label: "Discount",        icon: Percent,    tint: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  void:         { label: "Void",            icon: Ban,        tint: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  manual:       { label: "Request",         icon: MessageSquareText, tint: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  return:       { label: "Return",          icon: RotateCcw,  tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

const STATUS_PILL: Record<string, string> = {
  approved:  "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  pending:   "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

type Filter = "all" | "credit" | "returns" | "discounts" | "voids" | "manual";

export default function Approvals() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isApprover = user?.role === "admin" || user?.role === "manager";

  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const [filter, setFilter] = useState<Filter>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  // Unified reject box: which item is being rejected + the reason.
  const [rejecting, setRejecting] = useState<{ kind: "return" | "request"; id: number } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [payout, setPayout] = useState<Record<number, string>>({});

  const { data: returns = [], isLoading: loadingReturns } = useQuery<ReturnRow[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetch("/api/returns").then((r) => r.json()),
    refetchInterval: 20000,
  });
  const { data: requests = [], isLoading: loadingRequests } = useQuery<RequestRow[]>({
    queryKey: ["/api/approvals"],
    queryFn: () => fetch("/api/approvals").then((r) => r.json()),
    refetchInterval: 20000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/returns"] });
    qc.invalidateQueries({ queryKey: ["/api/approvals"] });
    qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    qc.invalidateQueries({ queryKey: ["/api/documents"] });
  };

  // ── Return mutations (unchanged pipeline) ──
  const approveReturn = useMutation({
    mutationFn: ({ id, refundMethod }: { id: number; refundMethod?: string }) =>
      fetch(`/api/returns/${id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refundMethod ? { refundMethod } : {}),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Approve failed"); return r.json(); }),
    onSuccess: () => { invalidate(); toast({ title: "Return approved", description: "Stock reversed and refund issued per the rules." }); },
    onError: (e: any) => toast({ title: "Cannot approve", description: String(e?.message || ""), variant: "destructive" }),
  });
  const reverseReturnApproval = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      fetch(`/api/corrections/return/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Reversal failed"); return r.json(); }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["/api/corrections"] }); toast({ title: "Approval reversed", description: "Return is pending again — correction logged." }); },
    onError: (e: any) => toast({ title: "Cannot reverse", description: String(e?.message || ""), variant: "destructive" }),
  });
  const rejectReturn = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      fetch(`/api/returns/${id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Reject failed"); return r.json(); }),
    onSuccess: () => { invalidate(); setRejecting(null); setRejectReason(""); toast({ title: "Return rejected", description: "Nothing changed. Staff notified." }); },
    onError: (e: any) => toast({ title: "Cannot reject", description: String(e?.message || ""), variant: "destructive" }),
  });

  // ── Request mutations ──
  const approveRequest = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/approvals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Approve failed"); return r.json(); }),
    onSuccess: (ar: any) => { invalidate(); toast({ title: "Request approved", description: ar?.decisionNote || "The action was carried out." }); },
    onError: (e: any) => toast({ title: "Cannot approve", description: String(e?.message || ""), variant: "destructive" }),
  });
  const rejectRequest = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      fetch(`/api/approvals/${id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Reject failed"); return r.json(); }),
    onSuccess: () => { invalidate(); setRejecting(null); setRejectReason(""); toast({ title: "Request rejected", description: "The requester was notified." }); },
    onError: (e: any) => toast({ title: "Cannot reject", description: String(e?.message || ""), variant: "destructive" }),
  });
  const cancelRequest = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/approvals/${id}/cancel`, { method: "POST" })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Cancel failed"); return r.json(); }),
    onSuccess: () => { invalidate(); toast({ title: "Request withdrawn" }); },
    onError: (e: any) => toast({ title: "Cannot withdraw", description: String(e?.message || ""), variant: "destructive" }),
  });
  const completeRequest = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/approvals/${id}/complete`, { method: "POST" })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed"); return r.json(); }),
    onSuccess: () => { invalidate(); toast({ title: "Marked as done" }); },
    onError: (e: any) => toast({ title: "Cannot complete", description: String(e?.message || ""), variant: "destructive" }),
  });

  const matchesFilter = (kind: "return" | RequestRow["type"]): boolean => {
    if (filter === "all") return true;
    if (filter === "returns") return kind === "return";
    if (filter === "credit") return kind === "credit_limit";
    if (filter === "discounts") return kind === "discount";
    if (filter === "voids") return kind === "void";
    if (filter === "manual") return kind === "manual";
    return true;
  };

  // Merge returns + requests into one timeline, split by pending/decided.
  const pending = useMemo(() => {
    const rs = returns.filter((r) => r.status === "pending").map((r) => ({ kind: "return" as const, ts: Date.parse(r.createdAt || r.date || "") || 0, r }));
    const qs = requests.filter((q) => q.status === "pending").map((q) => ({ kind: "request" as const, ts: Date.parse(q.createdAt || "") || 0, q }));
    return [...rs, ...qs].sort((a, b) => b.ts - a.ts);
  }, [returns, requests]);

  const decided = useMemo(() => {
    const rs = returns.filter((r) => r.status !== "pending").map((r) => ({ kind: "return" as const, ts: Date.parse(r.createdAt || r.date || "") || 0, r }));
    const qs = requests.filter((q) => q.status !== "pending").map((q) => ({ kind: "request" as const, ts: Date.parse(q.decidedAt || q.createdAt || "") || 0, q }));
    return [...rs, ...qs].sort((a, b) => b.ts - a.ts).slice(0, 20);
  }, [returns, requests]);

  const visible = (tab === "pending" ? pending : decided).filter((it) =>
    it.kind === "return" ? matchesFilter("return") : matchesFilter(it.q.type),
  );

  const pendingCount = pending.length;
  const counts = useMemo(() => ({
    credit: pending.filter((p) => p.kind === "request" && p.q.type === "credit_limit").length,
    returns: pending.filter((p) => p.kind === "return").length,
    discounts: pending.filter((p) => p.kind === "request" && p.q.type === "discount").length,
    voids: pending.filter((p) => p.kind === "request" && p.q.type === "void").length,
    manual: pending.filter((p) => p.kind === "request" && p.q.type === "manual").length,
  }), [pending]);

  const isLoading = loadingReturns || loadingRequests;

  // ─────────────────────────────────────────────────────────────────────────
  // Requester view — no inbox; raise a request and track your own.
  // ─────────────────────────────────────────────────────────────────────────
  if (!isApprover) {
    const mine = requests; // server already scopes to the caller for non-approvers
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Approvals</h1>
            <p className="text-sm text-muted-foreground">Send a manager a request and track its status</p>
          </div>
          <Button onClick={() => setComposerOpen(true)} className="ml-auto gap-1.5 bg-[#1e2a3a] text-white">
            <Plus className="w-4 h-4" /> New request
          </Button>
        </header>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">My requests</h2>
          {mine.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl border-border">
              <Inbox className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
              <p className="font-semibold text-foreground">No requests yet</p>
              <p className="text-sm text-muted-foreground">Raise one with “New request” above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {mine.map((q) => {
                const meta = TYPE_META[q.type] || TYPE_META.manual;
                const Icon = meta.icon;
                const statusLabel = q.status === "approved" ? "in progress" : q.status;
                const hasInvoiceLink = q.status === "approved" && q.entityId && (q.type === "credit_limit" || q.type === "discount");
                const hasVoidLink = q.status === "approved" && q.entityId && q.type === "void";
                return (
                  <div key={q.id} className={`rounded-xl border bg-card p-3.5 space-y-2 ${q.status === "approved" ? "border-blue-300 dark:border-blue-500/30 bg-blue-50/30 dark:bg-blue-500/5" : "border-border"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${meta.tint}`}><Icon className="w-3 h-3" />{meta.label}</span>
                      <span className="font-mono text-sm font-semibold text-foreground">{q.requestNumber}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(q.createdAt)}</span>
                      <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[q.status] || STATUS_PILL.pending}`}>{statusLabel}</span>
                    </div>
                    {q.summary && <p className="text-sm text-foreground">{q.summary}</p>}
                    {q.message && <p className="text-sm text-muted-foreground bg-muted/40 border border-border rounded p-2">{q.message}</p>}
                    {q.decisionNote && <p className="text-xs text-muted-foreground"><span className="font-semibold">Decision:</span> {q.decisionNote}{q.decidedByName ? ` — ${q.decidedByName}` : ""}</p>}

                    {(hasInvoiceLink || hasVoidLink) && (
                      <Link href={`/documents/${q.entityId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" /> {hasInvoiceLink ? "Open invoice" : "View voided invoice"}
                      </Link>
                    )}

                    <div className="flex gap-2">
                      {q.status === "pending" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={cancelRequest.isPending} onClick={() => cancelRequest.mutate(q.id)}>
                          Withdraw
                        </Button>
                      )}
                      {q.status === "approved" && (
                        <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" disabled={completeRequest.isPending} onClick={() => completeRequest.mutate(q.id)}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark done
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <ApprovalRequestModal open={composerOpen} onClose={() => setComposerOpen(false)} onSubmitted={() => invalidate()} />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Approver view — the unified inbox.
  // ─────────────────────────────────────────────────────────────────────────
  const renderReturnCard = (r: ReturnRow) => {
    const amt = Number(r.refundAmount || r.total || 0);
    const isRejecting = rejecting?.kind === "return" && rejecting.id === r.id;
    return (
      <div key={`ret-${r.id}`} className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/5 p-4 space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_META.return.tint}`}><RotateCcw className="w-3 h-3" />Return</span>
              <span className="font-bold text-foreground">{r.voucherNumber || `Return #${r.id}`}</span>
              <span className="text-[11px] uppercase tracking-wide bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground">{r.type}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt || r.date)}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {r.customerName || "Walk-in"} · vs{" "}
              <Link href={`/documents/${r.originalInvoiceId}`} className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5">
                {r.originalInvoiceNumber || `INV ${r.originalInvoiceId}`}<ExternalLink className="w-3 h-3" />
              </Link>
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="font-mono font-bold text-lg text-foreground">{money(amt)}</div>
          </div>
        </div>

        {r.reason && <p className="text-sm bg-background border border-border rounded p-2 text-foreground"><span className="font-semibold">Reason:</span> {r.reason}</p>}

        {isRejecting ? (
          <div className="space-y-2">
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (sent to staff)…" rows={2} />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={rejectReturn.isPending || !rejectReason.trim()} onClick={() => rejectReturn.mutate({ id: r.id, reason: rejectReason.trim() })}>Confirm reject</Button>
              <Button size="sm" variant="outline" onClick={() => { setRejecting(null); setRejectReason(""); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs bg-background border border-border rounded-lg p-2">
              <span className="font-semibold text-muted-foreground">Refund by:</span>
              {[["Cash", "Cash"], ["Bank Transfer", "Online transfer"]].map(([val, label]) => (
                <label key={val} className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name={`payout-${r.id}`} checked={(payout[r.id] || "Cash") === val} onChange={() => setPayout((p) => ({ ...p, [r.id]: val }))} />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white flex-1" disabled={approveReturn.isPending}
                onClick={() => approveReturn.mutate({ id: r.id, refundMethod: payout[r.id] || "Cash" })}>
                <CheckCircle2 className="w-4 h-4" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 flex-1" onClick={() => { setRejecting({ kind: "return", id: r.id }); setRejectReason(""); }}>
                <XCircle className="w-4 h-4" /> Reject
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRequestCard = (q: RequestRow) => {
    const meta = TYPE_META[q.type] || TYPE_META.manual;
    const Icon = meta.icon;
    const isRejecting = rejecting?.kind === "request" && rejecting.id === q.id;
    return (
      <div key={`req-${q.id}`} className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-500/5 p-4 space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${meta.tint}`}><Icon className="w-3 h-3" />{meta.label}</span>
              <span className="font-bold text-foreground">{q.requestNumber || `Request #${q.id}`}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(q.createdAt)}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {q.summary || q.title}
              {q.requestedByName ? <> · <span className="text-foreground">by {q.requestedByName}</span></> : null}
              {q.entityType === "document" && q.entityId ? (
                <> · <Link href={`/documents/${q.entityId}`} className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5">invoice<ExternalLink className="w-3 h-3" /></Link></>
              ) : null}
            </p>
          </div>
          {Number(q.amount) > 0 && (
            <div className="ml-auto text-right">
              <div className="font-mono font-bold text-lg text-foreground">{money(q.amount)}</div>
            </div>
          )}
        </div>

        {q.message && <p className="text-sm bg-background border border-border rounded p-2 text-foreground"><span className="font-semibold">Note:</span> {q.message}</p>}

        {isRejecting ? (
          <div className="space-y-2">
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (sent to the requester)…" rows={2} />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={rejectRequest.isPending || !rejectReason.trim()} onClick={() => rejectRequest.mutate({ id: q.id, note: rejectReason.trim() })}>Confirm reject</Button>
              <Button size="sm" variant="outline" onClick={() => { setRejecting(null); setRejectReason(""); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white flex-1" disabled={approveRequest.isPending} onClick={() => approveRequest.mutate(q.id)}>
              <CheckCircle2 className="w-4 h-4" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 flex-1" onClick={() => { setRejecting({ kind: "request", id: q.id }); setRejectReason(""); }}>
              <XCircle className="w-4 h-4" /> Reject
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderDecided = (it: typeof decided[number]) => {
    if (it.kind === "return") {
      const r = it.r;
      return (
        <div key={`ret-${r.id}`} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border bg-card">
          <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold ${TYPE_META.return.tint}`}><RotateCcw className="w-3 h-3" /></span>
          <span className="font-medium">{r.voucherNumber || `#${r.id}`}</span>
          <span className="text-muted-foreground truncate">{r.customerName || "Walk-in"}</span>
          <CorrectedBadge entityType="return" entityId={r.id} />
          <span className="ml-auto font-mono text-muted-foreground">{money(r.refundAmount || r.total)}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[r.status] || STATUS_PILL.pending}`}>{r.status}</span>
          {r.status === "approved" && (
            <CorrectButton label="Undo" title={`Reverse approval — ${r.voucherNumber}`} current="Approved (stock reversed, refund issued)" next="Pending (stock re-deducted, refund reversed)" onConfirm={(reason) => reverseReturnApproval.mutateAsync({ id: r.id, reason })} />
          )}
        </div>
      );
    }
    const q = it.q;
    const meta = TYPE_META[q.type] || TYPE_META.manual;
    const Icon = meta.icon;
    return (
      <div key={`req-${q.id}`} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border bg-card">
        <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold ${meta.tint}`}><Icon className="w-3 h-3" /></span>
        <span className="font-medium">{q.requestNumber || `#${q.id}`}</span>
        <span className="text-muted-foreground truncate">{q.summary || q.title}</span>
        {Number(q.amount) > 0 && <span className="ml-auto font-mono text-muted-foreground">{money(q.amount)}</span>}
        <span className={`${Number(q.amount) > 0 ? "" : "ml-auto"} text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[q.status] || STATUS_PILL.pending}`}>{q.status}</span>
      </div>
    );
  };

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: pendingCount },
    { key: "credit", label: "Credit", count: counts.credit },
    { key: "returns", label: "Returns", count: counts.returns },
    { key: "discounts", label: "Discounts", count: counts.discounts },
    { key: "voids", label: "Voids", count: counts.voids },
    { key: "manual", label: "Manual", count: counts.manual },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
          <PackageCheck className="w-5 h-5 text-amber-600 dark:text-amber-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Approvals</h1>
          <p className="text-sm text-muted-foreground">Overrides and requests awaiting your decision</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pendingCount > 0 && <span className="text-sm font-bold bg-amber-500 text-white rounded-full px-3 py-1">{pendingCount} pending</span>}
          <Button onClick={() => setComposerOpen(true)} variant="outline" size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> New
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["pending", "decided"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors ${tab === t ? "border-[#d4a017] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "pending" ? `Pending${pendingCount ? ` (${pendingCount})` : ""}` : "Decided"}
          </button>
        ))}
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${filter === f.key ? "bg-[#1e2a3a] text-white border-[#1e2a3a] dark:bg-white dark:text-[#1e2a3a] dark:border-white" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}>
            {f.label}{tab === "pending" && f.count ? ` · ${f.count}` : ""}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && visible.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-xl border-border">
          {tab === "pending" ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="font-semibold text-foreground">All caught up</p>
              <p className="text-sm text-muted-foreground">Nothing is waiting for your decision.</p>
            </>
          ) : (
            <>
              <Hourglass className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
              <p className="font-semibold text-foreground">Nothing decided yet</p>
              <p className="text-sm text-muted-foreground">Approved and rejected items show here.</p>
            </>
          )}
        </div>
      )}

      {tab === "pending" ? (
        <div className="space-y-3">
          {visible.map((it) => (it.kind === "return" ? renderReturnCard(it.r) : renderRequestCard(it.q)))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map(renderDecided)}
        </div>
      )}

      <ApprovalRequestModal open={composerOpen} onClose={() => setComposerOpen(false)} onSubmitted={() => invalidate()} />
    </div>
  );
}
