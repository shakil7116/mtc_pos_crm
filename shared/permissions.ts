export const ROLES = ["admin", "manager", "worker", "salesman", "driver"] as const;
export type Role = (typeof ROLES)[number];
export function normalizeRole(r?: string | null): Role {
  if (r === "staff") return "salesman";
  if (r === "helper" || r === "salesman_helper") return "worker";
  if (r === "warehouse" || r === "warehouse_manager") return "worker";
  return (ROLES as readonly string[]).includes(r || "") ? (r as Role) : "salesman";
}

export type NavKey =
  | "dashboard" | "documents" | "customers" | "inventory" | "suppliers"
  | "reports" | "messages" | "settings"
  | "deliveries" | "expenses" | "finance" | "maintenance" | "approvals";

export const NAV_ACCESS: Record<NavKey, Role[]> = {
  dashboard:   ["admin", "manager", "worker", "salesman", "driver"],
  documents:   ["admin", "manager", "worker", "salesman"],
  customers:   ["admin", "manager", "worker", "salesman"],
  inventory:   ["admin", "manager", "worker", "salesman"],
  suppliers:   ["admin", "manager", "salesman"],
  reports:     ["admin", "manager", "salesman"],
  messages:    ["admin", "manager", "salesman"],
  settings:    ["admin"],
  deliveries:  ["admin", "manager", "worker", "driver"],
  expenses:    ["admin", "manager", "worker", "salesman"],
  finance:     ["admin", "manager", "salesman"],
  maintenance: ["admin", "manager", "worker"],
  approvals:   ["admin", "manager", "worker", "salesman"],
};

export function canAccess(role: Role, key: NavKey): boolean {
  return (NAV_ACCESS[key] || []).includes(role);
}

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
  { prefix: "/cheques", key: "finance" },
  { prefix: "/approvals", key: "approvals" },
];

export function navKeyForPath(path: string): NavKey | null {
  if (path === "/") return "dashboard";
  const m = PATH_NAV.find((p) => path === p.prefix || path.startsWith(p.prefix + "/"));
  return m ? m.key : null;
}

export const ROLE_HOME: Record<Role, string> = {
  admin: "/",
  manager: "/",
  worker: "/",
  salesman: "/",
  driver: "/",
};

export function businessDate(now: Date = new Date(), openTime = "05:00"): string {
  const [oh, om] = String(openTime).split(":").map(Number);
  const openMinutes = (oh || 0) * 60 + (om || 0);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const d = new Date(now);
  if (nowMinutes < openMinutes) d.setDate(d.getDate() - 1);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin / Owner",
  manager: "Manager",
  worker: "General Worker",
  salesman: "Salesman",
  driver: "Driver",
};
