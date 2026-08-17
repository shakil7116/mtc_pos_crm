import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Bell,
  Wallet,
  Wifi,
  WifiOff,
  RefreshCw,
  Sun,
  Moon,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { canAccess, type NavKey } from "@shared/permissions";
import { useOffline } from "@/lib/offline";
import { useToast } from "@/hooks/use-toast";

function OfflineIndicator() {
  const { online, pending, sync } = useOffline();
  const [syncing, setSyncing] = useState(false);
  const doSync = async () => { setSyncing(true); try { await sync(); } finally { setSyncing(false); } };
  if (online && pending === 0) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/90" title="Online — all data synced">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Online
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

  { path: "/approvals", label: "Approvals", icon: PackageCheck, key: "approvals" },
  { path: "/settings", label: "Settings", icon: Settings2, key: "settings" },
];

const MOBILE_PINNED = ["/", "/documents", "/customers", "/inventory", "/reports"];

function isActive(path: string, location: string): boolean {
  if (path === "/") return location === "/";
  return location.startsWith(path);
}

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
        "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 relative",
        active
          ? "bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent text-amber-200 shadow-[inset_0_0_0_1px_rgba(212,160,23,0.2)]"
          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 hover:translate-x-0.5"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-amber-300 to-amber-500" />
      )}
      <Icon className={cn("w-[18px] h-[18px] shrink-0 transition-colors", active ? "text-amber-400 drop-shadow-[0_0_4px_rgba(212,160,23,0.4)]" : "text-slate-500 group-hover:text-slate-300")} />
      <span>{item.label}</span>
      {item.path === "/inventory" && lowStock && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
      {item.path === "/approvals" && pendingApprovals > 0 && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 min-w-5 h-5 px-1.5 flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full">
          {pendingApprovals}
        </span>
      )}
    </Link>
  );
}

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
        active ? "text-amber-400" : "text-slate-500"
      )}
    >
      {active && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-amber-400" />
      )}
      <Icon className={cn("w-5 h-5", active && "drop-shadow-[0_0_6px_rgba(212,160,23,0.4)]")} />
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

interface Notif {
  id: number;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string | null;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function NotificationBell() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const prevCountRef = useRef(0);

  const { data: notifs = [] } = useQuery<Notif[]>({
    queryKey: ["/api/notifications"],
    queryFn: () => fetch("/api/notifications").then((r) => r.json()).catch(() => []),
    refetchInterval: 15_000,
  });

  const unread = notifs.filter((n) => !n.isRead);

  useEffect(() => {
    if (prevCountRef.current > 0 && unread.length > prevCountRef.current) {
      const newest = unread[0];
      if (newest) toast({ title: newest.title, description: newest.message?.slice(0, 120) || "" });
    }
    prevCountRef.current = unread.length;
  }, [unread.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const markRead = useMutation({
    mutationFn: (id: number) => fetch(`/api/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => fetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const handleClick = useCallback((n: Notif) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
  }, [markRead]);

  const recent = notifs.slice(0, 20);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-white/[0.08] transition-all duration-150 relative"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full animate-pulse">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-[252px] top-[80px] w-[360px] max-h-[480px] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#0f1724] shadow-2xl z-[100]">
            <div className="sticky top-0 bg-[#0f1724] border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Notifications</span>
              {unread.length > 0 && (
                <button onClick={() => markAllRead.mutate()} className="text-[11px] text-amber-400 hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No notifications yet</div>
            ) : (
              recent.map((n) => (
                <Link
                  key={n.id}
                  href={n.link || "/approvals"}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors",
                    !n.isRead && "bg-amber-500/[0.06]"
                  )}
                >
                  <div className="mt-1 shrink-0">
                    {n.type === "approval_approved" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : n.type === "approval_rejected" ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Bell className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[12px] font-semibold truncate", n.isRead ? "text-slate-300" : "text-white")}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-500 ml-auto shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    {n.message && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>}
                    {n.link && n.link.startsWith("/documents/") && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-amber-400 font-semibold">
                        <ExternalLink className="w-3 h-3" /> Open invoice
                      </span>
                    )}
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0" />}
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [overflowOpen, setOverflowOpen] = useState(false);

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

  const { data: lowStockItems } = useQuery<unknown[]>({
    queryKey: ["/api/inventory/low-stock"],
    queryFn: () =>
      fetch("/api/inventory/low-stock").then((r) => r.json()),
    staleTime: 60_000,
  });
  const lowStock = Array.isArray(lowStockItems) && lowStockItems.length > 0;

  const canApprove = !!user && ["admin", "manager"].includes(user.role);
  const { data: allReturns } = useQuery<any[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetch("/api/returns").then((r) => r.json()).catch(() => []),
    enabled: canApprove,
    refetchInterval: 30_000,
  });
  const { data: allRequests } = useQuery<any[]>({
    queryKey: ["/api/approvals"],
    queryFn: () => fetch("/api/approvals").then((r) => r.json()).catch(() => []),
    enabled: canApprove,
    refetchInterval: 30_000,
  });
  const pendingApprovals =
    (Array.isArray(allReturns) ? allReturns.filter((r) => r.status === "pending").length : 0) +
    (Array.isArray(allRequests) ? allRequests.filter((r) => r.status === "pending").length : 0);

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && canAccess(user.role, item.key)
  );

  const pinnedItems = visibleItems.filter((i) => MOBILE_PINNED.includes(i.path));
  const overflowItems = visibleItems.filter((i) => !MOBILE_PINNED.includes(i.path));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 text-center text-xs py-1.5 font-semibold tracking-wide">
          OFFLINE MODE — changes sync when connected
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[240px] z-40 shrink-0",
          "text-white"
        )}
        style={{
          top: isOnline ? 0 : "2rem",
          background: "linear-gradient(180deg, hsl(217 50% 13%) 0%, hsl(222 52% 8%) 100%)",
        }}
      >
        {/* Ambient glow behind sidebar */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-60 h-60 rounded-full bg-amber-500/[0.04] blur-3xl" />
          <div className="absolute bottom-0 -right-10 w-40 h-40 rounded-full bg-blue-500/[0.03] blur-3xl" />
        </div>

        {/* Logo */}
        <div className="px-5 pt-5 pb-4 relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/25 ring-1 ring-amber-300/20">
              <span className="text-white font-extrabold text-base tracking-tight">M</span>
            </div>
            <div>
              <div className="font-extrabold text-[16px] tracking-tight text-white leading-none">MTC</div>
              <div className="text-[11px] text-slate-400 leading-tight mt-0.5 tracking-wide">Mamun M Trading</div>
            </div>
          </div>
        </div>

        {/* User badge */}
        {user && (
          <div className="mx-3 mb-3 px-3 py-2.5 rounded-xl relative"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/80 to-amber-700/80 flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-sm">
                {user.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-100 truncate leading-tight">{user.name}</p>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  user.role === "admin" ? "text-amber-400/90" : "text-slate-500"
                )}>
                  {user.role}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/[0.06]">
              <OfflineIndicator />
              <div className="flex-1" />
              <NotificationBell />
              <button
                onClick={toggleTheme}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-white/[0.08] transition-all duration-150"
                title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              >
                {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
              </button>
            </div>
          </div>
        )}

        {/* Section label */}
        <div className="mx-5 mb-2 mt-1 relative">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">Navigation</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-1 px-3 space-y-0.5 relative">
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
        <div className="px-3 pb-4 pt-2 relative space-y-1">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent mb-3" />
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium w-full text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150"
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={cn(
          "flex-1 min-h-screen overflow-auto",
          "md:ml-[240px]",
          "pb-20 md:pb-0",
          !isOnline && "mt-8"
        )}
      >
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0f1724]/95 backdrop-blur-lg flex items-stretch border-t border-white/[0.06]">
        {pinnedItems.map((item) => (
          <BottomTab
            key={item.path}
            item={item}
            location={location}
            lowStock={lowStock}
            pendingApprovals={pendingApprovals}
          />
        ))}

        {overflowItems.length > 0 && (
          <div className="relative flex-1">
            <button
              onClick={() => setOverflowOpen((v) => !v)}
              title="More"
              aria-label="More"
              className="flex flex-col items-center justify-center gap-0.5 w-full py-2.5 text-slate-500 relative"
            >
              <MoreHorizontal className="w-5 h-5" />
              {pendingApprovals > 0 && (
                <span className="absolute top-1 right-[calc(50%-16px)] min-w-4 h-4 px-1 flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full">
                  {pendingApprovals}
                </span>
              )}
            </button>

            {overflowOpen && (
              <>
                <div
                  className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
                  onClick={() => setOverflowOpen(false)}
                />
                <div className="absolute bottom-full right-0 mb-2 bg-[#0f1724] border border-white/[0.08] rounded-xl shadow-2xl z-40 w-48 py-1.5">
                  {overflowItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path, location);
                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        onClick={() => setOverflowOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors",
                          active
                            ? "text-amber-400"
                            : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {item.label}
                        {item.path === "/approvals" && pendingApprovals > 0 && (
                          <span className="ml-auto min-w-5 h-5 px-1.5 flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full">
                            {pendingApprovals}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                  <div className="border-t border-white/[0.06] mt-1 pt-1">
                    <button
                      onClick={() => { setOverflowOpen(false); logout(); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors w-full"
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
