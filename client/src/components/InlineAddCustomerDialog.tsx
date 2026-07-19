import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";

export interface QuickCustomer { id: number; name: string; phone: string; type: string; creditLimit: number; active: boolean; }

/**
 * Inline "Add New Customer" used mid-invoice so staff never leave the editor.
 * Captures only what an invoice needs: Name, Phone, Financial Status (Cash/Credit),
 * and Credit Limit (Credit only). Financial Status maps to the account type the
 * behaviour-tier engine already reads: Cash → creditLimit 0, Credit → creditLimit>0.
 */
export default function InlineAddCustomerDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: QuickCustomer) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fin, setFin] = useState<"cash" | "credit">("cash");
  const [creditLimit, setCreditLimit] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setName(""); setPhone(""); setFin("cash"); setCreditLimit(""); setErr(null); };
  const close = () => { reset(); onClose(); };

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(), phone: phone.trim(), type: "walk-in",
        creditLimit: fin === "credit" ? Number(creditLimit) : 0,
      };
      const r = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Failed to create customer");
      return r.json();
    },
    onSuccess: (c: any) => {
      // Both query keys in use across the app must refresh (editor uses ["customers"],
      // the Customers list uses ["/api/customers"]).
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer added", description: `${c.name} — ${fin === "credit" ? "Credit" : "Cash"} account` });
      onCreated({ id: c.id, name: c.name, phone: c.phone ?? "", type: c.type, creditLimit: Number(c.creditLimit || 0), active: c.active !== false });
      close();
    },
    onError: () => toast({ title: "Failed to add customer", variant: "destructive" }),
  });

  const submit = () => {
    if (!name.trim()) { setErr("Name is required."); return; }
    if (!phone.trim()) { setErr("Phone is required."); return; }
    if (fin === "credit" && !(Number(creditLimit) > 0)) { setErr("A Credit account needs a credit limit greater than zero."); return; }
    setErr(null);
    mut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-[#d4a017]" /> Add New Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" autoFocus />
          </div>
          <div>
            <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +974 3070 3722" />
          </div>
          <div>
            <Label className="text-xs">Financial Status <span className="text-destructive">*</span></Label>
            <Select value={fin} onValueChange={(v) => setFin(v as "cash" | "credit")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Sets the account type going forward. Cash accounts can't run a balance.</p>
          </div>
          {fin === "credit" && (
            <div>
              <Label className="text-xs">Credit Limit (QAR) <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="e.g. 20000" className="font-mono" />
            </div>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={mut.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending} className="bg-[#1e2a3a] text-white">
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save &amp; Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
