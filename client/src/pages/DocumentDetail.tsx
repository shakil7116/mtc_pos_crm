import { useState, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import {
  InvoiceRenderer,
  normalizeInvoice,
  getSavedTemplate,
  saveTemplate,
  INVOICE_TEMPLATES,
  type TemplateId,
} from "@/components/invoice-templates";
import { useInvoiceConfig } from "@/lib/invoiceConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Printer,
  MessageCircle,
  Pencil,
  DollarSign,
  RotateCcw,
  Ban,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lock,
  AlertTriangle,
  Loader2,
  CreditCard,
  Banknote,
  Building2,
  CheckSquare,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { CorrectButton, CorrectedBadge } from "@/components/CorrectionModal";
import ReturnModal from "@/components/ReturnModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentItem {
  id: number;
  documentId: number;
  productId: number | null;
  sku: string | null;
  description: string;
  qty: number;
  unit: string;
  price: number;
  discountType: "QAR" | "%" | null;
  discountAmount: number;
  amount: number;
}

interface DocumentFull {
  id: number;
  type: "INV" | "QT" | "DN" | "CN";
  number: string;
  date: string;
  customerId: number | null;
  customerName: string | null;
  storeId: number | null;
  status: string;
  discountType: "QAR" | "%" | null;
  discountAmount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  totalWords: string | null;
  notes: string | null;
  linkedDocId: number | null;
  originalInvoiceId: number | null;
  deliveryMethod?: string | null;
  deliveryStatus?: string | null;
  deliveryAddress?: string | null;
  deliveryInstructions?: string | null;
  driverId?: number | null;
  authorizedBy?: number | null;
  authorizedAt?: string | null;
  expectedDeliveryDate?: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  items: DocumentItem[];
}

interface Payment {
  id: number;
  documentId: number;
  customerId: number | null;
  amount: number;
  method: "Cash" | "Bank Transfer" | "Cheque" | "Credit Card";
  date: string;
  reference: string | null;
  notes: string | null;
  isRefund: boolean;
  recordedBy: number | null;
  createdAt: string;
}

interface EditLogEntry {
  id: number;
  documentId: number;
  userId: number;
  userName: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  isAdminOverride: boolean;
  createdAt: string;
}

interface Customer {
  id: number;
  name: string;
  phone: string;
}

// ─── Payment method icon ──────────────────────────────────────────────────────

function MethodIcon({ method }: { method: string }) {
  if (method === "Cash") return <Banknote className="w-4 h-4 text-green-600" />;
  if (method === "Bank Transfer") return <Building2 className="w-4 h-4 text-blue-600" />;
  if (method === "Cheque") return <CheckSquare className="w-4 h-4 text-purple-600" />;
  if (method === "Credit Card") return <CreditCard className="w-4 h-4 text-orange-600" />;
  return <DollarSign className="w-4 h-4" />;
}

// ─── Status / Type badge helpers ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    unpaid: "bg-red-100 text-red-700 border border-red-200",
    partial: "bg-orange-100 text-orange-700 border border-orange-200",
    paid: "bg-green-100 text-green-700 border border-green-200",
    returned: "bg-gray-100 text-gray-600 border border-gray-200",
    partial_return: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    converted: "bg-blue-100 text-blue-700 border border-blue-200",
    void: "bg-gray-100 text-gray-500 border border-gray-200",
    draft: "bg-slate-100 text-slate-600 border border-slate-200",
  };
  const labels: Record<string, string> = {
    unpaid: "Unpaid",
    partial: "Partial",
    paid: "Paid",
    returned: "Returned",
    partial_return: "Partial Return",
    converted: "Converted",
    void: "Void",
    draft: "Draft",
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", cls[status] ?? cls.draft)}>
      {labels[status] ?? status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cls: Record<string, string> = {
    INV: "bg-[#1e2a3a] text-white",
    QT: "bg-blue-600 text-white",
    DN: "bg-purple-600 text-white",
    CN: "bg-red-600 text-white",
  };
  const labels: Record<string, string> = {
    INV: "Invoice",
    QT: "Quotation",
    DN: "Delivery Note",
    CN: "Credit Note",
  };
  return (
    <span className={cn("px-2.5 py-1 rounded text-xs font-bold tracking-wide", cls[type] ?? "bg-gray-600 text-white")}>
      {labels[type] ?? type}
    </span>
  );
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  documentId: number;
  customerId: number | null;
  remaining: number;
}

function RecordPaymentModal({ open, onClose, documentId, customerId, remaining }: PaymentModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [method, setMethod] = useState<"Cash" | "Bank Transfer" | "Cheque" | "Credit Card">("Cash");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  // Cheque fields
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [bankName, setBankName] = useState("");

  const mut = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch(`/api/documents/${documentId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/documents/${documentId}/payments`] });
      qc.invalidateQueries({ queryKey: [`/api/documents/${documentId}`] });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Payment recorded" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      amount: parseFloat(amount),
      method,
      date,
      reference: reference || null,
      notes: notes || null,
      customerId,
    };
    if (method === "Cheque") {
      if (!chequeNumber || !chequeDate || !bankName) {
        toast({ title: "Cheque details required", variant: "destructive" });
        return;
      }
      body.chequeNumber = chequeNumber;
      body.chequeDate = chequeDate;
      body.bankName = bankName;
    }
    mut.mutate(body);
  }

  // Reset on open
  useState(() => {
    if (open) {
      setAmount(remaining.toFixed(2));
      setMethod("Cash");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setReference("");
      setNotes("");
      setChequeNumber("");
      setChequeDate("");
      setBankName("");
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            Record Payment
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount */}
          <div className="space-y-1.5">
            <Label>Amount (QAR)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            {remaining > 0 && (
              <p className="text-xs text-muted-foreground">
                Remaining balance: QAR {remaining.toFixed(2)}
              </p>
            )}
          </div>

          {/* Method */}
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Credit Card">Credit Card</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Cheque fields */}
          {method === "Cheque" && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Cheque Details</p>
              <div className="space-y-1.5">
                <Label>Cheque Number *</Label>
                <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="e.g. 001234" required />
              </div>
              <div className="space-y-1.5">
                <Label>Cheque Date *</Label>
                <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Bank Name *</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Qatar National Bank" required />
              </div>
            </div>
          )}

          {/* Reference / Notes */}
          <div className="space-y-1.5">
            <Label>Reference / Notes</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ref, note…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending} className="bg-green-600 hover:bg-green-700 text-white">
              {mut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DocumentDetail() {
  const [, params] = useRoute("/documents/:id");
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const id = Number(params?.id);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [returnWarningOpen, setReturnWarningOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [templateId, setTemplateId] = useState<TemplateId>(getSavedTemplate());
  const invoiceCfg = useInvoiceConfig();

  // ── Fetch document ─────────────────────────────────────────
  const { data: doc, isLoading: loadingDoc } = useQuery<DocumentFull>({
    queryKey: [`/api/documents/${id}`],
    queryFn: () => fetch(`/api/documents/${id}`).then((r) => r.json()),
    enabled: !!id,
  });

  // ── Fetch payments (INV only) ──────────────────────────────
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: [`/api/documents/${id}/payments`],
    queryFn: () => fetch(`/api/documents/${id}/payments`).then((r) => r.json()),
    enabled: !!id && doc?.type === "INV",
  });

  // ── Fetch linked return vouchers (audit, read-only — never mutates the invoice) ──
  const { data: linkedReturns = [] } = useQuery<any[]>({
    queryKey: [`/api/returns?invoiceId=${id}`],
    queryFn: () => fetch(`/api/returns?invoiceId=${id}`).then((r) => r.json()),
    enabled: !!id && doc?.type === "INV",
  });

  // ── Fetch edit log ─────────────────────────────────────────
  const { data: editLog = [], isLoading: loadingLog } = useQuery<EditLogEntry[]>({
    queryKey: [`/api/documents/${id}/edit-log`],
    queryFn: () => fetch(`/api/documents/${id}/edit-log`).then((r) => r.json()),
    enabled: !!id && editHistoryOpen,
  });

  // ── Fetch customer phone ───────────────────────────────────
  const { data: customer } = useQuery<Customer>({
    queryKey: [`/api/customers/${doc?.customerId}`],
    queryFn: () => fetch(`/api/customers/${doc?.customerId}`).then((r) => r.json()),
    enabled: !!doc?.customerId,
  });

  // ── Fetch settings (for print) ─────────────────────────────
  const { data: settings } = useSettings();

  // ── Stores (resolve the real location name, never "Store #5") ──
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
    staleTime: 60_000,
  });
  const storeName = doc?.storeId
    ? (stores.find((s: any) => s.id === doc.storeId)?.nameEn ?? `Store ${doc.storeId}`)
    : null;

  // ── Convert QT → INV ──────────────────────────────────────
  const convertMut = useMutation({
    mutationFn: () =>
      fetch(`/api/documents/${id}/convert`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data: { id: number; number: string }) => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Converted to Invoice", description: `Created ${data.number}` });
      nav(`/documents/${data.id}`);
    },
    onError: () => toast({ title: "Conversion failed", variant: "destructive" }),
  });

  // Payment-correction drafts (per payment id: proposed method/amount)
  const [correctDraft, setCorrectDraft] = useState<Record<number, { method?: string; amount?: number }>>({});
  const correctPayMut = useMutation({
    mutationFn: ({ id: pid, method, amount, reason }: { id: number; method?: string; amount?: number; reason: string }) =>
      fetch(`/api/corrections/payment/${pid}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, amount, reason }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Correction failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/documents/${id}/payments`] });
      qc.invalidateQueries({ queryKey: [`/api/documents/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/corrections"] });
      toast({ title: "Payment corrected", description: "Original values kept in the correction log." });
    },
    onError: (e: any) => toast({ title: "Cannot correct", description: String(e?.message || ""), variant: "destructive" }),
  });

  // Delivery marked delivered by mistake → back to pending
  const reverseDeliveryMut = useMutation({
    mutationFn: (reason: string) =>
      fetch(`/api/corrections/delivery/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Reversal failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/documents/${id}`] });
      toast({ title: "Delivery reversed", description: "Back to pending — driver notified." });
    },
    onError: (e: any) => toast({ title: "Cannot reverse", description: String(e?.message || ""), variant: "destructive" }),
  });

  const voidMut = useMutation({
    mutationFn: () =>
      fetch(`/api/documents/${id}/void`, { method: "POST" }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Void failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/documents/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      qc.invalidateQueries({ queryKey: [`/api/documents/${id}/payments`] });
      toast({ title: "Invoice voided", description: "Stock reversed and refunds recorded per rules." });
    },
    onError: (e: any) => toast({ title: "Cannot void", description: String(e?.message || ""), variant: "destructive" }),
  });

  // ── Delivery Note workflow (pick → authorize → deliver) ────
  const dnAction = (path: string, okMsg: string) =>
    fetch(`/api/documents/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Action failed"); return r.json(); });
  const mkDnMut = (path: string, okMsg: string) => useMutation({
    mutationFn: () => dnAction(path, okMsg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/documents/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/deliveries"] });
      toast({ title: okMsg });
    },
    onError: (e: any) => toast({ title: "Cannot proceed", description: String(e?.message || ""), variant: "destructive" }),
  });
  const pickMut = mkDnMut("pick", "Marked picked — sent for authorisation");
  const authorizeMut = mkDnMut("authorize", "Delivery authorised — driver notified");
  const deliverMut = mkDnMut("delivered", "Delivery confirmed — invoice completed");

  // ── Computed ───────────────────────────────────────────────
  const totalPaid = payments
    .filter((p) => !p.isRefund)
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalRefunded = payments
    .filter((p) => p.isRefund)
    .reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, Number(doc?.total ?? 0) - totalPaid + totalRefunded);

  const invoiceAgeDays = doc ? differenceInDays(new Date(), new Date(doc.date)) : 0;
  const returnExpired = invoiceAgeDays > 7;

  // Void window (uses createdAt, not the document date). Hours come from Settings
  // (11A — admin-editable), defaulting to 12 while settings load.
  const { data: bizSettings } = useQuery<any>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 60_000,
  });
  const voidWindowHours = Number(bizSettings?.voidWindowHours ?? 12);
  const createdMs = (doc as any)?.createdAt ? new Date((doc as any).createdAt).getTime() : 0;
  const withinVoidWindow =
    doc?.type === "INV" && doc?.status !== "void" && createdMs > 0 &&
    (Date.now() - createdMs) / 3_600_000 <= voidWindowHours;
  const canReturn =
    doc?.type === "INV" &&
    !["returned", "void", "draft"].includes(doc.status);

  // ── WhatsApp ───────────────────────────────────────────────
  function openWhatsApp() {
    const phone = customer?.phone?.replace(/\D/g, "");
    const typeLabel =
      doc?.type === "INV"
        ? "Invoice"
        : doc?.type === "QT"
        ? "Quotation"
        : doc?.type === "DN"
        ? "Delivery Note"
        : "Credit Note";
    const msg =
      `Dear ${doc?.customerName ?? "Customer"},\n\n` +
      `Your ${typeLabel} *${doc?.number}* dated ${doc ? format(new Date(doc.date), "dd/MM/yyyy") : ""} ` +
      `for *QAR ${Number(doc?.total ?? 0).toFixed(2)}* has been issued by Mamun M Trading and Contracting.\n\n` +
      (doc?.type === "INV" && remaining > 0
        ? `Remaining balance: *QAR ${remaining.toFixed(2)}*\n\n`
        : "") +
      `Thank you for your business.`;
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  // ── Print ──────────────────────────────────────────────────
  function handlePrint() {
    window.print();
  }

  // ── Return button logic ────────────────────────────────────
  // Opens the approval-gated return workflow (ReturnModal). The staff member
  // submits a request; nothing moves until an admin/manager approves it. The old
  // path navigated to a Credit-Note editor that created an unapproved CN and was
  // the reported P0 "return page" crash — replaced entirely.
  function handleReturnClick() {
    if (returnExpired && user?.role !== "admin") return;
    if (returnExpired && user?.role === "admin") {
      setReturnWarningOpen(true);
      return;
    }
    setReturnModalOpen(true);
  }

  // ── Loading ────────────────────────────────────────────────
  if (loadingDoc) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground text-lg">Document not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => nav("/documents")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Documents
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5 pb-10">
      {/* ── Back + Header ── */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/documents")} className="mt-0.5 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold font-mono text-[#d4a017] tracking-tight">
              {doc.number}
            </h1>
            <TypeBadge type={doc.type} />
            <StatusBadge status={doc.status} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {format(new Date(doc.date), "dd MMMM yyyy")}
            </span>
            {doc.customerName && (
              <span className="font-medium text-foreground">{doc.customerName}</span>
            )}
            {storeName && <span>{storeName}</span>}
          </div>
        </div>
      </div>

      {/* ── Delivery Note workflow (pick → authorize → deliver) ── */}
      {doc.type === "DN" && (() => {
        const stage = doc.deliveryStatus || "pending_pick";
        const steps = [
          { key: "pending_pick", label: "Pending Pick" },
          { key: "picked", label: "Picked" },
          { key: "authorized", label: "Authorized" },
          { key: "delivered", label: "Delivered" },
        ];
        const stageIdx = steps.findIndex((s) => s.key === stage);
        const role = user?.role;
        const canPick = stage === "pending_pick" && ["warehouse", "admin", "manager"].includes(role || "");
        const canAuthorize = stage === "picked" && ["admin", "manager"].includes(role || "");
        const canDeliver = stage === "authorized" && ["driver", "admin", "manager"].includes(role || "");
        return (
          <div className="no-print rounded-2xl border border-purple-200 bg-purple-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold text-sm text-purple-800 flex items-center gap-2">
                <Truck className="w-4 h-4" /> Delivery Workflow
              </h2>
              {doc.linkedDocId && (
                <Link href={`/documents/${doc.linkedDocId}`} className="text-xs font-semibold text-purple-700 hover:underline">
                  View invoice →
                </Link>
              )}
            </div>
            {/* Stepper */}
            <div className="flex items-center gap-1">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1 flex-1">
                  <div className={cn(
                    "flex-1 text-center text-[11px] font-semibold rounded-full py-1 px-2 border",
                    i < stageIdx ? "bg-green-100 text-green-700 border-green-200"
                      : i === stageIdx ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-muted-foreground border-border/60"
                  )}>
                    {s.label}
                  </div>
                  {i < steps.length - 1 && <span className="text-muted-foreground text-xs">›</span>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-purple-900/80">
              {doc.deliveryAddress && <span>📍 {doc.deliveryAddress}</span>}
              {doc.expectedDeliveryDate && <span>🗓 Expected {format(new Date(doc.expectedDeliveryDate), "dd MMM yyyy")}</span>}
              {doc.deliveryInstructions && <span>📝 {doc.deliveryInstructions}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {canPick && (
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5" disabled={pickMut.isPending} onClick={() => pickMut.mutate()}>
                  {pickMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Mark Picked
                </Button>
              )}
              {canAuthorize && (
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5" disabled={authorizeMut.isPending} onClick={() => authorizeMut.mutate()}>
                  {authorizeMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Authorize Delivery
                </Button>
              )}
              {canDeliver && (
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5" disabled={deliverMut.isPending} onClick={() => deliverMut.mutate()}>
                  {deliverMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirm Delivery
                </Button>
              )}
              {stage === "delivered" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  ✓ Delivered &amp; completed
                </span>
              )}
              {stage === "picked" && !canAuthorize && <span className="text-xs text-muted-foreground self-center">Awaiting manager authorisation…</span>}
              {stage === "authorized" && !canDeliver && <span className="text-xs text-muted-foreground self-center">Authorised — awaiting driver dispatch…</span>}
            </div>
            {/* Pick list grouped by physical location (staff-only, never printed). */}
            {Array.isArray((doc as any).items) && (doc as any).items.length > 0 && (() => {
              const groups: Record<number, any[]> = {};
              for (const it of (doc as any).items) {
                const k = it.locationStoreId ?? 0;
                (groups[k] = groups[k] || []).push(it);
              }
              const nameOf = (id: number) => id ? (stores.find((s: any) => s.id === id)?.nameEn ?? `Store #${id}`) : "Unassigned";
              return (
                <div className="rounded-xl border border-purple-200 bg-white p-3 space-y-2">
                  <p className="text-xs font-bold text-purple-800">Pick list by location</p>
                  {Object.entries(groups).map(([k, its]) => (
                    <div key={k}>
                      <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wide">{nameOf(Number(k))}</p>
                      <ul className="text-xs text-slate-700 pl-4 list-disc">
                        {its.map((it: any, i: number) => <li key={i}>{it.description} × {Number(it.qty)} {it.unit}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Action buttons row ── */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => nav(`/documents/${id}/edit`)}
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" /> Print
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
          onClick={openWhatsApp}
        >
          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
        </Button>

        {/* INV only: Record Payment */}
        {doc.type === "INV" && doc.status !== "paid" && doc.status !== "void" && (
          <Button
            size="sm"
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setPaymentModalOpen(true)}
          >
            <DollarSign className="w-3.5 h-3.5" /> Record Payment
          </Button>
        )}

        {/* INV only: Void within the 12-hour window */}
        {withinVoidWindow && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
            disabled={voidMut.isPending}
            onClick={() => {
              if (window.confirm("Void this invoice? Stock is reversed and any collected payment is refunded per the rules (card → cash). The number is kept and marked VOID. This cannot be undone.")) {
                voidMut.mutate();
              }
            }}
          >
            <Ban className="w-3.5 h-3.5" /> Void
          </Button>
        )}

        {/* INV only: Return */}
        {canReturn && (
          returnExpired && user?.role !== "admin" ? (
            <Button size="sm" variant="outline" disabled className="gap-1.5 text-muted-foreground">
              <RotateCcw className="w-3.5 h-3.5" /> Return (Expired)
            </Button>
          ) : (
            <Button
              size="sm"
              variant={returnExpired ? "outline" : "outline"}
              className={cn(
                "gap-1.5",
                returnExpired
                  ? "text-orange-600 border-orange-300 hover:bg-orange-50"
                  : "text-blue-600 border-blue-300 hover:bg-blue-50"
              )}
              onClick={handleReturnClick}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {returnExpired ? "Return (Admin Override)" : "Return"}
            </Button>
          )
        )}

        {/* Delivered by mistake? Admin/manager reverses to pending (logged). */}
        {(doc as any).deliveryStatus === "delivered" && (
          <span className="inline-flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-2 py-1.5">
            ✓ Delivered
            <CorrectedBadge entityType="delivery" entityId={doc.id} />
            <CorrectButton
              label="Undo"
              title={`Reverse delivery — ${doc.number}`}
              current="Delivered"
              next="Pending (back in transit)"
              onConfirm={(reason) => reverseDeliveryMut.mutateAsync(reason)}
            />
          </span>
        )}

        {/* QT only: Convert to INV */}
        {doc.type === "QT" && doc.status !== "converted" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="gap-1.5 bg-[#1e2a3a] hover:bg-[#2a3a4a] text-white"
              >
                <ArrowRight className="w-3.5 h-3.5" /> Convert to Invoice
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Convert to Invoice?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will create a new Invoice from Quotation {doc.number}. The quotation will be marked as converted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => convertMut.mutate()}
                  disabled={convertMut.isPending}
                  className="bg-[#1e2a3a] hover:bg-[#2a3a4a]"
                >
                  {convertMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Convert
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* ── Linked Return Vouchers (audit — read-only) ── */}
      {doc.type === "INV" && Array.isArray(linkedReturns) && linkedReturns.length > 0 && (
        <div className="no-print rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-amber-200 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-600" />
            <h2 className="font-semibold text-sm text-amber-800">Return Vouchers linked to this invoice</h2>
          </div>
          <div className="divide-y divide-amber-100">
            {linkedReturns.map((rv) => (
              <div
                key={rv.id}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left"
              >
                <div>
                  <span className="font-mono font-semibold text-sm">{rv.voucherNumber}</span>
                  <span className="text-xs text-muted-foreground ml-2">{rv.type} · {rv.date}</span>
                </div>
                <span className="font-mono font-semibold text-sm text-amber-700">
                  − QAR {Number(rv.refundAmount || rv.total || 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Template picker (screen only) ── */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Presentation template
        </span>
        <div className="flex flex-wrap gap-1.5">
          {INVOICE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTemplateId(t.id); saveTemplate(t.id); }}
              title={t.blurb}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                templateId === t.id
                  ? "bg-[#1e2a3a] text-white border-[#1e2a3a] shadow-sm"
                  : "bg-white text-muted-foreground border-border hover:border-[#1e2a3a]/40 hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Document paper view (print target) ── */}
      <div
        id="invoice-print-area"
        className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-3 sm:p-4 md:p-8 flex justify-center overflow-auto"
      >
        {settings ? (
          <InvoiceRenderer
            ref={printRef}
            templateId={templateId}
            settings={settings as any}
            invoice={normalizeInvoice(doc, customer?.phone)}
            options={{
              showSignature: invoiceCfg.showSignature,
              showReturnPolicy: invoiceCfg.showReturnPolicy,
              showAmountInWords: invoiceCfg.showAmountInWords,
            }}
            className="paper-fit shadow-2xl origin-top"
          />
        ) : (
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 space-y-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </div>

      {/* ── Items table ── */}
      <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-sm">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs w-10">#</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs w-10">SKU</TableHead>
                <TableHead className="text-xs text-right w-16">Qty</TableHead>
                <TableHead className="text-xs w-16">Unit</TableHead>
                <TableHead className="text-xs text-right w-24">Price</TableHead>
                <TableHead className="text-xs text-right w-24">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.items.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{item.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{item.sku ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{item.qty}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.unit}</TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {Number(item.price).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono font-semibold">
                    {Number(item.amount).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals — internal staff view. Footer (grand-total) discount is shown
            here for staff/admin but is NEVER printed on the customer copy. The
            discount value is derived (subtotal + tax − total) so it is correct
            regardless of whether it was entered as QAR or %. */}
        {(() => {
          const subtotal = Number(doc.subtotal);
          const tax = Number(doc.taxAmount);
          const total = Number(doc.total);
          const footerDiscount = Math.max(0, subtotal + tax - total);
          const hasFooterDiscount = footerDiscount > 0.005;
          return (
            <div className="px-4 py-4 border-t border-border flex justify-end">
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Line Items Subtotal</span>
                  <span className="font-mono">QAR {subtotal.toFixed(2)}</span>
                </div>
                {hasFooterDiscount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700 font-medium">Gross Discount</span>
                    <span className="font-mono text-amber-700">
                      − QAR {footerDiscount.toFixed(2)}
                    </span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ({doc.taxRate}%)</span>
                    <span className="font-mono">QAR {tax.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Grand Total</span>
                  <span className="font-mono text-[#d4a017]">QAR {total.toFixed(2)}</span>
                </div>
                {hasFooterDiscount && (
                  <p className="text-[11px] text-amber-600/90 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Internal staff view — the gross discount is not printed on the customer copy. The customer sees only the Grand Total.
                  </p>
                )}
                {doc.totalWords && (
                  <p className="text-xs italic text-muted-foreground">{doc.totalWords}</p>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Payments section (INV only) ── */}
      {doc.type === "INV" && (
        <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h2 className="font-semibold text-sm">Payments</h2>
            {doc.status !== "paid" && doc.status !== "void" && (
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                onClick={() => setPaymentModalOpen(true)}
              >
                <DollarSign className="w-3.5 h-3.5" /> Record Payment
              </Button>
            )}
          </div>

          {payments.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <MethodIcon method={p.method} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{p.method}</span>
                        {p.isRefund && (
                          <span className="text-xs bg-red-100 text-red-600 px-1.5 rounded font-medium">
                            Refund
                          </span>
                        )}
                        <CorrectedBadge entityType="payment" entityId={p.id} />
                        {/* Recorded wrong (e.g. card but was cash)? Admin/manager corrects — logged forever. */}
                        {!p.isRefund && p.method !== "Cheque" && (
                          <CorrectButton
                            title={`Correct payment #${p.id}`}
                            current={`${p.method} · QAR ${Number(p.amount).toFixed(2)}`}
                            next={`${correctDraft[p.id]?.method || p.method} · QAR ${Number(correctDraft[p.id]?.amount ?? p.amount).toFixed(2)}`}
                            onConfirm={(reason) => correctPayMut.mutateAsync({ id: p.id, method: correctDraft[p.id]?.method, amount: correctDraft[p.id]?.amount, reason })}
                          >
                            <div className="flex gap-2 items-center text-xs">
                              <select
                                className="border rounded px-2 py-1"
                                value={correctDraft[p.id]?.method || p.method}
                                onChange={(e) => setCorrectDraft((d) => ({ ...d, [p.id]: { ...d[p.id], method: e.target.value } }))}
                              >
                                {["Cash", "Credit Card", "Bank Transfer"].map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                              <input type="number" min={0.01} step="0.01"
                                className="border rounded px-2 py-1 w-24 font-mono"
                                value={correctDraft[p.id]?.amount ?? Number(p.amount)}
                                onChange={(e) => setCorrectDraft((d) => ({ ...d, [p.id]: { ...d[p.id], amount: Number(e.target.value) } }))}
                              />
                            </div>
                          </CorrectButton>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(p.date), "dd/MM/yyyy")}
                        {p.reference && ` · ${p.reference}`}
                      </div>
                    </div>
                  </div>
                  <span className={cn("font-mono font-semibold text-sm", p.isRefund ? "text-red-600" : "text-green-700")}>
                    {p.isRefund ? "−" : "+"} QAR {Number(p.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Balance summary */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-mono font-medium text-green-700">QAR {totalPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Remaining Balance</span>
              <span className={cn("font-mono", remaining > 0 ? "text-red-600" : "text-green-600")}>
                QAR {remaining.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Notes ── */}
      {doc.notes && (
        <div className="bg-muted/30 rounded-xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Notes</p>
          <p className="text-sm whitespace-pre-wrap">{doc.notes}</p>
        </div>
      )}

      {/* ── Edit History (collapsible) ── */}
      <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
        <button
          className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold bg-muted/20 hover:bg-muted/40 transition-colors"
          onClick={() => setEditHistoryOpen((v) => !v)}
        >
          <span>Edit History</span>
          {editHistoryOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {editHistoryOpen && (
          <div className="divide-y divide-border">
            {loadingLog ? (
              <div className="px-4 py-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : editLog.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No edit history found.
              </div>
            ) : (
              editLog.map((entry) => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium">{entry.userName}</span>
                        {entry.isAdminOverride && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-1.5 rounded font-medium">
                            Admin Override
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground capitalize">{entry.field}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="line-through">{entry.oldValue ?? "—"}</span>
                        {" → "}
                        <span className="font-medium text-foreground">{entry.newValue ?? "—"}</span>
                      </div>
                      {entry.reason && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{entry.reason}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.createdAt), "dd/MM/yy HH:mm")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Record Payment modal ── */}
      <RecordPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        documentId={id}
        customerId={doc.customerId}
        remaining={remaining}
      />

      {/* ── Return / Credit Note modal (approval-gated workflow) ── */}
      {doc.type === "INV" && (
        <ReturnModal
          open={returnModalOpen}
          onClose={() => setReturnModalOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: [`/api/documents/${id}`] });
            qc.invalidateQueries({ queryKey: [`/api/returns?invoiceId=${id}`] });
          }}
          invoiceId={doc.id}
          invoiceDate={doc.date}
          invoiceNumber={doc.number}
          items={doc.items as any}
          customerId={doc.customerId ?? undefined}
          storeId={doc.storeId ?? undefined}
        />
      )}

      {/* ── Admin return override warning ── */}
      <AlertDialog open={returnWarningOpen} onOpenChange={setReturnWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Return Policy Override
            </AlertDialogTitle>
            <AlertDialogDescription>
              This invoice is {invoiceAgeDays} days old. The standard return window is 7 days.
              As admin, you can override this policy. Are you sure you want to proceed with the return?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => {
                setReturnWarningOpen(false);
                setReturnModalOpen(true);
              }}
            >
              Proceed with Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Preview fit (zoom shrinks the layout box so the A4 paper fits any width) ── */}
      <style>{`
        .paper-fit { zoom: 0.4; }
        @media (min-width: 420px) { .paper-fit { zoom: 0.48; } }
        @media (min-width: 480px) { .paper-fit { zoom: 0.6; } }
        @media (min-width: 640px) { .paper-fit { zoom: 0.74; } }
        @media (min-width: 768px) { .paper-fit { zoom: 0.9; } }
        @media (min-width: 1024px) { .paper-fit { zoom: 1; } }
        @media print { .paper-fit { zoom: 1 !important; } }
      `}</style>
      <style>{`
        /* Strict A4 print canvas */
        @page { size: A4; margin: 15mm; }
        @media print {
          html, body {
            margin: 0 !important; padding: 0 !important; background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; margin: 0 !important; padding: 0 !important;
            border: none !important; background: #fff !important; overflow: visible !important;
          }
          /* The @page 15mm provides the margin — neutralize the paper's own box so it fills A4 */
          #invoice-print-area .invoice-paper,
          #invoice-print-area > div {
            transform: none !important; box-shadow: none !important;
            width: 100% !important; min-height: auto !important;
            margin: 0 !important; padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* preserve table borders / header fills on paper */
          #invoice-print-area table, #invoice-print-area th, #invoice-print-area td { border-color: #1e2a3a30 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
