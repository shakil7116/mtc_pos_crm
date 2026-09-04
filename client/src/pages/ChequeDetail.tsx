import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { shrinkImage, DOCUMENT } from "@/lib/image";
import {
  ArrowLeft, ScrollText, Upload, ExternalLink, FileText,
  AlertOctagon, RefreshCw, Banknote, FileImage,
} from "lucide-react";

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  deposited: "bg-blue-100 text-blue-700",
  cleared: "bg-green-100 text-green-700",
  bounced: "bg-red-600 text-white",
  cancelled: "bg-slate-200 text-slate-600",
};

const RECOVERY_LABEL: Record<string, string> = {
  replacement_requested: "Replacement requested",
  replacement_received: "Replacement received",
  cash_requested: "Cash payment requested",
  cash_received: "Cash recovered",
  written_off: "Written off",
};

const RECOVERY_STYLE: Record<string, string> = {
  replacement_requested: "bg-orange-100 text-orange-700 border-orange-200",
  replacement_received: "bg-green-100 text-green-700 border-green-200",
  cash_requested: "bg-orange-100 text-orange-700 border-orange-200",
  cash_received: "bg-green-100 text-green-700 border-green-200",
  written_off: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function ChequeDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, nav] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const proofRef = useRef<HTMLInputElement>(null);
  const clearProofRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: chq, isLoading } = useQuery<any>({
    queryKey: [`/api/cheques/${id}`],
    queryFn: () => fetch(`/api/cheques/${id}`).then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); }),
  });

  const photoMut = useMutation({
    mutationFn: (photoUrl: string) =>
      fetch(`/api/cheques/${id}/photo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoUrl }) })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Upload failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/cheques/${id}`] }); toast({ title: "Cheque image saved" }); },
    onError: (e: any) => toast({ title: "Upload failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const depositProofMut = useMutation({
    mutationFn: (depositProofUrl: string) =>
      fetch(`/api/cheques/${id}/deposit-proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ depositProofUrl }) })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Upload failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/cheques/${id}`] }); toast({ title: "Deposit proof saved" }); },
    onError: (e: any) => toast({ title: "Upload failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const clearanceProofMut = useMutation({
    mutationFn: (clearanceProofUrl: string) =>
      fetch(`/api/cheques/${id}/clearance-proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearanceProofUrl }) })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Upload failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/cheques/${id}`] }); toast({ title: "Clearance proof saved" }); },
    onError: (e: any) => toast({ title: "Upload failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>, mut: typeof photoMut) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast({ title: "Pick a PNG/JPG/WebP image", variant: "destructive" }); return; }
    setUploading(true);
    try {
      mut.mutate(await shrinkImage(file, DOCUMENT));
    } catch {
      toast({ title: "Could not read file", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) return <div className="p-6 max-w-3xl mx-auto space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /></div>;
  if (!chq) return (
    <div className="p-6 max-w-3xl mx-auto space-y-3">
      <button onClick={() => nav("/finance?tab=cheques")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Cheques</button>
      <p className="text-sm text-muted-foreground">Cheque not found.</p>
    </div>
  );

  const st = chq.displayStatus || chq.status;
  const isPayable = chq.type === "payable";
  const isBounced = chq.status === "bounced";
  const isDeposited = chq.status === "deposited" || chq.status === "cleared";

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <button onClick={() => nav("/finance?tab=cheques")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Cheques</button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center"><ScrollText className="w-5 h-5 text-indigo-600" /></div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight font-mono">#{chq.chequeNumber}</h1>
          <p className="text-sm text-muted-foreground">{isPayable ? "Payable — we pay" : "Receivable — we receive"} · {chq.bankName}</p>
        </div>
        <span className={cn("text-xs font-bold uppercase rounded-full px-3 py-1", STATUS_STYLE[st] || "bg-slate-100")}>{st}</span>
      </div>

      {/* Recovery banner for bounced cheques */}
      {isBounced && (
        <div className={cn("rounded-xl border p-4 space-y-2", chq.recoveryStatus ? RECOVERY_STYLE[chq.recoveryStatus] : "bg-red-50 border-red-200")}>
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5" />
            <p className="font-semibold">
              {chq.recoveryStatus ? RECOVERY_LABEL[chq.recoveryStatus] : "Bounced — awaiting recovery action"}
            </p>
          </div>
          {chq.recoveryNotes && <p className="text-sm">{chq.recoveryNotes}</p>}
          {chq.replacementCheque && (
            <Link href={`/cheques/${chq.replacementCheque.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
              <RefreshCw className="w-3.5 h-3.5" /> Replacement: #{chq.replacementCheque.chequeNumber} ({chq.replacementCheque.status})
            </Link>
          )}
        </div>
      )}

      {/* This cheque is a replacement for a bounced one */}
      {chq.originalBouncedCheque && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Link href={`/cheques/${chq.originalBouncedCheque.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:underline">
            <RefreshCw className="w-3.5 h-3.5" /> Replaces bounced cheque #{chq.originalBouncedCheque.chequeNumber} ({money(chq.originalBouncedCheque.amount)})
          </Link>
        </div>
      )}

      {/* Fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Amount" value={money(chq.amount)} strong />
        <Field label="Type" value={isPayable ? "Payable" : "Receivable"} />
        <Field label="Cheque date" value={chq.chequeDate} />
        <Field label="Who" value={chq.who || chq.customerName || "—"} />
        <Field label="Bank (on cheque)" value={chq.bankName} />
        <Field label="Deposited" value={chq.depositedDate || "—"} />
        {chq.depositedToAccount && <Field label="Deposited to" value={chq.depositedToAccount} />}
        {chq.clearedDate && <Field label="Cleared" value={chq.clearedDate} />}
        {chq.bouncedDate && <Field label="Bounced" value={chq.bouncedDate} />}
      </div>

      {/* Linked document */}
      {chq.linkedDoc && (
        <Link href={`/documents/${chq.linkedDoc.id}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-secondary/20">
          <FileText className="w-5 h-5 text-blue-600" />
          <div className="flex-1"><p className="text-sm font-semibold">{chq.linkedDoc.type} {chq.linkedDoc.number}</p><p className="text-xs text-muted-foreground">{chq.linkedDoc.customerName || "—"} · {money(chq.linkedDoc.total)}</p></div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </Link>
      )}

      {/* Scanned cheque image */}
      <div className="section-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Cheque image</h2>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onPick(e, photoMut)} />
          <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading || photoMut.isPending} onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4" /> {chq.photoUrl ? "Replace" : "Upload"}
          </Button>
        </div>
        {chq.photoUrl ? (
          <img src={chq.photoUrl} alt={`Cheque ${chq.chequeNumber}`} className="w-full max-h-96 object-contain rounded-lg border bg-slate-50" />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8 bg-slate-50 rounded-lg border border-dashed">No image yet — upload a scan or photo of the cheque.</p>
        )}
      </div>

      {/* Deposit proof (bank slip) */}
      {isDeposited && (
        <div className="section-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileImage className="w-4 h-4 text-blue-600" />
              <h2 className="font-semibold text-sm">Deposit proof (bank slip)</h2>
            </div>
            <input ref={proofRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onPick(e, depositProofMut)} />
            <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading || depositProofMut.isPending} onClick={() => proofRef.current?.click()}>
              <Upload className="w-4 h-4" /> {chq.depositProofUrl ? "Replace" : "Upload"}
            </Button>
          </div>
          {chq.depositProofUrl ? (
            <img src={chq.depositProofUrl} alt="Deposit proof" className="w-full max-h-96 object-contain rounded-lg border bg-blue-50" />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8 bg-blue-50/50 rounded-lg border border-dashed border-blue-200">
              No deposit slip yet — upload a photo of the bank receipt to prove deposit.
            </p>
          )}
        </div>
      )}

      {/* Clearance proof (bank statement confirmation) */}
      {chq.status === "cleared" && (
        <div className="section-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-green-600" />
              <h2 className="font-semibold text-sm">Clearance proof (bank confirmation)</h2>
            </div>
            <input ref={clearProofRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onPick(e, clearanceProofMut)} />
            <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading || clearanceProofMut.isPending} onClick={() => clearProofRef.current?.click()}>
              <Upload className="w-4 h-4" /> {chq.clearanceProofUrl ? "Replace" : "Upload"}
            </Button>
          </div>
          {chq.clearanceProofUrl ? (
            <img src={chq.clearanceProofUrl} alt="Clearance proof" className="w-full max-h-96 object-contain rounded-lg border bg-green-50" />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8 bg-green-50/50 rounded-lg border border-dashed border-green-200">
              No clearance proof yet — upload a bank statement screenshot confirming the amount was credited.
            </p>
          )}
        </div>
      )}

      {/* Cash flow impact note */}
      {chq.status === "cleared" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <p className="flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            <span><strong>{money(chq.amount)}</strong> booked to {isPayable ? "bank outflow" : "bank inflow"} on clearance ({chq.clearedDate}).{chq.depositedToAccount ? ` Account: ${chq.depositedToAccount}` : ""}</span>
          </p>
        </div>
      )}

      {/* Status timeline */}
      <div className="section-card">
        <h2 className="font-semibold text-sm mb-3">Status history</h2>
        {(chq.history || []).length === 0 ? <p className="text-sm text-muted-foreground">No events.</p> : (
          <ol className="space-y-2">
            {chq.history.map((h: any, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className={cn("mt-1 w-2 h-2 rounded-full shrink-0",
                  h.label.includes("Bounced") ? "bg-red-500" :
                  h.label.includes("Cleared") ? "bg-green-500" :
                  h.label.includes("Recovery") ? "bg-orange-500" :
                  "bg-indigo-500"
                )} />
                <div><p className="text-sm font-medium">{h.label}</p><p className="text-[11px] text-muted-foreground">{h.at}{h.note ? ` · ${h.note}` : ""}</p></div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: any; strong?: boolean }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5", strong ? "font-mono font-bold text-lg" : "text-sm font-medium")}>{value}</p>
    </div>
  );
}
