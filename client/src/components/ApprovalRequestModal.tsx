import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, FileText, Ban, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";

type ReqType = "manual" | "void";

interface DocRow { id: number; number: string; type: string; customerName: string | null; total: string | null; status?: string | null; }

const TYPES: { key: ReqType; label: string; hint: string; icon: any }[] = [
  { key: "manual", label: "General request", hint: "Ask for any authorisation", icon: MessageSquareText },
  { key: "void", label: "Void invoice", hint: "Cancel & reverse an invoice", icon: Ban },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (ar: any) => void;
  /** Prefill (e.g. a "Request void" launched from an invoice). */
  defaultType?: ReqType;
  defaultEntity?: { id: number; type: string; label: string } | null;
}

// The salesman's request composer: write a specific "approval letter" and send it to a
// manager/admin, who decides it in the Approvals Center with Approve / Reject.
export default function ApprovalRequestModal({ open, onClose, onSubmitted, defaultType, defaultEntity }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [type, setType] = useState<ReqType>(defaultType || "manual");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [picked, setPicked] = useState<{ id: number; label: string } | null>(
    defaultEntity ? { id: defaultEntity.id, label: defaultEntity.label } : null,
  );

  useEffect(() => {
    if (open) {
      setType(defaultType || "manual");
      setMessage("");
      setAmount("");
      setInvoiceSearch("");
      setPicked(defaultEntity ? { id: defaultEntity.id, label: defaultEntity.label } : null);
    }
  }, [open, defaultType, defaultEntity]);

  const linksInvoice = type === "void";

  // Invoice lookup — fetched lazily, only when a type that can link one is active.
  const { data: docs = [] } = useQuery<DocRow[]>({
    queryKey: ["/api/documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()),
    enabled: open && linksInvoice && !picked,
    staleTime: 30_000,
  });

  const matches = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return [];
    return docs
      .filter((d) => d.type === "INV" && d.status !== "void")
      .filter((d) => d.number.toLowerCase().includes(q) || (d.customerName ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [docs, invoiceSearch]);

  const submit = useMutation({
    mutationFn: async () => {
      const body: any = {
        type,
        message: message.trim(),
        amount: amount ? Number(amount) : undefined,
      };
      if (picked) { body.entityType = "document"; body.entityId = picked.id; body.summary = picked.label; }
      const res = await fetch("/api/approvals", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not send the request");
      return res.json();
    },
    onSuccess: (ar: any) => {
      qc.invalidateQueries({ queryKey: ["/api/approvals"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Request sent", description: `${ar?.requestNumber || "Your request"} is now with a manager.` });
      onSubmitted?.(ar);
      onClose();
    },
    onError: (e: any) => toast({ title: "Could not send", description: String(e?.message || ""), variant: "destructive" }),
  });

  const needsInvoice = type === "void" && !picked;
  const canSend = message.trim().length > 0 && !needsInvoice && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-[#d4a017]" /> New approval request
          </DialogTitle>
          <DialogDescription>Send a manager a request to approve. They decide it in Approvals.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Type */}
          <section>
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What do you need?</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {TYPES.map((t) => (
                <button key={t.key} type="button" onClick={() => setType(t.key)}
                  className={cn("flex flex-col items-start gap-1 p-2.5 rounded-lg border-2 text-left transition-all",
                    type === t.key ? "border-[#d4a017] bg-amber-50 dark:bg-amber-500/10" : "border-border hover:border-[#d4a017]/40")}>
                  <t.icon className={cn("w-4 h-4", type === t.key ? "text-[#d4a017]" : "text-muted-foreground")} />
                  <span className="text-xs font-semibold leading-tight">{t.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{t.hint}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Invoice link */}
          {linksInvoice && (
            <section>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Invoice {type === "void" && <span className="text-destructive">*</span>}
              </Label>
              {picked ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{picked.label}</span>
                  <button type="button" onClick={() => setPicked(null)} className="ml-auto text-xs text-blue-600 hover:underline">Change</button>
                </div>
              ) : (
                <div className="mt-1.5 relative">
                  <Input value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)}
                    placeholder="Search invoice number or customer…" className="h-9 no-uppercase" />
                  {matches.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
                      {matches.map((d) => (
                        <button key={d.id} type="button"
                          onClick={() => { setPicked({ id: d.id, label: `${d.number} · ${d.customerName || "Walk-in"} · QAR ${Number(d.total || 0).toFixed(2)}` }); setInvoiceSearch(""); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted">
                          <span className="font-mono font-semibold">{d.number}</span>
                          <span className="text-muted-foreground truncate">{d.customerName || "Walk-in"}</span>
                          <span className="ml-auto font-mono text-muted-foreground">QAR {Number(d.total || 0).toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Amount (optional) */}
          <section>
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount (optional)</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" className="h-9 mt-1.5 font-mono w-40" />
          </section>

          {/* Message — the "letter" */}
          <section>
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your request <span className="text-destructive">*</span></Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="mt-1.5"
              placeholder="Write your request to the manager — what you need approved and why…" />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submit.isPending}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={!canSend} className="bg-[#1e2a3a] text-white min-w-28 gap-1.5">
            {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submit.isPending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
