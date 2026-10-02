import { describe, it, expect } from "vitest";
import {
  METER_SCALE,
  FLOOR_DB,
  toDb,
  fromDb,
  dbToPos,
  ampToPos,
  advanceMeter,
  newMeterState,
  meterZone,
  meterZones,
  rms,
  buildMeterStrips,
  VOICE_STRIP,
  bgStripId,
  sfxStripId,
} from "../audioMeter.js";

describe("toDb / fromDb", () => {
  it("converts linear amplitude to decibels", () => {
    expect(toDb(1)).toBeCloseTo(0, 6);
    expect(toDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(toDb(0.1)).toBeCloseTo(-20, 6);
  });
  it("treats silence (and negatives) as -Infinity", () => {
    expect(toDb(0)).toBe(-Infinity);
    expect(toDb(-1)).toBe(-Infinity);
  });
  it("round-trips through fromDb", () => {
    for (const db of [0, -6, -20, -45]) expect(toDb(fromDb(db))).toBeCloseTo(db, 6);
    expect(fromDb(-Infinity)).toBe(0);
  });
});

describe("dbToPos", () => {
  it("pins the extremes", () => {
    expect(dbToPos(0)).toBe(1);
    expect(dbToPos(3)).toBe(1); // clipping above the top of the scale
    expect(dbToPos(FLOOR_DB)).toBe(0);
    expect(dbToPos(-90)).toBe(0); // below the floor
    expect(dbToPos(-Infinity)).toBe(0);
  });
  it("gives every scale step an equal slice of the bar", () => {
    for (let i = 1; i < METER_SCALE.length; i++) {
      const top = dbToPos(METER_SCALE[i - 1]);
      const bottom = dbToPos(METER_SCALE[i]);
      expect(top - bottom).toBeCloseTo(1 / (METER_SCALE.length - 1), 6);
    }
  });
  it("is monotonically decreasing in dB", () => {
    let prev = 1;
    for (let db = 0; db >= FLOOR_DB; db -= 0.5) {
      const pos = dbToPos(db);
      expect(pos).toBeLessThanOrEqual(prev + 1e-9);
      prev = pos;
    }
  });
  it("places the colour boundaries at -6 and -3 dB", () => {
    expect(dbToPos(-6)).toBeCloseTo(meterZones().green, 6);
    expect(dbToPos(-3)).toBeCloseTo(meterZones().green + meterZones().amber, 6);
  });
});

describe("ampToPos", () => {
  it("reads a linear level the same as the dB path", () => {
    expect(ampToPos(1)).toBeCloseTo(dbToPos(0), 6);
    expect(ampToPos(fromDb(-12))).toBeCloseTo(dbToPos(-12), 6);
    expect(ampToPos(0)).toBe(0);
  });
});

describe("advanceMeter", () => {
  it("rises instantly to the target", () => {
    const m = newMeterState(0);
    advanceMeter(m, 0.8, 16);
    expect(m.level).toBeCloseTo(0.8, 6);
  });
  it("falls gradually, not instantly", () => {
    const m = newMeterState(0);
    advanceMeter(m, 1, 16);
    advanceMeter(m, 0, 16);
    expect(m.level).toBeLessThan(1);
    expect(m.level).toBeGreaterThan(0.9);
  });
  it("decays to the target instead of overshooting", () => {
    const m = newMeterState(0);
    advanceMeter(m, 1, 16);
    advanceMeter(m, 0.2, 16);
    expect(m.level).toBeGreaterThanOrEqual(0.2);
  });
  it("holds the peak line for PEAK_HOLD_MS before it falls", () => {
    const m = newMeterState(0);
    advanceMeter(m, 0.9, 16); // sets peak at now=0
    for (let i = 0; i < 40; i++) { m.now = i * 16; advanceMeter(m, 0, 16); } // 640ms
    expect(m.peak).toBeCloseTo(0.9, 6);
    for (let i = 41; i < 140; i++) { m.now = i * 16; advanceMeter(m, 0, 16); } // ~1.6s
    expect(m.peak).toBeLessThan(0.9);
  });
  it("clamps a huge dt so a dropped frame can't skip the decay", () => {
    const m = newMeterState(0);
    advanceMeter(m, 1, 16);
    advanceMeter(m, 0, 5000);
    expect(m.level).toBeGreaterThan(0.7);
  });
});

describe("meterZone / meterZones", () => {
  it("splits the bar into green, amber and red slices", () => {
    const z = meterZones();
    expect(z.green).toBeCloseTo(0.6, 6);
    expect(z.amber).toBeCloseTo(0.2, 6);
    expect(z.red).toBeCloseTo(0.2, 6);
    expect(z.green + z.amber + z.red).toBeCloseTo(1, 6);
  });
  it("names the zone a position falls into", () => {
    expect(meterZone(0.2)).toBe("green");
    expect(meterZone(0.6)).toBe("green");
    expect(meterZone(0.7)).toBe("amber");
    expect(meterZone(0.8)).toBe("amber");
    expect(meterZone(0.95)).toBe("red");
  });
});

describe("rms", () => {
  it("measures a sine wave's amplitude", () => {
    const n = 512;
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.sin((i / n) * Math.PI * 2);
    expect(rms(buf)).toBeCloseTo(Math.SQRT1_2, 2);
  });
  it("returns 0 for silence and tolerates an empty buffer", () => {
    expect(rms(new Float32Array(16))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});
describe("buildMeterStrips", () => {
  it("returns exactly one strip: the narration", () => {
    const strips = buildMeterStrips({ voiceLevel: 0.6 });
    expect(strips).toHaveLength(1);
    expect(strips[0].id).toBe(VOICE_STRIP);
    expect(strips[0].label).toBe("Voice");
    expect(strips[0].volume).toBe(0.6);
  });

  it("defaults the level to full when the caller omits it", () => {
    expect(buildMeterStrips()[0].volume).toBe(1);
    expect(buildMeterStrips({})[0].volume).toBe(1);
  });

  it("does not add a master or per-track strips", () => {
    // Background clips and sound effects still run through the audio bus, but
    // the rail only meters the narration.
    const strips = buildMeterStrips({
      bgClips: [{ id: "b1", name: "bg.mp3", url: "blob:1" }],
      sfx: [{ id: "s1", name: "hit", src: { kind: "lib" } }],
      sfxUrlFor: () => "blob:x",
    });
    expect(strips.map((s) => s.id)).toEqual([VOICE_STRIP]);
    expect(strips.some((s) => s.master)).toBe(false);
  });

  it("routes the slider to the narration volume setter", () => {
    const calls = [];
    const [strip] = buildMeterStrips({ voiceLevel: 1, setVoiceLevel: (v) => calls.push(v) });
    strip.setVolume(0.25);
    expect(calls).toEqual([0.25]);
  });

  it("never throws when the setter is missing", () => {
    const [strip] = buildMeterStrips({ voiceLevel: 1 });
    expect(() => strip.setVolume(0.5)).not.toThrow();
  });

  it("keeps the routing ids the audio bus uses", () => {
    expect(bgStripId("b1")).toBe("bg:b1");
    expect(sfxStripId("s1")).toBe("sfx:s1");
  });
});
