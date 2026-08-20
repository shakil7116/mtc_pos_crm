import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, User, Loader2, ShieldCheck, KeyRound } from "lucide-react";

/**
 * Phase 7 login — username + password → server-issued JWT cookie.
 * Professional, mobile-first, company-branded. Handles first-login forced
 * password change. All lockout/attempt logic is server-side.
 */
export default function Login() {
  const { user, login, refresh } = useAuth();
  const { data: settings } = useQuery<any>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()).catch(() => null),
  });

  const forced = !!user?.mustChangePassword;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [pin, setPin] = useState("");

  const companyName = settings?.storeNameEn || "Mamun M Trading and Contracting W.L.L";

  const doLogin = async () => {
    if (!username.trim() || !password) { setError("Enter your username and password."); return; }
    setBusy(true); setError("");
    const res = await login(username.trim(), password, rememberMe);
    setBusy(false);
    if (!res.ok) { setError(res.message || "Login failed."); return; }
  };

  const doRecover = async () => {
    if (!username.trim()) { setError("Enter your username."); return; }
    if (!pin.trim()) { setError("Enter your PIN."); return; }
    if (newPw.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth/recover", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), pin: pin.trim(), newPassword: newPw }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.message || "Recovery failed."); setBusy(false); return; }
      await refresh();
    } catch { setError("Network error."); }
    setBusy(false);
  };

  const doChangePassword = async () => {
    if (newPw.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    const r = await fetch("/api/auth/change-password", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: password, newPassword: newPw }),
    });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).message || "Could not change password."); return; }
    await refresh();
    setPassword(""); setNewPw(""); setConfirmPw("");
    setError("Password changed. Please log in with your new password.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#1e2a3a] text-white flex items-center justify-center mx-auto mb-3 shadow-lg">
            {settings?.logoUrl ? <img src={settings.logoUrl} alt="logo" className="w-12 h-12 object-contain" /> : <span className="font-black text-2xl">MTC</span>}
          </div>
          <h1 className="text-lg font-bold text-[#1e2a3a] leading-tight">{companyName}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">POS &amp; CRM · Store 1 — Najma Street, Doha</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border p-6">
          {forced ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-[#1e2a3a]">Set a new password</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">First login — please choose your own password (min 8 characters).</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Current password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="The password you just used" />
                </div>
                <div>
                  <Label className="text-xs">New password</Label>
                  <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters" />
                </div>
                <div>
                  <Label className="text-xs">Confirm new password</Label>
                  <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doChangePassword()} />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <Button className="w-full bg-[#1e2a3a] text-white" disabled={busy} onClick={doChangePassword}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Change password
                </Button>
              </div>
            </>
          ) : recovering ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <KeyRound className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-[#1e2a3a]">Recover password</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Enter your username and PIN to set a new password.</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Username</Label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9 no-uppercase" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. shakil" autoCapitalize="none" autoCorrect="off" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Your PIN</Label>
                  <div className="relative">
                    <ShieldCheck className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4-digit PIN" maxLength={4} inputMode="numeric" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">New password</Label>
                  <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters" />
                </div>
                <div>
                  <Label className="text-xs">Confirm new password</Label>
                  <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doRecover()} />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <Button className="w-full bg-[#1e2a3a] text-white h-11 text-base" disabled={busy} onClick={doRecover}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Reset password
                </Button>
                <button onClick={() => { setRecovering(false); setError(""); setPin(""); setNewPw(""); setConfirmPw(""); }} className="w-full text-xs text-blue-600 hover:underline mt-1">
                  Back to sign in
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-bold text-[#1e2a3a] mb-4 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#d4a017]" /> Sign in</h2>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Username</Label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9 no-uppercase" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. shakil" autoCapitalize="none" autoCorrect="off" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Password</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="Your password" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    Remember me (30 days)
                  </label>
                  <button onClick={() => { setRecovering(true); setError(""); }} className="text-xs text-blue-600 hover:underline">
                    Forgot password?
                  </button>
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <Button className="w-full bg-[#1e2a3a] text-white h-11 text-base" disabled={busy} onClick={doLogin}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Login
                </Button>
              </div>
            </>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-4">Secure session · your role is verified on the server.</p>
      </div>
    </div>
  );
}
