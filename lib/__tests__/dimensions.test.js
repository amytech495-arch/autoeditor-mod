import { describe, it, expect } from "vitest";
import { resolveDimensions, capTo720, upTo4K } from "../dimensions.js";

describe("resolveDimensions", () => {
  it("returns 1920x1080 for 16:9", () => {
    expect(resolveDimensions("16:9")).toEqual({ width: 1920, height: 1080 });
  });
  it("returns 1080x1920 for 9:16", () => {
    expect(resolveDimensions("9:16")).toEqual({ width: 1080, height: 1920 });
  });
  it("uses the sample image (even-rounded) for auto", () => {
    expect(resolveDimensions("auto", { width: 1281, height: 721 })).toEqual({
      width: 1280,
      height: 720,
    });
  });
  it("falls back to 16:9 for auto without a sample", () => {
    expect(resolveDimensions("auto")).toEqual({ width: 1920, height: 1080 });
  });
});

describe("upTo4K", () => {
  it("upscales 16:9 to 3840x2160", () => {
    expect(upTo4K({ width: 1920, height: 1080 })).toEqual({ width: 3840, height: 2160 });
  });
  it("upscales 9:16 to 2160x3840", () => {
    expect(upTo4K({ width: 1080, height: 1920 })).toEqual({ width: 2160, height: 3840 });
  });
  it("keeps odd input even on the long edge", () => {
    expect(upTo4K({ width: 1281, height: 721 })).toEqual({ width: 3840, height: 2160 });
  });
  it("leaves already-large resolutions unchanged", () => {
    expect(upTo4K({ width: 4000, height: 3000 })).toEqual({ width: 4000, height: 3000 });
  });
  it("preserves non-16:9 aspect under the 3840 long-edge rule", () => {
    expect(upTo4K({ width: 1800, height: 1200 })).toEqual({ width: 3840, height: 2560 });
  });
});
