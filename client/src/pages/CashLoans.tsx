import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Landmark, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);

/* Cash & Loans — financing activities (money the business borrows / repays).
   Kept SEPARATE from Expenses (operational costs). */
export default function CashLoans({ embedded }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mode, setMode] = useState<"injection" | "repayment" | null>(null);
  const [f, setF] = useState<any>({ amount: "", source: "Owner", sourceName: "", method: "Cash", date: today(), note: "", willRepay: true });

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
        if (r.status === 409 && j.code === "INSUFFICIENT_FUNDS") err.funds = j; // repayment exceeds balance
        throw err;
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/owner-loans"] });
      qc.invalidateQueries({ queryKey: ["/api/cashflow/position"] });
      toast({ title: "Recorded", description: "Cash position updated." });
      setF({ amount: "", source: "Owner", sourceName: "", method: "Cash", date: today(), note: "", willRepay: true });
      setMode(null);
    },
    onError: (e: any, variables: any) => {
      // Repayment over balance — admin may override with a logged reason.
      if (e?.funds && isAdmin && !variables?.override) {
        const f = e.funds;
        const where = f.instrument === "bank" ? "bank" : "till (cash in hand)";
        const reason = window.prompt(
          `${f.message}\n\nIf the real ${where} balance is higher than the system shows, you can override.\nType a reason to override (leave blank to cancel):`,
        );
        if (reason && reason.trim()) mut.mutate({ ...variables, override: true, overrideReason: reason.trim() });
        return;
      }
      if (e?.funds) { toast({ title: "Insufficient funds", description: String(e.message || ""), variant: "destructive" }); return; }
      toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" });
    },
  });

  function submit() {
    const noteParts = [f.sourceName && `From: ${f.sourceName}`, f.note, mode === "injection" && f.willRepay ? "to be repaid" : ""].filter(Boolean);
    mut.mutate({ type: mode, amount: Number(f.amount), source: f.source, method: f.method, date: f.date, note: noteParts.join(" · ") });
  }

  if (isLoading) return <div className="p-6 max-w-4xl mx-auto space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /></div>;
  const s = data?.summary || { injected: 0, repaid: 0, outstanding: 0 };
  const rows = data?.rows || [];

  return (
    <div className={cn("space-y-5", embedded ? "max-w-5xl mx-auto px-4 md:px-6 pb-6" : "p-4 md:p-6 max-w-4xl mx-auto")}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <Landmark className="w-6 h-6 text-purple-600" />
          <h1 className="text-2xl font-bold tracking-tight">Cash &amp; Loans</h1>
          <span className="text-xs text-muted-foreground ml-2">financing — kept separate from expenses</span>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border p-4"><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total injected</p><p className="font-mono font-bold text-xl text-green-700">{money(s.injected)}</p></div>
        <div className="rounded-2xl border p-4"><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total repaid</p><p className="font-mono font-bold text-xl">{money(s.repaid)}</p></div>
        <div className="rounded-2xl border-2 border-purple-200 bg-purple-50/50 p-4"><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Still outstanding</p><p className="font-mono font-bold text-xl text-purple-700">{money(s.outstanding)}</p></div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5 bg-green-600 text-white" onClick={() => { setMode("injection"); setF((p: any) => ({ ...p, method: "Cash" })); }}><ArrowDownCircle className="w-4 h-4" /> Add Cash Injection</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode("repayment")}><ArrowUpCircle className="w-4 h-4" /> Record Repayment</Button>
      </div>

      {/* Form */}
      {mode && (
        <div className="rounded-2xl border shadow-sm bg-slate-50 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-3 text-sm font-semibold">{mode === "injection" ? "Cash Injection (money in)" : "Loan Repayment (money out)"}</div>
          <div><label className="text-xs font-medium">Amount (QAR)</label><Input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="h-9" /></div>
          {mode === "injection" && (
            <div><label className="text-xs font-medium">Source type</label>
              <select className="w-full h-9 border rounded px-2 text-sm" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
                {["Owner", "Office Fund", "Customer Loan", "Bank Loan", "Other"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          )}
          <div><label className="text-xs font-medium">{mode === "injection" ? "Source name (who)" : "Note"}</label><Input value={mode === "injection" ? f.sourceName : f.note} onChange={(e) => setF({ ...f, [mode === "injection" ? "sourceName" : "note"]: e.target.value })} placeholder={mode === "injection" ? "e.g. Shakil personal" : "reference"} className="h-9" /></div>
          <div><label className="text-xs font-medium">Method</label>
            <select className="w-full h-9 border rounded px-2 text-sm" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              {["Cash", "Bank Transfer"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium">Date</label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-9" /></div>
          {mode === "injection" && <div><label className="text-xs font-medium">Notes</label><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="optional" className="h-9" /></div>}
          <div className="col-span-2 sm:col-span-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode(null)}>Cancel</Button>
            <Button size="sm" className={mode === "injection" ? "bg-green-600 text-white" : "bg-[#1e2a3a] text-white"} disabled={!(Number(f.amount) > 0) || mut.isPending} onClick={submit}>Record</Button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30"><h2 className="font-semibold text-sm">All injections &amp; repayments</h2></div>
        {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No entries yet.</p> : (
          <div className="divide-y">
            {rows.map((l: any) => (
              <div key={l.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <span className={cn("text-xs font-bold uppercase px-1.5 py-0.5 rounded mr-2", l.type === "injection" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{l.type}</span>
                  <span>{l.source} · {l.method} · {l.date ? format(new Date(l.date), "dd MMM yy") : ""}</span>
                  {l.note && <span className="text-muted-foreground"> · {l.note}</span>}
                </div>
                <span className={cn("font-mono font-semibold shrink-0", l.type === "injection" ? "text-green-700" : "text-red-600")}>{l.type === "injection" ? "+" : "−"} {money(l.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
