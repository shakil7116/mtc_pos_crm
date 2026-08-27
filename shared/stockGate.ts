// Whether a product may be picked on a document that takes stock OUT
// (invoice, quotation, delivery note).
//
// THE RULE, and why it matters:
//
// The shop carries roughly 4,000 products but only 30-40 sell regularly. Only
// those few are counted and kept accurate. The rest are registered so they can be
// billed with the correct cost — their profit is exact — but their QUANTITY is
// unknown and nobody maintains it.
//
//   trackStock = true   the quantity is real. Zero means genuinely none, so hide
//                       it: billing it would sell stock that is not there.
//
//   trackStock = false  the quantity is UNKNOWN, not zero. The gate must not
//                       apply. Gating it would make the entire long tail
//                       unbillable, which is the exact bug this prevents.
//
// Do not "simplify" this back to a plain quantity check.

export interface StockGateProduct {
  active?: boolean | null;
  trackStock?: boolean | null;
}

/** Is this product's on-hand quantity a real number we maintain? */
export function isStockCounted(product: StockGateProduct): boolean {
  return product.trackStock !== false;
}

/**
 * @param stockGated  true for INV / QT / DN — documents that move stock out.
 *                    false for anything else, where no stock check applies.
 */
export function canPickForSale(
  product: StockGateProduct,
  onHand: number,
  stockGated: boolean,
): boolean {
  if (product.active === false) return false;
  if (!stockGated) return true;
  if (!isStockCounted(product)) return true;   // unknown quantity → never gated
  return (Number(onHand) || 0) > 0;
}

/** What to show under a product in the picker. */
export function stockLabel(product: StockGateProduct, onHand: number, unit = "PCS"): string {
  if (!isStockCounted(product)) return "stock not counted";
  return `${Number(onHand) || 0} ${unit} on hand`;
}
