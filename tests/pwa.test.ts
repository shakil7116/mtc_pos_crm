import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// A broken manifest does not error — the browser just quietly refuses to offer
// "Install", and nobody finds out until someone asks why the icon never appeared.
// So the requirements are asserted here instead.

const PUBLIC = path.resolve("client/public");
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, "manifest.webmanifest"), "utf8"));
const sw = fs.readFileSync(path.join(PUBLIC, "sw.js"), "utf8");

describe("manifest — what a browser needs before it will offer Install", () => {
  it("has a name and a short name", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    // Home screens truncate past ~12 characters.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("opens standalone, not in a browser tab", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("starts at the app root and covers the whole app", () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("carries both icon sizes Chrome requires", () => {
    const sizes = manifest.icons.map((i: any) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("has a maskable icon so Android does not crop the mark badly", () => {
    const maskable = manifest.icons.filter((i: any) => String(i.purpose).includes("maskable"));
    expect(maskable.length).toBeGreaterThan(0);
    expect(maskable[0].sizes).toBe("512x512");
  });

  it("sets colours so the app does not flash white on launch", () => {
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("manifest — every file it names actually exists", () => {
  it("has all its icons on disk", () => {
    for (const icon of manifest.icons) {
      const file = path.join(PUBLIC, icon.src.replace(/^\//, ""));
      expect(fs.existsSync(file), `${icon.src} is missing`).toBe(true);
      expect(fs.statSync(file).size, `${icon.src} is empty`).toBeGreaterThan(500);
    }
  });

  it("has the shortcut icons too", () => {
    for (const s of manifest.shortcuts || []) {
      for (const icon of s.icons || []) {
        expect(fs.existsSync(path.join(PUBLIC, icon.src.replace(/^\//, ""))),
          `${icon.src} is missing`).toBe(true);
      }
    }
  });

  it("ships an apple-touch-icon, which iOS needs and the manifest cannot supply", () => {
    expect(fs.existsSync(path.join(PUBLIC, "apple-touch-icon.png"))).toBe(true);
  });

  it("ships the offline page the worker falls back to", () => {
    expect(fs.existsSync(path.join(PUBLIC, "offline.html"))).toBe(true);
  });
});

describe("service worker — the money rule", () => {
  it("returns early for /api so live data is NEVER cached", () => {
    // Stale stock or a stale price is a wrong number wearing a convincing face.
    expect(sw).toMatch(/url\.pathname\.startsWith\("\/api\/"\)\s*\)\s*return/);
  });

  it("never caches a non-GET request", () => {
    expect(sw).toMatch(/req\.method !== "GET"/);
  });

  it("cleans up old cache versions on activate", () => {
    expect(sw).toContain("caches.delete");
  });

  it("takes control immediately so a fix cannot be stranded behind an old worker", () => {
    expect(sw).toContain("skipWaiting");
    expect(sw).toContain("clients.claim");
  });

  it("leaves cross-origin requests alone", () => {
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/);
  });
});
