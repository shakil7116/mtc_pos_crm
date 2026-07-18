import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { businessDate } from "@shared/permissions";
import { ArrowLeft, TrendingUp } from "lucide-react";

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);

/* Profit Today drill-down (dashboard "Profit Today" click).
   Profit = Sell − Cost only. Expenses are NOT part of gross profit. */
export default function ProfitToday({ embedded }: { embedded?: boolean }) {
  const [, nav] = useLocation();
  const today = businessDate(new Date());
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/profit-detail", today],
    queryFn: () => fetch(`/api/reports/profit-detail?start=${today}&end=${today}`).then((r) => r.json()),
  });

  if (isLoading) return <div className="p-6 max-w-4xl mx-auto space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /></div>;
  const invoices = data?.invoices || [];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {!embedded && <Button2 onClick={() => nav("/")} />}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><TrendingUp className="w-6 h-6 text-emerald-600" /> Profit Today</h1>
        <p className="text-sm text-muted-foreground">{today} · gross profit = sell − cost (expenses excluded)</p>
      </div>

      {/* Real vs Imaginary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Real Profit (paid invoices)</p>
          <p className="font-mono font-bold text-2xl text-emerald-700 mt-0.5">{money(data?.realProfit)}</p>
          <p className="text-[11px] text-muted-foreground">= collected sales {money(data?.realSales)} − their COGS</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Imaginary Profit (incl. unpaid credit)</p>
          <p className="font-mono font-bold text-2xl text-slate-700 mt-0.5">{money(data?.imaginaryProfit)}</p>
          <p className="text-[11px] text-muted-foreground">= total invoiced {money(data?.totalSales)} − COGS</p>
        </div>
      </div>

      {/* Per-invoice */}
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30"><h2 className="font-semibold text-sm">Today's invoices ({invoices.length})</h2></div>
        {invoices.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No sales today yet.</p>
        ) : (
          <div className="divide-y">
            {invoices.map((inv: any) => (
              <div key={inv.id}>
                <button onClick={() => setOpen(open === inv.id ? null : inv.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/20">
                  <span className="text-muted-foreground text-xs">{open === inv.id ? "▾" : "▸"}</span>
                  <Link href={`/documents/${inv.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-blue-600 hover:underline text-sm">{inv.number}</Link>
                  <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded", inv.status === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>{inv.status}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1">{inv.customerName}</span>
                  <span className="font-mono text-sm">{money(inv.total)}</span>
                  <span className="font-mono text-sm font-bold text-emerald-700 w-24 text-right">{money(inv.profit)}</span>
                </button>
                {open === inv.id && (
                  <div className="px-4 pb-3 bg-slate-50/70">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground uppercase"><th className="text-left py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Sell</th><th className="text-right">Cost</th><th className="text-right">Profit</th></tr></thead>
                      <tbody>
                        {(inv.items || []).map((it: any, i: number) => (
                          <tr key={i} className="border-t border-slate-200">
                            <td className="py-1">{it.description}</td>
                            <td className="text-right font-mono">{it.qty}</td>
                            <td className="text-right font-mono">{money(it.price)}</td>
                            <td className="text-right font-mono">{money(it.cost)}</td>
                            <td className="text-right font-mono font-semibold text-emerald-700">{money(it.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Note: this is gross profit (sell − materials cost). Net profit — after all expenses — is on the monthly report.</p>
    </div>
  );
}

function Button2({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Dashboard</button>;
}
