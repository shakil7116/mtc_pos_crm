import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, Package, TrendingUp, History, Factory, MapPin } from "lucide-react";

const money = (n: any) => "QAR " + (Number(n) || 0).toFixed(2);
const moveColor: Record<string, string> = {
  sale: "text-red-600", return: "text-green-600", add: "text-green-600",
  remove: "text-red-600", transfer: "text-blue-600", receive: "text-green-600",
};

export default function ProductDetail() {
  const [, params] = useRoute("/inventory/:id");
  const [, nav] = useLocation();
  const id = Number(params?.id);

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/products/${id}/activity`],
    queryFn: () => fetch(`/api/products/${id}/activity`).then((r) => r.json()),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="p-6 max-w-5xl mx-auto space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (!data?.product) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Product not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => nav("/inventory")}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
      </div>
    );
  }
  const p = data.product;
  const cost = p.costPrice != null ? Number(p.costPrice) : null;
  const sell = Number(p.salePrice) || 0;
  const margin = cost != null && sell > 0 ? ((sell - cost) / sell) * 100 : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => nav("/inventory")}>
        <ArrowLeft className="w-4 h-4" /> Inventory
      </Button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-border/40 shadow-sm p-5 flex items-start gap-4">
        {p.imageUrl
          ? <img src={p.imageUrl} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
          : <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center shrink-0"><Package className="w-8 h-8 text-muted-foreground" /></div>}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{p.sku || "—"}</span>
            {p.category && <span className="px-2 py-0.5 rounded-full bg-secondary text-xs">{p.category}</span>}
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", p.active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
              {p.active !== false ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-mono font-bold text-amber-600">{money(sell)}</p>
          {margin != null && <p className="text-xs text-muted-foreground">{margin.toFixed(1)}% margin</p>}
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="details"><Package className="w-3.5 h-3.5 mr-1.5" />Details</TabsTrigger>
          <TabsTrigger value="sales"><TrendingUp className="w-3.5 h-3.5 mr-1.5" />Sales History</TabsTrigger>
          <TabsTrigger value="movement"><History className="w-3.5 h-3.5 mr-1.5" />Stock Movement</TabsTrigger>
          <TabsTrigger value="supplier"><Factory className="w-3.5 h-3.5 mr-1.5" />Supplier</TabsTrigger>
        </TabsList>

        {/* Details */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Sell price" value={money(sell)} />
            <Stat label="Cost price" value={cost != null ? money(cost) : "Admin only"} />
            <Stat label="Unit" value={p.unit || "—"} />
            <Stat label="Min stock" value={String(p.minStockQty ?? "—")} />
          </div>
          <div className="bg-white rounded-xl border border-border/40 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Stock on hand by location</h2></div>
            {(data.stockByLocation || []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">No stock recorded.</p> : (
              <div className="divide-y">
                {data.stockByLocation.map((s: any) => (
                  <div key={s.storeId} className="px-4 py-2.5 flex justify-between text-sm">
                    <span>{s.storeName}</span>
                    <span className={cn("font-mono font-semibold", s.qty <= (Number(p.minStockQty) || 0) ? "text-red-600" : "text-foreground")}>{s.qty} {p.unit || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Sales history */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Sold this month" value={String(data.stats?.soldThisMonth ?? 0)} />
            <Stat label="Sold this year" value={String(data.stats?.soldThisYear ?? 0)} />
            <Stat label="Avg sell price" value={money(data.stats?.avgPrice)} />
            <Stat label="Best customer" value={data.stats?.bestCustomer?.name || "—"} />
          </div>
          <TableCard
            head={["Invoice", "Date", "Customer", "Qty", "Price", "Amount"]}
            rows={(data.sales || []).map((s: any) => [
              <Link key="l" href={`/documents/${s.docId}`} className="font-mono text-blue-600 hover:underline">{s.number}</Link>,
              s.date ? format(new Date(s.date), "dd MMM yy") : "—",
              s.customerName || "—", s.qty, money(s.price), money(s.amount),
            ])}
            empty="No sales yet for this product."
          />
        </TabsContent>

        {/* Stock movement */}
        <TabsContent value="movement">
          <TableCard
            head={["Type", "Change", "Location", "Reason", "Date"]}
            rows={(data.movements || []).map((m: any) => [
              <span key="t" className={cn("font-semibold capitalize", moveColor[m.type] || "")}>{m.type}</span>,
              <span key="c" className={cn("font-mono", m.qtyChange >= 0 ? "text-green-600" : "text-red-600")}>{m.qtyChange >= 0 ? "+" : ""}{m.qtyChange}</span>,
              m.storeName, m.reason || "—", m.date ? format(new Date(m.date), "dd MMM yy HH:mm") : "—",
            ])}
            empty="No stock movements recorded."
          />
        </TabsContent>

        {/* Supplier */}
        <TabsContent value="supplier" className="space-y-3">
          {data.supplier ? (
            <div className="bg-white rounded-xl border border-border/40 shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{data.supplier.name}</p>
                {data.supplier.phone && <p className="text-sm text-muted-foreground">{data.supplier.phone}</p>}
              </div>
              <Link href="/suppliers"><Button variant="outline" size="sm">View supplier</Button></Link>
            </div>
          ) : <p className="text-sm text-muted-foreground">No supplier linked to this product.</p>}
          <Link href="/purchase-orders/new"><Button size="sm" className="gap-1.5"><Factory className="w-4 h-4" />Create Purchase Order</Button></Link>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-border/40 shadow-sm p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono font-bold text-sm mt-0.5 truncate">{value}</p>
    </div>
  );
}

function TableCard({ head, rows, empty }: { head: string[]; rows: any[][]; empty: string }) {
  return (
    <div className="bg-white rounded-xl border border-border/40 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            {head.map((h) => <th key={h} className="text-left px-4 py-2.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border/30">
            {rows.length === 0 ? (
              <tr><td colSpan={head.length} className="px-4 py-8 text-center text-muted-foreground">{empty}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="hover:bg-secondary/10">
                {r.map((c, j) => <td key={j} className="px-4 py-2.5">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
