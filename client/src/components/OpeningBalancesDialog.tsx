import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History, Loader2, Plus, Trash2, Check, Search, Info, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/* ── Opening balances ─────────────────────────────────────────────────────────
   What a customer already owed before this system existed.

   Entered ONE CUSTOMER AT A TIME, because that is how the paper is stacked — you
   pull out Mr Shuri's file and type his unpaid invoices, then move to the next.

   Each row keeps its ORIGINAL invoice number and ORIGINAL date. The date is not
   cosmetic: it drives the 30/60/90 ageing, and it decides which debt a payment
   clears first.

   None of this counts as profit. It is money owed for goods sold years ago, and
   that margin was earned back then.
──────────────────────────────────────────────────────────────────────────────*/

type Customer = { id: number; name: string; phone?: string | null };
type Row = { key: string; number: string; date: string; amount: string };

const blankRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  number: "", date: "", amount: "",
});

const QAR = (n: number) => "QAR " + n.toFixed(2);

export default function OpeningBalancesDialog({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ name: string; count: number; total: number } | null>(null);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"], enabled: open,
  });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers.slice(0, 25);
    return customers
      .filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q))
      .slice(0, 25);
  }, [customers, search]);

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const valid = rows.filter((r) => Number(r.amount) > 0 && r.date);
  const total = valid.reduce((s, r) => s + Number(r.amount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const badDates = rows.filter((r) => r.date && r.date > today);

  function resetForNext() {
    setCustomer(null); setRows([blankRow()]); setSearch(""); setDone(null);
  }

  async function submit() {
    if (!customer) return;
    if (!valid.length) { toast({ title: "Add at least one amount and date", variant: "destructive" }); return; }
    if (badDates.length) { toast({ title: "A date is in the future", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/opening-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rows: valid.map((v) => ({
            customerId: customer.id,
            number: v.number.trim() || undefined,
            date: v.date,
            amount: Number(v.amount),
          })),
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.message || "Could not save.");
      if (body.failed?.length) {
        toast({
          title: `${body.count} saved, ${body.failed.length} failed`,
          description: body.failed[0]?.reason,
          variant: "destructive",
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      setDone({ name: customer.name, count: body.count, total: body.totalOwed });
    } catch (e: any) {
      toast({ title: "Not saved", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForNext(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History size={18} /> Old balances
          </DialogTitle>
          <DialogDescription>
            What a customer already owed before this system. Use the original invoice
            number and date from your paper records.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-4 space-y-1.5 text-sm">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <Check size={16} /> {done.count} old invoice{done.count === 1 ? "" : "s"} saved for {done.name}
              </p>
              <p className="text-muted-foreground">
                {QAR(done.total)} added to what they owe. When they pay, the oldest
                invoice is cleared first.
              </p>
              <p className="text-muted-foreground">
                None of this counted as profit — that was earned when the goods were sold.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={resetForNext}>Next customer</Button>
              <Button variant="outline" onClick={() => { resetForNext(); onClose(); }}>Finished</Button>
            </DialogFooter>
          </div>
        ) : !customer ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Which customer owes you?</Label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus className="pl-9" placeholder="Search by name or phone…"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-[46vh] overflow-y-auto border rounded-md divide-y">
              {matches.map((c) => (
                <button
                  key={c.id} type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                  onClick={() => { setCustomer(c); setRows([blankRow()]); }}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.phone && <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>}
                </button>
              ))}
              {!matches.length && (
                <p className="px-3 py-8 text-sm text-muted-foreground text-center">
                  No customer matches. Add them under New Customer first.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
              <div>
                <p className="text-sm font-semibold">{customer.name}</p>
                <p className="text-[11px] text-muted-foreground">Entering their old unpaid invoices</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>Change</Button>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-2">
              <div className="grid grid-cols-[1fr_9.5rem_8rem_2rem] gap-2 mb-1 px-0.5">
                <Label className="text-[11px]">Their invoice no.</Label>
                <Label className="text-[11px]">Original date</Label>
                <Label className="text-[11px] text-right">Still owed</Label>
                <span />
              </div>
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[1fr_9.5rem_8rem_2rem] gap-2 mb-2 items-center">
                  <Input
                    className="h-9" placeholder="optional"
                    value={r.number}
                    onChange={(e) => setRow(r.key, { number: e.target.value.toUpperCase() })}
                  />
                  <Input
                    className="h-9" type="date" max={today}
                    value={r.date}
                    onChange={(e) => setRow(r.key, { date: e.target.value })}
                  />
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
              ))}
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>
                <Plus size={14} className="mr-1.5" /> Add another invoice
              </Button>

              {badDates.length > 0 && (
                <p className="text-[11px] text-red-600 flex items-start gap-1.5 mt-3">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  A date is in the future. An old balance must be dated when the goods were sold.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-3">
                <Info size={13} className="mt-0.5 shrink-0" />
                Use the real original date — it decides the 30/60/90 ageing and which
                invoice a payment clears first. Leave the number blank and one is generated.
              </p>
            </div>

            <DialogFooter className="border-t pt-3 gap-2 sm:justify-between">
              <div className="text-sm">
                {valid.length ? (
                  <>{valid.length} invoice{valid.length === 1 ? "" : "s"} · <span className="font-semibold">{QAR(total)}</span></>
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
