import { describe, it, expect } from "vitest";
import {
  rgbToChroma,
  parseHexColor,
  chromaMagnitude,
  chromaAngleDistance,
  keyAlpha,
  despillChannel,
  keyImageData,
} from "../chromaKey.js";

// Studio green, the default key colour.
const GREEN = { r: 0, g: 177, b: 64 };
const key = rgbToChroma(GREEN.r, GREEN.g, GREEN.b);
const ang = (c) => chromaAngleDistance(c.cb, c.cr, key.cb, key.cr);
const at = (r, g, b) => ang(rgbToChroma(r, g, b));

function img(pixels) {
  return { data: new Uint8ClampedArray(pixels.flat()), width: pixels.length, height: 1 };
}

describe("parseHexColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseHexColor("#00b140")).toEqual(GREEN);
  });
  it("expands 3-digit shorthand", () => {
    expect(parseHexColor("#0b1")).toEqual({ r: 0, g: 187, b: 17 });
  });
  it("works without the hash", () => {
    expect(parseHexColor("00b140")).toEqual(GREEN);
  });
  it("returns null for junk so the caller can fall back", () => {
    expect(parseHexColor("nope")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
    expect(parseHexColor(null)).toBeNull();
  });
});

describe("rgbToChroma", () => {
  it("is neutral (128,128) for grey", () => {
    const { cb, cr } = rgbToChroma(128, 128, 128);
    expect(cb).toBeCloseTo(128, 5);
    expect(cr).toBeCloseTo(128, 5);
  });
});

describe("chromaMagnitude", () => {
  it("is zero for every neutral", () => {
    for (const v of [0, 64, 128, 217, 255]) {
      expect(chromaMagnitude(...Object.values(rgbToChroma(v, v, v)))).toBeCloseTo(0, 6);
    }
  });
  it("is larger for saturated colour than for a muted tone", () => {
    const vivid = chromaMagnitude(...Object.values(rgbToChroma(0, 255, 0)));
    const muted = chromaMagnitude(...Object.values(rgbToChroma(107, 142, 35)));
    expect(vivid).toBeGreaterThan(muted);
    expect(muted).toBeGreaterThan(0);
  });
});

describe("chromaAngleDistance", () => {
  it("is zero for the key colour", () => {
    expect(ang(key)).toBeCloseTo(0, 9);
  });
  it("keeps the key family far closer than any subject colour", () => {
    // The whole point of using angle rather than magnitude: these greens span a
    // big magnitude range yet must all sit inside the key band.
    const screenGreens = [[0, 177, 64], [0, 255, 0], [31, 92, 31], [10, 200, 40], [0, 128, 0]];
    const subjects = [[220, 162, 132], [232, 196, 168], [185, 28, 28], [30, 64, 175], [11, 31, 58]];
    for (const g of screenGreens) expect(at(...g)).toBeLessThan(0.12);
    for (const s of subjects) expect(at(...s)).toBeGreaterThan(0.4);
  });
  it("cannot separate drab olive from navy — a known limitation", () => {
    // Documented rather than hidden: olive clothing on a green screen sits at
    // 0.34, close enough to navy (0.40) that no threshold separates them. This
    // is the trade-off the similarity slider exists to manage.
    expect(at(107, 142, 35)).toBeGreaterThan(0.3);
    expect(at(107, 142, 35)).toBeLessThan(at(30, 64, 175));
  });
  it("scales with luma: the same hue at half brightness keys identically", () => {
    expect(at(0, 88, 32)).toBeCloseTo(at(0, 177, 64), 2);
    expect(at(0, 88, 32)).toBeLessThan(0.002);
  });
  it("is symmetric and bounded to 0..1", () => {
    const skin = rgbToChroma(220, 162, 132);
    expect(ang(skin)).toBeCloseTo(chromaAngleDistance(key.cb, key.cr, skin.cb, skin.cr), 9);
    for (let r = 0; r < 256; r += 17) {
      const d = at(r, (r * 7) % 256, (r * 13) % 256);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
});

describe("keyAlpha", () => {
  it("is fully transparent at or below the similarity threshold", () => {
    expect(keyAlpha(0.05, 0.18, 0.1)).toBe(0);
    expect(keyAlpha(0.18, 0.18, 0.1)).toBe(0);
  });
  it("is fully opaque past the outer edge", () => {
    expect(keyAlpha(0.4, 0.18, 0.1)).toBe(1);
  });
  it("ramps across the smoothness band", () => {
    const mid = keyAlpha(0.23, 0.18, 0.1); // halfway across 0.18..0.28
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
  it("clamps rather than going negative or past 1", () => {
    expect(keyAlpha(0, 0.18, 0.1)).toBe(0);
    expect(keyAlpha(9, 0.18, 0.1)).toBe(1);
  });
  it("still ramps when smoothness is 0 (avoids divide-by-zero)", () => {
    expect(keyAlpha(0.1, 0.18, 0)).toBe(0);
    expect(keyAlpha(0.5, 0.18, 0)).toBe(1);
    expect(Number.isFinite(keyAlpha(0.19, 0.18, 0))).toBe(true);
  });
});

describe("despillChannel", () => {
  it("clamps the green channel when it is the highest", () => {
    expect(despillChannel(100, 200, 110, 1, true)).toBe(110);
  });
  it("leaves the pixel alone at despill 0", () => {
    expect(despillChannel(100, 200, 110, 0, true)).toBe(200);
  });
  it("only partly pulls at despill 0.5", () => {
    expect(despillChannel(100, 200, 110, 0.5, true)).toBe(155);
  });
  it("does nothing when green is not the dominant channel", () => {
    expect(despillChannel(200, 100, 110, 1, true)).toBe(100);
  });
  it("does nothing for non-green key colours", () => {
    expect(despillChannel(100, 200, 110, 1, false)).toBe(200);
  });
});

describe("keyImageData", () => {
  const opts = { keyColor: "#00b140", similarity: 0.18, smoothness: 0.1, despill: 0.6 };

  it("clears the green backdrop and keeps the subject opaque", () => {
    const im = img([[0, 177, 64, 255], [220, 170, 140, 255]]);
    const cleared = keyImageData(im, opts);
    expect(cleared).toBe(1);
    expect(im.data[3]).toBe(0);
    expect(im.data[7]).toBe(255);
  });

  it("keeps mid grey — the bug that ruled out magnitude distance", () => {
    const im = img([[128, 128, 128, 255], [217, 217, 217, 255], [255, 255, 255, 255]]);
    expect(keyImageData(im, opts)).toBe(0);
    expect(im.data[3]).toBe(255);
    expect(im.data[7]).toBe(255);
    expect(im.data[11]).toBe(255);
  });

  it("clears a bright green backdrop, which magnitude distance would have kept", () => {
    const im = img([[0, 255, 0, 255]]);
    keyImageData(im, opts);
    expect(im.data[3]).toBe(0);
  });

  it("keeps saturated clothing of other hues", () => {
    const im = img([[30, 64, 175, 255], [185, 28, 28, 255], [59, 36, 22, 255]]);
    expect(keyImageData(im, opts)).toBe(0);
    expect(im.data[3]).toBe(255);
    expect(im.data[7]).toBe(255);
    expect(im.data[11]).toBe(255);
  });

  it("despills a partially transparent fringe pixel", () => {
    const im = img([[0, 177, 64, 255]]);
    keyImageData(im, opts);
    expect(im.data[1]).toBeLessThan(177);
  });

  it("leaves a fully transparent pixel transparent", () => {
    const im = img([[220, 170, 140, 0]]);
    keyImageData(im, opts);
    expect(im.data[3]).toBe(0);
  });

  it("preserves existing alpha by multiplying rather than overwriting", () => {
    const im = img([[220, 170, 140, 128]]);
    keyImageData(im, opts);
    expect(im.data[3]).toBe(128);
  });

  it("falls back to studio green when the colour is unparseable", () => {
    const im = img([[0, 177, 64, 255]]);
    keyImageData(im, { ...opts, keyColor: "garbage" });
    expect(im.data[3]).toBe(0);
  });

  it("keys a blue screen when that colour is chosen", () => {
    const im = img([[20, 60, 200, 255]]);
    keyImageData(im, { ...opts, keyColor: "#1440c8" });
    expect(im.data[3]).toBe(0);
  });

  it("a wider similarity band eats into the subject", () => {
    const loose = img([[220, 170, 140, 255]]);
    keyImageData(loose, { ...opts, similarity: 0.6 });
    expect(loose.data[3]).toBeLessThan(255);
  });
});
