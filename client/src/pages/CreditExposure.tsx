import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, CircleDollarSign, ChevronRight } from "lucide-react";

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);

/* Credit Exposure detail (dashboard "Credit Exposure" / "Total Outstanding" click).
   All unpaid credit across every customer — the business-risk number. */
export default function CreditExposure() {
  const [, nav] = useLocation();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/credit-exposure"],
    queryFn: () => fetch("/api/reports/credit-exposure").then((r) => r.json()),
  });
  if (isLoading) return <div className="p-6 max-w-4xl mx-auto space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /></div>;
  const customers = data?.customers || [];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <button onClick={() => nav("/")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Dashboard</button>
      <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-5">
        <div className="flex items-center gap-2"><CircleDollarSign className="w-5 h-5 text-red-600" /><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total Credit Exposure — all unpaid credit</p></div>
        <p className="font-mono font-bold text-3xl text-red-600 mt-1">{money(data?.total)}</p>
        <p className="text-xs text-muted-foreground">{customers.length} customer{customers.length === 1 ? "" : "s"} owe money right now</p>
      </div>

      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30"><h2 className="font-semibold text-sm">Credit customers (highest first)</h2></div>
        {customers.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Nothing outstanding. 🎉</p> : (
          <div className="divide-y">
            {customers.map((c: any) => {
              const key = c.customerId != null ? `id:${c.customerId}` : `name:${c.name}`;
              const risk = c.maxDaysOverdue > 60;
              return (
                <div key={key}>
                  <button onClick={() => setOpen(open === key ? null : key)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/20">
                    <span className="text-muted-foreground text-xs">{open === key ? "▾" : "▸"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{c.name}</span>
                        {risk && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">⚠ {c.maxDaysOverdue}d</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">oldest unpaid {c.oldestDate ? format(new Date(c.oldestDate), "dd MMM yy") : "—"} · {c.invoices.length} invoice{c.invoices.length === 1 ? "" : "s"}</p>
                    </div>
                    <span className="font-mono font-bold text-red-600">{money(c.outstanding)}</span>
                  </button>
                  {open === key && (
                    <div className="px-4 pb-3 bg-slate-50/70 space-y-2">
                      <table className="w-full text-xs">
                        <thead><tr className="text-muted-foreground uppercase"><th className="text-left py-1">Invoice</th><th className="text-left">Date</th><th className="text-right">Days overdue</th><th className="text-right">Remaining</th></tr></thead>
                        <tbody>
                          {c.invoices.map((inv: any) => (
                            <tr key={inv.id} className="border-t border-slate-200">
                              <td className="py-1"><Link href={`/documents/${inv.id}`} className="font-mono text-blue-600 hover:underline">{inv.number}</Link></td>
                              <td>{inv.date ? format(new Date(inv.date), "dd MMM yy") : "—"}</td>
                              <td className={cn("text-right font-mono", inv.daysOverdue > 0 && "text-red-600 font-semibold")}>{inv.daysOverdue}</td>
                              <td className="text-right font-mono font-semibold">{money(inv.remaining)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {c.customerId != null && (
                        <Link href={`/customers/${c.customerId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          Open credit history · Statement · Remind <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
