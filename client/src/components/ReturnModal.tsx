import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, XCircle, CheckCircle, RefreshCw, AlertOctagon, Edit3, Clock } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";

interface DocItem {
  id: number;
  description: string;
  qty: string | number;
  unit: string;
  price?: string | number;
  amount?: string | number;
  productId?: number;
}

interface ReturnModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (creditNoteNumber: string) => void;
  invoiceId: number;
  invoiceDate: string;
  invoiceNumber: string;
  items: DocItem[];
  customerId?: number;
  storeId?: number;
}

type ReturnType = "full" | "partial" | "exchange" | "damage_claim" | "billing_correction";
type Step = "blocked" | "type_select" | "items" | "pin" | "result";

const LOCKOUT_KEY = "mtc_return_lockout";

interface ReturnItem {
  itemId: number;
  productId?: number;
  description: string;
  soldQty: number;
  alreadyReturned: number;
  maxQty: number;
  unit: string;
  price: number;
  returnQty: number;
  condition: "original" | "damaged";
  damageDesc: string;
  selected: boolean;
}

export default function ReturnModal({
  open, onClose, onSuccess,
  invoiceId, invoiceDate, invoiceNumber, items,
  customerId, storeId,
}: ReturnModalProps) {
  const { data: companySettings } = useSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("type_select");
  const [returnType, setReturnType] = useState<ReturnType | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [refundMethod, setRefundMethod] = useState("Cash");
  const [overrideReason, setOverrideReason] = useState("");
  const [reason, setReason] = useState("");
  const [damageDesc, setDamageDesc] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: number; name: string; whatsapp?: string }[]>([]);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinLocked, setPinLocked] = useState(false);
  const [pinLockUntil, setPinLockUntil] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resultCN, setResultCN] = useState("");
  const [daysOld, setDaysOld] = useState(0);
  const [adminOverride, setAdminOverride] = useState(false);
  const [threshold, setThreshold] = useState(1000);   // returns over this need manager approval
  const [resultProcessed, setResultProcessed] = useState(false); // true = processed now, false = pending

  const isAdmin = user?.role === "admin";
  const isBoss = user?.role === "admin" || user?.role === "manager";

  // Manager-approval threshold (admin-editable in Settings → Business Rules).
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings").then((r) => r.json()).then((s) => {
      if (s?.returnApprovalThreshold != null) setThreshold(Number(s.returnApprovalThreshold));
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Calculate days old
    const days = Math.floor((Date.now() - new Date(invoiceDate).getTime()) / 86400000);
    setDaysOld(days);

    if (days > 7 && !isAdmin) {
      setStep("blocked");
    } else if (days > 7 && isAdmin) {
      setStep("type_select");
      setAdminOverride(true);
    } else {
      setStep("type_select");
      setAdminOverride(false);
    }

    // Init return items (maxQty will be corrected once we fetch already-returned data)
    const initItems = items.map(item => {
      const sold = parseFloat(String(item.qty));
      return {
        itemId: item.id,
        productId: item.productId,
        description: item.description,
        soldQty: sold,
        alreadyReturned: 0,
        maxQty: sold,
        unit: item.unit,
        price: parseFloat(String(item.price || 0)),
        returnQty: sold,
        condition: "original" as const,
        damageDesc: "",
        selected: true,
      };
    });
    setReturnItems(initItems);

    // Fetch already-returned qtys for this invoice via the customer invoices-for-return endpoint
    if (customerId) {
      fetch(`/api/customers/${customerId}/invoices-for-return`)
        .then(r => r.json())
        .then((invoices: any[]) => {
          const inv = invoices.find((i: any) => i.id === invoiceId);
          if (!inv?.items) return;
          const retMap: Record<number, number> = {};
          for (const it of inv.items) retMap[it.id] = it.returnedQty || 0;
          setReturnItems(prev => prev.map(ri => {
            const alreadyReturned = retMap[ri.itemId] || 0;
            const maxQty = Math.max(0, ri.soldQty - alreadyReturned);
            return { ...ri, alreadyReturned, maxQty, returnQty: Math.min(ri.returnQty, maxQty) };
          }));
        })
        .catch(() => {});
    }

    // Load suppliers for damage claim
    fetch("/api/suppliers").then(r => r.json()).then(setSuppliers).catch(() => {});

    // Reset state
    setStep(days > 7 && !isAdmin ? "blocked" : "type_select");
    setReturnType(null);
    setPin("");
    setPinError("");
    setPinAttempts(0);
    setResultCN("");
    setReason("");
    setDamageDesc("");
    setOverrideReason("");
  }, [open, invoiceDate, isAdmin]);

  // ── PIN Lockout ───────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(LOCKOUT_KEY);
    if (stored) {
      const lockout = JSON.parse(stored);
      if (Date.now() < lockout.until) {
        setPinLocked(true);
        setPinLockUntil(lockout.until);
      } else {
        localStorage.removeItem(LOCKOUT_KEY);
      }
    }
  }, []);

  const checkLockout = () => {
    const stored = localStorage.getItem(LOCKOUT_KEY);
    if (stored) {
      const lockout = JSON.parse(stored);
      if (Date.now() < lockout.until) {
        setPinLocked(true);
        setPinLockUntil(lockout.until);
        return true;
      }
      localStorage.removeItem(LOCKOUT_KEY);
      setPinLocked(false);
    }
    return false;
  };

  const handlePinKey = (key: string) => {
    if (pinLocked) return;
    if (key === "back") {
      setPin(p => p.slice(0, -1));
    } else if (pin.length < 6) {
      setPin(p => p + key);
    }
  };

  // ── Return credit calculation ─────────────────────────────────────────────
  const returnCredit = returnItems
    .filter(i => i.selected && i.condition === "original")
    .reduce((s, i) => s + i.price * i.returnQty, 0);

  // ── Submit return ─────────────────────────────────────────────────────────
  // Staff submits a REQUEST — no admin needs to be present. It is created
  // pending; an admin/manager approves it remotely from /approvals.
  const submitReturn = async () => {
    setLoading(true);
    try {
      // Build return payload
      const payload = {
        originalInvoiceId: invoiceId,
        type: returnType,
        reason: reason || damageDesc,
        refundMethod: returnType !== "damage_claim" ? refundMethod : undefined,
        refundAmount: returnCredit,
        adminOverride,
        adminOverrideReason: adminOverride ? overrideReason : undefined,
        storeId,
        customerId,
        items: returnItems
          .filter(i => i.selected && (returnType === "full" || i.returnQty > 0))
          .map(i => ({
            productId: i.productId,
            documentItemId: i.itemId,
            description: i.description,
            qty: i.returnQty,
            unit: i.unit,
            price: i.price,
            amount: i.price * i.returnQty,
            condition: i.condition,
            damageDescription: i.damageDesc,
          })),
      };

      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.code === "QTY_EXCEEDS_PURCHASED" && Array.isArray(err.violations)) {
          const lines = err.violations.map((v: any) =>
            `${v.description}: returning ${v.requested} but only ${v.maxReturnable} returnable (bought ${v.purchased}, already returned ${v.alreadyReturned})`
          );
          throw new Error(lines.join("\n"));
        }
        throw new Error(err.message || "Return failed");
      }

      const data = await res.json();
      const created = data.returnVoucher || {};
      const voucher = created.voucherNumber || "RV-??????";
      setResultCN(voucher);

      // Routine returns (at/under the threshold, excluding damage claims which route to
      // the supplier) are processed on the spot. Larger ones stay pending for a manager.
      let processed = false;
      const eligible = returnType !== "damage_claim" && returnCredit <= threshold && created.id;
      if (eligible) {
        const ap = await fetch(`/api/returns/${created.id}/approve`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refundMethod }),
        });
        processed = ap.ok; // if the funds guard or a race blocks it, it simply stays pending
      }
      setResultProcessed(processed);
      setStep("result");
      qc.invalidateQueries({ queryKey: ["document", invoiceId] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: [`/api/returns?invoiceId=${invoiceId}`] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      onSuccess(voucher);
    } catch (err: any) {
      toast({ title: "Return failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const typeOptions = [
    {
      id: "full" as ReturnType,
      icon: <RefreshCw size={22} />,
      label: "Full Return",
      desc: "Customer returns everything on the invoice",
      color: "blue",
    },
    {
      id: "partial" as ReturnType,
      icon: <CheckCircle size={22} />,
      label: "Partial Return",
      desc: "Customer keeps some items, returns others",
      color: "green",
    },
    {
      id: "exchange" as ReturnType,
      icon: <RefreshCw size={22} />,
      label: "Exchange",
      desc: "Return items and take different items",
      color: "purple",
    },
    {
      id: "damage_claim" as ReturnType,
      icon: <AlertTriangle size={22} />,
      label: "Damage Claim",
      desc: "Product was defective or damaged on delivery",
      color: "orange",
    },
    {
      id: "billing_correction" as ReturnType,
      icon: <Edit3 size={22} />,
      label: "Billing Correction",
      desc: "Wrong price or quantity — no physical return",
      color: "gray",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw size={18} />
            Process Return — {invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        {/* ── BLOCKED (staff, expired) ── */}
        {step === "blocked" && (
          <div className="text-center py-8">
            <XCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-red-600 mb-2">⛔ Return Period Expired</h3>
            <p className="text-gray-600 mb-1">
              Invoice <strong>{invoiceNumber}</strong> was issued <strong>{daysOld} days ago</strong>.
            </p>
            <p className="text-gray-600 mb-4">Returns accepted within 7 days only.</p>
            <p className="text-sm text-gray-500">Contact management for override.</p>
            <Button variant="outline" onClick={onClose} className="mt-4">Close</Button>
          </div>
        )}

        {/* ── ADMIN OVERRIDE WARNING ── */}
        {adminOverride && step === "type_select" && (
          <div className="bg-amber-50 border border-amber-300 rounded p-3 mb-4">
            <p className="text-amber-800 font-semibold text-sm">
              ⚠️ This invoice is {daysOld} days old — outside the 7-day window.
              Admin override required.
            </p>
            <div className="mt-2">
              <Label className="text-xs text-amber-700">Override Reason (required)</Label>
              <Textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="State reason for override..."
                rows={2}
                className="text-sm mt-1"
              />
            </div>
          </div>
        )}

        {/* ── SELECT TYPE ── */}
        {step === "type_select" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">Select the type of return:</p>
            {typeOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  if (adminOverride && !overrideReason.trim()) {
                    toast({ title: "Override reason required", variant: "destructive" });
                    return;
                  }
                  setReturnType(opt.id);
                  setStep("items");
                }}
                className="w-full text-left p-4 border-2 rounded-lg hover:border-navy-600 hover:bg-gray-50 transition flex items-start gap-3"
                style={{ borderColor: "#e2e8f0" }}
              >
                <span className="text-gray-600 mt-0.5">{opt.icon}</span>
                <div>
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-sm text-gray-500">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── ITEMS STEP ── */}
        {step === "items" && returnType && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">{returnType.replace("_", " ").toUpperCase()}</Badge>
              <button
                onClick={() => setStep("type_select")}
                className="text-xs text-blue-600 hover:underline"
              >
                ← Change type
              </button>
            </div>

            {/* Full return */}
            {returnType === "full" && (
              <div>
                <p className="text-sm font-medium mb-3">All items will be returned:</p>
                <div className="border rounded overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Item</th>
                        <th className="p-2 text-center">Bought</th>
                        <th className="p-2 text-center">Returnable</th>
                        <th className="p-2 text-right">Return Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnItems.map((item, i) => (
                        <tr key={i} className={`border-t ${item.maxQty <= 0 ? "opacity-50" : ""}`}>
                          <td className="p-2">{item.description}</td>
                          <td className="p-2 text-center">{item.soldQty} {item.unit}</td>
                          <td className="p-2 text-center">
                            {item.alreadyReturned > 0 ? (
                              <span className="text-amber-600 font-semibold">{item.maxQty} <span className="text-[10px] font-normal">({item.alreadyReturned} prev.)</span></span>
                            ) : (
                              <span>{item.maxQty}</span>
                            )}
                          </td>
                          <td className="p-2 text-right">QAR {(item.price * item.maxQty).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                  <p className="text-sm font-medium text-red-800">Are ALL items in original undamaged condition?</p>
                  <div className="flex gap-3 mt-2">
                    <Button size="sm" variant="outline" className="border-green-500 text-green-700"
                      onClick={() => {
                        setReturnItems(ri => ri.map(r => ({ ...r, condition: "original" })));
                      }}>
                      ✅ Yes — original condition
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500 text-red-700"
                      onClick={() => setReturnType("damage_claim")}>
                      ❌ No — some damaged → Damage Claim
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Partial return */}
            {(returnType === "partial" || returnType === "exchange") && (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  {returnType === "exchange" ? "Select items to return:" : "Enter return quantities:"}
                </p>
                <div className="space-y-2">
                  {returnItems.map((item, i) => {
                    const fullyReturned = item.maxQty <= 0;
                    return (
                    <div key={i} className={`border rounded p-3 ${fullyReturned ? "opacity-50 bg-gray-100" : item.condition === "damaged" ? "opacity-50 bg-gray-50" : ""}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{item.description}</span>
                        <span className="text-xs text-gray-500">@ QAR {item.price.toFixed(2)}/{item.unit}</span>
                      </div>
                      <div className="flex items-center gap-3 mb-2 text-[11px] tabular-nums">
                        <span className="text-muted-foreground">Bought: {item.soldQty}</span>
                        {item.alreadyReturned > 0 && (
                          <span className="text-amber-600 font-semibold">Already returned: {item.alreadyReturned}</span>
                        )}
                        <span className={fullyReturned ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                          Returnable: {item.maxQty}
                        </span>
                      </div>
                      {fullyReturned ? (
                        <div className="flex items-center gap-1.5 text-xs text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Fully returned — cannot return more.</span>
                        </div>
                      ) : (
                      <div className="flex gap-3 items-center">
                        <div>
                          <Label className="text-xs">Return Qty</Label>
                          <Input
                            type="number"
                            min="0"
                            max={item.maxQty}
                            value={item.returnQty}
                            disabled={item.condition === "damaged"}
                            onChange={e => {
                              const v = Math.min(parseFloat(e.target.value) || 0, item.maxQty);
                              setReturnItems(ri => ri.map((r, idx) => idx === i ? { ...r, returnQty: v, selected: v > 0 } : r));
                            }}
                            className="w-20 h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Condition</Label>
                          <Select
                            value={item.condition}
                            onValueChange={v => setReturnItems(ri => ri.map((r, idx) =>
                              idx === i ? { ...r, condition: v as "original" | "damaged" } : r
                            ))}
                          >
                            <SelectTrigger className="w-32 h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="original">✅ Original</SelectItem>
                              <SelectItem value="damaged">❌ Damaged</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {item.condition === "damaged" && (
                          <p className="text-xs text-red-600 self-end mb-1">Cannot return damaged</p>
                        )}
                      </div>
                      )}
                    </div>
                    );
                  })}
                </div>
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-sm font-semibold text-blue-800">
                    Return Credit: <span className="text-lg">QAR {returnCredit.toFixed(2)}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Damage Claim */}
            {returnType === "damage_claim" && (
              <div className="space-y-3">
                <div>
                  <Label>Damage Description (required)</Label>
                  <Textarea
                    value={damageDesc}
                    onChange={e => setDamageDesc(e.target.value)}
                    placeholder="Describe the damage or defect..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Supplier (who supplied this product)</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier..." />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 border-green-500 text-green-700"
                    disabled={loading}
                    onClick={submitReturn}>
                    📤 Submit for approval
                  </Button>
                  <Button variant="outline" className="flex-1 border-orange-500 text-orange-700"
                    onClick={() => {
                      const sup = suppliers.find(s => String(s.id) === supplierId);
                      if (!sup?.whatsapp) { toast({ title: "No supplier WhatsApp", variant: "destructive" }); return; }
                      const msg = encodeURIComponent(`We have a damage claim on your supplied product.\nInvoice: ${invoiceNumber}\nProduct: ${returnItems.map(r => r.description).join(", ")}\nDescription: ${damageDesc}\nPlease advise on replacement or credit.\n${companySettings?.storeNameEn || ""} ${companySettings?.phone || ""}`);
                      window.open(`https://wa.me/${sup.whatsapp.replace(/\D/g, "")}?text=${msg}`, "_blank");
                    }}>
                    🏭 Forward to Supplier
                  </Button>
                </div>
              </div>
            )}

            {/* Billing Correction */}
            {returnType === "billing_correction" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Correct prices/quantities (no physical return):</p>
                {returnItems.map((item, i) => (
                  <div key={i} className="border rounded p-3 space-y-2">
                    <div className="font-medium text-sm">{item.description}</div>
                    <div className="flex gap-4">
                      <div>
                        <Label className="text-xs">Original Price: QAR {item.price.toFixed(2)}</Label>
                        <Input type="number" min="0" placeholder="Correct price"
                          onChange={e => {
                            const newPrice = parseFloat(e.target.value) || item.price;
                            setReturnItems(ri => ri.map((r, idx) => idx === i ? { ...r, price: newPrice, returnQty: r.soldQty } : r));
                          }}
                          className="w-28 h-8 text-sm mt-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <Label className="text-sm font-medium">Mandatory Reason (required)</Label>
                  <Textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="State reason for billing correction..."
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div className="text-sm font-semibold">
                  Correction Credit: QAR {returnCredit.toFixed(2)}
                </div>
              </div>
            )}

            {/* Refund method (not for damage claim in pending state) */}
            {returnType !== "damage_claim" && (
              <div>
                <Label>Refund Method</Label>
                <RadioGroup
                  value={refundMethod}
                  onValueChange={setRefundMethod}
                  className="flex gap-4 mt-1"
                >
                  {/* Returns refund by Cash (preferred) or Online Transfer only — no PDC. */}
                  {[["Cash", "Cash"], ["Bank Transfer", "Online Transfer"]].map(([val, label]) => (
                    <div key={val} className="flex items-center gap-2">
                      <RadioGroupItem value={val} id={`refund-${val}`} />
                      <Label htmlFor={`refund-${val}`} className="font-normal text-sm">{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}

            <div>
              <Label className="text-sm">Return Reason (optional)</Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Customer reason for return..."
                className="mt-1"
              />
            </div>

            {/* Approval routing notice */}
            {returnType !== "damage_claim" && (
              returnCredit > threshold ? (
                <div className="bg-amber-50 border border-amber-300 rounded p-3 text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>This return is <strong>QAR {returnCredit.toFixed(2)}</strong> — over the <strong>QAR {threshold}</strong> limit, so a <strong>manager must approve</strong> it. It will be submitted as pending.</span>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Routine return (QAR {returnCredit.toFixed(2)}, within the QAR {threshold} limit) — it will be <strong>processed immediately</strong> on submit.</span>
                </div>
              )
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("type_select")}>Back</Button>
              <Button
                disabled={loading}
                onClick={() => {
                  if (returnType === "billing_correction" && !reason.trim()) {
                    toast({ title: "Reason required for billing correction", variant: "destructive" });
                    return;
                  }
                  submitReturn();
                }}
                className="bg-[#1e2a3a] text-white hover:bg-[#2d3f55]"
              >
                {loading ? "Submitting…" : returnType !== "damage_claim" && returnCredit <= threshold ? "✅ Process return" : "📤 Submit for approval"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── ADMIN PIN ── */}
        {step === "pin" && (
          <div className="text-center py-4">
            <h3 className="font-bold text-lg mb-1">Admin Approval Required</h3>
            <p className="text-sm text-gray-500 mb-4">Enter admin PIN to process return</p>

            {pinLocked ? (
              <div className="text-red-600 font-medium">
                🔒 Locked. Try again at{" "}
                {new Date(pinLockUntil).toLocaleTimeString()}
              </div>
            ) : (
              <>
                {/* PIN dots */}
                <div className="flex justify-center gap-3 mb-4">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 ${
                        i < pin.length ? "bg-[#1e2a3a] border-[#1e2a3a]" : "border-gray-300"
                      }`}
                    />
                  ))}
                </div>

                {pinError && (
                  <p className="text-red-600 text-sm mb-3">{pinError}</p>
                )}

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                  {["1","2","3","4","5","6","7","8","9","*","0","back"].map(k => (
                    <button
                      key={k}
                      onClick={() => handlePinKey(k)}
                      className="h-14 text-lg font-semibold rounded-lg border-2 border-gray-200 hover:bg-gray-100 active:bg-gray-200 transition"
                    >
                      {k === "back" ? "⌫" : k === "*" ? "" : k}
                    </button>
                  ))}
                </div>
              </>
            )}

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setStep("items")}>Back</Button>
              <Button
                onClick={submitReturn}
                disabled={pin.length < 4 || loading || pinLocked}
                className="bg-[#1e2a3a] text-white"
              >
                {loading ? "Processing..." : "Confirm Return"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── RESULT ── */}
        {step === "result" && (
          <div className="text-center py-6">
            {resultProcessed ? (
              <>
                <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Return processed</h3>
                <p className="text-gray-600 mb-1">
                  Return <strong className="text-[#1e2a3a]">{resultCN}</strong> is <strong>done</strong>.
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Stock reversed and the refund was issued. (Routine return, QAR {returnCredit.toFixed(2)} — at or under the QAR {threshold} limit.)
                </p>
              </>
            ) : (
              <>
                <Clock size={48} className="text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Sent to manager for approval</h3>
                <p className="text-gray-600 mb-1">
                  Return <strong className="text-[#1e2a3a]">{resultCN}</strong> is now <strong>pending</strong>.
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  {returnCredit > threshold
                    ? `This return is QAR ${returnCredit.toFixed(2)} — over the QAR ${threshold} limit, so a manager must approve it.`
                    : "A manager will review and approve it."} Nothing changes until then — stock reverses and any refund issues only after approval.
                </p>
              </>
            )}
            <div className="flex gap-3 justify-center">
              <Button onClick={onClose} className="bg-[#1e2a3a] text-white">Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
