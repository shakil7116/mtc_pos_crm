import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Store, FilePlus2, FileText, Users, AlertTriangle, Trophy, Star } from "lucide-react";
import { useStores, useLowStock, locPath, money, todayStr } from "./shared";
import TasksPanel from "@/components/TasksPanel";

/**
 * Salesman Dashboard (Module 8B) — STORE-FILTERED to their assigned store.
 * Today's sales, best customer/product (today + week), low stock w/ location,
 * Real Profit (Imaginary in brackets), shift invoice list, quick actions.
 */
export default function SalesmanDashboard() {
  const { user } = useAuth();
  const myStoreId = user?.storeId ?? null;
  const { data: stores = [] } = useStores();
  const myStore = stores.find((s: any) => s.id === myStoreId);
  const today = todayStr();

  // Store-scoped summary (server filters when storeId given)
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
  const bestCustToday = useMemo(() => top(todayDocs, (d) => d.customerName, (d) => Number(d.total || 0)), [docsAll]);
  const bestCustWeek = useMemo(() => top(weekDocs, (d) => d.customerName, (d) => Number(d.total || 0)), [docsAll]);
  const bestProdToday = useMemo(() => top(todayDocs.flatMap((d) => d.items || []), (i) => i.description, (i) => Number(i.qty || 0)), [docsAll]);
  const bestProdWeek = useMemo(() => top(weekDocs.flatMap((d) => d.items || []), (i) => i.description, (i) => Number(i.qty || 0)), [docsAll]);

  const { data: lowStockAll = [] } = useLowStock();
  const lowStock = lowStockAll.filter((i: any) => !myStoreId || i.storeId === myStoreId);

  const totalToday = (Number(summary?.cashSalesToday) || 0) + (Number(summary?.creditSalesToday) || 0);
  const real = Number(summary?.profitFromCash) || 0;
  const imaginary = real + (Number(summary?.profitFromUnrealizedCredit) || 0);
  // "Shift list" = invoices THIS salesman created today (spec 8B), not the whole store's.
  const myShiftDocs = todayDocs.filter((d) => !user?.id || Number(d.createdBy) === Number(user.id));

  // Store overview — month-to-date sales + still-unpaid, my store only.
  const monthStart = today.slice(0, 8) + "01"; // YYYY-MM-01
  const monthTotal = docs.filter((d) => d.date >= monthStart).reduce((s, d) => s + Number(d.total || 0), 0);
  const unpaidDocs = docs.filter((d) => d.status !== "paid" && d.status !== "void");
  const unpaidTotal = unpaidDocs.reduce((s, d) => s + Number((d as any).remaining ?? d.total ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
          <Store className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">{myStore?.nameEn || "My Store"}</h1>
          <p className="text-sm text-muted-foreground">{user?.name} · salesman view</p>
        </div>
      </header>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/documents/new" className="flex flex-col items-center gap-1 rounded-xl bg-[#1e2a3a] text-white py-3 text-sm font-semibold hover:opacity-90">
          <FilePlus2 className="w-5 h-5" /> New Invoice
        </Link>
        <Link href="/documents/new/QT" className="flex flex-col items-center gap-1 rounded-xl border-2 border-[#1e2a3a] text-[#1e2a3a] py-3 text-sm font-semibold hover:bg-slate-50">
          <FileText className="w-5 h-5" /> New Quotation
        </Link>
        <Link href="/customers" className="flex flex-col items-center gap-1 rounded-xl border-2 border-[#1e2a3a] text-[#1e2a3a] py-3 text-sm font-semibold hover:bg-slate-50">
          <Users className="w-5 h-5" /> Customers
        </Link>
      </div>

      {/* TOP: today's sales — the 2-second number */}
      <Link href="/documents" className="block rounded-2xl bg-[#1e2a3a] text-white p-4 hover:opacity-95">
        <p className="text-[11px] uppercase tracking-widest text-white/60">Today's Sales — my store</p>
        <p className="font-mono font-bold text-3xl mt-0.5">{money(totalToday)}</p>
        <p className="text-[11px] text-white/60">{todayDocs.length} store invoice{todayDocs.length === 1 ? "" : "s"} today</p>
      </Link>

      {/* Store overview — month sales + unpaid + inventory check */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/documents" className="rounded-xl border p-3 hover:bg-slate-50">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">This month</p>
          <p className="font-mono font-bold text-lg text-[#1e2a3a]">{money(monthTotal)}</p>
          <p className="text-[11px] text-muted-foreground">my store sales</p>
        </Link>
        <Link href="/documents?status=unpaid" className="rounded-xl border p-3 hover:bg-slate-50">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Unpaid</p>
          <p className="font-mono font-bold text-lg text-red-600">{money(unpaidTotal)}</p>
          <p className="text-[11px] text-muted-foreground">{unpaidDocs.length} invoice{unpaidDocs.length === 1 ? "" : "s"}</p>
        </Link>
        <Link href="/inventory" className="rounded-xl border p-3 hover:bg-slate-50">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Inventory</p>
          <p className="font-mono font-bold text-lg text-[#1e2a3a]">{lowStock.length}</p>
          <p className="text-[11px] text-muted-foreground">low — tap to check</p>
        </Link>
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">My invoices today</p>
          <p className="font-mono font-bold text-xl text-[#1e2a3a]">{myShiftDocs.length}</p>
          <p className="text-[11px] text-muted-foreground">{money(myShiftDocs.reduce((s, d) => s + Number(d.total || 0), 0))} total</p>
        </div>
        {/* One profit box: Real (Imaginary in brackets) */}
        <div className="rounded-xl border p-3 bg-emerald-50/40 border-emerald-200">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Profit today</p>
          <p className="font-mono font-bold text-xl text-emerald-700">
            {money(real)} <span className="text-sm text-emerald-600/70">({money(imaginary)})</span>
          </p>
          <p className="text-[11px] text-muted-foreground">Real (Imaginary incl. uncollected credit)</p>
        </div>
      </div>

      {/* Best customer / product */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-500" /> Best customer</p>
          <p className="text-sm mt-1">Today: <span className="font-semibold">{bestCustToday ? `${bestCustToday[0]} (${money(bestCustToday[1])})` : "—"}</span></p>
          <p className="text-sm">This week: <span className="font-semibold">{bestCustWeek ? `${bestCustWeek[0]} (${money(bestCustWeek[1])})` : "—"}</span></p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" /> Best selling product</p>
          <p className="text-sm mt-1">Today: <span className="font-semibold">{bestProdToday ? `${bestProdToday[0]} (×${bestProdToday[1]})` : "—"}</span></p>
          <p className="text-sm">This week: <span className="font-semibold">{bestProdWeek ? `${bestProdWeek[0]} (×${bestProdWeek[1]})` : "—"}</span></p>
        </div>
      </div>

      {/* Low stock — my store, with location paths */}
      {lowStock.length > 0 && (
        <section className="rounded-xl border border-red-200 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Low stock — my store ({lowStock.length})
          </h2>
          <div className="space-y-1.5">
            {lowStock.map((i: any) => {
              const path = locPath(i.product, stores);
              return (
                <Link key={i.id} href="/inventory" className="block rounded-lg bg-red-50/60 border border-red-100 px-3 py-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{i.product?.name}</span>
                    <span className="font-mono text-red-600">{Number(i.qty)} left</span>
                  </div>
                  {path && <p className="text-[11px] text-emerald-700">📍 {path}</p>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Tasks assigned to me (and, if I can assign, to my helper) */}
      <TasksPanel />

      {/* Shift invoice list — this salesman's own invoices today */}
      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">My shift invoices today</h2>
        {myShiftDocs.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet — tap New Invoice to start.</p>}
        <div className="space-y-1.5">
          {myShiftDocs.map((d) => (
            <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2 hover:bg-slate-50">
              <span className="font-mono text-xs text-muted-foreground">{d.number}</span>
              <span className="truncate flex-1">{d.customerName || "Walk-in"}</span>
              <span className="font-mono font-semibold">{money(d.total)}</span>
              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${d.status === "paid" ? "bg-green-100 text-green-700" : d.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>{d.status}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
