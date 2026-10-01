import { describe, it, expect } from "vitest";
import { parseTimestampName } from "../timestamp";

// Pure logic mirrors of the BG clip split/duplicate in app/page.js,
// so the math is pinned even though the state lives in React.
function splitClip(c, at) {
  const cutAt = Math.min(Math.max(at, c.start + 0.2), c.start + c.duration - 0.2);
  if (!(cutAt > c.start && cutAt < c.start + c.duration)) return null;
  const leftDur = cutAt - c.start;
  return [
    { ...c, duration: leftDur },
    { ...c, id: "new", start: cutAt, offset: (c.offset || 0) + leftDur, duration: c.duration - leftDur },
  ];
}

describe("BG clip split", () => {
  const clip = { id: "bg1", start: 10, offset: 2, duration: 8, volume: 1 };

  it("splits at the playhead with correct offsets", () => {
    const [left, right] = splitClip(clip, 14);
    expect(left.duration).toBe(4);
    expect(right.start).toBe(14);
    expect(right.offset).toBe(6); // 2 + 4
    expect(right.duration).toBe(4);
    expect(left.duration + right.duration).toBe(clip.duration);
  });

  it("clamps cuts too close to the edges inward", () => {
    // 10.1 clamps to 10.2 (start + 0.2) — still a valid split
    const [left] = splitClip(clip, 10.1);
    expect(left.duration).toBeCloseTo(0.2, 5);
    // a cut exactly at the start clamps inward too
    const [l2] = splitClip(clip, 10);
    expect(l2.duration).toBeCloseTo(0.2, 5);
  });
});

describe("timeline image timestamp validation", () => {
  it("accepts timestamp names, rejects the rest", () => {
    expect(parseTimestampName("0-05.jpg")).toBe(5);
    expect(parseTimestampName("1-30.png")).toBe(90);
    expect(parseTimestampName("0-00.png_213412342134.jpeg.mp4")).toBe(0);
    expect(parseTimestampName("photo.jpg")).toBeNull();
    expect(parseTimestampName("my image.png")).toBeNull();
    expect(parseTimestampName("")).toBeNull();
  });
});
