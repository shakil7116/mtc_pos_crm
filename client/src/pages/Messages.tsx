import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  MessageCircle,
  Send,
  SkipForward,
  Pencil,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Settings2,
  Settings,
  CheckCircle,
  Phone,
  RefreshCw,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */
type QueueItem = {
  customer: {
    id: number;
    name: string;
    phone: string | null;
  };
  invoice?: {
    id: number;
    number: string;
    total: number | string;
    date: string;
  };
  cheque?: {
    id: number;
    chequeNumber: string;
    bankName: string;
    amount: number | string;
    chequeDate: string;
  };
  template: "gentle" | "firm" | "urgent" | "statement" | "cheque";
  message: string;
  urgency: "low" | "medium" | "high";
  daysOverdue: number;
};

type MessageLog = {
  id: number;
  customerId: number | null;
  documentId: number | null;
  type: string;
  content: string;
  sentAt: string;
  sentBy: string | null;
  skipped: boolean | null;
  customerName?: string;
};

type Settings = {
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  maxMessagesPerDay?: number | null;
  whatsapp?: string | null;
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
const TEMPLATE_LABELS: Record<string, string> = {
  gentle: "Gentle Reminder",
  firm: "Firm Reminder",
  urgent: "Urgent Notice",
  statement: "Account Statement",
  cheque: "Cheque Due",
};

const URGENCY_COLOR: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-orange-400",
  low: "bg-yellow-400",
};

const TEMPLATE_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  gentle: "secondary",
  firm: "default",
  urgent: "destructive",
  statement: "outline",
  cheque: "outline",
};

function formatPhone(phone: string): string {
  // Normalize Qatar numbers: strip leading 0 or country code
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("974")) return `+${digits}`;
  if (digits.startsWith("00974")) return `+${digits.slice(2)}`;
  return `+974${digits}`;
}

function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = formatPhone(phone);
  return `https://wa.me/${normalized.replace("+", "")}?text=${encodeURIComponent(message)}`;
}

function truncateLines(text: string, lines = 2): string {
  return text.split("\n").slice(0, lines).join("\n");
}

function fmtAmount(v: number | string): string {
  return `QAR ${parseFloat(String(v)).toLocaleString("en-QA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────────────────── */

/* Settings banner at top */
function SettingsBanner({ settings }: { settings?: Settings }) {
  const start = settings?.quietHoursStart ?? "22:00";
  const end = settings?.quietHoursEnd ?? "08:00";
  const max = settings?.maxMessagesPerDay ?? 20;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
      <Clock className="w-4 h-4 shrink-0 text-blue-500" />
      <span>
        Messages allowed:{" "}
        <strong>
          {end} – {start}
        </strong>
      </span>
      <Separator orientation="vertical" className="h-4 bg-blue-200 hidden sm:block" />
      <span>
        Max per day: <strong>{max}</strong>
      </span>
      <div className="ml-auto">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="text-blue-700 hover:text-blue-900 h-7 px-2">
            <Settings2 className="w-3.5 h-3.5 mr-1" />
            Change
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* Urgency color bar + label */
function UrgencyBar({ urgency }: { urgency: string }) {
  return (
    <div
      className={cn(
        "w-1.5 shrink-0 rounded-full self-stretch min-h-[4rem]",
        URGENCY_COLOR[urgency] ?? "bg-gray-300"
      )}
    />
  );
}

/* Individual queue card */
function QueueCard({
  item,
  onSent,
  onSkipped,
}: {
  item: QueueItem;
  onSent: (item: QueueItem, message: string) => void;
  onSkipped: (item: QueueItem) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editedMsg, setEditedMsg] = useState(item.message);

  const phone = item.customer.phone ?? "";
  const hasPhone = phone.trim().length > 0;

  function handleSend(msg: string) {
    if (!hasPhone) return;
    const url = buildWhatsAppUrl(phone, msg);
    window.open(url, "_blank");
    onSent(item, msg);
  }

  return (
    <>
      <Card className="border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-0">
          <div className="flex gap-0">
            {/* Urgency bar */}
            <UrgencyBar urgency={item.urgency} />

            {/* Content */}
            <div className="flex-1 p-4 min-w-0">
              {/* Top row */}
              <div className="flex flex-wrap items-start gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {item.customer.name}
                  </p>
                  {phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />
                      {phone}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={TEMPLATE_BADGE_VARIANT[item.template]}>
                    {TEMPLATE_LABELS[item.template]}
                  </Badge>
                  {item.daysOverdue > 0 && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {item.daysOverdue}d overdue
                    </Badge>
                  )}
                </div>
              </div>

              {/* Invoice / Cheque info */}
              {item.invoice && (
                <p className="text-xs text-muted-foreground mb-2">
                  Invoice{" "}
                  <span className="font-medium text-foreground">
                    #{item.invoice.number}
                  </span>{" "}
                  · {fmtAmount(item.invoice.total)}
                </p>
              )}
              {item.cheque && (
                <p className="text-xs text-muted-foreground mb-2">
                  Cheque{" "}
                  <span className="font-medium text-foreground">
                    #{item.cheque.chequeNumber}
                  </span>{" "}
                  · {fmtAmount(item.cheque.amount)} · {item.cheque.bankName}
                </p>
              )}

              {/* Message preview */}
              <div className="bg-muted/50 rounded-md px-3 py-2 mb-3">
                <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-2 leading-relaxed">
                  {truncateLines(item.message, 2)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                  disabled={!hasPhone}
                  onClick={() => handleSend(item.message)}
                  title={hasPhone ? "Open WhatsApp" : "No phone number"}
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setEditedMsg(item.message);
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => onSkipped(item)}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Skip
                </Button>
                {!hasPhone && (
                  <span className="text-xs text-destructive flex items-center gap-1 ml-1">
                    <AlertTriangle className="w-3 h-3" /> No phone
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Message — {item.customer.name}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editedMsg}
            onChange={(e) => setEditedMsg(e.target.value)}
            rows={10}
            className="resize-none text-sm font-mono"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              disabled={!hasPhone}
              onClick={() => {
                setEditOpen(false);
                handleSend(editedMsg);
              }}
            >
              <Send className="w-4 h-4" />
              Send via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Queue Tab
───────────────────────────────────────────────────────────────────────────── */
function QueueTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const {
    data: queue,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<QueueItem[]>({
    queryKey: ["/api/messages/queue"],
    queryFn: () => fetch("/api/messages/queue").then((r) => r.json()),
    staleTime: 30_000,
  });

  const logMutation = useMutation({
    mutationFn: (body: {
      customerId: number;
      documentId?: number;
      type: string;
      content: string;
      sentBy: string;
      skipped: boolean;
    }) =>
      fetch("/api/messages/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messages/queue"] });
      qc.invalidateQueries({ queryKey: ["/api/messages"] });
    },
  });

  // Remove items from local list optimistically
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  function itemKey(item: QueueItem) {
    return `${item.customer.id}-${item.template}-${item.invoice?.id ?? "none"}`;
  }

  function handleSent(item: QueueItem, message: string) {
    setSkippedIds((prev) => new Set(Array.from(prev).concat(itemKey(item))));
    logMutation.mutate({
      customerId: item.customer.id,
      documentId: item.invoice?.id,
      type: item.template,
      content: message,
      sentBy: user?.name ?? "staff",
      skipped: false,
    });
    toast({ title: "Message sent", description: `WhatsApp opened for ${item.customer.name}` });
  }

  function handleSkipped(item: QueueItem) {
    setSkippedIds((prev) => new Set(Array.from(prev).concat(itemKey(item))));
    logMutation.mutate({
      customerId: item.customer.id,
      documentId: item.invoice?.id,
      type: item.template,
      content: item.message,
      sentBy: user?.name ?? "staff",
      skipped: true,
    });
    toast({ title: "Skipped", description: `${item.customer.name} skipped for today` });
  }

  const visibleQueue = (queue ?? []).filter(
    (item) => !skippedIds.has(itemKey(item))
  );

  // Send All — open WhatsApp for each with a short delay
  async function handleSendAll() {
    const withPhone = visibleQueue.filter((i) => i.customer.phone);
    if (withPhone.length === 0) {
      toast({ title: "No messages to send", description: "All items lack phone numbers.", variant: "destructive" });
      return;
    }
    for (let idx = 0; idx < withPhone.length; idx++) {
      const item = withPhone[idx];
      const url = buildWhatsAppUrl(item.customer.phone!, item.message);
      if (idx === 0) {
        window.open(url, "_blank");
      } else {
        // Subsequent windows in same session
        window.open(url, `_wa_${idx}`);
      }
      handleSent(item, item.message);
      // Small delay between windows to avoid popup blocker
      if (idx < withPhone.length - 1) {
        await new Promise((res) => setTimeout(res, 800));
      }
    }
    toast({
      title: "Send All complete",
      description: `${withPhone.length} WhatsApp window(s) opened`,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Queue header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-foreground">
            {visibleQueue.length === 0
              ? "No pending messages"
              : `${visibleQueue.length} message${visibleQueue.length !== 1 ? "s" : ""} ready to send`}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
        {visibleQueue.length > 0 && (
          <Button
            size="sm"
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleSendAll}
          >
            <Send className="w-3.5 h-3.5" />
            Send All ({visibleQueue.filter((i) => i.customer.phone).length})
          </Button>
        )}
      </div>

      {/* Urgency legend */}
      {visibleQueue.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
            Urgent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400" />
            Firm
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
            Gentle
          </span>
        </div>
      )}

      {/* Cards */}
      {visibleQueue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <CheckCircle2 className="w-12 h-12 text-green-500 opacity-60" />
          <p className="text-base font-medium">All caught up!</p>
          <p className="text-sm">No messages pending for today.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleQueue.map((item) => (
            <QueueCard
              key={itemKey(item)}
              item={item}
              onSent={handleSent}
              onSkipped={handleSkipped}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   History Tab
───────────────────────────────────────────────────────────────────────────── */
function HistoryTab() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: logs, isLoading } = useQuery<MessageLog[]>({
    queryKey: ["/api/messages"],
    queryFn: () => fetch("/api/messages").then((r) => r.json()),
    staleTime: 30_000,
  });

  const filtered = (logs ?? []).filter((log) => {
    const matchSearch =
      search === "" ||
      (log.customerName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      log.content.toLowerCase().includes(search.toLowerCase());

    const matchType =
      filterType === "all" || log.type === filterType;

    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "sent" && !log.skipped) ||
      (filterStatus === "skipped" && log.skipped);

    return matchSearch && matchType && matchStatus;
  });

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or message…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="gentle">Gentle</SelectItem>
            <SelectItem value="firm">Firm</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="statement">Statement</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-36 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
        {(search || filterType !== "all" || filterStatus !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-muted-foreground"
            onClick={() => {
              setSearch("");
              setFilterType("all");
              setFilterStatus("all");
            }}
          >
            <XCircle className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} record{filtered.length !== 1 ? "s" : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
          <MessageCircle className="w-10 h-10 opacity-30" />
          <p className="text-sm">No message history found</p>
        </div>
      ) : (
        /* Desktop table + mobile cards */
        <>
          {/* Desktop */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <ScrollArea className="h-[calc(100vh-340px)] min-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-36">Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="w-36">Type</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Preview</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <>
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() =>
                          setExpandedId(expandedId === log.id ? null : log.id)
                        }
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(parseISO(log.sentAt), "dd MMM yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {log.customerName ?? `Customer #${log.customerId}`}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              TEMPLATE_BADGE_VARIANT[log.type] ?? "secondary"
                            }
                            className="text-xs"
                          >
                            {TEMPLATE_LABELS[log.type] ?? log.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.skipped ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <SkipForward className="w-3.5 h-3.5" />
                              Skipped
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Sent
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {log.content.split("\n")[0]}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {expandedId === log.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedId === log.id && (
                        <TableRow key={`${log.id}-expand`} className="bg-muted/20">
                          <TableCell colSpan={6} className="py-3 px-6">
                            <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground bg-white dark:bg-background rounded p-3 border">
                              {log.content}
                            </pre>
                            {log.sentBy && (
                              <p className="text-xs text-muted-foreground mt-1.5">
                                Recorded by: {log.sentBy}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((log) => (
              <Card
                key={log.id}
                className="cursor-pointer"
                onClick={() =>
                  setExpandedId(expandedId === log.id ? null : log.id)
                }
              >
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">
                      {log.customerName ?? `Customer #${log.customerId}`}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={
                          TEMPLATE_BADGE_VARIANT[log.type] ?? "secondary"
                        }
                        className="text-xs"
                      >
                        {TEMPLATE_LABELS[log.type] ?? log.type}
                      </Badge>
                      {log.skipped ? (
                        <SkipForward className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(log.sentAt), "dd MMM yyyy HH:mm")}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {log.content.split("\n")[0]}
                  </p>
                  {expandedId === log.id && (
                    <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed bg-muted/40 rounded p-2 mt-1">
                      {log.content}
                    </pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   WhatsApp Business API integration (Phase 4 prep)
───────────────────────────────────────────────────────────────────────────── */
const WHATSAPP_CONFIG_KEY = "mtc_whatsapp_config";

type WhatsAppConfig = {
  phoneNumberId: string;
  token: string;
  template: string;
};

const DEFAULT_TEMPLATE =
  "Hello {{customerName}}, this is a friendly reminder regarding invoice {{invoiceNumber}} for {{amount}}. Please arrange payment at your earliest convenience. Thank you.";

type WhatsAppApiStatus = "not_configured" | "connected";

/**
 * STUB — placeholder for the real WhatsApp Business Cloud API call.
 * Builds the payload that the backend would forward to Meta's Cloud API,
 * logs it, and falls back to opening the existing wa.me link so the user
 * is never blocked while the backend is being wired up.
 *
 * TODO: replace with real WhatsApp Business Cloud API call (POST /api/whatsapp/send)
 */
function sendViaWhatsAppApi(item: QueueItem) {
  const phone = item.customer?.phone ?? "";
  const amountValue = item.invoice?.total ?? item.cheque?.amount ?? 0;
  const invoiceNumber = item.invoice?.number ?? item.cheque?.chequeNumber ?? "";

  const payload = {
    to: phone ? formatPhone(phone) : "",
    template: item.template,
    variables: {
      customerName: item.customer?.name ?? "",
      invoiceNumber,
      amount: fmtAmount(amountValue),
    },
  };

  console.warn("[WhatsApp API stub] would POST to /api/whatsapp/send", payload);

  // Fall back to opening the existing wa.me link (current behaviour)
  if (phone.trim().length > 0) {
    window.open(buildWhatsAppUrl(phone, item.message), "_blank");
  }
}

/* Connection status indicator: colored dot + label */
function ApiStatusIndicator({ status }: { status: WhatsAppApiStatus }) {
  const connected = status === "connected";
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span
        className={cn(
          "inline-block w-2.5 h-2.5 rounded-full",
          connected ? "bg-green-500" : "bg-amber-400"
        )}
      />
      <span
        className={cn(
          "font-medium",
          connected ? "text-green-700" : "text-amber-700"
        )}
      >
        {connected ? "Connected" : "Not configured"}
      </span>
    </span>
  );
}

function WhatsAppApiCard({ queue }: { queue?: QueueItem[] }) {
  const { toast } = useToast();
  const [apiStatus, setApiStatus] = useState<WhatsAppApiStatus>("not_configured");
  const [configOpen, setConfigOpen] = useState(false);

  // Form state
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);

  // On mount: read persisted config from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WHATSAPP_CONFIG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<WhatsAppConfig>;
      if (parsed?.phoneNumberId && parsed?.token) {
        setApiStatus("connected");
        setPhoneNumberId(parsed.phoneNumberId);
        setToken(parsed.token);
        if (typeof parsed.template === "string" && parsed.template.length > 0) {
          setTemplate(parsed.template);
        }
      }
    } catch {
      // Ignore malformed localStorage payloads
    }
  }, []);

  function handleSaveConfig() {
    if (phoneNumberId.trim().length === 0 || token.trim().length === 0) {
      toast({
        title: "Missing details",
        description: "Phone Number ID and Access Token are required.",
        variant: "destructive",
      });
      return;
    }
    const config: WhatsAppConfig = {
      phoneNumberId: phoneNumberId.trim(),
      token: token.trim(),
      template,
    };
    try {
      localStorage.setItem(WHATSAPP_CONFIG_KEY, JSON.stringify(config));
    } catch {
      // Ignore storage write failures (e.g. private mode)
    }
    // TODO: POST to server-side /api/whatsapp/config when WhatsApp backend wired
    setApiStatus("connected");
    setConfigOpen(false);
    toast({
      title: "WhatsApp API configured",
      description: "Connection details saved on this device.",
    });
  }

  function handleSendAllReminders() {
    if (apiStatus !== "connected") return;
    const items = Array.isArray(queue) ? queue : [];
    const withPhone = items.filter((i) => (i.customer?.phone ?? "").trim().length > 0);
    if (withPhone.length === 0) {
      toast({
        title: "Nothing to send",
        description: "No reminders with phone numbers in the queue.",
        variant: "destructive",
      });
      return;
    }
    withPhone.forEach((item) => sendViaWhatsAppApi(item));
    toast({
      title: "Reminders triggered",
      description: `${withPhone.length} reminder(s) sent via WhatsApp API stub.`,
    });
  }

  const reminderCount = (Array.isArray(queue) ? queue : []).filter(
    (i) => (i.customer?.phone ?? "").trim().length > 0
  ).length;

  return (
    <>
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* Title + status */}
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-foreground leading-tight">
                    WhatsApp Business API
                  </h2>
                  <ApiStatusIndicator status={apiStatus} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Trigger Customer Payment Reminders directly through the WhatsApp
                  Business Cloud API.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setConfigOpen(true)}
              >
                <Settings className="w-3.5 h-3.5" />
                Configure
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                disabled={apiStatus !== "connected"}
                onClick={handleSendAllReminders}
                title={
                  apiStatus === "connected"
                    ? "Send all reminders via WhatsApp API"
                    : "Configure the WhatsApp API first"
                }
              >
                <Send className="w-3.5 h-3.5" />
                Send All Reminders
                {reminderCount > 0 && ` (${reminderCount})`}
              </Button>
            </div>
          </div>

          {apiStatus === "connected" && (
            <p className="text-xs text-green-700 flex items-center gap-1 mt-3">
              <CheckCircle className="w-3.5 h-3.5" />
              API connected — reminders can be sent automatically.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Configure dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-green-600" />
              WhatsApp Business API
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Phone Number ID
              </label>
              <Input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 123456789012345"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Access Token
              </label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Permanent access token"
                className="text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Default message template
              </label>
              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={5}
                className="resize-none text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Variables: {"{{customerName}}"}, {"{{invoiceNumber}}"}, {"{{amount}}"}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSaveConfig}
            >
              <CheckCircle className="w-4 h-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Page
───────────────────────────────────────────────────────────────────────────── */
export default function Messages() {
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 300_000,
  });

  const { data: queue } = useQuery<QueueItem[]>({
    queryKey: ["/api/messages/queue"],
    queryFn: () => fetch("/api/messages/queue").then((r) => r.json()),
    staleTime: 30_000,
  });

  const queueCount = Array.isArray(queue) ? queue.length : 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight">
            Collections & Messages
          </h1>
          <p className="text-xs text-muted-foreground">
            WhatsApp collection reminders for overdue invoices
          </p>
        </div>
      </div>

      {/* Settings reminder banner */}
      <SettingsBanner settings={settings} />

      {/* WhatsApp Business API integration */}
      <WhatsAppApiCard queue={queue} />

      {/* Tabs */}
      <Tabs defaultValue="queue">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="queue" className="relative flex-1 sm:flex-none gap-1.5">
            Message Queue
            {queueCount > 0 && (
              <Badge className="bg-green-600 text-white text-[10px] h-4 px-1.5 min-w-[1.25rem] justify-center">
                {queueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 sm:flex-none">
            Message History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
