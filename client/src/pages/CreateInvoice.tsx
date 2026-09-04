// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useCreateInvoice } from "@/hooks/use-invoices";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2, Plus, Save, ArrowLeft, Mic, Square, Loader2, FileText, Upload } from "lucide-react";
import { Link } from "wouter";
import { InvoicePaper } from "@/components/InvoicePaper";
import { clsx } from "clsx";
import { apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/use-settings";
const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Required"),
  date: z.string(),
  customerName: z.string().optional(),
  receiverSignature: z.string().optional(),
  totalAmountWords: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1, "Description required"),
    quantity: z.coerce.string().min(1, "Qty required"),
    unit: z.string().min(1, "Unit required"),
    unitPrice: z.coerce.string().min(1, "Price required"),
    amount: z.coerce.string(),
    currency: z.string().optional(),
  })).min(1, "At least one item required"),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export default function CreateInvoice() {
  const { data: previewSettings } = useSettings();
  const [, setLocation] = useLocation();
  const createMutation = useCreateInvoice();
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastTranscript, setLastTranscript] = useState("");

  // Autocomplete state
  const [allProducts, setAllProducts] = useState<Array<{description: string, unit: string, unitPrice: string}>>([]);
  const [suggestions, setSuggestions] = useState<Array<{description: string, unit: string, unitPrice: string}>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [currentFieldIndex, setCurrentFieldIndex] = useState<number | null>(null);

  // Fetch all products with their last used unit and price
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await apiRequest("GET", "/api/invoices");
        const invoices = await res.json();
        const productMap = new Map<string, {unit: string, unitPrice: string, date: string}>();

        // Get most recent unit and price for each product
        invoices.forEach((inv: any) => {
          inv.items?.forEach((item: any) => {
            if (item.description) {
              const desc = item.description.toUpperCase();
              const existing = productMap.get(desc);
              // Keep most recent (first in sorted list)
              if (!existing) {
                productMap.set(desc, {
                  unit: item.unit || "PCS",
                  unitPrice: item.unitPrice || "0",
                  date: inv.date
                });
              }
            }
          });
        });

        const products = Array.from(productMap.entries()).map(([description, data]) => ({
          description,
          unit: data.unit,
          unitPrice: data.unitPrice
        })).sort((a, b) => a.description.localeCompare(b.description));

        setAllProducts(products);
      } catch (err) {
        console.error("Failed to fetch products:", err);
      }
    };
    fetchProducts();
  }, []);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString().split("T")[0],
      customerName: "",
      receiverSignature: "",
      totalAmountWords: "",
      items: [{ description: "", quantity: "1", unit: "PCS", unitPrice: "0", amount: "0", currency: "QAR" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const [template, setTemplate] = useState<"template1" | "template2" | "template3" | "template4" | "template5">("template1");
  const [docType, setDocType] = useState<"invoice" | "quotation" | "delivery_note">("invoice");
  // Auto-update number prefix when docType changes
  const updateNumberPrefix = (type: "invoice" | "quotation" | "delivery_note") => {
    const current = form.getValues("invoiceNumber");
    const num = current.replace(/^(INV-|QT-|DN-)/, "");
    const prefix = type === "quotation" ? "QT-" : type === "delivery_note" ? "DN-" : "INV-";
    form.setValue("invoiceNumber", prefix + num);
  };

  const items = form.watch("items");
  const totalAmount = items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);

  useEffect(() => {
  const generateWords = async () => {
    try {
      const n2w = await import("number-to-words");
      const whole = Math.floor(totalAmount);
      const decimal = Math.round((totalAmount - whole) * 100);

      let words = n2w.toWords(whole).toUpperCase() + " QATARI RIYALS";

      if (decimal > 0) {
        words += " AND " + n2w.toWords(decimal).toUpperCase() + " DIRHAMS";
      }

      words += " ONLY";

      form.setValue("totalAmountWords", words);
    } catch (err) {
      form.setValue("totalAmountWords", `${totalAmount.toFixed(2)} QATARI RIYALS ONLY`);
    }
  };
  generateWords();
}, [totalAmount, form]);

  const units = [
    "PCS", "NOS", "SET", "PAIR", "DOZEN",
    "BOX", "BAG", "PKT", "PACK", "BUNDLE", "CTN", "CASE", "CARTON", "PALLET",
    "KG", "GM", "TON", "LB",
    "LTR", "ML", "GLN", "DRUM", "BUCKET", "BARREL",
    "MTR", "CM", "MM", "FT", "IN", "YD",
    "SQFT", "SQM",
    "ROLL", "SHEET", "SPOOL", "COIL", "REAM",
    "TUBE", "BOTTLE", "CAN", "JAR",
    "LENGTH", "LOT", "LOAD", "TRIP",
  ];

  const onSubmit = (data: InvoiceFormValues) => {
    createMutation.mutate({
      ...data,
      customerName: data.customerName?.toUpperCase() || "CASH CUSTOMER",
      totalAmount: String(totalAmount.toFixed(2)),
      items: data.items.map(item => ({
        ...item,
        description: item.description.toUpperCase(),
        unit: item.unit.toUpperCase(),
        amount: String((Number(item.quantity) * Number(item.unitPrice)).toFixed(2)),
      })),
    }, {
      onSuccess: (res) => setLocation(`/invoices/${res.id}`),
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-file", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to parse file");
      const result = await res.json();
      if (result.items && Array.isArray(result.items) && result.items.length > 0) {
        result.items.forEach((item: any) => {
          append({
            description: String(item.description || "ITEM").toUpperCase(),
            quantity: String(item.quantity || "1"),
            unit: String(item.unit || "PCS").toUpperCase(),
            unitPrice: String(item.unitPrice || "0"),
            amount: String((Number(item.quantity || 1) * Number(item.unitPrice || 0)).toFixed(2)),
            currency: "QAR",
          });
        });
      } else {
        alert("No items found in file. Please check the format.");
      }
    } catch (error) {
      console.error("File upload error:", error);
      alert("Failed to read file. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleToggleRecord = () => {
    // STOP: If currently listening, force stop and process
    if (isListening) {
      console.log("🛑 STOP clicked - will process speech");
      setIsListening(false);
      if ((window as any).activeRecognition) {
        try {
          (window as any).activeRecognition.stop(); // Stop gracefully to trigger onend
        } catch (e) {
          console.error("Stop error:", e);
        }
      }
      return;
    }

    // START: Begin new recording
    if (isProcessing) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Please use Chrome or Edge browser for voice input.");
      return;
    }

    console.log("▶️ START clicked");

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    (window as any).activeRecognition = recognition;
    setIsListening(true);

    let fullTranscript = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          fullTranscript += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      console.log("📝", fullTranscript.trim() + interim);
    };

    recognition.onerror = (e: any) => {
      console.error("❌ Error:", e.error);
      setIsListening(false);
      (window as any).activeRecognition = null;
    };

    recognition.onend = async () => {
      console.log("⏹️ Recording ended");
      setIsListening(false);
      (window as any).activeRecognition = null;

      const finalText = fullTranscript.trim();

      if (!finalText || finalText.length < 3) {
        console.log("⚠️ No speech detected");
        return;
      }

      if (finalText === lastTranscript) {
        console.log("⚠️ Duplicate ignored");
        return;
      }

      console.log("✅ Processing:", finalText);
      setLastTranscript(finalText);
      setIsProcessing(true);

      try {
        const res = await apiRequest("POST", "/api/voice-parse", { transcript: finalText });
        const result = await res.json();

        console.log("✅ Parsed result:", result);

        if (result.items && Array.isArray(result.items) && result.items.length > 0) {
          console.log(`✅ Parsed ${result.items.length} items successfully`);

          result.items.forEach((item: any, idx: number) => {
            console.log(`Adding item ${idx + 1}:`, item);

            const newItem = {
              description: String(item.description || "ITEM").toUpperCase(),
              quantity: String(item.quantity || "1"),
              unit: String(item.unit || "PCS").toUpperCase(),
              unitPrice: String(item.unitPrice || "0"),
              amount: String((Number(item.quantity || 1) * Number(item.unitPrice || 0)).toFixed(2)),
              currency: "QAR",
            };

            console.log("Appending:", newItem);
            append(newItem);
          });

          console.log("✅ All items added");
        } else {
          console.error("❌ No items in result:", result);
          alert("No items found in speech. Try again.");
        }
      } catch (error) {
        console.error("Parse error:", error);
        alert("Failed to parse. Try again.");
      } finally {
        setIsProcessing(false);
        setTimeout(() => setLastTranscript(""), 2000);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Start error:", e);
      setIsListening(false);
    }
  };

  // Handle description input change for autocomplete
  const handleDescriptionChange = (index: number, value: string) => {
    form.setValue(`items.${index}.description`, value);

    if (value.trim().length > 0) {
      const filtered = allProducts
        .filter(p => p.description.includes(value.toUpperCase()))
        .slice(0, 5);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setCurrentFieldIndex(index);
      setActiveSuggestionIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  // Select suggestion from dropdown - auto-fill description, unit, and price
  const selectSuggestion = (index: number, product: {description: string, unit: string, unitPrice: string}) => {
    form.setValue(`items.${index}.description`, product.description);
    form.setValue(`items.${index}.unit`, product.unit);
    form.setValue(`items.${index}.unitPrice`, product.unitPrice);
    setShowSuggestions(false);
    setSuggestions([]);
    // Focus quantity field
    setTimeout(() => {
      const el = document.querySelector(`[name="items.${index}.quantity"]`) as HTMLInputElement;
      el?.focus();
      el?.select();
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent, i: number, f: 'description'|'quantity'|'unit'|'unitPrice') => {
    // Handle autocomplete dropdown navigation for description field
    if (f === 'description' && showSuggestions && currentFieldIndex === i) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
        return;
      } else if (e.key === 'Enter' && suggestions.length > 0) {
        e.preventDefault();
        selectSuggestion(i, suggestions[activeSuggestionIndex]);
        return;
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      } else if (e.key === 'Tab') {
        setShowSuggestions(false);
        // Let browser handle Tab
      }
    }

    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const o = ['description','quantity','unit','unitPrice'], c = o.indexOf(f);
    let r = i, t = f;

    // For all text input fields, check cursor position for horizontal arrows
    if (target.tagName === 'INPUT') {
      const input = target as HTMLInputElement;
      const cursorPos = input.selectionStart || 0;
      const textLength = input.value.length;

      // Right arrow: only jump if cursor at end
      if (e.key === 'ArrowRight') {
        if (cursorPos === textLength && c < 3) {
          e.preventDefault();
          t = o[c + 1];
        } else {
          return; // Let browser handle cursor movement
        }
      }
      // Left arrow: only jump if cursor at start
      else if (e.key === 'ArrowLeft') {
        if (cursorPos === 0 && c > 0) {
          e.preventDefault();
          t = o[c - 1];
        } else {
          return; // Let browser handle cursor movement
        }
      }
    }
    // For select (unit dropdown), arrows always jump fields
    else if (target.tagName === 'SELECT') {
      if (e.key === 'ArrowRight' && c < 3) { e.preventDefault(); t = o[c + 1]; }
      else if (e.key === 'ArrowLeft' && c > 0) { e.preventDefault(); t = o[c - 1]; }
    }

    // Vertical arrows and Enter always move between rows
    if ((e.key === 'ArrowDown' || e.key === 'Enter') && i < fields.length - 1) { 
      e.preventDefault(); 
      r = i + 1; 
    }
    else if (e.key === 'ArrowUp' && i > 0) { 
      e.preventDefault(); 
      r = i - 1; 
    }
    else if (e.key === 'Enter' && i === fields.length - 1) { 
      e.preventDefault(); 
      append({description:"",quantity:"1",unit:"PCS",unitPrice:"0",amount:"0",currency:"QAR"}); 
      setTimeout(() => (document.querySelector(`[name="items.${fields.length}.${f}"]`) as HTMLElement)?.focus(), 50); 
      return; 
    }

    // Focus target field if different
    if (r !== i || t !== f) { 
      const el = document.querySelector(`[name="items.${r}.${t}"]`) as HTMLInputElement; 
      el?.focus(); 
      if ((t === 'quantity' || t === 'unitPrice') && el) el.select(); 
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-3xl font-black text-foreground uppercase tracking-tighter truncate">
                {docType === "invoice" ? "NEW INVOICE" : docType === "quotation" ? "NEW QUOTATION" : "NEW DELIVERY NOTE"}
              </h2>
              {/* Doc Type Selector */}
              <div className="flex gap-1.5 sm:gap-2 mt-2 mb-1 overflow-x-auto">
                {([
                  { key: "invoice", label: "INV", labelFull: "INVOICE", color: "bg-blue-600" },
                  { key: "quotation", label: "QT", labelFull: "QUOTATION", color: "bg-amber-500" },
                  { key: "delivery_note", label: "DN", labelFull: "DELIVERY NOTE", color: "bg-emerald-600" },
                ] as const).map(({ key, label, labelFull, color }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setDocType(key); updateNumberPrefix(key); }}
                    className={clsx(
                      "text-[10px] font-black uppercase px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl border-2 transition-all tracking-widest whitespace-nowrap",
                      docType === key ? `${color} text-white border-transparent shadow-md` : "bg-white text-muted-foreground border-border hover:bg-gray-50"
                    )}
                  ><span className="sm:hidden">{label}</span><span className="hidden sm:inline">{labelFull}</span></button>
                ))}
              </div>
              <div className="flex gap-1.5 sm:gap-2 mt-1 overflow-x-auto pb-2">
                {[1, 2, 3, 4, 5].map((num) => {
                  const styleLabel = num === 1 ? "BLUE" : num === 2 ? "YELLOW" : num === 3 ? "CYAN" : num === 4 ? "RED" : "DARK";
                  return (
                    <button
                      key={num}
                      onClick={() => setTemplate(`template${num}` as any)}
                      className={clsx(
                        "text-[10px] font-black uppercase px-2.5 sm:px-3 py-1 rounded border transition-all tracking-widest whitespace-nowrap",
                        template === `template${num}` ? "bg-primary text-white border-primary shadow-md" : "bg-white text-muted-foreground hover:bg-gray-50"
                      )}
                    >{styleLabel}</button>
                  );
                })}
              </div>
            </div>
          </div>
          <button
            onClick={form.handleSubmit(onSubmit)}
            disabled={createMutation.isPending}
            className="bg-primary text-primary-foreground px-5 sm:px-8 py-3 sm:py-4 rounded-2xl font-black uppercase text-xs sm:text-sm tracking-[0.2em] shadow-2xl shadow-primary/40 hover:shadow-primary/60 hover:-translate-y-1 transition-all duration-300 flex items-center gap-2 sm:gap-3 disabled:opacity-50 shrink-0 self-end sm:self-auto"
          >
            {createMutation.isPending ? "SAVING..." : "SAVE"}
            <Save className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-secondary/10 p-6 rounded-[2rem] border border-border/50 overflow-hidden">
              <h3 className="text-xs font-black mb-6 text-muted-foreground uppercase tracking-[0.3em]">LIVE PREVIEW</h3>
              <div className="border shadow-2xl bg-white p-1 rounded-xl ring-8 ring-secondary/5 transition-all w-full flex justify-center overflow-auto max-h-[600px]">
                <div className="scale-[0.5] md:scale-[0.6] lg:scale-[0.7] origin-top transform-gpu">
                  <InvoicePaper 
                    settings={{
                      storeNameEn: previewSettings?.storeNameEn || "",
                      storeNameAr: previewSettings?.storeNameAr || "",
                      addressEn: previewSettings?.addressEn || "",
                      addressAr: previewSettings?.addressAr || "",
                      phone: previewSettings?.phone || "",
                      crNumber: previewSettings?.crNumber || "",
                      poBox: previewSettings?.poBox || "",
                      logoUrl: previewSettings?.logoUrl || null
                    } as any}
                    invoice={{
                      invoiceNumber: form.watch("invoiceNumber"),
                      date: form.watch("date"),
                      customerName: (form.watch("customerName") || "CASH CUSTOMER").toUpperCase(),
                      receiverSignature: (form.watch("receiverSignature") || "").toUpperCase(),
                      totalAmount: totalAmount.toFixed(2),
                      totalAmountWords: form.watch("totalAmountWords"),
                      items: items.map(i => ({ 
                        ...i, 
                        description: i.description.toUpperCase(), 
                        amount: String((Number(i.quantity) * Number(i.unitPrice)).toFixed(2)), 
                        quantity: String(i.quantity), 
                        unitPrice: String(i.unitPrice),
                        unit: i.unit.toUpperCase()
                      }))
                    } as any}
                    template={template}
                    docType={docType}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-border/50 space-y-6">
              <h3 className="font-black text-xl text-foreground uppercase tracking-tight">INVOICE DETAILS</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">INVOICE NUMBER</label>
                  <input
                    {...form.register("invoiceNumber")}
                    className="w-full px-5 py-3 rounded-xl bg-background border border-border font-mono font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">DATE</label>
                  <input
                    type="date"
                    {...form.register("date")}
                    className="w-full px-5 py-3 rounded-xl bg-background border border-border font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">CUSTOMER NAME</label>
                  <input
                    placeholder="ENTER CUSTOMER NAME..."
                    {...form.register("customerName")}
                    className="w-full px-5 py-3 rounded-xl bg-background border border-border font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all uppercase"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">RECEIVER SIGNATURE</label>
                  <input
                    placeholder="ENTER RECEIVER NAME..."
                    {...form.register("receiverSignature")}
                    className="w-full px-5 py-3 rounded-xl bg-background border border-border font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all uppercase"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-border/50">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="font-black text-xl text-foreground uppercase tracking-tight">ITEMS</h3>
                 <button
                    type="button"
                    onClick={() => append({ description: "", quantity: "1", unit: "PCS", unitPrice: "0", amount: "0", currency: "QAR" })}
                    className="text-xs font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> ADD ITEM
                  </button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="bg-secondary/20 p-3 sm:p-5 rounded-2xl relative group transition-all hover:bg-secondary/30">
                    {/* Mobile: stacked layout / Desktop: 12-col grid */}
                    <div className="hidden sm:grid grid-cols-12 gap-4 items-end">
                      <div className="col-span-5 space-y-1 relative">
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">DESCRIPTION</label>
                        <input
                          placeholder="ITEM DESCRIPTION"
                          {...form.register(`items.${index}.description`)}
                          onChange={(e) => handleDescriptionChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'description')}
                          onFocus={() => {
                            const value = form.getValues(`items.${index}.description`);
                            if (value.trim()) handleDescriptionChange(index, value);
                          }}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-border focus:border-primary outline-none text-sm font-bold uppercase"
                        />
                        {showSuggestions && currentFieldIndex === index && suggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-primary rounded-xl shadow-2xl z-50 max-h-60 overflow-auto">
                            {suggestions.map((product, idx) => (
                              <div
                                key={idx}
                                onClick={() => selectSuggestion(index, product)}
                                className={clsx(
                                  "px-4 py-3 cursor-pointer transition-colors",
                                  idx === activeSuggestionIndex
                                    ? "bg-primary text-white"
                                    : "hover:bg-primary/10"
                                )}
                              >
                                <div className="text-sm font-bold uppercase">{product.description}</div>
                                <div className="text-xs opacity-70 mt-1">
                                  {product.unit} • {product.unitPrice} QAR
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">QTY</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          {...form.register(`items.${index}.quantity`)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'quantity')}
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-border focus:border-primary outline-none text-sm font-mono font-bold"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">UNIT</label>
                        <select
                          {...form.register(`items.${index}.unit`)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'unit')}
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-border focus:border-primary outline-none text-[10px] font-black uppercase"
                        >
                          {units.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">PRICE</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          {...form.register(`items.${index}.unitPrice`)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'unitPrice')}
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-border focus:border-primary outline-none text-sm font-mono font-bold"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center pb-2">
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="text-muted-foreground hover:text-red-500 transition-colors p-2 rounded-full hover:bg-white"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    {/* Mobile stacked layout */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-1 relative">
                          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">DESCRIPTION</label>
                          <input
                            placeholder="ITEM DESCRIPTION"
                            {...form.register(`items.${index}.description`)}
                            onChange={(e) => handleDescriptionChange(index, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, index, 'description')}
                            onFocus={() => {
                              const value = form.getValues(`items.${index}.description`);
                              if (value.trim()) handleDescriptionChange(index, value);
                            }}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-border focus:border-primary outline-none text-sm font-bold uppercase"
                          />
                          {showSuggestions && currentFieldIndex === index && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-primary rounded-xl shadow-2xl z-50 max-h-60 overflow-auto">
                              {suggestions.map((product, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => selectSuggestion(index, product)}
                                  className={clsx(
                                    "px-3 py-2.5 cursor-pointer transition-colors",
                                    idx === activeSuggestionIndex
                                      ? "bg-primary text-white"
                                      : "hover:bg-primary/10"
                                  )}
                                >
                                  <div className="text-sm font-bold uppercase">{product.description}</div>
                                  <div className="text-xs opacity-70 mt-0.5">
                                    {product.unit} • {product.unitPrice} QAR
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="text-muted-foreground hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-white mt-5 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">QTY</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            {...form.register(`items.${index}.quantity`)}
                            onKeyDown={(e) => handleKeyDown(e, index, 'quantity')}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-border focus:border-primary outline-none text-sm font-mono font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">UNIT</label>
                          <select
                            {...form.register(`items.${index}.unit`)}
                            onKeyDown={(e) => handleKeyDown(e, index, 'unit')}
                            className="w-full px-2 py-2 rounded-xl bg-white border border-border focus:border-primary outline-none text-[10px] font-black uppercase"
                          >
                            {units.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">PRICE</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            {...form.register(`items.${index}.unitPrice`)}
                            onKeyDown={(e) => handleKeyDown(e, index, 'unitPrice')}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-border focus:border-primary outline-none text-sm font-mono font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-start">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.csv,.txt,.png,.jpg,.jpeg,.webp,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary hover:border-primary hover:bg-primary/5 transition-all font-black text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isUploading ? "READING FILE..." : "UPLOAD FILE / PDF / IMAGE / CSV"}
                </button>
              </div>

              <div className="mt-10 flex flex-col items-end gap-4 border-t-4 border-secondary/50 pt-8">
                <div className="flex justify-between items-baseline w-full md:w-1/2">
                  <span className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground">TOTAL AMOUNT:</span>
                  <span className="text-2xl sm:text-4xl font-mono font-black text-primary">{totalAmount.toFixed(2)} <span className="text-xs sm:text-sm font-sans">QAR</span></span>
                </div>
                <div className="w-full">
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">AMOUNT IN WORDS</label>
                   <input 
                      {...form.register("totalAmountWords")}
                      className="w-full px-5 py-3 rounded-xl bg-secondary/30 border-2 border-primary/10 font-serif italic text-primary font-bold uppercase tracking-tight focus:border-primary outline-none transition-all"
                   />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2rem] border-2 border-primary/10 shadow-2xl shadow-primary/5 flex flex-col items-center gap-6">
              <div className="relative">
                {isListening && (
                  <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
                )}
                <button
                  onClick={handleToggleRecord}
                  disabled={isProcessing}
                  className={clsx(
                    "relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl",
                    isListening ? "bg-red-500 text-white scale-110" : "bg-primary text-primary-foreground hover:scale-105"
                  )}
                >
                  {isProcessing ? (
                    <Loader2 className="w-10 h-10 animate-spin" />
                  ) : isListening ? (
                    <Square className="w-8 h-8 fill-current" />
                  ) : (
                    <Mic className="w-10 h-10" />
                  )}
                </button>
              </div>
              <div className="text-center">
                <h3 className="font-black uppercase tracking-widest text-sm mb-2">
                  {isListening ? "🔴 RECORDING..." : isProcessing ? "PROCESSING..." : "AI VOICE INPUT"}
                </h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight leading-relaxed px-4">
                  {isListening
                    ? "CLICK BUTTON TO STOP RECORDING" 
                    : isProcessing 
                    ? "ANALYZING YOUR SPEECH..."
                    : "CLICK TO START • SPEAK ITEMS • CLICK TO STOP"}
                </p>
              </div>
            </div>
            <div className="bg-blue-600 p-8 rounded-[2rem] text-white shadow-xl shadow-blue-500/20">
               <h4 className="font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
                 <div className="w-2 h-2 bg-blue-300 rounded-full" />
                 GUIDE
               </h4>
               <ul className="text-[10px] font-bold uppercase tracking-wider space-y-4 opacity-90">
                  <li className="flex gap-3">
                    <span className="text-blue-300">01</span>
                    TALK TO AI LIKE A CONVERSATION
                  </li>
                  <li className="flex gap-3">
                    <span className="text-blue-300">02</span>
                    "ADD 20 BAGS OF CEMENT FOR 15 EACH"
                  </li>
                  <li className="flex gap-3">
                    <span className="text-blue-300">03</span>
                    ITEMS WILL AUTOMATICALLY APPEAR IN UPPERCASE
                  </li>
               </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}