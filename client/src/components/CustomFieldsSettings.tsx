import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Puzzle, X } from "lucide-react";

/**
 * Spec 11C — admin defines custom fields per module. They render instantly on
 * that module's form (CustomFields component reads the same field_definitions).
 */
const MODULES = [
  { key: "customers", label: "Customers" },
  { key: "products", label: "Products / Inventory" },
  { key: "documents", label: "Invoices / Documents" },
  { key: "suppliers", label: "Suppliers" },
  { key: "expenses", label: "Expenses" },
];
const TYPES = ["text", "number", "date", "dropdown", "checkbox", "textarea"];

export default function CustomFieldsSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [moduleKey, setModuleKey] = useState("customers");
  const [draft, setDraft] = useState<any>({ label: "", type: "text", required: false, options: "" });

  const { data: fields = [] } = useQuery<any[]>({
    queryKey: [`/api/field-definitions`, moduleKey],
    queryFn: () => fetch(`/api/field-definitions?module=${moduleKey}`).then((r) => r.json()),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/field-definitions`, moduleKey] });

  const addMut = useMutation({
    mutationFn: () => {
      const fieldKey = String(draft.label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${Date.now()}`;
      return fetch("/api/field-definitions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleKey, fieldKey, label: draft.label.trim(), type: draft.type,
          required: !!draft.required, showInList: false, sortOrder: fields.length,
          options: draft.type === "dropdown" ? String(draft.options).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "add failed"); return r.json(); });
    },
    onSuccess: () => { invalidate(); setDraft({ label: "", type: "text", required: false, options: "" }); toast({ title: "Custom field added — now live on the form" }); },
    onError: (e: any) => toast({ title: "Could not add field", description: String(e?.message || ""), variant: "destructive" }),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/field-definitions/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <AccordionItem value="custom-fields" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-[#d4a017]" />
          <span className="font-semibold">Custom Fields</span>
          <span className="text-xs text-muted-foreground font-normal">— add fields to any module's form (no code)</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-5">
        <div>
          <Label className="text-xs">Module</Label>
          <Select value={moduleKey} onValueChange={setModuleKey}>
            <SelectTrigger className="h-9 max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MODULES.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          {fields.length === 0 && <p className="text-xs text-muted-foreground italic">No custom fields on this module yet.</p>}
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2">
              <span className="font-medium">{f.label}</span>
              <span className="text-[11px] bg-slate-100 rounded px-1.5 py-0.5 text-muted-foreground">{f.type}</span>
              {f.required && <span className="text-[11px] text-red-600">required</span>}
              {f.type === "dropdown" && <span className="text-[11px] text-muted-foreground">[{(f.options || []).join(", ")}]</span>}
              <button onClick={() => delMut.mutate(f.id)} className="ml-auto text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-dashed p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Field label</Label>
            <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Customer Type" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {draft.type === "dropdown" && (
            <div className="sm:col-span-2">
              <Label className="text-xs">Options (comma-separated)</Label>
              <Input value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} placeholder="Contractor, Retailer, Individual, VIP, Blacklisted" className="h-9" />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Required
          </label>
          <div className="sm:col-span-2">
            <Button size="sm" className="bg-[#1e2a3a] text-white" disabled={!draft.label.trim() || addMut.isPending} onClick={() => addMut.mutate()}>Add Field</Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
