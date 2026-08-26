// What each account can actually put on a bill.
//
// Reproduces the exact scoping the app now uses — server lock (routes.ts
// /api/inventory) + client scope (QuickSale relevantStoreIds, DocumentEditor
// allowedLocations) — and prints, per user, how many products the sale screens
// would list. Read-only: it touches nothing.
//
//   Run: npx tsx scripts/verify-sale-visibility.ts
import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const stores = (await c.query(`select id, name_en, type, owner_store_id from stores where active order by id`)).rows;
const users = (await c.query(`select id, username, role, store_id from users where active order by id`)).rows;
const inv = (await c.query(`select product_id, store_id, qty::numeric qty from inventory`)).rows;
const products = (await c.query(`select id, name from products where active order by id`)).rows;

const warehouses = stores.filter((s) => s.type === 'warehouse').map((s) => s.id);

/** Server: lockedStoreId() + getInventory(storeId, true, "all"). */
function serverScope(role: string, storeId: number | null): Set<number> | null {
  const locked = role !== 'admin' && storeId ? storeId : null;
  if (!locked) return null;                       // admin — every row
  return new Set<number>([locked, ...warehouses]);
}

/** Client: the store being sold from + every warehouse. */
function clientScope(storeId: number | null): Set<number> {
  const sell = storeId ?? stores.find((s) => s.type === 'store')?.id ?? null;
  if (!sell) return new Set<number>();
  return new Set<number>([sell, ...warehouses]);
}

/** OLD rule, for comparison: own store only on the server, owned warehouses on the client. */
function serverScopeOld(role: string, storeId: number | null): Set<number> | null {
  const locked = role !== 'admin' && storeId ? storeId : null;
  return locked ? new Set<number>([locked]) : null;
}
function clientScopeOld(storeId: number | null): Set<number> {
  const sell = storeId ?? stores.find((s) => s.type === 'store')?.id ?? null;
  if (!sell) return new Set<number>();
  const owned = stores
    .filter((s) => s.type === 'warehouse' && (s.owner_store_id === sell || s.owner_store_id == null))
    .map((s) => s.id);
  return new Set<number>([sell, ...owned]);
}

function sellable(server: Set<number> | null, client: Set<number>): Set<number> {
  const ids = new Set<number>();
  for (const r of inv) {
    if (Number(r.qty) <= 0) continue;                 // zero qty is never listed
    if (server && !server.has(r.store_id)) continue;  // server never sent it
    if (!client.has(r.store_id)) continue;            // client filtered it out
    ids.add(r.product_id);
  }
  return ids;
}

console.log(`${products.length} active products · ${stores.length} active locations\n`);
console.log('account            role       store  before  now   of');
console.log('─'.repeat(58));

let regression = false;
for (const u of users) {
  const before = sellable(serverScopeOld(u.role, u.store_id), clientScopeOld(u.store_id)).size;
  const now = sellable(serverScope(u.role, u.store_id), clientScope(u.store_id)).size;
  if (now < before) regression = true;
  console.log(
    `${u.username.padEnd(18)} ${u.role.padEnd(10)} ${String(u.store_id ?? '-').padEnd(6)} ` +
    `${String(before).padStart(6)}  ${String(now).padStart(3)}  ${String(products.length).padStart(3)}` +
    `${now > before ? '   +' + (now - before) : ''}`,
  );
}

// The rule the sale screens promise: on hand > 0 shows, everything else hides.
console.log('\nStock that is now reachable but was not, per location:');
for (const s of stores) {
  const rows = inv.filter((r) => r.store_id === s.id && Number(r.qty) > 0);
  const units = rows.reduce((t, r) => t + Number(r.qty), 0);
  console.log(`  ${String(s.id).padStart(2)} ${s.type.padEnd(10)} ${s.name_en.padEnd(44)} ${rows.length} products, ${units} units`);
}

const zero = products.filter((p) => !inv.some((r) => r.product_id === p.id && Number(r.qty) > 0));
console.log(`\nHidden everywhere (zero on hand): ${zero.length} — ${zero.map((p) => p.name).join(', ') || 'none'}`);
console.log(regression ? '\nFAIL — an account lost visibility.' : '\nOK — no account lost visibility.');

await c.end();
