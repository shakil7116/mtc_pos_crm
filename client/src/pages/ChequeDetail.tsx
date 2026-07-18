import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ArrowLeft, ScrollText, Upload, ExternalLink, FileText } from "lucide-react";

const money = (v: any) => `QAR ${(Number(v) || 0).toFixed(2)}`;
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  deposited: "bg-blue-100 text-blue-700",
  cleared: "bg-green-100 text-green-700",
  bounced: "bg-red-600 text-white",
  cancelled: "bg-slate-200 text-slate-600",
};

/* Cheque detail — full record: fields, linked document, scanned image (upload),
   and the status timeline. Reached from the PDC/Cheques list. */
export default function ChequeDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, nav] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
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

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast({ title: "Pick a PNG/JPG/WebP image", variant: "destructive" }); return; }
    if (file.size > 4_000_000) { toast({ title: "Image too large (max ~4 MB)", variant: "destructive" }); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => { photoMut.mutate(String(reader.result)); setUploading(false); };
    reader.onerror = () => { setUploading(false); toast({ title: "Could not read file", variant: "destructive" }); };
    reader.readAsDataURL(file);
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

      {/* Fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Amount" value={money(chq.amount)} strong />
        <Field label="Type" value={isPayable ? "Payable" : "Receivable"} />
        <Field label="Cheque date" value={chq.chequeDate} />
        <Field label="Who" value={chq.who || chq.customerName || "—"} />
        <Field label="Bank" value={chq.bankName} />
        <Field label="Deposited" value={chq.depositedDate || "—"} />
      </div>

      {/* Linked document */}
      {chq.linkedDoc && (
        <Link href={`/documents/${chq.linkedDoc.id}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-secondary/20">
          <FileText className="w-5 h-5 text-blue-600" />
          <div className="flex-1"><p className="text-sm font-semibold">{chq.linkedDoc.type} {chq.linkedDoc.number}</p><p className="text-xs text-muted-foreground">{chq.linkedDoc.customerName || "—"} · {money(chq.linkedDoc.total)}</p></div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </Link>
      )}

      {/* Scanned image */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Cheque image</h2>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} />
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

      {/* Status timeline */}
      <div className="rounded-2xl border p-4">
        <h2 className="font-semibold text-sm mb-3">Status history</h2>
        {(chq.history || []).length === 0 ? <p className="text-sm text-muted-foreground">No events.</p> : (
          <ol className="space-y-2">
            {chq.history.map((h: any, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
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
