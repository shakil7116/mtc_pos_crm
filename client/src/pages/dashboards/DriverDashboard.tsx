import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Truck, MapPin, Package, CheckCircle2, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { useDeliveries, todayStr } from "./shared";
import TasksPanel from "@/components/TasksPanel";

/**
 * Driver Dashboard — ultra simple, full screen, ONE delivery at a time.
 * Big customer name, tappable address (opens maps), items, big green button.
 * Swipe/arrow to the next delivery. Zero pricing, zero clutter.
 */
export default function DriverDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);

  const { data: deliveries = [], isLoading } = useDeliveries(`?driverId=${user?.id}`);
  const today = todayStr();
  const pending = deliveries.filter((d) => d.deliveryStatus !== "delivered");
  const doneToday = deliveries.filter((d) => d.deliveryStatus === "delivered" && d.date === today);
  const cur = pending[Math.min(idx, Math.max(0, pending.length - 1))];

  const deliverMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/documents/${id}/delivered`, { method: "POST" }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed");
        return r.json();
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [`/api/deliveries?driverId=${user?.id}`] });
      setIdx(0);
      toast({ title: "Delivered ✓", description: data.deliveryNote ? `Note ${data.deliveryNote.number} generated.` : undefined });
    },
    onError: (e: any) => toast({ title: "Could not update", description: String(e?.message || ""), variant: "destructive" }),
  });

  const next = () => setIdx((i) => Math.min(i + 1, pending.length - 1));
  const prev = () => setIdx((i) => Math.max(i - 1, 0));

  return (
    <div
      className="max-w-md mx-auto min-h-[calc(100vh-6rem)] p-4 flex flex-col"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (dx < -60) next(); else if (dx > 60) prev();
        setTouchX(null);
      }}
    >
      <header className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
          <Truck className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1e2a3a]">My Deliveries</h1>
          <p className="text-sm text-muted-foreground">{pending.length} to go · {doneToday.length} done today</p>
        </div>
        {pending.length > 1 && (
          <span className="text-sm font-bold bg-slate-100 rounded-full px-3 py-1">{idx + 1} / {pending.length}</span>
        )}
      </header>

      <TasksPanel />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !cur && (
        <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-3xl p-8">
          <CheckCircle2 className="w-16 h-16 text-green-500 mb-3" />
          <p className="font-bold text-2xl">All done!</p>
          <p className="text-muted-foreground mt-1">No pending deliveries assigned to you.</p>
          {doneToday.length > 0 && (
            <div className="mt-6 w-full space-y-1.5">
              {doneToday.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl border bg-green-50/50">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="font-medium truncate">{d.customerName}</span>
                  <span className="text-muted-foreground text-xs ml-auto shrink-0">{d.number}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cur && (
        <div className="flex-1 flex flex-col rounded-3xl border-2 border-blue-100 bg-white shadow-sm overflow-hidden">
          {/* Customer — large */}
          <div className="bg-[#1e2a3a] text-white p-5">
            <p className="text-[11px] uppercase tracking-widest text-white/60 flex items-center gap-1">
              <FileText className="w-3 h-3" /> {cur.number}
            </p>
            <h2 className="text-2xl font-bold leading-tight mt-1">{cur.customerName || "Customer"}</h2>
          </div>

          {/* Address — large, tappable → maps */}
          {cur.deliveryAddress && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(cur.deliveryAddress + ", Doha, Qatar")}`}
              target="_blank" rel="noreferrer"
              className="flex items-start gap-3 p-4 bg-blue-50 active:bg-blue-100 border-b"
            >
              <MapPin className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-base font-semibold text-[#1e2a3a] leading-snug">{cur.deliveryAddress}</p>
                <p className="text-xs text-blue-600 font-semibold mt-0.5">Tap to open in Maps →</p>
              </div>
            </a>
          )}

          {/* Items */}
          <div className="flex-1 p-4 overflow-y-auto">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> Items to deliver
            </p>
            <ul className="space-y-2">
              {(cur.items || []).map((i: any, n: number) => (
                <li key={n} className="flex justify-between items-center text-base bg-slate-50 rounded-xl px-3 py-2.5">
                  <span className="truncate font-medium">{i.description}</span>
                  <span className="font-mono font-bold text-lg shrink-0 ml-3">{Number(i.qty)} <span className="text-xs font-normal text-muted-foreground">{i.unit || ""}</span></span>
                </li>
              ))}
            </ul>
            {cur.deliveryInstructions && (
              <p className="mt-3 text-sm bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-yellow-800">
                📝 {cur.deliveryInstructions}
              </p>
            )}
          </div>

          {/* Big action */}
          <div className="p-4 pt-0">
            <button
              disabled={deliverMut.isPending}
              onClick={() => { if (window.confirm(`Mark ${cur.number} as DELIVERED to ${cur.customerName}?`)) deliverMut.mutate(cur.id); }}
              className="w-full py-5 rounded-2xl bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-bold text-xl flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-lg shadow-green-600/20"
            >
              <CheckCircle2 className="w-7 h-7" /> Mark as Delivered
            </button>
          </div>
        </div>
      )}

      {/* Swipe / arrows */}
      {pending.length > 1 && (
        <div className="flex items-center justify-between mt-3">
          <button onClick={prev} disabled={idx === 0}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl border font-semibold text-sm disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span className="text-xs text-muted-foreground">swipe for next</span>
          <button onClick={next} disabled={idx >= pending.length - 1}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl border font-semibold text-sm disabled:opacity-30">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
