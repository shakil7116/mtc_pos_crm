import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type FieldDef = {
  id: number; moduleKey: string; fieldKey: string; label: string;
  type: "text" | "number" | "date" | "dropdown" | "checkbox" | "textarea" | "file";
  options?: string[]; required?: boolean; active?: boolean; sortOrder?: number; showInList?: boolean;
};

export function useFieldDefs(moduleKey: string) {
  return useQuery<FieldDef[]>({
    queryKey: [`/api/field-definitions`, moduleKey],
    queryFn: () => fetch(`/api/field-definitions?module=${moduleKey}`).then((r) => r.json()),
    staleTime: 30_000,
  });
}

/** Returns the first missing required custom field's label, or null if all satisfied. */
export function validateCustomFields(defs: FieldDef[], data: Record<string, any>): string | null {
  for (const f of defs) {
    if (f.active === false) continue;
    if (f.required) {
      const v = data?.[f.fieldKey];
      const empty = v === undefined || v === null || v === "" || (f.type === "checkbox" && v === false);
      if (empty) return f.label;
    }
  }
  return null;
}

/**
 * Renders admin-defined custom fields for a module (spec 11C). Values live in the
 * entity's `customData` bag. Appears instantly when a field is added in Settings.
 */
export default function CustomFields({
  moduleKey, value, onChange,
}: {
  moduleKey: string;
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}) {
  const { data: defs = [] } = useFieldDefs(moduleKey);
  const active = defs.filter((f) => f.active !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  if (!active.length) return null;

  const set = (key: string, v: any) => onChange({ ...(value || {}), [key]: v });

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Additional Fields</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {active.map((f) => {
          const v = value?.[f.fieldKey];
          const req = f.required ? <span className="text-destructive"> *</span> : null;
          if (f.type === "checkbox") {
            return (
              <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer sm:col-span-2">
                <input type="checkbox" checked={!!v} onChange={(e) => set(f.fieldKey, e.target.checked)} />
                {f.label}{req}
              </label>
            );
          }
          return (
            <div key={f.id} className={f.type === "textarea" ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
              <Label className="text-xs">{f.label}{req}</Label>
              {f.type === "dropdown" ? (
                <Select value={v || "__none"} onValueChange={(val) => set(f.fieldKey, val === "__none" ? "" : val)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— none —</SelectItem>
                    {(f.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea value={v || ""} onChange={(e) => set(f.fieldKey, e.target.value)} rows={2} />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={v ?? ""}
                  onChange={(e) => set(f.fieldKey, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Read-only display of custom-field values on a record detail view. */
export function CustomFieldsView({ moduleKey, value }: { moduleKey: string; value: Record<string, any> }) {
  const { data: defs = [] } = useFieldDefs(moduleKey);
  const active = defs.filter((f) => f.active !== false && value?.[f.fieldKey] !== undefined && value?.[f.fieldKey] !== "" && value?.[f.fieldKey] !== null);
  if (!active.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
      {active.map((f) => (
        <div key={f.id} className="flex justify-between gap-2 border-b py-1">
          <span className="text-muted-foreground">{f.label}</span>
          <span className="font-medium">{f.type === "checkbox" ? (value[f.fieldKey] ? "Yes" : "No") : String(value[f.fieldKey])}</span>
        </div>
      ))}
    </div>
  );
}
