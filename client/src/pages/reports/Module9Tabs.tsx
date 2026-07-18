import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";

const CHART_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

/* Reusable client-side sorting for report tables (Agent 4 — interactivity). */
function useSort<T>(rows: T[], initialKey: string, initialDir: "asc" | "desc" = "desc") {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a: any, b: any) => {
      const av = a[key], bv = b[key];
      const na = Number(av), nb = Number(bv);
      const bothNum = av !== "" && bv !== "" && !isNaN(na) && !isNaN(nb);
      const cmp = bothNum ? na - nb : String(av ?? "").localeCompare(String(bv ?? ""));
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, key, dir]);
  const toggle = (k: string) => { if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setKey(k); setDir("asc"); } };
  return { sorted, sortKey: key, sortDir: dir, toggle };
}

/* Sortable table header cell. */
function SortTh({ k, label, sortKey, sortDir, onSort, align = "left" }: {
  k: string; label: string; sortKey: string; sortDir: string; onSort: (k: string) => void; align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className={cn("px-2 py-2 select-none cursor-pointer hover:text-foreground", align === "right" ? "text-right" : "text-left")} onClick={() => onSort(k)}>
      <span className={cn("inline-flex items-center gap-1", active && "text-foreground font-bold")}>
        {label}<span className="text-[9px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </span>
    </th>
  );
}

/* Module 9 report tabs: Business Summary · Stock Movement · Aging · PDC · Expenses.
   Every tab: period presets + custom range, location filter, CSV export, print view. */

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Period = { start: string; end: string };
function preset(p: string): Period {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  switch (p) {
    case "week": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return { start: iso(d), end: iso(now) }; }
    case "month": return { start: iso(startOfMonth), end: iso(now) };
    case "last-month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: iso(s), end: iso(e) };
    }
    case "3m": { const d = new Date(now); d.setMonth(d.getMonth() - 3); return { start: iso(d), end: iso(now) }; }
    case "6m": { const d = new Date(now); d.setMonth(d.getMonth() - 6); return { start: iso(d), end: iso(now) }; }
    default: return { start: iso(startOfMonth), end: iso(now) };
  }
}

/** Shared filter bar: period presets + custom range + location + CSV + print. */
function FilterBar({ period, setPeriod, storeId, setStoreId, csvUrl, hidePeriod }: {
  period: Period; setPeriod: (p: Period) => void;
  storeId: string; setStoreId: (v: string) => void;
  csvUrl: string; hidePeriod?: boolean;
}) {
  const [mode, setMode] = useState("month");
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
    staleTime: 60_000,
  });
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {!hidePeriod && (
        <>
          <Select value={mode} onValueChange={(v) => { setMode(v); if (v !== "custom") setPeriod(preset(v)); }}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="last-month">Last month</SelectItem>
              <SelectItem value="3m">Last 3 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          {mode === "custom" && (
            <>
              <Input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} className="h-8 w-36 text-xs" />
              <Input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} className="h-8 w-36 text-xs" />
            </>
          )}
        </>
      )}
      <Select value={storeId} onValueChange={setStoreId}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All locations</SelectItem>
          {stores.filter((s: any) => s.active !== false).map((s: any) => (
            <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex gap-2">
        <a href={csvUrl}><Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> CSV</Button></a>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print</Button>
      </div>
    </div>
  );
}

const qsOf = (period: Period, storeId: string, extra = "") =>
  `start=${period.start}&end=${period.end}${storeId !== "all" ? `&storeId=${storeId}` : ""}${extra}`;

/* ── 1. Business Summary ─────────────────────────────────────── */
export function BusinessSummaryTab() {
  const [period, setPeriod] = useState<Period>(preset("month"));
  const [storeId, setStoreId] = useState("all");
  const qs = qsOf(period, storeId);
  const { data: s, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/business-summary", qs],
    queryFn: () => fetch(`/api/reports/business-summary?${qs}`).then((r) => r.json()),
  });
  const Row = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="flex justify-between text-sm px-3 py-2 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-semibold", tone)}>{value}</span>
    </div>
  );
  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} storeId={storeId} setStoreId={setStoreId}
        csvUrl={`/api/reports/business-summary?${qs}&format=csv`} />
      {isLoading || !s ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Visual charts (Agent 8) */}
          <section className="rounded-xl border p-3 md:col-span-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Daily sales — last 7 days</h3>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={s.dailySales || []} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v: any) => money(v)} labelFormatter={(l) => l} />
                <Bar dataKey="sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
          <section className="rounded-xl border p-3 md:col-span-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Sales by category</h3>
            {(s.salesByCategory || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No sales in period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={s.salesByCategory} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={72} innerRadius={38} paddingAngle={2}>
                    {(s.salesByCategory || []).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="rounded-xl border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-3 py-2 border-b bg-slate-50">Sales & Profit</h3>
            <Row label="Total sales" value={money(s.totalSales)} />
            <Row label="— Cash (collected)" value={money(s.cashSales)} tone="text-green-700" />
            <Row label="— Credit" value={money(s.creditSales)} tone="text-amber-600" />
            <Row label="— PDC" value={money(s.pdcSales)} />
            <Row label="Real profit" value={money(s.realProfit)} tone="text-green-700" />
            <Row label="Imaginary profit" value={`(${money(s.imaginaryProfit)})`} />
          </section>
          <section className="rounded-xl border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-3 py-2 border-b bg-slate-50">Customers & Credit</h3>
            <Row label="New customers (period)" value={String(s.newCustomers)} />
            <Row label="Returning customers" value={String(s.returningCustomers)} />
            <Row label="Credit customers (open balances)" value={String(s.creditCustomersCount)} />
            <Row label="Credit outstanding" value={money(s.creditOutstanding)} tone="text-red-600" />
          </section>
          <section className="rounded-xl border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-3 py-2 border-b bg-slate-50">Suppliers</h3>
            <Row label="Suppliers" value={String(s.suppliersCount)} />
            <Row label="Paid to suppliers (period)" value={money(s.totalPaidToSuppliers)} />
            <Row label="Owed (open payable PDCs)" value={money(s.owedToSuppliers)} tone="text-red-600" />
          </section>
          <section className="rounded-xl border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-3 py-2 border-b bg-slate-50">Returns & Cash</h3>
            <Row label="Customer returns" value={money(s.customerReturns)} />
            <Row label="Supplier returns" value={money(s.supplierReturns)} />
            <Row label="Net cash position" value={money(s.netCashPosition)} tone={Number(s.netCashPosition) < 0 ? "text-red-600" : "text-green-700"} />
            <Row label="— Hand / Bank / PDC in" value={`${money(s.cashInHand)} / ${money(s.bank)} / ${money(s.pdcPending)}`} />
          </section>
          <section className="rounded-xl border md:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-3 py-2 border-b bg-slate-50">Expenses by category — total {money(s.totalExpenses)}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {Object.entries(s.expensesByCategory || {}).map(([k, v]) => <Row key={k} label={k} value={money(v)} />)}
              {!Object.keys(s.expensesByCategory || {}).length && <p className="text-sm text-muted-foreground p-3">No expenses in period.</p>}
            </div>
          </section>

          {/* Recommended actions — the business-advisor layer */}
          <section className="rounded-xl border-2 border-amber-200 bg-amber-50/40 md:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 px-3 py-2 border-b border-amber-200">💡 Recommended actions</h3>
            <ul className="p-3 space-y-1.5">
              {(s.recommendedActions || []).map((a: string, i: number) => (
                <li key={i} className="text-sm flex gap-2"><span className="text-amber-500">▸</span>{a}</li>
              ))}
            </ul>
          </section>

          {/* Product intelligence */}
          <section className="rounded-xl border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-green-700 px-3 py-2 border-b bg-slate-50">Top products by profit</h3>
            {(s.topProducts || []).slice(0, 8).map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-sm px-3 py-1.5 border-b last:border-0">
                <span className="truncate">{p.name} <span className="text-muted-foreground text-xs">×{Number(p.qty)}</span></span>
                <span className="font-mono font-semibold text-green-700">{money(p.profit)}</span>
              </div>
            ))}
            {!(s.topProducts || []).length && <p className="text-sm text-muted-foreground p-3">No sales in period.</p>}
          </section>
          <section className="rounded-xl border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-red-600 px-3 py-2 border-b bg-slate-50">Worst 5 products (review pricing)</h3>
            {(s.worstProducts || []).map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-sm px-3 py-1.5 border-b last:border-0">
                <span className="truncate">{p.name}</span>
                <span className={cn("font-mono font-semibold", p.profit < 0 ? "text-red-600" : "text-amber-600")}>{money(p.profit)}</span>
              </div>
            ))}
            {!(s.worstProducts || []).length && <p className="text-sm text-muted-foreground p-3">—</p>}
          </section>

          <section className="rounded-xl border md:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-3 py-2 border-b bg-slate-50">Top customers this period</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {(s.topCustomers || []).slice(0, 10).map((c: any, i: number) => <Row key={i} label={c.name} value={money(c.value)} />)}
              {!(s.topCustomers || []).length && <p className="text-sm text-muted-foreground p-3">No customers in period.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ── 2. Stock Movement (Go-Live reconciliation) ──────────────── */
export function StockMovementTab() {
  const [period, setPeriod] = useState<Period>(preset("month"));
  const [storeId, setStoreId] = useState("all");
  const [search, setSearch] = useState("");
  const qs = qsOf(period, storeId);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/stock-movement", qs],
    queryFn: () => fetch(`/api/reports/stock-movement?${qs}`).then((r) => r.json()),
  });
  const [expanded, setExpanded] = useState<number | null>(null);
  const filtered = (data?.rows || []).filter((r: any) =>
    !search || String(r.name).toLowerCase().includes(search.toLowerCase()) || String(r.sku || "").toLowerCase().includes(search.toLowerCase()));
  const { sorted, sortKey, sortDir, toggle } = useSort<any>(filtered, "sold", "desc");
  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} storeId={storeId} setStoreId={setStoreId}
        csvUrl={`/api/reports/stock-movement?${qs}&format=csv`} />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter product / SKU…" className="h-8 w-64 text-xs print:hidden" />
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-6" />
                <SortTh k="name" label="Product" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh k="opening" label="Opening" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="received" label="Received" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="sold" label="Sold" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="returned" label="Returned" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="supplierReturns" label="Supplier Ret." sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                <SortTh k="closing" label="Closing" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any) => (
                <Fragment key={r.productId}>
                  <tr className="border-t hover:bg-slate-50/60 cursor-pointer" onClick={() => setExpanded(expanded === r.productId ? null : r.productId)}>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">{expanded === r.productId ? "▾" : "▸"}</td>
                    <td className="px-3 py-1.5"><span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">{r.sku} · {r.unit}</span></td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.opening}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-green-700">{r.received ? `+${r.received}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-red-600">{r.sold ? `−${r.sold}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.returned || "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.supplierReturns ? `−${r.supplierReturns}` : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold">{r.closing}</td>
                  </tr>
                  {expanded === r.productId && (
                    <tr className="bg-slate-50/70 border-t">
                      <td />
                      <td colSpan={7} className="px-3 py-2 text-xs font-mono text-slate-600">
                        Reconciliation: {r.opening} opening
                        {r.received ? ` + ${r.received} received` : ""}
                        {r.sold ? ` − ${r.sold} sold` : ""}
                        {r.returned ? ` + ${r.returned} returned` : ""}
                        {r.supplierReturns ? ` − ${r.supplierReturns} supplier ret.` : ""}
                        {r.otherAdjustments ? ` ${Number(r.otherAdjustments) >= 0 ? "+" : ""}${r.otherAdjustments} other` : ""}
                        {" = "}<span className="font-bold text-foreground">{r.closing} closing</span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!sorted.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No movement in period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── 3. Overdue Aging ────────────────────────────────────────── */
export function AgingTab() {
  const [storeId, setStoreId] = useState("all");
  const [search, setSearch] = useState("");
  const qs = storeId !== "all" ? `storeId=${storeId}` : "";
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/aging", storeId],
    queryFn: () => fetch(`/api/reports/aging?${qs}`).then((r) => r.json()),
  });
  const filteredRows = (data?.rows || []).filter((r: any) =>
    !search || String(r.customerName || "").toLowerCase().includes(search.toLowerCase()) || String(r.number || "").toLowerCase().includes(search.toLowerCase()));
  const { sorted, sortKey, sortDir, toggle } = useSort<any>(filteredRows, "daysOverdue", "desc");
  const BUCKET_STYLE: Record<string, string> = {
    current: "bg-slate-50 text-slate-600", "1-30": "bg-yellow-50 text-yellow-700",
    "31-60": "bg-amber-100 text-amber-700", "61-90": "bg-red-100 text-red-700", "90+": "bg-red-600 text-white",
  };
  return (
    <div className="space-y-4">
      <FilterBar hidePeriod period={preset("month")} setPeriod={() => {}} storeId={storeId} setStoreId={setStoreId}
        csvUrl={`/api/reports/aging?${qs}${qs ? "&" : ""}format=csv`} />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter customer / invoice…" className="h-8 w-64 text-xs print:hidden" />
      {isLoading || !data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(data.perBucket || {}).map(([b, v]: [string, any]) => (
              <div key={b} className={cn("rounded-lg p-2 text-center", BUCKET_STYLE[b])}>
                <p className="text-[10px] font-bold uppercase">{b === "current" ? "Current" : `${b} days`}</p>
                <p className="font-mono font-bold text-sm">{v.count}</p>
                <p className="text-[10px] font-mono">{money(v.total)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortTh k="number" label="Invoice" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortTh k="customerName" label="Customer" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortTh k="date" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortTh k="daysOverdue" label="Days" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                  <SortTh k="remaining" label="Remaining" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="right" />
                  <SortTh k="bucket" label="Bucket" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r: any) => (
                  <tr key={r.invoiceId} className="border-t hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-mono text-xs"><a href={`/documents/${r.invoiceId}`} className="text-blue-600 hover:underline">{r.number}</a></td>
                    <td className="px-3 py-1.5 truncate max-w-44">{r.customerName || "—"}</td>
                    <td className="px-2 py-1.5 text-xs">{r.date}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.daysOverdue}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{money(r.remaining)}</td>
                    <td className="px-2 py-1.5"><span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", BUCKET_STYLE[r.bucket])}>{r.bucket}</span></td>
                  </tr>
                ))}
                {!sorted.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nothing outstanding. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 4. PDC Report ───────────────────────────────────────────── */
export function PdcReportTab() {
  const [days, setDays] = useState("30");
  const [type, setType] = useState("all");
  const qs = `days=${days}${type !== "all" ? `&type=${type}` : ""}`;
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/pdc", qs],
    queryFn: () => fetch(`/api/reports/pdc?${qs}`).then((r) => r.json()),
  });
  const List = ({ title, block, tone }: { title: string; block: any; tone: string }) => (
    <section className="rounded-xl border">
      <h3 className={cn("text-xs font-bold uppercase tracking-wider px-3 py-2 border-b", tone)}>
        {title} — {block?.count ?? 0} cheques · {money(block?.total)}
      </h3>
      <div className="divide-y">
        {(block?.rows || []).map((r: any) => (
          <div key={r.id} className="flex items-center gap-2 text-sm px-3 py-1.5">
            <span className={cn("text-[10px] font-bold rounded px-1.5 py-0.5", r.type === "payable" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700")}>{r.type === "payable" ? "PAY" : "RCV"}</span>
            <span className="font-mono text-xs">{r.chequeNumber}</span>
            <span className="text-muted-foreground text-xs truncate flex-1">{r.who || r.customerName || ""} · {r.bankName}</span>
            <span className="text-xs">{r.chequeDate}</span>
            <span className="font-mono font-semibold">{money(r.amount)}</span>
          </div>
        ))}
        {!(block?.rows || []).length && <p className="text-sm text-muted-foreground p-3">None.</p>}
      </div>
    </section>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Next 7 days</SelectItem>
            <SelectItem value="14">Next 14 days</SelectItem>
            <SelectItem value="30">Next 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="receivable">Receivable</SelectItem>
            <SelectItem value="payable">Payable</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <a href={`/api/reports/pdc?${qs}&format=csv`}><Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> CSV</Button></a>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print</Button>
        </div>
      </div>
      {isLoading || !data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-3"><p className="text-[11px] uppercase text-muted-foreground">Receivable pending</p><p className="font-mono font-bold text-lg text-green-700">{money(data.receivablePending)}</p></div>
            <div className="rounded-xl border p-3"><p className="text-[11px] uppercase text-muted-foreground">Payable pending</p><p className="font-mono font-bold text-lg text-red-600">{money(data.payablePending)}</p></div>
          </div>
          <List title="⚠ Overdue (past cheque date)" block={data.overdue} tone="bg-red-50 text-red-700" />
          <List title={`Upcoming — next ${data.windowDays} days`} block={data.upcoming} tone="bg-slate-50 text-muted-foreground" />
        </>
      )}
    </div>
  );
}

/* ── 5. Expense Report ───────────────────────────────────────── */
export function ExpenseReportTab() {
  const [period, setPeriod] = useState<Period>(preset("month"));
  const [storeId, setStoreId] = useState("all");
  const qs = qsOf(period, storeId);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/expenses", qs],
    queryFn: () => fetch(`/api/reports/expenses?${qs}`).then((r) => r.json()),
  });
  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} storeId={storeId} setStoreId={setStoreId}
        csvUrl={`/api/reports/expenses?${qs}&format=csv`} />
      {isLoading || !data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border p-3"><p className="text-[11px] uppercase text-muted-foreground">Total</p><p className="font-mono font-bold text-lg text-rose-600">{money(data.totals?.total)}</p></div>
            <div className="rounded-xl border p-3"><p className="text-[11px] uppercase text-muted-foreground">Recurring</p><p className="font-mono font-bold text-lg">{money(data.totals?.recurring)}</p></div>
            <div className="rounded-xl border p-3"><p className="text-[11px] uppercase text-muted-foreground">One-time</p><p className="font-mono font-bold text-lg">{money(data.totals?.oneTime)}</p></div>
          </div>
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-right px-2 py-2">Entries</th>
                  <th className="text-right px-2 py-2">Recurring</th>
                  <th className="text-right px-2 py-2">One-time</th>
                  <th className="text-right px-3 py-2 font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.byCategory || {}).map(([k, v]: [string, any]) => (
                  <tr key={k} className="border-t hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium">{k}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{v.count}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(v.recurring)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(v.oneTime)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold">{money(v.total)}</td>
                  </tr>
                ))}
                {!Object.keys(data.byCategory || {}).length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No expenses in period.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
