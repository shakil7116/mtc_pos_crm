import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertOctagon, Landmark, Wallet, Truck, Receipt, RotateCcw, Factory } from "lucide-react";
import { money, todayStr, useDeliveries } from "./shared";

/**
 * Admin dashboard extensions (Module 8C):
 * bad-debt aging, PDC due today (both directions), per-location cash position,
 * supplier payments by due date, today's expenses, recent returns, delivery board.
 */
export default function AdminExtras({ reminders = [], storeFilter = null }: { reminders?: any[]; storeFilter?: number | null }) {
  const today = todayStr();

  const { data: cashPos } = useQuery<any>({
    queryKey: ["/api/cashflow/position"],
    queryFn: () => fetch("/api/cashflow/position").then((r) => r.json()),
    refetchInterval: 60_000,
  });
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

  // Bad debt aging buckets from the summary's reminders (already store real overdue days).
  const buckets = { "1-29": 0, "30-59": 0, "60-89": 0, "90+": 0 } as Record<string, number>;
  const bucketAmt = { "1-29": 0, "30-59": 0, "60-89": 0, "90+": 0 } as Record<string, number>;
  for (const r of reminders) {
    const d = Number(r.daysOverdue) || 0;
    const k = d >= 90 ? "90+" : d >= 60 ? "60-89" : d >= 30 ? "30-59" : "1-29";
    buckets[k]++; bucketAmt[k] += Number(r.remaining || 0);
  }

  const pdcDueToday = cheques.filter((c) => ["pending", "deposited"].includes(c.status) && c.chequeDate <= today);
  const expTotal = expensesToday
    .filter((e) => !storeFilter || e.storeId === storeFilter)
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const duePos = pos.filter((p) => p.paymentDueDate && p.status === "received").sort((a, b) => String(a.paymentDueDate).localeCompare(String(b.paymentDueDate)));
  // Delivery board honors the admin location filter.
  const activeDeliveries = deliveries.filter((d) => d.deliveryStatus !== "delivered" && (!storeFilter || d.storeId === storeFilter));
  const recentReturns = returns.slice(0, 4);
  const recentSupReturns = supReturns.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Bad debt aging — red-flagged buckets */}
      <section className="rounded-xl border border-red-200 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 flex items-center gap-1.5 mb-2">
          <AlertOctagon className="w-3.5 h-3.5" /> Bad debt — overdue aging
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {(["1-29", "30-59", "60-89", "90+"] as const).map((k) => (
            <Link key={k} href="/credit-exposure" className={`rounded-lg p-2 text-center ${k === "90+" ? "bg-red-600 text-white" : k === "60-89" ? "bg-red-100 text-red-700" : k === "30-59" ? "bg-amber-100 text-amber-700" : "bg-slate-50 text-slate-600"}`}>
              <p className="text-[10px] font-bold uppercase">{k} days</p>
              <p className="font-mono font-bold text-sm">{buckets[k]}</p>
              <p className="text-[10px] font-mono">{money(bucketAmt[k])}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PDC due today — both directions */}
        <section className="rounded-xl border p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Landmark className="w-3.5 h-3.5" /> PDC due today ({pdcDueToday.length})
          </h2>
          {pdcDueToday.length === 0 && <p className="text-sm text-muted-foreground">None due.</p>}
          <div className="space-y-1.5">
            {pdcDueToday.slice(0, 5).map((c) => (
              <Link key={c.id} href="/pdc?due=today" className="flex items-center gap-2 text-sm rounded-lg border px-2.5 py-1.5 hover:bg-slate-50">
                <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${c.type === "payable" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>{c.type === "payable" ? "PAY" : "RCV"}</span>
                <span className="font-mono text-xs truncate flex-1">{c.chequeNumber}</span>
                <span className="font-mono font-semibold">{money(c.amount)}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Cash position per location */}
        <section className="rounded-xl border p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Wallet className="w-3.5 h-3.5" /> Cash position by location
          </h2>
          <div className="space-y-1">
            {(cashPos?.perStore || []).map((s: any) => (
              <div key={String(s.storeId)} className="flex justify-between text-sm px-1">
                <span className="text-muted-foreground truncate">{s.storeName}</span>
                <span className={`font-mono font-semibold ${s.net < 0 ? "text-red-600" : "text-green-700"}`}>{money(s.net)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm border-t pt-1 mt-1 px-1 font-bold">
              <span>Company total</span>
              <span className={`font-mono ${Number(cashPos?.total) < 0 ? "text-red-600" : "text-green-700"}`}>{money(cashPos?.total)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground px-1">
              Hand {money(cashPos?.cashInHand)} · Bank {money(cashPos?.bank)} · PDC in {money(cashPos?.pdcPending)} / out {money(cashPos?.pdcPayable)}
            </p>
          </div>
        </section>

        {/* Supplier payments by due date */}
        <section className="rounded-xl border p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Factory className="w-3.5 h-3.5" /> Supplier payments due
          </h2>
          {duePos.length === 0 && <p className="text-sm text-muted-foreground">No received POs with payment terms.</p>}
          <div className="space-y-1.5">
            {duePos.slice(0, 5).map((p) => (
              <Link key={p.id} href="/suppliers" className="flex items-center gap-2 text-sm rounded-lg border px-2.5 py-1.5 hover:bg-slate-50">
                <span className="font-mono text-xs">{p.poNumber}</span>
                <span className={`ml-auto text-xs font-semibold ${String(p.paymentDueDate) <= today ? "text-red-600" : "text-muted-foreground"}`}>due {p.paymentDueDate}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Today's expenses */}
        <section className="rounded-xl border p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Receipt className="w-3.5 h-3.5" /> Today's expenses
          </h2>
          <Link href="/expenses" className="block">
            <p className="font-mono font-bold text-xl text-rose-600">{money(expTotal)}</p>
            <p className="text-[11px] text-muted-foreground">{expensesToday.length} entr{expensesToday.length === 1 ? "y" : "ies"} today — tap for details</p>
          </Link>
        </section>
      </div>

      {/* Recent returns — customer + supplier */}
      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
          <RotateCcw className="w-3.5 h-3.5" /> Recent returns
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground">Customer</p>
            {recentReturns.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
            {recentReturns.map((r) => (
              <Link key={r.id} href="/documents?type=CN" className="flex justify-between text-sm rounded border px-2 py-1 hover:bg-slate-50">
                <span className="font-mono text-xs">{r.voucherNumber}</span>
                <span className={`text-[10px] font-semibold ${r.status === "approved" ? "text-green-700" : r.status === "pending" ? "text-amber-600" : "text-red-600"}`}>{r.status}</span>
              </Link>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground">Supplier</p>
            {recentSupReturns.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
            {recentSupReturns.map((r) => (
              <Link key={r.id} href="/suppliers" className="flex justify-between text-sm rounded border px-2 py-1 hover:bg-slate-50">
                <span className="font-mono text-xs">SR-{r.id}</span>
                <span className="text-[10px] font-semibold text-muted-foreground">{r.status}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Delivery status board */}
      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
          <Truck className="w-3.5 h-3.5" /> Delivery board — active site deliveries ({activeDeliveries.length})
        </h2>
        {activeDeliveries.length === 0 && <p className="text-sm text-muted-foreground">No active deliveries.</p>}
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
    </div>
  );
}
