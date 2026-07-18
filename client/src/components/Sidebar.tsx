import { Link, useLocation } from "wouter";
import { LayoutDashboard, FilePlus, Settings, History } from "lucide-react";
import { clsx } from "clsx";

export function Sidebar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/create", label: "New Invoice", icon: FilePlus },
    { href: "/settings", label: "Store Settings", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border h-screen flex flex-col no-print sticky top-0">
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-serif font-bold text-lg">I</span>
          </div>
          <h1 className="font-serif font-bold text-xl text-foreground tracking-tight">InvoicePro</h1>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href} className={clsx(
              "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group",
              isActive 
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <Icon className={clsx("w-5 h-5", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/50">
        <div className="bg-secondary/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground text-center">
            &copy; 2025 InvoicePro Inc.<br/>
            All rights reserved.
          </p>
        </div>
      </div>
    </aside>
  );
}
