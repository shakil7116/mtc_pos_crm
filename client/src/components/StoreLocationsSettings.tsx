import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store as StoreIcon, Warehouse, Plus, Loader2, MapPin, Trash2, Undo2,
  ChevronDown, ChevronRight, Phone, Clock, ExternalLink, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import LocationAddressTree from "@/components/LocationAddressTree";
import EraseLocationDialog from "@/components/EraseLocationDialog";
import CloseLocationDialog from "@/components/CloseLocationDialog";
import { formatUndoLeft } from "@shared/undo";
import { cn } from "@/lib/utils";

/* ── One store at a time ──────────────────────────────────────────────────────
   Two stores that share nothing. Looking at Store 1 should show Store 1 and
   nothing else — a mixed list is how four warehouses ended up silently attached
   to the wrong store.

   Inside a location, three levels of address so stock can actually be found:
   Area (North Side) > Rack (Rack A) > Shelf (Shelf 1). Each entry belongs to the
   location it was created under, via meta.locationId.

   Removing things has two speeds:
     Delete  — hides it. Undo for one day. History stays. The everyday answer.
     Erase   — it and everything inside it go for good, after a backup and two
               confirmations. For clearing out test locations.
──────────────────────────────────────────────────────────────────────────────*/

type Store = {
  id: number; nameEn: string; nameAr: string | null; address: string | null;
  type: "store" | "warehouse"; ownerStoreId: number | null; active: boolean;
  code?: string | null; phone?: string | null; email?: string | null;
  crNumber?: string | null; taxNumber?: string | null;
  openingHours?: string | null; mapUrl?: string | null; notes?: string | null;
};
type DeletedStore = Store & {
  deletedAt: string; undoUntil: number; undoable: boolean;
  usedBy: string[]; keptForever: boolean;
};

const EMPTY = {
  nameEn: "", nameAr: "", address: "", code: "", phone: "", email: "",
  crNumber: "", taxNumber: "", openingHours: "", mapUrl: "", notes: "",
};

export default function StoreLocationsSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });

  const { data: deleted = [] } = useQuery<DeletedStore[]>({
    queryKey: ["/api/stores/deleted"],
    queryFn: () => fetch("/api/stores/deleted", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : [])),
  });

  // The countdown has to move on its own, or it lies the moment it is drawn.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!deleted.length) return;
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [deleted.length]);

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
  const [form, setForm] = useState({ ...EMPTY });
  const [more, setMore] = useState(false);
  const [alsoWarehouse, setAlsoWarehouse] = useState(true);
  const [editing, setEditing] = useState<Store | null>(null);
  const [erasing, setErasing] = useState<Store | null>(null);
  const [closing, setClosing] = useState<Store | null>(null);
  // What the dialog is creating. A warehouse belongs to the chosen store; a shared
  // one belongs to nobody and is usable by every store; a store owns warehouses.
  const [mode, setMode] = useState<"store" | "warehouse" | "shared">("warehouse");

  const call = async (url: string, method: string, body?: any) => {
    const r = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      credentials: "include", body: body ? JSON.stringify(body) : undefined,
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((out as any)?.message || "That did not work.");
    return out;
  };

  const restore = useMutation({
    mutationFn: (id: number) => call(`/api/stores/${id}/restore`, "POST"),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/stores/deleted"] });
      toast({ title: `${(res.restored ?? []).map((r: any) => r.nameEn).join(", ")} is back` });
    },
    onError: (e: any) =>
      toast({ title: "Could not restore", description: e?.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const clean: any = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
      const body = {
        ...clean,
        type: mode === "store" ? "store" : "warehouse",
        // A store owns nothing; a shared warehouse has no owner on purpose.
        ownerStoreId: mode === "warehouse" ? (store?.id ?? null) : null,
      };
      if (editing) {
        return call(`/api/stores/${editing.id}`, "PUT", { ...body, ownerStoreId: editing.ownerStoreId });
      }

      const created: any = await call("/api/stores", "POST", body);
      // A store with nowhere to keep stock is not finished. One tick saves a step.
      if (mode === "store" && alsoWarehouse && created?.id) {
        await call("/api/stores", "POST", {
          nameEn: `${clean.nameEn} — Main Warehouse`,
          nameAr: clean.nameAr ? `${clean.nameAr} — المستودع الرئيسي` : "",
          address: clean.address, type: "warehouse", ownerStoreId: created.id,
        }).catch(() => {});   // the store exists either way; the warehouse can be added by hand
      }
      return created;
    },
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      setAddOpen(false); setEditing(null); setForm({ ...EMPTY });
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
    mutationFn: (id: number) => call(`/api/stores/${id}`, "DELETE"),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/stores/deleted"] });
      const names = (res.hidden ?? []).map((h: any) => h.nameEn).join(", ");
      const first = res.hidden?.[0]?.id;
      toast({
        title: `${names} deleted`,
        description: res.keptForever
          ? "Hidden, not erased — it has history. Bring it back any time today."
          : "Gone from every list. Undo within 24 hours.",
        action: first ? (
          <ToastAction altText="Undo" onClick={() => restore.mutate(first)}>Undo</ToastAction>
        ) : undefined,
      });
    },
    onError: (e: any) => toast({
      title: "Cannot delete", description: e?.message, variant: "destructive",
    }),
  });

  const toggle = useMutation({
    mutationFn: (s: Store) => call(`/api/stores/${s.id}`, "PUT", { active: !s.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/stores"] }),
  });

  const openAdd = (m: "store" | "warehouse" | "shared") => {
    setEditing(null); setMode(m); setForm({ ...EMPTY });
    setMore(false); setAlsoWarehouse(true); setAddOpen(true);
  };
  const openEdit = (w: Store) => {
    setEditing(w);
    setMode(w.type === "store" ? "store" : w.ownerStoreId == null ? "shared" : "warehouse");
    setForm({
      nameEn: w.nameEn, nameAr: w.nameAr || "", address: w.address || "",
      code: w.code || "", phone: w.phone || "", email: w.email || "",
      crNumber: w.crNumber || "", taxNumber: w.taxNumber || "",
      openingHours: w.openingHours || "", mapUrl: w.mapUrl || "", notes: w.notes || "",
    });
    setMore(Boolean(w.email || w.crNumber || w.taxNumber || w.openingHours || w.mapUrl || w.notes));
    setAddOpen(true);
  };

  if (isLoading) {
    return <p className="flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </p>;
  }

  const short = (n: string) => n.split("—")[0].trim();

  const card = (loc: Store, isWarehouse: boolean) => (
    <div key={loc.id} className={cn("border rounded-xl p-3", !loc.active && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isWarehouse
              ? <Warehouse className="w-4 h-4 text-purple-500 shrink-0" />
              : <StoreIcon className="w-4 h-4 text-blue-500 shrink-0" />}
            <span className="font-medium">{loc.nameEn}</span>
            {loc.code && <Badge variant="secondary" className="text-[10px]">{loc.code}</Badge>}
            {loc.nameAr && <span className="text-muted-foreground text-sm">{loc.nameAr}</span>}
            {!loc.active && (
              <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50 text-[10px]">
                Inactive
              </Badge>
            )}
          </div>
          {loc.address && <p className="text-xs text-muted-foreground mt-0.5">{loc.address}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
            {loc.phone && <span className="flex items-center gap-1"><Phone size={11} />{loc.phone}</span>}
            {loc.openingHours && <span className="flex items-center gap-1"><Clock size={11} />{loc.openingHours}</span>}
            {loc.crNumber && <span>CR {loc.crNumber}</span>}
            {loc.taxNumber && <span>TRN {loc.taxNumber}</span>}
            {loc.mapUrl && (
              <a href={loc.mapUrl} target="_blank" rel="noreferrer"
                 className="flex items-center gap-1 text-blue-600 hover:underline">
                <ExternalLink size={11} /> Map
              </a>
            )}
          </div>
          {loc.notes && <p className="text-[11px] text-muted-foreground/80 mt-1 italic">{loc.notes}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(loc)}>
            Edit
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={del.isPending}
            onClick={() => {
              const kids = stores.filter((s) => s.ownerStoreId === loc.id);
              if (!window.confirm(
                `Delete ${loc.nameEn}?\n\n` +
                (kids.length
                  ? `Its ${kids.length} warehouse(s) go with it: ${kids.map((k) => k.nameEn).join(", ")}.\n\n`
                  : "") +
                "It leaves every list straight away. Nothing is erased — you can undo this " +
                "for 24 hours, and the history that names it stays intact."
              )) return;
              del.mutate(loc.id);
            }}
          >
            Delete
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-700 hover:bg-red-50"
            title="Erase this location and everything inside it — for clearing out test data"
            onClick={() => setErasing(loc)}
          >
            <Trash2 size={13} />
          </Button>
          <Switch
            checked={loc.active}
            onCheckedChange={() => {
              // Switching a location OFF is closing it, and a place with stock in
              // it needs the stock dealt with. Switching one back on is harmless.
              if (loc.active) setClosing(loc);
              else toggle.mutate(loc);
            }}
          />
        </div>
      </div>
      <LocationAddressTree locationId={loc.id} locationName={loc.nameEn} />
    </div>
  );

  const field = (key: keyof typeof EMPTY, label: string, placeholder = "", rtl = false) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        dir={rtl ? "rtl" : undefined}
        value={form[key]} placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
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
              <Plus className="w-4 h-4" /> Add warehouse to {short(store.nameEn)}
            </Button>
          )}
          <Button variant="outline" onClick={() => openAdd("shared")} className="gap-2">
            <Warehouse className="w-4 h-4" /> Add shared warehouse
          </Button>
        </div>
      </div>

      {!store ? (
        shops.length === 0 ? (
          // A blank set-up is a real state, not a fault: a business starting on
          // this system has no locations until it makes them, and so does anyone
          // who has just cleared the test ones out.
          <div className="border-2 border-dashed rounded-xl p-8 text-center space-y-3">
            <StoreIcon className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <div>
              <p className="font-medium">No stores yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Start with the shop that trades. Its warehouses, staff and stock go
                inside it — and you can add a second store any time.
              </p>
            </div>
            <Button onClick={() => openAdd("store")} className="gap-2">
              <Plus className="w-4 h-4" /> Add your first store
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Choose a store above. You will only see that store.
          </p>
        )
      ) : (
        <>
          {card(store, false)}

          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
              Warehouses of {short(store.nameEn)}
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

      {/* ── The recycle bin ─────────────────────────────────────────────────── */}
      {deleted.length > 0 && (
        <div className="border rounded-xl p-3 bg-muted/20">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
            <History size={12} /> Recently deleted ({deleted.length})
          </p>
          <div className="space-y-2">
            {deleted.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.type === "warehouse"
                      ? <Warehouse className="w-3.5 h-3.5 text-muted-foreground" />
                      : <StoreIcon className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-sm font-medium">{d.nameEn}</span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]",
                        d.undoable ? "text-amber-600 border-amber-200 bg-amber-50" : "text-muted-foreground")}
                    >
                      {formatUndoLeft(d.deletedAt)}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {d.keptForever
                      ? `Kept hidden for good — it has history (${d.usedBy.join(", ")}).`
                      : d.undoable
                      ? "Empty. It will be cleared out for real when the day is up."
                      : "Empty and past its day — it will be cleared out on the next check."}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(d.id)}
                  >
                    <Undo2 size={12} /> Restore
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-700"
                    title="Erase it and everything inside, for good"
                    onClick={() => setErasing(d)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Deleting hides a location; nothing is erased by accident. Restore brings it
            back exactly as it was — same stock, same history.
          </p>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.type === "store" ? "store" : "warehouse"}`
                : mode === "store" ? "Add a store"
                : mode === "shared" ? "Add a shared warehouse"
                : `Add warehouse to ${store?.nameEn ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Rename it, or fill in the details that show on screens and reports."
                : mode === "store"
                ? "A shop that trades. Its own warehouses, staff and stock go inside it."
                : mode === "shared"
                ? "Belongs to no single store. Every store can draw stock from it."
                : "It will belong to this store only. Other stores will not see it."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {field("nameEn", "Name (English)",
              mode === "store" ? "e.g. Store 3 — Salwa Road" : "e.g. 27 Number Warehouse")}
            {field("nameAr", "الاسم (Arabic)", "", true)}
            <div className="grid grid-cols-2 gap-3">
              {field("code", "Short code", mode === "store" ? "S3" : "WH-27")}
              {field("phone", "Phone", "+974 …")}
            </div>
            {field("address", "Address", "Where it is")}

            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setMore((m) => !m)}
            >
              {more ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              More details {more ? "" : "(email, CR, tax, hours, map)"}
            </button>

            {more && (
              <div className="space-y-3 border-l-2 pl-3">
                {field("email", "Email", "branch@…")}
                <div className="grid grid-cols-2 gap-3">
                  {field("crNumber", "CR number", "Commercial Registration")}
                  {field("taxNumber", "Tax / TRN number", "")}
                </div>
                {field("openingHours", "Opening hours", "Sat–Thu 7am–7pm, Fri closed")}
                {field("mapUrl", "Google Maps link", "https://maps.app.goo.gl/…")}
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2} value={form.notes}
                    placeholder="Anything staff should know about this place"
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {!editing && mode === "store" && (
              <label className="flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer">
                <Checkbox
                  checked={alsoWarehouse}
                  onCheckedChange={(v) => setAlsoWarehouse(Boolean(v))}
                  className="mt-0.5"
                />
                <span className="text-xs">
                  <b>Also create its main warehouse</b>
                  <span className="block text-muted-foreground">
                    A store needs somewhere to keep stock. This adds
                    {" "}"{form.nameEn.trim() || "the store"} — Main Warehouse" inside it.
                  </span>
                </span>
              </label>
            )}
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

      <CloseLocationDialog
        location={closing}
        open={!!closing}
        onOpenChange={(o) => { if (!o) setClosing(null); }}
        stores={stores}
      />

      <EraseLocationDialog
        location={erasing}
        open={!!erasing}
        onOpenChange={(o) => { if (!o) setErasing(null); }}
      />
    </div>
  );
}
