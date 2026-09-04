// Handing this app to a business that is not ours.
//
// A brand-new database has no settings row and no users, so three things that
// looked fine were quietly broken:
//
//   1. The wizard saved the company details with UPDATE ... WHERE id = 1. There
//      is no row 1 in an empty database, so the update touched nothing and the
//      company name, CR and address the owner had just typed were thrown away.
//      They then inherited OUR name from the column defaults.
//   2. Staff added in the team step were sent with no starting password, which
//      createUser refuses. The wizard ignored the error, so the people simply
//      never appeared.
//   3. Nobody seeded the unit list, so the first product had no unit to pick.
//
// This module is the whole first day, done properly and in one transaction.

import { db } from "./db";
import { settings, users, managedLists } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { UNIT_CATALOGUE } from "@shared/unitCatalogue";

/** The details that make the invoices say who the company is. */
export type BusinessDetails = {
  storeNameEn?: string; storeNameAr?: string;
  addressEn?: string;   addressAr?: string;
  phone?: string; whatsapp?: string; email?: string;
  crNumber?: string; poBox?: string; logoUrl?: string;
  taxRate?: string;
};

const clean = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim();
  return s.length ? s : undefined;
};

/**
 * Write the company identity, creating the settings row if this is a fresh
 * database. Only fields that were actually filled in are written, so a second
 * pass through the wizard cannot blank something already saved.
 */
export async function saveBusinessDetails(input: BusinessDetails) {
  const patch: Record<string, string> = {};
  for (const k of [
    "storeNameEn", "storeNameAr", "addressEn", "addressAr",
    "phone", "whatsapp", "email", "crNumber", "poBox", "logoUrl", "taxRate",
  ] as const) {
    const v = clean((input as any)[k]);
    if (v !== undefined) patch[k] = v;
  }

  const [existing] = await db.select({ id: settings.id }).from(settings).limit(1);
  if (existing) {
    if (Object.keys(patch).length) {
      await db.update(settings).set(patch).where(eq(settings.id, existing.id));
    }
    const [row] = await db.select().from(settings).where(eq(settings.id, existing.id));
    return row;
  }
  const [row] = await db.insert(settings).values(patch as any).returning();
  return row;
}

/**
 * Give a new database the unit list. Idempotent — an existing entry is left
 * exactly as it is, because a product may already be using it.
 */
export async function seedUnits(): Promise<{ added: number; alreadyThere: number }> {
  let added = 0, alreadyThere = 0;
  for (let i = 0; i < UNIT_CATALOGUE.length; i++) {
    const code = UNIT_CATALOGUE[i].code;
    const found = await db.select({ id: managedLists.id }).from(managedLists)
      .where(and(eq(managedLists.listKey, "product_units"), eq(managedLists.value, code)));
    if (found.length) { alreadyThere++; continue; }
    await db.insert(managedLists).values({
      listKey: "product_units", value: code, sortOrder: i,
    });
    added++;
  }
  return { added, alreadyThere };
}

/**
 * A starting password for someone the owner is adding during setup.
 *
 * Readable out loud over a counter, and strong enough to pass
 * assertStrongPassword: two short words and four digits. It is shown to the
 * owner ONCE at the end of the wizard, and the person must change it at first
 * login — so an unread password on a screen cannot become a shared one.
 */
const WORDS = [
  "Sand", "Steel", "Brick", "Cable", "Paint", "Tile", "Pipe", "Board",
  "Cement", "Timber", "Glass", "Stone", "Copper", "Panel", "Beam",
];
export function startingPassword(): string {
  const w = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w()}${w()}${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Has anyone at all been created yet? The gate on the whole setup flow. */
export async function isFreshInstall(): Promise<boolean> {
  const anyone = await db.select({ id: users.id }).from(users).limit(1);
  return anyone.length === 0;
}
