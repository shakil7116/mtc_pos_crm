import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Store, Package, CheckCircle2, Clock, Hand } from "lucide-react";
import { useStores, money } from "./shared";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import TasksPanel from "@/components/TasksPanel";

export default function HelperDashboard() {
  const { user } = useAuth();
  const myStoreId = user?.storeId ?? null;
  const { data: stores = [] } = useStores();
  const myStore = stores.find((s: any) => s.id === myStoreId);
  const queryClient = useQueryClient();

  const { data: queue = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/pick-notes/queue", myStoreId],
    queryFn: () => fetch(`/api/pick-notes/queue${myStoreId ? `?storeId=${myStoreId}` : ""}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    refetchInterval: 10_000,
  });

  const claimMut = useMutation({
    mutationFn: (noteId: number) => apiRequest("POST", `/api/arrangement-notes/${noteId}/pick`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pick-notes/queue"] }),
  });

  const readyMut = useMutation({
    mutationFn: (noteId: number) => apiRequest("POST", `/api/arrangement-notes/${noteId}/ready`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pick-notes/queue"] }),
  });

  const pending = queue.filter((q: any) => q.note.status === "pending");
  const myPicking = queue.filter((q: any) => q.note.status === "picking" && q.note.pickedById === user?.id);
  const otherPicking = queue.filter((q: any) => q.note.status === "picking" && q.note.pickedById !== user?.id);
  const ready = queue.filter((q: any) => q.note.status === "ready");

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Store className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">{myStore?.nameEn || "My Store"}</h1>
          <p className="text-sm text-muted-foreground">{user?.name} &middot; helper view</p>
        </div>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{pending.length}</p>
          <p className="text-[11px] uppercase tracking-wide text-amber-600">Waiting</p>
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{myPicking.length}</p>
          <p className="text-[11px] uppercase tracking-wide text-blue-600">My Picks</p>
        </div>
        <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{ready.length}</p>
          <p className="text-[11px] uppercase tracking-wide text-green-600">Ready</p>
        </div>
      </div>

      {/* My active picks — what I'm currently gathering */}
      {myPicking.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" /> I'm Gathering ({myPicking.length})
          </h2>
          {myPicking.map((q: any) => (
            <PickCard key={q.note.id} q={q} mode="picking" onReady={() => readyMut.mutate(q.note.id)} loading={readyMut.isPending} />
          ))}
        </section>
      )}

      {/* Pending queue — available to pick up */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Pick Up Queue ({pending.length})
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && pending.length === 0 && (
          <p className="text-sm text-muted-foreground">No invoices waiting. All clear!</p>
        )}
        {pending.map((q: any) => (
          <PickCard key={q.note.id} q={q} mode="pending" onClaim={() => claimMut.mutate(q.note.id)} loading={claimMut.isPending} />
        ))}
      </section>

      {/* Other helpers picking */}
      {otherPicking.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Hand className="w-3.5 h-3.5" /> Being Gathered by Others ({otherPicking.length})
          </h2>
          {otherPicking.map((q: any) => (
            <PickCard key={q.note.id} q={q} mode="other" />
          ))}
        </section>
      )}

      {/* Recently ready */}
      {ready.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready ({ready.length})
          </h2>
          {ready.map((q: any) => (
            <PickCard key={q.note.id} q={q} mode="ready" />
          ))}
        </section>
      )}

      <TasksPanel />
    </div>
  );
}

function PickCard({ q, mode, onClaim, onReady, loading }: {
  q: any; mode: "pending" | "picking" | "ready" | "other";
  onClaim?: () => void; onReady?: () => void; loading?: boolean;
}) {
  const border = mode === "picking" ? "border-blue-300 bg-blue-50/40"
    : mode === "ready" ? "border-green-300 bg-green-50/40"
    : mode === "other" ? "border-slate-200 bg-slate-50/40"
    : "border-amber-200";
  const ago = q.doc.createdAt ? timeAgo(new Date(q.doc.createdAt)) : "";

  return (
    <div className={`rounded-xl border ${border} p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-sm font-semibold text-[#1e2a3a]">{q.doc.number}</span>
          <span className="mx-2 text-muted-foreground">|</span>
          <span className="text-sm">{q.doc.customerName || "Walk-in"}</span>
        </div>
        <div className="text-right">
          <span className="font-mono text-sm font-semibold">{money(q.doc.total)}</span>
          {ago && <p className="text-[10px] text-muted-foreground">{ago}</p>}
        </div>
      </div>

      {/* Item list — what to gather */}
      <div className="space-y-1">
        {(q.items || []).map((item: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-sm bg-white/60 rounded-lg px-3 py-1.5 border border-slate-100">
            <span className="font-mono text-xs text-muted-foreground w-8 text-right">{Number(item.splitQty)}</span>
            <span className="text-[10px] text-muted-foreground">{item.unit}</span>
            <span className="flex-1 truncate font-medium">{item.description}</span>
            {item.store && <span className="text-[10px] text-emerald-600 whitespace-nowrap">{item.store.nameEn}</span>}
          </div>
        ))}
      </div>

      {mode === "other" && q.pickedByName && (
        <p className="text-xs text-muted-foreground">Being gathered by: <span className="font-semibold">{q.pickedByName}</span></p>
      )}

      {mode === "pending" && onClaim && (
        <Button onClick={onClaim} disabled={loading} className="w-full bg-[#1e2a3a] text-white hover:bg-[#2a3a4e]" size="sm">
          <Hand className="w-4 h-4 mr-1.5" /> Pick Up
        </Button>
      )}
      {mode === "picking" && onReady && (
        <Button onClick={onReady} disabled={loading} className="w-full bg-green-600 text-white hover:bg-green-700" size="sm">
          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark Ready
        </Button>
      )}
    </div>
  );
}

function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
