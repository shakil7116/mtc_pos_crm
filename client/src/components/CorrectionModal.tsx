import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { Undo2, History } from "lucide-react";

/**
 * Correction system UI (admin/manager only):
 *  - <CorrectButton> opens a simple modal: current value → new value + mandatory reason.
 *  - <CorrectedBadge> shows on corrected records with the full history on click.
 */
export function CorrectButton({
  label = "Correct This", title, current, next, onConfirm, disabled, children,
}: {
  label?: string; title: string; current: string; next: string;
  onConfirm: (reason: string) => Promise<any> | void; disabled?: boolean;
  children?: React.ReactNode; // optional extra controls (e.g. a target-status select)
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user || !["admin", "manager"].includes(user.role)) return null;

  const confirm = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try { await onConfirm(reason.trim()); setOpen(false); setReason(""); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-40"
        title={title}>
        <Undo2 className="w-3 h-3" /> {label}
      </button>
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 className="w-4 h-4 text-amber-600" /> {title}</DialogTitle>
            <DialogDescription>Corrections are logged permanently — original values are never lost.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border p-2.5 space-y-1">
              <p><span className="text-muted-foreground">Current:</span> <span className="font-semibold">{current}</span></p>
              <p><span className="text-muted-foreground">Will become:</span> <span className="font-semibold text-amber-700">{next}</span></p>
            </div>
            {children}
            <div>
              <p className="text-xs font-semibold mb-1">Reason <span className="text-destructive">*</span></p>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why is this being corrected? (mandatory)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" disabled={!reason.trim() || busy} onClick={confirm}>
              {busy ? "Correcting…" : "Confirm Correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CorrectedBadge({ entityType, entityId }: { entityType: string; entityId: number }) {
  const [open, setOpen] = useState(false);
  const { data: history = [] } = useQuery<any[]>({
    queryKey: [`/api/corrections`, entityType, entityId],
    queryFn: () => fetch(`/api/corrections?entityType=${entityType}&entityId=${entityId}`).then((r) => r.json()),
  });
  if (!history.length) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 hover:bg-amber-200"
        title="This record was corrected — view history">
        <History className="w-2.5 h-2.5" /> Corrected
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Correction history</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {history.map((c) => (
              <div key={c.id} className="rounded-lg border p-2.5 text-sm">
                <p><span className="font-semibold">{c.field}</span>: <span className="line-through text-muted-foreground">{c.oldValue}</span> → <span className="font-semibold">{c.newValue}</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Reason: {c.reason}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()} · user #{c.correctedBy ?? "?"}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
