import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  Store, FilePlus2, FileText, Users, AlertTriangle, Trophy, Star,
  CreditCard, Package, ChevronRight, MessageCircle, CircleDollarSign,
} from "lucide-react";
import { canAccess, type Role } from "@shared/permissions";
import { useStores, useLowStock, locPath, money, todayStr } from "./shared";
import TasksPanel from "@/components/TasksPanel";

/**
 * Salesman / Worker Dashboard — the SAME rich admin-style dashboard (hero KPI
 * cards, receivables aging, payment reminders, inventory + insights) but:
 *   • STORE-SCOPED to the user's assigned store. The /api/dashboard/summary
 *     endpoint hard-locks a store-assigned non-admin to their own store, so every
 *     number here is their store only — company-wide panels (all-store cash,
 *     owner loans, cross-store overview, supplier dues) are intentionally omitted.
 *   • INVOICE-FIRST. The create band is pinned to the very top so the salesman's
 *     day-to-day action (making invoices) leads, and the overview follows.
 */

const toNum = (v: any): number => (typeof v === "number" ? v : parseFloat(v) || 0);

export default function SalesmanDashboard() {
  const { user } = useAuth();
  const myStoreId = user?.storeId ?? null;
  const { data: stores = [] } = useStores();
  const myStore = stores.find((s: any) => s.id === myStoreId);
  const today = todayStr();

  // Store-scoped summary (server hard-locks store-assigned staff to their store).
  const { data: summary } = useQuery<any>({
    queryKey: [`/api/dashboard/summary`, myStoreId],
    queryFn: () => fetch(`/api/dashboard/summary${myStoreId ? `?storeId=${myStoreId}` : ""}`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const { data: docsAll = [] } = useQuery<any[]>({
    queryKey: ["/api/documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()),
    refetchInterval: 60_000,
  });
  // Role isolation: my store only, real transactions, live invoices.
  const docs = docsAll.filter((d) => d.type === "INV" && d.status !== "void" && d.transactionMode !== "demo" && (!myStoreId || d.storeId === myStoreId));
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const todayDocs = docs.filter((d) => d.date === today);
  const weekDocs = docs.filter((d) => d.date >= weekAgo);

  const top = (rows: any[], key: (d: any) => string | null, val: (d: any) => number) => {
    const m = new Map<string, number>();
    for (const d of rows) { const k = key(d); if (!k) continue; m.set(k, (m.get(k) || 0) + val(d)); }
    let best: [string, number] | null = null;
    for (const e of Array.from(m.entries())) if (!best || e[1] > best[1]) best = e;
    return best;
  };
  const bestCustToday = useMemo(() => top(todayDocs, (d) => d.customerName, (d) => Number(d.total || 0)), [docsAll, myStoreId]);
  const bestCustWeek = useMemo(() => top(weekDocs, (d) => d.customerName, (d) => Number(d.total || 0)), [docsAll, myStoreId]);
  const bestProdToday = useMemo(() => top(todayDocs.flatMap((d) => d.items || []), (i) => i.description, (i) => Number(i.qty || 0)), [docsAll, myStoreId]);
  const bestProdWeek = useMemo(() => top(weekDocs.flatMap((d) => d.items || []), (i) => i.description, (i) => Number(i.qty || 0)), [docsAll, myStoreId]);

  const { data: lowStockAll = [] } = useLowStock();
  const lowStock = lowStockAll.filter((i: any) => !myStoreId || i.storeId === myStoreId);

  // ── Store-scoped KPIs from the summary (same source the admin dashboard uses) ──
  const cashToday = toNum(summary?.cashSalesToday);
  const creditToday = toNum(summary?.creditSalesToday);
  const totalToday = cashToday + creditToday;
  const real = toNum(summary?.profitFromCash);
  const imaginary = real + toNum(summary?.profitFromUnrealizedCredit);
  const newInvoicesToday = toNum(summary?.newInvoicesToday);
  const totalOutstanding = toNum(summary?.totalOutstanding);
  const reminders: any[] = Array.isArray(summary?.paymentReminders) ? summary.paymentReminders : [];

  // "Shift list" = invoices THIS salesman created today (spec 8B), not the whole store's.
  const myShiftDocs = todayDocs.filter((d) => !user?.id || Number(d.createdBy) === Number(user.id));

  // Store overview — month-to-date sales, my store only.
  const monthStart = today.slice(0, 8) + "01"; // YYYY-MM-01
  const monthTotal = docs.filter((d) => d.date >= monthStart).reduce((s, d) => s + Number(d.total || 0), 0);

  // Receivables aging — one row per customer, bucketed by their oldest overdue invoice.
  const agingBuckets = useMemo(() => {
    const defs = [
      { key: "current", label: "Current", color: "bg-emerald-500", test: (d: number) => d <= 0 },
      { key: "1-30", label: "1–30d", color: "bg-yellow-400", test: (d: number) => d >= 1 && d <= 30 },
      { key: "31-60", label: "31–60d", color: "bg-amber-500", test: (d: number) => d >= 31 && d <= 60 },
      { key: "61-90", label: "61–90d", color: "bg-orange-500", test: (d: number) => d >= 61 && d <= 90 },
      { key: "90+", label: "90+d", color: "bg-red-600", test: (d: number) => d > 90 },
    ];
    return defs.map((b) => {
      const items = reminders.filter((r) => b.test(toNum(r.maxDaysOverdue)));
      return { ...b, count: items.length, total: items.reduce((s, r) => s + toNum(r.outstanding), 0) };
    });
  }, [reminders]);
  const agingGrand = agingBuckets.reduce((s, b) => s + b.total, 0) || 1;

  const roleLabel = user?.role === "worker" ? "worker view" : "salesman view";
  // Worker shares this dashboard but can't reach Reports/Messages — keep those
  // links safe so nothing dead-ends for them.
  const role = (user?.role ?? "salesman") as Role;
  const canMessages = canAccess(role, "messages");
  const canReports = canAccess(role, "reports");

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      {/* ══ Header ══ */}
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
          <Store className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a] dark:text-slate-100">{myStore?.nameEn || "My Store"}</h1>
          <p className="text-sm text-muted-foreground">{user?.name} · {roleLabel}</p>
        </div>
      </header>

      {/* ══ CREATE BAND (invoice-first — the focus of this dashboard) ══ */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/documents/new/INV"
          className="col-span-2 hero-card bg-gradient-to-br from-[#1a2640] via-[#0c1322] to-[#162038] text-white flex items-center gap-4 !p-5"
        >
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <FilePlus2 className="w-6 h-6 text-amber-300" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-amber-300/60 font-bold">Start a sale</p>
            <p className="text-xl font-extrabold leading-tight mt-0.5">New Invoice</p>
            <p className="text-[11px] text-white/40 mt-0.5">Add customer &amp; items, take payment</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/30 ml-auto shrink-0" />
        </Link>
        <Link
          href="/documents/new/QT"
          className="stat-card flex flex-col items-center justify-center gap-2 text-center hover:-translate-y-0.5"
        >
          <FileText className="w-6 h-6 text-purple-600" />
          <span className="text-sm font-bold text-foreground">New Quotation</span>
        </Link>
        <Link
          href="/customers"
          className="stat-card flex flex-col items-center justify-center gap-2 text-center hover:-translate-y-0.5"
        >
          <Users className="w-6 h-6 text-blue-600" />
          <span className="text-sm font-bold text-foreground">Customers</span>
        </Link>
      </section>

      {/* ══ Low-stock alert (store-scoped) ══ */}
      {lowStock.length > 0 && (
        <Link href="/inventory?filter=low-stock">
          <div className="alert-banner bg-gradient-to-r from-red-50 to-red-50/30 border border-red-200/60 text-red-800 dark:from-red-950/30 dark:border-red-800/40 dark:text-red-300">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-[13px] font-semibold">
              {lowStock.length} {lowStock.length === 1 ? "product" : "products"} low on stock — my store
            </span>
            <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-red-400" />
          </div>
        </Link>
      )}

      {/* ══ HERO KPI ROW (store-scoped) ══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
        <Link href="/documents?type=INV&date=today" className="hero-card bg-gradient-to-br from-[#1a2640] via-[#0c1322] to-[#162038] text-white">
          <p className="text-[10px] uppercase tracking-widest text-amber-300/60 font-bold">Today's Sales</p>
          <p className="font-mono font-extrabold text-[26px] mt-2 tracking-tight leading-none">{money(totalToday)}</p>
          <p className="text-[11px] text-white/35 mt-2">{todayDocs.length} invoice{todayDocs.length === 1 ? "" : "s"} · my store</p>
        </Link>
        <Link href={canReports ? "/reports?tab=daily-sales" : "/documents?type=INV&date=today"} className="hero-card bg-gradient-to-br from-emerald-50 via-green-50/50 to-white border border-emerald-200/60 dark:from-emerald-950/30 dark:via-emerald-900/10 dark:to-slate-900 dark:border-emerald-800/30">
          <p className="text-[10px] uppercase tracking-widest text-emerald-600/60 dark:text-emerald-400/60 font-bold">Profit Today</p>
          <p className="font-mono font-extrabold text-[26px] mt-2 text-emerald-700 dark:text-emerald-400 tracking-tight leading-none">
            {money(real)} <span className="text-slate-400 dark:text-slate-500 text-base font-semibold">({money(imaginary)})</span>
          </p>
          <p className="text-[11px] text-emerald-600/50 dark:text-emerald-500/50 mt-2">real (collected) · (expected incl. credit)</p>
        </Link>
        <Link href="/documents" className="hero-card bg-gradient-to-br from-blue-50 via-sky-50/50 to-white border border-blue-200/40 dark:from-blue-950/30 dark:via-blue-900/10 dark:to-slate-900 dark:border-blue-800/30">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-bold">This Month</p>
          <p className="font-mono font-extrabold text-[26px] mt-2 text-slate-800 dark:text-slate-200 tracking-tight leading-none">{money(monthTotal)}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-2">my store sales, month to date</p>
        </Link>
        <Link href="/customers?filter=credit-outstanding" className={cn("hero-card border",
          totalOutstanding > 0
            ? "bg-gradient-to-br from-orange-50 via-amber-50/50 to-white border-orange-200/60 dark:from-orange-950/30 dark:via-amber-900/10 dark:to-slate-900 dark:border-orange-800/30"
            : "bg-gradient-to-br from-slate-50 to-white border-border/40 dark:from-slate-800/30 dark:to-slate-900 dark:border-slate-700/30")}>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-bold">Credit Exposure</p>
          <p className={cn("font-mono font-extrabold text-[26px] mt-2 tracking-tight leading-none", totalOutstanding > 0 ? "text-orange-600 dark:text-orange-400" : "text-slate-600 dark:text-slate-300")}>{money(totalOutstanding)}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-2">{reminders.length} customer{reminders.length === 1 ? "" : "s"} owe</p>
        </Link>
      </div>

      {/* ══ TODAY SNAPSHOT ══ */}
      <section>
        <h2 className="section-heading">Today's Snapshot</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={<FileText className="w-5 h-5 text-blue-600" />} color="bg-blue-50 dark:bg-blue-950/40"
            label="New Invoices Today" value={newInvoicesToday} sub="my store" href="/documents?type=INV&date=today" />
          <StatCard icon={<CreditCard className="w-5 h-5 text-orange-600" />} color="bg-orange-50 dark:bg-orange-950/40"
            label="Credit Sales Today" value={money(creditToday)} sub="on-account, not yet collected" href="/documents?type=INV&date=today&credit=1" />
          <StatCard icon={<CircleDollarSign className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/40"
            label="My Invoices Today" value={myShiftDocs.length} sub={`${money(myShiftDocs.reduce((s, d) => s + Number(d.total || 0), 0))} total`} />
        </div>
      </section>

      {/* ══ RECEIVABLES AGING (store-scoped) ══ */}
      {reminders.length > 0 && (
        <section>
          <h2 className="section-heading">Receivables Aging — my store</h2>
          <Link href="/customers?filter=credit-outstanding">
            <div className="section-card hover:shadow-[var(--shadow-card-hover)] transition-all cursor-pointer">
              <div className="flex h-2.5 rounded-full overflow-hidden mb-4 bg-slate-100 dark:bg-slate-800">
                {agingBuckets.map((b) => b.total > 0 && (
                  <div key={b.key} className={cn(b.color, "transition-all")} style={{ width: `${(b.total / agingGrand) * 100}%` }} title={`${b.label}: ${money(b.total)}`} />
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {agingBuckets.map((b) => (
                  <div key={b.key} className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={cn("w-2 h-2 rounded-full", b.color)} />
                      <span className={cn("text-[11px] font-semibold", b.key === "90+" && b.count > 0 && "text-red-600")}>{b.label}</span>
                    </div>
                    <p className="font-mono font-bold text-sm mt-1">{money(b.total)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{b.count} {b.count === 1 ? "customer" : "customers"}</p>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ══ CUSTOMER PAYMENT REMINDERS (store-scoped) ══ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-heading mb-0">Customer Payment Reminders</h2>
          {canMessages && (
            <Link href="/messages" className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors">Open Messages</Link>
          )}
        </div>
        <div className="section-card !p-0 overflow-hidden">
          {reminders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No overdue payments. All caught up.</div>
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
                  {reminders.map((r: any) => {
                    const overdue = toNum(r.maxDaysOverdue) > 0;
                    const waNum = (r.customerPhone || "").replace(/\D/g, "");
                    const waMsg = encodeURIComponent(r.message || "");
                    return (
                      <tr key={r.customerId || r.customerName}>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          <p className="truncate max-w-[180px]">{r.customerName ?? `Customer #${r.customerId ?? "—"}`}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground text-xs font-semibold">{r.invoiceCount}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{money(r.outstanding)}</td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <span className={cn("status-pill",
                            toNum(r.maxDaysOverdue) > 30 ? "bg-red-100 text-red-700 border-red-200"
                              : overdue ? "bg-orange-100 text-orange-700 border-orange-200"
                                : "bg-yellow-100 text-yellow-700 border-yellow-200")}>
                            {overdue ? `${r.maxDaysOverdue}d overdue` : "due"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {waNum ? (
                            <a href={`https://wa.me/${waNum}?text=${waMsg}`} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50 transition-colors"
                              title="Send account statement via WhatsApp">
                              <MessageCircle className="w-3.5 h-3.5" /> Remind
                            </a>
                          ) : canMessages ? (
                            <Link href="/messages" className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:bg-secondary/70 transition-colors">
                              <MessageCircle className="w-3.5 h-3.5" /> Remind
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary/40 text-muted-foreground/40 cursor-default" title="No phone number on file">
                              <MessageCircle className="w-3.5 h-3.5" /> Remind
                            </span>
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

      {/* ══ INVENTORY ALERTS & INSIGHTS ══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="section-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">Low Stock — my store</h2>
            <Link href="/inventory?filter=low-stock" className="ml-auto text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors">View all</Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-emerald-600 font-medium">All products are well stocked.</p>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {lowStock.slice(0, 8).map((i: any) => {
                const path = locPath(i.product, stores);
                return (
                  <Link key={i.id} href="/inventory" className="flex items-center justify-between rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2.5 py-1.5 -mx-1 transition-colors">
                    <div className="min-w-0">
                      <span className="text-xs text-foreground font-semibold truncate block max-w-[200px]">{i.product?.name}</span>
                      {path && <p className="text-[10px] text-emerald-700 truncate">📍 {path}</p>}
                    </div>
                    <span className="font-mono text-[11px] font-bold text-red-600 shrink-0">{Number(i.qty)} left</span>
                  </Link>
                );
              })}
              {lowStock.length > 8 && (
                <Link href="/inventory?filter=low-stock" className="block text-xs text-amber-600 mt-2 hover:text-amber-700 font-semibold transition-colors">
                  +{lowStock.length - 8} more...
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="section-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">Today's Insights</h2>
          </div>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20">
              <p className="text-[10px] font-semibold text-emerald-600/60 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Trophy className="w-3 h-3" /> Best Customer</p>
              <p className="text-sm">Today: <span className="font-semibold text-foreground">{bestCustToday ? `${bestCustToday[0]} (${money(bestCustToday[1])})` : "—"}</span></p>
              <p className="text-sm">This week: <span className="font-semibold text-foreground">{bestCustWeek ? `${bestCustWeek[0]} (${money(bestCustWeek[1])})` : "—"}</span></p>
            </div>
            <div className="p-3 rounded-lg bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/20">
              <p className="text-[10px] font-semibold text-blue-600/60 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Star className="w-3 h-3" /> Best Selling Product</p>
              <p className="text-sm">Today: <span className="font-semibold text-foreground">{bestProdToday ? `${bestProdToday[0]} (×${bestProdToday[1]})` : "—"}</span></p>
              <p className="text-sm">This week: <span className="font-semibold text-foreground">{bestProdWeek ? `${bestProdWeek[0]} (×${bestProdWeek[1]})` : "—"}</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Tasks assigned to me (and, if I can assign, to my helper) */}
      <TasksPanel />

      {/* ══ MY SHIFT INVOICES TODAY ══ */}
      <section className="section-card">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">My shift invoices today</h2>
        {myShiftDocs.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet — tap New Invoice to start.</p>}
        <div className="space-y-1.5">
          {myShiftDocs.map((d) => (
            <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center gap-2 text-sm rounded-lg border border-border/50 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <span className="font-mono text-xs text-muted-foreground">{d.number}</span>
              <span className="truncate flex-1">{d.customerName || "Walk-in"}</span>
              <span className="font-mono font-semibold">{money(d.total)}</span>
              <span className={cn("text-[10px] font-semibold rounded-full px-2 py-0.5",
                d.status === "paid" ? "bg-green-100 text-green-700" : d.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600")}>{d.status}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* bottom padding for mobile nav */}
      <div className="h-4" />
    </div>
  );
}

/* ── Small KPI tile (mirrors the admin dashboard's StatCard, drill-down link) ── */
function StatCard({ icon, label, value, sub, color, href }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string; href?: string;
}) {
  const content = (
    <div className={cn("stat-card group flex items-start gap-4", href && "cursor-pointer")}>
      <div className={cn("p-2.5 rounded-lg shrink-0 transition-transform group-hover:scale-105", color)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-xl font-bold font-mono truncate text-foreground">{value}</p>
        {sub && <p className="text-[11px] mt-0.5 text-muted-foreground">{sub}</p>}
      </div>
      {href && <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
