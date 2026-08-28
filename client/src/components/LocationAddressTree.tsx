import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Plus, X, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── Where a thing physically is ──────────────────────────────────────────────
   A real address is a TREE, not three lists:

       North Side  (area)
         └ Rack A  (rack)
             └ Shelf 2  (shelf)

   Three flat lists cannot say that. "Rack A" would belong to every area at once,
   and a worker sent to "Rack A, Shelf 2" would have to check the whole building.

   So each level names its parent:
     area   meta = { locationId }
     rack   meta = { locationId, areaId }
     shelf  meta = { locationId, rackId }

   Deleting a parent leaves orphans, so a level that still has children refuses
   and says so.
──────────────────────────────────────────────────────────────────────────────*/

type ListItem = { id: number; listKey: string; value: string; meta: any };

const KEYS = {
  area: "location_areas",
  rack: "location_racks",
  shelf: "location_shelves",
} as const;

export default function LocationAddressTree({
  locationId, locationName,
}: { locationId: number; locationName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});

  const areasQ = useQuery<ListItem[]>({
    queryKey: [`/api/lists/${KEYS.area}`],
    queryFn: () => fetch(`/api/lists/${KEYS.area}`).then((r) => r.json()),
  });
  const racksQ = useQuery<ListItem[]>({
    queryKey: [`/api/lists/${KEYS.rack}`],
    queryFn: () => fetch(`/api/lists/${KEYS.rack}`).then((r) => r.json()),
  });
  const shelvesQ = useQuery<ListItem[]>({
    queryKey: [`/api/lists/${KEYS.shelf}`],
    queryFn: () => fetch(`/api/lists/${KEYS.shelf}`).then((r) => r.json()),
  });

  const areas = (areasQ.data ?? []).filter((a) => Number(a.meta?.locationId) === locationId);
  const racksOf = (areaId: number) =>
    (racksQ.data ?? []).filter((r) => Number(r.meta?.areaId) === areaId);
  const shelvesOf = (rackId: number) =>
    (shelvesQ.data ?? []).filter((s) => Number(s.meta?.rackId) === rackId);

  const add = useMutation({
    mutationFn: async ({ listKey, value, meta }: { listKey: string; value: string; meta: any }) => {
      const r = await fetch("/api/lists", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ listKey, value, meta }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Could not add.");
      return r.json();
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [`/api/lists/${v.listKey}`] }),
    onError: (e: any) => toast({ title: "Not added", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async ({ id }: { id: number; listKey: string }) => {
      const r = await fetch(`/api/lists/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Could not remove.");
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [`/api/lists/${v.listKey}`] }),
  });

  const commit = (dk: string, listKey: string, meta: any) => {
    const value = (draft[dk] ?? "").trim();
    if (!value) return;
    add.mutate({ listKey, value, meta });
    setDraft((d) => ({ ...d, [dk]: "" }));
  };

  const AddRow = ({ dk, listKey, meta, placeholder }: {
    dk: string; listKey: string; meta: any; placeholder: string;
  }) => (
    <div className="flex gap-1 mt-1">
      <Input
        className="h-7 text-xs max-w-[14rem]"
        placeholder={placeholder}
        value={draft[dk] ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [dk]: e.target.value }))}
        onKeyDown={(e) => { if (e.key === "Enter") commit(dk, listKey, meta); }}
      />
      <Button
        size="icon" variant="outline" className="h-7 w-7 shrink-0"
        disabled={!(draft[dk] ?? "").trim() || add.isPending}
        onClick={() => commit(dk, listKey, meta)}
      >
        <Plus size={13} />
      </Button>
    </div>
  );

  const del = (item: ListItem, listKey: string, childCount: number, childWord: string) => (
    <button
      type="button"
      className="text-muted-foreground hover:text-red-600 ml-1"
      onClick={() => {
        if (childCount > 0) {
          toast({
            title: `${item.value} still has ${childCount} ${childWord}${childCount === 1 ? "" : "s"}`,
            description: "Remove those first, or they would be left with no address.",
            variant: "destructive",
          });
          return;
        }
        remove.mutate({ id: item.id, listKey });
      }}
      aria-label={`Remove ${item.value}`}
    >
      <X size={12} />
    </button>
  );

  const loading = areasQ.isLoading || racksQ.isLoading || shelvesQ.isLoading;

  return (
    <div className="mt-2 rounded-lg border bg-muted/20 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <MapPin size={12} /> Where things are kept
      </p>

      {loading ? (
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> Loading…
        </p>
      ) : (
        <div className="mt-1.5 space-y-1">
          {areas.length === 0 && (
            <p className="text-[11px] text-muted-foreground/80">
              No areas yet. Add the first part of the address — a side or zone of {locationName}.
            </p>
          )}

          {areas.map((area) => {
            const racks = racksOf(area.id);
            const aKey = `a${area.id}`;
            const isOpen = open[aKey] ?? true;
            return (
              <div key={area.id} className="rounded-md bg-background/60 border px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [aKey]: !isOpen }))}>
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  <span className="text-xs font-semibold">{area.value}</span>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {racks.length} rack{racks.length === 1 ? "" : "s"}
                  </Badge>
                  {del(area, KEYS.area, racks.length, "rack")}
                </div>

                {isOpen && (
                  <div className="ml-4 mt-1 space-y-1 border-l pl-2.5">
                    {racks.map((rack) => {
                      const shelves = shelvesOf(rack.id);
                      const rKey = `r${rack.id}`;
                      const rOpen = open[rKey] ?? true;
                      return (
                        <div key={rack.id}>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setOpen((o) => ({ ...o, [rKey]: !rOpen }))}>
                              {rOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                            <span className="text-xs">{rack.value}</span>
                            {del(rack, KEYS.rack, shelves.length, "shelf")}
                          </div>
                          {rOpen && (
                            <div className="ml-4 border-l pl-2.5">
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {shelves.map((sh) => (
                                  <Badge key={sh.id} variant="secondary" className="text-[10px] font-normal gap-0.5 pr-1">
                                    {sh.value}
                                    {del(sh, KEYS.shelf, 0, "")}
                                  </Badge>
                                ))}
                                {shelves.length === 0 && (
                                  <span className="text-[10px] text-muted-foreground/70">no shelves</span>
                                )}
                              </div>
                              <AddRow
                                dk={`s${rack.id}`} listKey={KEYS.shelf}
                                meta={{ locationId, areaId: area.id, rackId: rack.id }}
                                placeholder="Shelf 1, Top…"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <AddRow
                      dk={`r${area.id}`} listKey={KEYS.rack}
                      meta={{ locationId, areaId: area.id }}
                      placeholder="Rack A, Wall Rack…"
                    />
                  </div>
                )}
              </div>
            );
          })}

          <AddRow
            dk={`area${locationId}`} listKey={KEYS.area}
            meta={{ locationId }}
            placeholder="North Side, Entrance…"
          />

          {areas.length > 0 && (
            <p className="text-[10px] text-muted-foreground pt-1">
              A worker is told: <b>{areas[0].value}</b>
              {racksOf(areas[0].id)[0] && <> → <b>{racksOf(areas[0].id)[0].value}</b></>}
              {racksOf(areas[0].id)[0] && shelvesOf(racksOf(areas[0].id)[0].id)[0] &&
                <> → <b>{shelvesOf(racksOf(areas[0].id)[0].id)[0].value}</b></>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
