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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, isToday, addDays, isBefore } from "date-fns";
import DriverDashboard from "@/pages/dashboards/DriverDashboard";
import WarehouseDashboard from "@/pages/dashboards/WarehouseDashboard";
import SalesmanDashboard from "@/pages/dashboards/SalesmanDashboard";
import AdminExtras from "@/pages/dashboards/AdminExtras";

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
        "bg-white rounded-2xl p-5 border shadow-sm flex items-start gap-4 transition-all",
        danger ? "border-red-300 ring-1 ring-red-200 bg-red-50/40" : "border-border/40",
        href && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
      )}
    >
      <div className={cn("p-3 rounded-xl shrink-0", danger ? "bg-red-100" : color)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
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
            {sub && <p className={cn("text-xs mt-0.5", danger ? "text-red-600 font-semibold" : "text-muted-foreground")}>{sub}</p>}
          </>
        )}
      </div>
      {href && !locked && (
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
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
    <div className="bg-white rounded-2xl p-5 border border-border/40 shadow-sm flex items-start gap-4">
      <Skeleton className="w-12 h-12 rounded-xl" />
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
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  // Role dashboards (Module 8) — each role gets its own location-filtered view.
  if (user?.role === "driver") return <DriverDashboard />;
  if (user?.role === "warehouse") return <WarehouseDashboard />;
  if (user?.role === "salesman") return <SalesmanDashboard />;

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const in7Days = addDays(today, 7);
  const in3Days = addDays(today, 3);

  /* ── Data fetches ─────────────────────────────────────── */
  const { data: dailySales, isLoading: salesLoading } = useQuery<DailySalesData>({
    queryKey: ["/api/reports/daily-sales", todayStr],
    queryFn: () =>
      fetch(`/api/reports/daily-sales?start=${todayStr}&end=${todayStr}`).then((r) => r.json()),
  });

  // Month revenue (this month to date) + last month (for the vs-% comparison).
  const monthStart = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
  const lmStart = format(new Date(today.getFullYear(), today.getMonth() - 1, 1), "yyyy-MM-dd");
  const lmEnd = format(new Date(today.getFullYear(), today.getMonth(), 0), "yyyy-MM-dd");
  const { data: monthSales } = useQuery<any>({
    queryKey: ["month-rev", monthStart, todayStr],
    queryFn: () => fetch(`/api/reports/daily-sales?start=${monthStart}&end=${todayStr}`).then((r) => r.json()),
    enabled: isAdmin,
  });
  const { data: lastMonthSales } = useQuery<any>({
    queryKey: ["lastmonth-rev", lmStart, lmEnd],
    queryFn: () => fetch(`/api/reports/daily-sales?start=${lmStart}&end=${lmEnd}`).then((r) => r.json()),
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

  // Admin location filter (spec 8: dashboard filterable by location).
  // "all" = company-wide; otherwise a storeId scoping summary + low stock + deliveries.
  const [locFilter, setLocFilter] = useState<string>("all");
  const { data: allStores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
    staleTime: 60_000,
  });
  const locParam = locFilter !== "all" ? `?storeId=${locFilter}` : "";

  // Real-time dashboard metrics (Drizzle-computed), location-scoped when filtered
  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary", locFilter],
    queryFn: () => fetch(`/api/dashboard/summary${locParam}`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  // Pending approvals count (alerts row)
  const { data: allReturns = [] } = useQuery<any[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetch("/api/returns").then((r) => r.json()).catch(() => []),
    refetchInterval: 60_000,
    enabled: isAdmin,
  });
  const pendingApprovalsCount = Array.isArray(allReturns) ? allReturns.filter((r: any) => r.status === "pending").length : 0;

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

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ══ Header ══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(today, "EEEE, d MMMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Location filter — all locations or one store/warehouse (spec 8) */}
          <select
            value={locFilter}
            onChange={(e) => setLocFilter(e.target.value)}
            className="text-xs font-medium bg-white border border-border/40 px-3 py-1.5 rounded-full shadow-sm cursor-pointer outline-none"
            title="Filter dashboard by location"
          >
            <option value="all">🌍 All locations</option>
            {allStores.filter((s: any) => s.active !== false).map((s: any) => (
              <option key={s.id} value={String(s.id)}>{s.nameEn}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground font-medium bg-white border border-border/40 px-3 py-1.5 rounded-full shadow-sm">
            {user?.name} &mdash; <span className="capitalize">{user?.role}</span>
          </span>
        </div>
      </div>

      {/* ══ 1. ALERTS BAR ══════════════════════════════════ */}
      {(dueSoonCheques.length > 0 || lowStockCount > 0 || pendingApprovalsCount > 0) && (
        <div className="flex flex-col gap-2">
          {pendingApprovalsCount > 0 && (
            <Link href="/approvals">
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-100 transition-colors">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
                <span className="text-sm font-semibold">
                  {pendingApprovalsCount} return{pendingApprovalsCount === 1 ? "" : "s"} waiting for approval
                </span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </div>
            </Link>
          )}
          {dueSoonCheques.length > 0 && (
            <Link href="/finance?tab=cheques">
              <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl px-4 py-3 cursor-pointer hover:bg-orange-100 transition-colors">
                <AlertTriangle className="w-5 h-5 shrink-0 text-orange-500" />
                <span className="text-sm font-semibold">
                  {dueSoonCheques.length} {dueSoonCheques.length === 1 ? "cheque" : "cheques"} due within 3 days
                </span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </div>
            </Link>
          )}
          {lowStockCount > 0 && (
            <Link href="/inventory?filter=low-stock">
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 cursor-pointer hover:bg-red-100 transition-colors">
                <Package className="w-5 h-5 shrink-0 text-red-500" />
                <span className="text-sm font-semibold">
                  {lowStockCount} {lowStockCount === 1 ? "product" : "products"} low on stock
                </span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ══ 1b. CEO HERO ROW — the four numbers that matter first (spec P6) ══ */}
      {isAdmin && !summaryLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/documents?type=INV&date=today" className="rounded-2xl bg-[#1e2a3a] text-white p-4 hover:opacity-95">
            <p className="text-[11px] uppercase tracking-widest text-white/60">Today's Revenue</p>
            <p className="font-mono font-bold text-2xl mt-0.5">{fmt(cashToday + creditSalesToday)}</p>
            <p className="text-[11px] text-white/60">{locFilter === "all" ? "all locations" : allStores.find((s: any) => String(s.id) === locFilter)?.nameEn}</p>
          </Link>
          {/* ONE unified Profit card — Real (collected) big, Imaginary in brackets.
              Replaces the old separate Real + Imaginary widgets (dashboard clutter fix). */}
          <Link href="/finance?tab=profit&period=today" className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-4 hover:shadow-sm">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Profit Today</p>
            <p className="font-mono font-bold text-2xl mt-0.5 text-emerald-700">
              {fmt(profitFromCash)} <span className="text-slate-500 text-lg font-semibold">({fmt(profitFromCash + profitFromCredit)})</span>
            </p>
            <p className="text-[11px] text-muted-foreground">real (collected) · imaginary incl. credit</p>
          </Link>
          <Link href="/finance?tab=cash-position" className={cn("rounded-2xl p-4 hover:shadow-sm border-2",
            toNum(cashPos?.total) < 0 ? "border-red-300 bg-red-50/60" : "border-border")}>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Cash Position</p>
            <p className={cn("font-mono font-bold text-2xl mt-0.5", toNum(cashPos?.total) < 0 ? "text-red-600" : "text-emerald-700")}>{fmt(toNum(cashPos?.total))}</p>
            <p className="text-[11px] text-muted-foreground">{toNum(cashPos?.total) < 0 ? "⚠ overdrawn" : `hand ${fmt(toNum(cashPos?.cashInHand))} · bank ${fmt(toNum(cashPos?.bank))}`}</p>
          </Link>
          <Link href="/customers?filter=credit-outstanding" className={cn("rounded-2xl p-4 hover:shadow-sm border-2",
            totalOutstanding > 0 ? "border-red-200 bg-red-50/50" : "border-border")}>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Credit Exposure</p>
            <p className={cn("font-mono font-bold text-2xl mt-0.5", totalOutstanding > 0 ? "text-red-600" : "text-slate-600")}>{fmt(totalOutstanding)}</p>
            <p className="text-[11px] text-muted-foreground">{paymentReminders.length} unpaid invoices</p>
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
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">Receivables Aging</h2>
            <Link href="/credit-exposure">
              <div className="bg-white rounded-2xl border border-border/40 shadow-sm p-4 hover:shadow-md transition cursor-pointer">
                <div className="flex h-3 rounded-full overflow-hidden mb-3">
                  {buckets.map((b) => b.total > 0 && (
                    <div key={b.key} className={cn(b.color)} style={{ width: `${(b.total / grand) * 100}%` }} title={`${b.label}: ${fmt(b.total)}`} />
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {buckets.map((b) => (
                    <div key={b.key} className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={cn("w-2 h-2 rounded-full", b.color)} />
                        <span className={cn("text-[11px] font-semibold", b.key === "90+" && b.count > 0 && "text-red-600")}>{b.label}</span>
                      </div>
                      <p className="font-mono font-bold text-sm mt-0.5">{fmt(b.total)}</p>
                      <p className="text-[11px] text-muted-foreground">{b.count} {b.count === 1 ? "customer" : "customers"}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          </section>
        );
      })()}

      {/* ══ 2. TODAY SNAPSHOT ══════════════════════════════ */}
      <section>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">
          Today's Snapshot
        </h2>
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

      {/* ══ 2b. CUSTOMER PAYMENT REMINDERS ════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            Customer Payment Reminders
          </h2>
          <Link href="/messages" className="text-xs font-semibold text-primary hover:underline">
            Open Messages
          </Link>
        </div>
        <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
          {paymentReminders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No overdue payments. All caught up.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-semibold">Customer</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Invoice</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Outstanding</th>
                    <th className="text-center px-4 py-2.5 font-semibold hidden sm:table-cell">Status</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
              {paymentReminders.map((r) => {
                const overdue = r.daysOverdue > 0;
                const waNum = (r.customerPhone || "").replace(/\D/g, "");
                const waMsg = encodeURIComponent(
                  `Dear ${r.customerName || "Customer"}, this is a reminder that invoice ${r.number} has an outstanding balance of QAR ${toNum(r.remaining).toFixed(2)}${overdue ? ` (${r.daysOverdue} days overdue)` : ""}. Kindly arrange payment. Thank you — Mamun M Trading.`
                );
                return (
                  <tr key={r.id} className="hover:bg-secondary/10 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <p className="truncate max-w-[180px]">{r.customerName ?? `Customer #${r.customerId ?? "—"}`}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.number}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{fmt(r.remaining)}</td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span
                        className={cn(
                          "text-xs font-bold px-2.5 py-1 rounded-full border",
                          r.daysOverdue > 30 ? "bg-red-100 text-red-700 border-red-200"
                            : r.daysOverdue > 0 ? "bg-orange-100 text-orange-700 border-orange-200"
                            : "bg-yellow-100 text-yellow-700 border-yellow-200"
                        )}
                      >
                        {overdue ? `${r.daysOverdue}d overdue` : "due"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                    {waNum ? (
                      <a
                        href={`https://wa.me/${waNum}?text=${waMsg}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                        title="Send WhatsApp reminder"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Remind
                      </a>
                    ) : (
                      <Link href="/messages" className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:bg-secondary/70">
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

      {/* ══ 3 + 4. INVENTORY ALERTS & INSIGHTS ════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Inventory Alerts — each row shows real name / qty / min / location and
            links to that product's detail page. */}
        <div className="bg-white rounded-2xl border border-border/40 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <LayoutGrid className="w-5 h-5 text-red-500" />
            <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">Inventory Alerts</h2>
            <Link href="/inventory" className="ml-auto text-xs font-semibold text-primary hover:underline">View all</Link>
          </div>
          {lowStockCount === 0 ? (
            <p className="text-sm text-green-600 font-medium">All products are well stocked.</p>
          ) : (
            <div>
              <p className="text-2xl font-bold font-mono text-red-600">{lowStockCount}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {lowStockCount === 1 ? "product" : "products"} at or below minimum stock
              </p>
              <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                {lowStockArr.slice(0, 6).map((item) => (
                  <Link key={`${item.productId}-${item.storeId}`} href={`/inventory/${item.productId}`}
                    className="block rounded-lg hover:bg-secondary/30 px-2 py-1 -mx-1 transition-colors">
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="text-foreground font-semibold truncate max-w-[58%]">{item.name}</span>
                      <span className={cn("font-mono font-bold", item.qty <= 0 ? "text-red-700" : "text-red-600")}>
                        {item.qty} / {item.minStockQty} {item.unit || "min"}
                      </span>
                    </div>
                    {item.location && <p className="text-[10px] text-muted-foreground truncate">📍 {item.location}</p>}
                  </Link>
                ))}
                {lowStockCount > 6 && (
                  <Link href="/inventory" className="block text-xs text-muted-foreground mt-1 hover:underline">
                    +{lowStockCount - 6} more…
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="bg-white rounded-2xl border border-border/40 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <Star className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">
              Today's Insights
            </h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Best Customer
              </p>
              {salesLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : bestCustomer ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{bestCustomer.name}</span>
                  <span className="text-sm font-mono text-emerald-600">{fmt(bestCustomer.total)}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sales today yet</p>
              )}
            </div>
            <div className="border-t border-border/30 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Best Product
              </p>
              {salesLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : bestProduct ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{bestProduct.name}</span>
                  <span className="text-sm font-mono text-blue-600">{bestProduct.qty} units</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sales today yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ 4b. ADMIN EXTRAS (Module 8C: aging, PDC today, cash by location,
             supplier dues, expenses, returns, delivery board) ═════════════ */}
      {isAdmin && <AdminExtras reminders={paymentReminders} storeFilter={locFilter === "all" ? null : Number(locFilter)} />}

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
            { label: "Low Stock",        href: "/inventory",         icon: <Package    className="w-6 h-6" />, color: "text-red-600    bg-red-50    hover:bg-red-100"    },
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
        <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
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
              <Link href="/finance?tab=cheques&type=receivable" className="bg-white rounded-2xl border border-border/40 shadow-sm p-3 hover:shadow-md transition">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Receivable</p>
                <p className="text-lg font-bold font-mono text-green-700">{fmt(sum(recv))}</p>
                <p className="text-[11px] text-muted-foreground">{recv.length} pending</p>
              </Link>
              <Link href="/finance?tab=cheques&type=payable" className="bg-white rounded-2xl border border-border/40 shadow-sm p-3 hover:shadow-md transition">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Payable</p>
                <p className="text-lg font-bold font-mono text-red-600">{fmt(sum(pay))}</p>
                <p className="text-[11px] text-muted-foreground">{pay.length} pending</p>
              </Link>
              <Link href="/finance?tab=cheques&due=today" className="bg-white rounded-2xl border border-border/40 shadow-sm p-3 hover:shadow-md transition">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Due today</p>
                <p className="text-lg font-bold font-mono text-amber-600">{dueT.length}</p>
                <p className="text-[11px] text-muted-foreground">{fmt(sum(dueT))}</p>
              </Link>
            </div>
          );
        })()}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Due this week</p>
        <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
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
