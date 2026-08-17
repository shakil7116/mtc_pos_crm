import { useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { Wallet, TrendingUp, Landmark, ScrollText } from "lucide-react";
import CashPosition from "./CashPosition";
import ProfitToday from "./ProfitToday";
import CashLoans from "./CashLoans";
import PdcTracker from "./PdcTracker";

type Tab = "cash-position" | "profit" | "cash-loans" | "cheques";
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "cash-position", label: "Cash Position", icon: Wallet },
  { key: "profit", label: "Profit", icon: TrendingUp },
  { key: "cash-loans", label: "Cash & Loans", icon: Landmark },
  { key: "cheques", label: "Cheques (PDC)", icon: ScrollText },
];

/* Finance — dedicated MONEY-MANAGEMENT hub (top-level /finance nav item).
   4 tabs: Cash Position · Profit · Cash & Loans · Cheques. The tab is driven by
   ?tab= so a sidebar click and a dashboard-widget click land on the identical
   page/tab. Each tab embeds its full dedicated page. */
export default function Finance() {
  const [, nav] = useLocation();
  const search = useSearch(); // reactive to ?tab= changes (dashboard deep-links)
  const raw = new URLSearchParams(search).get("tab") || "cash-position";
  const tab: Tab = (TABS.some((t) => t.key === raw) ? raw : "cash-position") as Tab;

  // Switching a tab updates the URL so the state is shareable/back-button-safe and
  // matches exactly what a dashboard widget links to. Preserve other params (type/due).
  const go = (key: Tab) => {
    const p = new URLSearchParams(search);
    p.set("tab", key);
    nav(`/finance?${p.toString()}`);
  };

  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
            <span className="text-[13px] text-muted-foreground">money management — cash, bank, profit, loans, cheques</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 bg-muted/40 p-1.5 rounded-xl border border-border/30">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => go(t.key)}
                className={cn("flex items-center gap-1.5 text-xs font-semibold px-3.5 h-8 rounded-lg transition-all duration-150",
                  tab === t.key ? "bg-card shadow-sm text-foreground border border-border/50" : "text-muted-foreground hover:text-foreground hover:bg-card/60")}>
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1">
        {tab === "cash-position" && <CashPosition embedded />}
        {tab === "profit" && <ProfitToday embedded />}
        {tab === "cash-loans" && <CashLoans embedded />}
        {/* Keyed on the search string: a dashboard link that changes &type=/&due=
            remounts the embedded tracker so it re-reads the filter (council D1). */}
        {tab === "cheques" && <PdcTracker key={`ch-${search}`} embedded />}
      </div>
    </div>
  );
}
