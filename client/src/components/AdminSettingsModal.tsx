import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Lock } from "lucide-react";
import { INVOICE_TEMPLATES, saveTemplate, type TemplateId } from "@/components/invoice-templates";
import { getInvoiceConfig, setInvoiceConfig, type InvoiceConfig } from "@/lib/invoiceConfig";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Manual Settings — admin only.
 * Manually override invoice presentation, field visibility, and defaults.
 * Non-admins never see the trigger and cannot open this panel.
 */
export default function AdminSettingsModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cfg, setCfg] = useState<InvoiceConfig>(getInvoiceConfig);
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === "admin";

  function patch<K extends keyof InvoiceConfig>(key: K, value: InvoiceConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      setInvoiceConfig(cfg);
      saveTemplate(cfg.defaultTemplate);
      // Persist company-level fields to the settings API as well
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPolicyText: cfg.returnPolicyText }),
      }).catch(() => {});
      toast({ title: "Settings saved", description: "Invoice configuration updated." });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#d4a017]" />
            Manual Settings
          </DialogTitle>
          <DialogDescription>
            Admin-only overrides for invoice presentation and defaults.
          </DialogDescription>
        </DialogHeader>

        {!isAdmin ? (
          <div className="py-10 text-center">
            <Lock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-semibold">Restricted</p>
            <p className="text-sm text-muted-foreground mt-1">
              These settings are available to administrators only.
            </p>
          </div>
        ) : (
          <div className="space-y-6 py-1">
            {/* Default template */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                Default invoice template
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {INVOICE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => patch("defaultTemplate", t.id as TemplateId)}
                    className={cn(
                      "text-left p-3 rounded-lg border-2 transition-all",
                      cfg.defaultTemplate === t.id
                        ? "border-[#1e2a3a] bg-[#1e2a3a]/5"
                        : "border-border hover:border-[#1e2a3a]/30"
                    )}
                  >
                    <div className="font-semibold text-sm">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.blurb}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Field toggles */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Fields & sections
              </h3>
              <ToggleRow
                label="Show PO Number field"
                desc="Capture a customer purchase-order number on documents"
                checked={cfg.showPoNumber}
                onChange={(v) => patch("showPoNumber", v)}
              />
              <ToggleRow
                label="Show signature line"
                desc="Print an authorized-signature line on the document"
                checked={cfg.showSignature}
                onChange={(v) => patch("showSignature", v)}
              />
              <ToggleRow
                label="Show amount in words"
                desc="Spell out the total under the figures"
                checked={cfg.showAmountInWords}
                onChange={(v) => patch("showAmountInWords", v)}
              />
              <ToggleRow
                label="Show return policy"
                desc="Print the return-policy footer"
                checked={cfg.showReturnPolicy}
                onChange={(v) => patch("showReturnPolicy", v)}
              />
            </section>

            {/* Financial */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                Defaults
              </h3>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="taxRate" className="text-sm font-normal">
                  Default tax rate (%)
                </Label>
                <Input
                  id="taxRate"
                  type="number"
                  min={0}
                  max={100}
                  value={cfg.defaultTaxRate}
                  onChange={(e) => patch("defaultTaxRate", Number(e.target.value) || 0)}
                  className="w-24 text-right font-mono"
                />
              </div>
            </section>

            {/* Return policy text */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                Return policy text
              </h3>
              <Textarea
                rows={2}
                value={cfg.returnPolicyText}
                onChange={(e) => patch("returnPolicyText", e.target.value)}
                className="text-sm"
              />
            </section>
          </div>
        )}

        {isAdmin && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#1e2a3a] text-white">
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/60 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground leading-snug">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
