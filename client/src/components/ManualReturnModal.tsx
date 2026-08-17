import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Search, Package, FileText, User, Plus, Trash2, ArrowRight,
  CheckCircle, AlertTriangle, RotateCcw, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "customer" | "invoices" | "items" | "confirm" | "result";

interface CustomerHit {
  id: number;
  name: string;
  phone?: string;
  email?: string;
}

interface InvoiceForReturn {
  id: number;
  number: string;
  date: string;
  total: string;
  status: string;
  storeId: number | null;
  items: {
    id: number;
    productId: number | null;
    description: string;
    qty: string;
    unit: string;
    price: string;
    amount: string;
    returnedQty: number;
  }[];
}

interface SelectedItem {
  key: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  documentItemId: number | null;
  productId: number | null;
  description: string;
  purchasedQty: number;
  alreadyReturned: number;
  maxQty: number;
  returnQty: number;
  unit: string;
  price: number;
  condition: "original" | "damaged";
  isManual: boolean;
}

interface ManualReturnModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultStoreId?: number;
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(String(v)) || 0;
}

function fmtQAR(n: number): string {
  return "QAR " + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function ManualReturnModal({ open, onClose, onSuccess, defaultStoreId }: ManualReturnModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("customer");
  const [loading, setLoading] = useState(false);

  // Customer search
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null);

  // Invoice selection
  const [invoices, setInvoices] = useState<InvoiceForReturn[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());

  // Items
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isManualMode, setIsManualMode] = useState(false);

  // Product search (for manual item entry)
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<any[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [activeProductKey, setActiveProductKey] = useState<string | null>(null);

  const searchProductsFor = async (q: string, itemKey: string) => {
    setProductQuery(q);
    setActiveProductKey(itemKey);
    if (q.trim().length < 2) { setProductHits([]); return; }
    setProductSearchLoading(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q.trim())}`);
      if (!res.ok) throw new Error();
      const hits: any[] = await res.json();
      setProductHits(hits);
    } catch {
      setProductHits([]);
    } finally {
      setProductSearchLoading(false);
    }
  };

  const pickProduct = (itemKey: string, product: any) => {
    setSelectedItems((prev) => prev.map((it) =>
      it.key === itemKey ? {
        ...it,
        productId: product.id,
        description: product.name,
        price: parseFloat(String(product.salePrice || 0)),
        unit: product.unit || "PCS",
      } : it
    ));
    setProductHits([]);
    setProductQuery("");
    setActiveProductKey(null);
  };

  // Return details
  const [returnType, setReturnType] = useState("partial");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("Cash");

  // Result
  const [resultVoucher, setResultVoucher] = useState("");
  const [resultPending, setResultPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("customer");
    setCustomerQuery("");
    setCustomers([]);
    setSelectedCustomer(null);
    setInvoices([]);
    setSelectedInvoiceIds(new Set());
    setSelectedItems([]);
    setIsManualMode(false);
    setProductQuery("");
    setProductHits([]);
    setActiveProductKey(null);
    setReturnType("partial");
    setReason("");
    setRefundMethod("Cash");
    setResultVoucher("");
    setResultPending(false);
  }, [open]);

  // Search customers
  const searchCustomers = async () => {
    if (customerQuery.trim().length < 2) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(customerQuery.trim())}`);
      if (!res.ok) throw new Error("Search failed");
      const hits: any[] = await res.json();
      setCustomers(hits.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email })));
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    } finally {
      setSearchLoading(false);
    }
  };

  // Load customer invoices
  const loadInvoices = async (custId: number) => {
    setInvoicesLoading(true);
    try {
      const res = await fetch(`/api/customers/${custId}/invoices-for-return`);
      const data: InvoiceForReturn[] = await res.json();
      setInvoices(data);
    } catch {
      toast({ title: "Failed to load invoices", variant: "destructive" });
    } finally {
      setInvoicesLoading(false);
    }
  };

  const selectCustomer = (c: CustomerHit) => {
    setSelectedCustomer(c);
    loadInvoices(c.id);
    setStep("invoices");
  };

  const toggleInvoice = (invId: number) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invId)) next.delete(invId);
      else next.add(invId);
      return next;
    });
  };

  const proceedToItems = () => {
    const items: SelectedItem[] = [];
    for (const inv of invoices) {
      if (!selectedInvoiceIds.has(inv.id)) continue;
      for (const it of inv.items) {
        const purchased = toNum(it.qty);
        const alreadyReturned = toNum(it.returnedQty);
        const returnable = Math.max(0, purchased - alreadyReturned);
        items.push({
          key: `${inv.id}-${it.id}`,
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          documentItemId: it.id,
          productId: it.productId,
          description: it.description,
          purchasedQty: purchased,
          alreadyReturned,
          maxQty: returnable,
          returnQty: returnable,
          unit: it.unit || "PCS",
          price: toNum(it.price),
          condition: "original",
          isManual: false,
        });
      }
    }
    setSelectedItems(items);
    setStep("items");
  };

  const switchToManual = () => {
    setIsManualMode(true);
    setSelectedItems([{
      key: "manual-1",
      invoiceId: null,
      invoiceNumber: null,
      documentItemId: null,
      productId: null,
      description: "",
      purchasedQty: 0,
      alreadyReturned: 0,
      maxQty: 9999,
      returnQty: 1,
      unit: "PCS",
      price: 0,
      condition: "original",
      isManual: true,
    }]);
    setStep("items");
  };

  const addManualItem = () => {
    setSelectedItems((prev) => [...prev, {
      key: `manual-${Date.now()}`,
      invoiceId: null,
      invoiceNumber: null,
      documentItemId: null,
      productId: null,
      description: "",
      purchasedQty: 0,
      alreadyReturned: 0,
      maxQty: 9999,
      returnQty: 1,
      unit: "PCS",
      price: 0,
      condition: "original",
      isManual: true,
    }]);
  };

  const updateItem = (key: string, field: string, value: any) => {
    setSelectedItems((prev) => prev.map((it) =>
      it.key === key ? { ...it, [field]: value } : it
    ));
  };

  const removeItem = (key: string) => {
    setSelectedItems((prev) => prev.filter((it) => it.key !== key));
  };

  const activeItems = selectedItems.filter((it) => it.returnQty > 0 && (it.isManual ? it.description.trim() : true));
  const totalRefund = activeItems.reduce((s, it) => s + it.price * it.returnQty, 0);

  const canSubmit = activeItems.length > 0 && totalRefund > 0 && reason.trim().length > 0;

  const submitReturn = async () => {
    setLoading(true);
    try {
      const uniqueInvIds = activeItems.map((it) => it.invoiceId).filter((id): id is number => id != null);
      const sourceInvoices = isManualMode ? [] :
        Array.from(new Set(uniqueInvIds)).map((invId) => {
          const inv = invoices.find((i) => i.id === invId);
          return { invoiceId: invId, invoiceNumber: inv?.number || "" };
        });

      const payload: any = {
        isManual: isManualMode,
        sourceInvoices: sourceInvoices.length > 0 ? sourceInvoices : undefined,
        originalInvoiceId: sourceInvoices.length === 1 ? sourceInvoices[0].invoiceId : undefined,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name || (isManualMode ? "Walk-in" : undefined),
        storeId: defaultStoreId,
        type: returnType,
        reason,
        refundMethod,
        refundAmount: totalRefund,
        items: activeItems.map((it) => ({
          productId: it.productId || undefined,
          documentItemId: it.documentItemId || undefined,
          description: it.description,
          qty: it.returnQty,
          unit: it.unit,
          price: it.price,
          amount: it.price * it.returnQty,
          condition: it.condition,
        })),
        createdBy: user?.id,
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
      const voucher = data.returnVoucher?.voucherNumber || "RV-??????";
      setResultVoucher(voucher);
      setResultPending(true);
      setStep("result");

      qc.invalidateQueries({ queryKey: ["/api/returns"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/returns"] });
      onSuccess?.();
    } catch (err: any) {
      toast({ title: "Return failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const stepIndicator = (s: Step, label: string, num: number) => {
    const steps: Step[] = ["customer", "invoices", "items", "confirm"];
    const current = steps.indexOf(step);
    const target = steps.indexOf(s);
    const done = target < current;
    const active = target === current;
    return (
      <div className={cn("flex items-center gap-1.5", active ? "text-foreground" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50")}>
        <span className={cn(
          "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
          active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"
        )}>
          {done ? "✓" : num}
        </span>
        <span className="text-xs font-semibold">{label}</span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            New Return
          </DialogTitle>
        </DialogHeader>

        {step !== "result" && (
          <div className="flex items-center gap-3 pb-3 border-b border-border/40">
            {stepIndicator("customer", "Customer", 1)}
            <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
            {stepIndicator("invoices", isManualMode ? "Manual" : "Invoices", 2)}
            <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
            {stepIndicator("items", "Items", 3)}
            <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
            {stepIndicator("confirm", "Confirm", 4)}
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0">
          {/* Step 1: Customer Search */}
          {step === "customer" && (
            <div className="space-y-4 p-1">
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name, phone, or email..."
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchCustomers()}
                  className="flex-1"
                />
                <Button onClick={searchCustomers} disabled={searchLoading || customerQuery.trim().length < 2} size="sm">
                  {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>

              {customers.length > 0 && (
                <div className="space-y-1">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      className="w-full text-left p-3 rounded-lg border border-border/40 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm">{c.name}</span>
                        {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {customers.length === 0 && customerQuery.length >= 2 && !searchLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">No customers found.</p>
              )}

              <Separator />
              <Button variant="outline" className="w-full" onClick={switchToManual}>
                <Package className="w-4 h-4 mr-2" />
                Manual Return (no invoice / no customer)
              </Button>
            </div>
          )}

          {/* Step 2: Invoice Selection */}
          {step === "invoices" && !isManualMode && (
            <div className="space-y-3 p-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{selectedCustomer?.name}</p>
                  <p className="text-xs text-muted-foreground">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""} found</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep("customer")}>
                  Change customer
                </Button>
              </div>

              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-muted-foreground">No invoices found for this customer.</p>
                  <Button variant="outline" onClick={switchToManual}>
                    <Package className="w-4 h-4 mr-2" />
                    Manual Return Instead
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Select one or more invoices to return items from:</p>
                  <div className="space-y-2">
                    {invoices.map((inv) => (
                      <button
                        key={inv.id}
                        onClick={() => toggleInvoice(inv.id)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-colors",
                          selectedInvoiceIds.has(inv.id)
                            ? "border-primary bg-primary/5 dark:bg-primary/10"
                            : "border-border/40 hover:bg-accent/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={selectedInvoiceIds.has(inv.id)} />
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="font-mono text-sm font-semibold">{inv.number}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{inv.date}</span>
                            <span className="text-sm font-mono font-bold">{fmtQAR(toNum(inv.total))}</span>
                          </div>
                        </div>
                        <div className="mt-1 ml-8 text-xs text-muted-foreground">
                          {inv.items.length} item{inv.items.length !== 1 ? "s" : ""}
                          {inv.status === "returned" && <Badge variant="outline" className="ml-2 text-[10px]">Already Returned</Badge>}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {invoices.length > 0 && (
                <Separator className="my-2" />
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={switchToManual}>
                <Package className="w-4 h-4 mr-2" />
                Can't find the invoice? Manual entry
              </Button>
            </div>
          )}

          {/* Step 3: Item selection / editing */}
          {step === "items" && (
            <div className="space-y-3 p-1">
              {!isManualMode && (
                <p className="text-xs text-muted-foreground">
                  Adjust quantities for items being returned. Set to 0 to exclude.
                </p>
              )}
              {isManualMode && (
                <p className="text-xs text-muted-foreground">
                  Enter each item being returned manually.
                </p>
              )}

              <div className="space-y-2">
                {selectedItems.map((it) => {
                  const fullyReturned = !it.isManual && it.maxQty <= 0;
                  return (
                  <Card key={it.key} className={cn("border-border/40", fullyReturned && "opacity-50")}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        {it.isManual ? (
                          <div className="flex-1 relative">
                            <div className="flex items-center gap-1">
                              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-2.5 pointer-events-none" />
                              <Input
                                placeholder="Search product or type description..."
                                value={activeProductKey === it.key ? productQuery : it.description}
                                onChange={(e) => {
                                  updateItem(it.key, "description", e.target.value);
                                  searchProductsFor(e.target.value, it.key);
                                }}
                                onFocus={() => {
                                  setActiveProductKey(it.key);
                                  setProductQuery(it.description);
                                  if (it.description.length >= 2) searchProductsFor(it.description, it.key);
                                }}
                                onBlur={() => setTimeout(() => {
                                  if (activeProductKey === it.key) { setActiveProductKey(null); setProductHits([]); }
                                }, 200)}
                                className="flex-1 text-sm pl-7"
                              />
                            </div>
                            {activeProductKey === it.key && productHits.length > 0 && (
                              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {productHits.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => pickProduct(it.key, p)}
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium truncate">{p.name}</p>
                                      {p.sku && <p className="text-[10px] text-muted-foreground">{p.sku}</p>}
                                    </div>
                                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                      QAR {parseFloat(p.salePrice || "0").toFixed(2)} / {p.unit}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {activeProductKey === it.key && productQuery.length >= 2 && productHits.length === 0 && !productSearchLoading && (
                              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg px-3 py-2">
                                <p className="text-xs text-muted-foreground">No products found — type freely</p>
                              </div>
                            )}
                            {it.productId && (
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                                Linked to product #{it.productId}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{it.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {it.invoiceNumber && (
                                <span className="text-[10px] text-muted-foreground">from {it.invoiceNumber}</span>
                              )}
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                Bought: {it.purchasedQty}
                              </span>
                              {it.alreadyReturned > 0 && (
                                <span className="text-[10px] tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                                  Already returned: {it.alreadyReturned}
                                </span>
                              )}
                              <span className={cn("text-[10px] tabular-nums font-semibold", fullyReturned ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                                Returnable: {it.maxQty}
                              </span>
                            </div>
                          </div>
                        )}
                        {(isManualMode || selectedItems.length > 1) && (
                          <Button variant="ghost" size="sm" onClick={() => removeItem(it.key)} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      {fullyReturned ? (
                        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Fully returned already — cannot return more.</span>
                        </div>
                      ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-[10px] text-muted-foreground">Qty</Label>
                          <Input
                            type="number"
                            min={0}
                            max={it.maxQty}
                            value={it.returnQty}
                            onChange={(e) => updateItem(it.key, "returnQty", Math.min(Number(e.target.value) || 0, it.maxQty))}
                            className={cn("w-20 h-7 text-sm", it.returnQty > it.maxQty && "border-red-500")}
                          />
                          {!it.isManual && <span className="text-[10px] text-muted-foreground">/ {it.maxQty}</span>}
                        </div>
                        {it.isManual && (
                          <div className="flex items-center gap-1.5">
                            <Label className="text-[10px] text-muted-foreground">Price</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={it.price}
                              onChange={(e) => updateItem(it.key, "price", Number(e.target.value) || 0)}
                              className="w-24 h-7 text-sm"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Label className="text-[10px] text-muted-foreground">Unit</Label>
                          <Input
                            value={it.unit}
                            onChange={(e) => updateItem(it.key, "unit", e.target.value)}
                            className="w-16 h-7 text-sm"
                          />
                        </div>
                        <div className="flex-1" />
                        <span className="text-sm font-mono font-bold tabular-nums">
                          {fmtQAR(it.price * it.returnQty)}
                        </span>
                      </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
              </div>

              {isManualMode && (
                <Button variant="outline" size="sm" onClick={addManualItem} className="w-full">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                </Button>
              )}

              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total Refund</span>
                <span className="text-lg font-mono font-bold">{fmtQAR(totalRefund)}</span>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === "confirm" && (
            <div className="space-y-4 p-1">
              <Card className="border-border/40">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Customer</p>
                      <p className="font-semibold">{selectedCustomer?.name || "Walk-in"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Mode</p>
                      <p className="font-semibold">{isManualMode ? "Manual Entry" : `${selectedInvoiceIds.size} invoice(s)`}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Items</p>
                      <p className="font-semibold">{activeItems.length} item{activeItems.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Refund</p>
                      <p className="font-semibold font-mono">{fmtQAR(totalRefund)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Return Type</Label>
                  <Select value={returnType} onValueChange={setReturnType}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Return</SelectItem>
                      <SelectItem value="partial">Partial Return</SelectItem>
                      <SelectItem value="exchange">Exchange</SelectItem>
                      <SelectItem value="damage_claim">Damage Claim</SelectItem>
                      <SelectItem value="billing_correction">Billing Correction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
                  <Textarea
                    placeholder="Why is this return being processed?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">Refund Method</Label>
                  <Select value={refundMethod} onValueChange={setRefundMethod}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isManualMode && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Manual return — no invoice linked. This will always require manager/admin approval.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {step === "result" && (
            <div className="text-center py-8 space-y-4">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
              <div>
                <p className="text-lg font-bold">{resultVoucher}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Return created — pending manager/admin approval.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Stock will be reversed and refund issued upon approval.
                </p>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="pt-3 border-t border-border/40">
          {step === "customer" && (
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          )}
          {step === "invoices" && (
            <>
              <Button variant="outline" onClick={() => setStep("customer")}>Back</Button>
              <Button
                onClick={proceedToItems}
                disabled={selectedInvoiceIds.size === 0}
              >
                Next: Select Items ({selectedInvoiceIds.size})
              </Button>
            </>
          )}
          {step === "items" && (
            <>
              <Button variant="outline" onClick={() => {
                if (isManualMode) setStep("customer");
                else setStep("invoices");
              }}>Back</Button>
              <Button
                onClick={() => setStep("confirm")}
                disabled={activeItems.length === 0 || totalRefund <= 0}
              >
                Next: Confirm ({fmtQAR(totalRefund)})
              </Button>
            </>
          )}
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setStep("items")}>Back</Button>
              <Button
                onClick={submitReturn}
                disabled={!canSubmit || loading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                Submit Return
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
