import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale, Loader2, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  COLLECTABILITY_LABEL, COLLECTABILITY_HELP, type Collectability,
} from "@shared/collectability";

/* ── Receivables review ───────────────────────────────────────────────────────
   Going through the book and saying, honestly, which of this money is coming.

   The judgement is about BEHAVIOUR, not size. A customer owing QAR 50,000 who
   pays 40-60% every month is one of the best accounts there is. A customer owing
   QAR 3,000 who stopped answering two years ago is the problem.

   Marking changes REPORTING only. The debt stays, the customer still owes it, and
   if they pay tomorrow the money lands against their invoices normally.
──────────────────────────────────────────────────────────────────────────────*/

type Row = {
  customerId: number; name: string; balance: number;
  collectability: Collectability; note: string | null;
};
type Summary = {
  expected: number; doubtful: number; writtenOff: number; total: number;
  counts: { normal: number; doubtful: number; written_off: number };
  customers: Row[];
};

const QAR = (n: number) =>
  "QAR " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReceivablesReviewDialog({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<number, { status: Collectability; note: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<Summary>({
    queryKey: ["/api/receivables/summary"], enabled: open,
  });

  const rows = data?.customers ?? [];

  const stateOf = (r: Row) => draft[r.customerId]?.status ?? r.collectability;
  const noteOf = (r: Row) => draft[r.customerId]?.note ?? (r.note || "");

  const set = (r: Row, patch: Partial<{ status: Collectability; note: string }>) =>
    setDraft((d) => ({
      ...d,
      [r.customerId]: {
        status: patch.status ?? stateOf(r),
        note: patch.note ?? noteOf(r),
      },
    }));

  async function save(r: Row) {
    const status = stateOf(r);
    const note = noteOf(r);
    if (status !== "normal" && !note.trim()) {
      toast({ title: "Add a short reason", description: "In six months nobody will remember why.", variant: "destructive" });
      return;
    }
    setSavingId(r.customerId);
    try {
      const res = await fetch(`/api/customers/${r.customerId}/collectability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || "Could not save.");
      setDraft((d) => { const n = { ...d }; delete n[r.customerId]; return n; });
      qc.invalidateQueries({ queryKey: ["/api/receivables/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: `${r.name} marked ${COLLECTABILITY_LABEL[status].toLowerCase()}` });
    } catch (e: any) {
      toast({ title: "Not saved", description: e?.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  const cards = [
    { label: "Expected", val: data?.expected, n: data?.counts.normal, tone: "text-emerald-700", bg: "bg-emerald-50/60" },
    { label: "Doubtful", val: data?.doubtful, n: data?.counts.doubtful, tone: "text-amber-700", bg: "bg-amber-50/60" },
    { label: "Written off", val: data?.writtenOff, n: data?.counts.written_off, tone: "text-slate-500", bg: "bg-slate-50" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setDraft({}); onClose(); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scale size={18} /> Receivables review</DialogTitle>
          <DialogDescription>
            How much of what you are owed is realistically coming. Marking changes
            reporting only — the debt stays and a payment still lands normally.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          {cards.map((c) => (
            <div key={c.label} className={cn("rounded-lg border p-3", c.bg)}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{c.label}</p>
              <p className={cn("font-mono font-bold text-lg mt-1", c.tone)}>
                {isLoading ? "…" : QAR(c.val ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">{c.n ?? 0} customer{(c.n ?? 0) === 1 ? "" : "s"}</p>
            </div>
          ))}
        </div>

        {!isLoading && (data?.total ?? 0) > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Total owed {QAR(data!.total)} · of which {QAR(data!.expected)} is expected
            {(data!.doubtful + data!.writtenOff) > 0 &&
              ` — the other ${QAR(data!.doubtful + data!.writtenOff)} is not counted as an asset.`}
          </p>
        )}

        <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-1">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !rows.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nobody owes anything yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2">Customer</th>
                  <th className="py-2 w-28 text-right">Owes</th>
                  <th className="py-2 w-36">Status</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const status = stateOf(r);
                  const dirty = !!draft[r.customerId];
                  return (
                    <tr key={r.customerId} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{r.name}</span>
                        {r.collectability !== "normal" && !dirty && (
                          <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                            {COLLECTABILITY_LABEL[r.collectability]}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{QAR(r.balance)}</td>
                      <td className="py-2 pr-2">
                        <Select value={status} onValueChange={(v) => set(r, { status: v as Collectability })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(["normal", "doubtful", "written_off"] as Collectability[]).map((k) => (
                              <SelectItem key={k} value={k} className="text-xs">
                                {COLLECTABILITY_LABEL[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder={status === "normal" ? "—" : "e.g. left Qatar, phone dead"}
                          disabled={status === "normal"}
                          value={noteOf(r)}
                          onChange={(e) => set(r, { note: e.target.value })}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm" variant={dirty ? "default" : "ghost"}
                          className="h-8 text-xs"
                          disabled={!dirty || savingId === r.customerId}
                          onClick={() => save(r)}
                        >
                          {savingId === r.customerId
                            ? <Loader2 size={13} className="animate-spin" />
                            : dirty ? "Save" : <Check size={13} className="text-muted-foreground" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t pt-3">
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            Judge by behaviour, not size. Someone owing a lot who pays part of it every
            month is a good account. Someone owing little who stopped answering is not.
            {" "}{COLLECTABILITY_HELP.written_off}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setDraft({}); onClose(); }}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
