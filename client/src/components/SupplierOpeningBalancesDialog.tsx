import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History, Loader2, Plus, Trash2, Check, Search, Info, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/* ── Supplier opening balances ────────────────────────────────────────────────
   What the business already owed a supplier before this system existed.

   The mirror of the customer version, with one field that matters more here:
   PAYMENT TERMS. Suppliers give 30, 60 or 90 days, and the clock starts from the
   INVOICE date — not from today. A 90-day invoice from three months ago is due
   now, and entering today's date would hide that for another three months.

   No stock is added. The goods arrived months ago and were sold long since.
──────────────────────────────────────────────────────────────────────────────*/

type Supplier = { id: number; name: string; company?: string | null };
type Row = { key: string; invoiceNumber: string; date: string; amount: string; terms: string };

const blankRow = (terms = "30"): Row => ({
  key: Math.random().toString(36).slice(2),
  invoiceNumber: "", date: "", amount: "", terms,
});

const QAR = (n: number) => "QAR " + n.toFixed(2);

const addDays = (iso: string, n: number) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function SupplierOpeningBalancesDialog({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ name: string; count: number; total: number } | null>(null);

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"], enabled: open,
  });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 25);
    return suppliers.filter((s) =>
      (s.name || "").toLowerCase().includes(q) || (s.company || "").toLowerCase().includes(q)
    ).slice(0, 25);
  }, [suppliers, search]);

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const today = new Date().toISOString().slice(0, 10);
  const valid = rows.filter((r) => Number(r.amount) > 0 && r.date);
  const total = valid.reduce((s, r) => s + Number(r.amount), 0);
  const badDates = rows.filter((r) => r.date && r.date > today);
  const overdue = valid.filter((r) => addDays(r.date, Number(r.terms) || 0) < today);

  function resetForNext() {
    setSupplier(null); setRows([blankRow()]); setSearch(""); setDone(null);
  }

  async function submit() {
    if (!supplier || !valid.length) return;
    if (badDates.length) { toast({ title: "A date is in the future", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/supplier-opening-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rows: valid.map((v) => ({
            supplierId: supplier.id,
            invoiceNumber: v.invoiceNumber.trim() || undefined,
            date: v.date,
            amount: Number(v.amount),
            paymentTermsDays: Number(v.terms) || 0,
          })),
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.message || "Could not save.");
      if (body.failed?.length) {
        toast({
          title: `${body.count} saved, ${body.failed.length} failed`,
          description: body.failed[0]?.reason, variant: "destructive",
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/suppliers"] });
      qc.invalidateQueries({ queryKey: ["/api/supplier-orders"] });
      setDone({ name: supplier.name, count: body.count, total: body.totalOwed });
    } catch (e: any) {
      toast({ title: "Not saved", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForNext(); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History size={18} /> Old supplier bills
          </DialogTitle>
          <DialogDescription>
            What you already owed a supplier before this system. Use their original
            invoice number, date and credit terms.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-4 space-y-1.5 text-sm">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <Check size={16} /> {done.count} old bill{done.count === 1 ? "" : "s"} saved for {done.name}
              </p>
              <p className="text-muted-foreground">
                {QAR(done.total)} added to what you owe. When you pay them, the oldest
                bill is settled first.
              </p>
              <p className="text-muted-foreground">
                No stock was added — those goods arrived months ago.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={resetForNext}>Next supplier</Button>
              <Button variant="outline" onClick={() => { resetForNext(); onClose(); }}>Finished</Button>
            </DialogFooter>
          </div>
        ) : !supplier ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Which supplier are you owed to?</Label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus className="pl-9" placeholder="Search by name or company…"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-[46vh] overflow-y-auto border rounded-md divide-y">
              {matches.map((s) => (
                <button
                  key={s.id} type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                  onClick={() => { setSupplier(s); setRows([blankRow()]); }}
                >
                  <span className="font-medium">{s.name}</span>
                  {s.company && <span className="text-xs text-muted-foreground ml-2">{s.company}</span>}
                </button>
              ))}
              {!matches.length && (
                <p className="px-3 py-8 text-sm text-muted-foreground text-center">
                  No supplier matches. Add them under New Supplier first.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
              <div>
                <p className="text-sm font-semibold">{supplier.name}</p>
                <p className="text-[11px] text-muted-foreground">Entering their unpaid bills</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSupplier(null)}>Change</Button>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-2">
              <div className="grid grid-cols-[1fr_9.5rem_6rem_8rem_2rem] gap-2 mb-1 px-0.5">
                <Label className="text-[11px]">Their invoice no.</Label>
                <Label className="text-[11px]">Invoice date</Label>
                <Label className="text-[11px]">Terms</Label>
                <Label className="text-[11px] text-right">Still owed</Label>
                <span />
              </div>
              {rows.map((r) => {
                const due = r.date ? addDays(r.date, Number(r.terms) || 0) : "";
                const isOverdue = due && due < today;
                return (
                  <div key={r.key} className="mb-2">
                    <div className="grid grid-cols-[1fr_9.5rem_6rem_8rem_2rem] gap-2 items-center">
                      <Input
                        className="h-9" placeholder="optional"
                        value={r.invoiceNumber}
                        onChange={(e) => setRow(r.key, { invoiceNumber: e.target.value.toUpperCase() })}
                      />
                      <Input
                        className="h-9" type="date" max={today}
                        value={r.date}
                        onChange={(e) => setRow(r.key, { date: e.target.value })}
                      />
                      <Select value={r.terms} onValueChange={(v) => setRow(r.key, { terms: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Due now</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                          <SelectItem value="60">60 days</SelectItem>
                          <SelectItem value="90">90 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-9 text-right" type="number" min="0" step="0.01" inputMode="decimal"
                        placeholder="0.00"
                        value={r.amount}
                        onChange={(e) => setRow(r.key, { amount: e.target.value })}
                      />
                      <Button
                        variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                        onClick={() => setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((x) => x.key !== r.key)))}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    {due && (
                      <p className={`text-[11px] mt-0.5 ml-0.5 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        Due {due}{isOverdue ? " — already overdue" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blankRow(rs[rs.length - 1]?.terms || "30")])}>
                <Plus size={14} className="mr-1.5" /> Add another bill
              </Button>

              {badDates.length > 0 && (
                <p className="text-[11px] text-red-600 flex items-start gap-1.5 mt-3">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  A date is in the future. Use the date on the supplier's invoice.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-3">
                <Info size={13} className="mt-0.5 shrink-0" />
                The terms clock runs from the invoice date, not today — so a 90-day bill
                from three months ago correctly shows as due now. No stock is added.
              </p>
            </div>

            <DialogFooter className="border-t pt-3 gap-2 sm:justify-between">
              <div className="text-sm">
                {valid.length ? (
                  <>
                    {valid.length} bill{valid.length === 1 ? "" : "s"} · <span className="font-semibold">{QAR(total)}</span>
                    {overdue.length > 0 && (
                      <span className="text-red-600 ml-2">· {overdue.length} already overdue</span>
                    )}
                  </>
                ) : <span className="text-muted-foreground">Nothing entered yet</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { resetForNext(); onClose(); }} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={saving || !valid.length || badDates.length > 0}>
                  {saving ? <><Loader2 size={15} className="mr-1.5 animate-spin" /> Saving…</>
                          : <>Save {QAR(total)}</>}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
