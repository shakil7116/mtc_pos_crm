import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  Users,
  Search,
  Plus,
  ChevronRight,
  Phone,
  CreditCard,
  ArrowUpDown,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import CustomFields, { useFieldDefs, validateCustomFields } from "@/components/CustomFields";
import { validateName, validatePhone, validateNonNegative, formatPhone } from "@/lib/validation";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
type Customer = {
  id: number;
  name: string;
  phone: string | null;
  type: "walk-in" | "contractor" | "corporate" | "government";
  creditLimit: number | string | null;
  trn: string | null;
  address: string | null;
  notes: string | null;
  paymentTerms: string | null;
  active: boolean | null;
  createdAt: string;
};

type CustomerBalance = {
  balance: number;
  creditLimit: number;
  totalInvoiced: number;
  totalPaid: number;
};

type SortKey = "name" | "outstanding" | "lastPurchase";
type FilterType = "all" | "walk-in" | "contractor" | "corporate" | "government";
// Behaviour tier is system-calculated server-side (never staff-set, never printed).
type TierFilter = "all" | "best" | "better" | "good" | "watch" | "bad";
type FinFilter = "all" | "cash" | "credit" | "credit-owing";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

function fmt(v: number | string | null | undefined): string {
  return "QAR " + toNum(v).toFixed(2);
}

function typeColor(type: string) {
  switch (type) {
    case "walk-in":
      return "bg-gray-100 text-gray-700";
    case "contractor":
      return "bg-blue-100 text-blue-700";
    case "corporate":
      return "bg-purple-100 text-purple-700";
    case "government":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function typeLabel(type: string) {
  switch (type) {
    case "walk-in":
      return "Walk-in";
    case "contractor":
      return "Contractor";
    case "corporate":
      return "Corporate";
    case "government":
      return "Government";
    default:
      return type;
  }
}

/* ─────────────────────────────────────────
   New Customer Dialog
───────────────────────────────────────── */
type NewCustomerForm = {
  name: string;
  phone: string;
  type: string;
  creditLimit: string;
  trn: string;
  address: string;
  notes: string;
  paymentTerms: string;
};

const BLANK_FORM: NewCustomerForm = {
  name: "",
  phone: "",
  type: "walk-in",
  creditLimit: "",
  trn: "",
  address: "",
  notes: "",
  paymentTerms: "",
};

function NewCustomerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<NewCustomerForm>(BLANK_FORM);
  const [errors, setErrors] = useState<Partial<NewCustomerForm>>({});
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const { data: fieldDefs = [] } = useFieldDefs("customers");
  const qc = useQueryClient();
  const { toast } = useToast();

  const mut = useMutation({
    mutationFn: (body: NewCustomerForm) =>
      fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          creditLimit: body.creditLimit ? parseFloat(body.creditLimit) : null,
          customData,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to create customer");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer created successfully" });
      setForm(BLANK_FORM);
      setErrors({});
      onClose();
    },
    onError: () => {
      toast({
        title: "Failed to create customer",
        variant: "destructive",
      });
    },
  });

  function validate(): boolean {
    const errs: Partial<NewCustomerForm> = {};
    const nameErr = validateName(form.name);
    if (nameErr) errs.name = nameErr;
    const phoneErr = validatePhone(form.phone);
    if (phoneErr) errs.phone = phoneErr;
    const creditErr = validateNonNegative(form.creditLimit, "Credit limit");
    if (creditErr) errs.creditLimit = creditErr;
    setErrors(errs);
    if (Object.keys(errs).length) return false;
    const missing = validateCustomFields(fieldDefs, customData);
    if (missing) { toast({ title: `${missing} is required`, variant: "destructive" }); return false; }
    return true;
  }

  function handleSubmit() {
    if (validate()) mut.mutate(form);
  }

  function set(field: keyof NewCustomerForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setForm(BLANK_FORM);
          setErrors({});
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="c-name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="c-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Full name"
              className={cn(errors.name && "border-red-500 focus-visible:ring-red-500")}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="c-phone">Phone</Label>
            <Input
              id="c-phone"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set("phone", formatPhone(e.target.value))}
              placeholder="+974 XXXX XXXX"
              className={cn(errors.phone && "border-red-500 focus-visible:ring-red-500")}
            />
            {errors.phone && (
              <p className="text-xs text-red-500">{errors.phone}</p>
            )}
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Customer Type</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walk-in">Walk-in</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="government">Government</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Credit Limit */}
          <div className="space-y-1.5">
            <Label htmlFor="c-credit">Credit Limit (QAR)</Label>
            <Input
              id="c-credit"
              type="number"
              min="0"
              step="0.01"
              value={form.creditLimit}
              onChange={(e) => set("creditLimit", e.target.value)}
              placeholder="0.00"
              className={cn(errors.creditLimit && "border-red-500 focus-visible:ring-red-500")}
            />
            {errors.creditLimit && (
              <p className="text-xs text-red-500">{errors.creditLimit}</p>
            )}
          </div>

          {/* TRN / CR */}
          <div className="space-y-1.5">
            <Label htmlFor="c-trn">TRN / CR Number</Label>
            <Input
              id="c-trn"
              value={form.trn}
              onChange={(e) => set("trn", e.target.value)}
              placeholder="Tax Registration Number"
            />
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="c-address">Address</Label>
            <Input
              id="c-address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Street, City"
            />
          </div>

          {/* Payment Terms */}
          <div className="space-y-1.5">
            <Label htmlFor="c-terms">Payment Terms</Label>
            <Input
              id="c-terms"
              value={form.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)}
              placeholder="e.g. Net 30, Cash on delivery"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea
              id="c-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Internal notes..."
              rows={3}
            />
          </div>

          {/* Admin-defined custom fields (11C) */}
          <CustomFields moduleKey="customers" value={customData} onChange={setCustomData} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mut.isPending}>
            {mut.isPending ? "Creating…" : "Create Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Customer Row
───────────────────────────────────────── */
// Green family for the positive tiers, amber for watch, red for bad —
// same visual language as the existing type tags.
const TIER_STYLE: Record<string, string> = {
  best: "bg-emerald-600 text-white",
  better: "bg-emerald-100 text-emerald-800",
  good: "bg-green-50 text-green-700",
  watch: "bg-amber-100 text-amber-700",
  bad: "bg-red-600 text-white",
};

function CustomerRow({
  customer,
  balance,
  ov,
  onNavigate,
}: {
  customer: Customer;
  balance?: number;
  ov?: any;
  onNavigate: (id: number) => void;
}) {
  const outstanding = balance ?? 0;
  const creditLimit = toNum(customer.creditLimit);
  const overLimit = creditLimit > 0 && outstanding > creditLimit;
  const pdc = toNum(ov?.pdcAmount);
  const tier = ov?.tier as string | undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors cursor-pointer border-b border-border/30 last:border-0",
        overLimit && "bg-red-50/40"
      )}
      onClick={() => onNavigate(customer.id)}
    >
      {/* Avatar */}
      <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
        <span className="text-primary font-bold text-sm">
          {customer.name.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Name + phone */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground truncate">
            {customer.name}
          </span>
          <Badge
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0 rounded-full border-0",
              typeColor(customer.type)
            )}
          >
            {typeLabel(customer.type)}
          </Badge>
          {tier && (
            <Badge className={cn("text-[10px] font-bold px-1.5 py-0 rounded-full border-0 capitalize", TIER_STYLE[tier] || "bg-gray-100 text-gray-600")}>
              {tier}
            </Badge>
          )}
          {overLimit ? (
            <Badge className="text-[10px] font-bold px-1.5 py-0 rounded-full border-0 bg-red-600 text-white">
              ⚠ over limit
            </Badge>
          ) : outstanding > 0 ? (
            <Badge className="text-[10px] font-semibold px-1.5 py-0 rounded-full border-0 bg-amber-100 text-amber-700">
              owes {fmt(outstanding)}
            </Badge>
          ) : null}
          {pdc > 0 && (
            <Badge className="text-[10px] font-semibold px-1.5 py-0 rounded-full border-0 bg-blue-100 text-blue-700">
              PDC {fmt(pdc)}
            </Badge>
          )}
        </div>
        {customer.phone && (
          <div className="flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{customer.phone}</span>
          </div>
        )}
      </div>

      {/* Outstanding */}
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-xs text-muted-foreground mb-0.5">Outstanding</p>
        <p
          className={cn(
            "text-sm font-bold font-mono",
            outstanding > 0 ? "text-red-600" : "text-green-600"
          )}
        >
          {fmt(outstanding)}
        </p>
      </div>

      {/* Credit Limit */}
      <div className="text-right shrink-0 hidden md:block">
        <p className="text-xs text-muted-foreground mb-0.5">Credit Limit</p>
        <div className="flex items-center gap-1 justify-end">
          <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-mono text-foreground">
            {creditLimit > 0 ? fmt(creditLimit) : "—"}
          </span>
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );
}

/* ─────────────────────────────────────────
   Loading skeleton
───────────────────────────────────────── */
function CustomerRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
      <Skeleton className="w-9 h-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="hidden sm:flex flex-col items-end gap-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="hidden md:flex flex-col items-end gap-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="w-4 h-4 rounded" />
    </div>
  );
}

/* ─────────────────────────────────────────
   Main Page
───────────────────────────────────────── */
export default function Customers() {
  const [, nav] = useLocation();

  // Credit Exposure deep-link (dashboard "Credit Exposure" card):
  // /customers?filter=credit-outstanding → preset the VISIBLE controls
  // (Financial → Credit, Sort → highest outstanding) so the applied filter
  // shows in the dropdowns instead of filtering silently.
  const urlSearch = useSearch();
  const creditDeepLink = new URLSearchParams(urlSearch).get("filter") === "credit-outstanding";

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sortKey, setSortKey] = useState<SortKey>(creditDeepLink ? "outstanding" : "name");
  const [dialogOpen, setDialogOpen] = useState(false);

  /* fetch customers */
  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => fetch("/api/customers").then((r) => r.json()),
  });

  /* per-customer outstanding balance (drives the "owes" badge + credit filter/sort) */
  const { data: exposure } = useQuery<any>({
    queryKey: ["/api/reports/credit-exposure"],
    queryFn: () => fetch("/api/reports/credit-exposure").then((r) => r.json()).catch(() => ({ customers: [] })),
  });
  const balMap = new Map<number, number>();
  (exposure?.customers || []).forEach((c: any) => {
    if (c.customerId != null) balMap.set(c.customerId, Number(c.outstanding) || 0);
  });
  const bal = (id: number) => balMap.get(id) || 0;

  /* money-behaviour overview per customer (due / paid / PDC / tier) → dropdown filters + export */
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [finFilter, setFinFilter] = useState<FinFilter>(creditDeepLink ? "credit-owing" : "all");
  const { data: overview } = useQuery<any>({
    queryKey: ["/api/reports/customer-overview"],
    queryFn: () => fetch("/api/reports/customer-overview").then((r) => r.json()).catch(() => ({ rows: [], totals: {} })),
  });
  const ovMap = new Map<number, any>();
  (overview?.rows || []).forEach((r: any) => ovMap.set(r.customerId, r));
  const ov = (id: number) => ovMap.get(id);
  const totals = overview?.totals || {};

  /* last-purchase date per customer (only when sorting by it) — most-recent INV date */
  const { data: docsForSort } = useQuery<any[]>({
    queryKey: ["/api/documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()).catch(() => []),
    enabled: sortKey === "lastPurchase",
  });
  const lastPurchaseMap = new Map<number, string>();
  for (const d of Array.isArray(docsForSort) ? docsForSort : []) {
    if (d.type !== "INV" || d.customerId == null) continue;
    const cur = lastPurchaseMap.get(d.customerId);
    if (!cur || (d.date || "") > cur) lastPurchaseMap.set(d.customerId, d.date || "");
  }
  const lastP = (id: number) => lastPurchaseMap.get(id) || "";

  const list = Array.isArray(customers) ? customers : [];

  /* filter */
  const filtered = list.filter((c) => {
    if (c.active === false) return false;
    if (filterType !== "all" && c.type !== filterType) return false;
    if (finFilter === "credit-owing") {
      const o = ov(c.id);
      if (!o || o.financialStatus !== "credit" || !(bal(c.id) > 0)) return false;
      if (tierFilter !== "all" && o.tier !== tierFilter) return false;
    } else if (tierFilter !== "all" || finFilter !== "all") {
      const o = ov(c.id);
      if (!o) return false;
      if (tierFilter !== "all" && o.tier !== tierFilter) return false;
      if (finFilter !== "all" && o.financialStatus !== finFilter) return false;
    }
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q)
    );
  });

  /* CSV export of the visible customer list — name, phone, type, invoiced, paid, due, PDC, overdue, rating */
  function exportCsv() {
    const header = ["Customer", "Phone", "Type", "Financial Status", "Behavior Tier", "Invoiced", "Paid", "Amount Due", "PDC (uncleared)", "Days Overdue", "Profit (window)"];
    const rows = sorted.map((c) => {
      const o = ov(c.id) || {};
      return [c.name, c.phone || "", typeLabel(c.type), o.financialStatus || "—", o.tier || "—", o.totalInvoiced ?? 0, o.totalPaid ?? 0, o.amountDue ?? 0, o.pdcAmount ?? 0, o.maxDaysOverdue ?? 0, o.profit ?? 0];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  /* sort */
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "outstanding") return bal(b.id) - bal(a.id); // highest owed first
    if (sortKey === "lastPurchase") return lastP(b.id).localeCompare(lastP(a.id)); // most recent first
    return a.name.localeCompare(b.name); // name (default)
  });

  const totalCustomers = list.filter((c) => c.active !== false).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "Loading…" : `${totalCustomers} total customers`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={exportCsv} className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Customer
          </Button>
        </div>
      </div>

      {/* ── Overview strip — money health at a glance (display-only KPIs) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { k: "totalDue", label: "Total Due", val: fmt(totals.totalDue), tone: "text-red-600" },
          { k: "totalPdc", label: "PDC in hand", val: fmt(totals.totalPdc), tone: "text-amber-600" },
          { k: "overdue", label: "Overdue", val: `${totals.overdue ?? 0} cust`, tone: "text-red-600" },
          { k: "good", label: "Good standing", val: `${totals.goodStanding ?? 0} cust`, tone: "text-emerald-600" },
        ].map((s) => (
          <div key={s.k} className="rounded-xl border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className={cn("font-mono font-bold text-lg", s.tone)}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* ── Filters row ── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Behavior tier filter — system-calculated, 5 tiers */}
        <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as TierFilter)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Behavior" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Behavior</SelectItem>
            <SelectItem value="best">Best{totals.best != null ? ` (${totals.best})` : ""}</SelectItem>
            <SelectItem value="better">Better{totals.better != null ? ` (${totals.better})` : ""}</SelectItem>
            <SelectItem value="good">Good{totals.good != null ? ` (${totals.good})` : ""}</SelectItem>
            <SelectItem value="watch">Watch{totals.watch != null ? ` (${totals.watch})` : ""}</SelectItem>
            <SelectItem value="bad">Bad{totals.bad != null ? ` (${totals.bad})` : ""}</SelectItem>
          </SelectContent>
        </Select>

        {/* Financial status filter — account type (Cash / Credit) */}
        <Select value={finFilter} onValueChange={(v) => setFinFilter(v as FinFilter)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Financial" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            <SelectItem value="cash">Cash{totals.cash != null ? ` (${totals.cash})` : ""}</SelectItem>
            <SelectItem value="credit">Credit{totals.credit != null ? ` (${totals.credit})` : ""}</SelectItem>
            <SelectItem value="credit-owing">Credit (Owing)</SelectItem>
          </SelectContent>
        </Select>

        {/* Type filter */}
        <Select
          value={filterType}
          onValueChange={(v) => setFilterType(v as FilterType)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="walk-in">Walk-in</SelectItem>
            <SelectItem value="contractor">Contractor</SelectItem>
            <SelectItem value="corporate">Corporate</SelectItem>
            <SelectItem value="government">Government</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select
          value={sortKey}
          onValueChange={(v) => setSortKey(v as SortKey)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="outstanding">Outstanding (High–Low)</SelectItem>
            <SelectItem value="lastPurchase">Last Purchase</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Type summary badges ── */}
      <div className="flex gap-2 flex-wrap">
        {(
          [
            ["all", "All"],
            ["walk-in", "Walk-in"],
            ["contractor", "Contractor"],
            ["corporate", "Corporate"],
            ["government", "Government"],
          ] as [FilterType, string][]
        ).map(([val, label]) => {
          const count =
            val === "all"
              ? list.filter((c) => c.active !== false).length
              : list.filter(
                  (c) => c.active !== false && c.type === val
                ).length;
          return (
            <button
              key={val}
              onClick={() => setFilterType(val)}
              className={cn(
                "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
                filterType === val
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Customer list ── */}
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        {isLoading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <CustomerRowSkeleton key={i} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No customers found</p>
            {search && (
              <p className="text-sm text-muted-foreground mt-1">
                Try a different search term
              </p>
            )}
            {!search && filterType === "all" && (
              <Button
                className="mt-4"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Customer
              </Button>
            )}
          </div>
        ) : (
          sorted.map((customer) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              balance={bal(customer.id)}
              ov={ov(customer.id)}
              onNavigate={(id) => nav(`/customers/${id}`)}
            />
          ))
        )}
      </div>

      {/* count footer */}
      {sorted.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {sorted.length} of {totalCustomers} customers
        </p>
      )}

      {/* ── New Customer Dialog ── */}
      <NewCustomerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
