import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState, lazy, Suspense, Component, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { canAccess, navKeyForPath, ROLE_HOME } from "@shared/permissions";
// Eager: the pre-auth / shell path that must render immediately.
import Onboarding from "@/pages/Onboarding";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import SetPin from "@/pages/SetPin";
// Lazy: every in-app page is its own chunk, loaded on demand. This keeps heavy
// libraries (recharts on Finance/Reports, the date-picker, etc.) out of the initial
// bundle — the login + dashboard now download a fraction of the old ~560KB gzip.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Documents = lazy(() => import("@/pages/Documents"));
const QuickSale = lazy(() => import("@/pages/QuickSale"));
const DocumentEditor = lazy(() => import("@/pages/DocumentEditor"));
const DocumentDetail = lazy(() => import("@/pages/DocumentDetail"));
const PurchaseOrderEditor = lazy(() => import("@/pages/PurchaseOrderEditor"));
const Customers = lazy(() => import("@/pages/Customers"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const ProductDetail = lazy(() => import("@/pages/ProductDetail"));
const Suppliers = lazy(() => import("@/pages/Suppliers"));
const SupplierLedger = lazy(() => import("@/pages/SupplierLedger"));
const Reports = lazy(() => import("@/pages/Reports"));
const Messages = lazy(() => import("@/pages/Messages"));
const Settings = lazy(() => import("@/pages/Settings"));
const Approvals = lazy(() => import("@/pages/Approvals"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const ChequeDetail = lazy(() => import("@/pages/ChequeDetail"));
const ProfitToday = lazy(() => import("@/pages/ProfitToday"));
const CashPosition = lazy(() => import("@/pages/CashPosition"));
const CreditExposure = lazy(() => import("@/pages/CreditExposure"));
const CashLoans = lazy(() => import("@/pages/CashLoans"));
const Maintenance = lazy(() => import("@/pages/Maintenance"));
const Finance = lazy(() => import("@/pages/Finance"));
const PickQueue = lazy(() => import("@/pages/PickQueue"));
const Assistant = lazy(() => import("@/pages/Assistant"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Shown briefly while a route's chunk downloads (usually a few hundred ms, once).
function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// With code-splitting, a client left open across a redeploy can request an old
// chunk hash that no longer exists (the server returns index.html → "failed to
// load module script"). Catch that and reload once to pull the fresh build,
// rather than showing a white screen. A sessionStorage flag prevents reload loops.
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    const msg = String((error as Error)?.message || error);
    const isChunkError = /dynamically imported module|module script|Importing a module|ChunkLoadError|Failed to fetch/i.test(msg);
    if (isChunkError && !sessionStorage.getItem("chunk-reloaded")) {
      sessionStorage.setItem("chunk-reloaded", "1");
      window.location.reload();
    }
  }
  componentDidMount() { sessionStorage.removeItem("chunk-reloaded"); }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <p className="text-sm text-muted-foreground">Couldn’t load this page.</p>
          <button onClick={() => window.location.reload()} className="rounded-lg bg-[#1e2a3a] text-white px-4 py-2 text-sm font-semibold">Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedApp() {
  const { user, loading } = useAuth();
  const [location, navigate] = useLocation();
  const [setupStatus, setSetupStatus] = useState<{ setupComplete: boolean; hasAdmin: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/setup/status")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setSetupStatus({ setupComplete: !!d.setupComplete, hasAdmin: !!d.hasAdmin }))
      .catch(() => setSetupStatus({ setupComplete: true, hasAdmin: true }));
  }, []);

  // Role-based route guard: if this role can't access the current module, bounce home.
  const navKey = navKeyForPath(location);
  const denied = Boolean(user && navKey && !canAccess(user.role, navKey));
  useEffect(() => {
    if (denied && user) navigate(ROLE_HOME[user.role] || "/");
  }, [denied, user, navigate]);

  if (loading || !setupStatus) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!setupStatus.setupComplete && !setupStatus.hasAdmin) return <Onboarding />;
  if (!user) return <Login />;
  if (user.mustChangePassword) return <Login />; // Login renders the forced change-password step
  if (user.mustChangePin) return <SetPin />;     // forced PIN reset before the app loads
  if (denied) return null; // redirecting

  return (
    <Layout>
      <ChunkErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/quick-sale" component={QuickSale} />
        <Route path="/documents" component={Documents} />
        <Route
          path="/documents/new"
          component={() => <DocumentEditor type="INV" />}
        />
        <Route
          path="/documents/new/:type"
          component={({ params }: { params: { type: string } }) => (
            <DocumentEditor type={params.type} />
          )}
        />
        <Route path="/purchase-orders/new" component={PurchaseOrderEditor} />
        <Route path="/documents/:id/edit" component={DocumentEditor} />
        <Route path="/documents/:id" component={DocumentDetail} />
        <Route path="/customers" component={Customers} />
        <Route path="/customers/:id" component={CustomerDetail} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/inventory/:id" component={ProductDetail} />
        <Route path="/suppliers/:id/ledger" component={SupplierLedger} />
        <Route path="/suppliers" component={Suppliers} />
        <Route path="/finance" component={Finance} />
        <Route path="/reports/finance" component={Finance} />
        <Route path="/reports" component={Reports} />
        <Route path="/messages" component={Messages} />
        <Route path="/pick-queue" component={PickQueue} />
        <Route path="/approvals" component={Approvals} />
        <Route path="/assistant" component={Assistant} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/cash-loans" component={() => <CashLoans />} />
        <Route path="/maintenance" component={Maintenance} />
        <Route path="/profit-today" component={() => <ProfitToday />} />
        <Route path="/cash-position" component={() => <CashPosition />} />
        <Route path="/credit-exposure" component={CreditExposure} />
        <Route path="/cheques/:id" component={ChequeDetail} />

        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
      </ChunkErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <ProtectedApp />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
