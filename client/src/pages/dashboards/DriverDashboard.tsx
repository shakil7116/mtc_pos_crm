import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Truck, MapPin, Package, CheckCircle2, FileText, Upload,
  AlertTriangle, X, Loader2, Phone, Clock, ChevronDown, ChevronUp,
  Navigation, CircleDot, ShieldCheck, PackageCheck, Calendar,
  RotateCcw, Undo2, ThumbsUp, RefreshCw,
} from "lucide-react";
import { useDeliveries, todayStr, fetchArray } from "./shared";
import TasksPanel from "@/components/TasksPanel";
import { shrinkImage, DOCUMENT } from "@/lib/image";

// A signed delivery note is the proof a customer received the goods, so it is
// shrunk as a DOCUMENT — the signature and the name must stay readable.
const shrinkDeliveryProof = (file: File) => shrinkImage(file, DOCUMENT);

const STAGE_META: Record<string, { label: string; color: string; icon: any; order: number }> = {
  pending_pick:  { label: "Waiting Pick",  color: "bg-slate-100 text-slate-700",     icon: Clock,        order: 0 },
  picked:        { label: "Picked",        color: "bg-blue-100 text-blue-700",       icon: PackageCheck, order: 1 },
  authorized:    { label: "Ready to Go",   color: "bg-emerald-100 text-emerald-700", icon: ShieldCheck,  order: 2 },
  in_transit:    { label: "In Transit",    color: "bg-amber-100 text-amber-700",     icon: Navigation,   order: 3 },
  delivered:     { label: "Delivered",     color: "bg-green-100 text-green-700",     icon: CheckCircle2, order: 4 },
};

function stageMeta(s: string) {
  return STAGE_META[s] || { label: s, color: "bg-slate-100 text-slate-600", icon: CircleDot, order: -1 };
}

const RESOLUTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  returned_to_warehouse: { label: "Returned to warehouse", color: "bg-blue-100 text-blue-700", icon: Undo2 },
  customer_accepted:     { label: "Customer accepted",     color: "bg-green-100 text-green-700", icon: ThumbsUp },
  redelivery_requested:  { label: "Redelivery requested",  color: "bg-amber-100 text-amber-700", icon: RefreshCw },
};

export default function DriverDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = todayStr();

  const [tab, setTab] = useState<"active" | "done" | "all">("active");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Proof-of-delivery modal
  const [proofId, setProofId] = useState<number | null>(null);
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [signImg, setSignImg] = useState<string>("");
  const [dmgOpen, setDmgOpen] = useState(false);
  const [dmgNotes, setDmgNotes] = useState("");
  const [dmgPhoto, setDmgPhoto] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Damage resolution modal
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string>("");
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveBusy, setResolveBusy] = useState(false);

  const { data: deliveries = [], isLoading } = useDeliveries(`?driverId=${user?.id}`);

  const { data: returns = [] } = useQuery<any[]>({
    queryKey: ["/api/returns"],
    queryFn: () => fetchArray("/api/returns"),
    refetchInterval: 60_000,
  });

  const active = deliveries
    .filter((d) => d.deliveryStatus !== "delivered")
    .sort((a, b) => stageMeta(b.deliveryStatus).order - stageMeta(a.deliveryStatus).order);

  const doneToday = deliveries.filter((d) => d.deliveryStatus === "delivered" && d.date === today);
  const allDone = deliveries
    .filter((d) => d.deliveryStatus === "delivered")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const readyCount = active.filter((d) => d.deliveryStatus === "authorized" || d.deliveryStatus === "in_transit").length;
  const damaged = deliveries.filter((d) => d.damageReported);
  const unresolvedDamage = damaged.filter((d) => !d.damageResolution);

  const deliveryInvIds = new Set(deliveries.map((d) => d.id));
  const myReturns = returns.filter((r: any) => deliveryInvIds.has(r.originalInvoiceId));

  const proofDoc = deliveries.find((d) => d.id === proofId);
  const resolveDoc = deliveries.find((d) => d.id === resolveId);

  function resetProof() {
    setProofId(null); setRName(""); setRPhone(""); setSignImg("");
    setDmgOpen(false); setDmgNotes(""); setDmgPhoto(""); setBusy(false);
  }

  async function submitDelivery() {
    if (!proofDoc) return;
    if (!rName.trim()) { toast({ title: "Receiver name required", variant: "destructive" }); return; }
    if (!signImg) { toast({ title: "Upload the signed delivery note", variant: "destructive" }); return; }
    setBusy(true);
    try {
      if (dmgOpen && dmgNotes.trim()) {
        const dr = await fetch(`/api/documents/${proofDoc.id}/report-damage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: dmgNotes.trim(), photo: dmgPhoto || undefined }),
        });
        if (!dr.ok) throw new Error((await dr.json().catch(() => ({}))).message || "Damage report failed");
      }
      const r = await fetch(`/api/documents/${proofDoc.id}/delivered`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverName: rName.trim(), receiverPhone: rPhone.trim(), signedDnImage: signImg }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed");
      const data = await r.json();
      qc.invalidateQueries({ queryKey: [`/api/deliveries?driverId=${user?.id}`] });
      resetProof();
      toast({ title: "Delivered", description: data.deliveryNote ? `${data.deliveryNote.number} completed.` : undefined });
    } catch (e: any) {
      setBusy(false);
      toast({ title: "Could not complete", description: String(e?.message || ""), variant: "destructive" });
    }
  }

  async function submitResolution() {
    if (!resolveDoc || !resolution) return;
    setResolveBusy(true);
    try {
      const r = await fetch(`/api/documents/${resolveDoc.id}/resolve-damage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, notes: resolveNotes.trim() || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed");
      qc.invalidateQueries({ queryKey: [`/api/deliveries?driverId=${user?.id}`] });
      setResolveId(null); setResolution(""); setResolveNotes(""); setResolveBusy(false);
      const labels: Record<string, string> = { returned_to_warehouse: "Returned to warehouse", customer_accepted: "Customer accepted", redelivery_requested: "Redelivery requested" };
      toast({ title: labels[resolution] || "Resolved" });
    } catch (e: any) {
      setResolveBusy(false);
      toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" });
    }
  }

  const toggle = (id: number) => setExpandedId(expandedId === id ? null : id);

  const tabs = [
    { key: "active" as const, label: "Active", count: active.length },
    { key: "done" as const,   label: "Done Today", count: doneToday.length },
    { key: "all" as const,    label: "History", count: allDone.length },
  ];

  const visibleList = tab === "active" ? active : tab === "done" ? doneToday : allDone;

  return (
    <div className="max-w-lg mx-auto min-h-[calc(100vh-6rem)] pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#f8f9fb] px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
            <Truck className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-[#1e2a3a]">My Deliveries</h1>
            <p className="text-sm text-muted-foreground">{user?.name || "Driver"}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="rounded-xl border bg-white p-2.5 text-center">
            <p className="text-xl font-bold text-[#1e2a3a]">{active.length}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Pending</p>
          </div>
          <div className="rounded-xl border bg-white p-2.5 text-center">
            <p className="text-xl font-bold text-emerald-600">{readyCount}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Ready</p>
          </div>
          <div className="rounded-xl border bg-white p-2.5 text-center">
            <p className="text-xl font-bold text-green-600">{doneToday.length}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Done Today</p>
          </div>
          <div className="rounded-xl border bg-white p-2.5 text-center">
            <p className={`text-xl font-bold ${unresolvedDamage.length > 0 ? "text-red-600" : "text-amber-600"}`}>{unresolvedDamage.length}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Damages</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* ═══ SECTION 1: TASKS ═══ */}
        <TasksPanel />

        {/* ═══ SECTION 2: DELIVERIES ═══ */}
        <section>
          <div className="flex rounded-xl bg-white border overflow-hidden mb-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  tab === t.key ? "bg-[#1e2a3a] text-white" : "text-muted-foreground hover:bg-slate-50"
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>}

          {!isLoading && visibleList.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-2xl p-8">
              {tab === "active" ? (
                <>
                  <CheckCircle2 className="w-14 h-14 text-green-500 mb-2" />
                  <p className="font-bold text-xl">All clear!</p>
                  <p className="text-muted-foreground text-sm mt-1">No pending deliveries.</p>
                </>
              ) : (
                <>
                  <Package className="w-14 h-14 text-slate-300 mb-2" />
                  <p className="font-bold text-lg text-muted-foreground">No deliveries here.</p>
                </>
              )}
            </div>
          )}

          <div className="space-y-3">
            {visibleList.map((d) => {
              const sm = stageMeta(d.deliveryStatus);
              const Icon = sm.icon;
              const expanded = expandedId === d.id;
              const canDeliver = d.deliveryStatus === "authorized" || d.deliveryStatus === "in_transit";
              const isDone = d.deliveryStatus === "delivered";

              return (
                <div
                  key={d.id}
                  className={`rounded-2xl border bg-white shadow-sm overflow-hidden transition-all ${
                    canDeliver ? "border-emerald-200 ring-1 ring-emerald-100" : ""
                  } ${isDone ? "opacity-80" : ""}`}
                >
                  <button
                    onClick={() => toggle(d.id)}
                    className="w-full text-left p-3.5 flex items-start gap-3"
                  >
                    <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sm.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-[#1e2a3a] text-base block leading-snug">{d.customerName || "Customer"}</span>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] font-mono text-muted-foreground">{d.number}</span>
                        {d.dnNumber && <span className="text-[11px] font-mono text-blue-600">{d.dnNumber}</span>}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sm.color}`}>{sm.label}</span>
                        {d.damageReported && !d.damageResolution && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Damaged</span>
                        )}
                        {d.damageResolution && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${RESOLUTION_LABELS[d.damageResolution]?.color || "bg-slate-100 text-slate-700"}`}>
                            {RESOLUTION_LABELS[d.damageResolution]?.label || d.damageResolution}
                          </span>
                        )}
                      </div>
                      {d.expectedDeliveryDate && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Expected: {d.expectedDeliveryDate}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-muted-foreground">
                      {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t">
                      {(d.mapLink || d.deliveryAddress) && (
                        <a
                          href={d.mapLink || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((d.deliveryAddress || "") + ", Doha, Qatar")}`}
                          target="_blank" rel="noreferrer"
                          className="flex items-start gap-3 px-4 py-3 bg-blue-50/60 active:bg-blue-100 border-b"
                        >
                          <MapPin className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1e2a3a] leading-snug">{d.deliveryAddress || "Open location"}</p>
                            <p className="text-[11px] text-blue-600 font-semibold mt-0.5">Tap to navigate</p>
                          </div>
                        </a>
                      )}

                      {d.customerPhone && (
                        <a href={`tel:${d.customerPhone}`} className="flex items-center gap-3 px-4 py-2.5 border-b active:bg-slate-50">
                          <Phone className="w-4 h-4 text-green-600 shrink-0" />
                          <span className="text-sm font-semibold text-[#1e2a3a]">{d.customerPhone}</span>
                          <span className="text-xs text-green-600 font-semibold ml-auto">Call</span>
                        </a>
                      )}

                      <div className="p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" /> Items ({(d.items || []).length})
                        </p>
                        <ul className="space-y-1.5">
                          {(d.items || []).map((i: any, n: number) => (
                            <li key={n} className="flex justify-between items-center text-sm bg-slate-50 rounded-xl px-3 py-2">
                              <span className="font-medium leading-snug flex-1">{i.description}</span>
                              <span className="font-mono font-bold shrink-0 ml-3">
                                {Number(i.qty)} <span className="text-[10px] font-normal text-muted-foreground">{i.unit || ""}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        {d.deliveryInstructions && (
                          <p className="mt-2 text-xs bg-yellow-50 border border-yellow-200 rounded-xl p-2.5 text-yellow-800">
                            {d.deliveryInstructions}
                          </p>
                        )}
                      </div>

                      {/* Damage detail */}
                      {d.damageReported && (
                        <div className="mx-3.5 mb-3 rounded-xl border border-amber-300 bg-amber-50/60 p-3 space-y-2">
                          <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4" /> Damage Report
                          </p>
                          {d.damageNotes && <p className="text-sm text-amber-900">{d.damageNotes}</p>}
                          {d.damagePhoto && (
                            <img src={d.damagePhoto} alt="Damage" className="w-full h-32 object-cover rounded-lg border border-amber-200" />
                          )}
                          {d.damageReportedAt && (
                            <p className="text-[10px] text-amber-600">Reported: {new Date(d.damageReportedAt).toLocaleString()}</p>
                          )}

                          {/* Resolution status or action button */}
                          {d.damageResolution ? (
                            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${RESOLUTION_LABELS[d.damageResolution]?.color || "bg-slate-100"}`}>
                              {(() => { const RI = RESOLUTION_LABELS[d.damageResolution]?.icon || CheckCircle2; return <RI className="w-4 h-4 shrink-0" />; })()}
                              <div>
                                <p className="text-xs font-semibold">{RESOLUTION_LABELS[d.damageResolution]?.label || d.damageResolution}</p>
                                {d.damageResolutionNotes && <p className="text-[11px] opacity-80">{d.damageResolutionNotes}</p>}
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setResolveId(d.id); setResolution(""); setResolveNotes(""); }}
                              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-semibold text-sm flex items-center justify-center gap-2"
                            >
                              <AlertTriangle className="w-4 h-4" /> Resolve damage
                            </button>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      {canDeliver && (
                        <div className="px-3.5 pb-3.5">
                          <button
                            onClick={() => { resetProof(); setProofId(d.id); }}
                            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-600/20"
                          >
                            <CheckCircle2 className="w-6 h-6" /> Mark as Delivered
                          </button>
                        </div>
                      )}

                      {!canDeliver && !isDone && (
                        <div className="px-3.5 pb-3.5">
                          <div className="w-full py-3 rounded-2xl bg-slate-100 text-slate-500 font-semibold text-sm text-center flex items-center justify-center gap-2">
                            <Clock className="w-4 h-4" />
                            {d.deliveryStatus === "pending_pick" && "Waiting for warehouse pick"}
                            {d.deliveryStatus === "picked" && "Waiting for manager authorization"}
                          </div>
                        </div>
                      )}

                      {isDone && d.signedDnUrl && (
                        <div className="px-3.5 pb-3.5">
                          <div className="rounded-xl border overflow-hidden">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-3 pt-2">Signed DN</p>
                            <img src={d.signedDnUrl} alt="Signed DN" className="w-full h-32 object-cover" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══ SECTION 3: RETURNS ═══ */}
        {myReturns.length > 0 && (
          <section className="rounded-xl border p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3">
              <RotateCcw className="w-3.5 h-3.5" /> Returns ({myReturns.length})
            </h2>
            <div className="space-y-2">
              {myReturns.map((r: any) => (
                <div key={r.id} className="rounded-xl border px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      r.status === "approved" ? "bg-green-100 text-green-700"
                        : r.status === "rejected" ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      <RotateCcw className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{r.customerName}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          r.status === "approved" ? "bg-green-100 text-green-700"
                            : r.status === "rejected" ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {r.originalInvoiceNumber} · {r.type === "rejected_delivery" ? "Delivery rejected" : r.type}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </p>
                      {r.items && r.items.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {r.items.slice(0, 3).map((it: any, idx: number) => (
                            <p key={idx} className="text-[11px] text-slate-600">
                              {it.description || it.productName} x {it.qty}
                            </p>
                          ))}
                          {r.items.length > 3 && <p className="text-[10px] text-muted-foreground">+{r.items.length - 3} more</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ SECTION 4: DAMAGE LOG ═══ */}
        {damaged.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 mb-3">
              <AlertTriangle className="w-3.5 h-3.5" /> Damage Reports ({damaged.length})
              {unresolvedDamage.length > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 ml-1">
                  {unresolvedDamage.length} unresolved
                </span>
              )}
            </h2>
            <div className="space-y-2">
              {damaged.map((d) => {
                const resolved = !!d.damageResolution;
                const rl = RESOLUTION_LABELS[d.damageResolution] || null;
                return (
                  <div key={d.id} className={`rounded-xl border bg-white px-3 py-2.5 ${!resolved ? "border-red-200" : "border-amber-200"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{d.customerName}</span>
                      <span className="text-[11px] font-mono text-muted-foreground">{d.dnNumber || d.number}</span>
                    </div>
                    {d.damageNotes && <p className="text-xs text-amber-900 mb-1">{d.damageNotes}</p>}
                    <div className="flex items-center gap-3 mb-2">
                      {d.damagePhoto && (
                        <img src={d.damagePhoto} alt="Damage" className="w-16 h-12 object-cover rounded-lg border border-amber-200" />
                      )}
                      {d.damageReportedAt && (
                        <p className="text-[10px] text-amber-600">
                          {new Date(d.damageReportedAt).toLocaleDateString()} {new Date(d.damageReportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    {resolved ? (
                      <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${rl?.color || "bg-slate-100"}`}>
                        {(() => { const RI = rl?.icon || CheckCircle2; return <RI className="w-3.5 h-3.5" />; })()}
                        {rl?.label || d.damageResolution}
                        {d.damageResolutionNotes && <span className="font-normal opacity-80 ml-1">· {d.damageResolutionNotes}</span>}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setResolveId(d.id); setResolution(""); setResolveNotes(""); }}
                        className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-semibold text-xs flex items-center justify-center gap-1.5"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" /> Resolve this damage
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* ═══ Proof-of-delivery modal ═══ */}
      {proofDoc && proofId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-[#1e2a3a]">Confirm delivery · {proofDoc.number}</h3>
              <button onClick={resetProof} className="p-1 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Received by (name) *</label>
                <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Receiver's full name"
                  className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#1e2a3a]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Receiver phone</label>
                <input value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder="Contact number" inputMode="tel"
                  className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#1e2a3a]" />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Signed delivery note (photo) *</label>
                {signImg ? (
                  <div className="mt-1 relative">
                    <img src={signImg} alt="signed DN" className="w-full h-40 object-cover rounded-xl border" />
                    <button onClick={() => setSignImg("")} className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <label className="mt-1 flex flex-col items-center justify-center gap-1.5 h-28 rounded-xl border-2 border-dashed border-slate-300 text-muted-foreground active:bg-slate-50 cursor-pointer">
                    <Upload className="w-6 h-6" />
                    <span className="text-xs font-semibold">Tap to photograph / upload the signed DN</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={async (e) => { const f = e.target.files?.[0]; if (f) setSignImg(await shrinkDeliveryProof(f)); }} />
                  </label>
                )}
              </div>

              {!dmgOpen ? (
                <button onClick={() => setDmgOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-amber-300 text-amber-700 text-sm font-semibold active:bg-amber-50">
                  <AlertTriangle className="w-4 h-4" /> Report damage / issue
                </button>
              ) : (
                <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Damage / issue</span>
                    <button onClick={() => { setDmgOpen(false); setDmgNotes(""); setDmgPhoto(""); }} className="text-amber-700"><X className="w-4 h-4" /></button>
                  </div>
                  <textarea value={dmgNotes} onChange={(e) => setDmgNotes(e.target.value)} rows={2} placeholder="What is damaged / wrong?"
                    className="w-full px-3 py-2 rounded-lg border border-amber-300 text-sm outline-none" />
                  {dmgPhoto ? (
                    <div className="relative">
                      <img src={dmgPhoto} alt="damage" className="w-full h-28 object-cover rounded-lg border" />
                      <button onClick={() => setDmgPhoto("")} className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-amber-300 text-amber-700 text-xs font-semibold active:bg-amber-100 cursor-pointer">
                      <Upload className="w-4 h-4" /> Add damage photo
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={async (e) => { const f = e.target.files?.[0]; if (f) setDmgPhoto(await shrinkDeliveryProof(f)); }} />
                    </label>
                  )}
                  <p className="text-[11px] text-amber-700/80">Manager alerted immediately. Delivery still completes.</p>
                </div>
              )}

              <button disabled={busy} onClick={submitDelivery}
                className="w-full py-4 rounded-2xl bg-green-600 active:scale-[0.98] text-white font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                Confirm delivered
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Damage resolution modal ═══ */}
      {resolveDoc && resolveId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-[#1e2a3a]">Resolve damage · {resolveDoc.dnNumber || resolveDoc.number}</h3>
              <button onClick={() => setResolveId(null)} className="p-1 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-4">
              {/* Damage summary */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs font-bold text-amber-800 mb-1">Damage reported:</p>
                <p className="text-sm text-amber-900">{resolveDoc.damageNotes || "No description"}</p>
                {resolveDoc.damagePhoto && (
                  <img src={resolveDoc.damagePhoto} alt="Damage" className="mt-2 w-full h-28 object-cover rounded-lg border border-amber-200" />
                )}
              </div>

              {/* Resolution options */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">What happened with the damaged items?</label>
                <div className="space-y-2">
                  <button
                    onClick={() => setResolution("returned_to_warehouse")}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      resolution === "returned_to_warehouse" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Undo2 className={`w-5 h-5 shrink-0 ${resolution === "returned_to_warehouse" ? "text-blue-600" : "text-slate-400"}`} />
                    <div>
                      <p className="text-sm font-semibold">Return to warehouse</p>
                      <p className="text-[11px] text-muted-foreground">Bring damaged goods back to stock. No delivery.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setResolution("customer_accepted")}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      resolution === "customer_accepted" ? "border-green-500 bg-green-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <ThumbsUp className={`w-5 h-5 shrink-0 ${resolution === "customer_accepted" ? "text-green-600" : "text-slate-400"}`} />
                    <div>
                      <p className="text-sm font-semibold">Customer accepted</p>
                      <p className="text-[11px] text-muted-foreground">Customer took the goods despite damage.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setResolution("redelivery_requested")}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      resolution === "redelivery_requested" ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <RefreshCw className={`w-5 h-5 shrink-0 ${resolution === "redelivery_requested" ? "text-amber-600" : "text-slate-400"}`} />
                    <div>
                      <p className="text-sm font-semibold">Request redelivery</p>
                      <p className="text-[11px] text-muted-foreground">Return damaged goods, send new ones. Goes back to warehouse pick.</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Notes */}
              {resolution && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Notes (optional)</label>
                  <textarea
                    value={resolveNotes}
                    onChange={(e) => setResolveNotes(e.target.value)}
                    rows={2}
                    placeholder={
                      resolution === "returned_to_warehouse" ? "Any details about the return..."
                      : resolution === "customer_accepted" ? "Discount agreed, condition notes..."
                      : "What replacement is needed..."
                    }
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#1e2a3a]"
                  />
                </div>
              )}

              <button
                disabled={!resolution || resolveBusy}
                onClick={submitResolution}
                className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all ${
                  resolution === "returned_to_warehouse" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : resolution === "customer_accepted" ? "bg-green-600 text-white shadow-lg shadow-green-600/20"
                  : resolution === "redelivery_requested" ? "bg-amber-600 text-white shadow-lg shadow-amber-600/20"
                  : "bg-slate-300 text-slate-500"
                }`}
              >
                {resolveBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                {resolution === "returned_to_warehouse" ? "Confirm return"
                  : resolution === "customer_accepted" ? "Confirm accepted"
                  : resolution === "redelivery_requested" ? "Request redelivery"
                  : "Select an option above"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
