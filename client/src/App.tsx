import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { canAccess, navKeyForPath, ROLE_HOME } from "@shared/permissions";
import Onboarding from "@/pages/Onboarding";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import SetPin from "@/pages/SetPin";
import Dashboard from "@/pages/Dashboard";
import Documents from "@/pages/Documents";
import QuickSale from "@/pages/QuickSale";
import DocumentEditor from "@/pages/DocumentEditor";
import DocumentDetail from "@/pages/DocumentDetail";
import PurchaseOrderEditor from "@/pages/PurchaseOrderEditor";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Inventory from "@/pages/Inventory";
import ProductDetail from "@/pages/ProductDetail";
import Suppliers from "@/pages/Suppliers";
import SupplierLedger from "@/pages/SupplierLedger";
import Reports from "@/pages/Reports";
import Messages from "@/pages/Messages";
import Settings from "@/pages/Settings";
import Approvals from "@/pages/Approvals";
import Expenses from "@/pages/Expenses";

import ChequeDetail from "@/pages/ChequeDetail";
import ProfitToday from "@/pages/ProfitToday";
import CashPosition from "@/pages/CashPosition";
import CreditExposure from "@/pages/CreditExposure";
import CashLoans from "@/pages/CashLoans";
import Maintenance from "@/pages/Maintenance";
import Finance from "@/pages/Finance";
import PickQueue from "@/pages/PickQueue";
import NotFound from "@/pages/not-found";

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
