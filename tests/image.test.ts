import { describe, it, expect } from "vitest";
import {
  fitDimensions, dataUrlBytes, looksLikeImage, mayHaveTransparency, formatBytes,
  PHOTO_MAX_PX, DOC_MAX_PX, LOGO_MAX_PX,
} from "@shared/image";

describe("fitting a picture", () => {
  it("shrinks a phone photo to the long side, keeping its shape", () => {
    const r = fitDimensions(4032, 3024, PHOTO_MAX_PX);
    expect(r.width).toBe(1000);
    expect(r.height).toBe(750);           // 4:3 preserved
  });
  it("works the same for a portrait picture", () => {
    const r = fitDimensions(3024, 4032, PHOTO_MAX_PX);
    expect(r.width).toBe(750);
    expect(r.height).toBe(1000);
  });
  it("never enlarges a small picture", () => {
    expect(fitDimensions(120, 60, LOGO_MAX_PX)).toEqual({ width: 120, height: 60 });
  });
  it("leaves a picture already at the limit alone", () => {
    expect(fitDimensions(1600, 900, DOC_MAX_PX)).toEqual({ width: 1600, height: 900 });
  });
  it("never rounds a sliver down to nothing", () => {
    expect(fitDimensions(10000, 3, 100).height).toBeGreaterThanOrEqual(1);
  });
  it("survives a picture with no size", () => {
    expect(fitDimensions(0, 0, 800)).toEqual({ width: 1, height: 1 });
  });
});

describe("what a stored picture really costs", () => {
  it("reads the true byte count, not the string length", () => {
    // "AAAA" of base64 is 3 bytes, not 4.
    expect(dataUrlBytes("data:image/jpeg;base64,AAAA")).toBe(3);
  });
  it("allows for padding", () => {
    expect(dataUrlBytes("data:image/png;base64,AAA=")).toBe(2);
    expect(dataUrlBytes("data:image/png;base64,AA==")).toBe(1);
  });
  it("is empty for nothing", () => {
    expect(dataUrlBytes("")).toBe(0);
  });
  it("shows a saving in words", () => {
    expect(formatBytes(70_000)).toBe("68 KB");
    expect(formatBytes(3_500_000)).toBe("3.3 MB");
  });
});

describe("what must never be touched", () => {
  it("a PDF is not an image — Expenses and Suppliers both accept one", () => {
    expect(looksLikeImage("application/pdf")).toBe(false);
  });
  it("nor is an SVG, which a canvas would rasterise and ruin", () => {
    expect(looksLikeImage("image/svg+xml")).toBe(false);
  });
  it("a photo is", () => {
    expect(looksLikeImage("image/jpeg")).toBe(true);
    expect(looksLikeImage("image/png")).toBe(true);
  });
  it("nothing at all is not", () => {
    expect(looksLikeImage(undefined)).toBe(false);
  });
});

describe("keeping a logo's transparency", () => {
  it("a PNG logo may see through, so its pixels get checked", () => {
    expect(mayHaveTransparency("image/png")).toBe(true);
    expect(mayHaveTransparency("image/webp")).toBe(true);
  });
  it("a JPEG never can, so it never gets checked", () => {
    expect(mayHaveTransparency("image/jpeg")).toBe(false);
  });
});
