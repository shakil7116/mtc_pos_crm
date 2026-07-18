import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Zap,
  FileText,
  Users,
  Package,
  Truck,
  BarChart2,
  MessageCircle,
  Settings2,
  LogOut,
  MoreHorizontal,
  PackageCheck,
  Receipt,
  Landmark,
  Wallet,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccess, type NavKey } from "@shared/permissions";
import { useOffline } from "@/lib/offline";

/* ─── Online / offline + sync-queue indicator (Bug 7) ──────── */
function OfflineIndicator() {
  const { online, pending, sync } = useOffline();
  const [syncing, setSyncing] = useState(false);
  const doSync = async () => { setSyncing(true); try { await sync(); } finally { setSyncing(false); } };
  if (online && pending === 0) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-400" title="Online — all data synced">
        <Wifi className="w-3.5 h-3.5" /> Online
      </span>
    );
  }
  return (
    <button
      onClick={doSync}
      disabled={!online || syncing}
      className={cn(
        "flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5",
        online ? "text-amber-300 bg-amber-500/15 hover:bg-amber-500/25" : "text-red-300 bg-red-500/15"
      )}
      title={online ? "Online — tap to sync queued sales" : "Offline — sales are queued and will sync automatically"}
    >
      {online ? (syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />) : <WifiOff className="w-3.5 h-3.5" />}
      {online ? "" : "Offline"}
      {pending > 0 && <span className="ml-0.5">{pending} pending</span>}
    </button>
  );
}

/* ─── nav items ───────────────────────────────────────────── */
type NavItem = {
  path: string;
  label: string;
  icon: React.ElementType;
  key: NavKey;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { path: "/quick-sale", label: "Quick Sale", icon: Zap, key: "documents" },
  { path: "/documents", label: "Documents", icon: FileText, key: "documents" },
  { path: "/customers", label: "Customers", icon: Users, key: "customers" },
  { path: "/inventory", label: "Inventory", icon: Package, key: "inventory" },
  { path: "/suppliers", label: "Suppliers", icon: Truck, key: "suppliers" },
  { path: "/reports", label: "Reports", icon: BarChart2, key: "reports" },
  { path: "/messages", label: "Messages", icon: MessageCircle, key: "messages" },
  { path: "/expenses", label: "Expenses", icon: Receipt, key: "expenses" },
  { path: "/finance", label: "Finance", icon: Wallet, key: "finance" },
  { path: "/pdc", label: "PDC Tracker", icon: Landmark, key: "pdc" },
  { path: "/approvals", label: "Approvals", icon: PackageCheck, key: "approvals" },
  { path: "/settings", label: "Settings", icon: Settings2, key: "settings" },
];

// Bottom nav shows only these 5 on mobile; rest go in overflow
const MOBILE_PINNED = ["/", "/documents", "/customers", "/inventory", "/reports"];

/* ─── helpers ─────────────────────────────────────────────── */
function isActive(path: string, location: string): boolean {
  if (path === "/") return location === "/";
  return location.startsWith(path);
}

/* ─── desktop sidebar link ────────────────────────────────── */
function SidebarLink({
  item,
  location,
  lowStock,
  pendingApprovals = 0,
  onClick,
}: {
  item: NavItem;
  location: string;
  lowStock: boolean;
  pendingApprovals?: number;
  onClick?: () => void;
}) {
  const active = isActive(item.path, location);
  const Icon = item.icon;
  return (
    <Link
      href={item.path}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors relative",
        active
          ? "bg-[#d4a017] text-white"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span>{item.label}</span>
      {item.path === "/inventory" && lowStock && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full" />
      )}
      {item.path === "/approvals" && pendingApprovals > 0 && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 min-w-5 h-5 px-1.5 flex items-center justify-center text-[11px] font-bold bg-amber-500 text-white rounded-full">
          {pendingApprovals}
        </span>
      )}
    </Link>
  );
}

/* ─── mobile bottom tab ───────────────────────────────────── */
function BottomTab({
  item,
  location,
  lowStock,
  pendingApprovals = 0,
}: {
  item: NavItem;
  location: string;
  lowStock: boolean;
  pendingApprovals?: number;
}) {
  const active = isActive(item.path, location);
  const Icon = item.icon;
  return (
    <Link
      href={item.path}
      title={item.label}
      aria-label={item.label}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 transition-colors relative",
        active ? "text-[#d4a017]" : "text-white/70"
      )}
    >
      {active && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#d4a017]" />
      )}
      {/* Icons-only on phones — labels overlapped at 375px. Bigger, clearer icons. */}
      <Icon className="w-6 h-6" />
      {item.path === "/inventory" && lowStock && (
        <span className="absolute top-2 right-[calc(50%-10px)] w-2 h-2 bg-red-500 rounded-full" />
      )}
      {item.path === "/approvals" && pendingApprovals > 0 && (
        <span className="absolute top-1 right-[calc(50%-16px)] min-w-4 h-4 px-1 flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full">
          {pendingApprovals}
        </span>
      )}
    </Link>
  );
}

/* ─── main Layout ─────────────────────────────────────────── */
export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [overflowOpen, setOverflowOpen] = useState(false);

  /* online/offline */
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  /* low-stock badge */
  const { data: lowStockItems } = useQuery<unknown[]>({
    queryKey: ["/api/inventory/low-stock"],
    queryFn: () =>
      fetch("/api/inventory/low-stock").then((r) => r.json()),
    staleTime: 60_000,
  });
  const lowStock = Array.isArray(lowStockItems) && lowStockItems.length > 0;

  /* pending-approvals badge (admin/manager only) */
  const canApprove = !!user && ["admin", "manager"].includes(user.role);
  const { data: allReturns } = useQuery<any[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetch("/api/returns").then((r) => r.json()).catch(() => []),
    enabled: canApprove,
    refetchInterval: 30_000,
  });
  const pendingApprovals = Array.isArray(allReturns)
    ? allReturns.filter((r) => r.status === "pending").length
    : 0;

  /* filter by role */
  const visibleItems = NAV_ITEMS.filter(
    (item) => user && canAccess(user.role, item.key)
  );

  const pinnedItems = visibleItems.filter((i) => MOBILE_PINNED.includes(i.path));
  const overflowItems = visibleItems.filter((i) => !MOBILE_PINNED.includes(i.path));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── Offline banner ─────────────────────────────────── */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 text-center text-sm py-1.5 font-medium">
          Offline Mode — changes sync when connected
        </div>
      )}

      {/* ── Desktop sidebar ────────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 z-40 shrink-0",
          "bg-[#1e2a3a] text-white"
        )}
        style={{ top: isOnline ? 0 : "2rem" }}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="font-bold text-xl tracking-tight text-white">
            MTC
          </div>
          <div className="text-xs text-white/60 leading-tight mt-0.5">
            Mamun M Trading
          </div>
        </div>

        {/* User badge */}
        {user && (
          <div className="px-5 py-3 border-b border-white/10">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
              <OfflineIndicator />
            </div>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium",
                user.role === "admin"
                  ? "bg-[#d4a017]/20 text-[#d4a017]"
                  : "bg-white/10 text-white/70"
              )}
            >
              {user.role}
            </span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {visibleItems.map((item) => (
            <SidebarLink
              key={item.path}
              item={item}
              location={location}
              lowStock={lowStock}
              pendingApprovals={pendingApprovals}
            />
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-4 border-t border-white/10 pt-3">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium w-full text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────── */}
      <main
        className={cn(
          "flex-1 min-h-screen overflow-auto",
          "md:ml-60",           // sidebar offset desktop
          "pb-20 md:pb-0",      // space for mobile bottom nav
          !isOnline && "mt-8"   // space for offline banner
        )}
      >
        {children}
      </main>

      {/* ── Mobile bottom nav ──────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1e2a3a] flex items-stretch border-t border-white/10">
        {pinnedItems.map((item) => (
          <BottomTab
            key={item.path}
            item={item}
            location={location}
            lowStock={lowStock}
            pendingApprovals={pendingApprovals}
          />
        ))}

        {/* Overflow button */}
        {overflowItems.length > 0 && (
          <div className="relative flex-1">
            <button
              onClick={() => setOverflowOpen((v) => !v)}
              title="More"
              aria-label="More"
              className="flex flex-col items-center justify-center gap-0.5 w-full py-2.5 text-white/70 relative"
            >
              <MoreHorizontal className="w-6 h-6" />
              {pendingApprovals > 0 && (
                <span className="absolute top-1 right-[calc(50%-16px)] min-w-4 h-4 px-1 flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full">
                  {pendingApprovals}
                </span>
              )}
            </button>

            {/* Overflow menu */}
            {overflowOpen && (
              <>
                {/* backdrop */}
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setOverflowOpen(false)}
                />
                <div className="absolute bottom-full right-0 mb-1 bg-[#1e2a3a] border border-white/10 rounded-xl shadow-xl z-40 w-44 py-1">
                  {overflowItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path, location);
                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        onClick={() => setOverflowOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "text-[#d4a017]"
                            : "text-white/80 hover:text-white hover:bg-white/10"
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {item.label}
                        {item.path === "/approvals" && pendingApprovals > 0 && (
                          <span className="ml-auto min-w-5 h-5 px-1.5 flex items-center justify-center text-[11px] font-bold bg-amber-500 text-white rounded-full">
                            {pendingApprovals}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                  <div className="border-t border-white/10 mt-1 pt-1">
                    <button
                      onClick={() => { setOverflowOpen(false); logout(); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors w-full"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}
