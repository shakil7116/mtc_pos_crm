import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import DocumentNumberingSettings from "@/components/DocumentNumberingSettings";
import BusinessRulesSettings from "@/components/BusinessRulesSettings";
import LocationHierarchySettings from "@/components/LocationHierarchySettings";
import StoreLocationsSettings from "@/components/StoreLocationsSettings";
import ManagedListsSettings from "@/components/ManagedListsSettings";
import CustomFieldsSettings from "@/components/CustomFieldsSettings";
import { flushSyncQueue } from "@/lib/offline";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { shrinkImage, LOGO } from "@/lib/image";
import { useSettings } from "@/hooks/use-settings";
import { INVOICE_TEMPLATES, DEFAULT_TEMPLATE, companyTemplate } from "@/components/invoice-templates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Store,
  Warehouse,
  Users,
  FileText,
  Tag,
  Share2,
  MessageSquare,
  Database,
  Info,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
  RefreshCw,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  Shield,
  ImageIcon,
  Eye,
  EyeOff,
  Wallet,
  Banknote,
  ArrowDownCircle,
  Cog,
  CircleDollarSign,
  Clock,
  TrendingDown,
  CalendarCheck,
  Camera,
  Search, Check} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────── */
type Settings = {
  invoiceTemplate?: string;   // which paper the company prints on
  storeNameEn?: string;
  storeNameAr?: string;
  addressEn?: string;
  addressAr?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  crNumber?: string;
  poBox?: string;
  logoUrl?: string;
  taxRate?: number;
  returnPolicyText?: string;
  largeOrderThreshold?: number;
  showPoField?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  maxMessagesPerDay?: number;
  autoQueueMessages?: boolean;
  googleMapsUrl?: string;
  brands?: string[];
  youtube?: string;
  tiktok?: string;
  instagram?: string;
  facebook?: string;
};

type Store = {
  id: number;
  nameEn: string;
  nameAr: string;
  address: string;
  type: "store" | "warehouse";
  ownerStoreId?: number | null;   // warehouse → which store owns it (null = common)
  active: boolean;
};

type User = {
  id: number;
  name: string;
  role: string; // admin | manager | worker | salesman | driver
  username?: string | null;
  storeId: number | null;
  active: boolean;
  // The list endpoint drops the base64 photo and sends this instead; the picture
  // itself comes from /api/users/:id/photo.
  hasPhoto?: boolean;
};

/* ─────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────── */
function Field({
  label,
  dir,
  children,
}: {
  label: string;
  dir?: "rtl";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" dir={dir}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function SectionSaveBtn({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick} disabled={loading} size="sm" className="gap-2">
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Save className="w-3.5 h-3.5" />
      )}
      Save
    </Button>
  );
}

function SettingsGroup({ label, index, children }: { label: string; index: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.06 * index }}
    >
      <div className="flex items-center gap-3 mb-3 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 select-none">
          {label}
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-border/60 to-transparent" />
      </div>
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  /* ── Guard ─────────────────────────────────────────────── */
  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-lg font-semibold text-foreground">Access Denied</p>
          <p className="text-muted-foreground">
            This page is restricted to administrators only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#d4a017] to-[#b8860b] flex items-center justify-center shadow-lg shadow-[#d4a017]/20">
          <Cog className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            System configuration for MTC POS+CRM
          </p>
        </div>
      </motion.div>

      {/* ── General ── */}
      <SettingsGroup label="General" index={0}>
        <Accordion type="multiple" className="space-y-2.5">
          <Section1 toast={toast} qc={qc} />
          <Section2 toast={toast} qc={qc} />
        </Accordion>
      </SettingsGroup>

      {/* ── People ── */}
      <SettingsGroup label="People" index={1}>
        <Accordion type="multiple" className="space-y-2.5">
          <Section3 toast={toast} qc={qc} currentUserId={user.id} />
          <StaffPayrollSection toast={toast} qc={qc} />
        </Accordion>
      </SettingsGroup>

      {/* ── Documents & Rules ── */}
      <SettingsGroup label="Documents & Rules" index={2}>
        <Accordion type="multiple" className="space-y-2.5">
          <Section4 toast={toast} qc={qc} />
          <DocumentNumberingSettings />
          <BusinessRulesSettings />
          <LocationHierarchySettings />
          <ManagedListsSettings />
          <CustomFieldsSettings />
        </Accordion>
      </SettingsGroup>

      {/* ── Brand & Social ── */}
      <SettingsGroup label="Brand & Social" index={3}>
        <Accordion type="multiple" className="space-y-2.5">
          <Section5 toast={toast} qc={qc} />
          <Section6 toast={toast} qc={qc} />
          <Section7 toast={toast} qc={qc} />
        </Accordion>
      </SettingsGroup>

      {/* ── System ── */}
      <SettingsGroup label="System" index={4}>
        <Accordion type="multiple" className="space-y-2.5">
          <Section8 toast={toast} />
          <Section9 toast={toast} />
        </Accordion>
      </SettingsGroup>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 1 — Company Information
════════════════════════════════════════════════════════════════════ */
function Section1({ toast, qc }: { toast: any; qc: any }) {
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  const [form, setForm] = useState<Partial<Settings>>({});
  const [logoPreview, setLogoPreview] = useState<string>("");
  const initialized = useRef(false);

  useEffect(() => {
    if (settings && !initialized.current) {
      initialized.current = true;
      setForm(settings);
      setLogoPreview(settings.logoUrl || "");
    }
  }, [settings]);

  const mut = useMutation({
    mutationFn: (body: Partial<Settings>) =>
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      initialized.current = false;
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Company info saved" });
    },
    onError: () =>
      toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // LOGO, not PHOTO: a letterhead logo stays crisper, and a transparent
    // background survives instead of being flattened onto black.
    const url = await shrinkImage(file, LOGO);
    setLogoPreview(url);
    setForm((f) => ({ ...f, logoUrl: url }));
  };

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AccordionItem value="company" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
            <Building2 className="w-[18px] h-[18px] text-[#d4a017]" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Company Information</span>
            <span className="text-xs text-muted-foreground font-normal">Name, address, contact details, logo</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-6 pt-2 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Company Name (English)">
                <Input value={form.storeNameEn || ""} onChange={set("storeNameEn")} />
              </Field>
              <Field label="اسم الشركة (Arabic)" dir="rtl">
                <Input value={form.storeNameAr || ""} onChange={set("storeNameAr")} className="font-arabic" />
              </Field>
              <Field label="CR Number">
                <Input value={form.crNumber || ""} onChange={set("crNumber")} />
              </Field>
              <Field label="P.O. Box">
                <Input value={form.poBox || ""} onChange={set("poBox")} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone || ""} onChange={set("phone")} />
              </Field>
              <Field label="WhatsApp">
                <Input value={form.whatsapp || ""} onChange={set("whatsapp")} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email || ""} onChange={set("email")} />
              </Field>
              <Field label="Google Maps URL">
                <Input value={form.googleMapsUrl || ""} onChange={set("googleMapsUrl")} />
              </Field>
              <Field label="Address (English)">
                <Input value={form.addressEn || ""} onChange={set("addressEn")} />
              </Field>
              <Field label="العنوان (Arabic)" dir="rtl">
                <Input value={form.addressAr || ""} onChange={set("addressAr")} className="font-arabic" />
              </Field>
            </div>

            {/* Logo */}
            <div className="border border-dashed border-border rounded-xl p-4 space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                Company Logo
              </Label>
              <div className="flex items-start gap-4">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-16 w-auto max-w-[120px] object-contain border border-border rounded-lg"
                  />
                ) : (
                  <div className="h-16 w-24 bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                    No logo
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    id="logo-upload"
                    className="hidden"
                    onChange={handleLogoFile}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById("logo-upload")?.click()}
                    className="gap-2"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Image
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Or paste a URL:
                  </p>
                  <Input
                    placeholder="https://..."
                    value={form.logoUrl?.startsWith("data:") ? "" : form.logoUrl || ""}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, logoUrl: e.target.value }));
                      setLogoPreview(e.target.value);
                    }}
                    className="text-xs h-8 w-56"
                  />
                </div>
              </div>
            </div>

            {/* ── The paper every invoice prints on ────────────────────────
                One choice for the whole company. It used to live in each
                person's browser, so two people printing the same invoice got
                two different papers and a new phone reset to Blue. */}
            <div className="space-y-2 pt-2 border-t border-border/40">
              <Label className="text-sm font-medium">Invoice template</Label>
              <p className="text-xs text-muted-foreground">
                The paper your invoices, quotations and delivery notes print on.
                Everyone in the company follows this.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {INVOICE_TEMPLATES.map((t) => {
                  const chosen = companyTemplate(form.invoiceTemplate) === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, invoiceTemplate: t.id }))}
                      className={cn(
                        "text-left rounded-xl border px-4 py-3 transition-all min-w-[9.5rem]",
                        chosen
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{t.label}</span>
                        {chosen && <Check className="w-3.5 h-3.5 text-primary" />}
                        {t.id === DEFAULT_TEMPLATE && !chosen && (
                          <span className="text-[10px] text-muted-foreground">default</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{t.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <SectionSaveBtn loading={mut.isPending} onClick={() => {
                const { storeNameEn, storeNameAr, addressEn, addressAr, phone, whatsapp, email, crNumber, poBox, logoUrl, googleMapsUrl, invoiceTemplate } = form;
                mut.mutate({ storeNameEn, storeNameAr, addressEn, addressAr, phone, whatsapp, email, crNumber, poBox, logoUrl, googleMapsUrl, invoiceTemplate });
              }} />
            </div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 2 — Stores
════════════════════════════════════════════════════════════════════ */
function Section2({ toast, qc }: { toast: any; qc: any }) {
  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ nameEn: "", nameAr: "", address: "", type: "store" as "store" | "warehouse", ownerStoreId: null as number | null });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Store>>({});

  // Deleting a location only works if it has never been used. The server refuses
  // otherwise and explains what is pointing at it — that message is shown here.
  const deleteStoreMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/stores/${id}`, { method: "DELETE", credentials: "include" });
      if (r.status === 204) return true;
      const body = await r.json().catch(() => ({}));
      throw new Error(body?.message || "Could not delete this location.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Location deleted" });
    },
    onError: (e: any) => toast({
      title: "Cannot delete this location", description: e?.message, variant: "destructive",
    }),
  });

  const addMut = useMutation({
    mutationFn: (body: typeof addForm) =>
      fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      setAddOpen(false);
      setAddForm({ nameEn: "", nameAr: "", address: "", type: "store", ownerStoreId: null });
      toast({ title: "Store added" });
    },
    onError: () => toast({ title: "Failed to add store", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: Partial<Store> & { id: number }) =>
      fetch(`/api/stores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      setEditId(null);
      toast({ title: "Store updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const toggleActive = (store: Store) =>
    updateMut.mutate({ id: store.id, active: !store.active });

  // Stores are the real places; a warehouse belongs to one of them. A flat list
  // hides that, so locations are ordered store-then-its-warehouses, and warehouses
  // are indented under their owner. Ones owned by nobody are shared between both
  // stores and grouped last.
  const grouped = (() => {
    const out: Array<{ store: Store; isChild: boolean; heading?: string }> = [];
    const shops = stores.filter((s) => s.type === "store");
    const sheds = stores.filter((s) => s.type === "warehouse");
    for (const shop of shops) {
      out.push({ store: shop, isChild: false });
      for (const w of sheds.filter((x) => x.ownerStoreId === shop.id)) {
        out.push({ store: w, isChild: true });
      }
    }
    sheds.filter((w) => w.ownerStoreId == null).forEach((w, i) => out.push({
      store: w, isChild: true,
      heading: i === 0 ? "Shared between both stores" : undefined,
    }));
    // A warehouse pointing at a store that no longer exists must still be visible.
    for (const w of sheds) {
      if (!out.some((o) => o.store.id === w.id)) out.push({ store: w, isChild: false });
    }
    return out;
  })();

  const warehouseCount = (storeId: number) =>
    stores.filter((s) => s.type === "warehouse" && s.ownerStoreId === storeId).length;

  const addWarehouseTo = (storeId: number) => {
    setAddForm({ nameEn: "", nameAr: "", address: "", type: "warehouse", ownerStoreId: storeId });
    setAddOpen(true);
  };

  const startEdit = (store: Store) => {
    setEditId(store.id);
    setEditForm({ nameEn: store.nameEn, nameAr: store.nameAr, address: store.address, type: store.type, ownerStoreId: store.ownerStoreId ?? null, active: store.active });
  };

  return (
    <AccordionItem value="stores" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
            <Store className="w-[18px] h-[18px] text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Stores & Warehouses</span>
            <span className="text-xs text-muted-foreground font-normal">Manage locations and warehouse assignments</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2 pb-4">
          {/* One store at a time. A mixed list is how four warehouses ended up
              silently attached to the wrong store. */}
          <StoreLocationsSettings />
        </div>

        {/* Add Store Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Location</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Field label="Name (English)">
                <Input
                  value={addForm.nameEn}
                  onChange={(e) => setAddForm((f) => ({ ...f, nameEn: e.target.value }))}
                  placeholder="Main Store"
                />
              </Field>
              <Field label="الاسم (Arabic)" dir="rtl">
                <Input
                  value={addForm.nameAr}
                  onChange={(e) => setAddForm((f) => ({ ...f, nameAr: e.target.value }))}
                  className="font-arabic"
                  placeholder="المتجر الرئيسي"
                />
              </Field>
              <Field label="Address">
                <Input
                  value={addForm.address}
                  onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Najma Street, Doha"
                />
              </Field>
              <Field label="Type">
                <Select
                  value={addForm.type}
                  onValueChange={(v: "store" | "warehouse") =>
                    setAddForm((f) => ({ ...f, type: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Store</SelectItem>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {addForm.type === "warehouse" && (
                <Field label="Owned by">
                  <Select
                    value={addForm.ownerStoreId != null ? String(addForm.ownerStoreId) : "common"}
                    onValueChange={(v) => setAddForm((f) => ({ ...f, ownerStoreId: v === "common" ? null : Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="common">Common (shared)</SelectItem>
                      {stores.filter((s) => s.type === "store" && s.active).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addMut.mutate(addForm)}
                disabled={addMut.isPending || !addForm.nameEn}
                className="gap-2"
              >
                {addMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add Location
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AccordionContent>
    </AccordionItem>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Staff photo + role helpers
───────────────────────────────────────────────────────────────────── */

/** A phone photo is 3–8 MB. The avatar is 48 pixels wide and the picture lives in
 *  the database row itself, so shrink it to a 320px square in the browser before
 *  it is ever uploaded. The server refuses anything over ~300 KB as a backstop. */
async function shrinkPhoto(file: File, size = 320): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  // Centre-crop to a square first, so faces are not stretched.
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, size, size,
  );
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.82);
}

function initialsOf(name: string) {
  return (
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?"
  );
}

const ROLE_STYLE: Record<string, { label: string; chip: string; ring: string }> = {
  admin: {
    label: "Admin",
    chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60",
    ring: "from-amber-400 to-orange-500",
  },
  ceo: {
    label: "CEO",
    chip: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60",
    ring: "from-rose-400 to-pink-500",
  },
  manager: {
    label: "Manager",
    chip: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60",
    ring: "from-blue-400 to-indigo-500",
  },
  salesman: {
    label: "Salesman",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
    ring: "from-emerald-400 to-teal-500",
  },
  worker: {
    label: "Worker",
    chip: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
    ring: "from-slate-400 to-slate-500",
  },
  driver: {
    label: "Driver",
    chip: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60",
    ring: "from-violet-400 to-purple-500",
  },
};
const roleStyle = (role: string) => ROLE_STYLE[role] || ROLE_STYLE.worker;

/** Photo if there is one, coloured initials if there is not.
 *  `src` overrides the stored photo — that is how the dialogs preview a picture
 *  that has been chosen but not saved yet. */
function StaffAvatar({
  user,
  src,
  size = 48,
  dim,
}: {
  user: { id: number; name: string; role: string; hasPhoto?: boolean };
  src?: string | null;
  size?: number;
  dim?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const url = src !== undefined ? src : user.hasPhoto && !broken ? `/api/users/${user.id}/photo` : null;
  const rs = roleStyle(user.role);
  return (
    <div
      className={cn(
        "rounded-full p-[2px] bg-gradient-to-br shrink-0 shadow-sm",
        rs.ring,
        dim && "grayscale opacity-60",
      )}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt={user.name}
          onError={() => setBroken(true)}
          className="w-full h-full rounded-full object-cover bg-white"
        />
      ) : (
        <div
          className="w-full h-full rounded-full bg-white dark:bg-card flex items-center justify-center font-bold text-muted-foreground tracking-tight"
          style={{ fontSize: Math.round(size * 0.34) }}
        >
          {initialsOf(user.name)}
        </div>
      )}
    </div>
  );
}

/** The avatar plus Choose / Remove. Used by the Add dialog, where it only holds
 *  the picture in memory, and by the Photo dialog, where it saves. */
function PhotoPicker({
  user,
  value,
  onPick,
  onClear,
  toast,
}: {
  user: { id: number; name: string; role: string; hasPhoto?: boolean };
  value: string | null | undefined;   // undefined = leave whatever is stored
  onPick: (dataUrl: string) => void;
  onClear: () => void;
  toast: any;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";                        // let the same file be picked twice
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast({ title: "Use a PNG, JPG or WebP image", variant: "destructive" });
      return;
    }
    setReading(true);
    try {
      onPick(await shrinkPhoto(file));
    } catch {
      toast({ title: "Could not read that image", variant: "destructive" });
    } finally {
      setReading(false);
    }
  }

  const hasSomething = value ? true : value === null ? false : !!user.hasPhoto;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative group rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-400"
        title="Choose a photo"
      >
        <StaffAvatar user={user} src={value} size={76} />
        <span className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {reading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Camera className="w-5 h-5 text-white" />
          )}
        </span>
      </button>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" />
            {hasSomething ? "Change photo" : "Add photo"}
          </Button>
          {hasSomething && (
            <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onClear}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Square works best. It is shrunk to 320px before saving.
        </p>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handle} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 3 — Staff Management
════════════════════════════════════════════════════════════════════ */
function Section3({
  toast,
  qc,
  currentUserId,
}: {
  toast: any;
  qc: any;
  currentUserId: number;
}) {
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
  });
  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    queryFn: () => fetch("/api/stores").then((r) => r.json()),
  });

  // Which location's people are on screen. "all" shows everyone, split into a
  // block per location; "none" is the people who are not tied to one.
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    role: "salesman" as string,
    storeId: "" as string,
    pin: "",
    // Without these two the account is created but can never log in — login looks
    // the user up BY USERNAME, and a null username matches nothing.
    username: "",
    password: "",
  });
  const [addPhoto, setAddPhoto] = useState<string | null>(null);
  const [showAddPw, setShowAddPw] = useState(false);

  const [pinDialog, setPinDialog] = useState<{
    open: boolean;
    userId: number;
    userName: string;
    targetIsAdmin: boolean;
  } | null>(null);
  const [newPin, setNewPin] = useState("");
  const [adminVerifyPin, setAdminVerifyPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  // Login access (username + password) — admin only.
  const [loginDialog, setLoginDialog] = useState<{ userId: number; userName: string; currentUsername: string; targetIsAdmin: boolean } | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginAdminPw, setLoginAdminPw] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Photo dialog. Editing ANOTHER admin's row needs your own password — the same
  // rule the server applies to every other field on an admin account.
  const [photoDialog, setPhotoDialog] = useState<User | null>(null);
  const [photoDraft, setPhotoDraft] = useState<string | null | undefined>(undefined);
  const [photoAdminPw, setPhotoAdminPw] = useState("");

  const addMut = useMutation({
    mutationFn: (body: typeof addForm) =>
      fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          storeId: body.storeId ? Number(body.storeId) : null,
          username: body.username.trim().toLowerCase(),
          photoUrl: addPhoto,
          // They pick their own on first login.
          mustChangePassword: true,
        }),
      }).then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.message || "Failed to add staff");
        return b;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setAddOpen(false);
      setAddForm({ name: "", role: "salesman", storeId: "", pin: "", username: "", password: "" });
      setAddPhoto(null);
      toast({ title: "Staff member added" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to add staff", description: String(e?.message || ""), variant: "destructive" }),
  });

  // Turning access off goes through its own route so any live session dies at once,
  // rather than lasting until their token happens to expire.
  const activeMut = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const r = await fetch(`/api/users/${id}/active`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ active }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message || "Could not change access.");
      return body;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: v.active ? "Access restored" : "Access removed" });
    },
    onError: (e: any) => toast({ title: "Not changed", description: e?.message, variant: "destructive" }),
  });

  // Erasing an account only works for someone who never did anything. The server
  // refuses otherwise and explains why — that message is what gets shown here.
  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" });
      if (r.status === 204) return true;
      const body = await r.json().catch(() => ({}));
      throw new Error(body?.message || "Could not remove this account.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Account removed" });
    },
    onError: (e: any) => toast({
      title: "Cannot remove this account",
      description: e?.message,
      variant: "destructive",
    }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: Partial<User> & { id: number; pin?: string }) =>
      fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then(async (r) => {
        const b = await r.json().catch(() => ({}));
        // "PIN already used" and "too obvious" arrive here — showing a bare
        // "Update failed" would leave the owner with no idea what to change.
        if (!r.ok) throw new Error(b?.message || "Update failed");
        return b;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setPinDialog(null);
      setNewPin("");
      setAdminVerifyPin("");
      toast({ title: "User updated" });
    },
    onError: (e: any) =>
      toast({ title: "Update failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const photoMut = useMutation({
    mutationFn: async () => {
      if (!photoDialog || photoDraft === undefined) return;
      const needsPw = photoDialog.role === "admin" && photoDialog.id !== currentUserId;
      const r = await fetch(`/api/users/${photoDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          photoUrl: photoDraft,
          ...(needsPw ? { confirmPassword: photoAdminPw } : {}),
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.message || "Could not save the photo.");
      return b;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: photoDraft ? "Photo updated" : "Photo removed" });
      setPhotoDialog(null); setPhotoDraft(undefined); setPhotoAdminPw("");
    },
    onError: (e: any) =>
      toast({ title: "Photo not saved", description: String(e?.message || ""), variant: "destructive" }),
  });

  // Set username and/or a temporary password. Password reset forces the staff to
  // choose their own on next login (mustChangePassword). Editing another admin
  // needs the acting admin's own password.
  const credMut = useMutation({
    mutationFn: async () => {
      if (!loginDialog) return;
      const { userId, currentUsername, targetIsAdmin } = loginDialog;
      const confirmPassword = targetIsAdmin && userId !== currentUserId ? loginAdminPw : undefined;
      const newUsername = loginUsername.trim().toLowerCase();
      if (newUsername && newUsername !== (currentUsername || "").toLowerCase()) {
        const r = await fetch(`/api/users/${userId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: newUsername, confirmPassword }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Username update failed");
      }
      if (loginPassword) {
        const r = await fetch(`/api/users/${userId}/reset-password`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: loginPassword, confirmPassword }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Password reset failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Login updated", description: loginPassword ? "Staff must set their own password on next login." : "" });
      setLoginDialog(null); setLoginUsername(""); setLoginPassword(""); setLoginAdminPw("");
    },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || ""), variant: "destructive" }),
  });

  const handlePinSave = async () => {
    if (!pinDialog) return;
    if (newPin.length < 4 || newPin.length > 6) {
      toast({ title: "PIN must be 4–6 digits", variant: "destructive" });
      return;
    }
    // Require admin PIN verification when changing another admin's PIN.
    // This used to POST to /api/auth/login, which wants a username and PASSWORD —
    // so it always failed and no second admin's PIN could ever be changed.
    if (pinDialog.targetIsAdmin && pinDialog.userId !== currentUserId) {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: adminVerifyPin }),
      });
      if (!res.ok) {
        toast({ title: "Incorrect admin PIN", variant: "destructive" });
        return;
      }
    }
    updateMut.mutate({ id: pinDialog.userId, pin: newPin });
  };

  /* ── Who is on screen, and how they are split up ────────────────── */
  const locations = useMemo(
    () => stores.filter((s) => s.active).slice().sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
    [stores],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (!showInactive && !u.active) return false;
      if (storeFilter === "none" && u.storeId) return false;
      if (storeFilter !== "all" && storeFilter !== "none" && String(u.storeId ?? "") !== storeFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        ((u as any).username || "").toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [users, search, storeFilter, showInactive]);

  // One block per location, then the people who work across all of them. An empty
  // location is only worth showing when it is the one being looked at.
  const groups = useMemo(() => {
    const out: { key: string; title: string; subtitle: string; icon: "store" | "warehouse" | "global"; people: User[] }[] = [];
    for (const s of locations) {
      const people = visible.filter((u) => u.storeId === s.id);
      if (!people.length && storeFilter !== String(s.id)) continue;
      out.push({
        key: `s${s.id}`,
        title: s.nameEn,
        subtitle: s.type === "warehouse" ? "Warehouse" : "Store",
        icon: s.type === "warehouse" ? "warehouse" : "store",
        people,
      });
    }
    const floaters = visible.filter((u) => !u.storeId || !locations.some((s) => s.id === u.storeId));
    if (floaters.length || storeFilter === "none") {
      out.push({
        key: "none",
        title: "Every location",
        subtitle: "Not tied to one store",
        icon: "global",
        people: floaters,
      });
    }
    return out;
  }, [visible, locations, storeFilter]);

  const activeCount = users.filter((u) => u.active).length;

  // A single admin is a single point of failure. Passwords are scrambled and PINs
  // now are too, so if the only admin loses BOTH, there is no way back in short of
  // opening the database by hand. A second admin can always reset the first.
  const activeAdmins = users.filter((u) => u.active && u.role === "admin");
  const soloAdmin = !isLoading && activeAdmins.length < 2;

  // Same username, no new password → the Save button has nothing to do.
  const loginNothingToSave =
    !!loginDialog &&
    loginUsername.trim().toLowerCase() === (loginDialog.currentUsername || "").toLowerCase() &&
    !loginPassword;

  return (
    <AccordionItem value="staff" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center shrink-0">
            <Users className="w-[18px] h-[18px] text-violet-600 dark:text-violet-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Staff Management</span>
            <span className="text-xs text-muted-foreground font-normal">
              People by location · photos, roles, PINs, login
            </span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2 pb-4">
          {/* ── Toolbar: location picker + search + add ── */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="lg:w-[250px] h-9">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.nameEn}
                    <span className="text-muted-foreground"> · {users.filter((u) => u.storeId === s.id).length}</span>
                  </SelectItem>
                ))}
                <SelectItem value="none">
                  Every location
                  <span className="text-muted-foreground"> · {users.filter((u) => !u.storeId).length}</span>
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, username or role…"
                className="pl-9 h-9 no-uppercase"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={showInactive ? "secondary" : "outline"}
                size="sm"
                className="h-9 text-xs"
                onClick={() => setShowInactive((v) => !v)}
                title="Show or hide accounts that have no access"
              >
                {showInactive ? "Showing inactive" : "Active only"}
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2 h-9">
                <Plus className="w-3.5 h-3.5" />
                Add Staff
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground px-0.5">
            {activeCount} active · {users.length - activeCount} inactive ·{" "}
            {locations.length} location{locations.length !== 1 ? "s" : ""}
          </p>

          {soloAdmin && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3.5 flex items-start gap-3">
              <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
                  Only one admin account
                </p>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-1 leading-relaxed">
                  Nobody can read a password or a PIN back — not even from the database.
                  If this account loses both, there is no way back into the system without a
                  developer opening the database by hand. A second admin can always reset the
                  first, so make one and keep it with someone you trust.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2.5 h-8 text-xs gap-1.5 bg-white dark:bg-transparent border-amber-300 dark:border-amber-800"
                  onClick={() => { setAddForm((f) => ({ ...f, role: "admin" })); setAddOpen(true); }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add a second admin
                </Button>
              </div>
            </div>
          )}

          {/* ── People, grouped by location ── */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-xl">
              <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-medium">Nobody here</p>
              <p className="text-xs text-muted-foreground mt-1">
                {search ? "No one matches that search." : "No staff assigned to this location yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.key} className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {g.icon === "warehouse" ? (
                        <Warehouse className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      ) : g.icon === "global" ? (
                        <Share2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      ) : (
                        <Store className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{g.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {g.subtitle} · {g.people.length} {g.people.length === 1 ? "person" : "people"}
                      </p>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-border/60 to-transparent" />
                  </div>

                  {g.people.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic pl-10">Nobody assigned here yet.</p>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {g.people.map((u) => {
                        const rs = roleStyle(u.role);
                        const isMe = u.id === currentUserId;
                        return (
                          <div
                            key={u.id}
                            className={cn(
                              "rounded-xl border border-border/60 bg-white dark:bg-card/60 p-3.5 transition-all duration-200",
                              "hover:border-border hover:shadow-[var(--shadow-card)]",
                              !u.active && "bg-muted/30",
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                className="relative group rounded-full shrink-0"
                                title="Change photo"
                                onClick={() => { setPhotoDialog(u); setPhotoDraft(undefined); setPhotoAdminPw(""); }}
                              >
                                <StaffAvatar user={u as any} size={48} dim={!u.active} />
                                <span className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Camera className="w-4 h-4 text-white" />
                                </span>
                              </button>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-sm leading-tight truncate">{u.name}</span>
                                  {isMe && (
                                    <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5">you</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground font-mono no-uppercase truncate mt-0.5">
                                  {(u as any).username || "— no login yet —"}
                                </p>
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5 font-medium", rs.chip)}>
                                    {rs.label}
                                  </Badge>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 h-5 border",
                                      u.active
                                        ? "text-green-700 border-green-200 bg-green-50 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900/60"
                                        : "text-red-600 border-red-200 bg-red-50 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60",
                                    )}
                                  >
                                    <span className={cn("w-1.5 h-1.5 rounded-full", u.active ? "bg-green-500" : "bg-red-500")} />
                                    {u.active ? "Active" : "No access"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-border/50">
                              <Button
                                variant="ghost" size="sm" className="text-xs h-7 px-2"
                                onClick={() => {
                                  setLoginDialog({
                                    userId: u.id,
                                    userName: u.name,
                                    currentUsername: (u as any).username || "",
                                    targetIsAdmin: u.role === "admin",
                                  });
                                  setLoginUsername((u as any).username || "");
                                  setLoginPassword("");
                                  setLoginAdminPw("");
                                  setShowLoginPw(false);
                                }}
                              >
                                Login
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="text-xs h-7 px-2"
                                onClick={() => {
                                  setPinDialog({
                                    open: true,
                                    userId: u.id,
                                    userName: u.name,
                                    targetIsAdmin: u.role === "admin",
                                  });
                                  setNewPin("");
                                  setAdminVerifyPin("");
                                }}
                              >
                                PIN
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="text-xs h-7 px-2"
                                disabled={isMe || activeMut.isPending}
                                onClick={() => activeMut.mutate({ id: u.id, active: !u.active })}
                              >
                                {u.active ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="text-xs h-7 px-2 ml-auto text-red-600 hover:text-red-700 hover:bg-red-50"
                                disabled={isMe || deleteMut.isPending}
                                title="Remove this account"
                                onClick={() => {
                                  if (!window.confirm(
                                    `Remove ${u.name} completely?\n\n` +
                                    "This only works if they have never created an invoice, taken a payment " +
                                    "or moved stock. If they have, use Disable instead — that removes their " +
                                    "access while keeping the record of what they did."
                                  )) return;
                                  deleteMut.mutate(u.id);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Photo Dialog */}
        <Dialog
          open={!!photoDialog}
          onOpenChange={(v) => { if (!v) { setPhotoDialog(null); setPhotoDraft(undefined); setPhotoAdminPw(""); } }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Photo — {photoDialog?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {photoDialog && (
                <PhotoPicker
                  user={photoDialog as any}
                  value={photoDraft}
                  onPick={(d) => setPhotoDraft(d)}
                  onClear={() => setPhotoDraft(null)}
                  toast={toast}
                />
              )}
              {photoDialog?.role === "admin" && photoDialog.id !== currentUserId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-amber-700">
                    <Shield className="w-4 h-4 inline mr-1" />
                    Changing another admin's account needs your own password.
                  </p>
                  <Input
                    type="password" value={photoAdminPw} onChange={(e) => setPhotoAdminPw(e.target.value)}
                    placeholder="Your admin password" className="no-uppercase bg-white" autoComplete="off"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setPhotoDialog(null); setPhotoDraft(undefined); }}>Cancel</Button>
              <Button
                onClick={() => photoMut.mutate()}
                disabled={
                  photoMut.isPending ||
                  photoDraft === undefined ||
                  (photoDialog?.role === "admin" && photoDialog.id !== currentUserId && !photoAdminPw)
                }
                className="gap-2"
              >
                {photoMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save photo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Staff Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <PhotoPicker
                user={{ id: 0, name: addForm.name || "New", role: addForm.role, hasPhoto: false }}
                value={addPhoto}
                onPick={setAddPhoto}
                onClear={() => setAddPhoto(null)}
                toast={toast}
              />
              <Field label="Full Name">
                <Input
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ahmed Al-Rashid"
                />
              </Field>
              <Field label="Role">
                <Select
                  value={addForm.role}
                  onValueChange={(v: string) =>
                    setAddForm((f) => ({ ...f, role: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin / Owner</SelectItem>
                    <SelectItem value="ceo">CEO (view only)</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="salesman">Salesman</SelectItem>
                    <SelectItem value="worker">General Worker</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Assigned Store">
                <Select
                  value={addForm.storeId || "all"}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, storeId: v === "all" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Every location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Every location</SelectItem>
                    {stores.filter((s) => s.active).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.nameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Username (for logging in)">
                <Input
                  value={addForm.username}
                  onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value.replace(/\s/g, "").toLowerCase() }))}
                  placeholder="e.g. store2.manager"
                  className="no-uppercase font-mono"
                  autoComplete="off"
                />
              </Field>
              <Field label="Starting password">
                <div className="relative">
                  <Input
                    type={showAddPw ? "text" : "password"}
                    value={addForm.password}
                    onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="They change it on first login"
                    className="no-uppercase"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showAddPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
              <Field label="PIN (4–6 digits)">
                <div className="relative">
                  <Input
                    type={showPin ? "text" : "password"}
                    value={addForm.pin}
                    onChange={(e) => setAddForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    placeholder="••••"
                    className="no-uppercase"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addMut.mutate(addForm)}
                disabled={
                  addMut.isPending || !addForm.name ||
                  addForm.pin.length < 4 ||
                  addForm.username.trim().length < 3 ||
                  addForm.password.length < 8
                }
                className="gap-2"
              >
                {addMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add Staff
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit PIN Dialog */}
        <Dialog
          open={!!pinDialog?.open}
          onOpenChange={() => {
            setPinDialog(null);
            setNewPin("");
            setAdminVerifyPin("");
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change PIN — {pinDialog?.userName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {pinDialog?.targetIsAdmin && pinDialog.userId !== currentUserId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                  <Shield className="w-4 h-4 inline mr-1" />
                  Changing another admin's PIN requires your own PIN for verification.
                </div>
              )}
              <Field label="New PIN (4–6 digits)">
                <Input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••"
                  maxLength={6}
                />
              </Field>
              {pinDialog?.targetIsAdmin && pinDialog.userId !== currentUserId && (
                <Field label="Your Admin PIN (verification)">
                  <Input
                    type="password"
                    value={adminVerifyPin}
                    onChange={(e) => setAdminVerifyPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter your PIN"
                    maxLength={6}
                  />
                </Field>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPinDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={handlePinSave}
                disabled={updateMut.isPending || newPin.length < 4}
                className="gap-2"
              >
                {updateMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Update PIN
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Login Access Dialog — username + temporary password (admin only) */}
        <Dialog open={!!loginDialog} onOpenChange={(v) => { if (!v) setLoginDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Login access — {loginDialog?.userName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs text-muted-foreground space-y-1.5">
                <p>
                  Nobody can read a staff password back — not even you. It is stored scrambled.
                  You can only <strong className="font-medium text-foreground">replace</strong> it
                  with a temporary one.
                </p>
                <p>
                  If you set one here, {loginDialog?.userName || "they"} are signed out everywhere at
                  once and must choose a new password the next time they log in.
                </p>
              </div>
              <Field label="Username">
                <Input
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
                  placeholder="e.g. store2.salesman"
                  className="no-uppercase font-mono"
                  autoComplete="off"
                />
              </Field>
              <Field label="Temporary password (leave blank to keep current)">
                <div className="relative">
                  <Input
                    type={showLoginPw ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="no-uppercase"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowLoginPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showLoginPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {loginPassword && loginPassword.length < 8 && (
                  <p className="text-[11px] text-red-500 mt-1">Password must be at least 8 characters.</p>
                )}
              </Field>
              {loginDialog?.targetIsAdmin && loginDialog.userId !== currentUserId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-amber-700"><Shield className="w-4 h-4 inline mr-1" />
                    Changing another admin's login needs your own password.</p>
                  <Input type="password" value={loginAdminPw} onChange={(e) => setLoginAdminPw(e.target.value)}
                    placeholder="Your admin password" className="no-uppercase bg-white" autoComplete="off" />
                </div>
              )}
            </div>
            {/* A disabled button with no reason next to it reads as "you must fill
                this in". Say plainly that there is simply nothing to save yet. */}
            {loginNothingToSave && (
              <p className="text-[11px] text-muted-foreground -mt-1">
                Nothing to save yet — change the username, or type a temporary password to replace the current one.
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLoginDialog(null)}>Cancel</Button>
              <Button
                onClick={() => credMut.mutate()}
                disabled={
                  credMut.isPending ||
                  loginNothingToSave ||
                  (loginPassword.length > 0 && loginPassword.length < 8) ||
                  (!!loginDialog?.targetIsAdmin && loginDialog.userId !== currentUserId && !loginAdminPw)
                }
                className="gap-2"
              >
                {credMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save login
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AccordionContent>
    </AccordionItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STAFF PAYROLL — Salary config, advances, days off, monthly summary
════════════════════════════════════════════════════════════════════ */

type PayrollEntry = {
  id: number;
  userId: number;
  type: string;
  amount: string;
  date: string;
  month: string;
  note: string | null;
};

type PayrollSummary = {
  userId: number;
  name: string;
  role: string;
  baseSalary: number;
  advances: number;
  deductions: number;
  bonuses: number;
  netSalary: number;
  salaryPaid: number;
  remaining: number;
  entries: PayrollEntry[];
};

function StaffPayrollSection({ toast, qc }: { toast: any; qc: any }) {
  const now = new Date();
  const [month, setMonth] = useState(now.toISOString().slice(0, 7));

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
  });

  const { data: summary = [], isLoading } = useQuery<PayrollSummary[]>({
    queryKey: ["/api/staff-payroll/summary", month],
    queryFn: () => fetch(`/api/staff-payroll/summary?month=${month}`).then((r) => r.json()),
  });

  const [salaryDialog, setSalaryDialog] = useState<{ userId: number; name: string; salary: string } | null>(null);
  const [entryDialog, setEntryDialog] = useState<{
    userId: number;
    name: string;
    type: string;
    amount: string;
    date: string;
    note: string;
  } | null>(null);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  const salaryMut = useMutation({
    mutationFn: () => {
      if (!salaryDialog) return Promise.resolve();
      return fetch(`/api/users/${salaryDialog.userId}/salary`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salary: salaryDialog.salary }),
      }).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff-payroll/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setSalaryDialog(null);
      toast({ title: "Salary updated" });
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const addEntryMut = useMutation({
    mutationFn: async () => {
      if (!entryDialog) return;
      const res = await fetch("/api/staff-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: entryDialog.userId,
          type: entryDialog.type,
          amount: entryDialog.amount,
          date: entryDialog.date,
          month,
          note: entryDialog.note || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to add entry");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff-payroll/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      setEntryDialog(null);
      const t = entryDialog?.type;
      const expMsg = t === "advance" || t === "salary_payment" || t === "bonus"
        ? " (also added to expenses)" : "";
      toast({ title: `${t === "advance" ? "Advance" : t === "salary_payment" ? "Salary payment" : t === "bonus" ? "Bonus" : "Entry"} recorded${expMsg}` });
    },
    onError: (err: Error) => toast({ title: err.message || "Failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/staff-payroll/${id}`, { method: "DELETE" }).then((r) => { if (!r.ok) throw new Error(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff-payroll/summary"] });
      toast({ title: "Entry removed" });
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const activeUsers = users.filter((u: User) => u.active);
  const today = new Date().toISOString().slice(0, 10);

  const typeLabel = (t: string) => {
    const map: Record<string, string> = {
      advance: "Advance",
      salary_payment: "Salary Paid",
      deduction: "Deduction",
      bonus: "Bonus",
    };
    return map[t] || t;
  };

  const typeBadgeClass = (t: string) => {
    const map: Record<string, string> = {
      advance: "text-orange-600 border-orange-200 bg-orange-50",
      salary_payment: "text-green-600 border-green-200 bg-green-50",
      deduction: "text-rose-600 border-rose-200 bg-rose-50",
      bonus: "text-blue-600 border-blue-200 bg-blue-50",
    };
    return map[t] || "text-slate-600 border-slate-200 bg-slate-50";
  };

  return (
    <AccordionItem value="payroll" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
            <Wallet className="w-[18px] h-[18px] text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Staff Payroll</span>
            <span className="text-xs text-muted-foreground font-normal">Salaries, advances, deductions, monthly summary</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-5 pt-2 pb-4">
          {/* Pay-date reminder */}
          {(() => {
            const today = new Date();
            const dayOfMonth = today.getDate();
            const isCurrentMonth = month === today.toISOString().slice(0, 7);
            const daysUntilPayday = isCurrentMonth ? (dayOfMonth <= 10 ? 10 - dayOfMonth : -1) : -1;
            if (!isCurrentMonth) return null;
            return (
              <div className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                daysUntilPayday === 0
                  ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 text-green-700 dark:text-green-400 border border-green-200/60 dark:border-green-800/40"
                  : daysUntilPayday > 0
                    ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40"
                    : "bg-muted/30 text-muted-foreground border border-border/40"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  daysUntilPayday === 0 ? "bg-green-100 dark:bg-green-900/40" : daysUntilPayday > 0 ? "bg-amber-100 dark:bg-amber-900/40" : "bg-muted"
                )}>
                  {daysUntilPayday === 0 ? <CalendarCheck className="w-4 h-4" /> : daysUntilPayday > 0 ? <Clock className="w-4 h-4" /> : <CalendarCheck className="w-4 h-4" />}
                </div>
                <div>
                  <span className="block text-[13px] font-semibold">
                    {daysUntilPayday === 0
                      ? "Today is salary pay day"
                      : daysUntilPayday > 0
                        ? `Pay day in ${daysUntilPayday} day${daysUntilPayday > 1 ? "s" : ""}`
                        : "Pay day has passed this month"}
                  </span>
                  <span className="block text-[11px] opacity-70 font-normal">Salaries are due on the 10th of each month</span>
                </div>
              </div>
            );
          })()}

          {/* Month selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium text-muted-foreground">Month</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-44 h-9"
              />
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {summary.length} staff
            </Badge>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <span className="text-sm">Loading payroll data...</span>
            </div>
          ) : summary.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Wallet className="w-7 h-7 opacity-40" />
              </div>
              <p className="text-sm font-medium">No staff with salary configured</p>
              <p className="text-xs mt-1 text-muted-foreground/70">Set salary for staff members below to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {summary.map((s, idx) => {
                const paidPercent = s.netSalary > 0 ? Math.min(100, Math.round((s.salaryPaid / s.netSalary) * 100)) : 0;
                const deductPercent = s.baseSalary > 0 ? Math.round(((s.advances + s.deductions) / s.baseSalary) * 100) : 0;
                return (
                <motion.div
                  key={s.userId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="border border-border/40 rounded-2xl overflow-hidden bg-gradient-to-b from-white to-muted/10 dark:from-card dark:to-muted/5 shadow-sm"
                >
                  {/* Summary row */}
                  <div
                    className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedUser(expandedUser === s.userId ? null : s.userId)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 flex items-center justify-center font-semibold text-emerald-700 dark:text-emerald-400 text-sm">
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-semibold text-sm block">{s.name}</span>
                        <span className="text-[11px] text-muted-foreground capitalize">{s.role} · {s.baseSalary.toLocaleString()} QAR/mo</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {s.advances > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800/40 dark:text-orange-400 text-[11px] font-mono">
                                -{s.advances.toLocaleString()}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Advances taken this month</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <div className="text-right min-w-[80px]">
                        <span className={cn(
                          "font-mono font-bold text-[15px]",
                          s.remaining > 0 ? "text-emerald-600 dark:text-emerald-400" : s.remaining < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                        )}>
                          {s.remaining.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">remaining</span>
                      </div>
                    </div>
                  </div>

                  {/* Salary progress bar */}
                  <div className="px-4 pb-3 -mt-1">
                    <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          paidPercent >= 100 ? "bg-emerald-500" : paidPercent > 0 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : ""
                        )}
                        style={{ width: `${paidPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground font-mono">{paidPercent}% paid</span>
                      {deductPercent > 0 && <span className="text-[10px] text-orange-500 font-mono">{deductPercent}% deducted</span>}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedUser === s.userId && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="border-t border-border/30 bg-muted/5 px-4 py-4 space-y-4"
                    >
                      {/* Salary breakdown — visual cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/40 dark:to-slate-800/20 border border-slate-200/60 dark:border-slate-700/40 px-3 py-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <CircleDollarSign className="w-3 h-3 text-slate-500" />
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Base</span>
                          </div>
                          <p className="font-mono font-bold text-sm">{s.baseSalary.toLocaleString()}</p>
                        </div>
                        {s.advances > 0 && (
                          <div className="rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-900/10 border border-orange-200/60 dark:border-orange-800/40 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <TrendingDown className="w-3 h-3 text-orange-500" />
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Advances</span>
                            </div>
                            <p className="font-mono font-bold text-sm text-orange-600 dark:text-orange-400">-{s.advances.toLocaleString()}</p>
                          </div>
                        )}
                        {s.deductions > 0 && (
                          <div className="rounded-xl bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-900/20 dark:to-rose-900/10 border border-rose-200/60 dark:border-rose-800/40 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <TrendingDown className="w-3 h-3 text-rose-500" />
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Deductions</span>
                            </div>
                            <p className="font-mono font-bold text-sm text-rose-600 dark:text-rose-400">-{s.deductions.toLocaleString()}</p>
                          </div>
                        )}
                        {s.bonuses > 0 && (
                          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/50 dark:from-blue-900/20 dark:to-indigo-900/10 border border-blue-200/60 dark:border-blue-800/40 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Plus className="w-3 h-3 text-blue-500" />
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Bonuses</span>
                            </div>
                            <p className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">+{s.bonuses.toLocaleString()}</p>
                          </div>
                        )}
                        <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-green-100/50 dark:from-emerald-900/20 dark:to-green-900/10 border border-emerald-200/60 dark:border-emerald-800/40 px-3 py-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Wallet className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Net Salary</span>
                          </div>
                          <p className="font-mono font-bold text-sm">{s.netSalary.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-100/50 dark:from-green-900/20 dark:to-emerald-900/10 border border-green-200/60 dark:border-green-800/40 px-3 py-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Paid</span>
                          </div>
                          <p className="font-mono font-bold text-sm text-green-600 dark:text-green-400">{s.salaryPaid.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 rounded-lg border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-800/40 dark:text-orange-400 dark:hover:bg-orange-950/30"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "advance", amount: "", date: today, note: "" })}>
                          <ArrowDownCircle className="w-3.5 h-3.5" /> Advance
                        </Button>
                        <Button size="sm" className="gap-1.5 text-xs h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "salary_payment", amount: String(s.remaining > 0 ? s.remaining : 0), date: today, note: "" })}>
                          <Banknote className="w-3.5 h-3.5" /> Pay Salary
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 rounded-lg"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "deduction", amount: "", date: today, note: "" })}>
                          Deduction
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800/40 dark:text-blue-400 dark:hover:bg-blue-950/30"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "bonus", amount: "", date: today, note: "" })}>
                          Bonus
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-8 rounded-lg ml-auto text-muted-foreground hover:text-foreground"
                          onClick={() => setSalaryDialog({ userId: s.userId, name: s.name, salary: String(s.baseSalary) })}>
                          <Cog className="w-3.5 h-3.5" /> Edit Salary
                        </Button>
                      </div>

                      {/* Entry log — timeline style */}
                      {s.entries.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1">Transaction Log</span>
                          <div className="rounded-xl border border-border/30 overflow-hidden">
                            {s.entries.map((e, eIdx) => {
                              const colorMap: Record<string, string> = {
                                advance: "border-l-orange-400",
                                salary_payment: "border-l-emerald-400",
                                deduction: "border-l-rose-400",
                                bonus: "border-l-blue-400",
                              };
                              return (
                                <div key={e.id} className={cn(
                                  "flex items-center justify-between px-3 py-2.5 text-xs border-l-[3px] transition-colors hover:bg-muted/20",
                                  colorMap[e.type] || "border-l-slate-300",
                                  eIdx > 0 && "border-t border-border/20"
                                )}>
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="font-mono text-muted-foreground text-[11px] shrink-0">{e.date}</span>
                                    <Badge variant="outline" className={cn("text-[10px] shrink-0", typeBadgeClass(e.type))}>
                                      {typeLabel(e.type)}
                                    </Badge>
                                    {e.note && <span className="text-muted-foreground truncate hidden sm:block">{e.note}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono font-semibold">
                                      {Number(e.amount).toLocaleString()}
                                    </span>
                                    <button
                                      onClick={(ev) => { ev.stopPropagation(); deleteMut.mutate(e.id); }}
                                      className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded-md hover:bg-destructive/10"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
                );
              })}
            </div>
          )}

          {/* Set salary for users who don't have one yet */}
          {activeUsers.filter((u: User) => !summary.find((s) => s.userId === u.id)).length > 0 && (
            <div className="border-t border-border/30 pt-5 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-muted/60 flex items-center justify-center">
                  <Plus className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-sm font-semibold">Configure Salary</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Staff without salary configured:</p>
              <div className="flex flex-wrap gap-2">
                {activeUsers
                  .filter((u: User) => !summary.find((s) => s.userId === u.id))
                  .map((u: User) => (
                    <Button
                      key={u.id}
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 gap-1.5 rounded-lg hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50 dark:hover:border-emerald-700 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/20 transition-colors"
                      onClick={() => setSalaryDialog({ userId: u.id, name: u.name, salary: "0" })}
                    >
                      <Plus className="w-3 h-3" />
                      {u.name}
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Salary config dialog */}
        <Dialog open={!!salaryDialog} onOpenChange={(v) => { if (!v) setSalaryDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Salary — {salaryDialog?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Field label="Monthly Salary (QAR)">
                <Input
                  type="number"
                  min="0"
                  value={salaryDialog?.salary || ""}
                  onChange={(e) => setSalaryDialog((d) => d ? { ...d, salary: e.target.value } : null)}
                  placeholder="0"
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSalaryDialog(null)}>Cancel</Button>
              <Button
                onClick={() => salaryMut.mutate()}
                disabled={salaryMut.isPending}
                className="gap-2"
              >
                {salaryMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add entry dialog */}
        <Dialog open={!!entryDialog} onOpenChange={(v) => { if (!v) setEntryDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {entryDialog ? `${typeLabel(entryDialog.type)} — ${entryDialog.name}` : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Field label="Date">
                <Input
                  type="date"
                  value={entryDialog?.date || ""}
                  onChange={(e) => setEntryDialog((d) => d ? { ...d, date: e.target.value } : null)}
                />
              </Field>
              <Field label={`Amount (QAR)${entryDialog?.type === "advance" ? " — max 500" : ""}`}>
                <Input
                  type="number"
                  min="0"
                  max={entryDialog?.type === "advance" ? 500 : undefined}
                  value={entryDialog?.amount || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (entryDialog?.type === "advance" && Number(val) > 500) return;
                    setEntryDialog((d) => d ? { ...d, amount: val } : null);
                  }}
                  placeholder="0"
                />
                {entryDialog?.type === "advance" && (
                  <p className="text-xs text-orange-600 mt-1">This advance will also be recorded as an expense.</p>
                )}
              </Field>
              <Field label="Note (optional)">
                <Input
                  value={entryDialog?.note || ""}
                  onChange={(e) => setEntryDialog((d) => d ? { ...d, note: e.target.value } : null)}
                  placeholder="Reason..."
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEntryDialog(null)}>Cancel</Button>
              <Button
                onClick={() => addEntryMut.mutate()}
                disabled={addEntryMut.isPending || !entryDialog?.amount}
                className="gap-2"
              >
                {addEntryMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AccordionContent>
    </AccordionItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 4 — Document Settings
════════════════════════════════════════════════════════════════════ */
function Section4({ toast, qc }: { toast: any; qc: any }) {
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  const [taxRate, setTaxRate] = useState<string>("0");
  const [returnPolicy, setReturnPolicy] = useState("");
  const [largeOrderThreshold, setLargeOrderThreshold] = useState<string>("");
  const [showPoField, setShowPoField] = useState<boolean>(true);
  const initialized4 = useRef(false);

  useEffect(() => {
    if (settings && !initialized4.current) {
      initialized4.current = true;
      setTaxRate(String(settings.taxRate ?? 0));
      setReturnPolicy(settings.returnPolicyText ?? "");
      setLargeOrderThreshold(String(settings.largeOrderThreshold ?? ""));
      setShowPoField(settings.showPoField !== false);
    }
  }, [settings]);

  const mut = useMutation({
    mutationFn: (body: Partial<Settings>) =>
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      initialized4.current = false;
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Document settings saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleSave = () =>
    mut.mutate({
      taxRate: Number(taxRate),
      returnPolicyText: returnPolicy,
      largeOrderThreshold: Number(largeOrderThreshold),
      showPoField,
    });

  return (
    <AccordionItem value="documents" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center shrink-0">
            <FileText className="w-[18px] h-[18px] text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Document Settings</span>
            <span className="text-xs text-muted-foreground font-normal">Tax rate, return policy, thresholds</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-6 pt-2 pb-4">
            {/* Starting numbers — info only */}
            <div className="bg-muted/30 rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Document Starting Numbers (managed at DB level)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Invoice", value: "100360" },
                  { label: "Quotation", value: "197235" },
                  { label: "Delivery Note", value: "297333" },
                  { label: "Credit Note", value: "100001" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-border rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-mono font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Tax Rate (%)">
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    %
                  </span>
                </div>
              </Field>
              <Field label="Large Order Threshold (QAR)">
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    value={largeOrderThreshold}
                    onChange={(e) => setLargeOrderThreshold(e.target.value)}
                    className="pr-14"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    QAR
                  </span>
                </div>
              </Field>
            </div>

            {/* PO field toggle — most invoices don't need a PO number */}
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50">
              <span>
                <span className="text-sm font-medium block">Show “PO Number” on the invoice builder</span>
                <span className="text-xs text-muted-foreground">Turn off if you rarely take a customer PO — the field is hidden on new invoices.</span>
              </span>
              <input type="checkbox" checked={showPoField} onChange={(e) => setShowPoField(e.target.checked)} className="w-5 h-5 accent-[#1e2a3a] shrink-0" />
            </label>

            <Field label="Return Policy Text">
              <Textarea
                value={returnPolicy}
                onChange={(e) => setReturnPolicy(e.target.value)}
                rows={4}
                placeholder="Describe your return and exchange policy…"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Printed on invoices and shown to customers.
              </p>
            </Field>

            <div className="flex justify-end">
              <SectionSaveBtn loading={mut.isPending} onClick={handleSave} />
            </div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 5 — Brands
════════════════════════════════════════════════════════════════════ */
function Section5({ toast, qc }: { toast: any; qc: any }) {
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  const [brands, setBrands] = useState<string[]>([]);
  const initialized5 = useRef(false);

  useEffect(() => {
    if (settings && !initialized5.current) {
      initialized5.current = true;
      setBrands(settings.brands || []);
    }
  }, [settings]);

  const mut = useMutation({
    mutationFn: (body: Partial<Settings>) =>
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      initialized5.current = false;
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Brands saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const addBrand = () => setBrands((b) => [...b, ""]);
  const removeBrand = (i: number) => setBrands((b) => b.filter((_, idx) => idx !== i));
  const updateBrand = (i: number, val: string) =>
    setBrands((b) => b.map((x, idx) => (idx === i ? val : x)));
  const moveUp = (i: number) => {
    if (i === 0) return;
    setBrands((b) => {
      const arr = [...b];
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      return arr;
    });
  };
  const moveDown = (i: number) => {
    if (i === brands.length - 1) return;
    setBrands((b) => {
      const arr = [...b];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      return arr;
    });
  };

  return (
    <AccordionItem value="brands" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
            <Tag className="w-[18px] h-[18px] text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Brands</span>
            <span className="text-xs text-muted-foreground font-normal">Product brand list and ordering</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4 pt-2 pb-4">
            <p className="text-sm text-muted-foreground">
              Brands displayed on the invoice footer. Drag to reorder.
            </p>
            <div className="space-y-2">
              {brands.map((brand, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(i)}
                      disabled={i === brands.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Input
                    value={brand}
                    onChange={(e) => updateBrand(i, e.target.value)}
                    placeholder={`Brand ${i + 1}`}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeBrand(i)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {brands.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No brands added yet.</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={addBrand} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              Add Brand
            </Button>
            <div className="flex justify-end pt-2">
              <SectionSaveBtn
                loading={mut.isPending}
                onClick={() => mut.mutate({ brands: brands.filter((b) => b.trim()) })}
              />
            </div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 6 — Social Media
════════════════════════════════════════════════════════════════════ */
function Section6({ toast, qc }: { toast: any; qc: any }) {
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  const [form, setForm] = useState({ youtube: "", tiktok: "", instagram: "", facebook: "" });
  const initialized6 = useRef(false);

  useEffect(() => {
    if (settings && !initialized6.current) {
      initialized6.current = true;
      setForm({
        youtube: settings.youtube || "",
        tiktok: settings.tiktok || "",
        instagram: settings.instagram || "",
        facebook: settings.facebook || "",
      });
    }
  }, [settings]);

  const mut = useMutation({
    mutationFn: (body: Partial<Settings>) =>
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      initialized6.current = false;
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Social media links saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const socialFields: { key: keyof typeof form; label: string; placeholder: string }[] = [
    { key: "youtube", label: "YouTube", placeholder: "@MamunTrading or full URL" },
    { key: "tiktok", label: "TikTok", placeholder: "@mamuntrading" },
    { key: "instagram", label: "Instagram", placeholder: "@mamuntrading" },
    { key: "facebook", label: "Facebook", placeholder: "facebook.com/mamuntrading" },
  ];

  return (
    <AccordionItem value="social" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-pink-50 dark:bg-pink-950/40 flex items-center justify-center shrink-0">
            <Share2 className="w-[18px] h-[18px] text-pink-600 dark:text-pink-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Social Media</span>
            <span className="text-xs text-muted-foreground font-normal">YouTube, TikTok, Instagram, Facebook links</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4 pt-2 pb-4">
            <p className="text-sm text-muted-foreground">
              Handles or URLs shown on invoices and customer communications.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {socialFields.map(({ key, label, placeholder }) => (
                <Field key={key} label={label}>
                  <Input value={form[key]} onChange={set(key)} placeholder={placeholder} />
                </Field>
              ))}
            </div>
            <div className="flex justify-end">
              <SectionSaveBtn loading={mut.isPending} onClick={() => mut.mutate(form)} />
            </div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 7 — Messaging Settings
════════════════════════════════════════════════════════════════════ */
function Section7({ toast, qc }: { toast: any; qc: any }) {
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  const [form, setForm] = useState({
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    maxMessagesPerDay: "3",
    autoQueueMessages: false,
  });
  const initialized7 = useRef(false);

  useEffect(() => {
    if (settings && !initialized7.current) {
      initialized7.current = true;
      setForm({
        quietHoursStart: settings.quietHoursStart ?? "22:00",
        quietHoursEnd: settings.quietHoursEnd ?? "08:00",
        maxMessagesPerDay: String(settings.maxMessagesPerDay ?? 3),
        autoQueueMessages: settings.autoQueueMessages ?? false,
      });
    }
  }, [settings]);

  const mut = useMutation({
    mutationFn: (body: Partial<Settings>) =>
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      initialized7.current = false;
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Messaging settings saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleSave = () =>
    mut.mutate({
      quietHoursStart: form.quietHoursStart,
      quietHoursEnd: form.quietHoursEnd,
      maxMessagesPerDay: Number(form.maxMessagesPerDay),
      autoQueueMessages: form.autoQueueMessages,
    });

  return (
    <AccordionItem value="messaging" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center shrink-0">
            <MessageSquare className="w-[18px] h-[18px] text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Messaging Settings</span>
            <span className="text-xs text-muted-foreground font-normal">Quiet hours, rate limits, auto-queue</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-6 pt-2 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Quiet Hours Start">
                <Input
                  type="time"
                  value={form.quietHoursStart}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quietHoursStart: e.target.value }))
                  }
                />
              </Field>
              <Field label="Quiet Hours End">
                <Input
                  type="time"
                  value={form.quietHoursEnd}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quietHoursEnd: e.target.value }))
                  }
                />
              </Field>
              <Field label="Max Messages per Customer / Day">
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={form.maxMessagesPerDay}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxMessagesPerDay: e.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium">Auto-Queue Messages on App Open</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically build a WhatsApp message queue when you open the Messages page.
                </p>
              </div>
              <Switch
                checked={form.autoQueueMessages}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, autoQueueMessages: v }))
                }
              />
            </div>

            <div className="flex justify-end">
              <SectionSaveBtn loading={mut.isPending} onClick={handleSave} />
            </div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 8 — Data
════════════════════════════════════════════════════════════════════ */
function Section8({ toast }: { toast: any }) {
  const [syncing, setSyncing] = useState(false);
  const customersImportRef = useRef<HTMLInputElement>(null);

  /* Generic CSV download of a given endpoint */
  const downloadCSV = async (endpoint: string, filename: string) => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        toast({ title: "No data to export", variant: "destructive" });
        return;
      }
      const headers = Object.keys(data[0]);
      const rows = data.map((row: Record<string, unknown>) =>
        headers
          .map((h) => {
            const val = row[h];
            const str = val === null || val === undefined ? "" : String(val);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${filename} downloaded` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const exportAll = async () => {
    const exports = [
      { endpoint: "/api/customers", filename: "customers.csv" },
      { endpoint: "/api/products", filename: "products.csv" },
      { endpoint: "/api/inventory", filename: "inventory.csv" },
      { endpoint: "/api/suppliers", filename: "suppliers.csv" },
      { endpoint: "/api/documents?type=INV", filename: "invoices.csv" },
    ];
    for (const { endpoint, filename } of exports) {
      await downloadCSV(endpoint, filename);
    }
    toast({ title: "All data exported" });
  };

  const handleImport = async (
    file: File,
    endpoint: string,
    fieldName: string
  ) => {
    const formData = new FormData();
    formData.append(fieldName, file);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Import failed");
      const result = await res.json();
      const ok = (result.created ?? 0) + (result.updated ?? 0);
      const rejectedCount = result.rejectedCount ?? (result.rejected?.length ?? 0);
      if (rejectedCount > 0) {
        const preview = (result.rejected || []).slice(0, 5)
          .map((r: any) => `Row ${r.row}${r.sku ? ` (${r.sku})` : r.name ? ` (${r.name})` : ""}: ${r.reason}`)
          .join("\n");
        toast({
          title: `${ok} imported · ${rejectedCount} rejected`,
          description: `Rejected rows were skipped (fix and re-import):\n${preview}${rejectedCount > 5 ? `\n…and ${rejectedCount - 5} more` : ""}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Import successful",
          description: `${result.created ?? 0} added, ${result.updated ?? 0} updated${result.imported != null ? ` (${result.imported} imported)` : ""}.`,
        });
      }
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    }
  };

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      await flushSyncQueue();
      toast({ title: "Sync complete", description: "All pending changes have been pushed." });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AccordionItem value="data" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800/40 flex items-center justify-center shrink-0">
            <Database className="w-[18px] h-[18px] text-slate-600 dark:text-slate-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">Data</span>
            <span className="text-xs text-muted-foreground font-normal">Export, import, sync operations</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-6 pt-2 pb-4">
          {/* Export */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">Export Data</p>
            <p className="text-xs text-muted-foreground">
              Download all store data as CSV files (customers, products, inventory, suppliers, invoices).
            </p>
            <Button variant="outline" size="sm" onClick={exportAll} className="gap-2">
              <Download className="w-3.5 h-3.5" />
              Export All Data CSV
            </Button>
          </div>

          {/* Import Products — moved to Inventory, which is where the location is chosen */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">Import Products</p>
            <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p>
                Product import now lives on the <span className="font-medium text-foreground">Inventory</span> page, so
                the file can be previewed and the stock location chosen before anything is saved.
              </p>
            </div>
            <Link href="/inventory">
              <Button variant="outline" size="sm" className="gap-2">
                <Upload className="w-3.5 h-3.5" />
                Go to Inventory
              </Button>
            </Link>
          </div>

          {/* Import Customers */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">Import Customers</p>
            <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Expected CSV columns:</p>
              <p>
                <code>name, phone, type, creditLimit, trn, address, notes</code>
              </p>
              <p>Type: walk-in | contractor | corporate | government</p>
            </div>
            <input
              type="file"
              accept=".csv"
              ref={customersImportRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file, "/api/customers/import", "file");
                if (customersImportRef.current) customersImportRef.current.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => customersImportRef.current?.click()}
              className="gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Customers CSV
            </Button>
          </div>

          {/* Force Sync */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">Offline Sync</p>
            <p className="text-xs text-muted-foreground">
              Push any offline-queued changes to the server immediately.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleForceSync}
              disabled={syncing}
              className="gap-2"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Force Sync
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 9 — About
════════════════════════════════════════════════════════════════════ */
function Section9({ toast }: { toast: any }) {
  const { data: about } = useSettings();
  const [connStatus, setConnStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");

  const testConnection = async () => {
    setConnStatus("loading");
    try {
      const res = await fetch("/api/settings");
      setConnStatus(res.ok ? "ok" : "fail");
      if (!res.ok) toast({ title: "Connection failed", variant: "destructive" });
      else toast({ title: "Connected", description: "API server is responding." });
    } catch {
      setConnStatus("fail");
      toast({ title: "Connection failed", variant: "destructive" });
    }
  };

  const buildDate = "2025-06-20";

  return (
    <AccordionItem value="about" className="bg-white dark:bg-card rounded-2xl border border-border/40 px-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200">
      <AccordionTrigger className="hover:no-underline py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
            <Info className="w-[18px] h-[18px] text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-[15px] block leading-tight">About</span>
            <span className="text-xs text-muted-foreground font-normal">App version, system info, connection test</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-6 pt-2 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-xl p-4 space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Application
              </p>
              <div className="space-y-1.5 text-sm">
                <Row label="Name" value="MTC POS+CRM" />
                <Row label="Version" value="v1.0.0" />
                <Row label="Build Date" value={buildDate} />
                <Row label="Company" value={about?.storeNameEn || "—"} />
              </div>
            </div>

            <div className="bg-muted/30 rounded-xl p-4 space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                System
              </p>
              <div className="space-y-1.5 text-sm">
                <Row label="Frontend" value="React 18 + Vite + TypeScript" />
                <Row label="Backend" value="Express 5 + Drizzle ORM" />
                <Row label="Database" value="PostgreSQL" />
                <Row label="Currency" value="QAR (Qatari Riyal)" />
              </div>
            </div>
          </div>

          {/* Connection test */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={connStatus === "loading"}
              className="gap-2"
            >
              {connStatus === "loading" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Test Connection
            </Button>
            {connStatus === "ok" && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                API is reachable
              </span>
            )}
            {connStatus === "fail" && (
              <span className="flex items-center gap-1.5 text-sm text-red-500">
                <XCircle className="w-4 h-4" />
                Connection failed
              </span>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
