import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertOctagon, Landmark, Truck, Receipt, RotateCcw, Factory } from "lucide-react";
import { money, todayStr, useDeliveries, fetchArray } from "./shared";

export default function AdminExtras({ reminders = [], storeFilter = null }: { reminders?: any[]; storeFilter?: number | null }) {
  const today = todayStr();

  const { data: cheques = [] } = useQuery<any[]>({
    queryKey: ["/api/cheques"],
    queryFn: () => fetchArray("/api/cheques"),
    refetchInterval: 60_000,
  });
  const { data: expensesToday = [] } = useQuery<any[]>({
    queryKey: [`/api/expenses`, today],
    queryFn: () => fetchArray(`/api/expenses?start=${today}&end=${today}`),
    refetchInterval: 60_000,
  });
  const { data: returns = [] } = useQuery<any[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetchArray("/api/returns"),
    refetchInterval: 60_000,
  });
  const { data: supReturns = [] } = useQuery<any[]>({
    queryKey: ["/api/supplier-returns"],
    queryFn: () => fetchArray("/api/supplier-returns"),
    refetchInterval: 60_000,
  });
  const { data: pos = [] } = useQuery<any[]>({
    queryKey: ["/api/supplier-orders"],
    queryFn: () => fetchArray("/api/supplier-orders"),
    refetchInterval: 60_000,
  });
  const { data: deliveries = [] } = useDeliveries("");

  // Bad debt aging buckets from the summary's reminders (now grouped by customer).
  const buckets = { "1-29": 0, "30-59": 0, "60-89": 0, "90+": 0 } as Record<string, number>;
  const bucketAmt = { "1-29": 0, "30-59": 0, "60-89": 0, "90+": 0 } as Record<string, number>;
  for (const r of reminders) {
    const invs = r.invoices || [];
    for (const inv of invs) {
      const d = Number(inv.daysOverdue) || 0;
      const k = d >= 90 ? "90+" : d >= 60 ? "60-89" : d >= 30 ? "30-59" : "1-29";
      buckets[k]++; bucketAmt[k] += Number(inv.remaining || 0);
    }
  }

  const pdcDueToday = cheques.filter((c) => ["pending", "deposited"].includes(c.status) && c.chequeDate <= today);
  const expTotal = expensesToday
    .filter((e) => !storeFilter || e.storeId === storeFilter)
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const duePos = pos.filter((p) => p.paymentDueDate && p.status === "received").sort((a, b) => String(a.paymentDueDate).localeCompare(String(b.paymentDueDate)));
  // Delivery board honors the admin location filter.
  const activeDeliveries = deliveries.filter((d) => d.deliveryStatus !== "delivered" && (!storeFilter || d.storeId === storeFilter));

  // Sections are hidden when they have no fresh activity — a quiet dashboard shows
  // only what needs attention. "Recent returns" = only those raised in the last 24h.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const within24h = (ts?: string | null) => {
    if (!ts) return false;
    const t = new Date(ts).getTime();
    return Number.isFinite(t) && Date.now() - t <= DAY_MS;
  };
  const recentReturns = returns.filter((r) => within24h(r.createdAt || r.date)).slice(0, 4);
  const recentSupReturns = supReturns.filter((r) => within24h(r.createdAt || r.date)).slice(0, 3);

  // Whether the 3-up grid (PDC / supplier dues / today's expenses) has anything to show.
  const hasGridRow = pdcDueToday.length > 0 || duePos.length > 0 || expensesToday.length > 0;

  return (
    <div className="space-y-4">
      {hasGridRow && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pdcDueToday.length > 0 && (
            <section className="section-card">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Landmark className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                PDC due today ({pdcDueToday.length})
              </h2>
              <div className="space-y-1.5">
                {pdcDueToday.slice(0, 5).map((c) => (
                  <Link key={c.id} href="/finance?tab=cheques&due=today" className="flex items-center gap-2 text-sm rounded-lg border border-border/30 px-3 py-2 hover:bg-slate-50/80 transition-colors">
                    <span className={`status-pill ${c.type === "payable" ? "bg-red-50 text-red-600 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>{c.type === "payable" ? "PAY" : "RCV"}</span>
                    <span className="font-mono text-xs truncate flex-1 text-muted-foreground">{c.chequeNumber}</span>
                    <span className="font-mono font-bold text-sm">{money(c.amount)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {duePos.length > 0 && (
            <section className="section-card">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Factory className="w-3.5 h-3.5 text-orange-500" />
                </div>
                Supplier payments due
              </h2>
              <div className="space-y-1.5">
                {duePos.slice(0, 5).map((p) => (
                  <Link key={p.id} href="/suppliers" className="flex items-center gap-2 text-sm rounded-lg border border-border/30 px-3 py-2 hover:bg-slate-50/80 transition-colors">
                    <span className="font-mono text-xs text-foreground font-semibold">{p.poNumber}</span>
                    <span className={`ml-auto status-pill ${String(p.paymentDueDate) <= today ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-muted-foreground border-border/50"}`}>due {p.paymentDueDate}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {expensesToday.length > 0 && (
            <section className="section-card">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center">
                  <Receipt className="w-3.5 h-3.5 text-rose-500" />
                </div>
                Today's expenses
              </h2>
              <Link href="/expenses" className="block group">
                <p className="font-mono font-bold text-2xl text-rose-600 tracking-tight">{money(expTotal)}</p>
                <p className="text-[11px] text-muted-foreground mt-1 group-hover:text-foreground transition-colors">{expensesToday.length} entr{expensesToday.length === 1 ? "y" : "ies"} today — tap for details</p>
              </Link>
            </section>
          )}
        </div>
      )}

      {(recentReturns.length > 0 || recentSupReturns.length > 0) && (
        <section className="section-card">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
            </div>
            Recent returns
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentReturns.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Customer</p>
                {recentReturns.map((r) => (
                  <Link key={r.id} href="/documents?type=CN" className="flex justify-between text-sm rounded-lg border border-border/30 px-3 py-2 hover:bg-slate-50/80 transition-colors">
                    <span className="font-mono text-xs font-semibold">{r.voucherNumber}</span>
                    <span className={`status-pill ${r.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : r.status === "pending" ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-red-50 text-red-600 border-red-200"}`}>{r.status}</span>
                  </Link>
                ))}
              </div>
            )}
            {recentSupReturns.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Supplier</p>
                {recentSupReturns.map((r) => (
                  <Link key={r.id} href="/suppliers" className="flex justify-between text-sm rounded-lg border border-border/30 px-3 py-2 hover:bg-slate-50/80 transition-colors">
                    <span className="font-mono text-xs font-semibold">SR-{r.id}</span>
                    <span className="status-pill bg-slate-50 text-muted-foreground border-border/50">{r.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeDeliveries.length > 0 && (
        <section className="section-card">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <Truck className="w-3.5 h-3.5 text-blue-500" />
            </div>
            Delivery board — {activeDeliveries.length} active
          </h2>
          <div className="space-y-1.5">
            {activeDeliveries.map((d) => (
              <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center gap-2 text-sm rounded-lg border border-border/30 px-3 py-2 hover:bg-slate-50/80 transition-colors group">
                <span className="font-mono text-xs text-muted-foreground">{d.number}</span>
                <span className="truncate flex-1 font-medium">{d.customerName}</span>
                <span className="status-pill bg-amber-50 text-amber-700 border-amber-200">{d.deliveryStatus}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
