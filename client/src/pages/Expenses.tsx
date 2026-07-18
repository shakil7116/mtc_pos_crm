import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Receipt, Plus, Repeat, Wrench, Settings2, X, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { CorrectButton, CorrectedBadge } from "@/components/CorrectionModal";
import CustomFields, { useFieldDefs, validateCustomFields } from "@/components/CustomFields";

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function Expenses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "manager";

  const [showForm, setShowForm] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [form, setForm] = useState<any>({
    category: "", amount: "", date: today(), paymentMethod: "Cash",
    storeId: "", notes: "", isRecurring: false, frequency: "monthly", linkedIssueId: "",
  });
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const { data: expenseFieldDefs = [] } = useFieldDefs("expenses");

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => fetch("/api/expenses").then((r) => r.json()),
  });
  const { data: cats = [] } = useQuery<any[]>({
    queryKey: ["/api/lists/expense_categories"],
    queryFn: () => fetch("/api/lists/expense_categories").then((r) => r.json()),
  });
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });
  const { data: issues = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouse-issues"],
    queryFn: () => fetch("/api/warehouse-issues").then((r) => r.json()),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    qc.invalidateQueries({ queryKey: ["/api/cashflow"] });
  };

  const createMut = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch("/api/expenses", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const err: any = new Error(j.message || "Save failed");
        if (r.status === 409 && j.code === "INSUFFICIENT_FUNDS") err.funds = j; // insufficient cash/bank
        throw err;
      }
      return r.json();
    },
    onSuccess: () => {
      invalidate(); setShowForm(false);
      setForm({ category: "", amount: "", date: today(), paymentMethod: "Cash", storeId: "", notes: "", isRecurring: false, frequency: "monthly", linkedIssueId: "" });
      toast({ title: "Expense logged" });
    },
    onError: (e: any, variables: any) => {
      // Insufficient cash/bank. An admin may override if the real balance is higher
      // than the system shows — but must give a reason (logged to the audit trail).
      if (e?.funds && isAdmin && !variables?.override) {
        const f = e.funds;
        const where = f.instrument === "bank" ? "bank" : "till (cash in hand)";
        const reason = window.prompt(
          `${f.message}\n\nIf the real ${where} balance is higher than the system shows, you can override.\nType a reason to override (leave blank to cancel):`,
        );
        if (reason && reason.trim()) {
          createMut.mutate({ ...variables, override: true, overrideReason: reason.trim() });
        }
        return;
      }
      if (e?.funds) { toast({ title: "Insufficient funds", description: String(e.message || ""), variant: "destructive" }); return; }
      toast({ title: "Cannot save", description: String(e?.message || ""), variant: "destructive" });
    },
  });

  // Soft delete via the correction system — mandatory reason, record kept forever.
  const delMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      fetch(`/api/corrections/expense/${id}/delete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Delete failed"); return r.json(); }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["/api/corrections"] }); toast({ title: "Expense removed", description: "Soft-deleted — record and reason kept permanently." }); },
    onError: (e: any) => toast({ title: "Cannot delete", description: String(e?.message || ""), variant: "destructive" }),
  });

  const addCatMut = useMutation({
    mutationFn: (value: string) =>
      fetch("/api/lists", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listKey: "expense_categories", value, sortOrder: cats.length }),
      }).then(async (r) => { if (!r.ok) throw new Error("Add failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/lists/expense_categories"] }); setNewCat(""); toast({ title: "Category added" }); },
    onError: () => toast({ title: "Only admin can manage categories", variant: "destructive" }),
  });
  const delCatMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/lists/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/lists/expense_categories"] }); toast({ title: "Category removed" }); },
    onError: () => toast({ title: "Only admin can manage categories", variant: "destructive" }),
  });

  const submit = () => {
    if (!form.category || !(Number(form.amount) > 0) || !form.date) {
      toast({ title: "Category, amount and date are required", variant: "destructive" });
      return;
    }
    const missing = validateCustomFields(expenseFieldDefs, customData);
    if (missing) { toast({ title: `${missing} is required`, variant: "destructive" }); return; }
    createMut.mutate({
      customData,
      category: form.category,
      amount: Number(form.amount),
      date: form.date,
      paymentMethod: form.paymentMethod,
      storeId: form.storeId && form.storeId !== "none" ? Number(form.storeId) : undefined,
      notes: form.notes || undefined,
      isRecurring: !!form.isRecurring,
      frequency: form.isRecurring ? form.frequency : undefined,
      linkedIssueId: form.linkedIssueId && form.linkedIssueId !== "none" ? Number(form.linkedIssueId) : undefined,
    });
  };

  const openIssues = issues.filter((i) => i.status !== "resolved");
  const isMaintenance = /maintenance/i.test(form.category || "");
  const recurringRows = rows.filter((r) => r.isRecurring);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
          <Receipt className="w-5 h-5 text-rose-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Expenses</h1>
          <p className="text-sm text-muted-foreground">Business spending by category and location</p>
        </div>
        <div className="ml-auto flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowCats((v) => !v)}>
              <Settings2 className="w-4 h-4" /> Categories
            </Button>
          )}
          <Button size="sm" className="gap-1.5 bg-[#1e2a3a] text-white" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4" /> New Expense
          </Button>
        </div>
      </header>

      {/* Owner loans / cash injections moved to their own "Cash & Loans" page. */}

      {/* Admin category manager — fully dynamic list, zero hardcoded */}
      {showCats && isAdmin && (
        <section className="rounded-xl border p-4 space-y-3 bg-slate-50">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Expense categories (add / delete anytime)</h2>
            <button onClick={() => setShowCats(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 text-xs bg-white border rounded-full px-3 py-1">
                {c.value}
                <button onClick={() => delCatMut.mutate(c.id)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name…" className="h-8 text-sm max-w-60" />
            <Button size="sm" variant="outline" disabled={!newCat.trim() || addCatMut.isPending} onClick={() => addCatMut.mutate(newCat.trim())}>Add</Button>
          </div>
        </section>
      )}

      {/* Entry form */}
      {showForm && (
        <section className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Category *</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select category…" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.value}>{c.value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount (QAR) *</Label>
            <Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="h-9 font-mono" placeholder="0.00" />
          </div>
          <div>
            <Label className="text-xs">Date *</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Payment method</Label>
            <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{["Cash", "Cheque", "Bank Transfer"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Location (store / warehouse)</Label>
            <Select value={form.storeId || "none"} onValueChange={(v) => setForm({ ...form, storeId: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none —</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nameEn} ({s.type})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isMaintenance && (
            <div>
              <Label className="text-xs flex items-center gap-1"><Wrench className="w-3 h-3" /> Linked warehouse issue</Label>
              <Select value={form.linkedIssueId || "none"} onValueChange={(v) => setForm({ ...form, linkedIssueId: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— not linked —</SelectItem>
                  {issues.map((i) => <SelectItem key={i.id} value={String(i.id)}>#{i.id} · {String(i.description).slice(0, 40)} ({i.status})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes…" />
          </div>
          <div className="sm:col-span-2">
            <CustomFields moduleKey="expenses" value={customData} onChange={setCustomData} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })} />
              <Repeat className="w-4 h-4 text-muted-foreground" /> Recurring
            </label>
            {form.isRecurring && (
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" className="bg-[#1e2a3a] text-white" disabled={createMut.isPending} onClick={submit}>
                {createMut.isPending ? "Saving…" : "Save Expense"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Recurring summary */}
      {recurringRows.length > 0 && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5 mb-2">
            <Repeat className="w-3.5 h-3.5" /> Recurring — system reminds when due
          </h2>
          <div className="flex flex-wrap gap-2">
            {recurringRows.map((r) => (
              <span key={r.id} className="text-xs bg-white border rounded-full px-3 py-1">
                {r.category} · {money(r.amount)} · {r.frequency} · next {r.nextDueDate || "—"}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* List */}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">Method</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">Location</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const store = stores.find((s) => s.id === r.storeId);
                return (
                  <tr key={r.id} className="border-t hover:bg-slate-50/60">
                    <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.category}</span>
                      {r.isRecurring && <Repeat className="inline w-3 h-3 ml-1.5 text-blue-500" />}
                      {r.linkedIssueId && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">issue #{r.linkedIssueId}</span>}
                      <span className="ml-1.5"><CorrectedBadge entityType="expense" entityId={r.id} /></span>
                      {r.notes && <p className="text-xs text-muted-foreground truncate max-w-60">{r.notes}</p>}
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{r.paymentMethod}</td>
                    <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{store?.nameEn || "—"}</td>
                    <td className={cn("px-3 py-2 text-right font-mono font-semibold")}>{money(r.amount)}</td>
                    <td className="px-2 py-2">
                      {canManage && (
                        <CorrectButton
                          label="Delete"
                          title={`Remove expense — ${r.category}`}
                          current={`${r.category} · ${money(r.amount)}`}
                          next="Soft-deleted (kept in database, excluded from totals)"
                          onConfirm={(reason) => delMut.mutateAsync({ id: r.id, reason })}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No expenses yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
