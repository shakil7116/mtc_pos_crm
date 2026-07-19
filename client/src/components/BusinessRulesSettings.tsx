import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SlidersHorizontal, Loader2 } from "lucide-react";

/**
 * Module 11A — business rules the admin can change anytime without code:
 * PDC refund threshold, void window hours, PDC alert lead days,
 * maintenance cheque threshold. Zero hardcoded values.
 */
export default function BusinessRulesSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings } = useQuery<any>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  const [form, setForm] = useState({ pdcThreshold: "", voidWindowHours: "", pdcAlertDays: "", maintenanceChequeThreshold: "", storeOpenTime: "", storeCloseTime: "", openingCash: "", openingBank: "", tierWindowMonths: "", tierBestPct: "", tierBetterPct: "", tierDefaultTermDays: "", tierBadOverdueDays: "", tierBadLateCount: "" });
  useEffect(() => {
    if (settings) {
      setForm({
        pdcThreshold: String(settings.pdcThreshold ?? 4000),
        voidWindowHours: String(settings.voidWindowHours ?? 12),
        pdcAlertDays: String(settings.pdcAlertDays ?? 3),
        maintenanceChequeThreshold: String(settings.maintenanceChequeThreshold ?? 10000),
        storeOpenTime: String(settings.storeOpenTime ?? "05:00"),
        storeCloseTime: String(settings.storeCloseTime ?? "22:00"),
        openingCash: String(settings.openingCash ?? 0),
        openingBank: String(settings.openingBank ?? 0),
        tierWindowMonths: String(settings.tierWindowMonths ?? 6),
        tierBestPct: String(settings.tierBestPct ?? 10),
        tierBetterPct: String(settings.tierBetterPct ?? 30),
        tierDefaultTermDays: String(settings.tierDefaultTermDays ?? 30),
        tierBadOverdueDays: String(settings.tierBadOverdueDays ?? 60),
        tierBadLateCount: String(settings.tierBadLateCount ?? 2),
      });
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () =>
      fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdcThreshold: String(Number(form.pdcThreshold) || 4000),
          voidWindowHours: Number(form.voidWindowHours) || 12,
          pdcAlertDays: Number(form.pdcAlertDays) || 3,
          maintenanceChequeThreshold: String(Number(form.maintenanceChequeThreshold) || 10000),
          storeOpenTime: form.storeOpenTime || "05:00",
          storeCloseTime: form.storeCloseTime || "22:00",
          openingCash: String(Number(form.openingCash) || 0),
          openingBank: String(Number(form.openingBank) || 0),
          tierWindowMonths: Number(form.tierWindowMonths) || 6,
          tierBestPct: String(Number(form.tierBestPct) || 10),
          tierBetterPct: String(Number(form.tierBetterPct) || 30),
          tierDefaultTermDays: Number(form.tierDefaultTermDays) || 30,
          tierBadOverdueDays: Number(form.tierBadOverdueDays) || 60,
          tierBadLateCount: Number(form.tierBadLateCount) || 2,
        }),
      }).then(async (r) => { if (!r.ok) throw new Error("Save failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Business rules saved", description: "Applied immediately across the system." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  return (
    <AccordionItem value="business-rules" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#d4a017]" />
          <span className="font-semibold">Business Rules</span>
          <span className="text-xs text-muted-foreground font-normal">— refund, void & alert thresholds</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">VOID refund PDC threshold (QAR)</Label>
          <Input type="number" min={0} value={form.pdcThreshold} onChange={(e) => setForm({ ...form, pdcThreshold: e.target.value })} className="h-9 font-mono" />
          <p className="text-[11px] text-muted-foreground mt-1">Void refunds at or above this go out as PDC. Applies to voids only.</p>
        </div>
        <div>
          <Label className="text-xs">Void window (hours)</Label>
          <Input type="number" min={1} value={form.voidWindowHours} onChange={(e) => setForm({ ...form, voidWindowHours: e.target.value })} className="h-9 font-mono" />
          <p className="text-[11px] text-muted-foreground mt-1">How long an invoice stays voidable after creation.</p>
        </div>
        <div>
          <Label className="text-xs">PDC alert lead (days)</Label>
          <Input type="number" min={0} value={form.pdcAlertDays} onChange={(e) => setForm({ ...form, pdcAlertDays: e.target.value })} className="h-9 font-mono" />
          <p className="text-[11px] text-muted-foreground mt-1">Days before a cheque's date to alert admin & manager.</p>
        </div>
        <div>
          <Label className="text-xs">Maintenance cheque threshold (QAR)</Label>
          <Input type="number" min={0} value={form.maintenanceChequeThreshold} onChange={(e) => setForm({ ...form, maintenanceChequeThreshold: e.target.value })} className="h-9 font-mono" />
          <p className="text-[11px] text-muted-foreground mt-1">Maintenance payments above this must be by cheque.</p>
        </div>
        <div>
          <Label className="text-xs">Store opening time</Label>
          <Input type="time" value={form.storeOpenTime} onChange={(e) => setForm({ ...form, storeOpenTime: e.target.value })} className="h-9 font-mono" />
          <p className="text-[11px] text-muted-foreground mt-1">Business day starts here — "today" & reports roll at opening, not midnight.</p>
        </div>
        <div>
          <Label className="text-xs">Store closing time</Label>
          <Input type="time" value={form.storeCloseTime} onChange={(e) => setForm({ ...form, storeCloseTime: e.target.value })} className="h-9 font-mono" />
          <p className="text-[11px] text-muted-foreground mt-1">End-of-day report covers open → close.</p>
        </div>
      </div>

      {/* Opening Balances (Go-Live) — set once so cash position starts correct. */}
      <div className="pt-3 mt-1 border-t border-border/60">
        <p className="text-xs font-semibold text-foreground mb-2">Opening Balances — Go-Live</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Opening Cash in Hand (QAR)</Label>
            <Input type="number" min={0} step="0.01" value={form.openingCash} onChange={(e) => setForm({ ...form, openingCash: e.target.value })} className="h-9 font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">Physical cash in the drawer on day one. Cash position starts here.</p>
          </div>
          <div>
            <Label className="text-xs">Opening Bank Balance (QAR)</Label>
            <Input type="number" min={0} step="0.01" value={form.openingBank} onChange={(e) => setForm({ ...form, openingBank: e.target.value })} className="h-9 font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">Bank balance on day one. Set once — never shows negative unless truly overdrawn.</p>
          </div>
        </div>
      </div>

      {/* Customer behaviour tiers — system-calculated (Best/Better/Good/Watch/Bad). Internal only. */}
      <div className="pt-3 mt-1 border-t border-border/60">
        <p className="text-xs font-semibold text-foreground mb-2">Customer Behaviour Tiers — internal categorization</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Rolling window (months)</Label>
            <Input type="number" min={1} value={form.tierWindowMonths} onChange={(e) => setForm({ ...form, tierWindowMonths: e.target.value })} className="h-9 font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">Period for profit + purchase-frequency scoring.</p>
          </div>
          <div>
            <Label className="text-xs">Default credit term (days)</Label>
            <Input type="number" min={0} value={form.tierDefaultTermDays} onChange={(e) => setForm({ ...form, tierDefaultTermDays: e.target.value })} className="h-9 font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">Used when a customer has no payment term set. Overdue is measured past this.</p>
          </div>
          <div>
            <Label className="text-xs">BEST — top profit %</Label>
            <Input type="number" min={1} max={100} value={form.tierBestPct} onChange={(e) => setForm({ ...form, tierBestPct: e.target.value })} className="h-9 font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">Top X% by profit contributed → Best (repeat buyers only).</p>
          </div>
          <div>
            <Label className="text-xs">BETTER — top profit %</Label>
            <Input type="number" min={1} max={100} value={form.tierBetterPct} onChange={(e) => setForm({ ...form, tierBetterPct: e.target.value })} className="h-9 font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">Top X% band → Better. Everyone else with no bad history → Good.</p>
          </div>
          <div>
            <Label className="text-xs">BAD — days overdue past term</Label>
            <Input type="number" min={1} value={form.tierBadOverdueDays} onChange={(e) => setForm({ ...form, tierBadOverdueDays: e.target.value })} className="h-9 font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">Any invoice this many days past its term → Bad. Under this (but past term) → Watch.</p>
          </div>
          <div>
            <Label className="text-xs">BAD — late-paid count in window</Label>
            <Input type="number" min={1} value={form.tierBadLateCount} onChange={(e) => setForm({ ...form, tierBadLateCount: e.target.value })} className="h-9 font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">This many late-paid invoices in the window → Bad. Credit accounts only.</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Watch/Bad apply to credit accounts only — cash customers are never flagged. Tiers are internal and never printed on invoices, statements or receipts.</p>
      </div>

      <Button size="sm" className="bg-[#1e2a3a] text-white" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
        {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Save Business Rules
      </Button>
      </AccordionContent>
    </AccordionItem>
  );
}
