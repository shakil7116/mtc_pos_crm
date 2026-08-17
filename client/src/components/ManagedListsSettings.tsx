import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ListChecks, X } from "lucide-react";

/**
 * Module 11B — Lists & Categories. Central admin CRUD for every managed list
 * that feeds dropdowns across the system. Add/edit/delete; changes appear
 * instantly in the relevant forms. Zero hardcoded values.
 */
const LISTS: Array<{ key: string; title: string; hint: string }> = [
  { key: "product_categories", title: "Product Categories", hint: "Cement, Steel, Paint, Pipes…" },
  { key: "product_units",      title: "Product Units",      hint: "bag, pcs, kg, m, roll, gallon…" },
  { key: "expense_categories", title: "Expense Categories", hint: "Rent, Salaries, Maintenance…" },
  { key: "sub_locations",      title: "Sub-locations",      hint: "free-text zones within a store/warehouse" },
];

function ListEditor({ listKey, title, hint }: { listKey: string; title: string; hint: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const { data: items = [] } = useQuery<any[]>({
    queryKey: [`/api/lists/${listKey}`],
    queryFn: () => fetch(`/api/lists/${listKey}`).then((r) => r.json()),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/lists/${listKey}`] });
  const addMut = useMutation({
    mutationFn: (value: string) => fetch("/api/lists", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listKey, value, sortOrder: items.length }),
    }).then(async (r) => { if (!r.ok) throw new Error("add failed"); return r.json(); }),
    onSuccess: () => { invalidate(); setDraft(""); },
    onError: () => toast({ title: "Only admin can edit lists", variant: "destructive" }),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/lists/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: () => toast({ title: "Only admin can edit lists", variant: "destructive" }),
  });
  return (
    <div className="space-y-2 border-b last:border-0 pb-3 last:pb-0">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
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

export default function ManagedListsSettings() {
  return (
    <AccordionItem value="lists-categories" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-[#d4a017]" />
          <span className="font-semibold">Lists & Categories</span>
          <span className="text-xs text-muted-foreground font-normal">— product categories, units, expense categories, sub-locations</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-5">
        <p className="text-xs text-muted-foreground">
          Options added here appear instantly in the matching forms (product form, expense form, etc.). Nothing is hardcoded.
        </p>
        {LISTS.map((l) => <ListEditor key={l.key} listKey={l.key} title={l.title} hint={l.hint} />)}
      </AccordionContent>
    </AccordionItem>
  );
}
