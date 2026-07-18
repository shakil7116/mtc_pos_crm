import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Wrench } from "lucide-react";

const BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-700", approved: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700", resolved: "bg-green-100 text-green-700",
};

/* Dedicated Maintenance page (moved off the dashboard — dashboards are nav-only).
   Log a maintenance issue on its own full-screen route + see all issues. */
export default function Maintenance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [desc, setDesc] = useState("");
  const [urgency, setUrgency] = useState("normal");

  const { data: issues = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouse-issues"],
    queryFn: () => fetch("/api/warehouse-issues").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const mut = useMutation({
    mutationFn: () => fetch("/api/warehouse-issues", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: user?.storeId ?? null, description: desc.trim(), urgency }),
    }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-issues"] });
      setDesc(""); setUrgency("normal");
      toast({ title: "Issue logged", description: "Admin & manager notified." });
    },
    onError: (e: any) => toast({ title: "Could not log issue", description: String(e?.message || ""), variant: "destructive" }),
  });

  const open = issues.filter((i) => i.status !== "resolved");
  const resolved = issues.filter((i) => i.status === "resolved");

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><Wrench className="w-5 h-5 text-amber-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Maintenance</h1>
          <p className="text-sm text-muted-foreground">Log an issue — goes to admin &amp; manager instantly</p>
        </div>
      </header>

      {/* Log form — full-screen route, not a dashboard modal */}
      <section className="rounded-xl border shadow-sm p-4 space-y-3 bg-white">
        <h2 className="font-semibold text-sm">Log a maintenance issue</h2>
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="What's broken / needs attention? Where exactly?" />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={urgency} onValueChange={setUrgency}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low — whenever possible</SelectItem>
              <SelectItem value="normal">Normal — this week</SelectItem>
              <SelectItem value="critical">Critical — urgent!</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" disabled={!desc.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Logging…" : "Log Issue"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">For emergencies, call the manager directly — log it here after.</p>
      </section>

      <section className="rounded-xl border shadow-sm bg-white overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30"><h2 className="font-semibold text-sm">Open issues ({open.length})</h2></div>
        {open.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No open issues. 🎉</p> : (
          <div className="divide-y">
            {open.map((i) => (
              <div key={i.id} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="truncate">{i.description}</span>
                  {i.createdAt && <span className="block text-[11px] text-muted-foreground">{format(new Date(i.createdAt), "dd MMM yy")}{i.urgency ? ` · ${i.urgency}` : ""}</span>}
                </span>
                <span className={cn("text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0", BADGE[i.status] || "bg-slate-100")}>{i.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="rounded-xl border shadow-sm bg-white overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30"><h2 className="font-semibold text-sm text-muted-foreground">Resolved ({resolved.length})</h2></div>
          <div className="divide-y">
            {resolved.slice(0, 20).map((i) => (
              <div key={i.id} className="px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="flex-1 truncate line-through">{i.description}</span>
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-green-100 text-green-700 shrink-0">resolved</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
