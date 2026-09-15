import { describe, it, expect } from "vitest";
import { FX_LIST, FX_IDS, fxOf, fxFilter, fxSeed } from "../imageEffects.js";

describe("image effects", () => {
  it("exposes the full catalog", () => {
    const ids = FX_IDS;
    for (const id of ["none", "bw", "sepia", "warm", "cool", "film-grain", "noise", "vignette",
      "vhs", "grunge", "dust", "heavy-noise"]) {
      expect(ids).toContain(id);
    }
    expect(FX_LIST.length).toBe(12);
    for (const f of FX_LIST) {
      expect(typeof f.label).toBe("string");
      expect(typeof f.id).toBe("string");
    }
  });

  it("falls back to None for unknown ids", () => {
    expect(fxOf("mystery").id).toBe("none");
  });

  it("returns no filter for None or zero intensity", () => {
    expect(fxFilter("none", 0.5)).toBe("");
    expect(fxFilter("bw", 0)).toBe("");
    expect(fxFilter("bw", -1)).toBe("");
  });

  it("scales grayscale/sepia by intensity", () => {
    expect(fxFilter("bw", 1)).toBe("grayscale(1.000)");
    expect(fxFilter("bw", 0.5)).toBe("grayscale(0.500)");
    expect(fxFilter("sepia", 1).startsWith("sepia(1.000)")).toBe(true);
  });

  it("keeps warm/cool/vhs as filter strings", () => {
    expect(fxFilter("warm", 1)).toContain("hue-rotate(");
    expect(fxFilter("cool", 1)).toContain("hue-rotate(");
    expect(fxFilter("vhs", 1)).toContain("saturate(");
    expect(fxFilter("grunge", 1)).toContain("grayscale(");
    expect(fxFilter("heavy-noise", 1)).toContain("contrast(");
  });

  it("seeds patterns stably per clip name", () => {
    expect(fxSeed("s3")).toBe(fxSeed("s3"));
    expect(fxSeed("s3")).not.toBe(fxSeed("s4"));
    expect(Number.isInteger(fxSeed("s3"))).toBe(true);
    expect(fxSeed("s3") >>> 0).toBe(fxSeed("s3") >>> 0);
  });
});