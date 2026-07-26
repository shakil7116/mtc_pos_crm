import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";

// Forced PIN reset. Shown after login when mustChangePin is set — the staff member
// picks a fresh, unique, non-trivial PIN (used for supervisor approvals).
export default function SetPin() {
  const { user, refresh, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    if (pin.length < 4) { setErr("PIN must be 4–6 digits."); return; }
    if (pin !== confirm) { setErr("The two PINs do not match."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/change-pin", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ newPin: pin }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.message || "Could not set the PIN."); return; }
      await refresh(); // clears mustChangePin → app proceeds
    } catch {
      setErr("Network error — try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-[#d4a017]" /><h1 className="text-lg font-bold">Set your PIN</h1></div>
        <p className="text-sm text-muted-foreground">
          Hi {user?.name} — for security you must set a new personal PIN. It approves discounts
          and sensitive actions, so keep it private, unique, and not obvious (no 1234 / 0000).
        </p>
        <div className="space-y-2">
          <Input type="password" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="New PIN (4–6 digits)" className="text-center tracking-[0.4em] text-lg no-uppercase" autoFocus />
          <Input type="password" inputMode="numeric" value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Confirm PIN" className="text-center tracking-[0.4em] text-lg no-uppercase"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <Button onClick={submit} disabled={busy} className="w-full bg-[#1e2a3a] text-white">{busy ? "Saving…" : "Set PIN"}</Button>
        <button onClick={logout} className="text-xs text-muted-foreground hover:underline w-full text-center">Log out</button>
      </div>
    </div>
  );
}
