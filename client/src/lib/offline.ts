// Offline-first POS support (Bug 7).
// - Caches reference data (products, customers, stores) in localStorage so the POS
//   can operate with no connection.
// - Queues sales created offline and auto-syncs them to the server on reconnect.
// - Exposes online status + pending-count via a tiny pub/sub + a React hook.
import { useEffect, useState } from "react";

export const SYNC_QUEUE_KEY = "mtc_sync_queue";
const CACHE_PREFIX = "mtc_cache_";

type SyncItem = { id: string; url: string; method: string; body: any; timestamp: number };

/* ── pub/sub so the header indicator + POS react to queue/status changes ── */
type Listener = () => void;
const listeners = new Set<Listener>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeOffline(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/* ── Reference-data cache (products / customers / stores) ─────────── */
export function cacheSet(key: string, data: unknown) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch { /* quota */ }
}
export function cacheGet<T>(key: string): T | null {
  try { const raw = localStorage.getItem(CACHE_PREFIX + key); return raw ? (JSON.parse(raw).data as T) : null; } catch { return null; }
}

/* ── Sync queue ───────────────────────────────────────────────────── */
function readQueue(): SyncItem[] {
  try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]"); } catch { return []; }
}
function writeQueue(q: SyncItem[]) { try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)); } catch { /* quota */ } emit(); }

export function queueCount(): number { return readQueue().length; }
export function getQueue(): SyncItem[] { return readQueue(); }

export function addToSyncQueue(url: string, method: string, body: any): SyncItem {
  const item: SyncItem = { id: `${Date.now()}${Math.random().toString(36).slice(2, 7)}`, url, method, body, timestamp: Date.now() };
  writeQueue([...readQueue(), item]);
  return item;
}
// Convenience for the POS: queue a sale (POST) and return the queued item.
export function enqueueSale(url: string, body: any): SyncItem {
  return addToSyncQueue(url, "POST", body);
}

// Flush the queue sequentially (so document numbers stay ordered). Drops each item
// on success; keeps failures for the next attempt.
let flushing = false;
export async function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (flushing || !isOnline()) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0, failed = 0;
  try {
    for (const item of readQueue()) {
      try {
        const res = await fetch(item.url, { method: item.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
        if (res.ok) { writeQueue(readQueue().filter((q) => q.id !== item.id)); synced++; }
        else failed++;
      } catch { failed++; }
    }
  } finally { flushing = false; emit(); }
  return { synced, failed };
}

export function setupOnlineListener(cb: () => void): () => void {
  const handler = () => { cb(); };
  window.addEventListener("online", handler);
  return () => { window.removeEventListener("online", handler); };
}

// Wire browser online/offline events once — auto-flush the queue on reconnect.
let wired = false;
export function initOfflineSync() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", () => { emit(); flushSyncQueue(); });
  window.addEventListener("offline", () => emit());
}

/* ── React hook — online status + pending count + manual sync ─────── */
export function useOffline() {
  const [online, setOnline] = useState<boolean>(isOnline());
  const [pending, setPending] = useState<number>(queueCount());
  useEffect(() => {
    initOfflineSync();
    const update = () => { setOnline(isOnline()); setPending(queueCount()); };
    const unsub = subscribeOffline(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => { unsub(); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return {
    online,
    pending,
    sync: async () => { const r = await flushSyncQueue(); setPending(queueCount()); return r; },
  };
}
