import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Clock, PackageCheck, ExternalLink, RotateCcw } from "lucide-react";
import { CorrectButton, CorrectedBadge } from "@/components/CorrectionModal";

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
}

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;

export default function Approvals() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Approver's payout choice per large return (id → "Cheque" | "Bank Transfer")
  const [payout, setPayout] = useState<Record<number, string>>({});

  const { data: bizSettings } = useQuery<any>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: returns = [], isLoading } = useQuery<ReturnRow[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetch("/api/returns").then((r) => r.json()),
    refetchInterval: 20000, // approvals surface refreshes so a manager sees new requests
  });

  const pending = returns.filter((r) => r.status === "pending");
  const recent = returns.filter((r) => r.status !== "pending").slice(0, 8);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/returns"] });
    qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    qc.invalidateQueries({ queryKey: ["/api/documents"] });
  };

  const approveMut = useMutation({
    mutationFn: ({ id, refundMethod }: { id: number; refundMethod?: string }) =>
      fetch(`/api/returns/${id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refundMethod ? { refundMethod } : {}),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Approve failed");
        return r.json();
      }),
    onSuccess: () => { invalidate(); toast({ title: "Return approved", description: "Stock reversed and refund issued per the rules." }); },
    onError: (e: any) => toast({ title: "Cannot approve", description: String(e?.message || ""), variant: "destructive" }),
  });

  // Approved by mistake → reverse (stock re-deducted, refund reversed, back to pending)
  const reverseApprovalMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      fetch(`/api/corrections/return/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Reversal failed");
        return r.json();
      }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["/api/corrections"] }); toast({ title: "Approval reversed", description: "Return is pending again — correction logged." }); },
    onError: (e: any) => toast({ title: "Cannot reverse", description: String(e?.message || ""), variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      fetch(`/api/returns/${id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Reject failed");
        return r.json();
      }),
    onSuccess: () => { invalidate(); setRejectingId(null); setRejectReason(""); toast({ title: "Return rejected", description: "Nothing changed. Staff notified." }); },
    onError: (e: any) => toast({ title: "Cannot reject", description: String(e?.message || ""), variant: "destructive" }),
  });

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
          <PackageCheck className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Approvals</h1>
          <p className="text-sm text-muted-foreground">Return requests awaiting your decision</p>
        </div>
        {pending.length > 0 && (
          <span className="ml-auto text-sm font-bold bg-amber-500 text-white rounded-full px-3 py-1">{pending.length} pending</span>
        )}
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && pending.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-xl">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="font-semibold">All caught up</p>
          <p className="text-sm text-muted-foreground">No returns are waiting for approval.</p>
        </div>
      )}

      <div className="space-y-3">
        {pending.map((r) => {
          const amt = Number(r.refundAmount || r.total || 0);
          return (
            <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-bold text-[#1e2a3a]">{r.voucherNumber || `Return #${r.id}`}</span>
                    <span className="text-[11px] uppercase tracking-wide bg-white border rounded px-1.5 py-0.5 text-muted-foreground">{r.type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {r.customerName || "Walk-in"} · vs{" "}
                    <Link href={`/documents/${r.originalInvoiceId}`} className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                      {r.originalInvoiceNumber || `INV ${r.originalInvoiceId}`}<ExternalLink className="w-3 h-3" />
                    </Link>
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-mono font-bold text-lg text-[#1e2a3a]">{money(amt)}</div>
                </div>
              </div>

              {r.reason && <p className="text-sm bg-white border rounded p-2 text-gray-700"><span className="font-semibold">Reason:</span> {r.reason}</p>}

              {rejectingId === r.id ? (
                <div className="space-y-2">
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (sent to staff)…" rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" disabled={rejectMut.isPending || !rejectReason.trim()}
                      onClick={() => rejectMut.mutate({ id: r.id, reason: rejectReason.trim() })}>
                      Confirm reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Returns refund by Cash or Online Transfer only — never PDC. */}
                  <div className="flex items-center gap-3 text-xs bg-white border rounded-lg p-2">
                    <span className="font-semibold text-muted-foreground">Refund by:</span>
                    {[["Cash", "Cash"], ["Bank Transfer", "Online transfer"]].map(([val, label]) => (
                      <label key={val} className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name={`payout-${r.id}`} checked={(payout[r.id] || "Cash") === val}
                          onChange={() => setPayout((p) => ({ ...p, [r.id]: val }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white flex-1"
                      disabled={approveMut.isPending}
                      onClick={() => approveMut.mutate({ id: r.id, refundMethod: payout[r.id] || "Cash" })}>
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 flex-1"
                      onClick={() => setRejectingId(r.id)}>
                      <XCircle className="w-4 h-4" /> Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Recently decided
          </h2>
          <div className="space-y-1.5">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border bg-white">
                <span className="font-medium">{r.voucherNumber || `#${r.id}`}</span>
                <span className="text-muted-foreground truncate">{r.customerName || "Walk-in"}</span>
                <CorrectedBadge entityType="return" entityId={r.id} />
                <span className="ml-auto font-mono text-muted-foreground">{money(r.refundAmount || r.total)}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {r.status}
                </span>
                {r.status === "approved" && (
                  <CorrectButton
                    label="Undo"
                    title={`Reverse approval — ${r.voucherNumber}`}
                    current="Approved (stock reversed, refund issued)"
                    next="Pending (stock re-deducted, refund reversed)"
                    onConfirm={(reason) => reverseApprovalMut.mutateAsync({ id: r.id, reason })}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
