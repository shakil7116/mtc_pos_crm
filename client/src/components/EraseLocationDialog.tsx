import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/* ── Erasing a location that has things in it ─────────────────────────────────
   Deleting hides a location and can be undone for a day. This is the other one:
   it removes the location AND its contents, for good. It exists because a test
   warehouse full of test stock has to be able to go completely.

   Because it cannot be undone, it is asked three times over, in this order:

     1. Here is exactly what is inside — counted, table by table  →  Continue
     2. Type the name back                                        →  Erase
     3. (server) a full backup is taken before a single row moves

   If the backup fails, nothing is erased. If more than 25,000 records would go,
   the server refuses outright — that is a working location, not a test one.
──────────────────────────────────────────────────────────────────────────────*/

type Effect = { table: string; column: string; action: "clear" | "delete"; count: number };
type Plan = {
  targets: { id: number; nameEn: string; type: string }[];
  effects: Effect[];
  totalRows: number;
  tooBig: boolean;
  lastLocation: boolean;
};

// Table names are for the database. These are for the person reading the screen.
const WORDS: Record<string, string> = {
  inventory: "Stock held here",
  stock_adjustments: "Stock movements",
  documents: "Invoices and documents",
  document_items: "Invoice lines",
  payments: "Payments",
  cheques: "Cheques",
  expenses: "Expenses",
  users: "Staff accounts",
  products: "Products kept here",
  managed_lists: "Areas, racks and shelves",
  supplier_orders: "Supplier orders",
  warehouse_issues: "Warehouse issues",
  cashflow: "Cash movements",
  tasks: "Jobs",
  notifications: "Notifications",
  stores: "Warehouses inside it",
  returns: "Returns",
  damage_claims: "Damage reports",
};
const pretty = (t: string) =>
  WORDS[t] || t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function EraseLocationDialog({
  location, open, onOpenChange,
}: {
  location: { id: number; nameEn: string; type: string } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: [`/api/stores/${location?.id}/contents`],
    queryFn: () => fetch(`/api/stores/${location!.id}/contents`, { credentials: "include" })
      .then((r) => r.json()),
    enabled: open && !!location,
  });

  const erase = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/stores/${location!.id}/erase`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ confirmName: typed }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message || "Could not erase.");
      return body;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/stores/deleted"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      close();
      toast({
        title: `${res.erased?.map((e: any) => e.nameEn).join(", ")} erased`,
        description: `${res.rows} record(s) removed. Backup taken first: ${res.backupFile}`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Nothing was erased", description: e?.message, variant: "destructive" }),
  });

  const close = () => { setStep(1); setTyped(""); onOpenChange(false); };
  const nameMatches =
    typed.trim().toLowerCase() === (location?.nameEn ?? "").trim().toLowerCase();

  const deletes = (plan?.effects ?? []).filter((e) => e.action === "delete");
  const clears = (plan?.effects ?? []).filter((e) => e.action === "clear");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            {step === 1 ? `What is inside ${location?.nameEn}?` : "Last check"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Erasing removes the location and its contents for good. Read what goes first."
              : "There is no undo after this. A full backup is taken before anything is touched."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Counting what is inside…
            </p>
          ) : !plan ? (
            <p className="text-sm text-muted-foreground py-6">Could not read the contents.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {plan.targets.length > 1 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-900 text-xs">
                  This takes <b>{plan.targets.length} locations</b> with it:{" "}
                  {plan.targets.map((t) => t.nameEn).join(", ")}.
                </div>
              )}

              {deletes.length === 0 && clears.length === 0 && (
                <p className="text-muted-foreground">
                  Nothing is stored here at all — it is empty. Erasing it is safe.
                </p>
              )}

              {deletes.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-red-600 font-semibold mb-1">
                    Deleted for good
                  </p>
                  <div className="rounded-lg border divide-y">
                    {deletes.map((e, i) => (
                      <div key={i} className="flex justify-between px-3 py-1.5">
                        <span>{pretty(e.table)}</span>
                        <span className="font-semibold tabular-nums">{e.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {clears.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
                    Kept — only the link to this place is removed
                  </p>
                  <div className="rounded-lg border divide-y">
                    {clears.map((e, i) => (
                      <div key={i} className="flex justify-between px-3 py-1.5 text-muted-foreground">
                        <span>{pretty(e.table)}</span>
                        <span className="tabular-nums">{e.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {plan.tooBig && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-red-800 text-xs">
                  {plan.totalRows.toLocaleString()} records is far too much to be test data.
                  This will be refused. Delete it instead — it leaves every list and the
                  history stays.
                </div>
              )}
              {plan.lastLocation && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-red-800 text-xs">
                  This is the last location left. The system needs at least one.
                </div>
              )}
            </div>
          )
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-2.5 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
              <span>
                A full backup runs first and is saved in <b>backups/</b>. If the backup
                fails, nothing is erased. That backup is the only way back.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Type <b>{location?.nameEn}</b> to confirm</Label>
              <Input
                autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
                placeholder={location?.nameEn}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          {step === 1 ? (
            <Button
              variant="destructive"
              disabled={!plan || plan.tooBig || plan.lastLocation || isLoading}
              onClick={() => setStep(2)}
            >
              I understand — continue
            </Button>
          ) : (
            <Button
              variant="destructive" className="gap-2"
              disabled={!nameMatches || erase.isPending}
              onClick={() => erase.mutate()}
            >
              {erase.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Backing up, then erasing…</>
                : <><Trash2 className="w-3.5 h-3.5" /> Erase {location?.nameEn} for ever</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
