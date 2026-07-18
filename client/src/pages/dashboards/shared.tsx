import { useQuery } from "@tanstack/react-query";

export const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;
export const todayStr = () => new Date().toISOString().slice(0, 10);

/** Fetch a list endpoint, ALWAYS resolving to an array. A 500/error returns an
    object ({message}), and calling .filter/.map on it white-screens the whole
    dashboard — this guard makes a broken endpoint degrade to empty, not crash. */
export async function fetchArray(url: string): Promise<any[]> {
  try {
    const j = await fetch(url).then((r) => r.json());
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

/** Full physical path from a product's location fields (skips empties). */
export function locPath(p: any, stores: any[]): string {
  return [
    p?.locationStoreId ? stores.find((s: any) => s.id === p.locationStoreId)?.nameEn : null,
    p?.locationArea, p?.locationRack, p?.locationShelf,
  ].filter(Boolean).join(" → ");
}

export function useStores() {
  return useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetchArray("/api/stores"),
    staleTime: 60_000,
  });
}

export function useLowStock() {
  return useQuery<any[]>({
    queryKey: ["/api/inventory/low-stock"],
    queryFn: () => fetchArray("/api/inventory/low-stock"),
    refetchInterval: 60_000,
  });
}

export function useDeliveries(params = "") {
  return useQuery<any[]>({
    queryKey: [`/api/deliveries${params}`],
    queryFn: () => fetchArray(`/api/deliveries${params}`),
    refetchInterval: 30_000,
  });
}

/** Simple stat card with drill-down link. */
export function Stat({ label, value, sub, href, tone = "default" }: {
  label: string; value: string; sub?: string; href?: string; tone?: "default" | "green" | "red" | "amber";
}) {
  const toneCls = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-[#1e2a3a]";
  const inner = (
    <div className="rounded-xl border bg-white p-3 hover:shadow-sm transition-shadow h-full">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-mono font-bold text-lg ${toneCls}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
  return href ? <a href={href} className="block">{inner}</a> : inner;
}
