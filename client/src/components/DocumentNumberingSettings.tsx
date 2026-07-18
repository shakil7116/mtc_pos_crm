import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hash, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Counter = { type: string; nextNumber: number; prefix: string | null; digits: number | null; separator: string | null };

const TYPE_LABEL: Record<string, string> = {
  INV: "Invoice", QT: "Quotation", DN: "Delivery Note", CN: "Credit Note", PO: "Purchase Order", RV: "Return Voucher",
};
const ORDER = ["INV", "QT", "DN", "CN", "PO"];
// Radix Select forbids value="" — use "none" sentinel, map to "" on the wire.
const SEPARATORS = [
  { v: "-", l: "Dash  ·  INV-10034" },
  { v: "/", l: "Slash  ·  INV/10034" },
  { v: "none", l: "None  ·  INV10034" },
];
const sepToWire = (s: string) => (s === "none" ? "" : s);
const sepFromWire = (s: string | null) => (s === "" || s == null ? (s === "" ? "none" : "-") : s);

function preview(prefix: string, sep: string, digits: number, n: number): string {
  const body = digits && digits > 0 ? String(n).padStart(digits, "0") : String(n);
  return `${prefix}${sepToWire(sep)}${body}`;
}

export default function DocumentNumberingSettings() {
  const { data: counters = [], isLoading } = useQuery<Counter[]>({
    queryKey: ["/api/document-counters"],
    queryFn: () => fetch("/api/document-counters").then((r) => r.json()),
  });
  const { data: audit = [] } = useQuery<any[]>({
    queryKey: ["/api/numbering-audit"],
    queryFn: () => fetch("/api/numbering-audit").then((r) => r.json()),
  });

  return (
    <AccordionItem value="numbering" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Hash className="w-4 h-4 text-[#d4a017]" /> Document Numbering
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="py-4 text-muted-foreground flex gap-2 items-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-3 pt-2 pb-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Set the next number, prefix, digit count and separator per document type. Numbers auto-increment —
              never reset, never repeat. A manual jump is logged below and the skipped numbers never exist in the system.
              Voided invoices keep their number (marked VOID) and are never reused.
            </p>
            {ORDER.map((t) => {
              const c = (Array.isArray(counters) ? counters : []).find((x) => x.type === t)
                || { type: t, nextNumber: 1, prefix: t, digits: 0, separator: "-" };
              return <CounterRow key={t} counter={c} />;
            })}
            <AuditTrail audit={audit} />
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function CounterRow({ counter }: { counter: Counter }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState(counter.prefix ?? counter.type);
  const [digits, setDigits] = useState<number>(counter.digits ?? 0);
  const [separator, setSeparator] = useState<string>(sepFromWire(counter.separator));
  const [nextNumber, setNextNumber] = useState<number>(counter.nextNumber);
  const label = TYPE_LABEL[counter.type] || counter.type;

  const save = useMutation({
    mutationFn: () =>
      fetch(`/api/document-counters/${counter.type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, digits: Number(digits), separator: sepToWire(separator), nextNumber: Number(nextNumber) }),
      }).then((r) => { if (!r.ok) throw new Error("save failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/document-counters"] });
      qc.invalidateQueries({ queryKey: ["/api/numbering-audit"] });
      toast({ title: `${label} numbering saved` });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const jumped = Number(nextNumber) > counter.nextNumber;
  return (
    <div className="border border-border/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <span className="font-semibold text-sm">
          {label} <span className="text-muted-foreground font-mono text-xs">({counter.type})</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Next: <span className="font-mono font-bold text-[15px]" style={{ color: "#d4a017" }}>
            {preview(prefix, separator, Number(digits), Number(nextNumber) || 0)}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="block"><span className="text-[11px] text-muted-foreground">Prefix</span>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8 text-sm mt-0.5" /></label>
        <label className="block"><span className="text-[11px] text-muted-foreground">Digits</span>
          <Input type="number" min={0} max={12} value={digits} onChange={(e) => setDigits(Number(e.target.value))} className="h-8 text-sm mt-0.5" /></label>
        <label className="block"><span className="text-[11px] text-muted-foreground">Separator</span>
          <Select value={separator} onValueChange={setSeparator}>
            <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>{SEPARATORS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
          </Select></label>
        <label className="block"><span className="text-[11px] text-muted-foreground">Next Number</span>
          <Input type="number" value={nextNumber} onChange={(e) => setNextNumber(Number(e.target.value))} className="h-8 text-sm font-mono mt-0.5" /></label>
      </div>
      {jumped && (
        <p className="text-[11px] text-amber-600 mt-1.5">
          Jumping {counter.nextNumber} → {nextNumber}: numbers {counter.nextNumber}–{Number(nextNumber) - 1} will be permanently skipped (logged).
        </p>
      )}
      <div className="flex justify-end mt-2">
        <Button size="sm" className="h-8" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />} Save
        </Button>
      </div>
    </div>
  );
}

function AuditTrail({ audit }: { audit: any[] }) {
  const rows = Array.isArray(audit) ? audit : [];
  return (
    <div className="border-t border-border/40 pt-3">
      <p className="text-xs font-semibold mb-2 text-foreground">Numbering Audit — skipped numbers</p>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">No manual number changes yet.</div>
      ) : (
        <div className="space-y-1 max-h-44 overflow-y-auto">
          {rows.map((a) => (
            <div key={a.id} className="text-[11px] flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{a.docType}</span>
              <span>{a.oldNext} → {a.newNext}</span>
              {Array.isArray(a.skipped) && a.skipped.length > 0 && (
                <span className="text-amber-600 font-medium">
                  skipped {a.skipped.length} ({a.skipped[0]}{a.skipped.length > 1 ? `–${a.skipped[a.skipped.length - 1]}` : ""})
                </span>
              )}
              {a.userName && <span>· {a.userName}</span>}
              {a.reason && <span className="italic">· "{a.reason}"</span>}
              <span className="ml-auto">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
