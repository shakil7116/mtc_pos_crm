import { useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { Wallet, TrendingUp, Landmark, ScrollText, ArrowLeft } from "lucide-react";
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
        <button onClick={() => nav("/")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"><ArrowLeft className="w-4 h-4" /> Dashboard</button>
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <span className="text-xs text-muted-foreground ml-1">money management — cash, bank, profit, loans, cheques</span>
        </div>
        <div className="flex flex-wrap gap-1.5 bg-muted/50 p-1.5 rounded-xl">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => go(t.key)}
                className={cn("flex items-center gap-1.5 text-xs font-semibold px-3 h-8 rounded-lg transition-colors",
                  tab === t.key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
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
