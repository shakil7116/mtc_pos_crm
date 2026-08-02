import { PerformanceHub, type PerformanceHubData } from "./PerformanceHub";

/* TEMPORARY preview harness — sample payload so every widget (incl. the
   optional series/captions) renders exactly as it ships. Delete this file +
   its route once the real /api/dashboard/performance-hub endpoint is wired.
   Nothing here is used by the production app. */

const SAMPLE: PerformanceHubData = {
  performance_hub: {
    revenue_today: 1800.0,
    profit_today: 385.0,
    cash_position: 45768.5,
    credit_exposure: 6817.0,
    target_percentage: 85,
    trends: {
      revenue: [900, 1100, 1000, 1350, 1200, 1600, 1800],
      profit: [180, 240, 210, 300, 260, 340, 385],
      cash: [42000, 43200, 41800, 44500, 45100, 45600, 45768],
      credit: [8200, 7800, 7400, 7100, 6900, 6850, 6817],
    },
    captions: {
      revenue: "all locations",
      profit: "real · w/ credit QAR 515.60",
      cash: "hand QAR 43,593.00 · bank QAR 2,175.50",
      credit: "4 unpaid invoices",
    },
  },
  urgent_actions: {
    low_stock_count: 11,
    aging_debts_total: 0.0,
    low_stock_caption: "at / below minimum stock",
    aging_caption: "on-account, not yet collected",
  },
  receivables_aging: [
    { label: "Mar", current: 3200, d1_30: 1800, d31_60: 900, d61_90: 400, d90_plus: 200 },
    { label: "Apr", current: 3600, d1_30: 2100, d31_60: 1100, d61_90: 500, d90_plus: 300 },
    { label: "May", current: 4100, d1_30: 2400, d31_60: 1300, d61_90: 700, d90_plus: 500 },
    { label: "Jun", current: 3900, d1_30: 2600, d31_60: 1500, d61_90: 900, d90_plus: 700 },
    { label: "Jul", current: 4400, d1_30: 2800, d31_60: 1700, d61_90: 1100, d90_plus: 950 },
    { label: "Aug", current: 4700, d1_30: 3100, d31_60: 2000, d61_90: 1300, d90_plus: 1200 },
  ],
  payment_reminders: [
    { customer_name: "AHMED CONSTRUCTION", invoices: 6, outstanding: 4472.3, status_days: "152 overdue", status_severity: "high", trend: [10, 14, 12, 20, 16, 24] },
    { customer_name: "ARC INTERIOR", invoices: 2, outstanding: 182.0, status_days: "122 overdue", status_severity: "high", trend: [6, 9, 7, 11, 8, 13] },
    { customer_name: "FARHAN TRADING", invoices: 1, outstanding: 120.0, status_days: "70 overdue", status_severity: "medium", trend: [4, 6, 5, 3, 7, 5] },
    { customer_name: "ARAFAT HOSSAIN RAIPUR", invoices: 1, outstanding: 480.0, status_days: "Running", status_severity: "low", trend: [8, 6, 9, 7, 10, 9] },
  ],
  inventory_alerts: [
    { sku_name: "1.5MM CABLE 100M ROLL (DUCAB)", current_stock: 1, min_stock: 10 },
    { sku_name: "Angle Grinder 4 INCH (MAKITA)", current_stock: 2, min_stock: 8 },
    { sku_name: "Angle Valve 2 (Valves)", current_stock: 0, min_stock: 12 },
    { sku_name: "Cement Sand 50KG", current_stock: 3, min_stock: 20 },
  ],
  location_overview: {
    range_label: "7 days",
    totals: { revenue: 4490, gross: 7903, profit: 1230 },
    stores: [
      { name: "Store 1", revenue: 42000, cash: 18000, profit: 9200 },
      { name: "Cash", revenue: 31000, cash: 24000, profit: 7100 },
      { name: "Profit", revenue: 27000, cash: 15000, profit: 6400 },
    ],
    trend: [
      { label: "Mon", revenue: 3800 },
      { label: "Tue", revenue: 4200 },
      { label: "Wed", revenue: 3600 },
      { label: "Thu", revenue: 4800 },
      { label: "Fri", revenue: 5200 },
      { label: "Sat", revenue: 4490 },
    ],
    top_customers: [
      { name: "ARAFAT HOSSAIN K", revenue: 4200 },
      { name: "AHMED CONSTRUCTION", revenue: 2600 },
      { name: "ARC INTERIOR", revenue: 1900 },
      { name: "FARHAN TRADING", revenue: 1500 },
    ],
  },
  insights: {
    best_customer: {
      name: "ARAFAT HOSSAIN RAIPUR",
      spend: 180.0,
      history_count: 13855,
      subtitle: "today's top customer",
    },
    best_product: {
      name: "1.5MM CABLE 100M ROLL (DUCAB)",
      units_sold: 15,
      trend: [4, 6, 5, 8, 7, 10, 15],
      tags: ["Slow Moving Stock", "Highest Margin"],
      margin: 5376,
    },
  },
  tasks: {
    done: [{ title: "Check the damaged gypsum board", date: "2026-08-05", assignee: "Warehouse" }],
    in_progress: [{ title: "Angle the ahmed deliver", date: "2024-08-01", assignee: "Warehouse" }],
    review: [{ title: "Deliver the ahmed deliver", date: "2024-08-03", assignee: "Store" }],
  },
};

export default function PerformanceHubDemo() {
  // Mirror of the real Hub header (store selector + user badge + Classic↔Hub
  // switch, from Dashboard.tsx) so the preview shows exactly what ships.
  const toolbar = (
    <>
      <span className="cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
        🌍 All locations ▾
      </span>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        Shakil · <span className="capitalize">admin</span>
      </span>
      <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
        <button className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Classic</button>
        <button className="rounded-full bg-[#1e2a3a] px-2.5 py-1 text-xs font-semibold text-white">Performance Hub</button>
      </div>
    </>
  );
  return <PerformanceHub data={SAMPLE} toolbarExtra={toolbar} dateLabel="Saturday, 1 August 2026" />;
}
