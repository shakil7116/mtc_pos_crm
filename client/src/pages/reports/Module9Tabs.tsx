import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Download, Printer, TrendingUp, TrendingDown, DollarSign, Users,
  CreditCard, Package, ArrowRight, AlertTriangle, Banknote, Building2,
  RotateCcw, Wallet, ShoppingCart, Star, ChevronRight, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";

const CHART_COLORS = ["#1e40af", "#0d9488", "#c2410c", "#7c3aed", "#0369a1", "#b91c1c", "#4d7c0f", "#a21caf"];

/* Reusable client-side sorting for report tables (Agent 4 — interactivity). */
function useSort<T>(rows: T[], initialKey: string, initialDir: "asc" | "desc" = "desc") {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a: any, b: any) => {
      const av = a[key], bv = b[key];
      const na = Number(av), nb = Number(bv);
      const bothNum = av !== "" && bv !== "" && !isNaN(na) && !isNaN(nb);
      const cmp = bothNum ? na - nb : String(av ?? "").localeCompare(String(bv ?? ""));
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, key, dir]);
  const toggle = (k: string) => { if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setKey(k); setDir("asc"); } };
  return { sorted, sortKey: key, sortDir: dir, toggle };
}

/* Sortable table header cell. */
function SortTh({ k, label, sortKey, sortDir, onSort, align = "left" }: {
  k: string; label: string; sortKey: string; sortDir: string; onSort: (k: string) => void; align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className={cn("px-2 py-2 select-none cursor-pointer hover:text-foreground", align === "right" ? "text-right" : "text-left")} onClick={() => onSort(k)}>
      <span className={cn("inline-flex items-center gap-1", active && "text-foreground font-bold")}>
        {label}<span className="text-[9px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </span>
    </th>
  );
}

/* Module 9 report tabs: Business Summary · Stock Movement · Aging · PDC · Expenses.
   Every tab: period presets + custom range, location filter, CSV export, print view. */

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Period = { start: string; end: string };
function preset(p: string): Period {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  switch (p) {
    case "week": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return { start: iso(d), end: iso(now) }; }
    case "month": return { start: iso(startOfMonth), end: iso(now) };
    case "last-month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: iso(s), end: iso(e) };
    }
    case "3m": { const d = new Date(now); d.setMonth(d.getMonth() - 3); return { start: iso(d), end: iso(now) }; }
    case "6m": { const d = new Date(now); d.setMonth(d.getMonth() - 6); return { start: iso(d), end: iso(now) }; }
    default: return { start: iso(startOfMonth), end: iso(now) };
  }
}

/** Shared filter bar: period presets + custom range + location + CSV + print. */
function FilterBar({ period, setPeriod, storeId, setStoreId, csvUrl, hidePeriod }: {
  period: Period; setPeriod: (p: Period) => void;
  storeId: string; setStoreId: (v: string) => void;
  csvUrl: string; hidePeriod?: boolean;
}) {
  const [mode, setMode] = useState("month");
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
    staleTime: 60_000,
  });
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {!hidePeriod && (
        <>
          <Select value={mode} onValueChange={(v) => { setMode(v); if (v !== "custom") setPeriod(preset(v)); }}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="last-month">Last month</SelectItem>
              <SelectItem value="3m">Last 3 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          {mode === "custom" && (
            <>
              <Input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} className="h-8 w-36 text-xs" />
              <Input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} className="h-8 w-36 text-xs" />
            </>
          )}
        </>
      )}
      <Select value={storeId} onValueChange={setStoreId}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All locations</SelectItem>
          {stores.filter((s: any) => s.active !== false).map((s: any) => (
            <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex gap-2">
        <a href={csvUrl}><Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> CSV</Button></a>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print</Button>
      </div>
    </div>
  );
}

const qsOf = (period: Period, storeId: string, extra = "") =>
  `start=${period.start}&end=${period.end}${storeId !== "all" ? `&storeId=${storeId}` : ""}${extra}`;

/* ── 1. Business Summary ─────────────────────────────────────── */

function HeroStat({ icon, label, value, sub, gradient, onClick }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  gradient: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-200",
        "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]",
        onClick ? "cursor-pointer" : "cursor-default",
        gradient
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
          <p className="text-2xl font-bold font-mono tracking-tight truncate">{value}</p>
          {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
        </div>
        <div className="p-2 rounded-xl bg-white/15 shrink-0">{icon}</div>
      </div>
    </button>
  );
}

function SummarySection({ icon, title, children, action, className }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
  action?: { label: string; onClick: () => void }; className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        </div>
        {action && (
          <button onClick={action.onClick}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline transition-colors">
            {action.label} <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

function DataRow({ label, value, tone, indent, onClick, bold }: {
  label: string; value: string; tone?: string; indent?: boolean;
  onClick?: () => void; bold?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex justify-between items-center text-sm px-4 py-2.5 border-b border-border/30 last:border-0",
        "transition-colors",
        onClick && "cursor-pointer hover:bg-muted/40",
      )}
    >
      <span className={cn("text-muted-foreground", indent && "pl-3 text-xs", bold && "text-foreground font-semibold")}>{label}</span>
      <span className={cn("font-mono font-semibold tabular-nums", tone, bold && "text-base")}>{value}</span>
    </div>
  );
}

export function BusinessSummaryTab() {
  const [period, setPeriod] = useState<Period>(preset("month"));
  const [storeId, setStoreId] = useState("all");
  const [, nav] = useLocation();
  const qs = qsOf(period, storeId);
  const { data: s, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/business-summary", qs],
    queryFn: () => fetch(`/api/reports/business-summary?${qs}`).then((r) => r.json()),
  });

  const setTab = (tab: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
    window.dispatchEvent(new CustomEvent("report-tab", { detail: tab }));
    const el = document.querySelector(`[data-value="${tab}"]`) as HTMLButtonElement | null;
    el?.click();
  };

  return (
    <div className="space-y-6">
      <FilterBar period={period} setPeriod={setPeriod} storeId={storeId} setStoreId={setStoreId}
        csvUrl={`/api/reports/business-summary?${qs}&format=csv`} />

      {isLoading || !s ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Hero stats ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HeroStat
              icon={<DollarSign className="w-5 h-5 text-white" />}
              label="Total sales"
              value={money(s.totalSales)}
              sub={`${s.invoiceCount || 0} invoices`}
              gradient="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white dark:from-emerald-700 dark:to-emerald-950"
              onClick={() => setTab("daily-sales")}
            />
            <HeroStat
              icon={<TrendingUp className="w-5 h-5 text-white" />}
              label="Real profit"
              value={money(s.realProfit)}
              sub={`Margin ${((Number(s.realProfit) / Math.max(Number(s.totalSales), 1)) * 100).toFixed(1)}%`}
              gradient="bg-gradient-to-br from-blue-600 to-blue-800 text-white dark:from-blue-700 dark:to-blue-950"
            />
            <HeroStat
              icon={<Wallet className="w-5 h-5 text-white" />}
              label="Net cash"
              value={money(s.netCashPosition)}
              sub="Hand + Bank + PDC"
              gradient={cn(
                "text-white",
                Number(s.netCashPosition) >= 0
                  ? "bg-gradient-to-br from-teal-600 to-teal-800 dark:from-teal-700 dark:to-teal-950"
                  : "bg-gradient-to-br from-red-600 to-red-800 dark:from-red-700 dark:to-red-950"
              )}
              onClick={() => nav("/finance")}
            />
            <HeroStat
              icon={<AlertTriangle className="w-5 h-5 text-white" />}
              label="Credit outstanding"
              value={money(s.creditOutstanding)}
              sub={`${s.creditCustomersCount || 0} customers`}
              gradient="bg-gradient-to-br from-amber-600 to-amber-800 text-white dark:from-amber-700 dark:to-amber-950"
              onClick={() => setTab("aging")}
            />
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <SummarySection
              icon={<BarChart2 className="w-4 h-4" />}
              title="Daily sales — last 7 days"
              action={{ label: "Sales report", onClick: () => setTab("daily-sales") }}
              className="md:col-span-3"
            >
              <div className="p-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={s.dailySales || []} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip
                      formatter={(v: any) => [money(v), "Revenue"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
                    />
                    <Bar dataKey="sales" radius={[6, 6, 0, 0]}>
                      {(s.dailySales || []).map((_: any, i: number) => (
                        <Cell key={i} fill={i === (s.dailySales || []).length - 1 ? "#059669" : "#1e40af"} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SummarySection>

            <SummarySection
              icon={<Package className="w-4 h-4" />}
              title="Sales by category"
              className="md:col-span-2"
            >
              <div className="p-4">
                {(s.salesByCategory || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-16 text-center">No sales in period</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={s.salesByCategory} dataKey="total" nameKey="category" cx="50%" cy="50%"
                        outerRadius={90} innerRadius={50} paddingAngle={3} strokeWidth={0}>
                        {(s.salesByCategory || []).map((_: any, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => money(v)}
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </SummarySection>
          </div>

          {/* ── Financial breakdown ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SummarySection
              icon={<Banknote className="w-4 h-4" />}
              title="Sales & profit"
              action={{ label: "Details", onClick: () => setTab("daily-sales") }}
            >
              <DataRow label="Total sales" value={money(s.totalSales)} bold />
              <DataRow label="Cash (collected)" value={money(s.cashSales)} tone="text-emerald-600 dark:text-emerald-400" indent />
              <DataRow label="Credit" value={money(s.creditSales)} tone="text-amber-600 dark:text-amber-400" indent
                onClick={() => setTab("aging")} />
              <DataRow label="PDC" value={money(s.pdcSales)} indent />
              <div className="border-t border-dashed border-border/50" />
              <DataRow label="Real profit (collected)" value={money(s.realProfit)} tone="text-emerald-600 dark:text-emerald-400" bold />
              <DataRow label="Expected profit (if all paid)" value={money(s.expectedProfit ?? s.imaginaryProfit)} tone="text-amber-600 dark:text-amber-400" />
            </SummarySection>

            <SummarySection
              icon={<Users className="w-4 h-4" />}
              title="Customers & credit"
              action={{ label: "Top customers", onClick: () => setTab("top-customers") }}
            >
              <DataRow label="New customers (period)" value={String(s.newCustomers)} onClick={() => nav("/customers")} />
              <DataRow label="Returning customers" value={String(s.returningCustomers)} />
              <DataRow label="Credit customers (open)" value={String(s.creditCustomersCount)}
                tone="text-amber-600 dark:text-amber-400" onClick={() => setTab("aging")} />
              <div className="border-t border-dashed border-border/50" />
              <DataRow label="Credit outstanding" value={money(s.creditOutstanding)}
                tone="text-red-600 dark:text-red-400" bold onClick={() => setTab("aging")} />
            </SummarySection>

            <SummarySection
              icon={<Building2 className="w-4 h-4" />}
              title="Suppliers"
              action={{ label: "Manage", onClick: () => nav("/suppliers") }}
            >
              <DataRow label="Active suppliers" value={String(s.suppliersCount)} onClick={() => nav("/suppliers")} />
              <DataRow label="Paid to suppliers (period)" value={money(s.totalPaidToSuppliers)} />
              <DataRow label="Owed (open payable PDCs)" value={money(s.owedToSuppliers)}
                tone="text-red-600 dark:text-red-400" />
            </SummarySection>

            <SummarySection
              icon={<Wallet className="w-4 h-4" />}
              title="Returns & cash position"
              action={{ label: "Finance", onClick: () => nav("/finance") }}
            >
              <DataRow label="Customer returns" value={money(s.customerReturns)}
                onClick={() => setTab("returns")} />
              <DataRow label="Supplier returns" value={money(s.supplierReturns)} />
              <div className="border-t border-dashed border-border/50" />
              <DataRow label="Net cash position" value={money(s.netCashPosition)}
                tone={Number(s.netCashPosition) < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"} bold />
              <div className="grid grid-cols-3 px-4 py-3 gap-2">
                <div className="text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Hand</p>
                  <p className="font-mono text-sm font-bold tabular-nums">{money(s.cashInHand)}</p>
                </div>
                <div className="text-center border-x border-border/30">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Bank</p>
                  <p className="font-mono text-sm font-bold tabular-nums">{money(s.bank)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">PDC in</p>
                  <p className="font-mono text-sm font-bold tabular-nums">{money(s.pdcPending)}</p>
                </div>
              </div>
            </SummarySection>
          </div>

          {/* ── Expenses ── */}
          <SummarySection
            icon={<CreditCard className="w-4 h-4" />}
            title={`Expenses by category — total ${money(s.totalExpenses)}`}
            action={{ label: "Expenses", onClick: () => nav("/expenses") }}
          >
            {!Object.keys(s.expensesByCategory || {}).length ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No expenses in period</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {Object.entries(s.expensesByCategory || {}).map(([k, v]) => (
                  <DataRow key={k} label={k} value={money(v)} />
                ))}
              </div>
            )}
          </SummarySection>

          {/* ── Recommended actions ── */}
          {(s.recommendedActions || []).length > 0 && (
            <section className="rounded-2xl border-2 border-amber-300/60 dark:border-amber-700/40 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200/60 dark:border-amber-800/40">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Recommended actions</h3>
              </div>
              <ul className="p-4 space-y-2">
                {(s.recommendedActions || []).map((a: string, i: number) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-amber-900 dark:text-amber-200">
                    <span className="mt-1 w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-[10px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                      {i + 1}
                    </span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Product intelligence ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SummarySection
              icon={<Star className="w-4 h-4" />}
              title="Top products by profit"
              action={{ label: "All products", onClick: () => setTab("top-products") }}
            >
              {!(s.topProducts || []).length ? (
                <p className="text-sm text-muted-foreground p-6 text-center">No sales in period</p>
              ) : (
                (s.topProducts || []).slice(0, 8).map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm px-4 py-2.5 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                    <span className={cn(
                      "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0",
                      i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" :
                      i === 1 ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" :
                      i === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" :
                      "bg-muted text-muted-foreground"
                    )}>{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">×{Number(p.qty)}</span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{money(p.profit)}</span>
                  </div>
                ))
              )}
            </SummarySection>

            <SummarySection
              icon={<TrendingDown className="w-4 h-4" />}
              title="Worst products (review pricing)"
            >
              {!(s.worstProducts || []).length ? (
                <p className="text-sm text-muted-foreground p-6 text-center">—</p>
              ) : (
                (s.worstProducts || []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm px-4 py-2.5 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                    <span className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-[10px] font-bold text-red-600 dark:text-red-400 shrink-0">{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <span className={cn(
                      "font-mono font-semibold tabular-nums",
                      p.profit < 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    )}>{money(p.profit)}</span>
                  </div>
                ))
              )}
            </SummarySection>
          </div>

          {/* ── Top customers ── */}
          <SummarySection
            icon={<Users className="w-4 h-4" />}
            title="Top customers this period"
            action={{ label: "All customers", onClick: () => setTab("top-customers") }}
          >
            {!(s.topCustomers || []).length ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No customers in period</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {(s.topCustomers || []).slice(0, 10).map((c: any, i: number) => (
                  <div key={i}
                    onClick={() => c.customerId && nav(`/customers/${c.customerId}`)}
                    className={cn(
                      "flex items-center justify-between text-sm px-4 py-2.5 border-b border-border/30",
                      "hover:bg-muted/30 transition-colors cursor-pointer"
                    )}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0",
                        i < 3 ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "bg-muted text-muted-foreground"
                      )}>{i + 1}</span>
                      <span className="truncate font-medium">{c.name}</span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums ml-2">{money(c.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </SummarySection>
        </>
      )}
    </div>
  );
}

/* ── 2. Stock Movement (Go-Live reconciliation) ──────────────── */
export function StockMovementTab() {
  const [period, setPeriod] = useState<Period>(preset("month"));
  const [storeId, setStoreId] = useState("all");
  const [search, setSearch] = useState("");
  const qs = qsOf(period, storeId);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/stock-movement", qs],
    queryFn: () => fetch(`/api/reports/stock-movement?${qs}`).then((r) => r.json()),
  });
  const [expanded, setExpanded] = useState<number | null>(null);
  const filtered = (data?.rows || []).filter((r: any) =>
    !search || String(r.name).toLowerCase().includes(search.toLowerCase()) || String(r.sku || "").toLowerCase().includes(search.toLowerCase()));
  const { sorted, sortKey, sortDir, toggle } = useSort<any>(filtered, "sold", "desc");
  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} storeId={storeId} setStoreId={setStoreId}
        csvUrl={`/api/reports/stock-movement?${qs}&format=csv`} />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter product / SKU…" className="h-8 w-64 text-xs print:hidden" />
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-6" />
                <SortTh k="name" label="Product" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh k="opening" label="Opening" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="received" label="Received" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="sold" label="Sold" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="returned" label="Returned" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="supplierReturns" label="Supplier Ret." sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="closing" label="Closing" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any) => (
                <Fragment key={r.productId}>
                  <tr className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(expanded === r.productId ? null : r.productId)}>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">{expanded === r.productId ? "▾" : "▸"}</td>
                    <td className="px-3 py-1.5"><span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">{r.sku} · {r.unit}</span></td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.opening}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-green-700 dark:text-green-400">{r.received ? `+${r.received}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-red-600 dark:text-red-400">{r.sold ? `−${r.sold}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.returned || "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.supplierReturns ? `−${r.supplierReturns}` : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold">{r.closing}</td>
                  </tr>
                  {expanded === r.productId && (
                    <tr className="bg-muted/30 border-t">
                      <td />
                      <td colSpan={7} className="px-3 py-2 text-xs font-mono text-muted-foreground">
                        Reconciliation: {r.opening} opening
                        {r.received ? ` + ${r.received} received` : ""}
                        {r.sold ? ` − ${r.sold} sold` : ""}
                        {r.returned ? ` + ${r.returned} returned` : ""}
                        {r.supplierReturns ? ` − ${r.supplierReturns} supplier ret.` : ""}
                        {r.otherAdjustments ? ` ${Number(r.otherAdjustments) >= 0 ? "+" : ""}${r.otherAdjustments} other` : ""}
                        {" = "}<span className="font-bold text-foreground">{r.closing} closing</span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!sorted.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No movement in period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── 3. Overdue Aging ────────────────────────────────────────── */
export function AgingTab() {
  const [storeId, setStoreId] = useState("all");
  const [search, setSearch] = useState("");
  const qs = storeId !== "all" ? `storeId=${storeId}` : "";
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/aging", storeId],
    queryFn: () => fetch(`/api/reports/aging?${qs}`).then((r) => r.json()),
  });
  const filteredRows = (data?.rows || []).filter((r: any) =>
    !search || String(r.customerName || "").toLowerCase().includes(search.toLowerCase()) || String(r.number || "").toLowerCase().includes(search.toLowerCase()));
  const { sorted, sortKey, sortDir, toggle } = useSort<any>(filteredRows, "daysOverdue", "desc");
  const BUCKET_STYLE: Record<string, string> = {
    current: "bg-muted/50 text-muted-foreground",
    "1-30": "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
    "31-60": "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    "61-90": "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    "90+": "bg-red-600 text-white dark:bg-red-700",
  };
  return (
    <div className="space-y-4">
      <FilterBar hidePeriod period={preset("month")} setPeriod={() => {}} storeId={storeId} setStoreId={setStoreId}
        csvUrl={`/api/reports/aging?${qs}${qs ? "&" : ""}format=csv`} />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter customer / invoice…" className="h-8 w-64 text-xs print:hidden" />
      {isLoading || !data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(data.perBucket || {}).map(([b, v]: [string, any]) => (
              <div key={b} className={cn("rounded-lg p-2 text-center", BUCKET_STYLE[b])}>
                <p className="text-[10px] font-bold uppercase">{b === "current" ? "Current" : `${b} days`}</p>
                <p className="font-mono font-bold text-sm">{v.count}</p>
                <p className="text-[10px] font-mono">{money(v.total)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortTh k="number" label="Invoice" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortTh k="customerName" label="Customer" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortTh k="date" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortTh k="daysOverdue" label="Days" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                  <SortTh k="remaining" label="Remaining" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                  <SortTh k="bucket" label="Bucket" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r: any) => (
                  <tr key={r.invoiceId} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono text-xs"><a href={`/documents/${r.invoiceId}`} className="text-blue-600 dark:text-blue-400 hover:underline">{r.number}</a></td>
                    <td className="px-3 py-1.5 truncate max-w-44">{r.customerName || "—"}</td>
                    <td className="px-2 py-1.5 text-xs">{r.date}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.daysOverdue}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{money(r.remaining)}</td>
                    <td className="px-2 py-1.5"><span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", BUCKET_STYLE[r.bucket])}>{r.bucket}</span></td>
                  </tr>
                ))}
                {!sorted.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nothing outstanding. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 4. PDC Report ───────────────────────────────────────────── */
export function PdcReportTab() {
  const [days, setDays] = useState("30");
  const [type, setType] = useState("all");
  const qs = `days=${days}${type !== "all" ? `&type=${type}` : ""}`;
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/pdc", qs],
    queryFn: () => fetch(`/api/reports/pdc?${qs}`).then((r) => r.json()),
  });
  const List = ({ title, block, tone }: { title: string; block: any; tone: string }) => (
    <section className="rounded-xl border">
      <h3 className={cn("text-xs font-bold uppercase tracking-wider px-3 py-2 border-b", tone)}>
        {title} — {block?.count ?? 0} cheques · {money(block?.total)}
      </h3>
      <div className="divide-y">
        {(block?.rows || []).map((r: any) => (
          <div key={r.id} className="flex items-center gap-2 text-sm px-3 py-1.5">
            <span className={cn("text-[10px] font-bold rounded px-1.5 py-0.5", r.type === "payable" ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400")}>{r.type === "payable" ? "PAY" : "RCV"}</span>
            <span className="font-mono text-xs">{r.chequeNumber}</span>
            <span className="text-muted-foreground text-xs truncate flex-1">{r.who || r.customerName || ""} · {r.bankName}</span>
            <span className="text-xs">{r.chequeDate}</span>
            <span className="font-mono font-semibold">{money(r.amount)}</span>
          </div>
        ))}
        {!(block?.rows || []).length && <p className="text-sm text-muted-foreground p-3">None.</p>}
      </div>
    </section>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Next 7 days</SelectItem>
            <SelectItem value="14">Next 14 days</SelectItem>
            <SelectItem value="30">Next 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="receivable">Receivable</SelectItem>
            <SelectItem value="payable">Payable</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <a href={`/api/reports/pdc?${qs}&format=csv`}><Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> CSV</Button></a>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print</Button>
        </div>
      </div>
      {isLoading || !data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-3 bg-card"><p className="text-[11px] uppercase text-muted-foreground">Receivable pending</p><p className="font-mono font-bold text-lg text-green-700 dark:text-green-400 tabular-nums">{money(data.receivablePending)}</p></div>
            <div className="rounded-xl border p-3 bg-card"><p className="text-[11px] uppercase text-muted-foreground">Payable pending</p><p className="font-mono font-bold text-lg text-red-600 dark:text-red-400 tabular-nums">{money(data.payablePending)}</p></div>
          </div>
          <List title="Overdue (past cheque date)" block={data.overdue} tone="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400" />
          <List title={`Upcoming — next ${data.windowDays} days`} block={data.upcoming} tone="bg-muted/30 text-muted-foreground" />
        </>
      )}
    </div>
  );
}

/* ── 5. Expense Report ───────────────────────────────────────── */
export function ExpenseReportTab() {
  const [period, setPeriod] = useState<Period>(preset("month"));
  const [storeId, setStoreId] = useState("all");
  const qs = qsOf(period, storeId);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/expenses", qs],
    queryFn: () => fetch(`/api/reports/expenses?${qs}`).then((r) => r.json()),
  });
  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} storeId={storeId} setStoreId={setStoreId}
        csvUrl={`/api/reports/expenses?${qs}&format=csv`} />
      {isLoading || !data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border p-3 bg-card"><p className="text-[11px] uppercase text-muted-foreground">Total</p><p className="font-mono font-bold text-lg text-rose-600 dark:text-rose-400 tabular-nums">{money(data.totals?.total)}</p></div>
            <div className="rounded-xl border p-3 bg-card"><p className="text-[11px] uppercase text-muted-foreground">Recurring</p><p className="font-mono font-bold text-lg tabular-nums">{money(data.totals?.recurring)}</p></div>
            <div className="rounded-xl border p-3 bg-card"><p className="text-[11px] uppercase text-muted-foreground">One-time</p><p className="font-mono font-bold text-lg tabular-nums">{money(data.totals?.oneTime)}</p></div>
          </div>
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-right px-2 py-2">Entries</th>
                  <th className="text-right px-2 py-2">Recurring</th>
                  <th className="text-right px-2 py-2">One-time</th>
                  <th className="text-right px-3 py-2 font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.byCategory || {}).map(([k, v]: [string, any]) => (
                  <tr key={k} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium">{k}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{v.count}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(v.recurring)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(v.oneTime)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold">{money(v.total)}</td>
                  </tr>
                ))}
                {!Object.keys(data.byCategory || {}).length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No expenses in period.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
