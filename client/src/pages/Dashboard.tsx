import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Lock,
  CreditCard,
  CheckCircle2,
  FileText,
  Package,
  BarChart2,
  MessageCircle,
  ChevronRight,
  Star,
  LayoutGrid,
  CircleDollarSign,
  Files,
  Truck,
  Wallet,
  Landmark,
  Gauge,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, isToday, addDays, isBefore } from "date-fns";
import DriverDashboard from "@/pages/dashboards/DriverDashboard";
import WarehouseDashboard from "@/pages/dashboards/WarehouseDashboard";
import SalesmanDashboard from "@/pages/dashboards/SalesmanDashboard";
import HelperDashboard from "@/pages/dashboards/HelperDashboard";
import TasksPanel from "@/components/TasksPanel";
import AdminExtras from "@/pages/dashboards/AdminExtras";
import LocationOverview from "@/pages/reports/LocationOverview";
import { PerformanceHub, type PerformanceHubData } from "@/pages/dashboards/PerformanceHub";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
type Document = {
  id: number;
  type: "INV" | "QT" | "DN" | "CN";
  number: string;
  date: string;
  customerId: number | null;
  customerName: string | null;
  status: string;
  total: number | string;
  createdAt: string;
};

type Payment = {
  id: number;
  documentId: number;
  customerId: number | null;
  amount: number | string;
  method: "Cash" | "Bank Transfer" | "Cheque" | "Credit Card";
  date: string;
  reference: string | null;
  isRefund: boolean | null;
};

type Cheque = {
  id: number;
  customerId: number | null;
  paymentId: number | null;
  chequeNumber: string;
  bankName: string;
  amount: number | string;
  chequeDate: string;
  status: "pending" | "cleared" | "cancelled" | "overdue" | "deposited" | "bounced";
  clearedDate: string | null;
  customerName?: string | null;
  type?: "receivable" | "payable";
};

// The low-stock API returns a nested row: { qty, product:{...}, store:{...} }.
type LowStockItem = {
  productId: number;
  storeId: number;
  qty: number | string;
  product?: {
    name?: string; minStockQty?: number | string;
    locationArea?: string | null; locationRack?: string | null; locationShelf?: string | null;
  };
  store?: { nameEn?: string };
};

type DailySalesData = {
  totalSales?: number;
  totalProfit?: number;
  invoiceCount?: number;
  payments?: Payment[];
  documents?: Document[];
  bestCustomer?: { name: string; total: number } | null;
  bestProduct?: { name: string; qty: number } | null;
};

type PaymentReminder = {
  id: number;
  number: string;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  remaining: number;
  daysOverdue: number;
};

type DashboardSummary = {
  cashSalesToday: number;
  creditSalesToday: number;
  chequesUncleared: { count: number; amount: number };
  profitFromCash: number;
  profitFromUnrealizedCredit: number;
  newInvoicesToday: number;
  returnsToday: number;
  totalOutstanding: number;
  paymentReminders: PaymentReminder[];
};

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function toNum(v: number | string | undefined | null): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

function fmt(v: number | string | undefined | null): string {
  return "QAR " + toNum(v).toFixed(2);
}

function docTypeColor(type: string) {
  switch (type) {
    case "INV": return "bg-blue-100 text-blue-700";
    case "QT":  return "bg-purple-100 text-purple-700";
    case "DN":  return "bg-green-100 text-green-700";
    case "CN":  return "bg-orange-100 text-orange-700";
    default:    return "bg-gray-100 text-gray-700";
  }
}

function statusColor(status: string) {
  switch (status) {
    case "paid":           return "bg-green-100 text-green-700";
    case "unpaid":         return "bg-red-100 text-red-700";
    case "partial":        return "bg-yellow-100 text-yellow-700";
    case "void":           return "bg-gray-100 text-gray-500";
    case "draft":          return "bg-gray-100 text-gray-500";
    case "converted":      return "bg-blue-100 text-blue-700";
    case "returned":       return "bg-orange-100 text-orange-700";
    case "partial_return": return "bg-orange-100 text-orange-700";
    default:               return "bg-gray-100 text-gray-500";
  }
}

/* ─────────────────────────────────────────
   Sub-components
───────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  href,
  locked,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  href?: string;
  locked?: boolean;
  danger?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "stat-card group flex items-start gap-4",
        danger && "!border-red-200 !bg-red-50/50 before:!bg-gradient-to-b before:!from-red-500 before:!to-red-300",
        href && "cursor-pointer"
      )}
    >
      <div className={cn("p-2.5 rounded-lg shrink-0 transition-transform group-hover:scale-105", danger ? "bg-red-100" : color)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          {label}
        </p>
        {locked ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="w-4 h-4" />
            <span className="text-sm font-medium">Admin only</span>
          </div>
        ) : (
          <>
            <p className={cn("text-xl font-bold font-mono truncate", danger ? "text-red-600" : "text-foreground")}>{value}</p>
            {sub && <p className={cn("text-[11px] mt-0.5", danger ? "text-red-600 font-semibold" : "text-muted-foreground")}>{sub}</p>}
          </>
        )}
      </div>
      {href && !locked && (
        <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
      )}
    </div>
  );

  if (href && !locked) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function StatSkeleton() {
  return (
    <div className="stat-card flex items-start gap-4">
      <Skeleton className="w-10 h-10 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-32" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Main Dashboard
───────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  // Manager shares the ADMIN dashboard view — same overview, all locations.
  // The difference is authority on ACTION pages/endpoints (admin can change critical
  // system settings; manager cannot), not what the dashboard shows. So `isAdmin`
  // here gates the full-overview VIEW and includes manager.
  // The CEO is a viewer: same full dashboard, never store-locked, but every write
  // is refused server-side by readOnlyGate.
  const isAdmin = user?.role === "admin" || user?.role === "manager" || user?.role === "ceo";

  // Role dashboards (Module 8) — each role gets its own location-filtered view.
  if (user?.role === "driver") return <DriverDashboard />;
  if (user?.role === "worker") return <SalesmanDashboard />;
  if (user?.role === "salesman") return <SalesmanDashboard />;

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const in7Days = addDays(today, 7);
  const in3Days = addDays(today, 3);

  // Location filter (spec 8). Admin (or a head-manager with no store) = "all";
  // a store-assigned MANAGER is locked to their own store (per-store manager).
  const scopedStoreId = user?.role === "manager" && user?.storeId ? user.storeId : null;
  const [locFilter, setLocFilter] = useState<string>(scopedStoreId ? String(scopedStoreId) : "all");

  // Dashboard view mode — an in-place UI swap on THIS page (no separate route).
  // Persisted per browser so the choice sticks across reloads. "/" always resolves.
  const [dashboardMode, setDashboardMode] = useState<"classic" | "hub">(
    () => (typeof window !== "undefined" && window.localStorage.getItem("dashboard-mode") === "hub" ? "hub" : "classic")
  );
  const setMode = (m: "classic" | "hub") => {
    setDashboardMode(m);
    if (typeof window !== "undefined") window.localStorage.setItem("dashboard-mode", m);
  };
  const { data: allStores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
    staleTime: 60_000,
  });
  const locationOptions = scopedStoreId
    ? allStores.filter((s: any) => s.active !== false && (s.id === scopedStoreId || s.ownerStoreId === scopedStoreId))
    : allStores.filter((s: any) => s.active !== false);
  const locParam = locFilter !== "all" ? `&storeId=${locFilter}` : "";
  const locParamFirst = locFilter !== "all" ? `?storeId=${locFilter}` : "";

  /* ── Data fetches ─────────────────────────────────────── */
  const { data: dailySales, isLoading: salesLoading } = useQuery<DailySalesData>({
    queryKey: ["/api/reports/daily-sales", todayStr, locFilter],
    queryFn: () =>
      fetch(`/api/reports/daily-sales?start=${todayStr}&end=${todayStr}${locParam}`).then((r) => r.json()),
  });

  // Month revenue (this month to date) + last month (for the vs-% comparison).
  const monthStart = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
  const lmStart = format(new Date(today.getFullYear(), today.getMonth() - 1, 1), "yyyy-MM-dd");
  const lmEnd = format(new Date(today.getFullYear(), today.getMonth(), 0), "yyyy-MM-dd");
  const { data: monthSales } = useQuery<any>({
    queryKey: ["month-rev", monthStart, todayStr, locFilter],
    queryFn: () => fetch(`/api/reports/daily-sales?start=${monthStart}&end=${todayStr}${locParam}`).then((r) => r.json()),
    enabled: isAdmin,
  });
  const { data: lastMonthSales } = useQuery<any>({
    queryKey: ["lastmonth-rev", lmStart, lmEnd, locFilter],
    queryFn: () => fetch(`/api/reports/daily-sales?start=${lmStart}&end=${lmEnd}${locParam}`).then((r) => r.json()),
    enabled: isAdmin,
  });
  const monthRevenue = toNum(monthSales?.totalRevenue);
  const lastMonthRevenue = toNum(lastMonthSales?.totalRevenue);
  const revPct = lastMonthRevenue > 0 ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : null;

  const { data: allDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()),
  });

  const { data: cheques } = useQuery<Cheque[]>({
    queryKey: ["/api/cheques"],
    queryFn: () => fetch("/api/cheques").then((r) => r.json()),
  });

  const { data: lowStockItems } = useQuery<LowStockItem[]>({
    queryKey: ["/api/inventory/low-stock"],
    queryFn: () => fetch("/api/inventory/low-stock").then((r) => r.json()),
  });

  // Real-time dashboard metrics (Drizzle-computed), location-scoped when filtered
  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary", locFilter],
    queryFn: () => fetch(`/api/dashboard/summary${locParamFirst}`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  // Team tasks → Performance Hub kanban (Done / In Progress / Review)
  const { data: tasksData = [] } = useQuery<any[]>({
    queryKey: ["/api/tasks"],
    queryFn: () => fetch("/api/tasks", { credentials: "include" }).then((r) => r.json()).catch(() => []),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  // Location overview (7-day) → Performance Hub location panel
  const loStart = format(addDays(today, -6), "yyyy-MM-dd");
  const { data: locOverview } = useQuery<any>({
    queryKey: ["/api/reports/location-overview", loStart, todayStr],
    queryFn: () => fetch(`/api/reports/location-overview?start=${loStart}&end=${todayStr}`).then((r) => r.json()),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  // Pending approvals count (alerts row) — returns + override requests.
  const { data: allReturns = [] } = useQuery<any[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetch("/api/returns").then((r) => r.json()).catch(() => []),
    refetchInterval: 60_000,
    enabled: isAdmin,
  });
  const { data: allApprovalRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/approvals"],
    queryFn: () => fetch("/api/approvals").then((r) => r.json()).catch(() => []),
    refetchInterval: 60_000,
    enabled: isAdmin,
  });
  const pendingApprovalsCount =
    (Array.isArray(allReturns) ? allReturns.filter((r: any) => r.status === "pending").length : 0) +
    (Array.isArray(allApprovalRequests) ? allApprovalRequests.filter((r: any) => r.status === "pending").length : 0);

  // Real-time cash position (Phase 4 — cashflow ledger)
  const { data: cashPos } = useQuery<any>({
    queryKey: ["/api/cashflow/position"],
    queryFn: () => fetch("/api/cashflow/position").then((r) => r.json()),
    refetchInterval: 60_000,
    enabled: user?.role === "admin" || user?.role === "manager",
  });

  // Owner loans / cash injections outstanding
  const { data: ownerLoans } = useQuery<any>({
    queryKey: ["/api/owner-loans"],
    queryFn: () => fetch("/api/owner-loans").then((r) => r.json()),
    refetchInterval: 60_000,
    enabled: isAdmin,
  });

  // When a specific store is selected, narrow cash position to that store only.
  const filteredCashTotal = locFilter !== "all" && cashPos?.perStore
    ? (cashPos.perStore as any[]).filter((s: any) => s.storeId === Number(locFilter)).reduce((sum: number, s: any) => sum + toNum(s.net), 0)
    : toNum(cashPos?.total);

  /* ── Derived values ───────────────────────────────────── */

  // Cheques due within 3 days (status=pending and chequeDate <= today+3days)
  const chequesArray = Array.isArray(cheques) ? cheques : [];
  const dueSoonCheques = chequesArray.filter((c) => {
    if (c.status !== "pending") return false;
    const d = new Date(c.chequeDate);
    return !isBefore(in3Days, d); // chequeDate <= in3Days
  });

  // Cheques due within 7 days (for section 7)
  const dueThisWeekCheques = chequesArray.filter((c) => {
    if (c.status !== "pending" && c.status !== "overdue") return false;
    const d = new Date(c.chequeDate);
    return !isBefore(in7Days, d);
  });

  // Low stock — flatten the nested API row so name / qty / min / location are usable.
  const lowStockArr = (Array.isArray(lowStockItems) ? lowStockItems : [])
    .filter((i: any) => locFilter === "all" || i.storeId === Number(locFilter))
    .map((i: any) => ({
      productId: i.productId,
      storeId: i.storeId,
      name: i.product?.name ?? `Product #${i.productId}`,
      qty: toNum(i.qty),
      minStockQty: toNum(i.product?.minStockQty),
      location: [i.store?.nameEn, i.product?.locationArea, i.product?.locationRack, i.product?.locationShelf].filter(Boolean).join(" → ") || null,
      unit: i.product?.unit ?? "",
    }));
  const lowStockCount = lowStockArr.length;

  // ── Real metrics from the Drizzle dashboard summary (safe fallbacks) ──
  const cashToday = toNum(summary?.cashSalesToday);
  const creditSalesToday = toNum(summary?.creditSalesToday);
  const chequesUncleared = summary?.chequesUncleared ?? { count: 0, amount: 0 };
  const profitFromCash = toNum(summary?.profitFromCash);
  const profitFromCredit = toNum(summary?.profitFromUnrealizedCredit);
  const newInvoicesToday = toNum(summary?.newInvoicesToday);
  const totalOutstanding = toNum(summary?.totalOutstanding);
  const paymentReminders = Array.isArray(summary?.paymentReminders) ? summary!.paymentReminders : [];

  // Recent 5 documents (any type)
  const docsArray = Array.isArray(allDocuments) ? allDocuments : [];
  const recentDocs = [...docsArray]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Best customer & best product today
  const bestCustomer = dailySales?.bestCustomer ?? null;
  const bestProduct = dailySales?.bestProduct ?? null;

  /* ── Cheque due-date helper ───────────────────────────── */
  function daysUntilDue(chequeDate: string): number {
    const d = new Date(chequeDate);
    d.setHours(0, 0, 0, 0);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - t.getTime()) / 86400000);
  }

  function dueBadgeClass(days: number): string {
    if (days < 0)  return "bg-red-100 text-red-700 border-red-200";
    if (days <= 2) return "bg-orange-100 text-orange-700 border-orange-200";
    return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }

  /* ── Performance Hub adapter — map existing real data → the Hub contract.
     No backend change: every value comes from queries already loaded above.
     Series the base data can't provide (per-metric sparklines, aging-over-time)
     are omitted → the Hub renders its graceful placeholder for those. ── */
  const revenueToday = cashToday + creditSalesToday;
  const targetPct = revenueToday > 0 ? Math.round((profitFromCash / revenueToday) * 100) : 0; // profit-margin proxy (no daily-target field yet)
  const agingDebtsTotal = paymentReminders
    .filter((r: any) => toNum(r.maxDaysOverdue) > 0)
    .reduce((s: number, r: any) => s + toNum(r.outstanding), 0);

  const taskArr = Array.isArray(tasksData) ? tasksData : [];
  const mapTask = (t: any) => ({
    title: t.title,
    date: t.dueDate || t.completedAt || t.createdAt || "",
    assignee: t.assignedToName || undefined,
  });

  const locRows: any[] = (locOverview?.locations ?? []).filter((l: any) => l.storeId !== null);
  const locDaily: any[] = locOverview?.daily ?? [];

  const perfData: PerformanceHubData = {
    performance_hub: {
      revenue_today: revenueToday,
      profit_today: profitFromCash,
      cash_position: filteredCashTotal,
      credit_exposure: totalOutstanding,
      target_percentage: targetPct,
      captions: {
        revenue: locFilter === "all" ? "all locations" : (allStores.find((s: any) => String(s.id) === locFilter)?.nameEn ?? "selected store"),
        profit: `real · w/ credit ${fmt(profitFromCash + profitFromCredit)}`,
        cash: `hand ${fmt(toNum(cashPos?.cashInHand))} · bank ${fmt(toNum(cashPos?.bank))}`,
        credit: `${paymentReminders.length} unpaid invoices`,
      },
    },
    urgent_actions: {
      low_stock_count: lowStockCount,
      aging_debts_total: agingDebtsTotal,
      low_stock_caption: "at / below minimum stock",
      aging_caption: "on-account, not yet collected",
    },
    payment_reminders: paymentReminders.slice(0, 8).map((r: any) => ({
      customer_name: r.customerName ?? `Customer #${r.customerId ?? "—"}`,
      customer_id: r.customerId ?? undefined,
      invoices: toNum(r.invoiceCount),
      outstanding: toNum(r.outstanding),
      status_days: toNum(r.maxDaysOverdue) > 0 ? `${toNum(r.maxDaysOverdue)} overdue` : "due",
      status_severity: toNum(r.maxDaysOverdue) > 30 ? "high" : toNum(r.maxDaysOverdue) > 0 ? "medium" : "low",
      phone: r.customerPhone ?? undefined,
      message: r.message ?? undefined,
    })),
    inventory_alerts: lowStockArr.slice(0, 8).map((it) => ({
      sku_name: it.name,
      product_id: it.productId,
      current_stock: it.qty,
      min_stock: it.minStockQty,
    })),
    location_overview: locRows.length
      ? {
          range_label: "7 days",
          totals: {
            revenue: toNum(locOverview?.totals?.revenue),
            gross: locOverview?.totals?.cogs != null
              ? toNum(locOverview?.totals?.revenue) - toNum(locOverview?.totals?.cogs)
              : toNum(locOverview?.totals?.cashCollected),
            profit: toNum(locOverview?.totals?.profit),
          },
          stores: locRows.map((l: any) => ({
            name: l.storeName,
            revenue: toNum(l.revenue),
            cash: toNum(l.cashCollected),
            profit: toNum(l.profit),
          })),
          top_customers: (locOverview?.topCustomers ?? []).map((c: any) => ({
            name: c.name,
            revenue: toNum(c.revenue),
          })),
          trend: locDaily.map((d: any) => ({
            label: String(d.date ?? "").slice(5),
            revenue: Object.entries(d)
              .filter(([k]) => k !== "date")
              .reduce((s: number, [, v]) => s + toNum(v as any), 0),
          })),
        }
      : undefined,
    insights: {
      best_customer: { name: bestCustomer?.name ?? "—", spend: toNum(bestCustomer?.total), history_count: 0, subtitle: "today's top customer" },
      best_product: { name: bestProduct?.name ?? "—", units_sold: toNum(bestProduct?.qty) },
    },
    tasks: {
      done: taskArr.filter((t: any) => t.status === "done").map(mapTask),
      in_progress: taskArr.filter((t: any) => t.status === "in_progress" || t.status === "open").map(mapTask),
      review: taskArr.filter((t: any) => t.status === "pending_verification").map(mapTask),
    },
  };

  // Segmented Classic ↔ Hub switch — shown in the Classic header and carried into
  // the Hub's own header via `toolbarExtra` so you can always flip back.
  const modeSwitch = (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
      <button
        onClick={() => setMode("classic")}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
          dashboardMode === "classic" ? "bg-[#1e2a3a] text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        )}
      >
        <BarChart2 className="h-3.5 w-3.5" /> Classic
      </button>
      <button
        onClick={() => setMode("hub")}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
          dashboardMode === "hub" ? "bg-[#1e2a3a] text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        )}
      >
        <Gauge className="h-3.5 w-3.5" /> Performance Hub
      </button>
    </div>
  );

  // Store selector + user badge for the Hub header. Theme-adaptive (they render
  // inside the Hub's dark wrapper). The store filter reuses the SAME locFilter
  // that already re-scopes revenue / profit / cash / reminders / inventory.
  const hubToolbar = (
    <>
      <select
        value={locFilter}
        onChange={(e) => setLocFilter(e.target.value)}
        title="Filter dashboard by location"
        className="cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
      >
        {!scopedStoreId && <option value="all">🌍 All locations</option>}
        {locationOptions.map((s: any) => (
          <option key={s.id} value={String(s.id)}>{s.nameEn}</option>
        ))}
      </select>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        {user?.name} · <span className="capitalize">{user?.role}</span>
      </span>
      {modeSwitch}
    </>
  );

  // Performance Hub view — full-screen, theme-aware. Store selector + mode switch ride in its header.
  if (isAdmin && dashboardMode === "hub") {
    return (
      <PerformanceHub
        data={perfData}
        toolbarExtra={hubToolbar}
        dateLabel={format(today, "EEEE, d MMMM yyyy")}
      />
    );
  }

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* ══ Header ══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {format(today, "EEEE, d MMMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && modeSwitch}
          <select
            value={locFilter}
            onChange={(e) => setLocFilter(e.target.value)}
            className="text-xs font-medium bg-white border border-border/50 px-3 py-1.5 rounded-lg cursor-pointer outline-none hover:border-amber-300 transition-colors"
            style={{ boxShadow: "var(--shadow-xs)" }}
            title="Filter dashboard by location"
          >
            {!scopedStoreId && <option value="all">All locations</option>}
            {locationOptions.map((s: any) => (
              <option key={s.id} value={String(s.id)}>{s.nameEn}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ══ 1. ALERTS BAR ══ */}
      {(dueSoonCheques.length > 0 || lowStockCount > 0 || pendingApprovalsCount > 0) && (
        <div className="flex flex-col gap-2 stagger-children">
          {pendingApprovalsCount > 0 && (
            <Link href="/approvals">
              <div className="alert-banner flex items-center gap-3 bg-gradient-to-r from-amber-50 to-amber-50/30 border border-amber-200/60 text-amber-800 rounded-xl px-4 py-3 cursor-pointer hover:from-amber-100 hover:to-amber-50/50 transition-all">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-[13px] font-semibold">
                  {pendingApprovalsCount} item{pendingApprovalsCount === 1 ? "" : "s"} waiting for approval
                </span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-amber-400" />
              </div>
            </Link>
          )}
          {dueSoonCheques.length > 0 && (
            <Link href="/finance?tab=cheques">
              <div className="alert-banner flex items-center gap-3 bg-gradient-to-r from-orange-50 to-orange-50/30 border border-orange-200/60 text-orange-800 rounded-xl px-4 py-3 cursor-pointer hover:from-orange-100 hover:to-orange-50/50 transition-all">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                </div>
                <span className="text-[13px] font-semibold">
                  {dueSoonCheques.length} {dueSoonCheques.length === 1 ? "cheque" : "cheques"} due within 3 days
                </span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-orange-400" />
              </div>
            </Link>
          )}
          {lowStockCount > 0 && (
            <Link href="/inventory?filter=low-stock">
              <div className="alert-banner flex items-center gap-3 bg-gradient-to-r from-red-50 to-red-50/30 border border-red-200/60 text-red-800 rounded-xl px-4 py-3 cursor-pointer hover:from-red-100 hover:to-red-50/50 transition-all">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-red-600" />
                </div>
                <span className="text-[13px] font-semibold">
                  {lowStockCount} {lowStockCount === 1 ? "product" : "products"} low on stock
                </span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-red-400" />
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ══ 1b. CEO HERO ROW ══ */}
      {isAdmin && !summaryLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
          <Link href="/documents?type=INV&date=today" className="hero-card bg-gradient-to-br from-[#1a2640] via-[#0c1322] to-[#162038] text-white">
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-amber-400/[0.06] blur-2xl" />
            <p className="text-[10px] uppercase tracking-widest text-amber-300/60 font-bold">Today's Revenue</p>
            <p className="font-mono font-extrabold text-[28px] mt-2 tracking-tight leading-none">{fmt(cashToday + creditSalesToday)}</p>
            <p className="text-[11px] text-white/35 mt-2">{locFilter === "all" ? "all locations" : allStores.find((s: any) => String(s.id) === locFilter)?.nameEn}</p>
          </Link>
          <Link href="/finance?tab=profit&period=today" className="hero-card bg-gradient-to-br from-emerald-50 via-green-50/50 to-white border border-emerald-200/60 dark:from-emerald-950/30 dark:via-emerald-900/10 dark:to-slate-900 dark:border-emerald-800/30">
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-emerald-400/10 blur-2xl" />
            <p className="text-[10px] uppercase tracking-widest text-emerald-600/60 dark:text-emerald-400/60 font-bold">Profit Today</p>
            <p className="font-mono font-extrabold text-[28px] mt-2 text-emerald-700 dark:text-emerald-400 tracking-tight leading-none">
              {fmt(profitFromCash)} <span className="text-slate-400 dark:text-slate-500 text-lg font-semibold">({fmt(profitFromCash + profitFromCredit)})</span>
            </p>
            <p className="text-[11px] text-emerald-600/50 dark:text-emerald-500/50 mt-2">real (collected) · (expected incl. credit)</p>
          </Link>
          <Link href="/finance?tab=cash-position" className={cn("hero-card border",
            filteredCashTotal < 0
              ? "bg-gradient-to-br from-red-50 to-white border-red-200/60 dark:from-red-950/30 dark:to-slate-900 dark:border-red-800/30"
              : "bg-gradient-to-br from-blue-50 via-sky-50/50 to-white border-blue-200/40 dark:from-blue-950/30 dark:via-blue-900/10 dark:to-slate-900 dark:border-blue-800/30")}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-blue-400/[0.07] blur-2xl" />
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-bold">Cash Position</p>
            <p className={cn("font-mono font-extrabold text-[28px] mt-2 tracking-tight leading-none", filteredCashTotal < 0 ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-200")}>{fmt(filteredCashTotal)}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-2">{filteredCashTotal < 0 ? "overdrawn" : locFilter !== "all" ? allStores.find((s: any) => String(s.id) === locFilter)?.nameEn || "selected store" : `hand ${fmt(toNum(cashPos?.cashInHand))} · bank ${fmt(toNum(cashPos?.bank))}`}</p>
          </Link>
          <Link href="/customers?filter=credit-outstanding" className={cn("hero-card border",
            totalOutstanding > 0
              ? "bg-gradient-to-br from-orange-50 via-amber-50/50 to-white border-orange-200/60 dark:from-orange-950/30 dark:via-amber-900/10 dark:to-slate-900 dark:border-orange-800/30"
              : "bg-gradient-to-br from-slate-50 to-white border-border/40 dark:from-slate-800/30 dark:to-slate-900 dark:border-slate-700/30")}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-orange-400/[0.07] blur-2xl" />
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-bold">Credit Exposure</p>
            <p className={cn("font-mono font-extrabold text-[28px] mt-2 tracking-tight leading-none", totalOutstanding > 0 ? "text-orange-600 dark:text-orange-400" : "text-slate-600 dark:text-slate-300")}>{fmt(totalOutstanding)}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-2">{paymentReminders.length} unpaid invoices</p>
          </Link>
        </div>
      )}

      {/* ══ 1c. RECEIVABLES AGING BAR (spec P6 row 4) ══════ */}
      {isAdmin && paymentReminders.length > 0 && (() => {
        const buckets = [
          { key: "current", label: "Current", color: "bg-emerald-500", test: (d: number) => d <= 0 },
          { key: "1-30", label: "1–30d", color: "bg-yellow-400", test: (d: number) => d >= 1 && d <= 30 },
          { key: "31-60", label: "31–60d", color: "bg-amber-500", test: (d: number) => d >= 31 && d <= 60 },
          { key: "61-90", label: "61–90d", color: "bg-orange-500", test: (d: number) => d >= 61 && d <= 90 },
          { key: "90+", label: "90+d", color: "bg-red-600", test: (d: number) => d > 90 },
        ].map((b) => {
          const items = paymentReminders.filter((r) => b.test(r.daysOverdue));
          return { ...b, count: items.length, total: items.reduce((s, r) => s + toNum(r.remaining), 0) };
        });
        const grand = buckets.reduce((s, b) => s + b.total, 0) || 1;
        return (
          <section>
            <h2 className="section-heading">Receivables Aging</h2>
            <Link href="/customers?filter=credit-outstanding">
              <div className="section-card hover:shadow-[var(--shadow-card-hover)] transition-all cursor-pointer">
                <div className="flex h-2.5 rounded-full overflow-hidden mb-4 bg-slate-100">
                  {buckets.map((b) => b.total > 0 && (
                    <div key={b.key} className={cn(b.color, "transition-all")} style={{ width: `${(b.total / grand) * 100}%` }} title={`${b.label}: ${fmt(b.total)}`} />
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {buckets.map((b) => (
                    <div key={b.key} className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className={cn("w-2 h-2 rounded-full", b.color)} />
                        <span className={cn("text-[11px] font-semibold", b.key === "90+" && b.count > 0 && "text-red-600")}>{b.label}</span>
                      </div>
                      <p className="font-mono font-bold text-sm mt-1">{fmt(b.total)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{b.count} {b.count === 1 ? "customer" : "customers"}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          </section>
        );
      })()}

      {/* ══ 2. TODAY SNAPSHOT ══ */}
      <section>
        <h2 className="section-heading">Today's Snapshot</h2>
        {summaryLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Credit Sales Today — cash portion is already covered by the hero
                "Today's Total Sales" (= cash + credit) and "Real Profit" (cash
                collected); a separate Cash Sales card duplicated those numbers. */}
            {/* This Month Revenue — all invoiced this month + vs last month (Fix 9). */}
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
              label="This Month Revenue"
              value={fmt(monthRevenue)}
              sub={revPct == null ? "all invoiced this month" : `vs last month ${revPct >= 0 ? "+" : ""}${revPct.toFixed(0)}%`}
              color="bg-indigo-50"
              href="/reports?tab=daily-sales"
            />

            <StatCard
              icon={<CreditCard className="w-5 h-5 text-orange-600" />}
              label="Credit Sales Today"
              value={fmt(creditSalesToday)}
              sub="on-account, not yet collected"
              color="bg-orange-50"
              href="/documents?type=INV&date=today&credit=1"
            />

            {/* Cheques consolidated into the single "PDC & Cheques" section below
                (removed the duplicate here — Bug 6). Profit + Cash Position live
                in the CEO hero row now. */}

            {/* New Invoices Today */}
            <StatCard
              icon={<FileText className="w-5 h-5 text-blue-600" />}
              label="New Invoices Today"
              value={newInvoicesToday}
              color="bg-blue-50"
              href="/documents?type=INV&date=today"
            />
          </div>
        )}
      </section>

      {/* ══ 2b. CUSTOMER PAYMENT REMINDERS ══ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-heading mb-0">Customer Payment Reminders</h2>
          <Link href="/messages" className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors">
            Open Messages
          </Link>
        </div>
        <div className="section-card !p-0 overflow-hidden">
          {paymentReminders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No overdue payments. All caught up.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-center px-4 py-3">Invoices</th>
                    <th className="text-right px-4 py-3">Outstanding</th>
                    <th className="text-center px-4 py-3 hidden sm:table-cell">Status</th>
                    <th className="text-right px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
              {paymentReminders.map((r: any) => {
                const overdue = r.maxDaysOverdue > 0;
                const waNum = (r.customerPhone || "").replace(/\D/g, "");
                const waMsg = encodeURIComponent(r.message || "");
                return (
                  <tr key={r.customerId || r.customerName}>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <p className="truncate max-w-[180px]">{r.customerName ?? `Customer #${r.customerId ?? "—"}`}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground text-xs font-semibold">{r.invoiceCount}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{fmt(r.outstanding)}</td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span
                        className={cn(
                          "status-pill",
                          r.maxDaysOverdue > 30 ? "bg-red-100 text-red-700 border-red-200"
                            : r.maxDaysOverdue > 0 ? "bg-orange-100 text-orange-700 border-orange-200"
                            : "bg-yellow-100 text-yellow-700 border-yellow-200"
                        )}
                      >
                        {overdue ? `${r.maxDaysOverdue}d overdue` : "due"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                    {waNum ? (
                      <a
                        href={`https://wa.me/${waNum}?text=${waMsg}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50 transition-colors"
                        title="Send account statement via WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Remind
                      </a>
                    ) : (
                      <Link href="/messages" className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:bg-secondary/70 transition-colors">
                        <MessageCircle className="w-3.5 h-3.5" /> Remind
                      </Link>
                    )}
                    </td>
                  </tr>
                );
              })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ══ 3 + 4. INVENTORY ALERTS & INSIGHTS ══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="section-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <LayoutGrid className="w-4 h-4 text-red-500" />
            </div>
            <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">Inventory Alerts</h2>
            <Link href="/inventory?filter=low-stock" className="ml-auto text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors">View all</Link>
          </div>
          {lowStockCount === 0 ? (
            <p className="text-sm text-emerald-600 font-medium">All products are well stocked.</p>
          ) : (
            <div>
              <p className="text-2xl font-bold font-mono text-red-600">{lowStockCount}</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {lowStockCount === 1 ? "product" : "products"} at or below minimum stock
              </p>
              <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                {lowStockArr.slice(0, 6).map((item) => (
                  <Link key={`${item.productId}-${item.storeId}`} href={`/inventory/${item.productId}`}
                    className="flex items-center justify-between rounded-lg hover:bg-slate-50 px-2.5 py-1.5 -mx-1 transition-colors group">
                    <div className="min-w-0">
                      <span className="text-xs text-foreground font-semibold truncate block max-w-[180px]">{item.name}</span>
                      {item.location && <p className="text-[10px] text-muted-foreground truncate">{item.location}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="stock-bar">
                        <div className="stock-bar-fill" style={{ width: `${Math.min(100, Math.max(5, (item.qty / Math.max(item.minStockQty, 1)) * 100))}%` }} />
                      </div>
                      <span className={cn("font-mono text-[11px] font-bold shrink-0", item.qty <= 0 ? "text-red-700" : "text-red-600")}>
                        {item.qty}/{item.minStockQty}
                      </span>
                    </div>
                  </Link>
                ))}
                {lowStockCount > 6 && (
                  <Link href="/inventory?filter=low-stock" className="block text-xs text-amber-600 mt-2 hover:text-amber-700 font-semibold transition-colors">
                    +{lowStockCount - 6} more...
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="section-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">
              Today's Insights
            </h2>
          </div>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-50/50 to-transparent">
              <p className="text-[10px] font-semibold text-emerald-600/60 uppercase tracking-widest mb-1.5">
                Best Customer
              </p>
              {salesLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : bestCustomer ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm">{bestCustomer.name}</span>
                  <span className="text-sm font-mono font-bold text-emerald-600">{fmt(bestCustomer.total)}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sales today yet</p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-gradient-to-r from-blue-50/50 to-transparent">
              <p className="text-[10px] font-semibold text-blue-600/60 uppercase tracking-widest mb-1.5">
                Best Product
              </p>
              {salesLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : bestProduct ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm">{bestProduct.name}</span>
                  <span className="text-sm font-mono font-bold text-blue-600">{bestProduct.qty} units</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sales today yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ 4a. LOCATION OVERVIEW (per store/warehouse workflow — graphical,
             day/week/month; full report lives in Reports → Locations) ══════ */}
      {isAdmin && (
        <div className="mt-4">
          <LocationOverview compact />
        </div>
      )}

      {/* ══ 4b. ADMIN EXTRAS (Module 8C: aging, PDC today,
             supplier dues, expenses, returns, delivery board) ═════════════ */}
      {isAdmin && <AdminExtras reminders={paymentReminders} storeFilter={locFilter === "all" ? null : Number(locFilter)} />}

      {/* Task board — assign to any staff, track status (managers + admin) */}
      {isAdmin && <TasksPanel />}

      {/* Quick Actions / Recent Documents / PDC & Cheques removed from the dashboard
          per owner request — each lives on its own page (Documents, PDC Tracker). */}
      {false && (<>
      <section>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "New Invoice",      href: "/documents/new/INV", icon: <FileText   className="w-6 h-6" />, color: "text-blue-600   bg-blue-50   hover:bg-blue-100"   },
            { label: "New Quotation",    href: "/documents/new/QT",  icon: <Files  className="w-6 h-6" />, color: "text-purple-600 bg-purple-50 hover:bg-purple-100" },
            { label: "Delivery Note",    href: "/documents/new/DN",  icon: <Truck      className="w-6 h-6" />, color: "text-green-600  bg-green-50  hover:bg-green-100"  },
            { label: "View Approvals",   href: "/approvals",         icon: <CheckCircle2 className="w-6 h-6" />, color: "text-amber-600 bg-amber-50 hover:bg-amber-100" },
            { label: "Run Report",       href: "/reports",           icon: <BarChart2  className="w-6 h-6" />, color: "text-indigo-600 bg-indigo-50 hover:bg-indigo-100" },
            { label: "Add Expense",      href: "/expenses",          icon: <CircleDollarSign className="w-6 h-6" />, color: "text-rose-600 bg-rose-50 hover:bg-rose-100" },
            { label: "Low Stock",        href: "/inventory?filter=low-stock", icon: <Package    className="w-6 h-6" />, color: "text-red-600    bg-red-50    hover:bg-red-100"    },
          ].map(({ label, href, icon, color }) => (
            <Link key={href} href={href}>
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border border-border/40 shadow-sm transition-all cursor-pointer select-none",
                  "hover:shadow-md hover:-translate-y-0.5 active:scale-95",
                  color
                )}
              >
                {icon}
                <span className="font-bold text-sm text-center leading-tight">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ══ 6. RECENT DOCUMENTS ════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            Recent Documents
          </h2>
          <Link href="/documents" className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="section-card !p-0 overflow-hidden">
          {recentDocs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No documents yet.
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {recentDocs.map((doc) => (
                <Link key={doc.id} href={`/documents/${doc.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors cursor-pointer">
                    {/* Type badge */}
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                        docTypeColor(doc.type)
                      )}
                    >
                      {doc.type}
                    </span>

                    {/* Number */}
                    <span className="font-mono font-bold text-sm text-foreground shrink-0">
                      {doc.number}
                    </span>

                    {/* Customer */}
                    <span className="text-sm text-muted-foreground truncate flex-1 min-w-0">
                      {doc.customerName ?? "—"}
                    </span>

                    {/* Date */}
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                      {doc.date ? format(new Date(doc.date), "dd MMM") : "—"}
                    </span>

                    {/* Total */}
                    <span className="font-mono font-bold text-sm shrink-0">
                      {fmt(doc.total)}
                    </span>

                    {/* Status */}
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full hidden sm:block",
                        statusColor(doc.status)
                      )}
                    >
                      {doc.status}
                    </span>

                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ══ 7. PDC & CHEQUES — one consolidated section (Bug 6) ══ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            PDC &amp; Cheques
          </h2>
          <Link href="/finance?tab=cheques" className="text-xs font-semibold text-primary hover:underline">
            Open Cheques
          </Link>
        </div>
        {/* Receivable / Payable / Due-today → PDC Tracker filtered (Fix 8). */}
        {(() => {
          const pend = (c: any) => ["pending", "deposited"].includes(c.status);
          const recv = chequesArray.filter((c) => (c.type || "receivable") === "receivable" && pend(c));
          const pay = chequesArray.filter((c) => c.type === "payable" && pend(c));
          const dueT = chequesArray.filter((c) => c.status === "pending" && c.chequeDate === todayStr);
          const sum = (a: any[]) => a.reduce((s, c) => s + toNum(c.amount), 0);
          return (
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Link href="/finance?tab=cheques&type=receivable" className="stat-card !p-3 hover:shadow-[var(--shadow-card-hover)] transition-all">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Receivable</p>
                <p className="text-lg font-bold font-mono text-green-700">{fmt(sum(recv))}</p>
                <p className="text-[11px] text-muted-foreground">{recv.length} pending</p>
              </Link>
              <Link href="/finance?tab=cheques&type=payable" className="stat-card !p-3 hover:shadow-[var(--shadow-card-hover)] transition-all">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Payable</p>
                <p className="text-lg font-bold font-mono text-red-600">{fmt(sum(pay))}</p>
                <p className="text-[11px] text-muted-foreground">{pay.length} pending</p>
              </Link>
              <Link href="/finance?tab=cheques&due=today" className="stat-card !p-3 hover:shadow-[var(--shadow-card-hover)] transition-all">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Due today</p>
                <p className="text-lg font-bold font-mono text-amber-600">{dueT.length}</p>
                <p className="text-[11px] text-muted-foreground">{fmt(sum(dueT))}</p>
              </Link>
            </div>
          );
        })()}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Due this week</p>
        <div className="section-card !p-0 overflow-hidden">
          {dueThisWeekCheques.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No cheques due this week.
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {dueThisWeekCheques.map((cheque) => {
                const days = daysUntilDue(cheque.chequeDate);
                return (
                  <div
                    key={cheque.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {/* Customer */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {cheque.customerName ?? `Customer #${cheque.customerId}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cheque.chequeNumber} &bull; {cheque.bankName}
                      </p>
                    </div>

                    {/* Amount */}
                    <span className="font-mono font-bold text-sm shrink-0">
                      {fmt(cheque.amount)}
                    </span>

                    {/* Due date */}
                    <div className="shrink-0 text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(cheque.chequeDate), "dd MMM yyyy")}
                      </p>
                    </div>

                    {/* Days badge */}
                    <span
                      className={cn(
                        "shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border",
                        dueBadgeClass(days)
                      )}
                    >
                      {days < 0
                        ? `${Math.abs(days)}d overdue`
                        : days === 0
                        ? "Today"
                        : `${days}d left`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      </>)}

      {/* bottom padding for mobile nav */}
      <div className="h-4" />
    </div>
  );
}
