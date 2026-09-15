import { describe, it, expect } from "vitest";
import { mixTransitions, TRANSITIONS } from "../transitions.js";

// A deterministic rnd() that yields the given fractions in order, then repeats.
const seq = (...vals) => {
  let i = 0;
  return () => vals[(i++) % vals.length];
};

// A minimal canvas 2D context that records save/restore calls so we can assert
// every painter leaves the state stack exactly as it found it (an unbalanced
// restore previously left a lingering scale that froze the whole timeline).
function mockCtx() {
  const log = [];
  const ctx = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    save: () => log.push("save"),
    restore: () => log.push("restore"),
    scale: () => log.push("scale"),
    translate: () => log.push("translate"),
    drawImage: () => log.push("draw"),
    beginPath: () => { log.push("beginPath"); return ctx; },
    rect: () => log.push("rect"),
    clip: () => log.push("clip"),
    arc: () => log.push("arc"),
  };
  return { ctx, log };
}

describe("TRANSITIONS", () => {
  for (const [id, def] of Object.entries(TRANSITIONS)) {
    it(`${id} balances every save() with a restore()`, () => {
      if (!def.canvas) return;
      const { ctx, log } = mockCtx();
      def.canvas(ctx, { naturalWidth: 100, naturalHeight: 100 }, { naturalWidth: 100, naturalHeight: 100 }, 0.5, 800, 600);
      const saves = log.filter((x) => x === "save").length;
      const restores = log.filter((x) => x === "restore").length;
      expect(restores).toBe(saves);
    });

    it(`${id} paints null frames without throwing (gaps / not-yet-decoded video)`, () => {
      if (!def.canvas) return;
      const { ctx } = mockCtx();
      expect(() => def.canvas(ctx, null, null, 0.5, 800, 600)).not.toThrow();
      expect(() => def.canvas(ctx, { naturalWidth: 100, naturalHeight: 100 }, null, 0.5, 800, 600)).not.toThrow();
    });
  }
});

describe("mixTransitions", () => {
  it("returns [] for empty picks or non-positive n", () => {
    expect(mixTransitions([], 5)).toEqual([]);
    expect(mixTransitions(["fade"], 0)).toEqual([]);
    expect(mixTransitions(["fade"], -2)).toEqual([]);
    expect(mixTransitions(null, 3)).toEqual([]);
  });

  it("repeats the single pick across all cuts", () => {
    expect(mixTransitions(["fade"], 4)).toEqual(["fade", "fade", "fade", "fade"]);
  });

  it("never places the same transition on adjacent cuts (2+ picks)", () => {
    const out = mixTransitions(["a", "b", "c"], 6, () => 0);
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
    for (const id of out) expect(["a", "b", "c"]).toContain(id);
    expect(out.length).toBe(6);
  });

  it("is deterministic for a fixed rnd sequence", () => {
    const out = mixTransitions(["a", "b"], 4, seq(0.0));
    expect(out).toEqual(["a", "b", "a", "b"]);
  });
});
