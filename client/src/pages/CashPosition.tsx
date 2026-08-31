import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, Wallet, Building2, Banknote, Clock, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import CashCountDialog from "@/components/CashCountDialog";
import {
  money, CHART, RangeToggle, rangeStart, type RangeKey,
  Delta, pctDelta, MetricCard, HeroBalance, Sparkline, anchoredCumulative,
} from "@/components/finance/kit";

const isBankNote = (s: string) => /bank transfer|online|cheque|card/i.test(s || "");

/* Cash Position — trading-style command center.
   Hand + Bank = liquid cash. PDC shown SEPARATELY — never counted as cash.
   The range toggle drives the headline trend, sparklines and deltas; the
   ledger below is the live recent feed for the selected instrument. */
export default function CashPosition({ embedded }: { embedded?: boolean }) {
  const [, nav] = useLocation();
  const [tab, setTab] = useState<"hand" | "bank">("hand");
  const [range, setRange] = useState<RangeKey>("3M");
  // Counting the drawer at close — the only practical check on a cash sale that
  // never got entered.
  const [countOpen, setCountOpen] = useState(false);
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()).catch(() => []),
  });
  const { data: counts } = useQuery<any>({
    queryKey: ["/api/cash-counts"],
    queryFn: () => fetch("/api/cash-counts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
  });

  const { data: pos, isLoading } = useQuery<any>({
    queryKey: ["/api/cashflow/position"],
    queryFn: () => fetch("/api/cashflow/position").then((r) => r.json()),
  });
  const { data: flows = [] } = useQuery<any[]>({
    queryKey: ["/api/cashflow"],
    queryFn: () => fetch("/api/cashflow").then((r) => r.json()).catch(() => []),
  });

  if (isLoading) return <div className="p-6 max-w-5xl mx-auto space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /></div>;

  const hand = Number(pos?.cashInHand || 0), bank = Number(pos?.bank || 0), pdc = Number(pos?.pdcPending || 0);
  const liquid = hand + bank;
  const start = rangeStart(range);
  const all = Array.isArray(flows) ? flows : [];

  // Dated net deltas (in = +, out = −), split by instrument via the bank heuristic.
  const net = (f: any) => (f.direction === "in" ? 1 : -1) * (Number(f.amount) || 0);
  const liquidSeries = anchoredCumulative(all.map((f) => ({ date: f.date, net: net(f) })), liquid, start);
  const handSeries = anchoredCumulative(all.filter((f) => !isBankNote(f.notes)).map((f) => ({ date: f.date, net: net(f) })), hand, start);
  const bankSeries = anchoredCumulative(all.filter((f) => isBankNote(f.notes)).map((f) => ({ date: f.date, net: net(f) })), bank, start);

  const deltaVs = (series: { y: number }[], current: number) => (series.length ? pctDelta(current, series[0].y) : null);
  const liquidDelta = deltaVs(liquidSeries, liquid);
  const rangeLabel = range === "All" ? "all time" : range === "1W" ? "last week" : range === "1M" ? "last month" : range === "3M" ? "3 months ago" : "last year";

  // Ledger for the selected instrument (recent feed, grouped by day).
  const rows = all
    .filter((f: any) => (tab === "bank" ? isBankNote(f.notes) : !isBankNote(f.notes)))
    .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "") || b.id - a.id)
    .slice(0, 50);
  const groups: { date: string; items: any[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.date) last.items.push(r);
    else groups.push({ date: r.date, items: [r] });
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {!embedded && <button onClick={() => nav("/")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Dashboard</button>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cash Position</h1>
            <p className="text-[13px] text-muted-foreground">liquid cash = hand + bank · PDC is pending, not cash</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCountOpen(true)}>
            <Banknote className="w-4 h-4" /> Count the till
          </Button>
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </div>

      {/* What the tills have actually done. One short day means nothing; the same
          till short every day is the only evidence there will ever be. */}
      {counts && counts.count > 0 && (
        <div className="section-card">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="section-heading">Till counts</h2>
            <span className="text-[11px] text-muted-foreground">
              {counts.count} close{counts.count === 1 ? "" : "s"} recorded
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Net difference</p>
              <p className={cn("font-mono font-bold text-lg mt-0.5",
                counts.netDifference < -0.005 ? "text-red-700" : counts.netDifference > 0.005 ? "text-amber-700" : "text-emerald-700")}>
                {money(counts.netDifference)}
              </p>
            </div>
            <div className="rounded-xl bg-red-500/5 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Short days</p>
              <p className="font-mono font-bold text-lg mt-0.5 text-red-700">{counts.shortDays}</p>
              <p className="text-[11px] text-muted-foreground">{money(Math.abs(counts.shortTotal))} in total</p>
            </div>
            <div className="rounded-xl bg-amber-500/5 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Over days</p>
              <p className="font-mono font-bold text-lg mt-0.5 text-amber-700">{counts.overDays}</p>
            </div>
            <div className="rounded-xl bg-emerald-500/5 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Exact</p>
              <p className="font-mono font-bold text-lg mt-0.5 text-emerald-700">{counts.exactDays}</p>
            </div>
          </div>
          <div className="mt-3 divide-y divide-border/30">
            {counts.rows.slice(0, 5).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{r.date}</span>
                  <span className="ml-2">{r.storeName}</span>
                  {r.reason && <p className="text-[11px] text-muted-foreground truncate">{r.reason}</p>}
                </div>
                <span className={cn("font-mono font-semibold shrink-0 tabular-nums",
                  r.difference < -0.005 ? "text-red-600" : r.difference > 0.005 ? "text-amber-600" : "text-emerald-700")}>
                  {r.difference === 0 ? "exact" : money(r.difference)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Headline — total liquid cash + trend */}
      <HeroBalance
        label="Total liquid cash (hand + bank)"
        value={money(liquid)}
        delta={liquidDelta}
        deltaSub={liquidDelta !== null ? `vs ${rangeLabel}` : "hand + bank on hand right now"}
        color={liquid < 0 ? CHART.red : CHART.emerald}
        trend={liquidSeries}
      />

      {/* Instrument KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger-children">
        <MetricCard icon={Banknote} label="Hand cash" accent={CHART.emerald} active={tab === "hand"}
          onClick={() => setTab("hand")} value={money(hand)} valueClassName={hand < 0 ? "text-red-600" : "text-emerald-700"}
          sub="cash sales − refunds − expenses + injections" delta={deltaVs(handSeries, hand)}
          spark={handSeries.map((p) => p.y)} sparkColor={CHART.emerald} />
        <MetricCard icon={Building2} label="Bank balance" accent={CHART.blue} active={tab === "bank"}
          onClick={() => setTab("bank")} value={money(bank)} valueClassName={bank < 0 ? "text-red-600" : "text-blue-700"}
          sub="opening + transfers/cheques in − out" delta={deltaVs(bankSeries, bank)}
          spark={bankSeries.map((p) => p.y)} sparkColor={CHART.blue} />
        <MetricCard icon={Clock} label="Uncleared PDC" accent={CHART.amber} href="/finance?tab=cheques"
          value={money(pdc)} valueClassName="text-amber-700"
          sub="pending + deposited, not yet cleared" />
      </div>

      {/* Ledger for the selected instrument */}
      <div className="section-card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-muted/20">
          <h2 className="font-semibold text-sm inline-flex items-center gap-2">
            <span className={cn("w-1.5 h-1.5 rounded-full", tab === "hand" ? "bg-emerald-500" : "bg-blue-500")} />
            {tab === "hand" ? "Cash (till)" : "Bank"} transactions
          </h2>
          <span className="text-[11px] text-muted-foreground">{rows.length} recent</span>
        </div>
        {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No transactions.</p> : (
          <div className="max-h-[26rem] overflow-y-auto">
            {groups.map((g) => (
              <div key={g.date}>
                <div className="sticky top-0 z-[1] px-4 py-1.5 bg-muted/40 backdrop-blur-sm border-b border-border/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {g.date ? format(new Date(g.date), "EEEE, dd MMM yyyy") : "Undated"}
                </div>
                {g.items.map((f: any) => {
                  const isIn = f.direction === "in";
                  return (
                    <div key={f.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn("w-7 h-7 rounded-lg grid place-items-center shrink-0",
                          isIn ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600")}>
                          {isIn ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate">{f.notes || f.category}</p>
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">{f.category}</span>
                        </div>
                      </div>
                      <span className={cn("font-mono font-semibold shrink-0 tabular-nums", isIn ? "text-emerald-700" : "text-red-600")}>
                        {isIn ? "+" : "−"} {money(f.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      <CashCountDialog
        open={countOpen}
        onClose={() => setCountOpen(false)}
        stores={(stores as any[]).filter((x) => x.active !== false)}
      />
    </div>
  );
}
