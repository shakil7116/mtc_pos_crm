// Shrink a picture in the browser, before it is ever sent.
//
// Every file input in the app goes through here. The maths and the reasoning
// live in shared/image.ts; this half does the canvas work.
//
// Three things it must never do:
//   1. Touch a PDF. Expenses and Suppliers both accept one.
//   2. Flatten a transparent logo onto black. The letterhead would be ruined.
//   3. Lose an upload it cannot decode. An iPhone HEIC will not open in a
//      canvas on a desktop browser; the file goes through unshrunk rather than
//      failing in the user's face.

import {
  PHOTO_MAX_PX, PHOTO_QUALITY, LOGO_MAX_PX, LOGO_QUALITY, DOC_MAX_PX, DOC_QUALITY,
  fitDimensions, looksLikeImage, mayHaveTransparency, dataUrlBytes, formatBytes,
} from "@shared/image";

export { dataUrlBytes, formatBytes };

export type ShrinkOptions = {
  /** Longest side, in pixels. Defaults to an ordinary photo. */
  maxPx?: number;
  /** JPEG quality, 0-1. Ignored when the picture keeps transparency. */
  quality?: number;
};

/** A logo keeps its transparency and stays crisper than a photo. */
export const LOGO: ShrinkOptions = { maxPx: LOGO_MAX_PX, quality: LOGO_QUALITY };
/** Evidence that must stay readable: cheque, receipt, supplier invoice, signed DN. */
export const DOCUMENT: ShrinkOptions = { maxPx: DOC_MAX_PX, quality: DOC_QUALITY };
/** Everything else: product photo, damage picture. */
export const PHOTO: ShrinkOptions = { maxPx: PHOTO_MAX_PX, quality: PHOTO_QUALITY };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);   // undecodable — caller falls back
    img.src = dataUrl;
  });
}

/** Does any pixel show through? Only worth asking of formats that can. */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Every 4th byte is alpha. Step over pixels — one see-through pixel is
    // enough to settle it, and scanning a million of them one by one is slow.
    for (let i = 3; i < data.length; i += 4 * 16) if (data[i] < 250) return true;
    return false;
  } catch {
    return false;   // a tainted canvas cannot be read; assume opaque
  }
}

/**
 * Read a file as a data URL, shrinking it if it is a picture.
 * Anything else — a PDF above all — comes back exactly as it went in.
 */
export async function shrinkImage(file: File, opts: ShrinkOptions = {}): Promise<string> {
  const raw = await readAsDataUrl(file);
  if (!looksLikeImage(file.type)) return raw;

  const img = await loadImage(raw);
  if (!img || !img.width || !img.height) return raw;

  const maxPx = opts.maxPx ?? PHOTO_MAX_PX;
  const quality = opts.quality ?? PHOTO_QUALITY;
  const { width, height } = fitDimensions(img.width, img.height, maxPx);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, width, height);

  const keepAlpha = mayHaveTransparency(file.type) && hasTransparency(canvas);
  const out = keepAlpha
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", quality);

  // A tiny PNG logo can come out heavier than the file that went in — only
  // keep the new one if it actually saved something.
  return dataUrlBytes(out) < dataUrlBytes(raw) ? out : raw;
}

/** Shrink, and refuse anything still too heavy afterwards. */
export async function shrinkImageWithin(
  file: File, maxBytes: number, opts: ShrinkOptions = {},
): Promise<string> {
  const out = await shrinkImage(file, opts);
  if (dataUrlBytes(out) > maxBytes) {
    throw new Error(
      `That picture is still ${formatBytes(dataUrlBytes(out))} after shrinking — the limit is ${formatBytes(maxBytes)}.`,
    );
  }
  return out;
}
