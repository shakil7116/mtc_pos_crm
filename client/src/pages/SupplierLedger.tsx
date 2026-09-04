import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { shrinkImage, DOCUMENT } from "@/lib/image";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, DollarSign, FileText, Camera, Package,
  Plus, Loader2, Receipt, CreditCard, Banknote, Building2,
  TrendingDown, TrendingUp, Wallet, Eye, RotateCcw,
  CheckCircle2, Clock, ArrowDownLeft,
} from "lucide-react";

type Supplier = {
  id: number; name: string; company: string | null;
  whatsapp: string | null; phone: string | null;
  paymentTerms: string | null; creditDays: number | null; paymentMode: string | null;
};

type SupplierOrder = {
  id: number; poNumber: string | null; status: string | null;
  items: any[] | null; sentAt: string | null; receivedAt: string | null;
  supplierInvoiceNumber: string | null; supplierInvoiceUrl: string | null;
  supplierInvoiceAmount: string | null;
  receiptDate: string | null; paymentDueDate: string | null; paymentTermsDays: number | null;
};

type SupplierPayment = {
  id: number; supplierId: number; poId: number | null;
  amount: string; method: string; date: string;
  reference: string | null; supplierInvoiceNumber: string | null;
  supplierInvoiceUrl: string | null; receiptUrl: string | null;
  bankName: string | null; notes: string | null; createdAt: string;
};

type SupplierReturn = {
  id: number; poId: number | null; supplierId: number | null;
  storeId: number | null; returnType: string; status: string;
  refundMode: string; refundMethod: string | null;
  items: Array<{ productId?: number; name: string; qty: number; unit?: string; amount?: number }>;
  total: string | null; refundAmount: string | null;
  refundReceivedAt: string | null; notes: string | null;
  createdBy: number | null; createdAt: string;
};

type LedgerData = {
  orders: SupplierOrder[];
  payments: SupplierPayment[];
  returns: SupplierReturn[];
  summary: { totalOrdered: number; totalReturned: number; totalPaid: number; balance: number };
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v: number | string | null | undefined): string {
  const n = Number(v || 0);
  return `QAR ${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusColor(s: string | null) {
  if (s === "received") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (s === "sent") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  if (s === "partial") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

export default function SupplierLedger() {
  const [, params] = useRoute("/suppliers/:id/ledger");
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const supplierId = Number(params?.id);

  const [payOpen, setPayOpen] = useState(false);
  const [invoiceViewUrl, setInvoiceViewUrl] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({
    amount: "", method: "Cash", date: new Date().toISOString().slice(0, 10),
    reference: "", bankName: "", notes: "",
    receiptUrl: "",
  });
  // Per-invoice allocation for split payments
  type InvoiceAlloc = { poId: number; invoiceNum: string; invoiceTotal: number; paid: number; remaining: number; allocate: number };
  const [allocations, setAllocations] = useState<InvoiceAlloc[]>([]);

  const receiptRef = useRef<HTMLInputElement>(null);

  const { data: supplier } = useQuery<Supplier>({
    queryKey: ["/api/suppliers", supplierId],
    queryFn: () => fetch(`/api/suppliers/${supplierId}`).then(r => r.json()),
    enabled: !!supplierId,
  });

  const { data: ledger, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/suppliers", supplierId, "ledger"],
    queryFn: () => fetch(`/api/suppliers/${supplierId}/ledger`).then(r => r.json()),
    enabled: !!supplierId,
  });

  // Per-PO payment totals
  function poPaidMap(): Record<number, number> {
    const map: Record<number, number> = {};
    for (const p of ledger?.payments || []) {
      if (p.poId) map[p.poId] = (map[p.poId] || 0) + Number(p.amount || 0);
    }
    return map;
  }

  function poInvoiceTotal(o: SupplierOrder): number {
    if (o.supplierInvoiceAmount) return Number(o.supplierInvoiceAmount);
    const items = Array.isArray(o.items) ? (o.items as any[]) : [];
    return items.reduce((s: number, it: any) => s + (Number(it.receivedQty || it.qty || 0) * Number(it.cost || it.price || 0)), 0);
  }

  function openPayDialog() {
    const paid = poPaidMap();
    const allocs: InvoiceAlloc[] = [];
    for (const o of ledger?.orders || []) {
      if (o.status === "cancelled" || o.status === "draft") continue;
      const total = poInvoiceTotal(o);
      if (total <= 0) continue;
      const paidAmt = paid[o.id] || 0;
      const remaining = Math.max(0, total - paidAmt);
      if (remaining <= 0) continue;
      allocs.push({
        poId: o.id,
        invoiceNum: o.supplierInvoiceNumber || o.poNumber || `PO-${o.id}`,
        invoiceTotal: total,
        paid: paidAmt,
        remaining: Number(remaining.toFixed(2)),
        allocate: 0,
      });
    }
    setAllocations(allocs);
    setPayForm({
      amount: "", method: "Cash", date: new Date().toISOString().slice(0, 10),
      reference: "", bankName: "", notes: "", receiptUrl: "",
    });
    setPayOpen(true);
  }

  function autoAllocate(total: number) {
    let left = total;
    setAllocations((prev) =>
      prev.map((a) => {
        const take = Math.min(left, a.remaining);
        left -= take;
        return { ...a, allocate: Number(take.toFixed(2)) };
      })
    );
  }

  const totalAllocated = allocations.reduce((s, a) => s + a.allocate, 0);
  const payTotal = Number(payForm.amount) || 0;
  const unallocated = Number((payTotal - totalAllocated).toFixed(2));

  const payMut = useMutation({
    mutationFn: async () => {
      const allocated = allocations.filter((a) => a.allocate > 0);
      if (allocated.length > 0) {
        // Create one payment per invoice allocation
        for (const a of allocated) {
          const res = await fetch("/api/supplier-payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              supplierId,
              poId: a.poId,
              amount: a.allocate,
              method: payForm.method,
              date: payForm.date,
              reference: payForm.reference || null,
              supplierInvoiceNumber: a.invoiceNum || null,
              receiptUrl: payForm.receiptUrl || null,
              bankName: payForm.bankName || null,
              notes: payForm.notes || null,
            }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Failed");
        }
        // Unallocated remainder as general payment
        if (unallocated > 0.01) {
          const res = await fetch("/api/supplier-payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              supplierId, poId: null,
              amount: unallocated,
              method: payForm.method, date: payForm.date,
              reference: payForm.reference || null,
              receiptUrl: payForm.receiptUrl || null,
              bankName: payForm.bankName || null,
              notes: payForm.notes ? `${payForm.notes} (unallocated)` : "Unallocated payment",
            }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Failed");
        }
      } else {
        // No allocations — general payment
        const res = await fetch("/api/supplier-payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierId, poId: null,
            amount: payTotal,
            method: payForm.method, date: payForm.date,
            reference: payForm.reference || null,
            receiptUrl: payForm.receiptUrl || null,
            bankName: payForm.bankName || null,
            notes: payForm.notes || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "ledger"] });
      toast({ title: "Payment recorded" });
      setPayOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const returnStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/supplier-returns/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Failed");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "ledger"] });
      toast({ title: vars.status === "confirmed" ? "Return confirmed" : "Refund received & logged" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const s = ledger?.summary;
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  if (!supplierId) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => nav("/suppliers")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{supplier?.name || "Supplier"}</h1>
              <p className="text-[13px] text-muted-foreground">
                {supplier?.company || "Supplier Ledger"} · {supplier?.paymentMode === "cash" ? "Cash Supplier" : `Credit ${supplier?.creditDays || 0} days`}
              </p>
            </div>
          </div>
          {isAdmin && (
            <button onClick={openPayDialog} className="btn-primary-action">
              <Plus size={16} /> Record Payment
            </button>
          )}
        </div>

        {/* Summary Cards */}
        {s && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
            <div className="stat-card bg-gradient-to-br from-blue-50/50 to-transparent">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold flex items-center gap-1.5"><Package size={12} /> Total Ordered</p>
              <p className="font-mono font-bold text-lg mt-1 tracking-tight">{fmtMoney(s.totalOrdered)}</p>
            </div>
            <div className="stat-card bg-gradient-to-br from-amber-50/50 to-transparent">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold flex items-center gap-1.5"><TrendingDown size={12} /> Returns</p>
              <p className="font-mono font-bold text-lg text-amber-600 mt-1 tracking-tight">{fmtMoney(s.totalReturned)}</p>
            </div>
            <div className="stat-card bg-gradient-to-br from-emerald-50/50 to-transparent">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold flex items-center gap-1.5"><TrendingUp size={12} /> Total Paid</p>
              <p className="font-mono font-bold text-lg text-green-600 mt-1 tracking-tight">{fmtMoney(s.totalPaid)}</p>
            </div>
            <div className={`hero-card ${s.balance > 0 ? "bg-gradient-to-br from-red-50 to-white border border-red-100" : "bg-gradient-to-br from-emerald-50 to-white border border-emerald-100"}`}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold flex items-center gap-1.5"><Wallet size={12} /> Balance Due</p>
              <p className={`font-mono font-bold text-xl mt-1 tracking-tight ${s.balance > 0 ? "text-red-600" : "text-green-600"}`}>{fmtMoney(s.balance)}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="payments">
            <TabsList className="bg-muted/40 p-1.5 rounded-xl border border-border/30">
              <TabsTrigger value="payments" className="rounded-lg data-[state=active]:border data-[state=active]:border-border/40">
                <Receipt size={14} className="mr-1.5" /> Payments ({ledger?.payments?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="orders" className="rounded-lg data-[state=active]:border data-[state=active]:border-border/40">
                <Package size={14} className="mr-1.5" /> Purchase Orders ({ledger?.orders?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="returns" className="rounded-lg data-[state=active]:border data-[state=active]:border-border/40">
                <RotateCcw size={14} className="mr-1.5" /> Returns ({ledger?.returns?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="timeline" className="rounded-lg data-[state=active]:border data-[state=active]:border-border/40">
                <FileText size={14} className="mr-1.5" /> Timeline
              </TabsTrigger>
            </TabsList>

            {/* Payments Tab */}
            <TabsContent value="payments" className="mt-4">
              {!ledger?.payments?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No payments recorded yet</p>
                  {isAdmin && <Button variant="outline" className="mt-3" onClick={openPayDialog}>
                    <Plus size={14} className="mr-1.5" /> Record First Payment
                  </Button>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-sm">{fmtDate(p.date)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {p.method === "Cash" && <Banknote size={12} className="mr-1" />}
                              {p.method === "Cheque" && <CreditCard size={12} className="mr-1" />}
                              {p.method === "PDC" && <CreditCard size={12} className="mr-1" />}
                              {p.method === "Bank Transfer" && <DollarSign size={12} className="mr-1" />}
                              {p.method}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{p.reference || "—"}</TableCell>
                          <TableCell className="text-sm">{p.supplierInvoiceNumber || "—"}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{fmtMoney(p.amount)}</TableCell>
                          <TableCell>
                            {p.receiptUrl ? (
                              <Button variant="ghost" size="sm" onClick={() => setInvoiceViewUrl(p.receiptUrl)}>
                                <Eye size={14} className="mr-1" /> View
                              </Button>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{p.notes || ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Purchase Orders Tab */}
            <TabsContent value="orders" className="mt-4">
              {!ledger?.orders?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No purchase orders</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ledger.orders.map((o) => {
                    const items = Array.isArray(o.items) ? o.items : [];
                    const orderTotal = poInvoiceTotal(o);
                    const paid = poPaidMap();
                    const paidAmt = paid[o.id] || 0;
                    const remaining = Math.max(0, orderTotal - paidAmt);
                    const isDue = o.paymentDueDate && new Date(o.paymentDueDate) <= new Date() && remaining > 0;
                    const payStatus = orderTotal <= 0 ? "no-invoice" : remaining <= 0 ? "paid" : paidAmt > 0 ? "partial" : "unpaid";
                    return (
                      <Card key={o.id} className={isDue ? "border-red-200 dark:border-red-800" : ""}>
                        <CardContent className="py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{o.poNumber || `PO-${o.id}`}</span>
                              <Badge className={statusColor(o.status)}>{o.status}</Badge>
                              {isDue && <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>}
                              {payStatus === "paid" && (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
                                  <CheckCircle2 size={10} className="mr-0.5" /> PAID
                                </Badge>
                              )}
                              {payStatus === "partial" && (
                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                                  PARTIAL
                                </Badge>
                              )}
                            </div>
                            <span className="font-mono font-bold">{fmtMoney(orderTotal)}</span>
                          </div>

                          {/* Payment progress */}
                          {orderTotal > 0 && (
                            <div className="mb-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-green-600">Paid: {fmtMoney(paidAmt)}</span>
                                {remaining > 0 && <span className="text-red-600">Remaining: {fmtMoney(remaining)}</span>}
                              </div>
                              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${remaining <= 0 ? "bg-green-500" : "bg-amber-500"}`}
                                  style={{ width: `${Math.min(100, (paidAmt / orderTotal) * 100)}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                            <div>Sent: {fmtDate(o.sentAt)}</div>
                            <div>Received: {fmtDate(o.receivedAt)}</div>
                            <div>Due: {fmtDate(o.paymentDueDate)}</div>
                            <div>Terms: {o.paymentTermsDays || 0} days</div>
                          </div>
                          {o.supplierInvoiceNumber && (
                            <div className="mt-2 flex items-center gap-2 text-sm">
                              <FileText size={14} className="text-muted-foreground" />
                              <span>Invoice #{o.supplierInvoiceNumber}</span>
                              {o.supplierInvoiceUrl && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setInvoiceViewUrl(o.supplierInvoiceUrl)}>
                                  <Eye size={12} className="mr-1" /> View
                                </Button>
                              )}
                              {o.supplierInvoiceAmount && (
                                <span className="font-mono ml-auto">{fmtMoney(o.supplierInvoiceAmount)}</span>
                              )}
                            </div>
                          )}
                          <div className="mt-2 text-xs text-muted-foreground">
                            {items.length} items: {items.map((it: any) => `${it.name || it.description} x${it.receivedQty || it.qty}`).join(", ")}
                          </div>

                          {/* Quick pay button */}
                          {isAdmin && remaining > 0 && (
                            <div className="mt-3 flex justify-end">
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openPayDialog}>
                                <DollarSign size={12} /> Pay
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Returns Tab */}
            <TabsContent value="returns" className="mt-4">
              {!ledger?.returns?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RotateCcw size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No supplier returns</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ledger.returns.map((r) => {
                    const items = Array.isArray(r.items) ? r.items : [];
                    const isCreditNote = r.refundMode === "credit_note";
                    const nextStatus = r.status === "pending_confirmation" ? "confirmed"
                      : (r.status === "confirmed" && !isCreditNote) ? "refund_received" : null;
                    const nextLabel = r.status === "pending_confirmation" ? "Confirm Return"
                      : (r.status === "confirmed" && !isCreditNote) ? "Mark Refund Received" : null;
                    return (
                      <Card key={r.id} className={r.status === "pending_confirmation" ? "border-amber-200 dark:border-amber-800" : ""}>
                        <CardContent className="py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <ArrowDownLeft size={16} className="text-amber-600" />
                              <span className="font-semibold">Return #{r.id}</span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {r.returnType === "rejected_delivery" ? "Rejected Delivery" : "Initiated"}
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] ${isCreditNote ? "border-purple-300 text-purple-700 dark:text-purple-400" : "border-green-300 text-green-700 dark:text-green-400"}`}>
                                {isCreditNote ? "Credit Note" : `Cash Refund${r.refundMethod ? ` (${r.refundMethod.replace(/_/g, " ")})` : ""}`}
                              </Badge>
                              <Badge className={
                                r.status === "pending_confirmation" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : (r.status === "confirmed" && isCreditNote) ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : r.status === "confirmed" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              }>
                                {r.status === "pending_confirmation" && <Clock size={10} className="mr-1" />}
                                {r.status === "confirmed" && <CheckCircle2 size={10} className="mr-1" />}
                                {r.status === "refund_received" && <DollarSign size={10} className="mr-1" />}
                                {(r.status === "confirmed" && isCreditNote) ? "balance adjusted" : r.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <span className="font-mono font-bold text-amber-600">{fmtMoney(r.refundAmount || r.total)}</span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground mb-2">
                            <div>Created: {fmtDate(r.createdAt)}</div>
                            {r.poId && <div>PO: #{r.poId}</div>}
                            {r.refundReceivedAt && <div>Refund: {fmtDate(r.refundReceivedAt)}</div>}
                          </div>

                          {items.length > 0 && (
                            <div className="bg-muted/30 rounded-md p-2 mb-2">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Items</p>
                              {items.map((it, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                  <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}.</span>
                                  <span className="flex-1">{it.name}</span>
                                  <span className="font-mono">{it.qty} {it.unit || ""}</span>
                                  {it.amount != null && <span className="font-mono text-xs">{fmtMoney(it.amount)}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {r.notes && <p className="text-xs text-muted-foreground italic">{r.notes}</p>}

                          {isAdmin && nextStatus && nextLabel && (
                            <div className="mt-3 flex justify-end">
                              <Button
                                size="sm"
                                variant={nextStatus === "refund_received" ? "default" : "outline"}
                                className={nextStatus === "refund_received" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                                disabled={returnStatusMut.isPending}
                                onClick={() => returnStatusMut.mutate({ id: r.id, status: nextStatus })}
                              >
                                {returnStatusMut.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" />
                                  : nextStatus === "confirmed" ? <CheckCircle2 size={14} className="mr-1.5" />
                                    : <DollarSign size={14} className="mr-1.5" />}
                                {nextLabel}
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Timeline Tab — unified chronological view */}
            <TabsContent value="timeline" className="mt-4">
              <div className="space-y-2">
                {[...(ledger?.orders?.map(o => ({
                  type: "order" as const, date: o.receivedAt || o.sentAt || "",
                  label: `PO ${o.poNumber || o.id}`,
                  detail: `${o.status} — ${(Array.isArray(o.items) ? o.items : []).length} items`,
                  amount: (Array.isArray(o.items) ? o.items : []).reduce((s: number, it: any) =>
                    s + (Number(it.receivedQty || 0) * Number(it.cost || it.price || 0)), 0),
                  dir: "debit" as const,
                })) || []),
                ...(ledger?.payments?.map(p => ({
                  type: "payment" as const, date: p.date,
                  label: `Payment — ${p.method}`,
                  detail: p.reference ? `Ref: ${p.reference}` : (p.notes || ""),
                  amount: Number(p.amount),
                  dir: "credit" as const,
                })) || []),
                ...(ledger?.returns?.map((r: any) => ({
                  type: "return" as const, date: r.createdAt || "",
                  label: `Return #${r.id}`,
                  detail: r.status,
                  amount: Number(r.refundAmount || r.total || 0),
                  dir: "credit" as const,
                })) || []),
                ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition">
                      <div className={`w-2 h-2 rounded-full ${entry.dir === "debit" ? "bg-red-500" : "bg-green-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{entry.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{entry.detail}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono text-sm font-semibold ${entry.dir === "debit" ? "text-red-600" : "text-green-600"}`}>
                          {entry.dir === "debit" ? "+" : "-"}{fmtMoney(entry.amount)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{fmtDate(entry.date)}</div>
                      </div>
                    </div>
                  ))}
                {!ledger?.orders?.length && !ledger?.payments?.length && (
                  <div className="text-center py-12 text-muted-foreground">No transactions yet</div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign size={20} className="text-[#d4a017]" /> Record Payment to {supplier?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Amount + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Total Amount *</Label>
                <Input type="number" min={0} step="0.01" value={payForm.amount}
                  onChange={e => {
                    const v = e.target.value;
                    setPayForm(f => ({ ...f, amount: v }));
                    if (Number(v) > 0) autoAllocate(Number(v));
                  }}
                  placeholder="0.00" className="font-mono text-lg h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={payForm.date}
                  onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} className="h-11" />
              </div>
            </div>

            {/* Invoice allocation */}
            {allocations.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Allocate to Invoices
                    </h4>
                    {payTotal > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs"
                        onClick={() => autoAllocate(payTotal)}>
                        Auto-split
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {allocations.map((a, idx) => (
                      <div key={a.poId} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/20">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">{a.invoiceNum}</span>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                            <span>Total: {fmtMoney(a.invoiceTotal)}</span>
                            <span className="text-green-600">Paid: {fmtMoney(a.paid)}</span>
                            <span className="text-red-600 font-semibold">Due: {fmtMoney(a.remaining)}</span>
                          </div>
                        </div>
                        <div className="w-28 shrink-0">
                          <Input
                            type="number"
                            min={0}
                            max={a.remaining}
                            step="0.01"
                            value={a.allocate || ""}
                            onChange={e => {
                              const val = Math.min(Number(e.target.value) || 0, a.remaining);
                              setAllocations(prev => prev.map((x, i) => i === idx ? { ...x, allocate: val } : x));
                            }}
                            className="h-8 text-sm font-mono text-right"
                            placeholder="0.00"
                          />
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2"
                          onClick={() => setAllocations(prev => prev.map((x, i) => i === idx ? { ...x, allocate: x.remaining } : x))}>
                          Full
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Allocation summary */}
                  {payTotal > 0 && (
                    <div className="flex justify-between text-sm px-1 pt-1">
                      <span className="text-muted-foreground">Allocated: <span className="font-mono font-semibold text-foreground">{fmtMoney(totalAllocated)}</span></span>
                      {unallocated > 0.01 && (
                        <span className="text-amber-600">Unallocated: <span className="font-mono font-semibold">{fmtMoney(unallocated)}</span></span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Method + Reference */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={payForm.method} onValueChange={v => setPayForm(f => ({ ...f, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="PDC">PDC (Post-Dated Cheque)</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reference / Cheque #</Label>
                <Input value={payForm.reference}
                  onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
                  placeholder="Ref number" />
              </div>
            </div>

            {(payForm.method === "Cheque" || payForm.method === "PDC" || payForm.method === "Bank Transfer") && (
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input value={payForm.bankName}
                  onChange={e => setPayForm(f => ({ ...f, bankName: e.target.value }))}
                  placeholder="Bank name" />
              </div>
            )}

            <Separator />

            {/* Upload receipt */}
            <div>
              <Label className="text-xs mb-1.5 block">Upload Payment Receipt</Label>
              <input ref={receiptRef} type="file" accept="image/*" className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPayForm(f => ({ ...f, receiptUrl: "" }));
                  const url = await shrinkImage(file, DOCUMENT);
                  setPayForm(f => ({ ...f, receiptUrl: url }));
                }} />
              <Button variant="outline" className="w-full" type="button"
                onClick={() => receiptRef.current?.click()}>
                <Camera size={14} className="mr-1.5" />
                {payForm.receiptUrl ? "Receipt Attached" : "Upload Receipt"}
              </Button>
              {payForm.receiptUrl && (
                <img src={payForm.receiptUrl} className="mt-2 w-full h-20 object-cover rounded border" alt="Receipt" />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={payForm.notes}
                onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Payment notes…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button className="bg-[#1e2a3a] text-white"
              onClick={() => payMut.mutate()}
              disabled={payMut.isPending || payTotal <= 0}>
              {payMut.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <DollarSign size={16} className="mr-2" />}
              Record Payment — {fmtMoney(payTotal)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice/Receipt Viewer */}
      <Dialog open={!!invoiceViewUrl} onOpenChange={() => setInvoiceViewUrl(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Document Viewer</DialogTitle></DialogHeader>
          {invoiceViewUrl && (
            <img src={invoiceViewUrl} className="w-full max-h-[70vh] object-contain rounded" alt="Document" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
