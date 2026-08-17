import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { businessDate } from "@shared/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Eye,
  Printer,
  MessageCircle,
  FileText,
  Filter,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType = "ALL" | "INV" | "QT" | "DN" | "CN" | "PO" | "RV";
type DocStatus = "all" | "unpaid" | "partial" | "paid" | "returned" | "partial_return" | "converted" | "void" | "draft";

interface Document {
  id: number;
  type: "INV" | "QT" | "DN" | "CN" | "PO" | "RV";
  number: string;
  date: string;
  customerId: number | null;
  customerName: string | null;
  customer?: { phone?: string | null } | null; // attached by /api/documents (getDocuments)
  storeId: number | null;
  status: string;
  total: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  createdAt: string;
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    unpaid: "bg-red-100 text-red-700 border-red-200",
    partial: "bg-orange-100 text-orange-700 border-orange-200",
    paid: "bg-green-100 text-green-700 border-green-200",
    returned: "bg-gray-100 text-gray-600 border-gray-200",
    partial_return: "bg-yellow-100 text-yellow-700 border-yellow-200",
    converted: "bg-blue-100 text-blue-700 border-blue-200",
    void: "bg-gray-100 text-gray-500 border-gray-200",
    draft: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const labels: Record<string, string> = {
    unpaid: "Unpaid",
    partial: "Partial",
    paid: "Paid",
    returned: "Returned",
    partial_return: "Part. Return",
    converted: "Converted",
    void: "Void",
    draft: "Draft",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border",
        variants[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const variants: Record<string, string> = {
    INV: "bg-[#1e2a3a] text-white",
    QT: "bg-blue-600 text-white",
    DN: "bg-purple-600 text-white",
    CN: "bg-red-600 text-white",
    PO: "bg-emerald-700 text-white",
    RV: "bg-amber-600 text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide",
        variants[type] ?? "bg-gray-600 text-white"
      )}
    >
      {type}
    </span>
  );
}

// ─── Card view (mobile) ───────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onPrint,
  onWhatsApp,
}: {
  doc: Document;
  onPrint: (doc: Document) => void;
  onWhatsApp: (doc: Document) => void;
}) {
  const [, nav] = useLocation();
  return (
    <div className="bg-white rounded-xl border border-border p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TypeBadge type={doc.type} />
            <span className="font-bold text-base tracking-tight text-foreground">
              {doc.number}
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            {doc.customerName || "—"}
          </p>
        </div>
        <StatusBadge status={doc.status} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {format(new Date(doc.date), "dd/MM/yyyy")}
        </span>
        <span className="font-mono font-bold text-base text-foreground">
          QAR {Number(doc.total).toFixed(2)}
        </span>
      </div>
      <div className="flex gap-2 pt-1 border-t border-border/60">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 gap-1 text-xs"
          onClick={() => nav(`/documents/${doc.id}`)}
        >
          <Eye className="w-3.5 h-3.5" /> View
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 gap-1 text-xs"
          onClick={() => onPrint(doc)}
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </Button>
        {doc.customerName && (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 gap-1 text-xs text-green-600"
            onClick={() => onWhatsApp(doc)}
          >
            <MessageCircle className="w-3.5 h-3.5" /> WA
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-10" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-8 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const TAB_TYPES: { value: DocType; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "INV", label: "Invoices" },
  { value: "QT", label: "Quotations" },
  { value: "DN", label: "Delivery Notes" },
  { value: "PO", label: "Purchase Orders" },
  { value: "CN", label: "Credit Notes" },
];

export default function Documents() {
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // ── URL-driven presets (dashboard deep-links) ────────────────
  const urlParams = (() => { try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); } })();
  const isTodayView = urlParams.get("date") === "today";
  const creditOnly = urlParams.get("credit") === "1";
  const todayStr = businessDate(new Date());

  // ── Filter state ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<DocType>((urlParams.get("type") as DocType) || "ALL");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocStatus>("all");
  const [dateFrom, setDateFrom] = useState(isTodayView ? todayStr : "");
  const [dateTo, setDateTo] = useState(isTodayView ? todayStr : "");
  const [page, setPage] = useState(1);

  // ── Fetch ─────────────────────────────────────────────────
  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (activeTab !== "ALL") params.set("type", activeTab);
    if (user?.storeId) params.set("storeId", String(user.storeId));
    return `/api/documents?${params.toString()}`;
  }, [activeTab, user?.storeId]);

  const { data: allDocs = [], isLoading } = useQuery<Document[]>({
    queryKey: [queryKey],
    queryFn: () => fetch(queryKey).then((r) => r.json()),
  });

  // ── Client-side filter + search ───────────────────────────
  const filtered = useMemo(() => {
    let list = Array.isArray(allDocs) ? allDocs : [];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.number.toLowerCase().includes(q) ||
          (d.customerName ?? "").toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      list = list.filter((d) => d.status === statusFilter);
    }

    if (dateFrom) {
      list = list.filter((d) => d.date >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((d) => d.date <= dateTo);
    }
    // Credit-only preset (dashboard "Credit Sales Today"): unpaid/partial INV.
    if (creditOnly) {
      list = list.filter((d) => d.type === "INV" && (d.status === "unpaid" || d.status === "partial"));
    }
    // Newest first.
    list = [...list].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
    return list;
  }, [allDocs, search, statusFilter, dateFrom, dateTo, creditOnly]);

  const todayTotal = isTodayView ? filtered.reduce((s, d) => s + Number(d.total || 0), 0) : 0;

  // Paginate
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageDocs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  const resetPage = () => setPage(1);

  // ── Actions ───────────────────────────────────────────────
  function handlePrint(doc: Document) {
    nav(`/documents/${doc.id}`);
    setTimeout(() => window.print(), 600);
  }

  function handleWhatsApp(doc: Document) {
    const phone = (doc.customer?.phone || "").replace(/\D/g, ""); // digits only for wa.me
    const name = doc.customerName || "Customer";
    const kind = doc.type === "INV" ? "Invoice" : doc.type === "QT" ? "Quotation"
      : doc.type === "DN" ? "Delivery Note" : doc.type === "CN" ? "Credit Note" : doc.type;
    const msg = `Dear ${name},\nYour ${kind} ${doc.number} totalling QAR ${Number(doc.total).toFixed(2)} has been issued by Mamun M Trading and Contracting W.L.L.\nThank you for your business.`;
    if (!phone) {
      // No number on file → send them to the customer page to add one / pick a contact.
      toast({ title: "No phone number on file", description: "Add a phone to this customer to message directly.", variant: "destructive" });
    }
    // With a phone → opens the chat to that number; without → WhatsApp contact picker.
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* ── Page header ── */}
      <div className="page-header">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isTodayView ? (creditOnly ? "Today's Credit Invoices" : "Today's Invoices") : "Documents"}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {isTodayView
                ? `${todayStr} · total QAR ${todayTotal.toFixed(2)}`
                : "Invoices, Quotations, Delivery Notes, Credit Notes"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary-action text-sm"
            onClick={() => nav("/documents/new/INV")}
          >
            <Plus className="w-4 h-4" /> Invoice
          </button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-lg"
            onClick={() => nav("/documents/new/QT")}
          >
            <Plus className="w-4 h-4" /> Quotation
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-lg"
            onClick={() => nav("/documents/new/DN")}
          >
            <Plus className="w-4 h-4" /> DN
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-lg border-emerald-600/40 text-emerald-700 hover:bg-emerald-50"
            onClick={() => nav("/purchase-orders/new")}
          >
            <Plus className="w-4 h-4" /> Purchase Order
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as DocType);
          resetPage();
        }}
      >
        <TabsList className="flex-wrap h-auto gap-1 bg-muted/40 rounded-xl border border-border/30 p-1.5">
          {TAB_TYPES.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm rounded-lg">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ── Filters row ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search number or customer..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="pl-8 h-9 text-sm"
          />
        </div>

        {/* Status */}
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v as DocStatus); resetPage(); }}
        >
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <Filter className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
            <SelectItem value="partial_return">Partial Return</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="void">Void</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>

        {/* Date from */}
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
          className="h-9 w-[140px] text-sm"
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
          className="h-9 w-[140px] text-sm"
          placeholder="To"
        />

        {/* Clear filters */}
        {(search || statusFilter !== "all" || dateFrom || dateTo) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setDateFrom("");
              setDateTo("");
              resetPage();
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* ── Results count ── */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== allDocs.length ? ` (filtered from ${allDocs.length})` : ""}
        </p>
      )}

      {/* ── Table (desktop) ── */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="font-semibold text-xs uppercase tracking-wide">Number</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wide w-16">Type</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wide">Customer</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wide">Date</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Total</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : pageDocs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No documents found</p>
                  <p className="text-xs mt-1">
                    {search || statusFilter !== "all" || dateFrom || dateTo
                      ? "Try clearing your filters"
                      : "Create your first document using the buttons above"}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              pageDocs.map((doc) => (
                <TableRow
                  key={doc.id}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => nav(`/documents/${doc.id}`)}
                >
                  <TableCell className="font-mono font-semibold text-sm">
                    {doc.number}
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={doc.type} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {doc.customerName || (
                      <span className="text-muted-foreground italic">Walk-in</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(doc.date), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-sm">
                    QAR {Number(doc.total).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={doc.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="View"
                        onClick={() => nav(`/documents/${doc.id}`)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Print"
                        onClick={() => handlePrint(doc)}
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-600 hover:text-green-700"
                        title="WhatsApp"
                        onClick={() => handleWhatsApp(doc)}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Card list (mobile) ── */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-4 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))
        ) : pageDocs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No documents found</p>
          </div>
        ) : (
          pageDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onPrint={handlePrint}
              onWhatsApp={handleWhatsApp}
            />
          ))
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
