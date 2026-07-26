// Role → module access. Single source of truth for nav gating (client) and
// route guards (client + server). Client-safe (no Drizzle imports).
// Editable from Settings in a later phase.

export const ROLES = ["admin", "manager", "warehouse", "warehouse_manager", "salesman", "salesman_helper", "driver"] as const;
export type Role = (typeof ROLES)[number];
export function normalizeRole(r?: string | null): Role {
  if (r === "staff") return "salesman"; // legacy alias
  return (ROLES as readonly string[]).includes(r || "") ? (r as Role) : "salesman";
}

export type NavKey =
  | "dashboard" | "documents" | "customers" | "inventory" | "suppliers"
  | "reports" | "messages" | "settings"
  | "deliveries" | "expenses" | "finance" | "maintenance" | "pdc" | "approvals";

// Which roles may access each module. Per MTC_MASTER_SPEC Module 10.
export const NAV_ACCESS: Record<NavKey, Role[]> = {
  dashboard:   ["admin", "manager", "warehouse", "warehouse_manager", "salesman", "salesman_helper", "driver"],
  documents:   ["admin", "manager", "salesman", "salesman_helper"],
  customers:   ["admin", "manager", "salesman", "salesman_helper"],
  inventory:   ["admin", "manager", "warehouse", "warehouse_manager", "salesman", "salesman_helper"],
  suppliers:   ["admin", "manager"],
  reports:     ["admin", "manager"],
  messages:    ["admin", "manager"],
  settings:    ["admin"],
  deliveries:  ["admin", "manager", "warehouse", "warehouse_manager", "driver"],
  expenses:    ["admin", "manager"],
  finance:     ["admin", "manager"],
  maintenance: ["admin", "manager", "warehouse", "warehouse_manager"],
  pdc:         ["admin", "manager"],
  approvals:   ["admin", "manager"],
};

export function canAccess(role: Role, key: NavKey): boolean {
  return (NAV_ACCESS[key] || []).includes(role);
}

// Route prefix → nav key, for guarding wouter routes and Express paths.
const PATH_NAV: { prefix: string; key: NavKey }[] = [
  { prefix: "/quick-sale", key: "documents" },
  { prefix: "/documents", key: "documents" },
  { prefix: "/finance", key: "finance" },
  { prefix: "/profit-today", key: "finance" },
  { prefix: "/credit-exposure", key: "reports" },
  { prefix: "/cash-position", key: "finance" },
  { prefix: "/cash-loans", key: "finance" },
  { prefix: "/customers", key: "customers" },
  { prefix: "/inventory", key: "inventory" },
  { prefix: "/suppliers", key: "suppliers" },
  { prefix: "/purchase-orders", key: "suppliers" },
  { prefix: "/reports", key: "reports" },
  { prefix: "/messages", key: "messages" },
  { prefix: "/settings", key: "settings" },
  { prefix: "/deliveries", key: "deliveries" },
  { prefix: "/expenses", key: "expenses" },
  { prefix: "/maintenance", key: "maintenance" },
  { prefix: "/pdc", key: "pdc" },
  { prefix: "/cheques", key: "pdc" },
  { prefix: "/approvals", key: "approvals" },
];

export function navKeyForPath(path: string): NavKey | null {
  if (path === "/") return "dashboard";
  const m = PATH_NAV.find((p) => path === p.prefix || path.startsWith(p.prefix + "/"));
  return m ? m.key : null;
}

// Landing route per role after login.
export const ROLE_HOME: Record<Role, string> = {
  admin: "/",
  manager: "/",
  warehouse: "/",
  warehouse_manager: "/",
  salesman: "/",
  salesman_helper: "/",
  // Driver lands on the dashboard until the dedicated deliveries page ships (later phase).
  // Keep this in sync with the routed pages so no role bounces to NotFound.
  driver: "/",
};

// Store business day (Phase 9): a day runs from the store's opening time to the
// next opening. A sale rung at 04:00 (before a 05:00 open) belongs to the PREVIOUS
// business day. Returns the business date (YYYY-MM-DD) for a given instant.
export function businessDate(now: Date = new Date(), openTime = "05:00"): string {
  const [oh, om] = String(openTime).split(":").map(Number);
  const openMinutes = (oh || 0) * 60 + (om || 0);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const d = new Date(now);
  if (nowMinutes < openMinutes) d.setDate(d.getDate() - 1); // before open → previous business day
  // local YYYY-MM-DD
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin / Owner",
  manager: "Manager",
  warehouse: "Warehouse Keeper",
  warehouse_manager: "Warehouse Manager",
  salesman: "Salesman",
  salesman_helper: "Helper Salesman",
  driver: "Driver",
};
