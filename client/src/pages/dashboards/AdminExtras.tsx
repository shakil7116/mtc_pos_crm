import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertOctagon, Landmark, Truck, Receipt, RotateCcw, Factory } from "lucide-react";
import { money, todayStr, useDeliveries } from "./shared";

/**
 * Admin dashboard extensions (Module 8C):
 * bad-debt aging, PDC due today (both directions), per-location cash position,
 * supplier payments by due date, today's expenses, recent returns, delivery board.
 */
export default function AdminExtras({ reminders = [], storeFilter = null }: { reminders?: any[]; storeFilter?: number | null }) {
  const today = todayStr();

  const { data: cheques = [] } = useQuery<any[]>({
    queryKey: ["/api/cheques"],
    queryFn: () => fetch("/api/cheques").then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const { data: expensesToday = [] } = useQuery<any[]>({
    queryKey: [`/api/expenses`, today],
    queryFn: () => fetch(`/api/expenses?start=${today}&end=${today}`).then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const { data: returns = [] } = useQuery<any[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetch("/api/returns").then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const { data: supReturns = [] } = useQuery<any[]>({
    queryKey: ["/api/supplier-returns"],
    queryFn: () => fetch("/api/supplier-returns").then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const { data: pos = [] } = useQuery<any[]>({
    queryKey: ["/api/supplier-orders"],
    queryFn: () => fetch("/api/supplier-orders").then((r) => r.json()),
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
      {/* Bad debt aging removed from the dashboard per owner request — full aging
          lives on the Credit Exposure page. */}

      {/* PDC due today / supplier dues / today's expenses — each hidden when it has
          nothing fresh to show; the whole row drops out when all three are empty. */}
      {hasGridRow && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PDC due today — both directions (hidden when none due today) */}
          {pdcDueToday.length > 0 && (
            <section className="rounded-xl border p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                <Landmark className="w-3.5 h-3.5" /> PDC due today ({pdcDueToday.length})
              </h2>
              <div className="space-y-1.5">
                {pdcDueToday.slice(0, 5).map((c) => (
                  <Link key={c.id} href="/finance?tab=cheques&due=today" className="flex items-center gap-2 text-sm rounded-lg border px-2.5 py-1.5 hover:bg-slate-50">
                    <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${c.type === "payable" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>{c.type === "payable" ? "PAY" : "RCV"}</span>
                    <span className="font-mono text-xs truncate flex-1">{c.chequeNumber}</span>
                    <span className="font-mono font-semibold">{money(c.amount)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Supplier payments by due date (hidden when no POs are due) */}
          {duePos.length > 0 && (
            <section className="rounded-xl border p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                <Factory className="w-3.5 h-3.5" /> Supplier payments due
              </h2>
              <div className="space-y-1.5">
                {duePos.slice(0, 5).map((p) => (
                  <Link key={p.id} href="/suppliers" className="flex items-center gap-2 text-sm rounded-lg border px-2.5 py-1.5 hover:bg-slate-50">
                    <span className="font-mono text-xs">{p.poNumber}</span>
                    <span className={`ml-auto text-xs font-semibold ${String(p.paymentDueDate) <= today ? "text-red-600" : "text-muted-foreground"}`}>due {p.paymentDueDate}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Today's expenses (hidden when nothing spent today) */}
          {expensesToday.length > 0 && (
            <section className="rounded-xl border p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                <Receipt className="w-3.5 h-3.5" /> Today's expenses
              </h2>
              <Link href="/expenses" className="block">
                <p className="font-mono font-bold text-xl text-rose-600">{money(expTotal)}</p>
                <p className="text-[11px] text-muted-foreground">{expensesToday.length} entr{expensesToday.length === 1 ? "y" : "ies"} today — tap for details</p>
              </Link>
            </section>
          )}
        </div>
      )}

      {/* Recent returns — customer + supplier (hidden when none raised in the last 24h) */}
      {(recentReturns.length > 0 || recentSupReturns.length > 0) && (
        <section className="rounded-xl border p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <RotateCcw className="w-3.5 h-3.5" /> Recent returns
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentReturns.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Customer</p>
                {recentReturns.map((r) => (
                  <Link key={r.id} href="/documents?type=CN" className="flex justify-between text-sm rounded border px-2 py-1 hover:bg-slate-50">
                    <span className="font-mono text-xs">{r.voucherNumber}</span>
                    <span className={`text-[10px] font-semibold ${r.status === "approved" ? "text-green-700" : r.status === "pending" ? "text-amber-600" : "text-red-600"}`}>{r.status}</span>
                  </Link>
                ))}
              </div>
            )}
            {recentSupReturns.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Supplier</p>
                {recentSupReturns.map((r) => (
                  <Link key={r.id} href="/suppliers" className="flex justify-between text-sm rounded border px-2 py-1 hover:bg-slate-50">
                    <span className="font-mono text-xs">SR-{r.id}</span>
                    <span className="text-[10px] font-semibold text-muted-foreground">{r.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Delivery status board (hidden when no active/pending deliveries) */}
      {activeDeliveries.length > 0 && (
        <section className="rounded-xl border p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Truck className="w-3.5 h-3.5" /> Delivery board — active site deliveries ({activeDeliveries.length})
          </h2>
          <div className="space-y-1.5">
            {activeDeliveries.map((d) => (
              <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center gap-2 text-sm rounded-lg border px-2.5 py-1.5 hover:bg-slate-50">
                <span className="font-mono text-xs text-muted-foreground">{d.number}</span>
                <span className="truncate flex-1">{d.customerName}</span>
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{d.deliveryStatus}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
