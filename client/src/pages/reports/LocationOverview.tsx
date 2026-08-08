import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { MapPin, TrendingUp, ArrowRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/* Per-location (store + warehouse) workflow view — revenue, cash actually
   collected, invoices, paid-vs-credit, expenses, returns and profit, plus a daily
   revenue trend. Reused in two places:
     • Reports → "Location Overview" tab   (<LocationOverview />)
     • Owner dashboard summary card         (<LocationOverview compact />)      */

type Range = "today" | "7d" | "30d";
const RANGE_LABEL: Record<Range, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

const fmtQAR = (n: any) =>
  `QAR ${Number(n || 0).toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (n: any) => {
  const v = Number(n || 0);
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
};
const shortName = (s: string) => String(s || "").split(/ [—-] /)[0].slice(0, 16);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function rangeDates(range: Range) {
  const end = new Date();
  const start = new Date();
  if (range === "7d") start.setDate(start.getDate() - 6);
  else if (range === "30d") start.setDate(start.getDate() - 29);
  return { start: ymd(start), end: ymd(end) };
}

type LocRow = {
  storeId: number | null; storeName: string; revenue: number; cogs: number; profit: number;
  invoiceCount: number; paidSales: number; creditSales: number;
  cashCollected: number; expenses: number; returns: number;
};

export default function LocationOverview({ compact = false }: { compact?: boolean }) {
  const [range, setRange] = useState<Range>("7d");
  const { start, end } = useMemo(() => rangeDates(range), [range]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/location-overview", start, end],
    queryFn: () => fetch(`/api/reports/location-overview?start=${start}&end=${end}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const allLocations: LocRow[] = data?.locations ?? [];
  const locations = compact ? allLocations.filter((l) => l.storeId !== null) : allLocations;
  const totals = data?.totals ?? {};
  const daily: any[] = data?.daily ?? [];
  const seriesKeys: { key: string; name: string }[] = data?.seriesKeys ?? [];
  const topCustomers: { customerId: number | null; name: string; revenue: number; invoices: number }[] = data?.topCustomers ?? [];
  const showTrend = daily.length > 1;

  const RangeToggle = (
    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
      {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={cn(
            "px-3 py-1.5 font-semibold transition-colors",
            range === r ? "bg-[#1e2a3a] text-white dark:bg-white dark:text-[#1e2a3a]" : "bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );

  /* ── Compact card for the owner dashboard ── */
  if (compact) {
    const custData = topCustomers.slice(0, 6);
    const maxCustRev = Math.max(...custData.map((c) => c.revenue), 1);

    return (
      <section className="bg-card rounded-2xl shadow-sm border border-border/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-indigo-600" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">Location Overview</h2>
          <div className="ml-auto flex items-center gap-2">
            {RangeToggle}
          </div>
        </div>

        {isLoading ? (
          <div className="h-40 animate-pulse bg-muted/40 rounded-lg" />
        ) : locations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No activity in this period.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Mini label="Revenue" value={fmtQAR(totals.revenue)} tone="slate" />
              <Mini label="Cash collected" value={fmtQAR(totals.cashCollected)} tone="green" />
              <Mini label="Profit" value={fmtQAR(totals.profit)} tone="indigo" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Store revenue — vertical bar */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Revenue by store</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={locations} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={22}>
                    <CartesianGrid vertical={false} stroke="#e1e0d9" strokeWidth={1} />
                    <XAxis dataKey="storeName" tickFormatter={shortName} tick={{ fontSize: 10, fill: "#898781" }} interval={0} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#898781" }} width={34} />
                    <Tooltip formatter={(v: any) => fmtQAR(v)} labelFormatter={shortName} />
                    <Bar dataKey="revenue" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top customers — horizontal bar (hand-drawn for tighter control) */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Top customers
                </p>
                {custData.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No customer data.</p>
                ) : (
                  <div className="space-y-2">
                    {custData.map((c) => {
                      const pct = (c.revenue / maxCustRev) * 100;
                      return (
                        <div key={c.customerId ?? c.name}>
                          <div className="flex items-center justify-between text-[11px] mb-0.5">
                            <span className="font-medium text-foreground truncate max-w-[55%]">{shortName(c.name)}</span>
                            <span className="font-mono text-muted-foreground tabular-nums">{fmtQAR(c.revenue)}</span>
                          </div>
                          <div className="h-3 bg-muted/50 rounded-sm overflow-hidden">
                            <div
                              className="h-full rounded-sm transition-all"
                              style={{ width: `${pct}%`, backgroundColor: COLORS[1] }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <Link
              href="/reports?tab=locations"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
            >
              Full location report <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        )}
      </section>
    );
  }

  /* ── Full report tab ── */
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-foreground">Location Overview</h2>
        </div>
        {RangeToggle}
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse bg-muted/40 rounded-xl" />
      ) : locations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No activity in this period.</div>
      ) : (
        <>
          {/* Company totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <Stat label="Revenue" value={fmtQAR(totals.revenue)} tone="slate" />
            <Stat label="Cash collected" value={fmtQAR(totals.cashCollected)} tone="green" />
            <Stat label="Credit sales" value={fmtQAR(totals.creditSales)} tone="amber" />
            <Stat label="Invoices" value={String(totals.invoiceCount ?? 0)} tone="slate" />
            <Stat label="Expenses" value={fmtQAR(totals.expenses)} tone="rose" />
            <Stat label="Returns" value={fmtQAR(totals.returns)} tone="rose" />
            <Stat label="Profit" value={fmtQAR(totals.profit)} tone="indigo" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Revenue by location</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={locations} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={22}>
                  <CartesianGrid vertical={false} stroke="#e1e0d9" strokeWidth={1} />
                  <XAxis dataKey="storeName" tickFormatter={shortName} tick={{ fontSize: 11, fill: "#898781" }} interval={0} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "#898781" }} width={40} />
                  <Tooltip formatter={(v: any) => fmtQAR(v)} labelFormatter={shortName} />
                  <Bar dataKey="revenue" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Daily revenue trend
              </p>
              {showTrend ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e1e0d9" strokeWidth={1} />
                    <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(5)} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v: any) => fmtQAR(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {seriesKeys.map((sk, i) => (
                      <Line key={sk.key} type="monotone" dataKey={sk.key} name={shortName(sk.name)}
                        stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                  Pick a 7 or 30-day range to see the trend.
                </div>
              )}
            </div>
          </div>

          {/* Per-location detail */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="font-semibold text-sm">Per-location breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-semibold">Location</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Revenue</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Cash in</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Inv</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Paid</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Credit</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Expenses</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Returns</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l, i) => (
                    <tr key={String(l.storeId)} className="border-t border-border/60 hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          {l.storeName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtQAR(l.revenue)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-green-700">{fmtQAR(l.cashCollected)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{l.invoiceCount}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtQAR(l.paidSales)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-700">{fmtQAR(l.creditSales)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-rose-600">{fmtQAR(l.expenses)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-rose-600">{fmtQAR(l.returns)}</td>
                      <td className={cn("px-3 py-2.5 text-right font-mono font-semibold", l.profit < 0 ? "text-red-600" : "text-indigo-700")}>
                        {fmtQAR(l.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  slate: "text-foreground", green: "text-green-700 dark:text-green-400", amber: "text-amber-700 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400", indigo: "text-indigo-700 dark:text-indigo-400",
};

function Stat({ label, value, tone = "slate" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <p className={cn("font-mono font-bold text-sm mt-0.5", TONE[tone])}>{value}</p>
    </div>
  );
}

function Mini({ label, value, tone = "slate" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <p className={cn("font-mono font-bold text-xs mt-0.5", TONE[tone])}>{value}</p>
    </div>
  );
}
