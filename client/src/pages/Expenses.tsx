import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Repeat, Wrench, Settings2, X, Search,
  TrendingDown, TrendingUp, Calendar, MapPin, CreditCard,
  FileText, Pencil, Trash2, Upload, ChevronRight, BarChart3,
  Clock, AlertTriangle, Building2, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CorrectButton, CorrectedBadge } from "@/components/CorrectionModal";
import CustomFields, { useFieldDefs, validateCustomFields } from "@/components/CustomFields";
import {
  MetricCard, RangeToggle, RangeKey, rangeStart, money, compact,
  CHART, Sparkline,
} from "@/components/finance/kit";

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const METHOD_ICON: Record<string, typeof CreditCard> = {
  Cash: CreditCard,
  Cheque: FileText,
  "Bank Transfer": Building2,
};

const CAT_COLORS = [
  CHART.blue, CHART.emerald, CHART.amber, CHART.purple, CHART.red,
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

export default function Expenses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "manager";
  const isStoreScoped = user?.role === "salesman" || user?.role === "worker";
  const canCreate = canManage || isStoreScoped;

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [range, setRange] = useState<RangeKey>("1M");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [filterStore, setFilterStore] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");

  // Detail sheet
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editCustom, setEditCustom] = useState<Record<string, any>>({});
  const attachRef = useRef<HTMLInputElement>(null);

  // New expense form
  const [form, setForm] = useState<any>({
    category: "", amount: "", date: today(), paymentMethod: "Cash",
    storeId: "", notes: "", isRecurring: false, frequency: "monthly", linkedIssueId: "",
  });
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const { data: expenseFieldDefs = [] } = useFieldDefs("expenses");

  // Data
  const start = rangeStart(range);
  const { data: allRows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/expenses", start],
    queryFn: () => {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      return fetch(`/api/expenses?${params}`).then((r) => r.json());
    },
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
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
  });

  // Filter
  const rows = useMemo(() => {
    let filtered = allRows;
    if (filterCat !== "all") filtered = filtered.filter((r) => r.category === filterCat);
    if (filterMethod !== "all") filtered = filtered.filter((r) => r.paymentMethod === filterMethod);
    if (filterStore !== "all") filtered = filtered.filter((r) => String(r.storeId) === filterStore);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      filtered = filtered.filter((r) =>
        r.category?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    }
    return filtered;
  }, [allRows, filterCat, filterMethod, filterStore, searchQ]);

  // Stats
  const totalSpend = useMemo(() => rows.reduce((s, r) => s + Number(r.amount || 0), 0), [rows]);
  const avgExpense = rows.length ? totalSpend / rows.length : 0;

  const catBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.category] = (map[r.category] || 0) + Number(r.amount || 0);
    return Object.entries(map)
      .map(([cat, total]) => ({ cat, total }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const methodBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.paymentMethod || "Cash"] = (map[r.paymentMethod || "Cash"] || 0) + Number(r.amount || 0);
    return Object.entries(map)
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const dailySpark = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.date] = (map[r.date] || 0) + Number(r.amount || 0);
    const days = Object.keys(map).sort();
    return days.map((d) => map[d]);
  }, [rows]);

  const recurringRows = allRows.filter((r) => r.isRecurring);
  const recurringTotal = recurringRows.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Selected expense
  const selected = useMemo(() => rows.find((r) => r.id === selectedId), [rows, selectedId]);
  const selectedStore = stores.find((s) => s.id === selected?.storeId);
  const selectedCreator = users.find((u: any) => u.id === selected?.createdBy);

  // Mutations
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
        if (r.status === 409 && j.code === "INSUFFICIENT_FUNDS") err.funds = j;
        throw err;
      }
      return r.json();
    },
    onSuccess: () => {
      invalidate(); setShowForm(false);
      setForm({ category: "", amount: "", date: today(), paymentMethod: "Cash", storeId: "", notes: "", isRecurring: false, frequency: "monthly", linkedIssueId: "" });
      setCustomData({});
      toast({ title: "Expense logged" });
    },
    onError: (e: any, variables: any) => {
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

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/expenses/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Update failed");
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      setEditing(false);
      toast({ title: "Expense updated" });
    },
    onError: (e: any) => toast({ title: "Cannot update", description: String(e?.message || ""), variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      fetch(`/api/corrections/expense/${id}/delete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Delete failed"); return r.json(); }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/corrections"] });
      setSelectedId(null);
      toast({ title: "Expense removed", description: "Soft-deleted — record and reason kept permanently." });
    },
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

  const attachMut = useMutation({
    mutationFn: ({ id, url }: { id: number; url: string }) =>
      fetch(`/api/expenses/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentUrl: url }),
      }).then(async (r) => { if (!r.ok) throw new Error("Upload failed"); return r.json(); }),
    onSuccess: () => { invalidate(); toast({ title: "Receipt attached" }); },
    onError: (e: any) => toast({ title: "Upload failed", description: String(e?.message || ""), variant: "destructive" }),
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

  const saveEdit = () => {
    if (!selected) return;
    if (!editForm.category || !(Number(editForm.amount) > 0)) {
      toast({ title: "Category and amount are required", variant: "destructive" }); return;
    }
    updateMut.mutate({
      id: selected.id,
      data: {
        category: editForm.category,
        amount: Number(editForm.amount),
        date: editForm.date,
        paymentMethod: editForm.paymentMethod,
        storeId: editForm.storeId && editForm.storeId !== "none" ? Number(editForm.storeId) : undefined,
        notes: editForm.notes || undefined,
        isRecurring: !!editForm.isRecurring,
        frequency: editForm.isRecurring ? editForm.frequency : undefined,
        linkedIssueId: editForm.linkedIssueId && editForm.linkedIssueId !== "none" ? Number(editForm.linkedIssueId) : undefined,
        customData: editCustom,
      },
    });
  };

  const openDetail = (row: any) => {
    setSelectedId(row.id);
    setEditing(false);
    setEditForm({
      category: row.category,
      amount: row.amount,
      date: row.date,
      paymentMethod: row.paymentMethod || "Cash",
      storeId: row.storeId ? String(row.storeId) : "",
      notes: row.notes || "",
      isRecurring: !!row.isRecurring,
      frequency: row.frequency || "monthly",
      linkedIssueId: row.linkedIssueId ? String(row.linkedIssueId) : "",
    });
    setEditCustom(row.customData || {});
  };

  function handleAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    if (file.size > 5_000_000) { toast({ title: "File too large (max 5 MB)", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => attachMut.mutate({ id: selected.id, url: String(reader.result) });
    reader.onerror = () => toast({ title: "Could not read file", variant: "destructive" });
    reader.readAsDataURL(file);
  }

  const openIssues = issues.filter((i) => i.status !== "resolved");
  const isMaintenance = /maintenance/i.test(form.category || "");
  const isEditMaintenance = /maintenance/i.test(editForm.category || "");
  const activeFilters = (filterCat !== "all" ? 1 : 0) + (filterMethod !== "all" ? 1 : 0) + (filterStore !== "all" ? 1 : 0);

  // Category bar widths
  const maxCatAmt = catBreakdown[0]?.total || 1;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-sm">
          <Receipt className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{isStoreScoped ? "Store Expenses" : "Expenses"}</h1>
          <p className="text-sm text-muted-foreground">
            {isStoreScoped
              ? `Spending from ${stores.find((s) => s.id === user?.storeId)?.nameEn || "your store"}`
              : "Track, categorize, and control business spending"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <RangeToggle value={range} onChange={setRange} />
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowCats((v) => !v)}>
              <Settings2 className="w-4 h-4" /> Categories
            </Button>
          )}
          {canCreate && (
            <Button size="sm" className="gap-1.5 bg-[#1e2a3a] text-white hover:bg-[#2a3a4a]" onClick={() => setShowForm((v) => !v)}>
              <Plus className="w-4 h-4" /> {isStoreScoped ? "Log Store Expense" : "New Expense"}
            </Button>
          )}
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={TrendingDown}
          label="Total Spending"
          value={money(totalSpend)}
          sub={`${rows.length} expense${rows.length !== 1 ? "s" : ""}`}
          spark={dailySpark}
          sparkColor={CHART.red}
          accent={CHART.red}
        />
        <MetricCard
          icon={BarChart3}
          label="Top Category"
          value={catBreakdown[0]?.cat || "—"}
          sub={catBreakdown[0] ? money(catBreakdown[0].total) : undefined}
          accent={CHART.blue}
        />
        <MetricCard
          icon={Receipt}
          label="Avg per Expense"
          value={money(avgExpense)}
          sub={`across ${catBreakdown.length} categories`}
          accent={CHART.amber}
        />
        <MetricCard
          icon={Repeat}
          label="Recurring"
          value={`${recurringRows.length}`}
          sub={recurringRows.length > 0 ? `${money(recurringTotal)} / cycle` : "None set up"}
          accent={CHART.purple}
        />
      </div>

      {/* Category Breakdown */}
      {catBreakdown.length > 0 && (
        <div className="section-card !p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Spending by Category</h2>
          <div className="space-y-2">
            {catBreakdown.slice(0, 6).map((c, i) => {
              const pct = totalSpend > 0 ? (c.total / totalSpend) * 100 : 0;
              return (
                <div key={c.cat} className="group">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <button
                      onClick={() => setFilterCat(filterCat === c.cat ? "all" : c.cat)}
                      className="font-medium text-foreground hover:text-blue-600 transition-colors flex items-center gap-1.5"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                      {c.cat}
                    </button>
                    <span className="font-mono text-muted-foreground text-xs">
                      {money(c.total)} <span className="text-muted-foreground/60">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(c.total / maxCatAmt) * 100}%`, background: CAT_COLORS[i % CAT_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
            {catBreakdown.length > 6 && (
              <p className="text-xs text-muted-foreground pt-1">+ {catBreakdown.length - 6} more categories</p>
            )}
          </div>
        </div>
      )}

      {/* Admin category manager */}
      {showCats && isAdmin && (
        <section className="section-card !p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Expense categories (add / delete anytime)</h2>
            <button onClick={() => setShowCats(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 text-xs bg-muted/50 border rounded-full px-3 py-1.5">
                {c.value}
                <button onClick={() => delCatMut.mutate(c.id)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
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
        <section className="section-card !p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-muted-foreground" /> Log New Expense
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
            {isStoreScoped ? (
              <div>
                <Label className="text-xs">Location</Label>
                <Input value={stores.find((s) => s.id === user?.storeId)?.nameEn || "Your store"} disabled className="h-9 text-sm bg-muted/30" />
              </div>
            ) : (
              <div>
                <Label className="text-xs">Location</Label>
                <Select value={form.storeId || "none"} onValueChange={(v) => setForm({ ...form, storeId: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none (company-wide) —</SelectItem>
                    {stores.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nameEn} ({s.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isMaintenance && (
              <div>
                <Label className="text-xs flex items-center gap-1"><Wrench className="w-3 h-3" /> Linked issue</Label>
                <Select value={form.linkedIssueId || "none"} onValueChange={(v) => setForm({ ...form, linkedIssueId: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— not linked —</SelectItem>
                    {issues.map((i) => <SelectItem key={i.id} value={String(i.id)}>#{i.id} · {String(i.description).slice(0, 40)} ({i.status})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes…" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <CustomFields moduleKey="expenses" value={customData} onChange={setCustomData} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })} className="rounded" />
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
          </div>
        </section>
      )}

      {/* Recurring summary */}
      {recurringRows.length > 0 && !showForm && (
        <section className="section-card !p-3 border-blue-200/50">
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5 mb-2">
            <Repeat className="w-3.5 h-3.5" /> Recurring expenses — system reminds when due
          </h2>
          <div className="flex flex-wrap gap-2">
            {recurringRows.map((r) => (
              <button key={r.id} onClick={() => openDetail(r)}
                className="text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 rounded-lg px-3 py-1.5 hover:border-blue-400 transition-colors text-left">
                <span className="font-medium">{r.category}</span>
                <span className="text-muted-foreground"> · {money(r.amount)} · {r.frequency}</span>
                {r.nextDueDate && <span className="text-blue-600"> · next {fmtDate(r.nextDueDate)}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search expenses…" className="h-9 pl-9 text-sm"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.value}>{c.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMethod} onValueChange={setFilterMethod}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue placeholder="All methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {["Cash", "Cheque", "Bank Transfer"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        {!isStoreScoped && (
          <Select value={filterStore} onValueChange={setFilterStore}>
            <SelectTrigger className="h-9 w-[160px] text-xs">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground"
            onClick={() => { setFilterCat("all"); setFilterMethod("all"); setFilterStore("all"); setSearchQ(""); }}>
            Clear ({activeFilters})
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} record{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Expense List */}
      {isLoading ? (
        <div className="section-card !p-8 text-center text-muted-foreground text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="section-card !p-10 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No expenses found for this period.</p>
          {canCreate && (
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" /> Log your first expense
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const store = stores.find((s) => s.id === r.storeId);
            const MethodIcon = METHOD_ICON[r.paymentMethod] || CreditCard;
            const catIdx = catBreakdown.findIndex((c) => c.cat === r.category);
            const catColor = CAT_COLORS[catIdx % CAT_COLORS.length] || CHART.slate;
            return (
              <button
                key={r.id}
                onClick={() => openDetail(r)}
                className={cn(
                  "w-full section-card !p-0 text-left group transition-all",
                  "hover:shadow-md hover:border-border",
                  selectedId === r.id && "ring-1 ring-blue-400/50",
                )}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Color dot */}
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: catColor + "18" }}>
                    <Receipt className="w-4 h-4" style={{ color: catColor }} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{r.category}</span>
                      {r.isRecurring && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-950/40 text-blue-600 rounded-full px-1.5 py-0.5">
                          <Repeat className="w-2.5 h-2.5" /> {r.frequency}
                        </span>
                      )}
                      {r.linkedIssueId && (
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 rounded px-1.5 py-0.5">
                          <Wrench className="w-2.5 h-2.5 inline mr-0.5" />#{r.linkedIssueId}
                        </span>
                      )}
                      {r.attachmentUrl && (
                        <span className="text-[10px] text-emerald-600"><FileText className="w-3 h-3 inline" /></span>
                      )}
                      <CorrectedBadge entityType="expense" entityId={r.id} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {fmtDate(r.date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MethodIcon className="w-3 h-3" /> {r.paymentMethod}
                      </span>
                      {store && (
                        <span className="flex items-center gap-1 hidden sm:flex">
                          <MapPin className="w-3 h-3" /> {store.nameEn}
                        </span>
                      )}
                    </div>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground/70 truncate max-w-md mt-0.5">{r.notes}</p>
                    )}
                  </div>

                  {/* Amount + chevron */}
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-foreground">{money(r.amount)}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Payment Method Summary */}
      {methodBreakdown.length > 1 && rows.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-1">
          {methodBreakdown.map((m) => {
            const MethodIcon = METHOD_ICON[m.method] || CreditCard;
            const pct = totalSpend > 0 ? (m.total / totalSpend) * 100 : 0;
            return (
              <div key={m.method} className="stat-card !p-3 flex-1 min-w-[140px]">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <MethodIcon className="w-3.5 h-3.5" /> {m.method}
                </div>
                <p className="font-mono font-semibold text-sm">{money(m.total)}</p>
                <p className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% of total</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={selectedId !== null} onOpenChange={(open) => { if (!open) { setSelectedId(null); setEditing(false); } }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selected && (
                <>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: (CAT_COLORS[catBreakdown.findIndex((c) => c.cat === selected.category) % CAT_COLORS.length] || CHART.slate) + "18" }}>
                    <Receipt className="w-4 h-4" style={{ color: CAT_COLORS[catBreakdown.findIndex((c) => c.cat === selected.category) % CAT_COLORS.length] || CHART.slate }} />
                  </div>
                  {editing ? "Edit Expense" : "Expense Details"}
                </>
              )}
            </SheetTitle>
            <SheetDescription>
              {selected && !editing && `${selected.category} — ${fmtDate(selected.date)}`}
              {editing && "Modify expense details below"}
            </SheetDescription>
          </SheetHeader>

          {selected && !editing && (
            <div className="mt-6 space-y-5">
              {/* Amount hero */}
              <div className="text-center py-4 rounded-xl bg-muted/30 border">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Amount</p>
                <p className="font-mono font-bold text-3xl text-foreground">{money(selected.amount)}</p>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3">
                <DetailItem icon={Calendar} label="Date" value={fmtDate(selected.date)} />
                <DetailItem icon={METHOD_ICON[selected.paymentMethod] || CreditCard} label="Method" value={selected.paymentMethod} />
                <DetailItem icon={MapPin} label="Location" value={selectedStore?.nameEn || "—"} />
                <DetailItem icon={Receipt} label="Category" value={selected.category} />
                {selected.isRecurring && (
                  <>
                    <DetailItem icon={Repeat} label="Frequency" value={selected.frequency || "monthly"} />
                    <DetailItem icon={Clock} label="Next Due" value={selected.nextDueDate ? fmtDate(selected.nextDueDate) : "—"} />
                  </>
                )}
                {selected.linkedIssueId && (
                  <DetailItem icon={Wrench} label="Linked Issue" value={`#${selected.linkedIssueId}`} />
                )}
                {selectedCreator && (
                  <DetailItem icon={Eye} label="Created By" value={(selectedCreator as any).fullName || (selectedCreator as any).username || "—"} />
                )}
              </div>

              {/* Notes */}
              {selected.notes && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3">{selected.notes}</p>
                </div>
              )}

              {/* Receipt / Attachment */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Receipt / Attachment</p>
                {selected.attachmentUrl ? (
                  <div className="rounded-lg border overflow-hidden">
                    {selected.attachmentUrl.startsWith("data:image") ? (
                      <img src={selected.attachmentUrl} alt="Receipt" className="w-full max-h-60 object-contain bg-muted/20" />
                    ) : (
                      <div className="p-3 flex items-center gap-2 text-sm">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span>Attachment saved</span>
                      </div>
                    )}
                    {canManage && (
                      <div className="border-t px-3 py-2 flex justify-end">
                        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => attachRef.current?.click()}>
                          <Upload className="w-3 h-3" /> Replace
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  canManage && (
                    <button
                      onClick={() => attachRef.current?.click()}
                      className="w-full rounded-xl border-2 border-dashed border-muted-foreground/20 py-6 flex flex-col items-center gap-2 hover:border-muted-foreground/40 transition-colors"
                    >
                      <Upload className="w-5 h-5 text-muted-foreground/40" />
                      <span className="text-xs text-muted-foreground">Click to attach receipt (image or PDF, max 5 MB)</span>
                    </button>
                  )
                )}
                <input ref={attachRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleAttachment} />
              </div>

              {/* Custom fields display */}
              {selected.customData && Object.keys(selected.customData).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Additional Fields</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(selected.customData).map(([k, v]) => (
                      <div key={k} className="text-sm">
                        <span className="text-xs text-muted-foreground">{k}</span>
                        <p className="font-medium">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correction badge */}
              <CorrectedBadge entityType="expense" entityId={selected.id} />

              {/* Actions */}
              {canManage && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => setEditing(true)}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <CorrectButton
                    label="Delete"
                    title={`Remove expense — ${selected.category}`}
                    current={`${selected.category} · ${money(selected.amount)}`}
                    next="Soft-deleted (kept in database, excluded from totals)"
                    onConfirm={(reason) => delMut.mutateAsync({ id: selected.id, reason })}
                  />
                </div>
              )}
            </div>
          )}

          {/* Edit mode */}
          {selected && editing && (
            <div className="mt-6 space-y-3">
              <div>
                <Label className="text-xs">Category *</Label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.value}>{c.value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Amount (QAR) *</Label>
                <Input type="number" min={0} value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} className="h-9 font-mono" />
              </div>
              <div>
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Payment method</Label>
                <Select value={editForm.paymentMethod} onValueChange={(v) => setEditForm({ ...editForm, paymentMethod: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Cash", "Cheque", "Bank Transfer"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <Select value={editForm.storeId || "none"} onValueChange={(v) => setEditForm({ ...editForm, storeId: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {stores.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nameEn} ({s.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {isEditMaintenance && (
                <div>
                  <Label className="text-xs flex items-center gap-1"><Wrench className="w-3 h-3" /> Linked issue</Label>
                  <Select value={editForm.linkedIssueId || "none"} onValueChange={(v) => setEditForm({ ...editForm, linkedIssueId: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— not linked —</SelectItem>
                      {issues.map((i) => <SelectItem key={i.id} value={String(i.id)}>#{i.id} · {String(i.description).slice(0, 40)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
              </div>
              <div>
                <CustomFields moduleKey="expenses" value={editCustom} onChange={setEditCustom} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editForm.isRecurring} onChange={(e) => setEditForm({ ...editForm, isRecurring: e.target.checked })} className="rounded" />
                <Repeat className="w-4 h-4 text-muted-foreground" /> Recurring
              </label>
              {editForm.isRecurring && (
                <Select value={editForm.frequency} onValueChange={(v) => setEditForm({ ...editForm, frequency: v })}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 bg-[#1e2a3a] text-white" disabled={updateMut.isPending} onClick={saveEdit}>
                  {updateMut.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/20">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
