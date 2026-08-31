import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ── What actually arrived ────────────────────────────────────────────────────
   Receipt used to be one button, and the system added the quantity that was
   SENT. 100 bags leave, 70 arrive, and the destination is credited with 100 —
   so the 30 that vanished became phantom stock instead of a shortage anybody
   had to explain. That is why a location turns out ~30% short when it is
   finally emptied.

   So this screen counts. Every line starts filled in with what was sent, which
   keeps the ordinary case a single click; change a number and the shortage is
   priced on the spot, and a reason becomes compulsory before it can be
   confirmed. See shared/stockLoss.ts — the server does the same maths again.
──────────────────────────────────────────────────────────────────────────────*/

const CONFIRM_METHODS: { key: string; label: string }[] = [
  { key: "on-system", label: "Our staff (on-system)" },
  { key: "signature", label: "Signed voucher" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "phone", label: "Phone" },
];

type Line = {
  id: number; productId: number | null; description: string;
  unit: string | null; qty: number; linePrice: number; productCost: number;
};

export default function TransferReceiveDialog({
  transfer, currentUserName, pending, onClose, onConfirm,
}: {
  transfer: any | null;
  currentUserName: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (body: {
    method: string; externalReceiver?: string;
    lines?: { id: number; receivedQty: number }[]; shortageReason?: string;
  }) => void;
}) {
  const [method, setMethod] = useState("on-system");
  const [name, setName] = useState("");
  // What the person at the gate counted, keyed by line id.
  const [got, setGot] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");

  // The lines carry their cost, so a shortage can be priced before it is confirmed.
  const { data: receipt, isLoading } = useQuery<{ lines: Line[] }>({
    queryKey: [`/api/transfers/${transfer?.id}/receipt`],
    queryFn: () => fetch(`/api/transfers/${transfer.id}/receipt`, { credentials: "include" })
      .then((r) => r.json()),
    enabled: !!transfer,
  });

  useEffect(() => {
    if (!transfer) return;
    setMethod("on-system"); setName(""); setReason("");
    const seed: Record<number, string> = {};
    for (const l of receipt?.lines ?? []) seed[l.id] = String(l.qty);
    setGot(seed);
  }, [transfer, receipt]);

  if (!transfer) return null;

  const lines = receipt?.lines ?? [];
  const offSystem = method !== "on-system";

  const counted = lines.map((l) => {
    const typed = got[l.id];
    const received = typed === undefined || typed === "" ? l.qty : Number(typed);
    const ok = Number.isFinite(received);
    const missing = ok ? Math.max(0, l.qty - received) : 0;
    const unitCost = Number(l.linePrice) > 0 ? Number(l.linePrice) : Number(l.productCost || 0);
    return { ...l, received, ok, missing, unitCost, lossValue: missing * unitCost, over: ok && received > l.qty + 0.0001 };
  });

  const totalMissing = counted.reduce((a, l) => a + l.missing, 0);
  const lossValue = counted.reduce((a, l) => a + l.lossValue, 0);
  const anyOver = counted.some((l) => l.over);
  const anyBad = counted.some((l) => !l.ok);
  const hasShortage = totalMissing > 0.0001;

  const canSubmit =
    lines.length > 0 && !anyOver && !anyBad &&
    (!offSystem || name.trim().length > 0) &&
    (!hasShortage || reason.trim().length >= 3);

  const money = (n: number) => "QAR " + (Number(n) || 0).toFixed(2);
  const trim = (n: number) => Number(n.toFixed(3));

  return (
    <Dialog open={!!transfer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Confirm receipt — {transfer.number}</DialogTitle></DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            {transfer.fromStore} → <b>{transfer.toStore}</b>. Count what came off the truck.
            Only what you enter here goes into stock.
          </p>

          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[1fr_4rem_5rem] gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Item</span><span className="text-right">Sent</span><span className="text-right">Arrived</span>
            </div>
            {isLoading || lines.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-3">Loading the items…</p>
            ) : counted.map((l) => (
              <div
                key={l.id}
                className={cn(
                  "grid grid-cols-[1fr_4rem_5rem] gap-2 items-center px-3 py-1.5 border-t",
                  l.missing > 0.0001 && "bg-amber-50",
                )}
              >
                <div className="min-w-0">
                  <p className="text-xs truncate">{l.description}</p>
                  {l.missing > 0.0001 && (
                    <p className="text-[11px] text-amber-700">
                      {trim(l.missing)} {l.unit || ""} missing · {money(l.lossValue)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-right font-mono text-muted-foreground">{l.qty}</span>
                <Input
                  className={cn("h-7 text-xs text-right font-mono px-1.5", (l.over || !l.ok) && "border-destructive")}
                  value={got[l.id] ?? ""}
                  inputMode="decimal"
                  onChange={(e) => setGot((g) => ({ ...g, [l.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          {anyOver && (
            <p className="text-xs text-destructive">
              More cannot arrive than was sent. If extra goods turned up, they belong on
              their own transfer.
            </p>
          )}

          {hasShortage && !anyOver && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">
                {trim(totalMissing)} item(s) missing — worth {money(lossValue)}
              </p>
              <p className="text-[11px] text-amber-800">
                Recorded as a loss against {transfer.fromStore}, with your name and the
                sender's on it. Say what happened — that note is the only record there
                will be.
              </p>
              <Textarea
                rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. 3 bags split in the truck; driver says 2 were left at the gate"
                className="text-xs bg-white"
              />
            </div>
          )}

          <div>
            <Label className="text-xs">How was receipt confirmed?</Label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {CONFIRM_METHODS.map((m) => (
                <button
                  key={m.key} type="button" onClick={() => setMethod(m.key)}
                  className={cn(
                    "text-xs rounded-md border px-2 py-1.5 text-left",
                    method === m.key ? "border-[#1e2a3a] bg-[#1e2a3a] text-white" : "border-border hover:bg-muted",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {offSystem ? (
            <div>
              <Label className="text-xs">
                Received by (name at destination) <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Who signed / replied for the goods" className="h-9"
              />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Will record <b>{currentUserName || "you"}</b> as the receiver.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            className={cn("text-white", hasShortage ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700")}
            disabled={pending || !canSubmit}
            onClick={() => onConfirm({
              method: offSystem ? method : "on-system",
              ...(offSystem ? { externalReceiver: name.trim() } : {}),
              lines: counted.map((l) => ({ id: l.id, receivedQty: Number(l.received) })),
              ...(hasShortage ? { shortageReason: reason.trim() } : {}),
            })}
          >
            {pending ? "Saving…" : hasShortage ? "Confirm short receipt" : "Confirm receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
