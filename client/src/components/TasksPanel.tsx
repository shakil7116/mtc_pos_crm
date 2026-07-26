import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Check, Loader2, Play, RotateCcw, Trash2, Clock } from "lucide-react";

const ASSIGNER_ROLES = ["admin", "manager", "warehouse_manager", "salesman"];
const STATUS_STYLE: Record<string, string> = {
  open: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
};
const dueLabel = (d?: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : null);

// Manager → staff task board. Staff see only their tasks; managers/admin see all.
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

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", assignedTo: "", dueDate: "", note: "" });
  const reset = () => setForm({ title: "", assignedTo: "", dueDate: "", note: "" });

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
    onSuccess: () => { invalidate(); setOpen(false); reset(); toast({ title: "Task assigned" }); },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Update failed");
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: invalidate,
  });

  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done").slice(0, 5);
  const assignable = (users || []).filter((u: any) => u.active !== false && u.id !== user?.id);

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" /> {isBoss ? "Tasks — team" : "My tasks"} {openTasks.length > 0 && `(${openTasks.length})`}
        </h2>
        {canAssign && (
          <Button size="sm" className="h-8 gap-1.5" onClick={() => { reset(); setOpen(true); }}>
            <Plus className="w-3.5 h-3.5" /> Assign task
          </Button>
        )}
      </div>

      {openTasks.length === 0 && doneTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks. {canAssign ? "Assign one to a staff member." : "You're all clear."}</p>
      ) : (
        <div className="space-y-1.5">
          {openTasks.map((t) => {
            const mine = t.assignedTo === user?.id;
            const canEdit = mine || isBoss || t.assignedBy === user?.id;
            return (
              <div key={t.id} className="rounded-lg border px-3 py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{t.title}</span>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${STATUS_STYLE[t.status]}`}>{t.status.replace("_", " ")}</span>
                    {t.dueDate && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-3 h-3" /> {dueLabel(t.dueDate)}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {isBoss ? `for ${t.assignedToName}` : t.assignedByName ? `from ${t.assignedByName}` : ""}{t.note ? ` · ${t.note}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    {t.status === "open" && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: t.id, status: "in_progress" })}><Play className="w-3 h-3" /> Start</Button>
                    )}
                    <Button size="sm" className="h-7 px-2 text-xs gap-1 bg-green-600 text-white" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: t.id, status: "done" })}><Check className="w-3 h-3" /> Done</Button>
                    {isBoss && <button onClick={() => { if (window.confirm("Delete this task?")) del.mutate(t.id); }} className="text-muted-foreground hover:text-red-600 px-1"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                )}
              </div>
            );
          })}
          {doneTasks.map((t) => (
            <div key={t.id} className="rounded-lg border border-transparent px-3 py-1.5 flex items-center gap-2 opacity-60">
              <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
              <span className="text-sm line-through truncate flex-1">{t.title}</span>
              <span className="text-[10px] text-muted-foreground">{isBoss ? t.assignedToName : ""}</span>
              {(isBoss || t.assignedTo === user?.id || t.assignedBy === user?.id) && (
                <button onClick={() => setStatus.mutate({ id: t.id, status: "open" })} className="text-muted-foreground hover:text-[#1e2a3a]" title="Reopen"><RotateCcw className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assign dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign a task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs">Task <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Count gypsum board stock" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Assign to <span className="text-destructive">*</span></Label>
              <Select value={form.assignedTo} onValueChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick a staff member" /></SelectTrigger>
                <SelectContent>
                  {assignable.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} · {u.role.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Due date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="h-9" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional detail" className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.title.trim() || !form.assignedTo} className="gap-2">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
