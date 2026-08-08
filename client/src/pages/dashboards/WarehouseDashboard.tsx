import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Warehouse, PackageOpen, AlertTriangle, Wrench, CheckCircle2, Truck, Plus } from "lucide-react";
import { useStores, useLowStock, useDeliveries, locPath, todayStr } from "./shared";
import TasksPanel from "@/components/TasksPanel";

const ISSUE_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  approved: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
};

/**
 * Warehouse Keeper Dashboard (Module 8A) — filtered to THEIR location only.
 * Incoming deliveries, low stock w/ location paths, maintenance issues,
 * pending deliveries to confirm + items to pick.
 */
export default function WarehouseDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const myStoreId = user?.storeId ?? null;

  const { data: stores = [] } = useStores();
  const myStore = stores.find((s: any) => s.id === myStoreId);

  const { data: lowStockAll = [] } = useLowStock();
  // Their location only (role isolation) — fall back to all if no store assigned.
  const lowStock = lowStockAll.filter((i: any) => !myStoreId || i.storeId === myStoreId);

  const { data: deliveriesAll = [] } = useDeliveries("");
  const deliveries = deliveriesAll.filter((d) => !myStoreId || d.storeId === myStoreId);
  const today = todayStr();
  const incomingToday = deliveries.filter((d) => d.date === today && d.deliveryStatus !== "delivered");
  // Warehouse's job is PICKING — only show deliveries still awaiting a pick. Once picked
  // it moves to the manager (authorise) then the driver (deliver); no longer warehouse's.
  const toPick = deliveries.filter((d) => (d.deliveryStatus || "pending_pick") === "pending_pick");

  const { data: issues = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouse-issues"],
    queryFn: () => fetch("/api/warehouse-issues").then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const myIssues = issues.filter((i) => (!myStoreId || i.storeId === myStoreId) && i.status !== "resolved");

  // Incoming purchase orders headed to this warehouse
  const { data: pos = [] } = useQuery<any[]>({
    queryKey: ["/api/supplier-orders"],
    queryFn: () => fetch("/api/supplier-orders").then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const incomingPos = pos.filter((p) => (!myStoreId || p.storeId === myStoreId) && ["sent", "partial"].includes(p.status));

  const pickMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/documents/${id}/pick`, { method: "POST" }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/deliveries"] }); toast({ title: "Items picked", description: "Manager notified to authorise." }); },
    onError: () => toast({ title: "Could not update", variant: "destructive" }),
  });

  // Log Issue lives on its own /maintenance route — dashboards are nav-only.
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
          <Warehouse className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">{myStore?.nameEn || "Warehouse"} — Keeper</h1>
          <p className="text-sm text-muted-foreground">{user?.name} · location-filtered view</p>
        </div>
      </header>

      {/* Tasks (warehouse manager assigns to warehouse staff) */}
      <TasksPanel />

      {/* Incoming deliveries expected today */}
      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
          <Truck className="w-3.5 h-3.5" /> Deliveries expected today ({incomingToday.length})
          {incomingPos.length > 0 && <span className="ml-2 normal-case font-normal">+ {incomingPos.length} incoming PO{incomingPos.length > 1 ? "s" : ""}</span>}
        </h2>
        {incomingToday.length === 0 && incomingPos.length === 0 && <p className="text-sm text-muted-foreground">Nothing expected today.</p>}
        <div className="space-y-2">
          {incomingToday.map((d) => (
            <Link key={d.id} href={`/documents/${d.id}`} className="block rounded-lg border p-2.5 hover:bg-slate-50">
              <div className="flex justify-between text-sm"><span className="font-medium">{d.customerName}</span><span className="text-muted-foreground">{d.number}</span></div>
              <p className="text-xs text-muted-foreground truncate">{(d.items || []).map((i: any) => `${Number(i.qty)}× ${i.description}`).join(", ")}</p>
            </Link>
          ))}
          {incomingPos.map((p) => (
            <div key={p.id} className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5 text-sm">
              <span className="font-medium">PO {p.poNumber}</span>
              <span className="text-xs text-muted-foreground ml-2">{p.status === "partial" ? "partially received" : "sent — awaiting arrival"}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Low stock with full location paths */}
      <section className="rounded-xl border border-red-200 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 flex items-center gap-1.5 mb-2">
          <AlertTriangle className="w-3.5 h-3.5" /> Low stock — my location ({lowStock.length})
        </h2>
        {lowStock.length === 0 && <p className="text-sm text-muted-foreground">All stock above minimum.</p>}
        <div className="space-y-1.5">
          {lowStock.map((i: any) => {
            const below = Math.max(0, Number(i.product?.minStockQty || 0) - Number(i.qty || 0));
            const path = locPath(i.product, stores);
            return (
              <Link key={i.id} href="/inventory" className="block rounded-lg bg-red-50/60 border border-red-100 px-3 py-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{i.product?.name}</span>
                  <span className="font-mono text-red-600">{Number(i.qty)} / min {Number(i.product?.minStockQty)} (−{below})</span>
                </div>
                {path && <p className="text-[11px] text-emerald-700">📍 {path}</p>}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Maintenance issues — header links to the dedicated page */}
      <section className="rounded-xl border p-4">
        <Link href="/maintenance" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2 hover:text-foreground">
          <Wrench className="w-3.5 h-3.5" /> Maintenance issues ({myIssues.length}) →
        </Link>
        {myIssues.length === 0 && <p className="text-sm text-muted-foreground">No open issues.</p>}
        <div className="space-y-1.5">
          {myIssues.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2">
              <span className="truncate flex-1">{i.description}</span>
              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${ISSUE_BADGE[i.status] || "bg-slate-100"}`}>{i.status}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pending deliveries to confirm + items to pick */}
      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
          <PackageOpen className="w-3.5 h-3.5" /> Deliveries — items to pick ({toPick.length})
        </h2>
        {toPick.length === 0 && <p className="text-sm text-muted-foreground">Nothing to pick.</p>}
        <div className="space-y-2">
          {toPick.map((d) => (
            <div key={d.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{d.customerName}</span>
                <Link href={`/documents/${d.id}`} className="text-blue-600 text-xs hover:underline">{d.number}</Link>
              </div>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {(d.items || []).map((i: any, idx: number) => (
                  <li key={idx}>• {Number(i.qty)} {i.unit || ""} — {i.description}</li>
                ))}
              </ul>
              <button
                onClick={() => { if (window.confirm(`Confirm all items for ${d.number} are picked and ready?`)) pickMut.mutate(d.id); }}
                className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Mark Picked
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Floating Log Issue — navigates to the dedicated /maintenance route */}
      <Link
        href="/maintenance"
        className="fixed bottom-20 right-4 md:bottom-6 z-40 flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold px-5 py-3.5 shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
      >
        <Wrench className="w-5 h-5" /> Log Issue
      </Link>
    </div>
  );
}
