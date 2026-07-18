import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, Wallet, Building2, Banknote, Clock } from "lucide-react";

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);
const isBankNote = (s: string) => /bank transfer|online|cheque|card/i.test(s || "");

/* Cash Position detail (dashboard "Cash Position" click).
   Hand + Bank = liquid cash. PDC shown SEPARATELY — never counted as cash. */
export default function CashPosition({ embedded }: { embedded?: boolean }) {
  const [, nav] = useLocation();
  const [tab, setTab] = useState<"hand" | "bank">("hand");
  const { data: pos, isLoading } = useQuery<any>({
    queryKey: ["/api/cashflow/position"],
    queryFn: () => fetch("/api/cashflow/position").then((r) => r.json()),
  });
  const { data: flows = [] } = useQuery<any[]>({
    queryKey: ["/api/cashflow"],
    queryFn: () => fetch("/api/cashflow").then((r) => r.json()).catch(() => []),
  });

  if (isLoading) return <div className="p-6 max-w-4xl mx-auto space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /></div>;

  const hand = Number(pos?.cashInHand || 0), bank = Number(pos?.bank || 0), pdc = Number(pos?.pdcPending || 0);
  const liquid = hand + bank;
  const rows = (Array.isArray(flows) ? flows : []).filter((f: any) => (tab === "bank" ? isBankNote(f.notes) : !isBankNote(f.notes)))
    .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {!embedded && <button onClick={() => nav("/")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Dashboard</button>}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Wallet className="w-6 h-6 text-emerald-600" /> Cash Position</h1>
        <p className="text-sm text-muted-foreground">Total Liquid Cash = Hand + Bank. PDC is pending, not cash.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button onClick={() => setTab("hand")} className={cn("rounded-2xl border-2 p-4 text-left", tab === "hand" ? "border-emerald-300 bg-emerald-50/50" : "border-border")}>
          <div className="flex items-center gap-2 mb-1"><Banknote className="w-4 h-4 text-emerald-600" /><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Hand Cash</p></div>
          <p className={cn("font-mono font-bold text-2xl", hand < 0 ? "text-red-600" : "text-emerald-700")}>{money(hand)}</p>
          <p className="text-[11px] text-muted-foreground">cash sales − cash refunds − cash expenses + injections</p>
        </button>
        <button onClick={() => setTab("bank")} className={cn("rounded-2xl border-2 p-4 text-left", tab === "bank" ? "border-blue-300 bg-blue-50/50" : "border-border")}>
          <div className="flex items-center gap-2 mb-1"><Building2 className="w-4 h-4 text-blue-600" /><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Bank Balance</p></div>
          <p className={cn("font-mono font-bold text-2xl", bank < 0 ? "text-red-600" : "text-blue-700")}>{money(bank)}</p>
          <p className="text-[11px] text-muted-foreground">opening + transfers/cheques in − out</p>
        </button>
        <Link href="/pdc" className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-4 block">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-amber-600" /><p className="text-[11px] uppercase tracking-widest text-amber-700">Uncleared PDC (not guaranteed)</p></div>
          <p className="font-mono font-bold text-2xl text-amber-700">{money(pdc)}</p>
          <p className="text-[11px] text-amber-700/80">cheques received, not deposited — can bounce. NOT cash.</p>
        </Link>
      </div>

      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-4 flex items-center justify-between">
        <p className="font-bold text-sm uppercase tracking-wider text-emerald-800">Total Liquid Cash (Hand + Bank)</p>
        <p className={cn("font-mono font-bold text-2xl", liquid < 0 ? "text-red-600" : "text-emerald-700")}>{money(liquid)}</p>
      </div>

      {/* Transactions for the selected instrument */}
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30"><h2 className="font-semibold text-sm capitalize">{tab === "hand" ? "Cash (till)" : "Bank"} transactions</h2></div>
        {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No transactions.</p> : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {rows.slice(0, 60).map((f: any) => (
              <div key={f.id} className="px-4 py-2 flex items-center justify-between text-sm">
                <div className="min-w-0"><p className="truncate">{f.notes || f.category}</p><p className="text-[11px] text-muted-foreground">{f.date ? format(new Date(f.date), "dd MMM yy") : ""} · {f.category}</p></div>
                <span className={cn("font-mono font-semibold shrink-0", f.direction === "in" ? "text-green-700" : "text-red-600")}>{f.direction === "in" ? "+" : "−"} {money(f.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
