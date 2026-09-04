import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { shrinkImageWithin, DOCUMENT } from "@/lib/image";

/* ── Broken, hardened, soaked ─────────────────────────────────────────────────
   Own-stock damage had nowhere to go. The damage screen that existed is for a
   CUSTOMER complaining about an invoice; a pallet that fell in the yard could
   only be recorded as an anonymous quantity change with a typed note — no
   photo, no value, no pattern anybody could see.

   This does both halves at once: the stock goes down AND the money is written
   down, at what the material cost, with a picture if there is one.
──────────────────────────────────────────────────────────────────────────────*/

type Product = { id: number; name: string; unit?: string | null; costPrice?: any };
type StoreItem = { id: number; nameEn: string; type?: string };

const MAX_PHOTO = 900_000;   // ~900KB after downscale — plenty for a phone photo of a pallet

export default function DamageDialog({
  open, onClose, products, stores, defaultStoreId,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  stores: StoreItem[];
  defaultStoreId?: number | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [productId, setProductId] = useState("");
  const [storeId, setStoreId] = useState(defaultStoreId ? String(defaultStoreId) : "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  const product = products.find((p) => String(p.id) === productId) || null;
  const unitCost = Number(product?.costPrice || 0);
  const value = (Number(qty) || 0) * unitCost;

  const reset = () => {
    setProductId(""); setQty(""); setReason(""); setPhoto(null);
    setStoreId(defaultStoreId ? String(defaultStoreId) : "");
  };

  // Downscale in the browser: a 4MB phone photo helps nobody and the row is read
  // back in lists.
  const pickPhoto = async (file: File) => {
    // Damage backs a money claim against a supplier, so the picture has to show
    // what was actually broken — shrunk as a DOCUMENT, not a snapshot.
    try {
      setPhoto(await shrinkImageWithin(file, MAX_PHOTO, DOCUMENT));
    } catch (err: any) {
      toast({ title: "That picture is too big", description: err?.message, variant: "destructive" });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/stock-damage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId: Number(productId), storeId: Number(storeId),
          qty: Number(qty), reason: reason.trim(), photoUrl: photo,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as any)?.message || "Could not record it.");
      return body;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      qc.invalidateQueries({ queryKey: ["/api/stock-losses"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/profit-detail"] });
      toast({
        title: `${res.removed} written off`,
        description: `QAR ${Number(res.lossValue || 0).toFixed(2)} recorded as damage. ${res.onHand} left at this location.`,
      });
      reset(); onClose();
    },
    onError: (e: any) =>
      toast({ title: "Not recorded", description: e?.message, variant: "destructive" }),
  });

  const canSave =
    productId && storeId && Number(qty) > 0 && reason.trim().length >= 3 && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Record damage
          </DialogTitle>
          <DialogDescription>
            Broken, hardened, soaked. The stock goes down and the loss is recorded at
            what the material cost.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Which product?</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Choose a product…" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {products.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Where?</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Location…" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>How many{product?.unit ? ` (${product.unit})` : ""}?</Label>
              <Input
                value={qty} inputMode="decimal" placeholder="0"
                onChange={(e) => setQty(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {Number(qty) > 0 && (
            <div className={cn("rounded-lg border p-2.5 text-sm",
              unitCost > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-border bg-muted/40")}>
              {unitCost > 0
                ? <>This writes off <b>QAR {value.toFixed(2)}</b> ({qty} × QAR {unitCost.toFixed(2)}).</>
                : <>This product has no cost price, so the loss will be recorded at zero. Set its cost to see what damage really costs.</>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>What happened?</Label>
            <Textarea
              rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. pallet dropped unloading — 6 bags split"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Photo (optional)</Label>
            {photo ? (
              <div className="relative inline-block">
                <img src={photo} alt="Damage" className="max-h-40 rounded-lg border" />
                <button
                  type="button" onClick={() => setPhoto(null)}
                  className="absolute -top-2 -right-2 bg-background border rounded-full p-1 shadow"
                  aria-label="Remove photo"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <Button type="button" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
                  <Camera className="w-4 h-4" /> Take or choose a photo
                </Button>
                <input
                  ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ""; }}
                />
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
            disabled={!canSave}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Write it off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
