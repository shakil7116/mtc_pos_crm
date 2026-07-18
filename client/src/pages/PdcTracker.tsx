import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Landmark, Download, ArrowDownToLine, CheckCircle2, AlertOctagon, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { CorrectButton, CorrectedBadge } from "@/components/CorrectionModal";

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  deposited: "bg-blue-100 text-blue-700",
  cleared: "bg-green-100 text-green-700",
  bounced: "bg-red-600 text-white",
  cancelled: "bg-slate-200 text-slate-600",
};

export default function PdcTracker({ embedded }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  // Dashboard deep-links: /pdc?type=receivable | /pdc?type=payable | /pdc?due=today
  const urlp = (() => { try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); } })();
  const [status, setStatus] = useState("all");
  const [type, setType] = useState(urlp.get("type") || "all");
  const [bank, setBank] = useState("");
  const [search, setSearch] = useState("");
  const dueToday = urlp.get("due") === "today";

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
      toast({ title: "Status reversed", description: "Correction logged permanently." });
    },
    onError: (e: any) => toast({ title: "Cannot reverse", description: String(e?.message || ""), variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) =>
      fetch(`/api/cheques/${id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Update failed"); return r.json(); }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      qc.invalidateQueries({ queryKey: ["/api/cashflow"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: `Cheque ${v.next}`, description: v.next === "cleared" ? "Money movement booked in cash flow." : v.next === "bounced" ? "Party record flagged; admin alerted." : undefined });
    },
    onError: (e: any) => toast({ title: "Cannot update", description: String(e?.message || ""), variant: "destructive" }),
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const filtered = rows.filter((r) => {
    const st = r.displayStatus || r.status;
    if (status !== "all" && st !== status) return false;
    if (type !== "all" && (r.type || "receivable") !== type) return false;
    if (dueToday && r.chequeDate !== todayStr) return false;
    if (bank && !(r.bankName || "").toLowerCase().includes(bank.toLowerCase())) return false;
    if (search && !(r.chequeNumber || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const exportUrl = `/api/cheques/export.csv?status=${status === "all" ? "" : status}&type=${type === "all" ? "" : type}&bank=${encodeURIComponent(bank)}&q=${encodeURIComponent(search)}`;

  const pendingTotal = rows.filter((r) => ["pending", "deposited"].includes(r.status) && (r.type || "receivable") === "receivable").reduce((s, r) => s + Number(r.amount || 0), 0);
  const payableTotal = rows.filter((r) => ["pending", "deposited"].includes(r.status) && r.type === "payable").reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className={cn("max-w-5xl mx-auto space-y-5", embedded ? "px-4 sm:px-6 pb-6" : "p-4 sm:p-6")}>
      <header className="flex flex-wrap items-center gap-3">
        {!embedded && (
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-indigo-600" />
          </div>
        )}
        {!embedded && (
          <div>
            <h1 className="text-xl font-bold text-[#1e2a3a]">PDC Tracker</h1>
            <p className="text-sm text-muted-foreground">Post-dated cheques — receivable & payable</p>
          </div>
        )}
        <a href={exportUrl} className={embedded ? "" : "ml-auto"}>
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-4 h-4" /> Export CSV</Button>
        </a>
      </header>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Receivable pending</p>
          <p className="font-mono font-bold text-lg text-green-700">{money(pendingTotal)}</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Payable pending</p>
          <p className="font-mono font-bold text-lg text-red-600">{money(payableTotal)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "pending", "overdue", "deposited", "cleared", "bounced", "cancelled"].map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="receivable">Receivable</SelectItem>
            <SelectItem value="payable">Payable</SelectItem>
          </SelectContent>
        </Select>
        <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Filter bank…" className="h-8 w-36 text-xs" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cheque #…" className="h-8 w-40 text-xs" />
      </div>

      {/* Table */}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Cheque #</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Who</th>
                <th className="text-left px-3 py-2">Bank</th>
                <th className="text-left px-3 py-2">Cheque date</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const st = r.displayStatus || r.status;
                const active = ["pending", "overdue", "deposited"].includes(st);
                return (
                  <tr key={r.id} className="border-t hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-mono font-medium">
                      <Link href={`/cheques/${r.id}`} className="text-blue-600 hover:underline">{r.chequeNumber}</Link>
                      {r.documentId && (
                        <Link href={`/documents/${r.documentId}`} title="Linked document" className="ml-1.5 text-blue-500 inline-flex"><ExternalLink className="w-3 h-3" /></Link>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("text-[11px] font-semibold rounded px-1.5 py-0.5", r.type === "payable" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700")}>
                        {r.type === "payable" ? "Payable" : "Receivable"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-32">{r.who || r.customerName || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.bankName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.chequeDate}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{money(r.amount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-[11px] font-semibold rounded-full px-2 py-0.5", STATUS_STYLE[st] || "bg-slate-100")}>{st}</span>
                        <CorrectedBadge entityType="cheque" entityId={r.id} />
                        {/* one-step-back reversal for statuses entered by mistake */}
                        {(r.status === "cleared" || r.status === "deposited") && (
                          <CorrectButton
                            label="Undo"
                            title={`Reverse cheque ${r.chequeNumber}`}
                            current={r.status}
                            next={r.status === "cleared" ? "deposited" : "pending"}
                            onConfirm={(reason) => reverseMut.mutateAsync({ id: r.id, targetStatus: r.status === "cleared" ? "deposited" : "pending", reason })}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {active && (
                        <div className="flex gap-1">
                          {st !== "deposited" && (
                            <button title="Mark deposited" onClick={() => statusMut.mutate({ id: r.id, next: "deposited" })}
                              className="p-1 rounded hover:bg-blue-50 text-blue-600"><ArrowDownToLine className="w-4 h-4" /></button>
                          )}
                          <button title="Mark cleared" onClick={() => statusMut.mutate({ id: r.id, next: "cleared" })}
                            className="p-1 rounded hover:bg-green-50 text-green-600"><CheckCircle2 className="w-4 h-4" /></button>
                          <button title="Mark bounced" onClick={() => { if (window.confirm("Mark this cheque BOUNCED? The customer/supplier record is flagged and admin alerted.")) statusMut.mutate({ id: r.id, next: "bounced" }); }}
                            className="p-1 rounded hover:bg-red-50 text-red-600"><AlertOctagon className="w-4 h-4" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No cheques match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Alerts: admin & manager are notified automatically before each cheque's date (configurable in Settings). Bounced cheques flag the customer/supplier record.
      </p>
    </div>
  );
}
