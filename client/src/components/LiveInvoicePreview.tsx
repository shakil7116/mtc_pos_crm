import {
  InvoiceRenderer,
  INVOICE_TEMPLATES,
  type TemplateId,
} from "@/components/invoice-templates";
import type { TemplateInvoice, TemplateSettings, TemplateOptions } from "@/components/invoice-templates/types";
import { cn } from "@/lib/utils";
import { Eye } from "lucide-react";

interface Props {
  invoice: TemplateInvoice;
  settings: TemplateSettings;
  templateId: TemplateId;
  onTemplateChange: (id: TemplateId) => void;
  options?: TemplateOptions;
  /** zoom factor for the scaled A4 paper inside the column */
  zoom?: number;
}

/**
 * Reactive side-by-side invoice preview.
 * Reads live form state via props, so it re-renders on every keystroke.
 */
export default function LiveInvoicePreview({
  invoice, settings, templateId, onTemplateChange, options, zoom = 0.5,
}: Props) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-white/60 backdrop-blur">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Eye className="w-3.5 h-3.5" /> Live preview
        </div>
        <div className="flex flex-wrap gap-1">
          {INVOICE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTemplateChange(t.id)}
              title={t.blurb}
              className={cn(
                "px-2 py-1 rounded-md text-[11px] font-medium border transition-all",
                templateId === t.id
                  ? "bg-[#1e2a3a] text-white border-[#1e2a3a]"
                  : "bg-white text-muted-foreground border-border hover:border-[#1e2a3a]/40"
              )}
            >
              {t.label.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Scaled paper */}
      <div className="p-3 overflow-hidden flex justify-center" style={{ maxHeight: "78vh", overflowY: "auto" }}>
        <div style={{ zoom }}>
          <InvoiceRenderer
            templateId={templateId}
            invoice={invoice}
            settings={settings}
            options={options}
            className="shadow-md"
          />
        </div>
      </div>
    </div>
  );
}
