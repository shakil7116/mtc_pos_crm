import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ClipboardList, Package, AlertTriangle, CheckCircle2, XCircle,
  Search as SearchIcon, Clock, User, ArrowRight, ChevronDown, ChevronUp,
  PlayCircle, RotateCcw, UserPlus,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PickItem {
  id: number;
  noteId: number;
  documentItemId: number | null;
  productId: number;
  description: string;
  unit: string;
  totalQty: string;
  sourceStoreId: number;
  splitQty: string;
  bringTo: number | null;
  staffGroup: string;
  arranged: boolean;
  pickedQty: string | null;
  issueType: string | null;
  issueNote: string | null;
  pickedAt: string | null;
  store: { id: number; name: string };
}

interface PickNote {
  note: {
    id: number;
    documentId: number;
    pickupLocationId: number | null;
    deliveryMethod: string | null;
    status: string;
    pickedById: number | null;
    pickedAt: string | null;
    readyAt: string | null;
    completedAt: string | null;
    completedById: number | null;
    hasIssues: boolean;
    createdAt: string;
  };
  doc: {
    id: number;
    number: string;
    customerName: string | null;
    total: string;
    createdAt: string | null;
  };
  items: PickItem[];
  pickedByName?: string;
}

type IssueType = "not_found" | "partial" | "damaged" | "wrong_item";

const ISSUE_LABELS: Record<IssueType, { label: string; icon: typeof AlertTriangle; color: string }> = {
  not_found: { label: "Not Found", icon: XCircle, color: "text-red-500" },
  partial: { label: "Partial Stock", icon: AlertTriangle, color: "text-amber-500" },
  damaged: { label: "Damaged", icon: AlertTriangle, color: "text-orange-500" },
  wrong_item: { label: "Wrong Item", icon: RotateCcw, color: "text-purple-500" },
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Waiting", variant: "outline" },
  picking: { label: "Picking", variant: "default" },
  ready: { label: "Ready", variant: "secondary" },
  completed: { label: "Done", variant: "secondary" },
};

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;

const timeAgo = (iso?: string | null) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function PickQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignNoteId, setReassignNoteId] = useState<number | null>(null);

  const isManager = user?.role === "admin" || user?.role === "manager";

  // ─── Data ───────────────────────────────────────────────────────────────

  const { data: queue = [], isLoading } = useQuery<PickNote[]>({
    queryKey: ["/api/pick-notes/queue"],
    // Keep previous data during refetch so the dialog doesn't flicker
    placeholderData: (prev) => prev,
    refetchInterval: 15000,
  });

  const { data: allUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["/api/users"],
    enabled: isManager,
  });

  const helperUsers = useMemo(
    () => allUsers.filter(u => ["worker", "salesman"].includes(u.role)),
    [allUsers],
  );

  // ─── Mutations ──────────────────────────────────────────────────────────

  const claimMut = useMutation({
    mutationFn: async (noteId: number) => {
      const res = await fetch(`/api/arrangement-notes/${noteId}/pick`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pick-notes/queue"] });
      toast({ title: "Claimed", description: "Pick note assigned to you. Start picking!" });
    },
    onError: (err: Error) => toast({ title: "Cannot claim", description: err.message, variant: "destructive" }),
  });

  const updateItemMut = useMutation({
    mutationFn: async ({ noteId, itemId, data }: { noteId: number; itemId: number; data: any }) => {
      const res = await fetch(`/api/arrangement-notes/${noteId}/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/pick-notes/queue"] }),
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const completeMut = useMutation({
    mutationFn: async (noteId: number) => {
      const res = await fetch(`/api/arrangement-notes/${noteId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/pick-notes/queue"] });
      setSelectedNoteId(null);
      if (data.hasIssues) {
        toast({ title: "Completed with issues", description: `${data.issueCount} item(s) reported — salesman notified.` });
      } else {
        toast({ title: "Pick complete", description: "All items picked successfully. Salesman notified." });
      }
    },
    onError: (err: Error) => toast({ title: "Cannot complete", description: err.message, variant: "destructive" }),
  });

  const reassignMut = useMutation({
    mutationFn: async ({ noteId, userId }: { noteId: number; userId: number }) => {
      const res = await fetch(`/api/arrangement-notes/${noteId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pick-notes/queue"] });
      setReassignOpen(false);
      toast({ title: "Reassigned" });
    },
    onError: (err: Error) => toast({ title: "Reassign failed", description: err.message, variant: "destructive" }),
  });

  // ─── Filtering ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = queue;
    if (statusFilter === "active") {
      list = list.filter(n => ["pending", "picking"].includes(n.note.status));
    } else if (statusFilter !== "all") {
      list = list.filter(n => n.note.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        n.doc.number.toLowerCase().includes(q) ||
        (n.doc.customerName ?? "").toLowerCase().includes(q) ||
        n.items.some(i => i.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [queue, statusFilter, search]);

  const counts = useMemo(() => ({
    pending: queue.filter(n => n.note.status === "pending").length,
    picking: queue.filter(n => n.note.status === "picking").length,
    ready: queue.filter(n => n.note.status === "ready").length,
    completed: queue.filter(n => n.note.status === "completed").length,
  }), [queue]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Pick Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick and verify items for invoices. Report issues before marking done.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Waiting" count={counts.pending} accent="bg-amber-500/10 text-amber-600 dark:text-amber-400" icon={Clock} />
        <StatCard label="Picking" count={counts.picking} accent="bg-blue-500/10 text-blue-600 dark:text-blue-400" icon={Package} />
        <StatCard label="Ready" count={counts.ready} accent="bg-green-500/10 text-green-600 dark:text-green-400" icon={CheckCircle2} />
        <StatCard label="Done" count={counts.completed} accent="bg-muted text-muted-foreground" icon={CheckCircle2} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice, customer, product…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="flex gap-1">
          {[
            { key: "active", label: "Active" },
            { key: "pending", label: "Waiting" },
            { key: "picking", label: "Picking" },
            { key: "completed", label: "Done" },
            { key: "all", label: "All" },
          ].map(f => (
            <Button
              key={f.key}
              variant={statusFilter === f.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Queue list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pick notes{statusFilter !== "all" ? ` (${statusFilter})` : ""}</p>
          <p className="text-sm mt-1">New invoices will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(pn => (
            <PickNoteCard
              key={pn.note.id}
              pn={pn}
              userId={user?.id ?? 0}
              isManager={isManager}
              onClaim={() => claimMut.mutate(pn.note.id)}
              onOpen={() => setSelectedNoteId(pn.note.id)}
              onReassign={() => { setReassignNoteId(pn.note.id); setReassignOpen(true); }}
              claiming={claimMut.isPending}
            />
          ))}
        </div>
      )}

      {/* Pick detail dialog */}
      {selectedNoteId != null && queue.find(n => n.note.id === selectedNoteId) && (
        <PickDetailDialog
          key={selectedNoteId}
          pn={queue.find(n => n.note.id === selectedNoteId)!}
          userId={user?.id ?? 0}
          isManager={isManager}
          onClose={() => setSelectedNoteId(null)}
          onUpdateItem={(itemId, data) =>
            updateItemMut.mutate({ noteId: selectedNoteId, itemId, data })
          }
          onComplete={() => completeMut.mutate(selectedNoteId)}
          completing={completeMut.isPending}
        />
      )}

      {/* Reassign dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reassign Pick Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {helperUsers.map(u => (
              <Button
                key={u.id}
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => reassignNoteId && reassignMut.mutate({ noteId: reassignNoteId, userId: u.id })}
                disabled={reassignMut.isPending}
              >
                <User className="h-4 w-4" />
                {u.name}
                <span className="text-xs text-muted-foreground ml-auto">{u.role}</span>
              </Button>
            ))}
            {helperUsers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No assignable staff found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, count, accent, icon: Icon }: { label: string; count: number; accent: string; icon: typeof Clock }) {
  return (
    <div className={`rounded-lg p-3 flex items-center gap-3 ${accent}`}>
      <Icon className="h-5 w-5" />
      <div>
        <div className="text-2xl font-bold leading-none">{count}</div>
        <div className="text-xs mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ─── Pick Note Card ─────────────────────────────────────────────────────────

function PickNoteCard({
  pn, userId, isManager, onClaim, onOpen, onReassign, claiming,
}: {
  pn: PickNote; userId: number; isManager: boolean;
  onClaim: () => void; onOpen: () => void; onReassign: () => void; claiming: boolean;
}) {
  const sb = STATUS_BADGE[pn.note.status] ?? STATUS_BADGE.pending;
  const isMine = pn.note.pickedById === userId;
  const canPick = pn.note.status === "pending";
  const canOpen = pn.note.status === "picking" && isMine;
  const itemCount = pn.items.length;
  const pickedCount = pn.items.filter(i => i.pickedQty !== null || i.issueType !== null).length;
  const issueCount = pn.items.filter(i => i.issueType).length;

  return (
    <div
      className={`border rounded-lg p-3 sm:p-4 transition-colors ${
        canPick ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 hover:border-amber-400" :
        canOpen ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20" :
        pn.note.hasIssues ? "border-red-200 dark:border-red-800" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/documents/${pn.doc.id}`}>
              <span className="font-mono font-semibold text-sm hover:underline cursor-pointer">{pn.doc.number}</span>
            </Link>
            <Badge variant={sb.variant} className="text-[10px] h-5">{sb.label}</Badge>
            {pn.note.hasIssues && (
              <Badge variant="destructive" className="text-[10px] h-5">Issues</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {pn.doc.customerName ?? "Walk-in"} &middot; {money(pn.doc.total)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {itemCount} item{itemCount !== 1 ? "s" : ""}
              {pn.note.status === "picking" && ` (${pickedCount}/${itemCount} checked)`}
            </span>
            {issueCount > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertTriangle className="h-3 w-3" />
                {issueCount} issue{issueCount !== 1 ? "s" : ""}
              </span>
            )}
            {pn.pickedByName && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {pn.pickedByName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(pn.doc.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canPick && (
            <Button size="sm" onClick={onClaim} disabled={claiming} className="gap-1">
              <PlayCircle className="h-4 w-4" />
              Start Picking
            </Button>
          )}
          {pn.note.status === "picking" && isMine && (
            <Button size="sm" onClick={onOpen} className="gap-1">
              <ArrowRight className="h-4 w-4" />
              Continue
            </Button>
          )}
          {pn.note.status === "picking" && !isMine && (
            <span className="text-xs text-muted-foreground">Assigned to {pn.pickedByName}</span>
          )}
          {pn.note.status === "completed" && (
            <Button size="sm" variant="outline" onClick={onOpen} className="gap-1">
              View
            </Button>
          )}
          {isManager && pn.note.status !== "completed" && (
            <Button size="icon" variant="ghost" onClick={onReassign} title="Reassign">
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pick Detail Dialog ─────────────────────────────────────────────────────

function PickDetailDialog({
  pn, userId, isManager, onClose, onUpdateItem, onComplete, completing,
}: {
  pn: PickNote; userId: number; isManager: boolean;
  onClose: () => void;
  onUpdateItem: (itemId: number, data: any) => void;
  onComplete: () => void;
  completing: boolean;
}) {
  const items = pn.items;
  const isMine = pn.note.pickedById === userId;
  const canEdit = pn.note.status === "picking" && isMine;
  const allChecked = items.every(i => i.pickedQty !== null || i.issueType !== null);
  const hasIssues = items.some(i => i.issueType);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Picking: {pn.doc.number}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {pn.doc.customerName ?? "Walk-in"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {items.map((item, idx) => (
            <PickItemRow
              key={item.id}
              item={item}
              index={idx}
              canEdit={canEdit}
              onUpdate={(data) => onUpdateItem(item.id, data)}
            />
          ))}
        </div>

        {canEdit && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {allChecked ? (
                hasIssues ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Issues found — salesman will be notified
                  </span>
                ) : (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    All items picked — no issues
                  </span>
                )
              ) : (
                `${items.filter(i => i.pickedQty !== null || i.issueType !== null).length}/${items.length} items checked`
              )}
            </div>
            <Button
              onClick={onComplete}
              disabled={completing || !allChecked}
              className="gap-1"
              variant={hasIssues ? "destructive" : "default"}
            >
              <CheckCircle2 className="h-4 w-4" />
              {completing ? "Completing…" : hasIssues ? "Done (with issues)" : "Done — All Good"}
            </Button>
          </div>
        )}

        {pn.note.status === "completed" && (
          <div className={`mt-4 pt-4 border-t text-sm flex items-center gap-2 ${pn.note.hasIssues ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
            {pn.note.hasIssues ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            Completed {timeAgo(pn.note.completedAt)} {pn.note.hasIssues ? "with issues" : "— all clear"}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Single Pick Item Row ───────────────────────────────────────────────────

function PickItemRow({
  item, index, canEdit, onUpdate,
}: {
  item: PickItem; index: number; canEdit: boolean;
  onUpdate: (data: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [issueType, setIssueType] = useState<string>(item.issueType ?? "");
  const [pickedQty, setPickedQty] = useState(item.pickedQty ?? item.splitQty);
  const [issueNote, setIssueNote] = useState(item.issueNote ?? "");

  const isChecked = item.pickedQty !== null || item.issueType !== null;
  const hasIssue = !!item.issueType;
  const reqQty = Number(item.splitQty);

  const handleOk = () => {
    onUpdate({ pickedQty: reqQty, issueType: null, issueNote: null });
  };

  const handleSaveIssue = () => {
    onUpdate({
      pickedQty: issueType === "partial" ? Number(pickedQty) : 0,
      issueType,
      issueNote: issueNote || null,
    });
    setExpanded(false);
  };

  const issueInfo = item.issueType ? ISSUE_LABELS[item.issueType as IssueType] : null;

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      hasIssue ? "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10" :
      isChecked ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10" : ""
    }`}>
      <div className="p-3 flex items-center gap-3">
        {/* Status indicator */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
          hasIssue ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300" :
          isChecked ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300" :
          "bg-muted text-muted-foreground"
        }`}>
          {hasIssue ? "!" : isChecked ? "✓" : index + 1}
        </div>

        {/* Item info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{item.description}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <span>{reqQty} {item.unit}</span>
            <span>&middot;</span>
            <span>from {item.store.name}</span>
            {issueInfo && (
              <>
                <span>&middot;</span>
                <span className={`flex items-center gap-0.5 ${issueInfo.color}`}>
                  {issueInfo.label}
                  {item.issueType === "partial" && ` (${item.pickedQty}/${item.splitQty})`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        {canEdit && !isChecked && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setExpanded(!expanded)} className="gap-1 h-8 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              Issue
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button size="sm" onClick={handleOk} className="gap-1 h-8 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
              OK
            </Button>
          </div>
        )}

        {canEdit && isChecked && !hasIssue && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-green-600" onClick={() => onUpdate({ pickedQty: null, issueType: null, issueNote: null })}>
            Undo
          </Button>
        )}

        {canEdit && isChecked && hasIssue && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-red-500" onClick={() => { onUpdate({ pickedQty: null, issueType: null, issueNote: null }); setIssueType(""); setIssueNote(""); }}>
            Clear Issue
          </Button>
        )}
      </div>

      {/* Expanded issue form */}
      {expanded && canEdit && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/30 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(ISSUE_LABELS) as [IssueType, typeof ISSUE_LABELS.not_found][]).map(([key, val]) => (
              <Button
                key={key}
                variant={issueType === key ? "default" : "outline"}
                size="sm"
                className="justify-start gap-1.5 h-9 text-xs"
                onClick={() => setIssueType(key)}
              >
                <val.icon className={`h-3.5 w-3.5 ${issueType === key ? "" : val.color}`} />
                {val.label}
              </Button>
            ))}
          </div>

          {issueType === "partial" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Available qty:</span>
              <Input
                type="number"
                min={0}
                max={reqQty}
                value={pickedQty}
                onChange={e => setPickedQty(e.target.value)}
                className="h-8 w-24"
              />
              <span className="text-xs text-muted-foreground">/ {reqQty} {item.unit}</span>
            </div>
          )}

          <Textarea
            placeholder="Optional note (e.g., shelf was empty, box crushed…)"
            value={issueNote}
            onChange={e => setIssueNote(e.target.value)}
            className="h-16 text-sm"
          />

          <div className="flex justify-end">
            <Button size="sm" disabled={!issueType} onClick={handleSaveIssue} className="gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Save Issue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
