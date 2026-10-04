import { describe, it, expect } from "vitest";
import {
  makeLowerThird,
  clampLowerThird,
  lowerThirdActiveAt,
  lowerThirdRect,
  lowerThirdBounds,
  lowerThirdSettings,
  DEFAULT_KEY_COLOR,
  LOWER_THIRD_MIN_SIZE,
  LOWER_THIRD_MAX_SIZE,
} from "../lowerThird.js";

describe("makeLowerThird", () => {
  it("defaults to an enabled, keyed clip at the bottom left", () => {
    const lt = makeLowerThird("a", { sourceDuration: 4 });
    expect(lt.id).toBe("a");
    expect(lt.enabled).toBe(true);
    expect(lt.keyEnabled).toBe(true);
    expect(lt.keyColor).toBe(DEFAULT_KEY_COLOR);
    expect(lt.start).toBe(0);
    expect(lt.duration).toBe(4);
    expect(lt.y).toBeGreaterThan(0.5);   // lower half
    expect(lt.x).toBeLessThan(0.5);      // and to the left
  });

  it("clamps size into the allowed range", () => {
    expect(makeLowerThird("a", { size: 0 }).size).toBe(LOWER_THIRD_MIN_SIZE);
    expect(makeLowerThird("a", { size: 99 }).size).toBe(LOWER_THIRD_MAX_SIZE);
  });

  it("clamps the key sliders to 0..1", () => {
    const lt = makeLowerThird("a", { similarity: 9, smoothness: -4, despill: 3 });
    expect(lt.similarity).toBe(1);
    expect(lt.smoothness).toBe(0);
    expect(lt.despill).toBe(1);
  });

  it("survives a missing or NaN duration", () => {
    expect(makeLowerThird("a", {}).duration).toBeGreaterThan(0);
    expect(makeLowerThird("a", { sourceDuration: NaN }).duration).toBeGreaterThan(0);
  });
});

describe("clampLowerThird", () => {
  it("keeps a clip dragged past the end inside the timeline", () => {
    const c = clampLowerThird({ start: 97, duration: 3 }, 100);
    expect(c.start).toBe(97);
    const over = clampLowerThird({ start: 99, duration: 3 }, 100);
    expect(over.start).toBe(97);
  });

  it("never allows a negative start", () => {
    expect(clampLowerThird({ start: -5, duration: 2 }, 100).start).toBe(0);
  });

  it("pins a clip longer than the project to the start instead of dropping it", () => {
    const c = clampLowerThird({ start: 10, duration: 40 }, 12);
    expect(c.start).toBe(0);
    expect(c.duration).toBe(40);
  });

  it("uses the clip length as the span when the project length is unknown", () => {
    expect(clampLowerThird({ start: 4, duration: 3 }, 0).start).toBe(0);
  });

  it("leaves an in-range clip untouched", () => {
    const c = clampLowerThird({ start: 10, duration: 3 }, 100);
    expect(c.start).toBe(10);
    expect(c.duration).toBe(3);
  });
});

describe("lowerThirdActiveAt", () => {
  const lt = { start: 2, duration: 3, enabled: true };
  it("is on screen across its span", () => {
    expect(lowerThirdActiveAt(lt, 2)).toBe(true);
    expect(lowerThirdActiveAt(lt, 4.9)).toBe(true);
  });
  it("is a half-open range so neighbours hand over cleanly", () => {
    expect(lowerThirdActiveAt(lt, 5)).toBe(false);
    expect(lowerThirdActiveAt(lt, 1.99)).toBe(false);
  });
  it("skips a disabled clip", () => {
    expect(lowerThirdActiveAt({ ...lt, enabled: false }, 3)).toBe(false);
  });
  it("treats a missing enabled flag as on", () => {
    expect(lowerThirdActiveAt({ start: 0, duration: 1 }, 0.5)).toBe(true);
  });
});

describe("lowerThirdRect", () => {
  const lt = { x: 0.5, y: 0.5, size: 0.25 };
  it("centres the clip on its anchor", () => {
    const r = lowerThirdRect(lt, 1000, 500, 2);
    expect(r.x + r.w / 2).toBeCloseTo(500, 6);
    expect(r.y + r.h / 2).toBeCloseTo(250, 6);
  });
  it("scales with the frame so 720p and 4K agree", () => {
    const a = lowerThirdRect(lt, 1280, 720, 16 / 9);
    const b = lowerThirdRect(lt, 3840, 2160, 16 / 9);
    expect(b.w / a.w).toBeCloseTo(3, 6);
    expect(b.x / a.x).toBeCloseTo(3, 6);
  });
  it("derives height from the source aspect", () => {
    const r = lowerThirdRect(lt, 1000, 1000, 4 / 3);
    expect(r.h).toBeCloseTo(r.w * 3 / 4, 6);
  });
  it("falls back to 16:9 for a nonsense aspect", () => {
    const r = lowerThirdRect(lt, 1000, 1000, 0);
    expect(r.w / r.h).toBeCloseTo(16 / 9, 6);
  });
  it("keeps a huge clip from covering the whole frame", () => {
    const r = lowerThirdRect({ x: 0.5, y: 0.5, size: 50 }, 1000, 1000, 1);
    expect(r.w).toBeLessThanOrEqual(1000);
  });
});

describe("lowerThirdBounds", () => {
  it("mirrors clampLowerThird for the timeline", () => {
    expect(lowerThirdBounds({ start: 99, duration: 3 }, 100)).toEqual({ start: 97, duration: 3 });
    expect(lowerThirdBounds({ start: 5, duration: 3 }, 100)).toEqual({ start: 5, duration: 3 });
  });
});

describe("lowerThirdSettings", () => {
  it("keeps placement and key settings but drops session-only handles", () => {
    const lt = makeLowerThird("a", { sourceDuration: 4 });
    const full = { ...lt, file: new File(["x"], "v.mp4"), url: "blob:x", thumb: "data:," };
    const s = lowerThirdSettings(full);
    expect(s.file).toBeUndefined();
    expect(s.url).toBeUndefined();
    expect(s.thumb).toBeUndefined();
    expect(s.keyColor).toBe(lt.keyColor);
    expect(s.similarity).toBe(lt.similarity);
    expect(s.x).toBe(lt.x);
    expect(JSON.stringify(s)).not.toContain("blob:");
  });
});

describe("lower third trims", () => {
  it("starts with no offset into the source", () => {
    expect(makeLowerThird("a", { sourceDuration: 4 }).offset).toBe(0);
  });
  it("keeps a head trim's offset and shortens the clip by the same amount", () => {
    // Timeline 2.0-4.0 out of a 4s file: start 1s in, 1s of head removed.
    const lt = clampLowerThird({ start: 1, duration: 2, offset: 1, sourceDuration: 4 }, 10);
    expect(lt.start).toBe(1);
    expect(lt.offset).toBe(1);
    expect(lt.duration).toBe(2);
  });
  it("clamps offset so the window can't run past the end of the file", () => {
    const lt = clampLowerThird({ start: 0, duration: 4, offset: 99, sourceDuration: 4 }, 10);
    expect(lt.offset).toBeLessThan(4);
    expect(lt.offset + lt.duration).toBeLessThanOrEqual(4.001);
  });
  it("shortens duration when the offset eats into the source tail", () => {
    const lt = clampLowerThird({ start: 0, duration: 3, offset: 2, sourceDuration: 4 }, 10);
    expect(lt.offset).toBe(2);
    expect(lt.duration).toBe(2); // only 2s of file left after the offset
  });
  it("never lets a trim collapse the clip below 0.1s", () => {
    const lt = clampLowerThird({ start: 0, duration: 0, offset: 3.99, sourceDuration: 4 }, 10);
    expect(lt.duration).toBeGreaterThanOrEqual(0.1);
  });
  it("ignores source bounds when the source duration is unknown", () => {
    const lt = clampLowerThird({ start: 0, duration: 3, offset: 0 }, 10);
    expect(lt.duration).toBe(3);
  });
  it("keeps the visible window inside the timeline after a tail trim", () => {
    const lt = clampLowerThird({ start: 8, duration: 4, sourceDuration: 4 }, 10);
    expect(lt.start + lt.duration).toBeLessThanOrEqual(10);
  });
});
