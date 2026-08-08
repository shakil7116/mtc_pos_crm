import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import DocumentNumberingSettings from "@/components/DocumentNumberingSettings";
import BusinessRulesSettings from "@/components/BusinessRulesSettings";
import LocationHierarchySettings from "@/components/LocationHierarchySettings";
import ManagedListsSettings from "@/components/ManagedListsSettings";
import CustomFieldsSettings from "@/components/CustomFieldsSettings";
import { flushSyncQueue } from "@/lib/offline";

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
  CalendarOff,
  Banknote,
  ArrowDownCircle,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────── */
type Settings = {
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
  role: string; // admin | manager | warehouse | salesman | driver
  storeId: number | null;
  active: boolean;
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
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          System configuration for MTC POS+CRM
        </p>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {/* S1 — Company Info */}
        <Section1 toast={toast} qc={qc} />
        {/* S2 — Stores */}
        <Section2 toast={toast} qc={qc} />
        {/* S3 — Staff */}
        <Section3 toast={toast} qc={qc} currentUserId={user.id} />
        {/* S3b — Staff Payroll */}
        <StaffPayrollSection toast={toast} qc={qc} />
        {/* S4 — Document Settings */}
        <Section4 toast={toast} qc={qc} />
        {/* S4b — Document Numbering (Phase 3 Step 1) */}
        <DocumentNumberingSettings />
        {/* S4c — Business Rules (Phase 4, spec 11A) */}
        <BusinessRulesSettings />
        {/* S4d — Location Hierarchy (Phase 5, spec rule 22/23) */}
        <LocationHierarchySettings />
        {/* S4e — Lists & Categories (Phase 6, spec 11B) */}
        <ManagedListsSettings />
        {/* S4f — Custom Fields (Phase 7, spec 11C) */}
        <CustomFieldsSettings />
        {/* S5 — Brands */}
        <Section5 toast={toast} qc={qc} />
        {/* S6 — Social Media */}
        <Section6 toast={toast} qc={qc} />
        {/* S7 — Messaging */}
        <Section7 toast={toast} qc={qc} />
        {/* S8 — Data */}
        <Section8 toast={toast} />
        {/* S9 — About */}
        <Section9 toast={toast} />
      </Accordion>
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

  useEffect(() => {
    if (settings) {
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
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Company info saved" });
    },
    onError: () =>
      toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setLogoPreview(url);
      setForm((f) => ({ ...f, logoUrl: url }));
    };
    reader.readAsDataURL(file);
  };

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AccordionItem value="company" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Building2 className="w-4 h-4 text-[#d4a017]" />
          Company Information
        </span>
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

  const startEdit = (store: Store) => {
    setEditId(store.id);
    setEditForm({ nameEn: store.nameEn, nameAr: store.nameAr, address: store.address, type: store.type, ownerStoreId: store.ownerStoreId ?? null, active: store.active });
  };

  return (
    <AccordionItem value="stores" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Store className="w-4 h-4 text-[#d4a017]" />
          Stores & Warehouses
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2 pb-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {stores.length} location{stores.length !== 1 ? "s" : ""} configured
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              Add Location
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {stores.map((store) => (
                <div key={store.id} className={`border rounded-xl p-4 transition-opacity ${store.active ? "" : "opacity-60"}`}>
                  {editId === store.id ? (
                    /* Inline edit */
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Name (English)">
                          <Input
                            value={editForm.nameEn || ""}
                            onChange={(e) => setEditForm((f) => ({ ...f, nameEn: e.target.value }))}
                          />
                        </Field>
                        <Field label="الاسم (Arabic)" dir="rtl">
                          <Input
                            value={editForm.nameAr || ""}
                            onChange={(e) => setEditForm((f) => ({ ...f, nameAr: e.target.value }))}
                            className="font-arabic"
                          />
                        </Field>
                        <Field label="Address">
                          <Input
                            value={editForm.address || ""}
                            onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                          />
                        </Field>
                        <Field label="Type">
                          <Select
                            value={editForm.type}
                            onValueChange={(v: "store" | "warehouse") =>
                              setEditForm((f) => ({ ...f, type: v }))
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
                        {editForm.type === "warehouse" && (
                          <Field label="Owned by">
                            <Select
                              value={editForm.ownerStoreId != null ? String(editForm.ownerStoreId) : "common"}
                              onValueChange={(v) => setEditForm((f) => ({ ...f, ownerStoreId: v === "common" ? null : Number(v) }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="common">Common (shared)</SelectItem>
                                {stores.filter((s) => s.type === "store").map((s) => (
                                  <SelectItem key={s.id} value={String(s.id)}>{s.nameEn}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                        )}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateMut.mutate({ id: store.id, ...editForm })}
                          disabled={updateMut.isPending}
                          className="gap-2"
                        >
                          {updateMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Display row */
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {store.type === "store" ? (
                            <Store className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Warehouse className="w-4 h-4 text-purple-500" />
                          )}
                          <span className="font-medium">{store.nameEn}</span>
                          <span className="text-muted-foreground font-arabic text-sm">
                            {store.nameAr}
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              store.type === "store"
                                ? "text-blue-600 border-blue-200 bg-blue-50"
                                : "text-purple-600 border-purple-200 bg-purple-50"
                            }
                          >
                            {store.type === "store" ? "Store" : "Warehouse"}
                          </Badge>
                          {!store.active && (
                            <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{store.address}</p>
                        {store.type === "warehouse" && (
                          <p className="text-[11px] text-purple-600 font-medium">
                            Owned by: {store.ownerStoreId != null ? (stores.find((s) => s.id === store.ownerStoreId)?.nameEn ?? `#${store.ownerStoreId}`) : "Common (shared)"}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(store)}>
                          Edit
                        </Button>
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={store.active}
                            onCheckedChange={() => toggleActive(store)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {store.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
                      {stores.filter((s) => s.type === "store").map((s) => (
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

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    role: "salesman" as string,
    storeId: "" as string,
    pin: "",
  });

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

  const addMut = useMutation({
    mutationFn: (body: typeof addForm) =>
      fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, storeId: body.storeId ? Number(body.storeId) : null }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setAddOpen(false);
      setAddForm({ name: "", role: "salesman", storeId: "", pin: "" });
      toast({ title: "Staff member added" });
    },
    onError: () => toast({ title: "Failed to add staff", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: Partial<User> & { id: number; pin?: string }) =>
      fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setPinDialog(null);
      setNewPin("");
      setAdminVerifyPin("");
      toast({ title: "User updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
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

  const storeName = (id: number | null) => {
    if (!id) return "All stores";
    return stores.find((s) => s.id === id)?.nameEn || `Store ${id}`;
  };

  const handlePinSave = async () => {
    if (!pinDialog) return;
    if (newPin.length < 4 || newPin.length > 6) {
      toast({ title: "PIN must be 4–6 digits", variant: "destructive" });
      return;
    }
    // Require admin PIN verification when changing another admin's PIN
    if (pinDialog.targetIsAdmin && pinDialog.userId !== currentUserId) {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, pin: adminVerifyPin }),
      });
      if (!res.ok) {
        toast({ title: "Incorrect admin PIN", variant: "destructive" });
        return;
      }
    }
    updateMut.mutate({ id: pinDialog.userId, pin: newPin });
  };

  return (
    <AccordionItem value="staff" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Users className="w-4 h-4 text-[#d4a017]" />
          Staff Management
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2 pb-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              Add Staff
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell no-uppercase">Username</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Store</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {users.map((u) => (
                    <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell no-uppercase font-mono text-xs">{(u as any).username || "— not set —"}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            u.role === "admin"
                              ? "text-amber-600 border-amber-200 bg-amber-50"
                              : "text-slate-600 border-slate-200 bg-slate-50"
                          }
                        >
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {storeName(u.storeId)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            u.active
                              ? "text-green-600 border-green-200 bg-green-50"
                              : "text-red-500 border-red-200 bg-red-50"
                          }
                        >
                          {u.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 text-[#1e2a3a]"
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
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2"
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
                            Edit PIN
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2"
                            disabled={u.id === currentUserId}
                            onClick={() =>
                              updateMut.mutate({ id: u.id, active: !u.active })
                            }
                          >
                            {u.active ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Staff Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
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
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="warehouse_manager">Warehouse Manager</SelectItem>
                    <SelectItem value="warehouse">Warehouse Keeper</SelectItem>
                    <SelectItem value="salesman">Salesman</SelectItem>
                    <SelectItem value="salesman_helper">Helper Salesman</SelectItem>
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
                    <SelectValue placeholder="All stores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stores</SelectItem>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.nameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="PIN (4–6 digits)">
                <div className="relative">
                  <Input
                    type={showPin ? "text" : "password"}
                    value={addForm.pin}
                    onChange={(e) => setAddForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    placeholder="••••"
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
                disabled={addMut.isPending || !addForm.name || addForm.pin.length < 4}
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
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-muted-foreground">
                Set the username and a temporary password. On next login the staff member is
                forced to choose their own password — you never keep it.
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
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLoginDialog(null)}>Cancel</Button>
              <Button
                onClick={() => credMut.mutate()}
                disabled={
                  credMut.isPending ||
                  (loginPassword.length > 0 && loginPassword.length < 8) ||
                  (loginUsername.trim().toLowerCase() === (loginDialog?.currentUsername || "").toLowerCase() && !loginPassword) ||
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
  dayRate: number;
  advances: number;
  deductions: number;
  bonuses: number;
  daysOff: number;
  dayOffDeduction: number;
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

  const [salaryDialog, setSalaryDialog] = useState<{ userId: number; name: string; salary: string; dayRate: string } | null>(null);
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
        body: JSON.stringify({ salary: salaryDialog.salary, dayRate: salaryDialog.dayRate }),
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
    mutationFn: () => {
      if (!entryDialog) return Promise.resolve();
      return fetch("/api/staff-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: entryDialog.userId,
          type: entryDialog.type,
          amount: entryDialog.type === "day_off" ? "0" : entryDialog.amount,
          date: entryDialog.date,
          month,
          note: entryDialog.note || null,
        }),
      }).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff-payroll/summary"] });
      setEntryDialog(null);
      toast({ title: "Entry added" });
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
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
      day_off: "Day Off",
      salary_payment: "Salary Paid",
      deduction: "Deduction",
      bonus: "Bonus",
    };
    return map[t] || t;
  };

  const typeBadgeClass = (t: string) => {
    const map: Record<string, string> = {
      advance: "text-orange-600 border-orange-200 bg-orange-50",
      day_off: "text-red-600 border-red-200 bg-red-50",
      salary_payment: "text-green-600 border-green-200 bg-green-50",
      deduction: "text-rose-600 border-rose-200 bg-rose-50",
      bonus: "text-blue-600 border-blue-200 bg-blue-50",
    };
    return map[t] || "text-slate-600 border-slate-200 bg-slate-50";
  };

  return (
    <AccordionItem value="payroll" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Wallet className="w-4 h-4 text-[#d4a017]" />
          Staff Payroll
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2 pb-4">
          {/* Month selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">Month</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-44 h-9"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {summary.length} staff with payroll
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : summary.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No staff with salary configured.</p>
              <p className="text-xs mt-1">Set salary for staff members below.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {summary.map((s) => (
                <div key={s.userId} className="border rounded-xl overflow-hidden">
                  {/* Summary row */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedUser(expandedUser === s.userId ? null : s.userId)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="font-medium text-sm">{s.name}</span>
                        <Badge variant="outline" className="ml-2 text-xs text-slate-500 border-slate-200">{s.role}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-right hidden sm:block">
                        <span className="text-muted-foreground">Base: </span>
                        <span className="font-mono font-medium">{s.baseSalary.toLocaleString()} QAR</span>
                      </div>
                      {s.advances > 0 && (
                        <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                          -{s.advances.toLocaleString()} adv
                        </Badge>
                      )}
                      {s.daysOff > 0 && (
                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                          {s.daysOff}d off
                        </Badge>
                      )}
                      <div className="text-right min-w-[90px]">
                        <span className="text-muted-foreground text-xs">Remaining: </span>
                        <span className={`font-mono font-semibold ${s.remaining > 0 ? "text-green-600" : s.remaining < 0 ? "text-red-600" : "text-slate-500"}`}>
                          {s.remaining.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedUser === s.userId && (
                    <div className="border-t bg-muted/10 px-4 py-3 space-y-3">
                      {/* Summary numbers */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-white border rounded-lg px-3 py-2">
                          <p className="text-muted-foreground">Base Salary</p>
                          <p className="font-mono font-semibold text-sm">{s.baseSalary.toLocaleString()}</p>
                        </div>
                        <div className="bg-white border rounded-lg px-3 py-2">
                          <p className="text-muted-foreground">Day Rate</p>
                          <p className="font-mono font-semibold text-sm">{s.dayRate.toLocaleString()}</p>
                        </div>
                        <div className="bg-white border rounded-lg px-3 py-2">
                          <p className="text-muted-foreground">Days Off ({s.daysOff})</p>
                          <p className="font-mono font-semibold text-sm text-red-600">-{s.dayOffDeduction.toLocaleString()}</p>
                        </div>
                        <div className="bg-white border rounded-lg px-3 py-2">
                          <p className="text-muted-foreground">Advances</p>
                          <p className="font-mono font-semibold text-sm text-orange-600">-{s.advances.toLocaleString()}</p>
                        </div>
                        {s.deductions > 0 && (
                          <div className="bg-white border rounded-lg px-3 py-2">
                            <p className="text-muted-foreground">Deductions</p>
                            <p className="font-mono font-semibold text-sm text-rose-600">-{s.deductions.toLocaleString()}</p>
                          </div>
                        )}
                        {s.bonuses > 0 && (
                          <div className="bg-white border rounded-lg px-3 py-2">
                            <p className="text-muted-foreground">Bonuses</p>
                            <p className="font-mono font-semibold text-sm text-blue-600">+{s.bonuses.toLocaleString()}</p>
                          </div>
                        )}
                        <div className="bg-white border rounded-lg px-3 py-2">
                          <p className="text-muted-foreground">Net Salary</p>
                          <p className="font-mono font-semibold text-sm">{s.netSalary.toLocaleString()}</p>
                        </div>
                        <div className="bg-white border rounded-lg px-3 py-2">
                          <p className="text-muted-foreground">Paid</p>
                          <p className="font-mono font-semibold text-sm text-green-600">{s.salaryPaid.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "advance", amount: "", date: today, note: "" })}>
                          <ArrowDownCircle className="w-3 h-3" /> Advance
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "day_off", amount: "0", date: today, note: "" })}>
                          <CalendarOff className="w-3 h-3" /> Day Off
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "salary_payment", amount: String(s.remaining > 0 ? s.remaining : 0), date: today, note: "" })}>
                          <Banknote className="w-3 h-3" /> Pay Salary
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "deduction", amount: "", date: today, note: "" })}>
                          Deduction
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                          onClick={() => setEntryDialog({ userId: s.userId, name: s.name, type: "bonus", amount: "", date: today, note: "" })}>
                          Bonus
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-7 ml-auto"
                          onClick={() => setSalaryDialog({ userId: s.userId, name: s.name, salary: String(s.baseSalary), dayRate: String(s.dayRate) })}>
                          Edit Salary
                        </Button>
                      </div>

                      {/* Entry log */}
                      {s.entries.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Note</th>
                                <th className="px-3 py-2"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {s.entries.map((e) => (
                                <tr key={e.id}>
                                  <td className="px-3 py-2 font-mono">{e.date}</td>
                                  <td className="px-3 py-2">
                                    <Badge variant="outline" className={typeBadgeClass(e.type)}>
                                      {typeLabel(e.type)}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono">
                                    {e.type === "day_off" ? "—" : Number(e.amount).toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{e.note || "—"}</td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      onClick={() => deleteMut.mutate(e.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Set salary for users who don't have one yet */}
          {activeUsers.filter((u: User) => !summary.find((s) => s.userId === u.id)).length > 0 && (
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium mb-2">Configure Salary</p>
              <p className="text-xs text-muted-foreground mb-3">Staff without salary configured:</p>
              <div className="flex flex-wrap gap-2">
                {activeUsers
                  .filter((u: User) => !summary.find((s) => s.userId === u.id))
                  .map((u: User) => (
                    <Button
                      key={u.id}
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1.5"
                      onClick={() => setSalaryDialog({ userId: u.id, name: u.name, salary: "0", dayRate: "0" })}
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
              <Field label="Day Rate (QAR) — deducted per day off">
                <Input
                  type="number"
                  min="0"
                  value={salaryDialog?.dayRate || ""}
                  onChange={(e) => setSalaryDialog((d) => d ? { ...d, dayRate: e.target.value } : null)}
                  placeholder="0"
                />
              </Field>
              <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
                Day Rate is auto-calculated if left at 0: salary / 30.
              </div>
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
              {entryDialog?.type !== "day_off" && (
                <Field label="Amount (QAR)">
                  <Input
                    type="number"
                    min="0"
                    value={entryDialog?.amount || ""}
                    onChange={(e) => setEntryDialog((d) => d ? { ...d, amount: e.target.value } : null)}
                    placeholder="0"
                  />
                </Field>
              )}
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
                disabled={addEntryMut.isPending || (entryDialog?.type !== "day_off" && !entryDialog?.amount)}
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

  useEffect(() => {
    if (settings) {
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
    <AccordionItem value="documents" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <FileText className="w-4 h-4 text-[#d4a017]" />
          Document Settings
        </span>
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

  useEffect(() => {
    if (settings?.brands) {
      setBrands(settings.brands);
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
    <AccordionItem value="brands" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Tag className="w-4 h-4 text-[#d4a017]" />
          Brands
        </span>
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

  useEffect(() => {
    if (settings) {
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
    <AccordionItem value="social" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Share2 className="w-4 h-4 text-[#d4a017]" />
          Social Media
        </span>
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

  useEffect(() => {
    if (settings) {
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
    <AccordionItem value="messaging" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <MessageSquare className="w-4 h-4 text-[#d4a017]" />
          Messaging Settings
        </span>
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
  const productsImportRef = useRef<HTMLInputElement>(null);
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
      toast({
        title: "Import successful",
        description: `${result.imported ?? result.count ?? "?"} records imported.`,
      });
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
    <AccordionItem value="data" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Database className="w-4 h-4 text-[#d4a017]" />
          Data
        </span>
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

          {/* Import Products */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">Import Products</p>
            <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Expected CSV columns:</p>
              <p>
                <code>sku, name, category, unit, salePrice, costPrice, minStockQty</code>
              </p>
              <p>First row must be the header. All prices in QAR.</p>
            </div>
            <input
              type="file"
              accept=".csv"
              ref={productsImportRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file, "/api/products/import", "file");
                if (productsImportRef.current) productsImportRef.current.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => productsImportRef.current?.click()}
              className="gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Products CSV
            </Button>
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
    <AccordionItem value="about" className="bg-white rounded-xl border border-border/60 px-6 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-base">
          <Info className="w-4 h-4 text-[#d4a017]" />
          About
        </span>
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
                <Row label="Company" value="Mamun M Trading and Contracting W.L.L" />
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
