// Pictures cost more than anything else in this database.
//
// A phone camera produces a 3-4 MB photo. Stored as base64 in a text column it
// becomes ~5 MB, and that weight is paid again on every backup, every restore
// and every row that reads it back. Measured on the live database: two product
// photos averaged 196 KB each while a whole invoice — the document, its lines,
// the payment and the stock movements — costs about 3 KB. A single uncompressed
// photo outweighs sixty invoices.
//
// So every picture is shrunk in the browser before it is ever sent. This half
// holds the maths, with no DOM in it, so it can be tested; the canvas work is in
// client/src/lib/image.ts.

/** Longest side of an ordinary photo: product, damage, delivery proof, cheque. */
export const PHOTO_MAX_PX = 1000;
export const PHOTO_QUALITY = 0.72;

/**
 * A photographed DOCUMENT — cheque, receipt, supplier invoice, signed delivery
 * note. These are evidence: someone may have to read the number off one months
 * later, so they keep more detail than an ordinary photo. Still a fifteenth of
 * what the phone produced.
 */
export const DOC_MAX_PX = 1600;
export const DOC_QUALITY = 0.75;

/** A letterhead logo prints small but must stay crisp, so less shrinking. */
export const LOGO_MAX_PX = 600;
export const LOGO_QUALITY = 0.85;

/**
 * Fit a picture inside a maxPx square, keeping its shape.
 * Never enlarges — blowing a small picture up wastes space and gains nothing.
 */
export function fitDimensions(
  width: number, height: number, maxPx: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const longest = Math.max(w, h);
  if (!Number.isFinite(longest) || longest <= maxPx) return { width: w, height: h };
  const scale = maxPx / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * What a data: URL actually costs to store. base64 carries 3 bytes in every 4
 * characters, so the string length overstates the real size by a third — the
 * number that matters for a size limit is this one.
 */
export function dataUrlBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const marker = ";base64,";
  const at = dataUrl.indexOf(marker);
  if (at < 0) return dataUrl.length;
  const payload = dataUrl.slice(at + marker.length);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

/**
 * Is this something a canvas can redraw? A PDF is not — Expenses and Suppliers
 * both accept one, and pushing it through a canvas would destroy the file.
 * Anything that is not a picture passes through untouched.
 */
export function looksLikeImage(mimeType: string | undefined | null): boolean {
  const t = (mimeType || "").toLowerCase();
  return t.startsWith("image/") && !t.includes("svg");
}

/**
 * A JPEG can never carry transparency, so it is only worth scanning the pixels
 * of formats that can. A company logo is usually a PNG with a see-through
 * background — flattening it to JPEG puts a black box on the letterhead.
 */
export function mayHaveTransparency(mimeType: string | undefined | null): boolean {
  const t = (mimeType || "").toLowerCase();
  return t.includes("png") || t.includes("webp") || t.includes("gif");
}

/** Human-readable size, for telling someone why their picture was refused. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
