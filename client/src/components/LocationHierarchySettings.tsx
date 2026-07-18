import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { MapPin, X } from "lucide-react";

/**
 * Spec rule 22/23 — physical location hierarchy, fully admin-editable:
 * Level 1 = Store/Warehouse (managed in the Stores section above).
 * Levels 2-4 = free-text managed lists; options appear instantly in product forms.
 */
const LEVELS: Array<{ key: string; title: string; hint: string }> = [
  { key: "location_areas",   title: "Level 2 — Area / Side",      hint: "e.g. North Side, East Side, Middle" },
  { key: "location_racks",   title: "Level 3 — Rack / Section",   hint: "e.g. Rack A, Wall Rack, Corner Rack" },
  { key: "location_shelves", title: "Level 4 — Shelf / Position", hint: "e.g. Shelf 1, Top Shelf, Left Side" },
];

function LevelEditor({ listKey, title, hint }: { listKey: string; title: string; hint: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const { data: items = [] } = useQuery<any[]>({
    queryKey: [`/api/lists/${listKey}`],
    queryFn: () => fetch(`/api/lists/${listKey}`).then((r) => r.json()),
  });
  const addMut = useMutation({
    mutationFn: (value: string) =>
      fetch("/api/lists", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listKey, value, sortOrder: items.length }),
      }).then(async (r) => { if (!r.ok) throw new Error("add failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/lists/${listKey}`] }); setDraft(""); },
    onError: () => toast({ title: "Only admin can edit locations", variant: "destructive" }),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/lists/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/lists/${listKey}`] }),
    onError: () => toast({ title: "Only admin can edit locations", variant: "destructive" }),
  });
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint} — free text, add anything that matches your space.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span key={i.id} className="inline-flex items-center gap-1 text-xs bg-slate-50 border rounded-full px-2.5 py-1">
            {i.value}
            <button onClick={() => delMut.mutate(i.id)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-muted-foreground italic">none yet</span>}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) addMut.mutate(draft.trim()); }}
          placeholder="Add option…" className="h-8 text-sm max-w-56" />
        <Button size="sm" variant="outline" disabled={!draft.trim() || addMut.isPending} onClick={() => addMut.mutate(draft.trim())}>Add</Button>
      </div>
    </div>
  );
}

export default function LocationHierarchySettings() {
  return (
    <AccordionItem value="location-hierarchy" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#d4a017]" />
          <span className="font-semibold">Location Hierarchy</span>
          <span className="text-xs text-muted-foreground font-normal">— areas, racks & shelves for product locations</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-5 pb-5">
        <p className="text-xs text-muted-foreground">
          Level 1 (Store / Warehouse) is managed in the <strong>Stores</strong> section above. Options added here
          appear instantly in the product form's location dropdowns.
        </p>
        {LEVELS.map((l) => <LevelEditor key={l.key} listKey={l.key} title={l.title} hint={l.hint} />)}
      </AccordionContent>
    </AccordionItem>
  );
}
