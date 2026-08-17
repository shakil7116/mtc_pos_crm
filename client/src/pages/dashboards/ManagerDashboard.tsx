import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, CheckCircle2, XCircle, Wrench, BarChart3, Users, AlertTriangle } from "lucide-react";
import { money, todayStr, fetchArray } from "./shared";

/**
 * Manager Dashboard (Module 8C-lite) — ALL locations combined.
 * One approvals hub (returns + maintenance), today's sales everywhere,
 * outstanding issues, staff activity. Everything one-tap on mobile.
 */
export default function ManagerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = todayStr();

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/dashboard/summary"],
    queryFn: () => fetch("/api/dashboard/summary").then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const { data: returns = [] } = useQuery<any[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetchArray("/api/returns"),
    refetchInterval: 30_000,
  });
  const { data: issues = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouse-issues"],
    queryFn: () => fetchArray("/api/warehouse-issues"),
    refetchInterval: 60_000,
  });
  const { data: docsAll = [] } = useQuery<any[]>({
    queryKey: ["/api/documents"],
    queryFn: () => fetchArray("/api/documents"),
    refetchInterval: 60_000,
  });
  const { data: usersList = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetchArray("/api/users"),
  });
  const { data: cheques = [] } = useQuery<any[]>({
    queryKey: ["/api/cheques"],
    queryFn: () => fetchArray("/api/cheques"),
    refetchInterval: 60_000,
  });
  const { data: cashPos } = useQuery<any>({
    queryKey: ["/api/cashflow/position"],
    queryFn: () => fetch("/api/cashflow/position").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const pendingReturns = returns.filter((r) => r.status === "pending");
  const openIssues = issues.filter((i) => i.status === "open");
  const activeIssues = issues.filter((i) => i.status !== "resolved");
  const todayInvs = docsAll.filter((d) => d.type === "INV" && d.date === today && d.status !== "void" && d.transactionMode !== "demo");
  const totalToday = (Number(summary?.cashSalesToday) || 0) + (Number(summary?.creditSalesToday) || 0);

  // Staff activity: today's invoices grouped by creator.
  const byStaff = new Map<number, { n: number; amt: number }>();
  for (const d of todayInvs) {
    if (!d.createdBy) continue;
    const cur = byStaff.get(d.createdBy) || { n: 0, amt: 0 };
    cur.n++; cur.amt += Number(d.total || 0);
    byStaff.set(d.createdBy, cur);
  }

  const approveReturnMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/returns/${id}/approve`, { method: "POST" }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/returns"] }); toast({ title: "Return approved" }); },
    onError: (e: any) => toast({ title: "Cannot approve", description: String(e?.message || ""), variant: "destructive" }),
  });
  const rejectReturnMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/returns/${id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Rejected by manager from dashboard" }) }).then((r) => { if (!r.ok) throw new Error("failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/returns"] }); toast({ title: "Return rejected" }); },
  });
  const approveIssueMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/warehouse-issues/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) }).then((r) => { if (!r.ok) throw new Error("failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/warehouse-issues"] }); toast({ title: "Issue approved — arrange the worker" }); },
  });

  const approvalsCount = pendingReturns.length + openIssues.length;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
          <ClipboardCheck className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Manager — All Locations</h1>
          <p className="text-sm text-muted-foreground">{user?.name} · combined view</p>
        </div>
        {approvalsCount > 0 && (
          <span className="ml-auto text-sm font-bold bg-amber-500 text-white rounded-full px-3 py-1">{approvalsCount} to approve</span>
        )}
      </header>

      {/* Today's sales all locations */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/documents" className="rounded-xl border p-3 hover:shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Today's sales — all locations</p>
          <p className="font-mono font-bold text-xl text-[#1e2a3a]">{money(totalToday)}</p>
          <p className="text-[11px] text-muted-foreground">{todayInvs.length} invoices</p>
        </Link>
        <Link href="/reports" className="rounded-xl border p-3 hover:shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
          <p className="font-mono font-bold text-xl text-red-600">{money(summary?.totalOutstanding)}</p>
          <p className="text-[11px] text-muted-foreground">{(summary?.paymentReminders || []).length} unpaid invoices</p>
        </Link>
      </div>

      {/* Approvals hub — one-tap approve/reject */}
      <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending approvals</h2>
        {approvalsCount === 0 && <p className="text-sm text-muted-foreground">Nothing waiting. ✓</p>}

        {pendingReturns.map((r) => (
          <div key={`ret-${r.id}`} className="rounded-lg border bg-white p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">Return {r.voucherNumber}</span>
              <span className="font-mono">{money(r.refundAmount || r.total)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{r.customerName || "Walk-in"} · vs {r.originalInvoiceNumber}{r.reason ? ` — ${r.reason}` : ""}</p>
            <div className="flex gap-2">
              <button onClick={() => approveReturnMut.mutate(r.id)} disabled={approveReturnMut.isPending}
                className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" /> Approve</button>
              <button onClick={() => { if (window.confirm("Reject this return? Nothing will change.")) rejectReturnMut.mutate(r.id); }}
                className="flex-1 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-semibold flex items-center justify-center gap-1"><XCircle className="w-4 h-4" /> Reject</button>
            </div>
          </div>
        ))}

        {openIssues.map((i) => (
          <div key={`iss-${i.id}`} className="rounded-lg border bg-white p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-semibold flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> Maintenance issue #{i.id}</span>
              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${i.urgency === "critical" ? "bg-red-600 text-white" : "bg-slate-100"}`}>{i.urgency}</span>
            </div>
            <p className="text-xs text-muted-foreground">{i.description}</p>
            <button onClick={() => approveIssueMut.mutate(i.id)} disabled={approveIssueMut.isPending}
              className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" /> Approve — arrange worker</button>
          </div>
        ))}

        <Link href="/approvals" className="block text-center text-xs text-blue-600 hover:underline">Open full approvals page →</Link>
      </section>

      {/* Outstanding issues needing attention */}
      {activeIssues.length > 0 && (
        <section className="rounded-xl border p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Issues in progress ({activeIssues.length})
          </h2>
          <div className="space-y-1.5">
            {activeIssues.map((i) => (
              <div key={i.id} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2">
                <span className="truncate flex-1">{i.description}</span>
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 shrink-0">{i.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* PDC + cash position (8C shared admin/manager) */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/finance?tab=cheques" className="rounded-xl border p-3 hover:shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">PDC due (today or past)</p>
          {(() => {
            const due = cheques.filter((c) => ["pending", "deposited"].includes(c.status) && c.chequeDate <= today);
            return <>
              <p className="font-mono font-bold text-xl text-amber-600">{due.length}</p>
              <p className="text-[11px] text-muted-foreground">{money(due.reduce((s, c) => s + Number(c.amount || 0), 0))} to action</p>
            </>;
          })()}
        </Link>
        <Link href="/finance?tab=cash-position" className="rounded-xl border p-3 hover:shadow-sm block">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cash position</p>
          <p className={`font-mono font-bold text-xl ${Number(cashPos?.total) < 0 ? "text-red-600" : "text-green-700"}`}>{money(cashPos?.total)}</p>
          <p className="text-[11px] text-muted-foreground">Hand {money(cashPos?.cashInHand)} · Bank {money(cashPos?.bank)}</p>
        </Link>
      </div>

      {/* Staff activity today */}
      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
          <Users className="w-3.5 h-3.5" /> Staff activity today
        </h2>
        {byStaff.size === 0 && <p className="text-sm text-muted-foreground">No invoices yet today.</p>}
        <div className="space-y-1.5">
          {Array.from(byStaff.entries()).map(([uid, v]) => {
            const staff = usersList.find((u) => u.id === uid);
            return (
              <div key={uid} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2">
                <span className="font-medium flex-1">{staff?.name || `User #${uid}`}</span>
                <span className="text-muted-foreground text-xs">{v.n} invoice{v.n === 1 ? "" : "s"}</span>
                <span className="font-mono font-semibold">{money(v.amt)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <Link href="/reports" className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#1e2a3a] text-[#1e2a3a] py-3 text-sm font-semibold hover:bg-slate-50">
        <BarChart3 className="w-4 h-4" /> Full Reports
      </Link>
    </div>
  );
}
