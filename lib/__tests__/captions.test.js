import { describe, it, expect } from "vitest";
import { parseTranscript, captionAt } from "../captions";

describe("parseTranscript", () => {
  it("parses SRT with explicit start/end", () => {
    const srt = `1
00:00:00,000 --> 00:00:02,000
Hello there

2
00:00:02,000 --> 00:00:05,000
General Kenobi`;
    const { cues, error } = parseTranscript(srt, 5);
    expect(error).toBeNull();
    expect(cues.length).toBeGreaterThanOrEqual(2);
    expect(cues[0].start).toBe(0);
    expect(captionAt(cues, 0.5)).toMatch(/Hello/);
    expect(captionAt(cues, 3)).toMatch(/Kenobi/);
  });

  it("parses NoteGPT range blocks and clamps end to the next block's start", () => {
    const t = `00:00:00 - 00:01:15
First line of narration here.

00:00:38 - 00:01:54
Second part of the narration continues.`;
    const { cues } = parseTranscript(t, 120);
    expect(cues.length).toBeGreaterThan(0);
    // First block's cues must not run past the second block's start (38s).
    const firstBlock = cues.filter((c) => c.start < 38);
    for (const c of firstBlock) expect(c.end).toBeLessThanOrEqual(38 + 0.001);
  });

  it("parses inline (m:ss) markers, including several per line", () => {
    const t = `(0:00) There was one quiet morning in a small mountain village. (0:03) A young man sat by his window.
(0:09) An old farmer passed by. (0:13) I have so little, he said.`;
    const { cues, error } = parseTranscript(t, 20);
    expect(error).toBeNull();
    expect(cues.length).toBeGreaterThanOrEqual(4);
    expect(cues[0].start).toBe(0);
    expect(captionAt(cues, 4)).toMatch(/young man/);
    expect(captionAt(cues, 10)).toMatch(/farmer/);
    expect(captionAt(cues, 14)).toMatch(/so little/);
  });

  it("parses inline [mm:ss] lines", () => {
    const t = `[0:00] one two three
[0:04] four five six`;
    const { cues, error } = parseTranscript(t, 8);
    expect(error).toBeNull();
    expect(cues[0].start).toBe(0);
    expect(captionAt(cues, 5)).toMatch(/four/);
  });

  it("splits a long segment into multiple shorter cues", () => {
    const long = Array(40).fill("word").join(" ");
    const { cues } = parseTranscript(`[0:00] ${long}`, 20);
    expect(cues.length).toBeGreaterThan(1);
    // cues are ordered and non-overlapping
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].start);
    }
  });

  it("reports an error when there are no timestamps", () => {
    const { cues, error } = parseTranscript("just some plain text with no times", 10);
    expect(cues.length).toBe(0);
    expect(error).toBeTruthy();
  });

  it("returns empty text when nothing is showing", () => {
    const { cues } = parseTranscript(`[0:05] later line`, 10);
    expect(captionAt(cues, 0)).toBe("");
  });
});

describe("caption fonts", () => {
  it("exposes three fonts with files the server copies into the job dir", async () => {
    const { CAPTION_FONTS, captionFont } = await import("../captions");
    expect(CAPTION_FONTS.map((f) => f.id)).toEqual(["classic", "anton", "archivo"]);
    for (const f of CAPTION_FONTS) {
      expect(f.file).toMatch(/\.ttf$/);
      expect(f.family).toBeTruthy();
      expect(f.label).toBeTruthy();
    }
    expect(captionFont("anton").family).toBe("Anton");
    expect(captionFont("nope").id).toBe("classic"); // unknown falls back
  });
});

describe("word animations", () => {
  it("lists karaoke/pop/typewriter and flags them as word-level", async () => {
    const { CAPTION_ANIMATION_LIST, isWordAnimation } = await import("../captions");
    const ids = CAPTION_ANIMATION_LIST.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["karaoke", "pop", "typewriter"]));
    expect(isWordAnimation("karaoke")).toBe(true);
    expect(isWordAnimation("pop")).toBe(true);
    expect(isWordAnimation("typewriter")).toBe(true);
    expect(isWordAnimation("none")).toBe(false);
    expect(isWordAnimation("fade")).toBe(false);
    expect(isWordAnimation("slide")).toBe(false);
  });

  it("cueWords passes through transcribed timings and splits uploads evenly", async () => {
    const { cueWords } = await import("../captions");
    const transcribed = { start: 1, end: 4, text: "hi there", words: [{ w: "hi", start: 1.2, end: 1.5 }, { w: "there", start: 2, end: 2.8 }] };
    expect(cueWords(transcribed)).toEqual([
      { w: "hi", start: 1.2, end: 1.5 },
      { w: "there", start: 2, end: 2.8 },
    ]);
    const uploaded = { start: 0, end: 4, text: "one two three four" };
    const split = cueWords(uploaded);
    expect(split.map((w) => w.w)).toEqual(["one", "two", "three", "four"]);
    expect(split[0].start).toBe(0);
    expect(split[3].end).toBe(4);
    expect(split[1].start).toBeCloseTo(split[0].end);
  });

  it("wordsToLines wraps exactly like wrapToWidth", async () => {
    const { wordsToLines, wrapToWidth } = await import("../captions");
    const texts = [
      "short line",
      "a much longer caption line that definitely needs to wrap onto two lines",
      "supercalifragilisticexpialidocious antidisestablishmentarianism pneumonoultramicroscopicsilicovolcanoconiosis",
    ];
    for (const t of texts) {
      for (const max of [10, 24, 40]) {
        const viaWords = wordsToLines(t.split(" "), max).map((l) => l.join(" "));
        expect(viaWords).toEqual(wrapToWidth(t, max));
      }
    }
  });

  it("popScaleAt punches to ~1.25 then settles at 1.0", async () => {
    const { popScaleAt } = await import("../captions");
    expect(popScaleAt(-0.1)).toBe(0);
    expect(popScaleAt(0)).toBeCloseTo(0.5, 1);
    expect(popScaleAt(0.18)).toBeCloseTo(1.25, 1);
    expect(popScaleAt(0.35)).toBe(1);
    expect(popScaleAt(2)).toBe(1);
  });
});

describe("buildCaptionASS", () => {
  const cues = [{
    start: 1, end: 4, text: "hello world",
    words: [{ w: "hello", start: 1, end: 1.6 }, { w: "world", start: 1.8, end: 2.6 }],
  }];
  const build = async (anim, style = "classic", font = "anton") => {
    const m = await import("../captions");
    return m.buildCaptionASS(cues, style, font, 1280, 720, "md", 0, 0, anim);
  };

  it("emits a valid ASS header with the chosen font and resolution", async () => {
    const ass = await build("karaoke");
    expect(ass).toContain("ScriptType: v4.00+");
    expect(ass).toContain("PlayResX: 1280");
    expect(ass).toContain("PlayResY: 720");
    expect(ass).toContain("Style: Cap,Anton,");
    expect(ass).toContain("Dialogue: 0,0:00:01.00,0:00:04.00,Cap,");
  });

  it("karaoke sweeps per word with gap alignment", async () => {
    const ass = await build("karaoke");
    expect(ass).toContain("{\\k60}hello");
    expect(ass).toContain("{\\k80}world");
    // 0.2s gap between the words is padded with an invisible filler
    expect(ass).toContain("{\\k20}\\h");
  });

  it("pop uses line-level scale transforms", async () => {
    const ass = await build("pop");
    expect(ass).toContain("{\\t(0,180,\\fscx125\\fscy125)\\t(180,350,\\fscx100\\fscy100)}hello world");
  });

  it("typewriter reveals per character with transparent unrevealed text", async () => {
    const ass = await build("typewriter");
    expect(ass).toContain("{\\k12}h{\\k12}e");
    // SecondaryColour fully transparent -> unrevealed chars invisible
    expect(ass).toMatch(/Style: Cap,[^,]+,\d+,[^,]+,&HFF000000,/);
  });

  it("honours the style colours", async () => {
    const ass = await build("karaoke", "yellow");
    // yellow style fill is #ffd400 -> PrimaryColour &H0000D4FF (BBGGRR)
    expect(ass).toContain("&H0000D4FF");
  });
});

describe("buildCaptionBurn font", () => {
  it("uses the selected font file in drawtext", async () => {
    const { buildCaptionBurn } = await import("../captions");
    const cues = [{ start: 0, end: 2, text: "hi" }];
    const def = buildCaptionBurn(cues, "classic", 1280, 720, "md", 0, 0, "none");
    expect(def.filter).toContain("fontfile=caption.ttf");
    const anton = buildCaptionBurn(cues, "classic", 1280, 720, "md", 0, 0, "none", "anton");
    expect(anton.filter).toContain("fontfile=font-anton.ttf");
  });
});
