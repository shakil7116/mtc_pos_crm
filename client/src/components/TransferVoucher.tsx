import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);
const fmtDate = (iso: string) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return d ? `${d}/${m}/${y}` : iso; };

// Printable internal Transfer Voucher (TR). Staff/internal document — cost column
// only when the transfer crosses ownership; otherwise it is a plain stock-move note.
export default function TransferVoucher({ transfer, onClose }: { transfer: any | null; onClose: () => void }) {
  const { data: s } = useQuery<any>({ queryKey: ["/api/settings"], queryFn: () => fetch("/api/settings").then((r) => r.json()), staleTime: 60_000 });
  if (!transfer) return null;
  const cross = !!transfer.crossOwner;
  const items = transfer.items || [];

  return (
    <Dialog open={!!transfer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b no-print">
          <span className="text-sm font-semibold text-muted-foreground">Transfer Voucher</span>
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5 bg-[#1e2a3a] text-white" onClick={() => { const prev = document.title; document.title = transfer.number || prev; window.print(); document.title = prev; }}><Printer className="w-4 h-4" /> Print</Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="transfer-voucher-print p-6 text-[13px] text-slate-800">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-300 pb-3 mb-3">
            <div>
              <p className="font-bold text-[15px]">{s?.storeNameEn || ""}</p>
              <p className="text-[11px] text-slate-500">{s?.addressEn || ""}</p>
              <p className="text-[11px] text-slate-500">PHONE: {s?.phone || ""} · C.R. {s?.crNumber || ""}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-arabic" dir="rtl">{s?.storeNameAr || ""}</p>
            </div>
          </div>

          {/* Title */}
          <div className="text-center my-3">
            <h1 className="text-[18px] font-bold tracking-[0.2em]">سند تحويل / STOCK TRANSFER</h1>
            {cross
              ? <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border border-amber-500 text-amber-700">Inter-store · valued at cost</span>
              : <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border border-green-500 text-green-700">Internal move · no charge</span>}
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-2 mb-3 text-[12px]">
            <div><span className="text-slate-500">No.:</span> <b className="font-mono">{transfer.number}</b></div>
            <div className="text-right"><span className="text-slate-500">Date:</span> <b>{fmtDate(transfer.date)}</b></div>
            <div><span className="text-slate-500">From:</span> <b>{transfer.fromStore}</b></div>
            <div className="text-right"><span className="text-slate-500">To:</span> <b>{transfer.toStore}</b></div>
            <div><span className="text-slate-500">Status:</span> <b className="capitalize">{transfer.status}</b></div>
            <div className="text-right"><span className="text-slate-500">Taken by:</span> <b>{transfer.takenBy || "—"}</b></div>
            {transfer.receivedByName && <div className="col-span-2"><span className="text-slate-500">Received &amp; confirmed by:</span> <b>{transfer.receivedByName}</b>{transfer.confirmMethod && transfer.confirmMethod !== "on-system" ? <span className="text-slate-500"> · via {transfer.confirmMethod}</span> : null}</div>}
          </div>

          {/* Items */}
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-y border-slate-300 text-[10px] uppercase text-slate-500">
                <th className="text-left py-1 px-1">#</th>
                <th className="text-left py-1 px-1">Description</th>
                <th className="text-right py-1 px-1">Qty</th>
                <th className="text-left py-1 px-1">Unit</th>
                {cross && <th className="text-right py-1 px-1">Cost</th>}
                {cross && <th className="text-right py-1 px-1">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, i: number) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1 px-1">{i + 1}</td>
                  <td className="py-1 px-1 font-medium">{it.description}</td>
                  <td className="py-1 px-1 text-right font-mono">{Number(it.qty)}</td>
                  <td className="py-1 px-1">{it.unit}</td>
                  {cross && <td className="py-1 px-1 text-right font-mono">{money(it.price)}</td>}
                  {cross && <td className="py-1 px-1 text-right font-mono">{money(it.amount)}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {cross && (
            <div className="flex justify-end mt-2">
              <div className="w-56 flex justify-between border-t-2 border-slate-800 pt-1 font-bold">
                <span>TOTAL (at cost)</span><span className="font-mono">{money(transfer.total)}</span>
              </div>
            </div>
          )}

          {/* Signatures — destination line pre-stamped with the recorded receiver + method */}
          <div className="grid grid-cols-2 gap-8 mt-10">
            <div className="text-center">
              <p className="text-[11px] font-medium h-4">&nbsp;</p>
              <div className="border-t border-slate-400 mb-1" />
              <p className="text-[10px] uppercase text-slate-500">Released by (source){transfer.takenBy ? ` · ${transfer.takenBy}` : ""}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-medium h-4">{transfer.receivedByName || " "}</p>
              <div className="border-t border-slate-400 mb-1" />
              <p className="text-[10px] uppercase text-slate-500">
                Received by (destination)
                {transfer.confirmMethod ? ` · confirmed via ${transfer.confirmMethod === "on-system" ? "system" : transfer.confirmMethod}` : ""}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
