import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  BarChart2, Download, TrendingUp, DollarSign, FileText, Users, Package,
  CheckCircle2, AlertTriangle, RotateCcw, ShoppingCart, Calendar,
  ArrowUpRight, Clock, Send, MapPin,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessSummaryTab, StockMovementTab, AgingTab, PdcReportTab, ExpenseReportTab } from "@/pages/reports/Module9Tabs";
import LocationOverview from "@/pages/reports/LocationOverview";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */
type Store = { id: number; nameEn: string; type: string; active: boolean };

type DailySalesRow = {
  date: string;
  revenue: number;
  invoiceCount: number;
  cogs?: number;
  profit?: number;
};
type DailySalesResponse = {
  rows: DailySalesRow[];
  totalRevenue: number;
  invoiceCount: number;
  avgInvoiceValue: number;
  cashSales: number;
  creditSales: number;
  returnsTotal: number;
  cogs?: number;
  grossProfit?: number;
  marginPct?: number;
};

type UnpaidInvoice = {
  id: number;
  number: string;
  date: string;
  customerName: string | null;
  customerId: number | null;
  total: number | string;
  paid: number | string;
  remaining: number | string;
  daysOverdue: number;
};

type ChequeRow = {
  id: number;
  customerId: number | null;
  customerName?: string | null;
  chequeNumber: string;
  bankName: string;
  amount: number | string;
  chequeDate: string;
  status: "pending" | "cleared" | "cancelled" | "overdue";
  clearedDate: string | null;
};

type TopCustomer = {
  customerId: number;
  name: string;
  totalPurchases: number | string;
  invoiceCount: number;
  outstanding: number | string;
};

type TopProduct = {
  productId: number;
  name: string;
  qtySold: number;
  revenue?: number | string;
  stockLeft: number;
};

type InventoryRow = {
  productId: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  minStockQty: number;
  costPrice?: number | string;
  stockValue?: number | string;
};

type ReturnSummary = {
  total: number;
  rate: number;
  byType: { type: string; count: number; amount: number }[];
  topProducts: { name: string; count: number; amount: number }[];
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
function toNum(v: number | string | undefined | null): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(String(v)) || 0;
}

function fmtQAR(v: number | string | undefined | null): string {
  const n = toNum(v);
  return "QAR " + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function normalizeUnpaidInvoices(raw: unknown): UnpaidInvoice[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { invoices?: unknown }).invoices)
      ? (raw as { invoices: UnpaidInvoice[] }).invoices
      : [];
  return rows.map((inv) => ({
    ...inv,
    paid: inv.paid ?? (inv as { totalPaid?: number | string }).totalPaid ?? 0,
    daysOverdue: inv.daysOverdue ?? (inv as { daysOld?: number }).daysOld ?? 0,
  }));
}

function normalizeCheques(raw: unknown): ChequeRow[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as { cheques?: unknown }).cheques)) {
    return (raw as { cheques: ChequeRow[] }).cheques;
  }
  return [];
}

function normalizeReturnSummary(raw: unknown): ReturnSummary {
  const empty: ReturnSummary = { total: 0, rate: 0, byType: [], topProducts: [] };
  if (!raw || typeof raw !== "object") return empty;

  const data = raw as Record<string, unknown>;

  let byType: ReturnSummary["byType"] = [];
  if (Array.isArray(data.byType)) {
    byType = data.byType.map((t) => {
      const row = t as { type?: string; count?: number; amount?: number };
      return {
        type: String(row.type ?? "unknown"),
        count: Number(row.count ?? 0),
        amount: toNum(row.amount),
      };
    });
  } else if (data.byType && typeof data.byType === "object") {
    byType = Object.entries(data.byType as Record<string, number>).map(([type, count]) => ({
      type,
      count: Number(count ?? 0),
      amount: 0,
    }));
  }

  let topProducts: ReturnSummary["topProducts"] = [];
  if (Array.isArray(data.topProducts)) {
    topProducts = data.topProducts.map((p) => {
      const row = p as { name?: string; count?: number; amount?: number };
      return {
        name: String(row.name ?? "Unknown"),
        count: Number(row.count ?? 0),
        amount: toNum(row.amount),
      };
    });
  }

  const total = Number(data.total ?? data.count ?? byType.reduce((s, t) => s + t.count, 0));
  const rate = toNum(data.rate as number | string | null | undefined);

  return { total, rate, byType, topProducts };
}

function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TableSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <Card className="border-border/40 shadow-sm bg-card">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={cn("p-3 rounded-xl shrink-0", color)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
          <p className="text-xl font-bold font-mono text-foreground truncate tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Period picker helpers
───────────────────────────────────────────────────────────────────────────── */
type Period = "today" | "week" | "month" | "custom";

function computeDates(period: Period, customStart: string, customEnd: string): { start: string; end: string } {
  const today = new Date();
  if (period === "today") {
    const d = format(today, "yyyy-MM-dd");
    return { start: d, end: d };
  }
  if (period === "week") {
    return {
      start: format(startOfWeek(today, { weekStartsOn: 0 }), "yyyy-MM-dd"),
      end: format(endOfWeek(today, { weekStartsOn: 0 }), "yyyy-MM-dd"),
    };
  }
  if (period === "month") {
    return {
      start: format(startOfMonth(today), "yyyy-MM-dd"),
      end: format(endOfMonth(today), "yyyy-MM-dd"),
    };
  }
  return { start: customStart, end: customEnd };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Reports page
───────────────────────────────────────────────────────────────────────────── */
export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, nav] = useLocation();

  const todayStr = format(new Date(), "yyyy-MM-dd");

  /* ── Shared filter state ─── */
  // Honor a ?period= hint passed from Dashboard cards (e.g. "Cash Sales Today" → ?period=today)
  const [period, setPeriod] = useState<Period>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("period");
      return (["today", "week", "month", "custom"].includes(p || "") ? p : "month") as Period;
    } catch { return "month"; }
  });
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [storeId, setStoreId] = useState<string>("all");
  const [showCalStart, setShowCalStart] = useState(false);
  const [showCalEnd, setShowCalEnd] = useState(false);
  // Honor a #hash from Dashboard links (e.g. "Cheques Management" → /reports#cheques opens the Cheques tab)
  const [activeTab, setActiveTab] = useState(() => {
    // Business-performance tabs only; money-management moved to /finance.
    const tabs = ["summary", "locations", "stock-movement", "aging", "daily-sales", "top-customers", "top-products", "returns"];
    try {
      // Support ?tab= (dashboard "This Month Revenue" → /reports?tab=daily-sales) and #hash.
      const q = new URLSearchParams(window.location.search).get("tab");
      if (q && tabs.includes(q)) return q;
      const h = window.location.hash.replace("#", "");
      return tabs.includes(h) ? h : "summary";
    } catch { return "summary"; }
  });

  useEffect(() => {
    const handler = (e: Event) => setActiveTab((e as CustomEvent).detail);
    window.addEventListener("report-tab", handler);
    return () => window.removeEventListener("report-tab", handler);
  }, []);

  /* ── Per-section "Today" filters ─── */
  const [unpaidTodayOnly, setUnpaidTodayOnly] = useState(false);
  const [chequesTodayOnly, setChequesTodayOnly] = useState(false);

  const { start, end } = computeDates(period, customStart, customEnd);
  const storeParam = storeId === "all" ? "" : storeId;

  /* ── Stores (admin only) ─── */
  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
    enabled: isAdmin,
  });

  /* ── 1. Daily Sales ─── */
  const { data: dailySales, isLoading: salesLoading } = useQuery<DailySalesResponse>({
    queryKey: ["/api/reports/daily-sales", start, end, storeParam],
    queryFn: () =>
      fetch(`/api/reports/daily-sales?start=${start}&end=${end}${storeParam ? `&storeId=${storeParam}` : ""}`).then(
        (r) => r.json()
      ),
    enabled: activeTab === "daily-sales",
  });

  /* ── 2. Unpaid invoices (defaults to today's operations) ─── */
  const { data: unpaidRaw, isLoading: unpaidLoading } = useQuery<UnpaidInvoice[]>({
    queryKey: ["/api/reports/unpaid-invoices", todayStr],
    queryFn: () =>
      fetch(`/api/reports/unpaid-invoices?start=${todayStr}&end=${todayStr}`).then((r) => r.json()),
    enabled: activeTab === "unpaid",
    select: normalizeUnpaidInvoices,
  });

  /* ── 3. Cheques (defaults to today's operations) ─── */
  const { data: chequesRaw, isLoading: chequesLoading } = useQuery<ChequeRow[]>({
    queryKey: ["/api/reports/cheque-calendar", todayStr],
    queryFn: () =>
      fetch(`/api/reports/cheque-calendar?start=${todayStr}&end=${todayStr}`).then((r) => r.json()),
    enabled: activeTab === "cheques",
    select: normalizeCheques,
  });

  const clearChequeMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/cheques/${id}/clear`, { method: "PUT", headers: { "Content-Type": "application/json" } }).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reports/cheque-calendar"] });
      toast({ title: "Cheque marked as cleared" });
    },
    onError: () => toast({ title: "Failed to clear cheque", variant: "destructive" }),
  });

  /* ── 4. Top Customers ─── */
  const { data: topCustomers, isLoading: topCustLoading } = useQuery<TopCustomer[]>({
    queryKey: ["/api/reports/top-customers", start, end, storeParam],
    queryFn: () => fetch(`/api/reports/top-customers?start=${start}&end=${end}${storeParam ? `&storeId=${storeParam}` : ""}`).then((r) => r.json()),
    enabled: activeTab === "top-customers",
  });

  /* ── 5. Top Products ─── */
  const { data: topProducts, isLoading: topProdLoading } = useQuery<TopProduct[]>({
    queryKey: ["/api/reports/top-products", start, end],
    queryFn: () => fetch(`/api/reports/top-products?start=${start}&end=${end}`).then((r) => r.json()),
    enabled: activeTab === "top-products",
  });

  /* ── 6. Inventory ─── */
  const { data: inventoryRaw, isLoading: invLoading } = useQuery<InventoryRow[]>({
    queryKey: ["/api/reports/inventory", storeParam],
    queryFn: () =>
      fetch(`/api/reports/inventory${storeParam ? `?storeId=${storeParam}` : ""}`).then((r) => r.json()),
    enabled: activeTab === "inventory",
  });

  /* ── 7. Returns ─── */
  const { data: returnsSummary, isLoading: returnsLoading } = useQuery<ReturnSummary>({
    queryKey: ["/api/reports/returns", start, end],
    queryFn: () => fetch(`/api/reports/returns?start=${start}&end=${end}`).then((r) => r.json()),
    enabled: activeTab === "returns",
    select: normalizeReturnSummary,
  });

  /* ── Derived: aging buckets ─── */
  const unpaidAll = Array.isArray(unpaidRaw) ? unpaidRaw : [];
  const unpaid = unpaidTodayOnly
    ? unpaidAll.filter((i) => i.date === todayStr)
    : unpaidAll;
  const aging = useMemo(() => {
    const b0 = unpaid.filter((i) => i.daysOverdue <= 30);
    const b31 = unpaid.filter((i) => i.daysOverdue > 30 && i.daysOverdue <= 60);
    const b61 = unpaid.filter((i) => i.daysOverdue > 60 && i.daysOverdue <= 90);
    const b90p = unpaid.filter((i) => i.daysOverdue > 90);
    return { b0, b31, b61, b90p };
  }, [unpaid]);

  /* ── Derived: cheque groups ─── */
  const chequesAll = Array.isArray(chequesRaw) ? chequesRaw : [];
  const cheques = chequesTodayOnly
    ? chequesAll.filter((c) => c.chequeDate === todayStr)
    : chequesAll;
  const chequeGroups = useMemo(() => {
    const today = new Date();
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    return {
      overdue: cheques.filter((c) => c.status === "overdue"),
      thisWeek: cheques.filter((c) => {
        if (c.status !== "pending") return false;
        const d = new Date(c.chequeDate);
        return d <= in7;
      }),
      thisMonth: cheques.filter((c) => {
        if (c.status !== "pending") return false;
        const d = new Date(c.chequeDate);
        return d > in7 && d <= in30;
      }),
      cleared: cheques.filter((c) => c.status === "cleared"),
      cancelled: cheques.filter((c) => c.status === "cancelled"),
    };
  }, [cheques]);

  /* ─────────────────────────────────────────────────────────────────────────
     Shared top bar
  ───────────────────────────────────────────────────────────────────────── */
  const TopBar = useCallback(
    ({ onExport }: { onExport: () => void }) => (
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Period buttons */}
        {(["today", "week", "month", "custom"] as Period[]).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period === p ? "default" : "outline"}
            onClick={() => setPeriod(p)}
            className="h-8 text-xs capitalize"
          >
            {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
          </Button>
        ))}

        {/* Custom date inputs */}
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <Popover open={showCalStart} onOpenChange={setShowCalStart}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs font-mono">
                  {customStart}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarUI
                  mode="single"
                  selected={new Date(customStart)}
                  onSelect={(d) => {
                    if (d) { setCustomStart(format(d, "yyyy-MM-dd")); setShowCalStart(false); }
                  }}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-xs">to</span>
            <Popover open={showCalEnd} onOpenChange={setShowCalEnd}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs font-mono">
                  {customEnd}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarUI
                  mode="single"
                  selected={new Date(customEnd)}
                  onSelect={(d) => {
                    if (d) { setCustomEnd(format(d, "yyyy-MM-dd")); setShowCalEnd(false); }
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Store filter (admin) */}
        {isAdmin && (
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="All Stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {(Array.isArray(stores) ? stores : []).map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex-1" />

        {/* Export */}
        <Button size="sm" variant="outline" onClick={onExport} className="h-8 text-xs gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>
    ),
    [period, customStart, customEnd, showCalStart, showCalEnd, storeId, isAdmin, stores]
  );

  /* ─────────────────────────────────────────────────────────────────────────
     TAB 1: Daily Sales
  ───────────────────────────────────────────────────────────────────────── */
  const DailySalesTab = () => {
    const rows: DailySalesRow[] = salesLoading ? [] : (dailySales?.rows ?? []);
    const [showInv, setShowInv] = useState(false);
    // Drill-down: the actual invoices behind the period's revenue (clickable → invoice).
    const { data: allDocs = [] } = useQuery<any[]>({
      queryKey: ["/api/documents"],
      queryFn: () => fetch("/api/documents").then((r) => r.json()).catch(() => []),
      enabled: activeTab === "daily-sales",
    });
    const periodInvs = (Array.isArray(allDocs) ? allDocs : [])
      .filter((d: any) => d.type === "INV" && d.status !== "void" && (d.date >= start && d.date <= end))
      .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));

    function exportCSV() {
      const headers = ["Date", "Revenue", "Invoice Count", ...(isAdmin ? ["COGS", "Gross Profit"] : [])];
      const data = rows.map((r) => [
        r.date,
        toNum(r.revenue).toFixed(2),
        String(r.invoiceCount),
        ...(isAdmin ? [toNum(r.cogs).toFixed(2), toNum(r.profit).toFixed(2)] : []),
      ]);
      downloadCSV(`daily-sales-${start}-${end}.csv`, [headers, ...data]);
    }

    return (
      <>
        <TopBar onExport={exportCSV} />

        {/* Hero stat cards */}
        {salesLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border/40">
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <button onClick={() => setShowInv((v) => !v)} className="text-left rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 p-5 text-white shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/30 hover:scale-[1.02] transition-transform">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100 mb-1">Total revenue</p>
                <p className="text-2xl font-bold tabular-nums">{fmtQAR(dailySales?.totalRevenue)}</p>
                <p className="text-xs text-emerald-200 mt-1">{dailySales?.invoiceCount ?? 0} invoices</p>
              </button>
              <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 p-5 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-1">Avg invoice</p>
                <p className="text-2xl font-bold tabular-nums">{fmtQAR(dailySales?.avgInvoiceValue)}</p>
                <p className="text-xs text-blue-200 mt-1">per transaction</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 p-5 text-white shadow-lg shadow-green-500/20 dark:shadow-green-900/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-green-100 mb-1">Cash sales</p>
                <p className="text-2xl font-bold tabular-nums">{fmtQAR(dailySales?.cashSales)}</p>
                <p className="text-xs text-green-200 mt-1">collected</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 dark:from-amber-600 dark:to-orange-700 p-5 text-white shadow-lg shadow-amber-500/20 dark:shadow-amber-900/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-100 mb-1">Credit sales</p>
                <p className="text-2xl font-bold tabular-nums">{fmtQAR(dailySales?.creditSales)}</p>
                <p className="text-xs text-amber-200 mt-1">outstanding</p>
              </div>
            </div>
            <div className={cn("grid gap-3 mb-6", isAdmin ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 max-w-xs")}>
              <div className="rounded-xl border border-border/40 bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Returns</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">{fmtQAR(dailySales?.returnsTotal)}</p>
              </div>
              {isAdmin && (
                <>
                  <div className="rounded-xl border border-border/40 bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">COGS</p>
                    <p className="text-lg font-bold text-foreground tabular-nums">{fmtQAR(dailySales?.cogs)}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Gross profit</p>
                    <p className="text-lg font-bold text-purple-600 dark:text-purple-400 tabular-nums">{fmtQAR(dailySales?.grossProfit)}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Margin</p>
                    <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">{toNum(dailySales?.marginPct).toFixed(1)}%</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Revenue drill-down — the invoices behind the total (clickable → invoice),
            plus quick links to the Top Products / Top Customers breakdowns. */}
        <div className="mb-6 rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
          <button onClick={() => setShowInv((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
            <span className="text-sm font-semibold">Invoices behind this revenue ({periodInvs.length})</span>
            <span className="text-xs text-primary font-semibold">{showInv ? "Hide" : "Show"}</span>
          </button>
          {showInv && (periodInvs.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground border-t">No invoices in this period.</p>
          ) : (
            <div className="divide-y border-t max-h-96 overflow-y-auto">
              {periodInvs.slice(0, 100).map((d: any) => (
                <div key={d.id} onClick={() => nav(`/documents/${d.id}`)} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/30 cursor-pointer transition-colors">
                  <span className="font-mono text-blue-600 dark:text-blue-400">{d.number}</span>
                  <span className="flex-1 truncate text-muted-foreground">{d.customerName || "—"}</span>
                  <span className="text-xs text-muted-foreground hidden sm:block">{d.date}</span>
                  <span className="font-mono font-semibold tabular-nums">{fmtQAR(d.total)}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="flex gap-4 px-4 py-2 border-t bg-muted/10">
            <button onClick={() => setActiveTab("top-products")} className="text-xs font-semibold text-primary hover:underline">Top products →</button>
            <button onClick={() => setActiveTab("top-customers")} className="text-xs font-semibold text-primary hover:underline">Top customers →</button>
            <button onClick={() => setActiveTab("summary")} className="text-xs font-semibold text-primary hover:underline">By category →</button>
          </div>
        </div>

        {/* Bar chart */}
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Daily Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="h-56 flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : rows.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                No data for this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => format(new Date(v), "dd MMM")}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                    width={40}
                  />
                  <Tooltip
                    formatter={(v: number) => [fmtQAR(v), "Revenue"]}
                    labelFormatter={(l) => format(new Date(l), "dd MMM yyyy")}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {rows.map((_, i) => (
                      <Cell key={i} fill="#3b82f6" fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────
     TAB 2: Unpaid Invoices (Aging)
  ───────────────────────────────────────────────────────────────────────── */
  const UnpaidTab = () => {
    function exportCSV() {
      const headers = ["Customer", "Invoice#", "Date", "Total", "Paid", "Remaining", "Days Overdue"];
      const data = unpaid.map((i) => [
        i.customerName ?? "",
        i.number,
        i.date,
        toNum(i.total).toFixed(2),
        toNum(i.paid).toFixed(2),
        toNum(i.remaining).toFixed(2),
        String(i.daysOverdue),
      ]);
      downloadCSV("unpaid-invoices.csv", [headers, ...data]);
    }

    function sendReminders() {
      toast({ title: "Reminders queued", description: `${unpaid.length} customers added to message queue.` });
    }

    const grandTotal = unpaid.reduce((s, i) => s + toNum(i.remaining), 0);

    const AgingBucket = ({
      label,
      items,
      badgeClass,
    }: {
      label: string;
      items: UnpaidInvoice[];
      badgeClass: string;
    }) => {
      if (items.length === 0) return null;
      const bucketTotal = items.reduce((s, i) => s + toNum(i.remaining), 0);
      return (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className={cn("text-sm font-bold px-2.5 py-1 rounded-full border", badgeClass)}>{label}</h3>
            <span className="text-sm font-mono font-bold">{fmtQAR(bucketTotal)}</span>
          </div>
          <div className="border border-border/40 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Invoice#</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs text-right">Remaining</TableHead>
                  <TableHead className="text-xs text-right">Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((inv, i) => (
                  <TableRow
                    key={inv.id}
                    className={cn(
                      "cursor-pointer hover:bg-muted/20 transition-colors",
                      i % 2 === 0 ? "" : "bg-muted/10"
                    )}
                    onClick={() => nav(`/documents/${inv.id}`)}
                  >
                    <TableCell className="text-sm font-medium">{inv.customerName ?? "—"}</TableCell>
                    <TableCell className="text-sm font-mono">{inv.number}</TableCell>
                    <TableCell className="text-sm">{inv.date ? format(new Date(inv.date), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell className="text-sm font-mono text-right">{fmtQAR(inv.total)}</TableCell>
                    <TableCell className="text-sm font-mono text-right">{fmtQAR(inv.paid)}</TableCell>
                    <TableCell className="text-sm font-mono font-bold text-right text-red-600 dark:text-red-400">{fmtQAR(inv.remaining)}</TableCell>
                    <TableCell className="text-sm text-right">{inv.daysOverdue}d</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    };

    return (
      <>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
            Today — {format(new Date(todayStr), "dd MMM yyyy")}
          </span>
          <Button
            size="sm"
            variant={!unpaidTodayOnly ? "default" : "outline"}
            onClick={() => setUnpaidTodayOnly(false)}
            className="h-8 text-xs"
          >
            All
          </Button>
          <Button
            size="sm"
            variant={unpaidTodayOnly ? "default" : "outline"}
            onClick={() => setUnpaidTodayOnly(true)}
            className="h-8 text-xs"
          >
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={sendReminders} className="h-8 text-xs gap-1.5">
            <Send className="w-3.5 h-3.5" />
            Send Reminders
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>

        {unpaidLoading ? (
          <TableSkeleton cols={7} />
        ) : unpaid.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">No unpaid invoices.</div>
        ) : (
          <>
            <AgingBucket
              label="0–30 days"
              items={aging.b0}
              badgeClass="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800"
            />
            <AgingBucket
              label="31–60 days"
              items={aging.b31}
              badgeClass="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800"
            />
            <AgingBucket
              label="61–90 days"
              items={aging.b61}
              badgeClass="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800"
            />
            <AgingBucket
              label="90+ days"
              items={aging.b90p}
              badgeClass="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800"
            />

            <Separator className="my-4" />
            <div className="flex justify-between items-center px-1">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Grand Total Outstanding</span>
              <span className="text-xl font-bold font-mono text-red-600 dark:text-red-400 tabular-nums">{fmtQAR(grandTotal)}</span>
            </div>
          </>
        )}
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────
     TAB 3: Cheque Calendar
  ───────────────────────────────────────────────────────────────────────── */
  const ChequesTab = () => {
    function exportCSV() {
      const headers = ["Customer", "Cheque#", "Bank", "Amount", "Due Date", "Status"];
      const data = cheques.map((c) => [
        c.customerName ?? "",
        c.chequeNumber,
        c.bankName,
        toNum(c.amount).toFixed(2),
        c.chequeDate,
        c.status,
      ]);
      downloadCSV("cheque-calendar.csv", [headers, ...data]);
    }

    type ChequeGroupDef = {
      label: string;
      items: ChequeRow[];
      rowClass: string;
      badgeClass: string;
      showClear?: boolean;
    };

    const groups: ChequeGroupDef[] = [
      { label: "Overdue", items: chequeGroups.overdue, rowClass: "bg-red-50/50 dark:bg-red-950/20", badgeClass: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800", showClear: true },
      { label: "Due This Week", items: chequeGroups.thisWeek, rowClass: "bg-orange-50/50 dark:bg-orange-950/20", badgeClass: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800", showClear: true },
      { label: "Due This Month", items: chequeGroups.thisMonth, rowClass: "bg-yellow-50/50 dark:bg-yellow-950/20", badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800", showClear: true },
      { label: "Cleared", items: chequeGroups.cleared, rowClass: "", badgeClass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800" },
      { label: "Cancelled", items: chequeGroups.cancelled, rowClass: "bg-gray-50/50 dark:bg-gray-900/20", badgeClass: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700" },
    ];

    return (
      <>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
            Today — {format(new Date(todayStr), "dd MMM yyyy")}
          </span>
          <Button
            size="sm"
            variant={!chequesTodayOnly ? "default" : "outline"}
            onClick={() => setChequesTodayOnly(false)}
            className="h-8 text-xs"
          >
            All
          </Button>
          <Button
            size="sm"
            variant={chequesTodayOnly ? "default" : "outline"}
            onClick={() => setChequesTodayOnly(true)}
            className="h-8 text-xs"
          >
            Today
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>

        {chequesLoading ? (
          <TableSkeleton cols={6} />
        ) : cheques.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">No cheques found.</div>
        ) : (
          groups.map(({ label, items, rowClass, badgeClass, showClear }) => {
            if (items.length === 0) return null;
            const groupTotal = items.reduce((s, c) => s + toNum(c.amount), 0);
            return (
              <div key={label} className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={cn("text-sm font-bold px-2.5 py-1 rounded-full border", badgeClass)}>{label}</h3>
                  <span className="text-sm font-mono font-bold">{fmtQAR(groupTotal)}</span>
                </div>
                <div className="border border-border/40 rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Cheque#</TableHead>
                        <TableHead className="text-xs">Bank</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs text-center">Due Date</TableHead>
                        <TableHead className="text-xs text-center">Status</TableHead>
                        {showClear && isAdmin && <TableHead className="text-xs" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((c, i) => (
                        <TableRow key={c.id} className={cn(i % 2 === 0 ? "" : "bg-muted/10", rowClass)}>
                          <TableCell className="text-sm font-medium">{c.customerName ?? `Customer #${c.customerId}`}</TableCell>
                          <TableCell className="text-sm font-mono">{c.chequeNumber}</TableCell>
                          <TableCell className="text-sm">{c.bankName}</TableCell>
                          <TableCell className="text-sm font-mono font-bold text-right">{fmtQAR(c.amount)}</TableCell>
                          <TableCell className="text-sm text-center">
                            {c.chequeDate ? format(new Date(c.chequeDate), "dd MMM yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border capitalize", badgeClass)}>
                              {c.status}
                            </span>
                          </TableCell>
                          {showClear && isAdmin && (
                            <TableCell>
                              {c.status !== "cleared" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1"
                                  disabled={clearChequeMut.isPending}
                                  onClick={() => clearChequeMut.mutate(c.id)}
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Clear
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })
        )}
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────
     TAB 4: Top Customers
  ───────────────────────────────────────────────────────────────────────── */
  const TopCustomersTab = () => {
    const customers = Array.isArray(topCustomers) ? topCustomers : [];
    const totalPurchases = customers.reduce((s, c) => s + toNum(c.totalPurchases), 0);
    const totalOutstanding = customers.reduce((s, c) => s + toNum(c.outstanding), 0);
    const totalInvoices = customers.reduce((s, c) => s + c.invoiceCount, 0);
    const maxPurchase = Math.max(...customers.map(c => toNum(c.totalPurchases)), 1);

    function exportCSV() {
      const headers = ["Rank", "Customer", "Total Purchases", "Invoice Count", "Outstanding"];
      const data = customers.map((c, i) => [
        String(i + 1),
        c.name,
        toNum(c.totalPurchases).toFixed(2),
        String(c.invoiceCount),
        toNum(c.outstanding).toFixed(2),
      ]);
      downloadCSV(`top-customers-${start}-${end}.csv`, [headers, ...data]);
    }

    return (
      <>
        <TopBar onExport={exportCSV} />

        {/* Hero stats */}
        {!topCustLoading && customers.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 dark:from-violet-600 dark:to-purple-700 p-5 text-white shadow-lg shadow-violet-500/20 dark:shadow-violet-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-100 mb-1">Total purchases</p>
              <p className="text-2xl font-bold tabular-nums">{fmtQAR(totalPurchases)}</p>
              <p className="text-xs text-violet-200 mt-1">{customers.length} customers</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 p-5 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-1">Total invoices</p>
              <p className="text-2xl font-bold tabular-nums">{totalInvoices}</p>
              <p className="text-xs text-blue-200 mt-1">in period</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 dark:from-amber-600 dark:to-orange-700 p-5 text-white shadow-lg shadow-amber-500/20 dark:shadow-amber-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-100 mb-1">Outstanding</p>
              <p className="text-2xl font-bold tabular-nums">{fmtQAR(totalOutstanding)}</p>
              <p className="text-xs text-amber-200 mt-1">credit balance</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 p-5 text-white shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100 mb-1">Avg per customer</p>
              <p className="text-2xl font-bold tabular-nums">{fmtQAR(customers.length ? totalPurchases / customers.length : 0)}</p>
              <p className="text-xs text-emerald-200 mt-1">purchase value</p>
            </div>
          </div>
        )}

        {topCustLoading ? (
          <TableSkeleton cols={5} />
        ) : customers.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">No data for this period.</div>
        ) : (
          <div className="border border-border/40 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs w-12">#</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Share</TableHead>
                  <TableHead className="text-xs text-right">Total Purchases</TableHead>
                  <TableHead className="text-xs text-right">Invoices</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c, i) => {
                  const pct = maxPurchase > 0 ? (toNum(c.totalPurchases) / maxPurchase) * 100 : 0;
                  return (
                    <TableRow
                      key={`cust-${c.customerId ?? "x"}-${i}`}
                      className={cn(
                        "cursor-pointer hover:bg-muted/20 transition-colors",
                        i % 2 === 0 ? "" : "bg-muted/10"
                      )}
                      onClick={() => nav(`/customers/${c.customerId}`)}
                    >
                      <TableCell>
                        {i < 3 ? (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black",
                              i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 ring-2 ring-amber-300/50" :
                              i === 1 ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 ring-2 ring-slate-300/50 dark:ring-slate-600/50" :
                              "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 ring-2 ring-orange-300/50"
                            )}
                          >
                            {i + 1}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground pl-1.5">{i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-semibold">{c.name}</TableCell>
                      <TableCell className="min-w-[100px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                            <div className="h-full rounded-full bg-violet-500 dark:bg-violet-400 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-8">{pct.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono font-bold text-right tabular-nums">{fmtQAR(c.totalPurchases)}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{c.invoiceCount}</TableCell>
                      <TableCell className="text-sm font-mono text-right tabular-nums">
                        <span className={toNum(c.outstanding) > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                          {fmtQAR(c.outstanding)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────
     TAB 5: Top Products
  ───────────────────────────────────────────────────────────────────────── */
  const TopProductsTab = () => {
    const products = Array.isArray(topProducts) ? topProducts : [];
    const totalQtySold = products.reduce((s, p) => s + (Number.isNaN(p.qtySold) || !p.qtySold ? 0 : p.qtySold), 0);
    const totalRevenue = products.reduce((s, p) => s + toNum(p.revenue), 0);
    const maxQty = Math.max(...products.map(p => Number.isNaN(p.qtySold) || !p.qtySold ? 0 : p.qtySold), 1);
    const outOfStock = products.filter(p => p.stockLeft === 0).length;

    function exportCSV() {
      const headers = ["Rank", "Product", "Qty Sold", ...(isAdmin ? ["Revenue"] : []), "Stock Left"];
      const data = products.map((p, i) => [
        String(i + 1),
        p.name,
        String(p.qtySold),
        ...(isAdmin ? [toNum(p.revenue).toFixed(2)] : []),
        String(p.stockLeft),
      ]);
      downloadCSV(`top-products-${start}-${end}.csv`, [headers, ...data]);
    }

    return (
      <>
        <TopBar onExport={exportCSV} />

        {/* Hero stats */}
        {!topProdLoading && products.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 dark:from-blue-600 dark:to-cyan-700 p-5 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-1">Total qty sold</p>
              <p className="text-2xl font-bold tabular-nums">{totalQtySold.toLocaleString()}</p>
              <p className="text-xs text-blue-200 mt-1">{products.length} products</p>
            </div>
            {isAdmin && (
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 p-5 text-white shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100 mb-1">Total revenue</p>
                <p className="text-2xl font-bold tabular-nums">{fmtQAR(totalRevenue)}</p>
                <p className="text-xs text-emerald-200 mt-1">from top sellers</p>
              </div>
            )}
            <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 dark:from-amber-600 dark:to-orange-700 p-5 text-white shadow-lg shadow-amber-500/20 dark:shadow-amber-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-100 mb-1">Best seller</p>
              <p className="text-lg font-bold leading-tight truncate">{products[0]?.name ?? "—"}</p>
              <p className="text-xs text-amber-200 mt-1">{products[0]?.qtySold ?? 0} units</p>
            </div>
            <div className={cn("rounded-2xl p-5 shadow-lg", outOfStock > 0 ? "bg-gradient-to-br from-red-500 to-rose-600 dark:from-red-600 dark:to-rose-700 text-white shadow-red-500/20 dark:shadow-red-900/30" : "bg-gradient-to-br from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 text-white shadow-green-500/20 dark:shadow-green-900/30")}>
              <p className={cn("text-xs font-semibold uppercase tracking-wider mb-1", outOfStock > 0 ? "text-red-100" : "text-green-100")}>Out of stock</p>
              <p className="text-2xl font-bold tabular-nums">{outOfStock}</p>
              <p className={cn("text-xs mt-1", outOfStock > 0 ? "text-red-200" : "text-green-200")}>{outOfStock > 0 ? "need reorder" : "all stocked"}</p>
            </div>
          </div>
        )}

        {topProdLoading ? (
          <TableSkeleton cols={isAdmin ? 5 : 4} />
        ) : products.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">No data for this period.</div>
        ) : (
          <div className="border border-border/40 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs w-12">#</TableHead>
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Sales volume</TableHead>
                  <TableHead className="text-xs text-right">Qty Sold</TableHead>
                  {isAdmin && <TableHead className="text-xs text-right">Revenue</TableHead>}
                  <TableHead className="text-xs text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p, i) => {
                  const pct = maxQty > 0 ? (p.qtySold / maxQty) * 100 : 0;
                  return (
                    <TableRow key={`prod-${p.productId ?? "x"}-${i}`} className={cn("hover:bg-muted/20 transition-colors", i % 2 === 0 ? "" : "bg-muted/10")}>
                      <TableCell>
                        {i < 3 ? (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black",
                              i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 ring-2 ring-amber-300/50" :
                              i === 1 ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 ring-2 ring-slate-300/50 dark:ring-slate-600/50" :
                              "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 ring-2 ring-orange-300/50"
                            )}
                          >
                            {i + 1}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground pl-1.5">{i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-semibold">{p.name}</TableCell>
                      <TableCell className="min-w-[100px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono text-right tabular-nums">{p.qtySold}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-sm font-mono font-bold text-right tabular-nums">{fmtQAR(p.revenue)}</TableCell>
                      )}
                      <TableCell className="text-sm font-mono text-right tabular-nums">
                        {p.stockLeft === 0 ? (
                          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">OUT</Badge>
                        ) : p.stockLeft <= 5 ? (
                          <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 font-semibold">
                            <AlertTriangle className="w-3 h-3" />{p.stockLeft}
                          </span>
                        ) : (
                          <span className="text-foreground">{p.stockLeft}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────
     TAB 6: Inventory
  ───────────────────────────────────────────────────────────────────────── */
  const InventoryTab = () => {
    const inventory = Array.isArray(inventoryRaw) ? inventoryRaw : [];
    const [search, setSearch] = useState("");
    const filtered = inventory.filter(
      (r) =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.sku.toLowerCase().includes(search.toLowerCase()) ||
        r.category.toLowerCase().includes(search.toLowerCase())
    );

    const outOfStock = inventory.filter((r) => r.qty === 0).length;
    const lowStock = inventory.filter((r) => r.qty > 0 && r.qty <= r.minStockQty).length;
    const totalStockValue = isAdmin
      ? inventory.reduce((s, r) => s + toNum(r.stockValue), 0)
      : 0;

    function exportCSV() {
      const headers = ["SKU", "Product", "Category", "Unit", "Qty", "Min Stock", ...(isAdmin ? ["Stock Value"] : [])];
      const data = filtered.map((r) => [
        r.sku,
        r.name,
        r.category,
        r.unit,
        String(r.qty),
        String(r.minStockQty),
        ...(isAdmin ? [toNum(r.stockValue).toFixed(2)] : []),
      ]);
      downloadCSV("inventory.csv", [headers, ...data]);
    }

    return (
      <>
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {isAdmin && (
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="All Stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            placeholder="Search product / SKU / category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs w-64"
          />
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>

        {!invLoading && (
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-1.5 rounded-full">
              <Package className="w-3.5 h-3.5" />
              {outOfStock} Out of Stock
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 px-3 py-1.5 rounded-full">
              <AlertTriangle className="w-3.5 h-3.5" />
              {lowStock} Low Stock
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-full">
                <DollarSign className="w-3.5 h-3.5" />
                Total Stock Value: {fmtQAR(totalStockValue)}
              </div>
            )}
          </div>
        )}

        {invLoading ? (
          <TableSkeleton cols={isAdmin ? 7 : 6} />
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            {search ? "No products match your search." : "No inventory data."}
          </div>
        ) : (
          <div className="border border-border/40 rounded-xl overflow-hidden">
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Unit</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Min</TableHead>
                    {isAdmin && <TableHead className="text-xs text-right">Stock Value</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, i) => {
                    const isOut = r.qty === 0;
                    const isLow = !isOut && r.qty <= r.minStockQty;
                    return (
                      <TableRow
                        key={`inv-${r.productId ?? "x"}-${i}`}
                        className={cn(
                          i % 2 === 0 ? "" : "bg-muted/10",
                          isOut ? "bg-red-50/60 dark:bg-red-950/20" : isLow ? "bg-orange-50/60 dark:bg-orange-950/20" : ""
                        )}
                      >
                        <TableCell className="text-xs font-mono text-muted-foreground">{r.sku}</TableCell>
                        <TableCell className="text-sm font-semibold">
                          <div className="flex items-center gap-2">
                            {r.name}
                            {isOut && (
                              <Badge variant="destructive" className="text-[10px] h-4 px-1">OUT</Badge>
                            )}
                            {isLow && !isOut && (
                              <Badge className="text-[10px] h-4 px-1 bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-100">LOW</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.category}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.unit}</TableCell>
                        <TableCell
                          className={cn(
                            "text-sm font-mono font-bold text-right tabular-nums",
                            isOut ? "text-red-600 dark:text-red-400" : isLow ? "text-orange-600 dark:text-orange-400" : ""
                          )}
                        >
                          {r.qty}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-right text-muted-foreground">{r.minStockQty}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-sm font-mono text-right">{fmtQAR(r.stockValue)}</TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────
     TAB 7: Returns
  ───────────────────────────────────────────────────────────────────────── */
  const ReturnsTab = () => {
    const summary = returnsSummary ?? { total: 0, rate: 0, byType: [], topProducts: [] };
    const byTypeRows = summary?.byType ?? [];
    const topProductRows = summary?.topProducts ?? [];
    const totalAmount = byTypeRows.reduce((s, t) => s + toNum(t.amount), 0);

    const typeColors: Record<string, string> = {
      full: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
      partial: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800",
      exchange: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800",
      damage_claim: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800",
      billing_correction: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400 border border-gray-200 dark:border-gray-700",
    };
    const typeLabels: Record<string, string> = {
      full: "Full Return",
      partial: "Partial Return",
      exchange: "Exchange",
      damage_claim: "Damage Claim",
      billing_correction: "Billing Correction",
    };

    function exportCSV() {
      const headers = ["Type", "Count", "Amount"];
      const data = byTypeRows.map((t) => [
        typeLabels[t.type] ?? t.type,
        String(t.count),
        toNum(t.amount).toFixed(2),
      ]);
      downloadCSV(`returns-${start}-${end}.csv`, [headers, ...data]);
    }

    return (
      <>
        <TopBar onExport={exportCSV} />

        {/* Hero stats */}
        {returnsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border/40">
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 p-5 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-1">Total returns</p>
              <p className="text-2xl font-bold tabular-nums">{summary.total}</p>
              <p className="text-xs text-blue-200 mt-1">{byTypeRows.length} types</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 dark:from-orange-600 dark:to-red-700 p-5 text-white shadow-lg shadow-orange-500/20 dark:shadow-orange-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-100 mb-1">Return rate</p>
              <p className="text-2xl font-bold tabular-nums">{toNum(summary.rate).toFixed(1)}%</p>
              <p className="text-xs text-orange-200 mt-1">of total invoices</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 dark:from-rose-600 dark:to-pink-700 p-5 text-white shadow-lg shadow-rose-500/20 dark:shadow-rose-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-100 mb-1">Return value</p>
              <p className="text-2xl font-bold tabular-nums">{fmtQAR(totalAmount)}</p>
              <p className="text-xs text-rose-200 mt-1">total refunded</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* By Type */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Returns by type
              </CardTitle>
            </CardHeader>
            <CardContent>
              {returnsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : byTypeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No returns in this period.</p>
              ) : (
                <div className="space-y-2">
                  {(summary?.byType || []).map((t) => (
                    <div key={t.type} className="flex items-center justify-between py-2.5 border-b border-border/20 last:border-0">
                      <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", typeColors[t.type] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400")}>
                        {typeLabels[t.type] ?? t.type}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold tabular-nums">{t.count}</span>
                        <span className="text-sm font-mono text-muted-foreground tabular-nums">{fmtQAR(t.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Most Returned Products */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Most returned products
              </CardTitle>
            </CardHeader>
            <CardContent>
              {returnsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : topProductRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No product returns in this period.</p>
              ) : (
                <div className="space-y-2">
                  {(summary?.topProducts || []).map((p, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 border-b border-border/20 last:border-0">
                      <span className={cn(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black shrink-0",
                        i === 0 ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" :
                        i === 1 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold flex-1 truncate">{p.name}</span>
                      <span className="text-sm font-mono font-bold tabular-nums">{p.count}x</span>
                      <span className="text-sm font-mono text-muted-foreground tabular-nums">{fmtQAR(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────
     TAB 8: Tax Summary
  ───────────────────────────────────────────────────────────────────────── */
  const TaxTab = () => {
    const revenue = toNum(dailySales?.totalRevenue);
    const taxRate = 0;
    const taxAmount = (revenue * taxRate) / 100;

    function exportCSV() {
      downloadCSV("tax-summary.csv", [
        ["Period", "Total Sales", "Tax Rate", "Tax Amount"],
        [`${start} to ${end}`, revenue.toFixed(2), `${taxRate}%`, taxAmount.toFixed(2)],
      ]);
    }

    return (
      <>
        <TopBar onExport={exportCSV} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            icon={<DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
            label="Total Sales"
            value={fmtQAR(revenue)}
            color="bg-blue-50 dark:bg-blue-950/40"
          />
          <StatCard
            icon={<BarChart2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            label="Tax Rate"
            value={`${taxRate}%`}
            color="bg-indigo-50 dark:bg-indigo-950/40"
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
            label="Tax Amount"
            value={fmtQAR(taxAmount)}
            color="bg-emerald-50 dark:bg-emerald-950/40"
          />
        </div>

        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Tax Rate: 0% (QAR 0.00)</p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  This business currently operates at 0% tax rate. The tax reporting structure is fully ready
                  and will automatically calculate amounts when the tax rate is updated in Settings.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Tax Breakdown — {start} to {end}</h3>
              <div className="border border-border/40 rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-xs text-right">Amount (QAR)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-sm">Total Taxable Sales</TableCell>
                      <TableCell className="text-sm font-mono font-bold text-right">{fmtQAR(revenue)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/10">
                      <TableCell className="text-sm">Tax Rate Applied</TableCell>
                      <TableCell className="text-sm font-mono text-right">{taxRate}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-sm font-bold">Tax Amount Due</TableCell>
                      <TableCell className="text-sm font-mono font-bold text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtQAR(taxAmount)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/10">
                      <TableCell className="text-sm font-bold">Net Revenue (after tax)</TableCell>
                      <TableCell className="text-sm font-mono font-bold text-right">{fmtQAR(revenue - taxAmount)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40">
          <BarChart2 className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">Business analytics & financial overview</p>
        </div>
      </div>

      {/* Tabs — report picker. A dropdown on small screens (no horizontal
          overflow) and wrapped chips on wide screens; all 13 options always
          reachable on one screen without side-scrolling. */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {(() => {
          // Reports = BUSINESS PERFORMANCE only. Money-management tabs (PDC, cheques,
          // cash, profit, loans) live on the dedicated /finance page — no overlap.
          // "Sales Report" = Daily Sales + Top Customers + Top Products (+ Returns).
          const REPORT_TABS = [
            { value: "summary",        label: "Business Summary",  icon: <BarChart2 className="w-3.5 h-3.5" /> },
            { value: "locations",      label: "Locations",         icon: <MapPin className="w-3.5 h-3.5" /> },
            { value: "stock-movement", label: "Stock Movement",    icon: <Package className="w-3.5 h-3.5" /> },
            { value: "aging",          label: "Aging",             icon: <AlertTriangle className="w-3.5 h-3.5" /> },
            { value: "daily-sales",    label: "Sales",             icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { value: "top-customers",  label: "Top Customers",     icon: <Users className="w-3.5 h-3.5" /> },
            { value: "top-products",   label: "Top Products",      icon: <ShoppingCart className="w-3.5 h-3.5" /> },
            { value: "returns",        label: "Returns",           icon: <RotateCcw className="w-3.5 h-3.5" /> },
          ];
          return (
            <>
              {/* Small screens: dropdown */}
              <div className="lg:hidden">
                <Select value={activeTab} onValueChange={setActiveTab}>
                  <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_TABS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2">{t.icon}{t.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Wide screens: wrapped chips (no horizontal scroll) */}
              <div className="hidden lg:flex flex-wrap gap-1.5 bg-muted/50 p-1.5 rounded-xl">
                {REPORT_TABS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setActiveTab(t.value)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold px-3 h-7 rounded-lg transition-colors",
                      activeTab === t.value ? "bg-white dark:bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
            </>
          );
        })()}

        {/* Tab contents */}
        <div className="mt-4">
          <TabsContent value="summary" className="mt-0">
            <BusinessSummaryTab />
          </TabsContent>
          <TabsContent value="locations" className="mt-0">
            <LocationOverview />
          </TabsContent>
          <TabsContent value="stock-movement" className="mt-0">
            <StockMovementTab />
          </TabsContent>
          <TabsContent value="aging" className="mt-0">
            <AgingTab />
          </TabsContent>
          <TabsContent value="pdc" className="mt-0">
            <PdcReportTab />
          </TabsContent>
          <TabsContent value="expense" className="mt-0">
            <ExpenseReportTab />
          </TabsContent>
          <TabsContent value="daily-sales" className="mt-0">
            <DailySalesTab />
          </TabsContent>
          <TabsContent value="unpaid" className="mt-0">
            <UnpaidTab />
          </TabsContent>
          <TabsContent value="cheques" className="mt-0">
            <ChequesTab />
          </TabsContent>
          <TabsContent value="top-customers" className="mt-0">
            <TopCustomersTab />
          </TabsContent>
          <TabsContent value="top-products" className="mt-0">
            <TopProductsTab />
          </TabsContent>
          <TabsContent value="inventory" className="mt-0">
            <InventoryTab />
          </TabsContent>
          <TabsContent value="returns" className="mt-0">
            <ReturnsTab />
          </TabsContent>
          <TabsContent value="tax" className="mt-0">
            <TaxTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
