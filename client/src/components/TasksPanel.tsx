import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Plus, Check, Loader2, Play, RotateCcw, Trash2,
  Clock, ShieldCheck, CheckCheck, CircleDot, Timer, Eye,
  ArrowRight, User, CalendarDays, Zap, MessageSquare,
} from "lucide-react";

const ASSIGNER_ROLES = ["admin", "manager", "worker", "salesman"];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: "Assigned", color: "text-slate-600", icon: CircleDot },
  in_progress: { label: "In Progress", color: "text-amber-700", icon: Timer },
  pending_verification: { label: "Awaiting Verification", color: "text-blue-700", icon: Eye },
  done: { label: "Verified & Done", color: "text-green-700", icon: Check },
};

const KANBAN_COLS = [
  { key: "done", label: "Done", dot: "bg-emerald-400", chip: "text-emerald-600 dark:text-emerald-400" },
  { key: "in_progress", label: "In Progress", dot: "bg-amber-400", chip: "text-amber-600 dark:text-amber-400" },
  { key: "review", label: "Review", dot: "bg-sky-400", chip: "text-sky-600 dark:text-sky-400" },
] as const;

const WORKFLOW_STEPS = [
  { key: "open", label: "Assigned", icon: CircleDot, color: "#64748b", bgLight: "bg-slate-100", borderActive: "border-slate-500" },
  { key: "in_progress", label: "In Progress", icon: Timer, color: "#d97706", bgLight: "bg-amber-100", borderActive: "border-amber-500" },
  { key: "pending_verification", label: "Review", icon: Eye, color: "#2563eb", bgLight: "bg-blue-100", borderActive: "border-blue-500" },
  { key: "done", label: "Done", icon: Check, color: "#16a34a", bgLight: "bg-green-100", borderActive: "border-green-500" },
];

const dueLabel = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : null;

const dateTimeLabel = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";

function WorkflowStepper({ status, onStepClick, canClick, isPending }: {
  status: string;
  onStepClick?: (step: string) => void;
  canClick: boolean;
  isPending: boolean;
}) {
  const currentIdx = WORKFLOW_STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center justify-between gap-1">
      {WORKFLOW_STEPS.map((step, i) => {
        const reached = i <= currentIdx;
        const isCurrent = i === currentIdx;
        const StepIcon = step.icon;
        const clickable = canClick && !isCurrent && !isPending;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <button
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(step.key)}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border-2 transition-all w-full min-w-0 ${
                isCurrent
                  ? `${step.bgLight} ${step.borderActive} shadow-sm`
                  : reached
                    ? "bg-green-50 border-green-200"
                    : "bg-muted/30 border-transparent"
              } ${clickable ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-95" : ""}`}
            >
              <StepIcon
                className="w-4 h-4 shrink-0"
                style={{ color: isCurrent ? step.color : reached ? "#16a34a" : "#94a3b8" }}
              />
              <span className={`text-[10px] font-semibold leading-tight text-center ${
                isCurrent ? "" : reached ? "text-green-700" : "text-muted-foreground"
              }`} style={isCurrent ? { color: step.color } : {}}>
                {step.label}
              </span>
            </button>
            {i < WORKFLOW_STEPS.length - 1 && (
              <ArrowRight className={`w-3 h-3 shrink-0 mx-0.5 ${i < currentIdx ? "text-green-400" : "text-gray-300"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function TasksPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canAssign = ASSIGNER_ROLES.includes(user?.role || "");
  const isBoss = ["admin", "manager"].includes(user?.role || "");

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["/api/tasks"],
    queryFn: () => fetch("/api/tasks", { credentials: "include" }).then((r) => r.json()).catch(() => []),
    refetchInterval: 60_000,
  });
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()).catch(() => []),
    enabled: canAssign,
  });

  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [form, setForm] = useState({ title: "", assignedTo: "", dueDate: "", note: "" });
  const resetForm = () => setForm({ title: "", assignedTo: "", dueDate: "", note: "" });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/tasks"] });

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ title: form.title, note: form.note || null, assignedTo: Number(form.assignedTo), dueDate: form.dueDate || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Could not create task");
      return r.json();
    },
    onSuccess: () => { invalidate(); setAssignOpen(false); resetForm(); toast({ title: "Task assigned" }); },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Update failed");
      return r.json();
    },
    onSuccess: (data) => {
      invalidate();
      if (selectedTask && data?.id === selectedTask.id) {
        setSelectedTask({ ...selectedTask, ...data });
      }
      toast({ title: `Task → ${STATUS_CONFIG[data?.status]?.label || data?.status}` });
    },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => { invalidate(); setSelectedTask(null); },
  });

  const assignable = (users || []).filter((u: any) => u.active !== false && u.id !== user?.id);

  // Group tasks into kanban columns
  const kanban: Record<string, any[]> = { done: [], in_progress: [], review: [] };
  for (const t of tasks) {
    if (t.status === "done") kanban.done.push(t);
    else if (t.status === "in_progress") kanban.in_progress.push(t);
    else kanban.review.push(t); // open + pending_verification → review column
  }

  return (
    <section className="rounded-2xl border bg-white border-slate-200 shadow-sm dark:bg-slate-900/60 dark:border-slate-800 dark:shadow-lg dark:shadow-black/20 p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" />
          {isBoss ? "Tasks — Team" : "My Tasks"}
        </h3>
        {canAssign && (
          <button
            onClick={() => { resetForm(); setAssignOpen(true); }}
            className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:hover:bg-sky-500/25"
          >
            <Plus className="h-3.5 w-3.5" /> Assign task
          </button>
        )}
      </div>

      {/* Kanban 3-column grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {KANBAN_COLS.map((col) => {
          const list = kanban[col.key] ?? [];
          return (
            <div key={col.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/20">
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${col.chip}`}>{col.label}</span>
                <span className="ml-auto text-xs font-semibold text-slate-400 dark:text-slate-500">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-600">No tasks.</p>
                ) : (
                  list.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTask(t)}
                      className="rounded-lg border border-slate-200 bg-white p-3 cursor-pointer transition-all hover:shadow-md hover:border-slate-300 hover:scale-[1.01] active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700"
                    >
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.title}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                        <span>{fmtDate(t.dueDate || t.createdAt)}</span>
                        <span className="text-slate-500 dark:text-slate-400">{t.assignedToName}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Task Detail Dialog ── */}
      <Dialog open={!!selectedTask} onOpenChange={(v) => { if (!v) setSelectedTask(null); }}>
        {selectedTask && (() => {
          const t = selectedTask;
          const mine = t.assignedTo === user?.id;
          const canEdit = mine || isBoss || t.assignedBy === user?.id;
          const canVerify = isBoss || t.assignedBy === user?.id;
          const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
          const StatusIcon = cfg.icon;
          const isDone = t.status === "done";

          return (
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <StatusIcon className={`w-5 h-5 ${cfg.color}`} />
                  <span className="flex-1">{t.title}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Workflow stepper */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Workflow Progress</p>
                  <WorkflowStepper
                    status={t.status}
                    canClick={isBoss}
                    isPending={setStatus.isPending}
                    onStepClick={(step) => setStatus.mutate({ id: t.id, status: step })}
                  />
                  {isBoss && !isDone && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Click any step to move task there</p>
                  )}
                </div>

                {/* Task info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Assigned to</p>
                      <p className="font-medium text-xs">{t.assignedToName || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Assigned by</p>
                      <p className="font-medium text-xs">{t.assignedByName || "—"}</p>
                    </div>
                  </div>
                  {t.dueDate && (
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Due</p>
                        <p className="font-medium text-xs">{dueLabel(t.dueDate)}</p>
                      </div>
                    </div>
                  )}
                  {t.completedAt && (
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Completed</p>
                        <p className="font-medium text-xs">{dateTimeLabel(t.completedAt)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Note */}
                {t.note && (
                  <div className="bg-muted/40 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> Note
                    </p>
                    <p className="text-sm leading-relaxed">{t.note}</p>
                  </div>
                )}

                {/* Action buttons */}
                {canEdit && (
                  <div className="space-y-2">
                    {t.status === "open" && (
                      <Button className="w-full h-10 gap-2" disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: t.id, status: "in_progress" })}>
                        {setStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        Start Working
                      </Button>
                    )}
                    {t.status === "in_progress" && mine && (
                      <Button className="w-full h-10 gap-2 bg-blue-600 hover:bg-blue-700 text-white" disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: t.id, status: "pending_verification" })}>
                        {setStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Mark Complete — Send for Review
                      </Button>
                    )}
                    {t.status === "pending_verification" && canVerify && (
                      <div className="flex gap-2">
                        <Button className="flex-1 h-10 gap-2 bg-green-600 hover:bg-green-700 text-white" disabled={setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: t.id, status: "done" })}>
                          {setStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                          Verify & Close
                        </Button>
                        <Button variant="outline" className="h-10 gap-2" disabled={setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: t.id, status: "in_progress" })}>
                          <RotateCcw className="w-4 h-4" /> Send Back
                        </Button>
                      </div>
                    )}
                    {isDone && (
                      <Button variant="outline" className="w-full h-10 gap-2" disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: t.id, status: "open" })}>
                        <RotateCcw className="w-4 h-4" /> Reopen Task
                      </Button>
                    )}

                    {/* Boss shortcut: force done */}
                    {isBoss && !isDone && t.status !== "pending_verification" && (
                      <Button
                        variant="outline"
                        className="w-full h-10 gap-2 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: t.id, status: "done" })}
                      >
                        <Zap className="w-4 h-4" /> Force Done (skip workflow)
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-row justify-between sm:justify-between">
                {isBoss && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                    onClick={() => { if (window.confirm("Delete this task?")) del.mutate(t.id); }}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedTask(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>

      {/* ── Assign dialog ── */}
      <Dialog open={assignOpen} onOpenChange={(v) => { if (!v) setAssignOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign a Task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs font-medium">Task title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Count gypsum board stock in warehouse" className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs font-medium">Assign to <span className="text-destructive">*</span></Label>
              <Select value={form.assignedTo} onValueChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Pick a staff member" /></SelectTrigger>
                <SelectContent>
                  {assignable.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} · {u.role.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Due date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs font-medium">Note</Label>
              <Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Additional details for the assignee..." className="mt-1 resize-none" rows={2} />
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg px-3 py-2.5 text-[11px] text-muted-foreground">
            <p className="font-medium mb-1">Workflow:</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="bg-slate-200 rounded px-1.5 py-0.5">Assigned</span>
              <span>→</span>
              <span className="bg-amber-100 rounded px-1.5 py-0.5">In Progress</span>
              <span>→</span>
              <span className="bg-blue-100 rounded px-1.5 py-0.5">Mark Complete</span>
              <span>→</span>
              <span className="bg-green-100 rounded px-1.5 py-0.5">Verify & Close</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={create.isPending}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.title.trim() || !form.assignedTo} className="gap-2">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
