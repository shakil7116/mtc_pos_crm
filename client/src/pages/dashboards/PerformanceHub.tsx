import { memo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  RadialBar,
  RadialBarChart,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Bar,
  BarChart,
  Line,
  ComposedChart,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Wallet,
  CreditCard,
  AlertTriangle,
  PackageX,
  Radio,
  Star,
  Trophy,
  Package,
  MessageCircle,
  ArrowUpRight,
  MapPin,
  Users,
  Plus,
  Sun,
  Moon,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import TasksPanel from "@/components/TasksPanel";

/* ────────────────────────────────────────────────────────────
   Performance Hub — dynamic CEO dashboard, matched to the design.

   100% data-driven: every displayed value comes from the
   `PerformanceHubData` object. Colours / labels / icons are the only
   static config. Each widget is memoised so it re-renders on its own.

   Theme-aware day/night (in-header toggle, persisted, smooth). CORE
   fields match the backend contract; "(extension)" fields are optional
   series/captions the richer widgets use — rendered when present,
   gracefully degraded when absent.
──────────────────────────────────────────────────────────────── */

export type Severity = "high" | "medium" | "low";
export type ThemeMode = "day" | "night";
export type PerfTask = { title: string; date: string; assignee?: string };

export type PerformanceHubData = {
  performance_hub: {
    revenue_today: number;
    profit_today: number;
    cash_position: number;
    credit_exposure: number;
    target_percentage: number;
    trends?: { revenue?: number[]; profit?: number[]; cash?: number[]; credit?: number[] };
    /** small captions under each metric (extension) */
    captions?: { revenue?: string; profit?: string; cash?: string; credit?: string };
  };
  urgent_actions: {
    low_stock_count: number;
    aging_debts_total: number;
    low_stock_caption?: string;
    aging_caption?: string;
  };
  receivables_aging?: Array<{
    label: string;
    current?: number;
    d1_30?: number;
    d31_60?: number;
    d61_90?: number;
    d90_plus?: number;
  }>;
  payment_reminders: Array<{
    customer_name: string;
    customer_id?: number;
    invoices: number;
    outstanding: number;
    status_days: string;
    status_severity: Severity;
    phone?: string;
    /** pre-built WhatsApp statement text (extension) */
    message?: string;
    /** mini bar-spark of recent balances (extension) */
    trend?: number[];
  }>;
  inventory_alerts: Array<{ sku_name: string; product_id?: number; current_stock: number; min_stock: number; thumbnail_url?: string }>;
  location_overview?: {
    range_label?: string;
    totals?: { revenue?: number; gross?: number; profit?: number };
    stores: Array<{ name: string; revenue: number; cash?: number; profit?: number }>;
    trend?: Array<{ label: string; revenue: number; profit?: number }>;
    top_customers?: Array<{ name: string; revenue: number; photo_url?: string }>;
  };
  insights: {
    best_customer: { name: string; id?: number; spend: number; history_count: number; photo_url?: string; subtitle?: string };
    best_product: { name: string; id?: number; units_sold: number; trend?: number[]; tags?: string[]; margin?: number };
  };
  tasks: { done: PerfTask[]; in_progress: PerfTask[]; review: PerfTask[] };
};

/* ── helpers ─────────────────────────────────────────────── */
const fmtQAR = (n: number | undefined | null) =>
  `QAR ${Number(n ?? 0).toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (n: number | undefined | null) => Number(n ?? 0).toLocaleString("en-QA");
const toSeries = (arr?: number[]) => (arr ?? []).map((v, i) => ({ i, v }));
const slug = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const kFmt = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));

const chartTheme = (night: boolean) => ({
  grid: night ? "#1e293b" : "#e2e8f0",
  tick: night ? "#64748b" : "#94a3b8",
  tooltipBg: night ? "#0f172a" : "#ffffff",
  tooltipBorder: night ? "#1e293b" : "#e2e8f0",
  gaugeTrack: night ? "#1e293b" : "#e2e8f0",
});

const AGING = [
  { key: "current", label: "Current", color: "#22c55e" },
  { key: "d1_30", label: "1–30d", color: "#eab308" },
  { key: "d31_60", label: "31–60d", color: "#f59e0b" },
  { key: "d61_90", label: "61–90d", color: "#f97316" },
  { key: "d90_plus", label: "90+d", color: "#ef4444" },
] as const;

const SEV_BADGE: Record<Severity, string> = {
  high: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
  medium:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
  low: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
};

const CARD =
  "rounded-2xl border bg-white border-slate-200 shadow-sm transition-colors duration-500 " +
  "dark:bg-slate-900/60 dark:border-slate-800 dark:shadow-lg dark:shadow-black/20";
const SECTION_TITLE =
  "text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 transition-colors duration-500";
const CAP = "text-[11px] text-slate-400 dark:text-slate-500";

/* ── shared little controls ──────────────────────────────── */
function RangeToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { k: string; label: string }[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs dark:border-slate-700">
      {options.map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className={cn(
            "px-2.5 py-1 font-semibold transition-colors",
            value === o.k
              ? "bg-[#1e2a3a] text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MiniBars({ series }: { series: number[] }) {
  const max = Math.max(...series, 1);
  return (
    <div className="flex h-6 items-end gap-[3px]">
      {series.map((v, i) => (
        <div
          key={i}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          className={cn(
            "w-1 rounded-sm",
            i === series.length - 1 ? "bg-red-400" : "bg-slate-300 dark:bg-slate-600"
          )}
        />
      ))}
    </div>
  );
}

// Literal size classes only — Tailwind JIT can't see `h-${n}` template strings.
const AVATAR_SIZE: Record<number, string> = { 8: "h-8 w-8", 12: "h-12 w-12" };
function Avatar({ name, url, size = 8 }: { name: string; url?: string; size?: 8 | 12 }) {
  const cls = AVATAR_SIZE[size] ?? AVATAR_SIZE[8];
  if (url) return <img src={url} alt="" className={cn(cls, "shrink-0 rounded-full object-cover")} />;
  return (
    <span
      className={cn(
        cls,
        "grid shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      )}
    >
      {initials(name)}
    </span>
  );
}

/* ── Performance Hub metric (bare cell for the grouped panel) ── */
const HubMetric = memo(function HubMetric({
  id,
  label,
  value,
  caption,
  accent,
  icon,
  trend,
  href,
}: {
  id: string;
  label: string;
  value: string;
  caption?: string;
  accent: string;
  icon: React.ReactNode;
  trend?: number[];
  href?: string;
}) {
  const data = toSeries(trend);
  const gid = `spark-${slug(id)}`;
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span style={{ color: accent }} className="shrink-0">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
      {caption && <p className={cn(CAP, "truncate")}>{caption}</p>}
      <div className="mt-2 h-9">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={accent} strokeWidth={2} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-end">
            <div className="w-full border-b border-dashed border-slate-300 dark:border-slate-700" />
          </div>
        )}
      </div>
    </>
  );
  const cls = "block px-3 py-1 lg:first:pl-0";
  return href ? (
    <Link href={href} className={cn(cls, "rounded-lg transition-colors hover:bg-slate-100/70 dark:hover:bg-slate-800/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
});

const TargetGauge = memo(function TargetGauge({ pct, night }: { pct: number; night: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  const color = v >= 80 ? "#22c55e" : v >= 50 ? "#eab308" : "#ef4444";
  const data = [{ name: "target", value: v }];
  return (
    <div className="relative flex flex-col items-center justify-center px-3 lg:pl-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Profit vs. Target
      </p>
      <div className="relative mt-1 h-[130px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={data} startAngle={220} endAngle={-40}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: chartTheme(night).gaugeTrack }} dataKey="value" angleAxisId={0} cornerRadius={20} fill={color} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-50">{v}%</span>
          <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500">of target</span>
        </div>
      </div>
    </div>
  );
});

const UrgentBanner = memo(function UrgentBanner({ count }: { count: number }) {
  return (
    <Link href="/inventory?filter=low-stock" className="flex w-full items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/15">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400">
        <Radio className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-red-500 dark:text-red-400">
          Urgent Actions and Insights
        </p>
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          {fmtInt(count)} products low on stock
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-red-400" />
    </Link>
  );
});

const UrgentAction = memo(function UrgentAction({
  icon,
  label,
  value,
  caption,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption?: string;
  tone: "red" | "amber";
  href?: string;
}) {
  const inner = (
    <div className={cn(CARD, "p-4", href && "hover:border-slate-300 dark:hover:border-slate-700")}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span className={tone === "red" ? "text-red-500 dark:text-red-400" : "text-amber-500 dark:text-amber-400"}>{icon}</span>
        {label}
      </div>
      <p className={cn("mt-2 font-mono text-3xl font-bold tabular-nums", tone === "red" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-300")}>
        {value}
      </p>
      {caption && <p className={cn(CAP, "mt-0.5")}>{caption}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
});

const ReceivablesAging = memo(function ReceivablesAging({
  data,
  night,
}: {
  data: PerformanceHubData["receivables_aging"];
  night: boolean;
}) {
  const has = Array.isArray(data) && data.length > 0;
  const ct = chartTheme(night);
  return (
    <Link href="/customers?filter=credit-outstanding" className={cn(CARD, "block p-5")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={SECTION_TITLE}>Receivables Aging</h3>
        {has && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {AGING.map((b) => (
              <span key={b.key} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {has ? (
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={data!} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {AGING.map((b) => (
                <linearGradient key={b.key} id={`ag-${b.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={b.color} stopOpacity={0.7} />
                  <stop offset="100%" stopColor={b.color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={ct.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: ct.tick }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: ct.tick }} tickLine={false} axisLine={false} width={38} tickFormatter={kFmt} />
            <Tooltip
              contentStyle={{ background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}`, borderRadius: 12, fontSize: 12 }}
              formatter={(val: number, key) => [fmtQAR(val), AGING.find((a) => a.key === key)?.label ?? key]}
            />
            {AGING.map((b) => (
              <Area key={b.key} type="monotone" dataKey={b.key} stackId="1" stroke={b.color} strokeWidth={1.5} fill={`url(#ag-${b.key})`} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart hint="Provide receivables_aging[] to render the aging trend." />
      )}
    </Link>
  );
});

const PaymentReminders = memo(function PaymentReminders({ rows }: { rows: PerformanceHubData["payment_reminders"] }) {
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <div className="flex items-center justify-between px-5 py-3">
        <h3 className={SECTION_TITLE}>Customer Payment Reminders</h3>
        <Link href="/messages" className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400">Open Messages</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-500">
              <th className="px-5 py-2 text-left font-semibold">Customer</th>
              <th className="px-4 py-2 text-center font-semibold">Invoices</th>
              <th className="px-4 py-2 text-right font-semibold">Outstanding</th>
              <th className="hidden px-4 py-2 text-center font-semibold sm:table-cell">Status</th>
              <th className="px-5 py-2 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400 dark:text-slate-500">
                  No overdue payments. All caught up.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.customer_name}-${i}`} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.customer_name} />
                      {r.customer_id ? (
                        <Link href={`/customers/${r.customer_id}`} className="max-w-[180px] truncate font-semibold text-slate-900 hover:underline dark:text-slate-100">
                          {r.customer_name}
                        </Link>
                      ) : (
                        <span className="max-w-[180px] truncate font-semibold text-slate-900 dark:text-slate-100">{r.customer_name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-500 dark:text-slate-400">{r.invoices}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2.5">
                      {r.trend && r.trend.length > 1 && <MiniBars series={r.trend} />}
                      <span className="font-mono font-bold text-red-600 dark:text-red-400">{fmtQAR(r.outstanding)}</span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-center sm:table-cell">
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", SEV_BADGE[r.status_severity] ?? SEV_BADGE.low)}>
                      {r.status_days}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      {r.phone ? (
                        <a
                          href={`https://wa.me/${r.phone.replace(/\D/g, "")}${r.message ? `?text=${encodeURIComponent(r.message)}` : ""}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Remind
                        </a>
                      ) : (
                        <Link href="/messages" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
                          <MessageCircle className="h-3.5 w-3.5" /> Remind
                        </Link>
                      )}
                      <Link
                        href={r.customer_id ? `/customers/${r.customer_id}` : "/customers?filter=credit-outstanding"}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" /> Escalate
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const InventoryAlerts = memo(function InventoryAlerts({
  items,
  lowStockCount,
}: {
  items: PerformanceHubData["inventory_alerts"];
  lowStockCount: number;
}) {
  return (
    <div className={cn(CARD, "p-5")}>
      <div className="mb-3 flex items-center gap-2">
        <Package className="h-4 w-4 text-red-500 dark:text-red-400" />
        <h3 className={SECTION_TITLE}>Inventory Alerts</h3>
        <Link href="/inventory?filter=low-stock" className="ml-auto text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400">View all</Link>
      </div>
      <p className="font-mono text-2xl font-bold text-red-600 dark:text-red-400">{fmtInt(lowStockCount)}</p>
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">products at or below minimum stock</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((it, i) => (
          <Link
            key={`${it.sku_name}-${i}`}
            href={it.product_id ? `/inventory/${it.product_id}` : "/inventory?filter=low-stock"}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 transition-colors hover:border-sky-300 dark:border-slate-800 dark:bg-slate-800/30 dark:hover:border-sky-500/40"
          >
            {it.thumbnail_url ? (
              <img src={it.thumbnail_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                <Package className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{it.sku_name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-500">
                <span className={it.current_stock <= 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}>{fmtInt(it.current_stock)}</span>
                {" / "}
                {fmtInt(it.min_stock)} min
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
              Restock
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
});

const Insights = memo(function Insights({ insights, night }: { insights: PerformanceHubData["insights"]; night: boolean }) {
  const bc = insights.best_customer;
  const bp = insights.best_product;
  const spark = toSeries(bp.trend);
  return (
    <div className={cn(CARD, "p-5")}>
      <div className="mb-4 flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-500 dark:text-amber-400" />
        <h3 className={SECTION_TITLE}>Today's Insights</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Best customer */}
        <Link href={bc.id ? `/customers/${bc.id}` : "/customers"} className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/30 dark:hover:border-slate-700">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Best Customer</p>
          <div className="flex items-center gap-3">
            <Avatar name={bc.name} url={bc.photo_url} size={12} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{bc.name}</p>
              {bc.subtitle && <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{bc.subtitle}</p>}
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <Row label="Purchase history" value={`${fmtInt(bc.history_count)}`} />
            <Row label="Total spend" value={fmtQAR(bc.spend)} valueClass="text-emerald-600 dark:text-emerald-400" />
          </div>
        </Link>
        {/* Best product */}
        <Link href={bp.id ? `/inventory/${bp.id}` : "/inventory"} className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/30 dark:hover:border-slate-700">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Best Product</p>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/30 text-amber-600 dark:text-amber-200">
              <Trophy className="h-5 w-5" />
            </span>
            <p className="min-w-0 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{bp.name}</p>
          </div>
          {spark.length > 1 && (
            <div className="mt-2 h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="bp-spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={2} fill="url(#bp-spark)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(bp.tags ?? []).map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            <Row label="Units sold" value={`${fmtInt(bp.units_sold)}`} valueClass="text-sky-600 dark:text-sky-400" />
            {bp.margin != null && <Row label="Margin" value={fmtQAR(bp.margin)} />}
          </div>
        </Link>
      </div>
    </div>
  );
});

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400 dark:text-slate-500">{label}</span>
      <span className={cn("font-mono font-bold text-slate-700 dark:text-slate-200", valueClass)}>{value}</span>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/30">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className={cn("mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100", tone)}>{value}</p>
    </div>
  );
}

const LocationOverviewPanel = memo(function LocationOverviewPanel({
  data,
  night,
}: {
  data: PerformanceHubData["location_overview"];
  night: boolean;
}) {
  const [range, setRange] = useState("7d");
  const stores = data?.stores ?? [];
  const top = data?.top_customers ?? [];
  const totals = data?.totals;
  const maxCust = Math.max(...top.map((c) => c.revenue), 1);
  const has = stores.length > 0;
  const ct = chartTheme(night);
  return (
    <div className={cn(CARD, "p-5")}>
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
        <h3 className={SECTION_TITLE}>Location Overview</h3>
        <div className="ml-auto">
          <RangeToggle
            value={range}
            onChange={setRange}
            options={[{ k: "today", label: "Today" }, { k: "7d", label: "7 days" }, { k: "30d", label: "30 days" }]}
          />
        </div>
      </div>

      {has ? (
        <>
          {totals && (
            <div className="mb-4 grid grid-cols-3 gap-2">
              <StatTile label="Revenue" value={fmtQAR(totals.revenue)} />
              <StatTile label="Gross" value={fmtQAR(totals.gross)} tone="text-emerald-600 dark:text-emerald-400" />
              <StatTile label="Profit" value={fmtQAR(totals.profit)} tone="text-indigo-600 dark:text-indigo-400" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Revenue by store */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Revenue by store</p>
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={stores} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barSize={20}>
                  <CartesianGrid stroke={ct.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: ct.tick }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: ct.tick }} tickLine={false} axisLine={false} width={34} tickFormatter={kFmt} />
                  <Tooltip contentStyle={{ background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}`, borderRadius: 12, fontSize: 12 }} formatter={(v: number) => fmtQAR(v)} />
                  <Bar dataKey="revenue" stackId="a" fill="#38bdf8" />
                  <Bar dataKey="cash" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Top customers — avatar list */}
            <div>
              <p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <Users className="h-3 w-3" /> Top customers
              </p>
              {top.length === 0 ? (
                <EmptyChart hint="No customer data." small />
              ) : (
                <div className="space-y-2">
                  {top.slice(0, 5).map((c, i) => (
                    <div key={`${c.name}-${i}`} className="flex items-center gap-2.5">
                      <Avatar name={c.name} url={c.photo_url} />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{fmtQAR(c.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top customers — bar chart */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">By revenue</p>
              {top.length === 0 ? (
                <EmptyChart hint="No customer data." small />
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={top.slice(0, 5)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barSize={18}>
                    <CartesianGrid stroke={ct.grid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} tickFormatter={(s: string) => String(s).slice(0, 6)} />
                    <YAxis tick={{ fontSize: 10, fill: ct.tick }} tickLine={false} axisLine={false} width={34} tickFormatter={kFmt} />
                    <Tooltip contentStyle={{ background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}`, borderRadius: 12, fontSize: 12 }} formatter={(v: number) => fmtQAR(v)} />
                    <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="mt-3">
            <Link href="/reports?tab=locations" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              Full location report <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      ) : (
        <EmptyChart hint="Provide location_overview.stores[] to render this panel." />
      )}
    </div>
  );
});

const KANBAN = [
  { key: "done", label: "Done", dot: "bg-emerald-400", chip: "text-emerald-600 dark:text-emerald-400" },
  { key: "in_progress", label: "In Progress", dot: "bg-amber-400", chip: "text-amber-600 dark:text-amber-400" },
  { key: "review", label: "Review", dot: "bg-sky-400", chip: "text-sky-600 dark:text-sky-400" },
] as const;

const TaskBoard = memo(function TaskBoard({ tasks }: { tasks: PerformanceHubData["tasks"] }) {
  return (
    <div className={cn(CARD, "p-5")}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className={SECTION_TITLE}>Tasks — Team</h3>
        <button className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:hover:bg-sky-500/25">
          <Plus className="h-3.5 w-3.5" /> Assign task
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {KANBAN.map((col) => {
          const list = tasks[col.key] ?? [];
          return (
            <div key={col.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/20">
              <div className="mb-3 flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                <span className={cn("text-xs font-bold uppercase tracking-wider", col.chip)}>{col.label}</span>
                <span className="ml-auto text-xs font-semibold text-slate-400 dark:text-slate-500">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-600">No tasks.</p>
                ) : (
                  list.map((t, i) => (
                    <div key={`${t.title}-${i}`} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/70">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.title}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                        <span>{fmtDate(t.date)}</span>
                        {t.assignee && <span className="text-slate-500 dark:text-slate-400">{t.assignee}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function EmptyChart({ hint, small }: { hint: string; small?: boolean }) {
  return (
    <div className={cn("flex items-center justify-center rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-600", small ? "h-24" : "h-[210px]")}>
      <span className="max-w-[70%]">{hint}</span>
    </div>
  );
}

function ThemeToggle({ theme, onChange }: { theme: ThemeMode; onChange: (t: ThemeMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800/60">
      {([
        { key: "day" as const, icon: <Sun className="h-3.5 w-3.5" />, label: "Day" },
        { key: "night" as const, icon: <Moon className="h-3.5 w-3.5" />, label: "Night" },
      ]).map((o) => {
        const active = theme === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            title={`${o.label} mode`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
              active
                ? o.key === "day"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-900 text-sky-300"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const THEME_KEY = "perfhub-theme";
function readTheme(fallback: ThemeMode): ThemeMode {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(THEME_KEY);
  return v === "day" || v === "night" ? v : fallback;
}

/* ────────────────────────────────────────────────────────────
   Presentational root — pure over `data`, owns only theme state.
   `toolbarExtra` = app-specific header controls (store selector,
   user badge, mode switch); `dateLabel` = the header date line.
──────────────────────────────────────────────────────────── */
export function PerformanceHub({
  data,
  defaultTheme = "night",
  toolbarExtra,
  dateLabel,
}: {
  data: PerformanceHubData;
  defaultTheme?: ThemeMode;
  toolbarExtra?: React.ReactNode;
  dateLabel?: string;
}) {
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme(defaultTheme));
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  const night = theme === "night";
  const [hubRange, setHubRange] = useState("7d");

  const ph = data.performance_hub;
  const ua = data.urgent_actions;
  const cap = ph.captions ?? {};

  return (
    <div className={cn(night && "dark")}>
      <div className="min-h-screen bg-slate-100 p-4 text-slate-900 transition-colors duration-500 dark:bg-[#0a0f1a] dark:text-slate-100 md:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 transition-colors duration-500 dark:text-slate-50">Dashboard</h1>
              {dateLabel && <p className="text-sm text-slate-500">{dateLabel}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {toolbarExtra}
              <ThemeToggle theme={theme} onChange={setTheme} />
            </div>
          </div>

          <p className={SECTION_TITLE}>Daily Business Intelligence</p>

          {/* ── Performance Hub panel ── */}
          <div className={cn(CARD, "p-4")}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-sky-500 dark:text-sky-400" />
                <h2 className={SECTION_TITLE}>Performance Hub</h2>
              </div>
              <RangeToggle value={hubRange} onChange={setHubRange} options={[{ k: "7d", label: "7 days" }, { k: "30d", label: "30 days" }]} />
            </div>
            <div className="grid grid-cols-2 gap-y-3 lg:grid-cols-5 lg:divide-x lg:divide-slate-200 lg:dark:divide-slate-800">
              <HubMetric id="revenue" label="Today's Revenue" value={fmtQAR(ph.revenue_today)} caption={cap.revenue} accent="#38bdf8" icon={<TrendingUp className="h-3.5 w-3.5" />} trend={ph.trends?.revenue} href="/documents?type=INV&date=today" />
              <HubMetric id="profit" label="Profit Today" value={fmtQAR(ph.profit_today)} caption={cap.profit} accent="#22c55e" icon={<DollarSign className="h-3.5 w-3.5" />} trend={ph.trends?.profit} href="/finance?tab=profit&period=today" />
              <HubMetric id="cash" label="Cash Position" value={fmtQAR(ph.cash_position)} caption={cap.cash} accent="#2dd4bf" icon={<Wallet className="h-3.5 w-3.5" />} trend={ph.trends?.cash} href="/finance?tab=cash-position" />
              <HubMetric id="credit" label="Credit Exposure" value={fmtQAR(ph.credit_exposure)} caption={cap.credit} accent="#f87171" icon={<CreditCard className="h-3.5 w-3.5" />} trend={ph.trends?.credit} href="/customers?filter=credit-outstanding" />
              <TargetGauge pct={ph.target_percentage} night={night} />
            </div>
          </div>

          {/* ── Urgent banner ── */}
          <UrgentBanner count={ua.low_stock_count} />

          {/* ── Urgent actions + Receivables aging ── */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4">
              <h2 className={SECTION_TITLE}>Urgent Actions and Insights</h2>
              <UrgentAction icon={<PackageX className="h-3.5 w-3.5" />} label="Critical Low Stock" value={fmtInt(ua.low_stock_count)} caption={ua.low_stock_caption} tone="red" href="/inventory?filter=low-stock" />
              <UrgentAction icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Aging Debts" value={fmtQAR(ua.aging_debts_total)} caption={ua.aging_caption} tone="amber" href="/customers?filter=credit-outstanding" />
            </div>
            <div className="lg:col-span-2">
              <ReceivablesAging data={data.receivables_aging} night={night} />
            </div>
          </section>

          {/* ── Payment reminders ── */}
          <PaymentReminders rows={data.payment_reminders} />

          {/* ── Inventory alerts + Insights ── */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InventoryAlerts items={data.inventory_alerts} lowStockCount={ua.low_stock_count} />
            <Insights insights={data.insights} night={night} />
          </section>

          {/* ── Location overview ── */}
          <LocationOverviewPanel data={data.location_overview} night={night} />

          {/* ── Task board (interactive) ── */}
          <TasksPanel />

          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Container — fetches the contract and feeds the pure component.
──────────────────────────────────────────────────────────── */
export default function PerformanceHubPage() {
  const { data, isLoading, isError } = useQuery<PerformanceHubData>({
    queryKey: ["/api/dashboard/performance-hub"],
    queryFn: () => fetch("/api/dashboard/performance-hub").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 dark:bg-[#0a0f1a]">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-900" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-900" />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-500 dark:bg-[#0a0f1a] dark:text-slate-400">Unable to load the Performance Hub.</div>;
  }
  return <PerformanceHub data={data} />;
}
