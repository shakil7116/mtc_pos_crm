import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── One thing swapped for another ────────────────────────────────────────────
   The owner's own example: a customer needs white, somebody hands over the white
   bought earlier — same size, same price, and it never goes through the system.
   Months later one product is short and another is over, and nobody can connect
   them.

   So this screen has to be FASTER than not using it, or people will keep doing
   it quietly. Two products, two quantities, one line saying why. The difference
   in value is worked out as you type; only a lopsided swap waits for approval.
──────────────────────────────────────────────────────────────────────────────*/

type Product = { id: number; name: string; unit?: string | null; costPrice?: any };
type StoreItem = { id: number; nameEn: string; active?: boolean | null };

const money = (n: number) => "QAR " + (Number(n) || 0).toFixed(2);

export default function SwapDialog({
  open, onClose, products, stores, defaultStoreId,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  stores: StoreItem[];
  defaultStoreId?: number | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [storeId, setStoreId] = useState(defaultStoreId ? String(defaultStoreId) : "");
  const [outId, setOutId] = useState("");
  const [outQty, setOutQty] = useState("1");
  const [inId, setInId] = useState("");
  const [inQty, setInQty] = useState("1");
  const [reason, setReason] = useState("");
  const [customer, setCustomer] = useState("");

  const { data: settings } = useQuery<any>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()).catch(() => ({})),
  });

  const outP = products.find((p) => String(p.id) === outId);
  const inP = products.find((p) => String(p.id) === inId);

  const calc = useMemo(() => {
    const oQty = Number(outQty) || 0;
    const iQty = Number(inQty) || 0;
    const outValue = oQty * Number(outP?.costPrice || 0);
    const inValue = iQty * Number(inP?.costPrice || 0);
    const difference = Number((outValue - inValue).toFixed(2));
    return { outValue, inValue, difference, even: Math.abs(difference) < 0.005 };
  }, [outQty, inQty, outP, inP]);

  const limit = Number(settings?.stockLossAlertValue ?? 250);
  const needsApproval = limit > 0 && Math.abs(calc.difference) >= limit;
  const sameProduct = !!outId && outId === inId;

  const reset = () => {
    setOutId(""); setInId(""); setOutQty("1"); setInQty("1");
    setReason(""); setCustomer("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/stock-swaps", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId: Number(storeId),
          outProductId: Number(outId), outQty: Number(outQty),
          inProductId: Number(inId), inQty: Number(inQty),
          reason: reason.trim(), customerName: customer.trim() || null,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as any)?.message || "Could not record the swap.");
      return body;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      qc.invalidateQueries({ queryKey: ["/api/stock-swaps"] });
      qc.invalidateQueries({ queryKey: ["/api/stock-losses"] });
      qc.invalidateQueries({ queryKey: ["/api/approvals"] });
      if (res?.pendingApproval) {
        toast({
          title: "Sent for approval",
          description: `${res.requestNumber || "The request"} is waiting in Approvals. Nothing has moved yet.`,
        });
      } else {
        toast({
          title: "Swap recorded",
          description: `${outP?.name} out, ${inP?.name} in. Both shelves are now right.`,
        });
      }
      reset(); onClose();
    },
    onError: (e: any) =>
      toast({ title: "Not recorded", description: e?.message, variant: "destructive" }),
  });

  const canSave =
    storeId && outId && inId && !sameProduct &&
    Number(outQty) > 0 && Number(inQty) > 0 &&
    reason.trim().length >= 3 && !save.isPending;

  const side = (
    which: "out" | "in",
    id: string, setId: (v: string) => void,
    qty: string, setQty: (v: string) => void,
    product?: Product,
  ) => (
    <div className="space-y-1.5 flex-1 min-w-0">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {which === "out" ? "Handed over" : "Put back"}
      </Label>
      <Select value={id} onValueChange={setId}>
        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {products.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Input
          className="h-8 font-mono text-sm w-20" inputMode="decimal"
          value={qty} onChange={(e) => setQty(e.target.value)}
        />
        <span className="text-xs text-muted-foreground truncate">
          {product?.unit || ""}
          {product?.costPrice ? ` · ${money(Number(product.costPrice))} each` : ""}
        </span>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" /> Swap one thing for another
          </DialogTitle>
          <DialogDescription>
            A customer took a different one, or somebody exchanged it on the floor.
            Records both halves together so neither shelf goes wrong.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Where?</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder="Location…" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            {side("out", outId, setOutId, outQty, setOutQty, outP)}
            <ArrowRight className="w-4 h-4 mb-3 shrink-0 text-muted-foreground" />
            {side("in", inId, setInId, inQty, setInQty, inP)}
          </div>

          {sameProduct && (
            <p className="text-xs text-destructive">
              Both sides are the same product. If the quantity is simply wrong, count the
              shelf instead — that is a correction, not a swap.
            </p>
          )}

          {outP && inP && !sameProduct && (
            <div className={cn(
              "rounded-lg border p-2.5 text-sm",
              calc.even ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : needsApproval ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-border bg-muted/40")}>
              <div className="flex justify-between font-mono text-xs">
                <span>out {money(calc.outValue)}</span>
                <span>in {money(calc.inValue)}</span>
              </div>
              <p className="mt-1">
                {calc.even ? (
                  <>Both sides are worth the same — a clean swap.</>
                ) : calc.difference > 0 ? (
                  <>The business is <b>{money(calc.difference)} down</b> on this swap.</>
                ) : (
                  <>The business is <b>{money(-calc.difference)} up</b> on this swap.</>
                )}
                {needsApproval && (
                  <> That is over the QAR {limit.toFixed(0)} limit, so it goes to
                  <b> Approvals</b> before anything moves.</>
                )}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Why?</Label>
            <Textarea
              rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. customer needed the same white we had already bought — exchanged at the counter"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Customer (optional)</Label>
            <Input
              value={customer} onChange={(e) => setCustomer(e.target.value)}
              placeholder="Who it was done for"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button className="gap-2" disabled={!canSave} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {needsApproval ? "Send for approval" : "Record swap"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
