import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";

// Supervisor-override prompt. A salesman's discount / price change needs a
// manager or admin PIN to go through. The PIN is verified server-side on save.
export default function ManagerPinModal({
  open, onClose, onApprove, pending, error,
}: {
  open: boolean;
  onClose: () => void;
  onApprove: (pin: string) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const [pin, setPin] = useState("");
  useEffect(() => { if (open) setPin(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#d4a017]" /> Manager approval
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            This invoice has a discount or a changed price. A manager must approve it —
            enter a <b>manager or admin PIN</b>.
          </p>
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Manager PIN"
            className="text-center tracking-[0.4em] text-lg no-uppercase"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) onApprove(pin); }}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={() => onApprove(pin)} disabled={pending || pin.length < 4} className="bg-[#1e2a3a] text-white">
            {pending ? "Approving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
