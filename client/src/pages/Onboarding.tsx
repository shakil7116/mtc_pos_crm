import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { ownerAccountProblem, suggestUsername, normalizeUsername } from "@shared/setup";
import { passwordProblem } from "@shared/password";
import {
  Loader2, ArrowRight, ArrowLeft, Check, Building2, Users, Store,
  ShieldCheck, Mail, Lock, User, Sparkles, Globe, Phone, AtSign, KeyRound,
} from "lucide-react";

type Step = "welcome" | "account" | "business" | "store" | "team" | "ready";
const STEPS: Step[] = ["welcome", "account", "business", "store", "team", "ready"];

export default function Onboarding() {
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Sign-in is by USERNAME. It is suggested from the email and then shown, edited
  // and repeated on the last screen — an owner who is never told their username
  // cannot get back in after the first logout.
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [createdUsername, setCreatedUsername] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [companyNameAr, setCompanyNameAr] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [crNumber, setCrNumber] = useState("");

  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  const [staffList, setStaffList] = useState([{ name: "", role: "salesman", username: "", password: "" }]);
  const [staffErrors, setStaffErrors] = useState<string[]>([]);

  const idx = STEPS.indexOf(step);
  const progress = ((idx) / (STEPS.length - 1)) * 100;

  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const prev = () => { setError(""); setStep(STEPS[Math.max(idx - 1, 0)]); };

  // The username follows the email until the owner types their own — then it is
  // theirs and we stop overwriting it.
  const onEmailChange = (value: string) => {
    setEmail(value);
    if (!usernameTouched) setUsername(suggestUsername(value));
  };

  const createAccount = async () => {
    // Exactly the rules the server applies — same function, so the screen can
    // never say "fine" to something the server then rejects.
    const problem = ownerAccountProblem({ name, email, username, password, confirmPassword: confirmPw });
    if (problem) return setError(problem);

    setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), username: username.trim(), password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.message || "Registration failed."); setBusy(false); return; }
      setCreatedUsername(d?.user?.username || username.trim());
      await refresh();
      next();
    } catch { setError("Could not reach the server. Is it still running?"); }
    setBusy(false);
  };

  const saveBusiness = async () => {
    if (!companyName.trim()) return setError("Enter your company name.");
    setBusy(true); setError("");
    try {
      await fetch("/api/setup/business", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, companyNameAr, address, phone, email, crNumber }),
      });
      next();
    } catch { setError("Network error."); }
    setBusy(false);
  };

  const saveStore = async () => {
    if (!storeName.trim()) return setError("Enter a store name.");
    setBusy(true); setError("");
    try {
      await fetch("/api/stores", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameEn: storeName, address: storeAddress, type: "store" }),
      });
      next();
    } catch { setError("Network error."); }
    setBusy(false);
  };

  const finishSetup = async () => {
    setBusy(true); setError(""); setStaffErrors([]);
    const failures: string[] = [];
    try {
      for (const member of staffList) {
        if (!member.name.trim() && !member.username.trim()) continue;   // an empty row is not an attempt
        const who = member.name.trim() || member.username.trim();
        const pw = passwordProblem(member.password, member.username.trim());
        if (pw) { failures.push(`${who}: ${pw}`); continue; }

        const r = await fetch("/api/users", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: member.name.trim(),
            username: normalizeUsername(member.username),
            role: member.role,
            password: member.password,
            // They set their own password and PIN the first time they sign in —
            // nobody but the holder should ever know the PIN that signs off their
            // approvals. The server picks a temporary one that is never shown.
            mustChangePassword: true,
            mustChangePin: true,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          failures.push(`${who}: ${d.message || "could not be created."}`);
        }
      }

      // Staff that failed do NOT stop setup — the admin account exists, and the
      // owner can add the rest from Settings. But they are told exactly who and why,
      // instead of the silence this used to give them.
      if (failures.length) { setStaffErrors(failures); setBusy(false); return; }

      await fetch("/api/setup/complete", { method: "POST", credentials: "include" });
      next();
    } catch { setError("Could not reach the server. Is it still running?"); }
    setBusy(false);
  };

  const skipStaff = async () => { setStaffList([]); setStaffErrors([]); await finishSetup(); };

  const finishAnyway = async () => {
    setBusy(true); setStaffErrors([]);
    try {
      await fetch("/api/setup/complete", { method: "POST", credentials: "include" });
      next();
    } catch { setError("Could not reach the server. Is it still running?"); }
    setBusy(false);
  };

  const goToDashboard = async () => {
    await refresh();
    window.location.href = "/";
  };

  const addStaff = () => setStaffList([...staffList, { name: "", role: "salesman", username: "", password: "" }]);
  const updateStaff = (i: number, field: string, val: string) => {
    const copy = [...staffList];
    (copy[i] as any)[field] = val;
    setStaffList(copy);
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white overflow-hidden relative">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* Progress bar */}
      {step !== "welcome" && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg">

          {/* ─── WELCOME ─── */}
          {step === "welcome" && (
            <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-500/25">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                Welcome to MTC POS
              </h1>
              <p className="text-lg text-blue-200/70 mb-2">
                The complete point-of-sale &amp; CRM platform for your business
              </p>
              <p className="text-sm text-white/40 mb-10">
                Set up your account in just a few steps — it only takes 2 minutes
              </p>

              <div className="grid grid-cols-3 gap-4 mb-10 max-w-sm mx-auto">
                {[
                  { icon: ShieldCheck, label: "Secure" },
                  { icon: Globe, label: "Cloud-based" },
                  { icon: Users, label: "Multi-user" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                    <Icon className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                    <span className="text-xs text-white/60">{label}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={next}
                className="h-14 px-10 text-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-2xl shadow-xl shadow-blue-500/25 border-0"
              >
                Get started <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <p className="text-xs text-white/30 mt-6">Already have an account? <button onClick={() => window.location.href = "/"} className="text-blue-400 hover:underline">Sign in</button></p>
            </div>
          )}

          {/* ─── CREATE ACCOUNT ─── */}
          {step === "account" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <button onClick={prev} className="flex items-center gap-1 text-sm text-white/40 hover:text-white/70 mb-6">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Create your account</h2>
                  <p className="text-sm text-white/40">Step 1 of 4</p>
                </div>
              </div>
              <p className="text-sm text-white/50 mb-6">Use your business email or Gmail to get started</p>

              {/* Google button */}
              <button
                className="w-full h-12 bg-white text-gray-800 rounded-xl font-medium flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors mb-4 shadow-lg"
                onClick={() => setError("Google sign-in will be available soon. Use email for now.")}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-white/30">or use email</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-white/50">Full name</Label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <Input className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/50">Email</Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <Input className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="you@company.com" type="email" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/50">Username — this is what you sign in with</Label>
                  <div className="relative">
                    <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <Input
                      className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl"
                      value={username}
                      onChange={(e) => { setUsernameTouched(true); setUsername(normalizeUsername(e.target.value)); }}
                      placeholder="e.g. shakil"
                      autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    />
                  </div>
                  <p className="text-[11px] text-white/30 mt-1">Write this down. The sign-in screen asks for the username, not the email.</p>
                </div>
                <div>
                  <Label className="text-xs text-white/50">Password</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <Input className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Min 8 characters" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/50">Confirm password</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <Input className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} type="password" placeholder="Repeat password"
                      onKeyDown={(e) => e.key === "Enter" && createAccount()} />
                  </div>
                </div>
                {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
                <Button onClick={createAccount} disabled={busy} className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl text-base border-0">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Create account
                </Button>
              </div>
            </div>
          )}

          {/* ─── BUSINESS INFO ─── */}
          {step === "business" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <button onClick={prev} className="flex items-center gap-1 text-sm text-white/40 hover:text-white/70 mb-6">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Your business</h2>
                  <p className="text-sm text-white/40">Step 2 of 4</p>
                </div>
              </div>
              <p className="text-sm text-white/50 mb-6">Tell us about your company — this appears on invoices</p>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-white/50">Company name (English)</Label>
                  <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Trading Co." />
                </div>
                <div>
                  <Label className="text-xs text-white/50">Company name (Arabic) — optional</Label>
                  <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" dir="rtl" value={companyNameAr} onChange={(e) => setCompanyNameAr(e.target.value)} placeholder="اسم الشركة بالعربي" />
                </div>
                <div>
                  <Label className="text-xs text-white/50">Address</Label>
                  <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City, Country" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-white/50">Phone</Label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <Input className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 ..." />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-white/50">CR Number</Label>
                    <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={crNumber} onChange={(e) => setCrNumber(e.target.value)} placeholder="12345" />
                  </div>
                </div>
                {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
                <Button onClick={saveBusiness} disabled={busy} className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl text-base border-0">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── FIRST STORE ─── */}
          {step === "store" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <button onClick={prev} className="flex items-center gap-1 text-sm text-white/40 hover:text-white/70 mb-6">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Store className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Create your first store</h2>
                  <p className="text-sm text-white/40">Step 3 of 4</p>
                </div>
              </div>
              <p className="text-sm text-white/50 mb-6">Where does your business operate? You can add more stores later.</p>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-white/50">Store name</Label>
                  <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Main Store — City Center" />
                </div>
                <div>
                  <Label className="text-xs text-white/50">Store address</Label>
                  <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11 rounded-xl" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} placeholder="Building 10, Street Name, City" />
                </div>
                {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
                <Button onClick={saveStore} disabled={busy} className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl text-base border-0">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── ADD TEAM ─── */}
          {step === "team" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <button onClick={prev} className="flex items-center gap-1 text-sm text-white/40 hover:text-white/70 mb-6">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Add your team</h2>
                  <p className="text-sm text-white/40">Step 4 of 4</p>
                </div>
              </div>
              <p className="text-sm text-white/50 mb-2">Add staff members who will use the system. You can always add more later.</p>
              <p className="text-xs text-white/35 mb-6">Give each one a starting password and tell it to them. They pick their own password and their own 4-digit PIN the first time they sign in — the PIN approves discounts, so only they should ever know it.</p>

              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {staffList.map((s, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-9 rounded-lg text-sm" value={s.name} onChange={(e) => updateStaff(i, "name", e.target.value)} placeholder="Full name" />
                      <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-9 rounded-lg text-sm" value={s.username} onChange={(e) => updateStaff(i, "username", e.target.value)} placeholder="Username" />
                    </div>
                    <Input
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-9 rounded-lg text-sm"
                      value={s.password}
                      onChange={(e) => updateStaff(i, "password", e.target.value)}
                      type="password"
                      placeholder="Starting password — 8+ letters and numbers"
                    />
                    <select
                      className="w-full bg-white/5 border border-white/10 text-white h-9 rounded-lg text-sm px-3"
                      value={s.role}
                      onChange={(e) => updateStaff(i, "role", e.target.value)}
                    >
                      <option value="salesman">Salesman</option>
                      <option value="manager">Manager</option>
                      <option value="worker">General Worker</option>
                      <option value="driver">Driver</option>
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={addStaff} className="w-full mt-3 h-10 border border-dashed border-white/20 rounded-xl text-sm text-white/40 hover:text-white/60 hover:border-white/30 transition-colors">
                + Add another member
              </button>

              {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg mt-3">{error}</p>}
              {staffErrors.length > 0 && (
                <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-300 font-medium mb-1">These people were not added:</p>
                  <ul className="text-xs text-red-300/80 space-y-0.5 list-disc pl-4">
                    {staffErrors.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                  <button onClick={finishAnyway} className="text-xs text-white/50 hover:text-white/80 underline mt-2">
                    Finish without them — I'll add them later from Settings
                  </button>
                </div>
              )}
              <div className="flex gap-3 mt-4">
                <Button onClick={skipStaff} variant="outline" className="flex-1 h-12 bg-transparent border-white/20 text-white/60 hover:bg-white/5 rounded-xl border-0">
                  Skip for now
                </Button>
                <Button onClick={finishSetup} disabled={busy} className="flex-1 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl text-base border-0">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Finish setup
                </Button>
              </div>
            </div>
          )}

          {/* ─── ALL DONE ─── */}
          {step === "ready" && (
            <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/25">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
              <h1 className="text-3xl font-bold mb-3">You're all set!</h1>
              <p className="text-blue-200/60 mb-6">
                Your admin account is ready. From Settings you can now create an account for everybody else.
              </p>

              {/* The one thing they must not leave this screen without. */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-left max-w-sm mx-auto">
                <p className="text-xs text-white/40 mb-2 flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-400" /> Write this down</p>
                <p className="text-sm text-white/60">Your sign-in username</p>
                <p className="text-2xl font-bold tracking-wide text-white mb-3">{createdUsername || username}</p>
                <p className="text-xs text-white/40">
                  Sign in with this username and the password you just chose — not your email.
                  Next you will be asked to set a 4-digit PIN; that PIN is what lets you reset your
                  own password if you ever forget it, so pick one you will remember.
                </p>
              </div>

              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10 mb-8 text-left space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-white/70">Admin account created</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-white/70">Business information saved</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-white/70">First store configured</span>
                </div>
              </div>

              <Button
                onClick={goToDashboard}
                className="h-14 px-10 text-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-2xl shadow-xl shadow-blue-500/25 border-0"
              >
                Go to Dashboard <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
