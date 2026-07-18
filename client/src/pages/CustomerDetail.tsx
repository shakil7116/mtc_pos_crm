import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, subMonths, startOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  ArrowLeft,
  Phone,
  Edit2,
  Plus,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  RefreshCw,
  MessageSquare,
  ChevronRight,
  Send,
  Clock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
type Customer = {
  id: number;
  name: string;
  phone: string | null;
  type: "walk-in" | "contractor" | "corporate" | "government";
  creditLimit: number | string | null;
  trn: string | null;
  address: string | null;
  notes: string | null;
  paymentTerms: string | null;
  active: boolean | null;
  createdAt: string;
};

type Balance = {
  balance: number;
  creditLimit: number;
  totalInvoiced: number;
  totalPaid: number;
};

type Document = {
  id: number;
  type: "INV" | "QT" | "DN" | "CN";
  number: string;
  date: string;
  customerId: number | null;
  customerName: string | null;
  status: string;
  total: number | string;
  createdAt: string;
  updatedAt: string;
};

type Payment = {
  id: number;
  documentId: number;
  customerId: number | null;
  amount: number | string;
  method: "Cash" | "Bank Transfer" | "Cheque" | "Credit Card";
  date: string;
  reference: string | null;
  notes: string | null;
  isRefund: boolean | null;
};

type Cheque = {
  id: number;
  customerId: number | null;
  paymentId: number | null;
  chequeNumber: string;
  bankName: string;
  amount: number | string;
  chequeDate: string;
  status: "pending" | "cleared" | "cancelled" | "overdue";
  clearedDate: string | null;
};

type ReturnDoc = {
  id: number;
  originalInvoiceId: number | null;
  creditNoteId: number | null;
  type: string;
  status: string;
  reason: string | null;
  refundAmount: number | string | null;
  processedAt: string | null;
};

type Message = {
  id: number;
  customerId: number | null;
  documentId: number | null;
  type: string;
  content: string;
  sentAt: string;
  sentBy: string | null;
  skipped: boolean | null;
};

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

function fmt(v: number | string | null | undefined): string {
  return "QAR " + toNum(v).toFixed(2);
}

function typeColor(type: string) {
  switch (type) {
    case "walk-in":      return "bg-gray-100 text-gray-700";
    case "contractor":   return "bg-blue-100 text-blue-700";
    case "corporate":    return "bg-purple-100 text-purple-700";
    case "government":   return "bg-emerald-100 text-emerald-700";
    default:             return "bg-gray-100 text-gray-700";
  }
}

function typeLabel(type: string) {
  switch (type) {
    case "walk-in":    return "Walk-in";
    case "contractor": return "Contractor";
    case "corporate":  return "Corporate";
    case "government": return "Government";
    default:           return type;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "paid":           return "bg-green-100 text-green-700";
    case "unpaid":         return "bg-red-100 text-red-700";
    case "partial":        return "bg-yellow-100 text-yellow-700";
    case "void":           return "bg-gray-100 text-gray-500";
    case "draft":          return "bg-gray-100 text-gray-500";
    case "converted":      return "bg-blue-100 text-blue-700";
    case "returned":       return "bg-orange-100 text-orange-700";
    case "partial_return": return "bg-orange-100 text-orange-700";
    case "pending":        return "bg-yellow-100 text-yellow-700";
    case "cleared":        return "bg-green-100 text-green-700";
    case "cancelled":      return "bg-gray-100 text-gray-500";
    case "overdue":        return "bg-red-100 text-red-700";
    case "approved":       return "bg-green-100 text-green-700";
    case "rejected":       return "bg-red-100 text-red-700";
    default:               return "bg-gray-100 text-gray-500";
  }
}

/* ─────────────────────────────────────────
   Edit Customer Dialog
───────────────────────────────────────── */
type EditForm = {
  name: string;
  phone: string;
  type: string;
  creditLimit: string;
  trn: string;
  address: string;
  notes: string;
  paymentTerms: string;
};

function EditCustomerDialog({
  customer,
  open,
  onClose,
}: {
  customer: Customer;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EditForm>({
    name:         customer.name,
    phone:        customer.phone ?? "",
    type:         customer.type,
    creditLimit:  customer.creditLimit != null ? String(customer.creditLimit) : "",
    trn:          customer.trn ?? "",
    address:      customer.address ?? "",
    notes:        customer.notes ?? "",
    paymentTerms: customer.paymentTerms ?? "",
  });
  const [errors, setErrors] = useState<Partial<EditForm>>({});
  const qc = useQueryClient();
  const { toast } = useToast();

  const mut = useMutation({
    mutationFn: (body: EditForm) =>
      fetch(`/api/customers/${customer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          creditLimit: body.creditLimit ? parseFloat(body.creditLimit) : null,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to update");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/customers/${customer.id}`] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer updated" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update customer", variant: "destructive" });
    },
  });

  function validate(): boolean {
    const errs: Partial<EditForm> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function set(field: keyof EditForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+974 XXXX XXXX" />
          </div>
          <div className="space-y-1.5">
            <Label>Customer Type</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="walk-in">Walk-in</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="government">Government</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Credit Limit (QAR)</Label>
            <Input type="number" min="0" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>TRN / CR Number</Label>
            <Input value={form.trn} onChange={(e) => set("trn", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Terms</Label>
            <Input value={form.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="e.g. Net 30" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button onClick={() => { if (validate()) mut.mutate(form); }} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Record Payment Dialog
───────────────────────────────────────── */
function RecordPaymentDialog({
  customerId,
  open,
  onClose,
  invoices,
}: {
  customerId: number;
  open: boolean;
  onClose: () => void;
  invoices: Document[];
}) {
  const [form, setForm] = useState({
    documentId: "",
    amount: "",
    method: "Cash",
    date: format(new Date(), "yyyy-MM-dd"),
    reference: "",
    notes: "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const unpaidInvoices = invoices.filter(
    (d) => d.type === "INV" && (d.status === "unpaid" || d.status === "partial")
  );

  const mut = useMutation({
    mutationFn: (body: typeof form) => {
      const docId = parseInt(body.documentId);
      return fetch(`/api/documents/${docId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          amount: parseFloat(body.amount),
          method: body.method,
          date: body.date,
          reference: body.reference || null,
          notes: body.notes || null,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to record payment");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/customers/${customerId}/balance`] });
      qc.invalidateQueries({ queryKey: [`/api/documents-customer-${customerId}`] });
      toast({ title: "Payment recorded" });
      setForm({ documentId: "", amount: "", method: "Cash", date: format(new Date(), "yyyy-MM-dd"), reference: "", notes: "" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to record payment", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Invoice <span className="text-red-500">*</span></Label>
            <Select value={form.documentId} onValueChange={(v) => setForm((f) => ({ ...f, documentId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select invoice…" />
              </SelectTrigger>
              <SelectContent>
                {unpaidInvoices.map((inv) => (
                  <SelectItem key={inv.id} value={String(inv.id)}>
                    {inv.number} — {fmt(inv.total)} ({inv.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount (QAR) <span className="text-red-500">*</span></Label>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Credit Card">Credit Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Reference / Cheque No.</Label>
            <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button
            onClick={() => { if (form.documentId && form.amount) mut.mutate(form); }}
            disabled={mut.isPending || !form.documentId || !form.amount}
          >
            {mut.isPending ? "Recording…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Send Message Sheet
───────────────────────────────────────── */
function SendMessageSheet({
  customer,
  invoices,
  open,
  onClose,
}: {
  customer: Customer;
  invoices: Document[];
  open: boolean;
  onClose: () => void;
}) {
  const latestInvoice = invoices
    .filter((d) => d.type === "INV")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const unpaidTotal = invoices
    .filter((d) => d.type === "INV" && (d.status === "unpaid" || d.status === "partial"))
    .reduce((s, d) => s + toNum(d.total), 0);

  const templates = [
    {
      label: "Invoice Request",
      text: `Dear ${customer.name},\n\nThis is a reminder regarding your outstanding balance of ${fmt(unpaidTotal)} with MTC.\n\nPlease arrange payment at your earliest convenience.\n\nThank you,\nMamun M Trading`,
    },
    {
      label: "Quote Follow-up",
      text: `Dear ${customer.name},\n\nWe wanted to follow up on the quotation${latestInvoice ? ` ${latestInvoice.number}` : ""} we sent you.\n\nPlease let us know if you have any questions or would like to proceed.\n\nBest regards,\nMamun M Trading`,
    },
    {
      label: "Custom Message",
      text: `Dear ${customer.name},\n\n`,
    },
  ];

  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [message, setMessage] = useState(templates[0].text);

  function selectTemplate(idx: number) {
    setSelectedTemplate(idx);
    setMessage(templates[idx].text);
  }

  function openWhatsApp() {
    if (!customer.phone) return;
    const phone = customer.phone.replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            Send WhatsApp Message
          </SheetTitle>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Template selector */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Templates
            </p>
            <div className="flex gap-2 flex-wrap">
              {templates.map((t, idx) => (
                <button
                  key={idx}
                  onClick={() => selectTemplate(idx)}
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
                    selectedTemplate === idx
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white border-border text-muted-foreground hover:border-green-400"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message editor */}
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="font-mono text-sm resize-none"
            />
          </div>

          {/* To */}
          {customer.phone ? (
            <p className="text-xs text-muted-foreground">
              Will open WhatsApp to: <strong>{customer.phone}</strong>
            </p>
          ) : (
            <div className="flex items-center gap-2 text-amber-600 text-xs font-medium">
              <AlertTriangle className="w-4 h-4" />
              No phone number on file for this customer.
            </div>
          )}

          <Button
            className="w-full gap-2 bg-green-600 hover:bg-green-700"
            disabled={!customer.phone || !message.trim()}
            onClick={openWhatsApp}
          >
            <Send className="w-4 h-4" />
            Open in WhatsApp
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────────────────────────
   Financial Summary Bar
───────────────────────────────────────── */
function FinancialSummary({
  balance,
  loading,
}: {
  balance: Balance | undefined;
  loading: boolean;
}) {
  const outstanding = toNum(balance?.balance);
  const totalInvoiced = toNum(balance?.totalInvoiced);
  const totalPaid = toNum(balance?.totalPaid);
  const creditLimit = toNum(balance?.creditLimit);
  const creditUsedPct =
    creditLimit > 0 ? Math.min(100, (outstanding / creditLimit) * 100) : 0;

  const barColor =
    creditUsedPct > 80
      ? "bg-red-500"
      : creditUsedPct > 50
      ? "bg-orange-500"
      : "bg-green-500";

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-border/40 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Total Invoiced */}
      <div className="bg-white rounded-xl p-4 border border-border/40 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Total Invoiced
        </p>
        <p className="text-lg font-bold font-mono text-foreground">{fmt(totalInvoiced)}</p>
      </div>

      {/* Total Paid */}
      <div className="bg-white rounded-xl p-4 border border-border/40 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Total Paid
        </p>
        <p className="text-lg font-bold font-mono text-green-600">{fmt(totalPaid)}</p>
      </div>

      {/* Outstanding */}
      <div className="bg-white rounded-xl p-4 border border-border/40 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Outstanding
        </p>
        <p
          className={cn(
            "text-lg font-bold font-mono",
            outstanding > 0 ? "text-red-600" : "text-green-600"
          )}
        >
          {fmt(outstanding)}
        </p>
      </div>

      {/* Credit Used */}
      <div className="bg-white rounded-xl p-4 border border-border/40 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Credit Used
        </p>
        {creditLimit > 0 ? (
          <>
            <p className="text-sm font-bold font-mono text-foreground mb-1.5">
              {creditUsedPct.toFixed(0)}%{" "}
              <span className="text-xs text-muted-foreground font-normal">
                of {fmt(creditLimit)}
              </span>
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", barColor)}
                style={{ width: `${creditUsedPct}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No limit set</p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Invoices Tab
───────────────────────────────────────── */
function InvoicesTab({
  docs,
  customerId,
}: {
  docs: Document[];
  customerId: number;
}) {
  const [, nav] = useLocation();
  const invoices = docs
    .filter((d) => d.type === "INV")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // 6-month credit timeline: total invoiced to this customer per month (last 6).
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = startOfMonth(subMonths(now, 5 - i));
    return { key: format(d, "yyyy-MM"), label: format(d, "MMM"), total: 0 };
  });
  const monthIdx = new Map(months.map((m, i) => [m.key, i] as const));
  for (const d of docs) {
    if (d.type !== "INV" || d.status === "void") continue;
    const i = monthIdx.get((d.date || "").slice(0, 7));
    if (i != null) months[i].total += toNum(d.total);
  }
  const hasTrend = months.some((m) => m.total > 0);

  if (invoices.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No invoices yet</p>
        <Button className="mt-4" onClick={() => nav(`/documents/new/INV`)}>
          <Plus className="w-4 h-4 mr-2" /> Create Invoice
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 6-month credit timeline */}
      {hasTrend && (
        <div className="bg-white rounded-xl border border-border/40 shadow-sm p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Credit invoices — last 6 months
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={months} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} tick={{ fontSize: 11 }} width={36} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [fmt(v), "Invoiced"]} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="#6366f1" fillOpacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {invoices.map((inv) => {
        const total = toNum(inv.total);
        return (
          <Link key={inv.id} href={`/documents/${inv.id}`}>
            <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-border/40 hover:shadow-sm transition-all cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm">{inv.number}</span>
                  <Badge className={cn("text-[10px] font-semibold border-0", statusColor(inv.status))}>
                    {inv.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {inv.date ? format(new Date(inv.date), "dd MMM yyyy") : "—"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold font-mono text-sm">{fmt(total)}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   Payments Tab
───────────────────────────────────────── */
function PaymentsTab({ customerId }: { customerId: number }) {
  const { data: rawPayments, isLoading } = useQuery<Payment[]>({
    queryKey: [`/api/payments-customer-${customerId}`],
    queryFn: async () => {
      // fetch all docs for customer, then their payments
      const docs: Document[] = await fetch(
        `/api/documents?customerId=${customerId}&type=INV`
      ).then((r) => r.json());
      if (!Array.isArray(docs) || docs.length === 0) return [];
      const allPayments: Payment[] = [];
      await Promise.all(
        docs.slice(0, 30).map(async (doc) => {
          const pmts: Payment[] = await fetch(`/api/documents/${doc.id}/payments`).then(
            (r) => r.json()
          );
          if (Array.isArray(pmts)) allPayments.push(...pmts);
        })
      );
      return allPayments;
    },
    enabled: !!customerId,
  });

  const payments = Array.isArray(rawPayments) ? rawPayments : [];
  const sorted = [...payments].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const totalReceived = sorted
    .filter((p) => !p.isRefund)
    .reduce((s, p) => s + toNum(p.amount), 0);

  const methodIcon = (method: string) => {
    switch (method) {
      case "Cash":          return "💵";
      case "Bank Transfer": return "🏦";
      case "Cheque":        return "📝";
      case "Credit Card":   return "💳";
      default:              return "💰";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="py-12 text-center">
        <DollarSign className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No payments recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-border/40"
        >
          <span className="text-xl">{methodIcon(p.method)}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{p.method}</p>
            <p className="text-xs text-muted-foreground">
              {p.date ? format(new Date(p.date), "dd MMM yyyy") : "—"}
              {p.reference && ` · Ref: ${p.reference}`}
            </p>
          </div>
          <p
            className={cn(
              "font-bold font-mono text-sm",
              p.isRefund ? "text-red-600" : "text-green-600"
            )}
          >
            {p.isRefund ? "−" : "+"}
            {fmt(p.amount)}
          </p>
        </div>
      ))}
      <div className="border-t border-border/40 pt-3 flex justify-between font-semibold text-sm px-1">
        <span className="text-muted-foreground">Total Received</span>
        <span className="font-mono text-green-600">{fmt(totalReceived)}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Cheques Tab
───────────────────────────────────────── */
function ChequesTab({ customerId }: { customerId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmClear, setConfirmClear] = useState<number | null>(null);

  const { data: rawCheques, isLoading } = useQuery<Cheque[]>({
    queryKey: [`/api/cheques`],
    queryFn: () => fetch("/api/cheques").then((r) => r.json()),
  });

  const cheques = (Array.isArray(rawCheques) ? rawCheques : [])
    .filter((c) => c.customerId === customerId)
    .sort((a, b) => new Date(b.chequeDate).getTime() - new Date(a.chequeDate).getTime());

  const clearMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/cheques/${id}/clear`, { method: "PUT" }).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      toast({ title: "Cheque marked as cleared" });
      setConfirmClear(null);
    },
    onError: () => {
      toast({ title: "Failed to clear cheque", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (cheques.length === 0) {
    return (
      <div className="py-12 text-center">
        <CreditCard className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No cheques on file</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {cheques.map((c) => {
          const daysLeft = differenceInDays(new Date(c.chequeDate), new Date());
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-border/40"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{c.chequeNumber}</span>
                  <span className="text-xs text-muted-foreground">{c.bankName}</span>
                  <Badge className={cn("text-[10px] font-semibold border-0", statusColor(c.status))}>
                    {c.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Due: {format(new Date(c.chequeDate), "dd MMM yyyy")}
                  {c.status === "pending" && (
                    <span
                      className={cn(
                        "ml-2 font-semibold",
                        daysLeft < 0
                          ? "text-red-600"
                          : daysLeft <= 3
                          ? "text-orange-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {daysLeft < 0
                        ? `${Math.abs(daysLeft)}d overdue`
                        : daysLeft === 0
                        ? "Due today"
                        : `${daysLeft}d left`}
                    </span>
                  )}
                </p>
              </div>
              <p className="font-bold font-mono text-sm shrink-0">{fmt(c.amount)}</p>
              {c.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmClear(c.id)}
                  className="shrink-0 text-green-700 border-green-300 hover:bg-green-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={confirmClear !== null} onOpenChange={() => setConfirmClear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Cheque as Cleared?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the cheque as cleared. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmClear) clearMut.mutate(confirmClear); }}
              className="bg-green-600 hover:bg-green-700"
            >
              Mark Cleared
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ─────────────────────────────────────────
   Quotations Tab
───────────────────────────────────────── */
function QuotationsTab({ docs }: { docs: Document[] }) {
  const quotes = docs
    .filter((d) => d.type === "QT")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (quotes.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No quotations yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {quotes.map((q) => (
        <Link key={q.id} href={`/documents/${q.id}`}>
          <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-border/40 hover:shadow-sm transition-all cursor-pointer">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-sm">{q.number}</span>
                <Badge className={cn("text-[10px] font-semibold border-0", statusColor(q.status))}>
                  {q.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {q.date ? format(new Date(q.date), "dd MMM yyyy") : "—"}
              </p>
            </div>
            <p className="font-bold font-mono text-sm shrink-0">{fmt(q.total)}</p>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   Returns Tab
───────────────────────────────────────── */
function ReturnsTab({ docs }: { docs: Document[] }) {
  const creditNotes = docs
    .filter((d) => d.type === "CN")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (creditNotes.length === 0) {
    return (
      <div className="py-12 text-center">
        <RefreshCw className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No returns or credit notes</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {creditNotes.map((note) => (
        <Link key={note.id} href={`/documents/${note.id}`}>
          <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-border/40 hover:shadow-sm transition-all cursor-pointer">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-sm">{note.number}</span>
                <Badge className="text-[10px] font-semibold border-0 bg-orange-100 text-orange-700">
                  Credit Note
                </Badge>
                <Badge className={cn(
                  "text-[10px] font-semibold border-0",
                  statusColor(note.status)
                )}>
                  {note.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {note.date ? format(new Date(note.date), "dd MMM yyyy") : "—"}
              </p>
            </div>
            <p className="font-bold font-mono text-sm shrink-0 text-orange-600">
              {fmt(note.total)}
            </p>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   Messages Tab
───────────────────────────────────────── */
function MessagesTab({ customerId }: { customerId: number }) {
  const { data: rawMessages, isLoading } = useQuery<Message[]>({
    queryKey: [`/api/messages-customer-${customerId}`],
    queryFn: () => fetch("/api/messages").then((r) => r.json()),
  });

  const messages = (Array.isArray(rawMessages) ? rawMessages : [])
    .filter((m) => m.customerId === customerId)
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="py-12 text-center">
        <MessageSquare className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No messages sent yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "px-4 py-3 bg-white rounded-xl border border-border/40",
            msg.skipped && "opacity-60"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {msg.type}
              </span>
              {msg.skipped && (
                <Badge className="text-[10px] bg-gray-100 text-gray-500 border-0">Skipped</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {msg.sentAt ? format(new Date(msg.sentAt), "dd MMM yyyy, HH:mm") : "—"}
            </div>
          </div>
          <p className="text-sm text-foreground whitespace-pre-line line-clamp-3">
            {msg.content}
          </p>
          {msg.sentBy && (
            <p className="text-xs text-muted-foreground mt-1">Sent by: {msg.sentBy}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   Statement of Account (PDF / print + WhatsApp)
───────────────────────────────────────── */
function StatementModal({
  open, onClose, customer, invoices, outstanding,
}: {
  open: boolean; onClose: () => void; customer: Customer; invoices: Document[]; outstanding: number;
}) {
  const { data: settings } = useSettings();
  const company = (settings as any)?.companyName || "Mamun M Trading and Contracting W.L.L";
  const netDays = (() => { const m = (customer.paymentTerms || "").match(/(\d+)/); return m ? Number(m[1]) : 30; })();
  const unpaid = invoices
    .filter((d) => d.type === "INV" && ["unpaid", "partial"].includes(d.status))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const today = format(new Date(), "dd MMM yyyy");

  const waText = encodeURIComponent(
    `Dear ${customer.name},\n\nStatement of Account — ${company}\nAs of ${today}\n\n` +
    unpaid.map((d) => {
      const due = format(new Date(new Date(d.date).getTime() + netDays * 86400000), "dd/MM/yy");
      return `• ${d.number} (${format(new Date(d.date), "dd/MM/yy")}, due ${due}): QAR ${toNum(d.total).toFixed(2)}`;
    }).join("\n") +
    `\n\nTotal outstanding: QAR ${outstanding.toFixed(2)}\n\nKindly arrange payment. Thank you.`
  );
  const waNum = (customer.phone || "").replace(/\D/g, "");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Statement of Account</DialogTitle></DialogHeader>

        <div id="statement-print" className="bg-white text-sm">
          <div className="flex justify-between items-start border-b pb-3 mb-3">
            <div>
              <p className="font-black text-base">{company}</p>
              <p className="text-xs text-muted-foreground">Store 1 — Najma Street, Doha, Qatar</p>
            </div>
            <div className="text-right">
              <p className="font-bold uppercase tracking-wide">Statement of Account</p>
              <p className="text-xs text-muted-foreground">As of {today}</p>
            </div>
          </div>
          <div className="mb-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Bill to</p>
            <p className="font-semibold">{customer.name}</p>
            {customer.phone && <p className="text-xs">{customer.phone}</p>}
            {customer.address && <p className="text-xs text-muted-foreground">{customer.address}</p>}
          </div>
          <table className="w-full text-sm border-t">
            <thead><tr className="text-xs uppercase text-muted-foreground border-b">
              <th className="text-left py-2">Invoice</th><th className="text-left py-2">Date</th>
              <th className="text-left py-2">Due</th><th className="text-right py-2">Amount (QAR)</th>
            </tr></thead>
            <tbody>
              {unpaid.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No outstanding invoices — account is clear.</td></tr>
              ) : unpaid.map((d) => {
                const due = format(new Date(new Date(d.date).getTime() + netDays * 86400000), "dd MMM yy");
                const overdue = differenceInDays(new Date(), new Date(new Date(d.date).getTime() + netDays * 86400000)) > 0;
                return (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 font-mono">{d.number}</td>
                    <td className="py-2">{format(new Date(d.date), "dd MMM yy")}</td>
                    <td className={cn("py-2", overdue && "text-red-600 font-semibold")}>{due}{overdue ? " ⚠" : ""}</td>
                    <td className="py-2 text-right font-mono">{toNum(d.total).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="border-t-2">
              <td colSpan={3} className="py-2 font-bold text-right">Total Outstanding</td>
              <td className="py-2 text-right font-mono font-bold text-red-600">QAR {outstanding.toFixed(2)}</td>
            </tr></tfoot>
          </table>
          <p className="text-[11px] text-muted-foreground mt-3">Payment terms: Net {netDays} days. Please settle outstanding invoices at your earliest convenience.</p>
        </div>

        <DialogFooter className="no-print">
          <Button variant="outline" onClick={() => window.print()}>Print / Save PDF</Button>
          {waNum && (
            <a href={`https://wa.me/${waNum}?text=${waText}`} target="_blank" rel="noreferrer">
              <Button className="bg-green-600 hover:bg-green-700 text-white">Send via WhatsApp</Button>
            </a>
          )}
        </DialogFooter>
        <style>{`@media print { body * { visibility: hidden !important; } #statement-print, #statement-print * { visibility: visible !important; } #statement-print { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; } .no-print { display: none !important; } }`}</style>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────
   Main Page
───────────────────────────────────────── */
export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const [, nav] = useLocation();
  const customerId = Number(params?.id);

  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);

  /* Fetch customer */
  const { data: customer, isLoading: customerLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    queryFn: () => fetch(`/api/customers/${customerId}`).then((r) => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
    enabled: !!customerId,
  });

  /* Fetch balance */
  const { data: balance, isLoading: balanceLoading } = useQuery<Balance>({
    queryKey: [`/api/customers/${customerId}/balance`],
    queryFn: () =>
      fetch(`/api/customers/${customerId}/balance`).then((r) => r.json()),
    enabled: !!customerId,
  });

  /* Fetch all documents for this customer */
  const { data: rawDocs } = useQuery<Document[]>({
    queryKey: [`/api/documents-customer-${customerId}`],
    queryFn: () =>
      fetch(`/api/documents?customerId=${customerId}`).then((r) => r.json()),
    enabled: !!customerId,
  });
  const docs = Array.isArray(rawDocs) ? rawDocs : [];

  /* Alert logic */
  const { data: rawCheques } = useQuery<Cheque[]>({
    queryKey: ["/api/cheques"],
    queryFn: () => fetch("/api/cheques").then((r) => r.json()),
  });
  const customerCheques = (Array.isArray(rawCheques) ? rawCheques : []).filter(
    (c) => c.customerId === customerId
  );
  const chequeDueSoon = customerCheques.some((c) => {
    if (c.status !== "pending") return false;
    return differenceInDays(new Date(c.chequeDate), new Date()) <= 3;
  });

  const oldestUnpaidDate = docs
    .filter((d) => d.type === "INV" && (d.status === "unpaid" || d.status === "partial"))
    .map((d) => new Date(d.date))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const overdueAlert =
    oldestUnpaidDate && differenceInDays(new Date(), oldestUnpaidDate) > 30;

  if (customerLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-8 h-8 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-muted-foreground text-lg font-medium">Customer not found</p>
        <Button variant="outline" className="mt-4" onClick={() => nav("/customers")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Customers
        </Button>
      </div>
    );
  }

  const outstanding = toNum(balance?.balance);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* ── Back ── */}
      <button
        onClick={() => nav("/customers")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Customers
      </button>

      {/* ── Header card ── */}
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Left: name + info */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-primary font-black text-xl">
                {customer.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {customer.name}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge
                  className={cn(
                    "text-xs font-semibold border-0",
                    typeColor(customer.type)
                  )}
                >
                  {typeLabel(customer.type)}
                </Badge>
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {customer.phone}
                  </a>
                )}
                {customer.trn && (
                  <span className="text-xs text-muted-foreground">
                    TRN: {customer.trn}
                  </span>
                )}
              </div>
              {customer.address && (
                <p className="text-xs text-muted-foreground mt-1">{customer.address}</p>
              )}
              {customer.paymentTerms && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Payment terms: {customer.paymentTerms}
                </p>
              )}
              {customer.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">{customer.notes}</p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => nav(`/documents/new/INV?customerId=${customerId}`)}
            >
              <Plus className="w-3.5 h-3.5" />
              New Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => setPaymentOpen(true)}
              disabled={outstanding <= 0}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Record Payment
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setMessageOpen(true)}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Send Message
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setStatementOpen(true)}
            >
              <FileText className="w-3.5 h-3.5" />
              Statement
            </Button>
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      <div className="space-y-2">
        {chequeDueSoon && (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl px-4 py-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-orange-500" />
            <span className="text-sm font-semibold">
              A cheque from this customer is due within 3 days.
            </span>
          </div>
        )}
        {overdueAlert && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
            <span className="text-sm font-semibold">
              Outstanding balance overdue for more than 30 days.
            </span>
          </div>
        )}
      </div>

      {/* ── Financial Summary ── */}
      <FinancialSummary balance={balance} loading={balanceLoading} />

      {/* ── Tabs ── */}
      <Tabs defaultValue="invoices">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="invoices" className="flex-1 text-xs font-semibold min-w-[80px]">
            Invoices ({docs.filter((d) => d.type === "INV").length})
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex-1 text-xs font-semibold min-w-[80px]">
            Payments
          </TabsTrigger>
          <TabsTrigger value="cheques" className="flex-1 text-xs font-semibold min-w-[80px]">
            Cheques ({customerCheques.length})
          </TabsTrigger>
          <TabsTrigger value="quotations" className="flex-1 text-xs font-semibold min-w-[80px]">
            Quotations ({docs.filter((d) => d.type === "QT").length})
          </TabsTrigger>
          <TabsTrigger value="returns" className="flex-1 text-xs font-semibold min-w-[80px]">
            Returns ({docs.filter((d) => d.type === "CN").length})
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex-1 text-xs font-semibold min-w-[80px]">
            Messages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab docs={docs} customerId={customerId} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="cheques" className="mt-4">
          <ChequesTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="quotations" className="mt-4">
          <QuotationsTab docs={docs} />
        </TabsContent>
        <TabsContent value="returns" className="mt-4">
          <ReturnsTab docs={docs} />
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <MessagesTab customerId={customerId} />
        </TabsContent>
      </Tabs>

      {/* bottom padding */}
      <div className="h-4" />

      {/* ── Dialogs / Sheets ── */}
      {editOpen && (
        <EditCustomerDialog
          customer={customer}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}

      <RecordPaymentDialog
        customerId={customerId}
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        invoices={docs}
      />

      <SendMessageSheet
        customer={customer}
        invoices={docs}
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
      />

      <StatementModal
        customer={customer}
        invoices={docs}
        outstanding={outstanding}
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
      />
    </div>
  );
}
