// Generates the PWA icons. No image library needed — PNG is just a few chunks
// and zlib, both of which Node already has.
//
// Re-run it any time to change the colours:
//   node scripts/make-pwa-icons.mjs
import fs from "fs";
import path from "path";
import zlib from "zlib";

const OUT = path.resolve("client/public");

// MTC brand: deep slate ground, the gold already used across the invoice UI.
const BG = [15, 23, 42];      // slate-900
const FG = [212, 160, 23];    // #d4a017

// ── minimal PNG writer ───────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of size*size*4 */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  // 10,11,12 = compression, filter, interlace — all 0

  // Each scanline is prefixed with filter byte 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const o = y * (size * 4 + 1);
    raw[o] = 0;
    rgba.copy ? rgba.copy(raw, o + 1, y * size * 4, (y + 1) * size * 4)
              : Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, o + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── drawing ──────────────────────────────────────────────────────────────────
function makeIcon(size, { padding = 0, rounded = true } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const o = (y * size + x) * 4;
    // simple source-over so edges can be softened
    const inv = (255 - a) / 255, f = a / 255;
    px[o] = px[o] * inv + r * f;
    px[o + 1] = px[o + 1] * inv + g * f;
    px[o + 2] = px[o + 2] * inv + b * f;
    px[o + 3] = Math.max(px[o + 3], a);
  };

  const pad = Math.round(size * padding);
  const inner = size - pad * 2;
  const radius = rounded ? inner * 0.22 : 0;

  // Ground — a rounded square, anti-aliased at the corners.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lx = x - pad, ly = y - pad;
      if (lx < 0 || ly < 0 || lx >= inner || ly >= inner) continue;
      let a = 255;
      if (radius > 0) {
        const cx = Math.min(lx, inner - 1 - lx), cy = Math.min(ly, inner - 1 - ly);
        if (cx < radius && cy < radius) {
          const d = Math.hypot(radius - cx, radius - cy);
          if (d > radius) continue;
          if (d > radius - 1.5) a = Math.round(255 * (radius - d) / 1.5);
        }
      }
      set(x, y, BG, a);
    }
  }

  // A bold "M" in gold: two uprights and two diagonals meeting at the middle.
  const s = inner, ox = pad, oy = pad;
  const top = oy + s * 0.30, bot = oy + s * 0.70;
  const left = ox + s * 0.26, right = ox + s * 0.74, midX = ox + s * 0.50;
  const midY = oy + s * 0.56;
  const stroke = Math.max(2, s * 0.085);

  const line = (x0, y0, x1, y1) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      const r = stroke / 2;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          const d = Math.hypot(dx, dy);
          if (d > r) continue;
          const a = d > r - 1 ? Math.round(255 * (r - d)) : 255;
          set(Math.round(cx + dx), Math.round(cy + dy), FG, Math.min(255, Math.max(0, a)));
        }
      }
    }
  };

  line(left, bot, left, top);      // left upright
  line(left, top, midX, midY);     // down to the middle
  line(midX, midY, right, top);    // back up
  line(right, top, right, bot);    // right upright

  return encodePng(size, px);
}

fs.mkdirSync(OUT, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, opts: {} },
  { file: "icon-512.png", size: 512, opts: {} },
  // Maskable icons get cropped to a circle on Android, so the mark needs breathing room.
  { file: "icon-maskable-512.png", size: 512, opts: { padding: 0.10, rounded: false } },
  { file: "apple-touch-icon.png", size: 180, opts: { rounded: false } },
];

for (const t of targets) {
  const buf = makeIcon(t.size, t.opts);
  fs.writeFileSync(path.join(OUT, t.file), buf);
  console.log(`  ${String(buf.length).padStart(7)} bytes  ${t.file}  (${t.size}x${t.size})`);
}
console.log("\nicons written to client/public/");
