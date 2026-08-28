import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store as StoreIcon, Warehouse, Plus, Loader2, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import LocationAddressTree from "@/components/LocationAddressTree";
import { cn } from "@/lib/utils";

/* ── One store at a time ──────────────────────────────────────────────────────
   Two stores that share nothing. Looking at Store 1 should show Store 1 and
   nothing else — a mixed list is how four warehouses ended up silently attached
   to the wrong store.

   Inside a location, three levels of address so stock can actually be found:
   Area (North Side) > Rack (Rack A) > Shelf (Shelf 1). Each entry belongs to the
   location it was created under, via meta.locationId — the same mechanism the
   schema already reserved for sub-locations.
──────────────────────────────────────────────────────────────────────────────*/

type Store = {
  id: number; nameEn: string; nameAr: string | null; address: string | null;
  type: "store" | "warehouse"; ownerStoreId: number | null; active: boolean;
};
type ListItem = { id: number; listKey: string; value: string; meta: any };

const LEVELS = [
  { key: "location_areas", label: "Areas", hint: "North Side, East Side, Middle" },
  { key: "location_racks", label: "Racks", hint: "Rack A, Wall Rack, Corner" },
  { key: "location_shelves", label: "Shelves", hint: "Shelf 1, Top, Bottom" },
] as const;

export default function StoreLocationsSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });

  const shops = useMemo(() => stores.filter((s) => s.type === "store"), [stores]);
  const [storeId, setStoreId] = useState<string>("");

  // Land on the first store rather than an empty screen.
  useEffect(() => {
    if (!storeId && shops.length) setStoreId(String(shops[0].id));
  }, [shops, storeId]);

  const store = shops.find((s) => String(s.id) === storeId) || null;
  const warehouses = stores.filter((s) => s.type === "warehouse" && s.ownerStoreId === store?.id);
  const shared = stores.filter((s) => s.type === "warehouse" && s.ownerStoreId == null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ nameEn: "", nameAr: "", address: "" });
  const [editing, setEditing] = useState<Store | null>(null);
  // What the dialog is creating. A warehouse belongs to the chosen store; a shared
  // one belongs to nobody and is usable by every store; a store owns warehouses.
  const [mode, setMode] = useState<"store" | "warehouse" | "shared">("warehouse");

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        type: mode === "store" ? "store" : "warehouse",
        // A store owns nothing; a shared warehouse has no owner on purpose.
        ownerStoreId: mode === "warehouse" ? (store?.id ?? null) : null,
      };
      const url = editing ? `/api/stores/${editing.id}` : "/api/stores";
      const r = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editing ? { ...body, ownerStoreId: editing.ownerStoreId } : body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Could not save.");
      return r.json();
    },
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      setAddOpen(false); setEditing(null);
      setForm({ nameEn: "", nameAr: "", address: "" });
      // Jump straight to a new store so it can be set up immediately.
      if (!editing && mode === "store" && created?.id) setStoreId(String(created.id));
      toast({
        title: editing ? "Saved"
          : mode === "store" ? "Store added"
          : mode === "shared" ? "Shared warehouse added"
          : "Warehouse added",
      });
    },
    onError: (e: any) => toast({ title: "Not saved", description: e?.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/stores/${id}`, { method: "DELETE", credentials: "include" });
      if (r.status === 204) return true;
      throw new Error((await r.json().catch(() => ({})))?.message || "Could not delete.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Warehouse deleted" });
    },
    onError: (e: any) => toast({
      title: "Cannot delete", description: e?.message, variant: "destructive",
    }),
  });

  const toggle = useMutation({
    mutationFn: (s: Store) =>
      fetch(`/api/stores/${s.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ active: !s.active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/stores"] }),
  });

  const openAdd = (m: "store" | "warehouse" | "shared") => {
    setEditing(null); setMode(m);
    setForm({ nameEn: "", nameAr: "", address: "" });
    setAddOpen(true);
  };
  const openEdit = (w: Store) => {
    setEditing(w);
    setMode(w.type === "store" ? "store" : w.ownerStoreId == null ? "shared" : "warehouse");
    setForm({ nameEn: w.nameEn, nameAr: w.nameAr || "", address: w.address || "" });
    setAddOpen(true);
  };

  if (isLoading) {
    return <p className="flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </p>;
  }

  const card = (loc: Store, isWarehouse: boolean) => (
    <div key={loc.id} className={cn("border rounded-xl p-3", !loc.active && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isWarehouse
              ? <Warehouse className="w-4 h-4 text-purple-500 shrink-0" />
              : <StoreIcon className="w-4 h-4 text-blue-500 shrink-0" />}
            <span className="font-medium">{loc.nameEn}</span>
            {loc.nameAr && <span className="text-muted-foreground text-sm">{loc.nameAr}</span>}
            {!loc.active && (
              <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50 text-[10px]">
                Inactive
              </Badge>
            )}
          </div>
          {loc.address && <p className="text-xs text-muted-foreground mt-0.5">{loc.address}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isWarehouse && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(loc)}>
                Edit
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                disabled={del.isPending}
                onClick={() => {
                  if (!window.confirm(
                    `Delete ${loc.nameEn}?\n\n` +
                    "This only works if nothing has ever been stored there. If it has, " +
                    "switch it off instead — it leaves the lists and the history stays."
                  )) return;
                  del.mutate(loc.id);
                }}
              >
                Delete
              </Button>
            </>
          )}
          <Switch checked={loc.active} onCheckedChange={() => toggle.mutate(loc)} />
        </div>
      </div>
      <LocationAddressTree locationId={loc.id} locationName={loc.nameEn} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="space-y-1.5 flex-1 max-w-sm">
          <Label>Which store are you setting up?</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue placeholder="Choose a store…" /></SelectTrigger>
            <SelectContent>
              {shops.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openAdd("store")} className="gap-2">
            <StoreIcon className="w-4 h-4" /> Add store
          </Button>
          {store && (
            <Button onClick={() => openAdd("warehouse")} className="gap-2">
              <Plus className="w-4 h-4" /> Add warehouse to {store.nameEn.split("—")[0].trim()}
            </Button>
          )}
          <Button variant="outline" onClick={() => openAdd("shared")} className="gap-2">
            <Warehouse className="w-4 h-4" /> Add shared warehouse
          </Button>
        </div>
      </div>

      {!store ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {shops.length === 0
            ? "No stores yet. Add your first store above — warehouses go inside it."
            : "Choose a store above. You will only see that store."}
        </p>
      ) : (
        <>
          {card(store, false)}

          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
              Warehouses of {store.nameEn.split("—")[0].trim()}
              {warehouses.length > 0 && ` (${warehouses.length})`}
            </p>
            {warehouses.length === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-xl p-4 text-center">
                No warehouses yet. Add one with the button above.
              </p>
            ) : (
              <div className="space-y-2">{warehouses.map((w) => card(w, true))}</div>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
              Shared by every store{shared.length > 0 && ` (${shared.length})`}
            </p>
            {shared.length === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-xl p-4 text-center">
                None. A shared warehouse belongs to no single store — use it for stock
                any store can draw from.
              </p>
            ) : (
              <div className="space-y-2">{shared.map((w) => card(w, true))}</div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0" />
            Area, Rack and Shelf are how staff find stock: <b>North Side → Rack A → Shelf 2</b>.
            Each one belongs to the location it is added under, so the two stores never
            see each other's.
          </p>
        </>
      )}

      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.type === "store" ? "store" : "warehouse"}`
                : mode === "store" ? "Add a store"
                : mode === "shared" ? "Add a shared warehouse"
                : `Add warehouse to ${store?.nameEn ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Rename it or change its address."
                : mode === "store"
                ? "A shop that trades. Its own warehouses, staff and stock go inside it."
                : mode === "shared"
                ? "Belongs to no single store. Every store can draw stock from it."
                : "It will belong to this store only. Other stores will not see it."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name (English)</Label>
              <Input
                autoFocus value={form.nameEn}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                placeholder={mode === "store" ? "e.g. Store 3 — Salwa Road" : "e.g. 27 Number Warehouse"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>الاسم (Arabic)</Label>
              <Input
                dir="rtl" value={form.nameAr}
                onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Where it is"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAddOpen(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.nameEn.trim() || save.isPending} className="gap-2">
              {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editing ? "Save"
                : mode === "store" ? "Add store"
                : mode === "shared" ? "Add shared warehouse"
                : "Add warehouse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
