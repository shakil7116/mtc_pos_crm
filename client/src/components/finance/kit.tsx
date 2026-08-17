import { type ReactNode } from "react";
import { Link } from "wouter";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

/* ────────────────────────────────────────────────────────────────
   Finance Kit — reusable "command-center" primitives.
   Trading/fintech vocabulary: headline number + trend, sparkline
   KPIs, delta badges, a range toggle. All colours are 500-shade hex
   that read on both light + dark chart surfaces; text uses semantic
   tokens so dark mode is automatic (no per-page overrides).
──────────────────────────────────────────────────────────────── */

// ── Formatting ──────────────────────────────────────────────────
export const money = (n: any) =>
  "QAR " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const compact = (n: any) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
};

// Chart palette — Tailwind 500 shades, safe in light + dark.
export const CHART = {
  emerald: "#10b981",
  blue: "#3b82f6",
  amber: "#f59e0b",
  purple: "#8b5cf6",
  red: "#ef4444",
  slate: "#94a3b8",
} as const;

// ── Range toggle ────────────────────────────────────────────────
export type RangeKey = "1W" | "1M" | "3M" | "1Y" | "All";
export const RANGES: RangeKey[] = ["1W", "1M", "3M", "1Y", "All"];

/** ISO start date for a range, or "" for All-time. */
export function rangeStart(key: RangeKey, today = new Date()): string {
  if (key === "All") return "";
  const d = new Date(today);
  if (key === "1W") d.setDate(d.getDate() - 7);
  else if (key === "1M") d.setMonth(d.getMonth() - 1);
  else if (key === "3M") d.setMonth(d.getMonth() - 3);
  else if (key === "1Y") d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export interface SegOption<T extends string> { key: T; label: string; icon?: any }

/** Generic segmented control — the pill-tab pattern used across finance. */
export function SegToggle<T extends string>({ value, options, onChange, size = "sm" }: {
  value: T; options: SegOption<T>[]; onChange: (v: T) => void; size?: "sm" | "xs";
}) {
  return (
    <div className="inline-flex gap-0.5 bg-muted/50 p-1 rounded-xl border border-border/40">
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.key;
        return (
          <button key={o.key} onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex items-center gap-1.5 font-semibold rounded-lg transition-all duration-150",
              size === "xs" ? "text-[11px] px-2.5 h-7" : "text-xs px-3 h-8",
              active
                ? "bg-card shadow-sm text-foreground border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50",
            )}>
            {Icon && <Icon className="w-3.5 h-3.5" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export function RangeToggle({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return <SegToggle value={value} onChange={onChange} size="xs"
    options={RANGES.map((k) => ({ key: k, label: k === "All" ? "All" : k }))} />;
}

// ── Delta badge ─────────────────────────────────────────────────
/** % change of current vs base. null when base is 0/unknown. */
export function pctDelta(current: number, base: number): number | null {
  if (!isFinite(current) || !isFinite(base) || base === 0) return null;
  return ((current - base) / Math.abs(base)) * 100;
}

/** Delta pill. `invert` flips the colour semantics (up = bad, e.g. debt). */
export function Delta({ value, invert = false, className }: { value: number | null; invert?: boolean; className?: string }) {
  if (value === null || !isFinite(value)) return null;
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums",
      good === null && "bg-muted text-muted-foreground",
      good === true && "bg-emerald-500/10 text-emerald-600",
      good === false && "bg-red-500/10 text-red-600",
      className,
    )}>
      <Icon className="w-3 h-3" />{Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ── Sparkline (hand-rolled inline SVG — light, no library) ───────
function sparkPath(data: number[], w = 100, h = 28, pad = 2) {
  if (data.length === 0) return { line: "", area: "" };
  const pts0 = data.length === 1 ? [data[0], data[0]] : data;
  const min = Math.min(...pts0), max = Math.max(...pts0);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / Math.max(1, pts0.length - 1);
  const pts = pts0.map((v, i) => [pad + i * stepX, pad + (1 - (v - min) / span) * (h - pad * 2)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1], first = pts[0];
  return { line, area: `${line} L${last[0].toFixed(1)},${h} L${first[0].toFixed(1)},${h} Z` };
}

export function Sparkline({ data, color = CHART.emerald, height = 28, className, strokeWidth = 1.5 }: {
  data: number[]; color?: string; height?: number; className?: string; strokeWidth?: number;
}) {
  const { line, area } = sparkPath(data, 100, height);
  if (!line) return <div style={{ height }} className={className} />;
  return (
    <svg viewBox={`0 0 100 ${height}`} width="100%" height={height} preserveAspectRatio="none"
      className={className} aria-hidden="true">
      <path d={area} fill={color} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Trend chart (Recharts area) ─────────────────────────────────
export interface TrendPoint { x: string; y: number }

function TrendTooltip({ active, payload, valueFormat }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as TrendPoint;
  const d = p.x ? new Date(p.x) : null;
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 shadow-md text-xs">
      {d && <p className="text-[10px] text-muted-foreground">{d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>}
      <p className="font-mono font-semibold text-foreground">{(valueFormat || money)(p.y)}</p>
    </div>
  );
}

export function TrendChart({ data, color = CHART.emerald, height = 120, valueFormat, id }: {
  data: TrendPoint[]; color?: string; height?: number; valueFormat?: (n: any) => string; id?: string;
}) {
  if (!data || data.length === 0) return <div style={{ height }} className="grid place-items-center text-xs text-muted-foreground/60">No data for this range</div>;
  const gid = `grad-${id || color.replace("#", "")}`;
  const ys = data.map((d) => d.y);
  const min = Math.min(...ys), max = Math.max(...ys);
  const pad = (max - min || Math.abs(max) || 1) * 0.12;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="x" hide />
          <YAxis domain={[min - pad, max + pad]} hide />
          <Tooltip content={<TrendTooltip valueFormat={valueFormat} />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="y" stroke={color} strokeWidth={2}
            fill={`url(#${gid})`} dot={false}
            activeDot={{ r: 3.5, fill: color, stroke: "hsl(var(--card))", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Metric card (label · big value · delta · sparkline) ─────────
export function MetricCard({
  icon: Icon, label, value, sub, delta, deltaInvert, spark, sparkColor = CHART.emerald,
  accent, active, onClick, href, valueClassName,
}: {
  icon?: any; label: string; value: ReactNode; sub?: ReactNode;
  delta?: number | null; deltaInvert?: boolean; spark?: number[]; sparkColor?: string;
  accent?: string; active?: boolean; onClick?: () => void; href?: string; valueClassName?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {Icon && <Icon className="w-3.5 h-3.5" style={accent ? { color: accent } : undefined} />}{label}
        </span>
        {delta !== undefined && <Delta value={delta ?? null} invert={deltaInvert} />}
      </div>
      <p className={cn("font-mono font-bold text-xl tracking-tight mt-1.5", valueClassName)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {spark && spark.length > 1 && <div className="mt-2"><Sparkline data={spark} color={sparkColor} height={26} /></div>}
    </>
  );
  const cls = cn(
    "stat-card text-left w-full block !p-4 transition-all",
    (onClick || href) && "cursor-pointer",
    active && "ring-1 ring-inset",
  );
  const style = active && accent ? ({ ["--tw-ring-color" as any]: accent }) : undefined;
  if (href) return <Link href={href} className={cls} style={style as any}>{body}</Link>;
  if (onClick) return <button onClick={onClick} className={cls} style={style as any}>{body}</button>;
  return <div className={cls} style={style as any}>{body}</div>;
}

// ── Hero balance (headline number + trend behind it) ────────────
export function HeroBalance({
  label, value, delta, deltaInvert, deltaSub, color = CHART.emerald, trend, valueFormat, children,
}: {
  label: string; value: ReactNode; delta?: number | null; deltaInvert?: boolean; deltaSub?: ReactNode;
  color?: string; trend?: TrendPoint[]; valueFormat?: (n: any) => string; children?: ReactNode;
}) {
  return (
    <div className="section-card !p-0 overflow-hidden">
      <div className="p-5 pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-semibold">{label}</p>
            <p className="font-mono font-bold text-[2rem] leading-tight tracking-tight mt-1 text-foreground">{value}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {delta !== undefined && <Delta value={delta ?? null} invert={deltaInvert} />}
              {deltaSub && <span className="text-xs text-muted-foreground">{deltaSub}</span>}
            </div>
          </div>
          {children}
        </div>
      </div>
      {trend && <TrendChart data={trend} color={color} height={110} valueFormat={valueFormat} />}
    </div>
  );
}

// ── Series helpers ──────────────────────────────────────────────
/** Sum dated deltas into a daily cumulative series, shifted so the last
 *  point equals `anchorEnd` (the true current balance). Truthful shape
 *  + endpoint even when opening balances aren't flows. */
export function anchoredCumulative(
  deltas: { date: string; net: number }[], anchorEnd: number, startFilter = "",
): TrendPoint[] {
  const byDay = new Map<string, number>();
  for (const d of deltas) {
    if (!d.date) continue;
    byDay.set(d.date, (byDay.get(d.date) || 0) + d.net);
  }
  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let run = 0;
  const raw = days.map(([date, net]) => ({ x: date, y: (run += net) }));
  const last = raw.length ? raw[raw.length - 1].y : 0;
  const shift = anchorEnd - last;
  const full = raw.map((p) => ({ x: p.x, y: Number((p.y + shift).toFixed(2)) }));
  const sliced = startFilter ? full.filter((p) => p.x >= startFilter) : full;
  // Always keep the true endpoint on screen.
  if (sliced.length === 0 && full.length) return [{ x: full[full.length - 1].x, y: anchorEnd }];
  return sliced;
}

/** Simple running total of dated deltas (no anchor) — e.g. cumulative outstanding. */
export function runningTotal(deltas: { date: string; net: number }[], startFilter = ""): TrendPoint[] {
  const byDay = new Map<string, number>();
  for (const d of deltas) {
    if (!d.date) continue;
    byDay.set(d.date, (byDay.get(d.date) || 0) + d.net);
  }
  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let run = 0;
  const full = days.map(([date, net]) => ({ x: date, y: Number((run += net).toFixed(2)) }));
  return startFilter ? full.filter((p) => p.x >= startFilter) : full;
}

// ── Status badge — dot + label, semantic colour, dark-safe ──────
const STATUS_TONE: Record<string, { dot: string; text: string; bg: string }> = {
  pending: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-500/10" },
  overdue: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-500/10" },
  deposited: { dot: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-500/10" },
  cleared: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-500/10" },
  bounced: { dot: "bg-red-600", text: "text-red-700", bg: "bg-red-500/15" },
  cancelled: { dot: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-500/10" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = STATUS_TONE[status] || STATUS_TONE.cancelled;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", t.bg, t.text, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />{status}
    </span>
  );
}

// ── Action button — labeled, semantic hover tint, crisp press ───
// Press feedback (subtle scale) comes from the global `button:active`
// rule in index.css; here we own the hover tint per tone.
const ACTION_TONE: Record<string, string> = {
  blue: "hover:bg-blue-500/10 hover:text-blue-600 hover:border-blue-500/30",
  green: "hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30",
  red: "hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30",
  amber: "hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/30",
  slate: "hover:bg-muted hover:text-foreground hover:border-border",
};

export function ActionButton({ icon: Icon, label, tone = "slate", onClick, title, disabled }: {
  icon?: any; label: string; tone?: keyof typeof ACTION_TONE; onClick?: () => void; title?: string; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} title={title || label} disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border/60 bg-card text-xs font-semibold text-muted-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none",
        ACTION_TONE[tone],
      )}>
      {Icon && <Icon className="w-3.5 h-3.5" />}{label}
    </button>
  );
}
