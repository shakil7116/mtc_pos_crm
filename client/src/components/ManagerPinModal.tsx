import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Send, Loader2 } from "lucide-react";

export default function ManagerPinModal({
  open, onClose, onApprove, pending, error,
  onRequestRemote, requestingRemote,
}: {
  open: boolean;
  onClose: () => void;
  onApprove: (pin: string) => void;
  pending?: boolean;
  error?: string | null;
  onRequestRemote?: (reason: string) => void;
  requestingRemote?: boolean;
}) {
  const [pin, setPin] = useState("");
  const [remoteMode, setRemoteMode] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setPin(""); setRemoteMode(false); setReason(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#d4a017]" /> Manager approval
          </DialogTitle>
        </DialogHeader>

        {!remoteMode ? (
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
            {onRequestRemote && (
              <button onClick={() => setRemoteMode(true)} className="text-xs text-blue-600 hover:underline w-full text-center">
                Manager not here? Request approval remotely
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Send a discount approval request to a manager. The invoice will be created once approved.
            </p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this discount needed? (optional)"
              rows={3}
              className="text-sm"
              autoFocus
            />
            <button onClick={() => setRemoteMode(false)} className="text-xs text-blue-600 hover:underline">
              Back to PIN entry
            </button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending || requestingRemote}>Cancel</Button>
          {!remoteMode ? (
            <Button onClick={() => onApprove(pin)} disabled={pending || pin.length < 4} className="bg-[#1e2a3a] text-white">
              {pending ? "Approving…" : "Approve"}
            </Button>
          ) : (
            <Button onClick={() => onRequestRemote?.(reason.trim())} disabled={requestingRemote} className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
              {requestingRemote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {requestingRemote ? "Sending…" : "Send request"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
