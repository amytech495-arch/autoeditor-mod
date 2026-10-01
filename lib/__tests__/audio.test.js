import { describe, it, expect } from "vitest";
import { audioSeriesKey, sortAudioSeries } from "../audio.js";

const f = (name) => ({ name });

describe("audioSeriesKey", () => {
  it("returns the leading/inline number of a filename", () => {
    expect(audioSeriesKey("1.mp3")).toBe(1);
    expect(audioSeriesKey("PART 02.wav")).toBe(2);
    expect(audioSeriesKey("ai_voice_10.m4a")).toBe(10);
    expect(audioSeriesKey("00-track-07.ogg")).toBe(7);
  });
  it("returns null when the name has no digits", () => {
    expect(audioSeriesKey("voiceover.mp3")).toBeNull();
    expect(audioSeriesKey("intro.aac")).toBeNull();
    expect(audioSeriesKey(null)).toBeNull();
    expect(audioSeriesKey("")).toBeNull();
  });
});

describe("sortAudioSeries", () => {
  it("sorts numerically when every file has a number", () => {
    const out = sortAudioSeries([f("10.mp3"), f("2.mp3"), f("1.mp3"), f("03.mp3")]);
    expect(out.map((x) => x.name)).toEqual(["1.mp3", "2.mp3", "03.mp3", "10.mp3"]);
  });
  it("falls back to natural filename order when some files have no number", () => {
    const out = sortAudioSeries([f("b.wav"), f("a.mp3"), f("c.ogg")]);
    expect(out.map((x) => x.name)).toEqual(["a.mp3", "b.wav", "c.ogg"]);
  });
  it("keeps the same file objects and doesn't mutate input order", () => {
    const src = [f("2.mp3"), f("1.mp3")];
    const out = sortAudioSeries(src);
    expect(src.map((x) => x.name)).toEqual(["2.mp3", "1.mp3"]);
    expect(out[0]).toBe(src[1]);
    expect(out[1]).toBe(src[0]);
  });
});