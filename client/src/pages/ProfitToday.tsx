import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { businessDate } from "@shared/permissions";
import { subDays, subMonths, subYears, startOfMonth, startOfYear, format } from "date-fns";
import { ArrowLeft, TrendingUp, Clock, Wallet, ArrowRight, Percent, PiggyBank } from "lucide-react";
import {
  money, CHART, SegToggle, Delta, pctDelta, MetricCard, HeroBalance, runningTotal,
} from "@/components/finance/kit";

const pct = (n: any) => (Number(n) || 0).toFixed(1) + "%";

/* Period → date range. "Today" honours the business-day boundary; month/year are
   calendar-based off today's business date. All numbers come from the SAME server
   endpoint (/api/reports/profit-detail) that Reports uses, so they reconcile. */
const PERIODS = [
  { key: "today", label: "Today" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All Time" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

function rangeFor(period: PeriodKey, today: string): { start: string; end: string } {
  const [y, m] = today.split("-");
  if (period === "month") return { start: `${y}-${m}-01`, end: today };
  if (period === "year") return { start: `${y}-01-01`, end: today };
  if (period === "all") return { start: "1970-01-01", end: today };
  return { start: today, end: today };
}

/* Fair like-for-like previous period (same day-of-month/year cutoff) so the
   delta compares month-to-date vs the same point last month, not partial-to-full. */
function prevRangeFor(period: PeriodKey, today: string): { start: string; end: string } | null {
  const t = new Date(today + "T00:00:00");
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  if (period === "today") { const y = subDays(t, 1); return { start: iso(y), end: iso(y) }; }
  if (period === "month") { const p = subMonths(t, 1); return { start: iso(startOfMonth(p)), end: iso(p) }; }
  if (period === "year") { const p = subYears(t, 1); return { start: iso(startOfYear(p)), end: iso(p) }; }
  return null;
}

const LOSS_LABEL: Record<string, string> = {
  transfer_shortage: "Short on transfer",
  count_variance: "Found short at count",
  damage: "Damaged",
  write_off: "Written off",
  swap_difference: "Swap difference",
};

export default function ProfitToday({ embedded }: { embedded?: boolean }) {
  const [, nav] = useLocation();
  const search = useSearch();
  const today = businessDate(new Date());
  const [open, setOpen] = useState<number | null>(null);

  const urlPeriod = (new URLSearchParams(search).get("period") || "today") as PeriodKey;
  const [period, setPeriod] = useState<PeriodKey>(
    PERIODS.some((p) => p.key === urlPeriod) ? urlPeriod : "today",
  );
  useEffect(() => {
    if (PERIODS.some((p) => p.key === urlPeriod)) setPeriod(urlPeriod);
  }, [urlPeriod]);

  const { start, end } = rangeFor(period, today);
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || "Today";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/profit-detail", start, end],
    queryFn: () => fetch(`/api/reports/profit-detail?start=${start}&end=${end}`).then((r) => r.json()),
  });

  // Previous like-for-like period → real MoM/YoY delta on the headline.
  const prev = prevRangeFor(period, today);
  const { data: prevData } = useQuery<any>({
    queryKey: ["/api/reports/profit-detail", "prev", prev?.start, prev?.end],
    queryFn: () => fetch(`/api/reports/profit-detail?start=${prev!.start}&end=${prev!.end}`).then((r) => r.json()),
    enabled: !!prev,
  });

  const { data: summary } = useQuery<any>({ queryKey: ["/api/reports/profit-summary"] });

  // Owner profit draws live in the loans ledger (type=profit_withdrawal) — recorded
  // on the Cash & Loans page. Here we only READ the running total to report how much
  // the owner has taken vs kept; it never touches the earned-profit maths above.
  const { data: loans } = useQuery<any>({ queryKey: ["/api/owner-loans"], queryFn: () => fetch("/api/owner-loans").then((r) => r.json()) });

  if (isLoading) return <div className="p-6 max-w-5xl mx-auto space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /></div>;

  const invoices = data?.invoices || [];
  const realProfit = Number(data?.realProfit || 0);
  const expectedProfit = Number(data?.expectedProfit ?? data?.imaginaryProfit ?? 0);
  const realSales = Number(data?.realSales || 0);
  const totalSales = Number(data?.totalSales || 0);
  const awaitingAmount = Number((totalSales - realSales).toFixed(2));
  const awaitingProfit = Number((expectedProfit - realProfit).toFixed(2));
  const unpaidCount = Math.max(0, Number(data?.invoiceCount || 0) - Number(data?.realCount || 0));

  // Material that left without being sold, over the same days. Read beside gross
  // profit, never mixed into it — one profit calculation, and this is the other half.
  const materialLosses = Number(data?.materialLosses || 0);
  const lossesByKind: Record<string, number> = data?.materialLossesByKind || {};
  const lossCount = Number(data?.materialLossCount || 0);
  const afterLosses = Number((realProfit - materialLosses).toFixed(2));

  // Cumulative real profit across the period (paid invoices contribute on their date).
  const trend = runningTotal(invoices.map((inv: any) => ({ date: inv.date, net: inv.status === "paid" ? Number(inv.profit) || 0 : 0 })));
  const realDelta = prev && prevData ? pctDelta(realProfit, Number(prevData.realProfit || 0)) : null;

  // Owner's profit share — all-time real profit earned, how much the owner has
  // drawn, and what's kept in the business. Withdrawing NEVER reduces earned profit.
  const earnedAllTime = Number(summary?.realProfit || 0);
  const profitTaken = Number(loans?.summary?.profitTaken || 0);
  const keptInBusiness = Number((earnedAllTime - profitTaken).toFixed(2));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {!embedded && <button onClick={() => nav("/")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Dashboard</button>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Profit</h1>
            <p className="text-[13px] text-muted-foreground">gross profit = sell − cost (expenses excluded)</p>
          </div>
        </div>
        <SegToggle value={period} onChange={(k) => setPeriod(k as PeriodKey)}
          options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} />
      </div>

      {/* Headline — real (collected) profit + cumulative curve */}
      <HeroBalance
        label={`Real profit — ${periodLabel}`}
        value={money(realProfit)}
        delta={realDelta}
        deltaSub={realDelta !== null ? `vs previous ${period === "today" ? "day" : period}` : `${pct(data?.realMargin)} margin · ${data?.realCount || 0} paid invoices`}
        color={realProfit < 0 ? CHART.red : CHART.emerald}
        trend={trend.length >= 2 ? trend : undefined}
      />

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger-children">
        <MetricCard icon={Percent} label="Real margin" accent={CHART.emerald}
          value={pct(data?.realMargin)} valueClassName="text-emerald-700"
          sub={`${data?.realCount || 0} of ${data?.invoiceCount || 0} invoices paid`} />
        <MetricCard icon={Clock} label={`Expected — ${periodLabel}`} accent={CHART.amber}
          value={money(expectedProfit)} valueClassName="text-amber-700"
          sub={`${pct(data?.expectedMargin)} margin · all ${data?.invoiceCount || 0} invoices`} />
        <MetricCard icon={Wallet} label="Awaiting collection" accent={CHART.slate}
          value={money(awaitingAmount)} valueClassName={awaitingAmount > 0.005 ? "text-amber-700" : "text-emerald-700"}
          sub={awaitingAmount > 0.005 ? `${unpaidCount} unpaid · ${money(awaitingProfit)} profit` : "everything collected"} />
      </div>

      {/* Material losses — the other side of profit. Gross profit is sales margin
          and always will be; this says what left the yard without being sold, so
          the two can be read together instead of one flattering the other. */}
      <div className="section-card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="section-heading">Material losses · {periodLabel}</h2>
          <span className="text-[11px] text-muted-foreground">
            short transfers, stock counts, damage
          </span>
        </div>
        {materialLosses === 0 && lossCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing lost in this period — every transfer arrived complete and no count came up short.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Gross profit</p>
                <p className="font-mono font-bold text-xl text-foreground mt-0.5 tracking-tight">{money(realProfit)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">real, collected</p>
              </div>
              <div className={cn("rounded-xl p-3", materialLosses > 0 ? "bg-red-500/5" : "bg-emerald-500/5")}>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Material lost</p>
                <p className={cn("font-mono font-bold text-xl mt-0.5 tracking-tight", materialLosses > 0 ? "text-red-700" : "text-emerald-700")}>
                  {materialLosses > 0 ? "− " : ""}{money(Math.abs(materialLosses))}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{lossCount} record{lossCount === 1 ? "" : "s"}</p>
              </div>
              <div className="rounded-xl bg-slate-500/5 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">After losses</p>
                <p className={cn("font-mono font-bold text-xl mt-0.5 tracking-tight", afterLosses < 0 ? "text-red-700" : "text-foreground")}>
                  {money(afterLosses)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">what the period really made</p>
              </div>
            </div>
            {Object.keys(lossesByKind).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(lossesByKind).map(([kind, v]: any) => (
                  <span key={kind} className="text-[11px] rounded-lg bg-muted/40 px-2 py-1">
                    {LOSS_LABEL[kind] || kind}: <b className="font-mono">{money(v)}</b>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          A count that finds <em>more</em> than expected nets against the losses — it is an
          earlier mistake correcting itself, not a gain.
        </p>
      </div>

      {/* Owner's profit share (all-time) — earned − owner drawings = retained. Read-only:
          withdrawals are recorded on Cash & Loans and never reduce earned profit. */}
      <div className="section-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-heading">Owner's profit share · all-time</h2>
          <Link href="/finance?tab=cash-loans" className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-700">
            <PiggyBank className="w-3.5 h-3.5" /> Record a withdrawal
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Total profit earned</p>
            <p className="font-mono font-bold text-xl text-foreground mt-0.5 tracking-tight">{money(earnedAllTime)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">real profit, all-time</p>
          </div>
          <div className="rounded-xl bg-purple-500/5 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Taken by owner</p>
            <p className="font-mono font-bold text-xl text-purple-700 mt-0.5 tracking-tight">− {money(profitTaken)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">owner drawings</p>
          </div>
          <div className="rounded-xl bg-emerald-500/5 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Kept in business</p>
            <p className="font-mono font-bold text-xl text-emerald-700 mt-0.5 tracking-tight">{money(keptInBusiness)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">retained profit</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">Taking profit doesn&apos;t reduce earned profit — it only moves cash out, like an owner drawing. Withdrawals are recorded on <span className="font-medium text-foreground">Cash &amp; Loans</span>.</p>
      </div>

      {/* Per-invoice drill-down */}
      <div className="section-card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 bg-muted/20"><h2 className="font-semibold text-sm">{periodLabel} invoices ({invoices.length})</h2></div>
        {invoices.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <div className="divide-y divide-border/30 max-h-[28rem] overflow-y-auto">
            {invoices.map((inv: any) => (
              <div key={inv.id}>
                <button onClick={() => setOpen(open === inv.id ? null : inv.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors">
                  <span className="text-muted-foreground text-xs">{open === inv.id ? "▾" : "▸"}</span>
                  <Link href={`/documents/${inv.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-blue-600 hover:underline text-sm">{inv.number}</Link>
                  <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded", inv.status === "paid" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>{inv.status}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1">{inv.customerName}</span>
                  <span className="font-mono text-sm tabular-nums">{money(inv.total)}</span>
                  <span className={cn("font-mono text-sm font-bold w-28 text-right tabular-nums", inv.status === "paid" ? "text-emerald-700" : "text-amber-600")}>{money(inv.profit)}</span>
                </button>
                {open === inv.id && (
                  <div className="px-4 pb-3 bg-muted/20">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground uppercase"><th className="text-left py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Sell</th><th className="text-right">Cost</th><th className="text-right">Profit</th></tr></thead>
                      <tbody>
                        {(inv.items || []).map((it: any, i: number) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="py-1">{it.description}</td>
                            <td className="text-right font-mono tabular-nums">{it.qty}</td>
                            <td className="text-right font-mono tabular-nums">{money(it.price)}</td>
                            <td className="text-right font-mono tabular-nums">{money(it.cost)}</td>
                            <td className="text-right font-mono font-semibold text-emerald-700 tabular-nums">{money(it.profit)}</td>
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

      {/* All-time reference */}
      {summary && (
        <Link href="/reports?tab=summary" className="section-card flex flex-wrap items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">All-time (every invoice)</p>
            <p className="text-sm mt-1">
              <span className="font-mono font-bold text-emerald-700">{money(summary.realProfit)}</span>
              <span className="text-muted-foreground text-xs"> real</span>
              <span className="text-muted-foreground mx-1.5">·</span>
              <span className="font-mono font-bold text-amber-700">{money(summary.expectedProfit ?? summary.totalProfit)}</span>
              <span className="text-muted-foreground text-xs"> expected</span>
              <span className="text-muted-foreground mx-1.5">·</span>
              <span className="text-muted-foreground text-xs">{summary.invoiceCount || 0} invoices</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">Full report <ArrowRight className="w-3.5 h-3.5" /></span>
        </Link>
      )}

      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Real</span> is profit already collected; <span className="font-semibold">Expected</span> is the ceiling if every unpaid invoice is also collected — both gross, before expenses.
      </p>
    </div>
  );
}
