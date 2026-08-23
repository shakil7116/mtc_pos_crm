// @ts-nocheck
import { useInvoice, useDeleteInvoice } from "@/hooks/use-invoices";
import { useSettings } from "@/hooks/use-settings";
import { useRoute, Link, useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { InvoicePaper } from "@/components/InvoicePaper";
import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { Printer, ArrowLeft, Trash2, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function InvoiceDetails() {
  const [, params] = useRoute("/invoices/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  
  const { data: invoice, isLoading: loadingInvoice } = useInvoice(id);
  const { data: settings, isLoading: loadingSettings } = useSettings();
  const deleteMutation = useDeleteInvoice();

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: invoice?.invoiceNumber || 'Invoice',
  });

  if (loadingInvoice || loadingSettings) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!invoice || !settings) return <div className="p-8">Not Found</div>;

  const shareText = `INVOICE ${invoice.invoiceNumber} FROM ${settings.storeNameEn.toUpperCase()}\nTOTAL: ${invoice.totalAmount} QAR\nDATE: ${invoice.date}`;
  
  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const shareEmail = () => {
    const subject = encodeURIComponent(`INVOICE ${invoice.invoiceNumber}`);
    const body = encodeURIComponent(shareText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleDelete = () => {
    if (invoice?.id) {
      deleteMutation.mutate(invoice.id, {
        onSuccess: () => setLocation("/"),
      });
    }
  };

  return (
    <Layout>
       <div className="max-w-5xl mx-auto space-y-8 pb-20">
         {/* Toolbar */}
         <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-border/50 no-print">
            <div className="flex items-center gap-4 w-full md:w-auto">
               <Link href="/" className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-5 h-5" />
               </Link>
               <div>
                  <h1 className="font-black text-xl uppercase tracking-tight">{invoice.invoiceNumber}</h1>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CREATED {new Date(invoice.date).toLocaleDateString()}</span>
               </div>
            </div>
            
            <div className="flex flex-wrap gap-3 w-full md:w-auto justify-end">
               <Button variant="outline" onClick={shareWhatsApp} className="rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 border-2 hover:bg-emerald-50 hover:border-emerald-200 transition-all">
                 <MessageSquare className="w-4 h-4 text-emerald-600" />
                 WHATSAPP
               </Button>
               <Button variant="outline" onClick={shareEmail} className="rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 border-2 hover:bg-blue-50 hover:border-blue-200 transition-all">
                 <Mail className="w-4 h-4 text-blue-600" />
                 EMAIL
               </Button>

               <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 transition-colors font-black uppercase text-[10px] tracking-widest">
                      <Trash2 className="w-4 h-4" /> DELETE
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="uppercase font-black">ARE YOU SURE?</AlertDialogTitle>
                      <AlertDialogDescription className="uppercase text-xs font-bold tracking-tight">
                        THIS ACTION CANNOT BE UNDONE. THIS WILL PERMANENTLY DELETE INVOICE {invoice.invoiceNumber}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl uppercase font-black text-xs">CANCEL</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete()} className="bg-red-600 hover:bg-red-700 rounded-xl uppercase font-black text-xs">DELETE</AlertDialogAction>
                  </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

               <button 
                  onClick={() => handlePrint()}
                  className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all font-black uppercase text-xs tracking-[0.2em]"
               >
                  <Printer className="w-4 h-4" /> PRINT INVOICE
               </button>
            </div>
         </div>

         {/* The Invoice Preview */}
         <div className="overflow-auto bg-gray-50/50 p-4 md:p-8 rounded-[2rem] border border-dashed border-gray-300 flex justify-center ring-1 ring-primary/5">
            <InvoicePaper 
              ref={printRef}
              settings={settings}
              invoice={invoice}
              className="transform scale-90 md:scale-100 origin-top shadow-2xl"
            />
         </div>
       </div>
    </Layout>
  );
}
