/* ── Boxes and pieces ─────────────────────────────────────────────────────────
   A unit used to be only a word on the screen — BOX, PCS, BAG. Nothing said how
   many pieces are in a box. So receiving 10 boxes added 10, selling 120 pieces
   took away 120, and the figure on the shelf was nonsense within a week.

   That is silent, permanent drift on every item you break down, and a real part
   of the stock that cannot be found when a place is emptied.

   The rule now: stock is ALWAYS counted in the product's own unit — the base.
   A product may also have a bigger buying unit and how many base units are in
   it. Everything entered in the big unit is multiplied on the way in, once, and
   the number kept on the shelf is never ambiguous.

       unit "PCS", packUnit "BOX", packSize 12   →   3 BOX = 36 PCS

   The conversion lives here, alone and pure, because it is applied in five
   different places (receiving, selling, counting, returning, voiding) and they
   must all agree to the piece.
──────────────────────────────────────────────────────────────────────────────*/

export type Packable = {
  /** The base unit — what stock is counted in. */
  unit?: string | null;
  /** The bigger buying unit, if there is one. */
  packUnit?: string | null;
  /** How many base units are in one pack unit. */
  packSize?: number | string | null;
};

const clean = (u: any) => String(u ?? "").trim().toUpperCase();

/** How many base units one of the named unit is worth. Always ≥ 1. */
export function unitFactor(unit: string | null | undefined, product: Packable): number {
  const packUnit = clean(product.packUnit);
  if (!packUnit) return 1;
  const size = Number(product.packSize);
  if (!Number.isFinite(size) || size <= 1) return 1;
  return clean(unit) === packUnit ? size : 1;
}

/** True when this product is bought in one unit and kept in another. */
export function hasPack(product: Packable): boolean {
  const size = Number(product.packSize);
  return !!clean(product.packUnit) && Number.isFinite(size) && size > 1;
}

/** Convert a quantity entered in ANY of the product's units into base units —
 *  the only quantity that is ever written to stock. */
export function toBaseQty(
  qty: number | string, unit: string | null | undefined, product: Packable,
): number {
  const n = Number(qty);
  if (!Number.isFinite(n)) return 0;
  return Number((n * unitFactor(unit, product)).toFixed(4));
}

/** The other direction, for showing a base quantity in the bigger unit. */
export function fromBaseQty(
  baseQty: number | string, unit: string | null | undefined, product: Packable,
): number {
  const n = Number(baseQty);
  if (!Number.isFinite(n)) return 0;
  return Number((n / unitFactor(unit, product)).toFixed(4));
}

/** A price or cost given per pack, expressed per base unit — otherwise a box at
 *  QAR 120 would be recorded as a piece costing QAR 120. */
export function toBaseCost(
  cost: number | string, unit: string | null | undefined, product: Packable,
): number {
  const n = Number(cost);
  if (!Number.isFinite(n)) return 0;
  return Number((n / unitFactor(unit, product)).toFixed(4));
}

/** 127 pieces of a 12-piece box → 10 boxes and 7 loose. */
export function splitPacks(baseQty: number | string, product: Packable): {
  packs: number; loose: number;
} {
  const n = Number(baseQty) || 0;
  if (!hasPack(product)) return { packs: 0, loose: n };
  const size = Number(product.packSize);
  const packs = Math.floor(Math.abs(n) / size) * (n < 0 ? -1 : 1);
  const loose = Number((n - packs * size).toFixed(4));
  return { packs, loose };
}

/** What a warehouse worker would actually say: "127 PCS (10 BOX + 7)". */
export function formatQty(baseQty: number | string, product: Packable): string {
  const n = Number(baseQty) || 0;
  const base = `${Number(n.toFixed(4))} ${clean(product.unit) || "PCS"}`.trim();
  if (!hasPack(product)) return base;
  const { packs, loose } = splitPacks(n, product);
  if (!packs) return base;
  const packUnit = clean(product.packUnit);
  return loose
    ? `${base} (${packs} ${packUnit} + ${loose})`
    : `${base} (${packs} ${packUnit})`;
}

/** Every unit this product may be entered in, biggest first. */
export function unitOptions(product: Packable): string[] {
  const base = clean(product.unit) || "PCS";
  return hasPack(product) ? [clean(product.packUnit), base] : [base];
}

/** Check a pack setup before it is saved. A wrong pack size is worse than none:
 *  it multiplies every future movement of that product by the wrong number. */
export function validatePack(product: Packable): void {
  const packUnit = clean(product.packUnit);
  const rawSize = product.packSize;
  const size = Number(rawSize);
  const hasSize = rawSize !== null && rawSize !== undefined && String(rawSize).trim() !== "" && size !== 0;

  if (!packUnit && !hasSize) return;                    // no pack at all — fine
  if (!packUnit && hasSize) {
    throw new Error("What is the bigger unit called? A pack size needs a name — BOX, BUNDLE, PALLET.");
  }
  if (packUnit && !hasSize) {
    throw new Error(`How many ${clean(product.unit) || "pieces"} are in one ${packUnit}?`);
  }
  if (!Number.isFinite(size) || size <= 1) {
    throw new Error("A pack has to hold more than one — otherwise it is just the same unit.");
  }
  if (packUnit === (clean(product.unit) || "PCS")) {
    throw new Error("The bigger unit has to be different from the unit stock is counted in.");
  }
}
