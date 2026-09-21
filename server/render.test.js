import { describe, it, expect } from "vitest";
import { buildRenderPlan } from "./render.js";

const base = {
  width: 1920, height: 1080, fps: 30,
  transitionDuration: 0.4, fadeIn: 0, fadeOut: 0,
};
const io = { paths: ["img0.png", "img1.png", "img2.png"], audioName: "audio.mp3", capChain: "" };
const clips = [
  { name: "a", start: 0, duration: 3, gap: false },
  { name: "b", start: 3, duration: 3, gap: false },
  { name: "c", start: 6, duration: 4, gap: false }, // total 10
];

// The filtergraph now lives in files, not on the command line.
const filterText = (p) => p.filterFiles.map((f) => f.text).join("\n");

describe("buildRenderPlan", () => {
  it("total is the last clip's start + duration", () => {
    const p = buildRenderPlan({ ...base, clips, transitions: ["cut", "cut", "cut"] }, io);
    expect(p.total).toBe(10);
  });

  it("uses concat mode with a video filter script when there are no non-cut transitions", () => {
    const p = buildRenderPlan({ ...base, clips, transitions: ["cut", "cut", "cut"] }, io);
    expect(p.mode).toBe("concat");
    expect(p.args).toContain("concat.txt");
    expect(p.args).toContain("-shortest");
    expect(p.args.join(" ")).toContain("-i audio.mp3");
    // filter read from a file, not passed inline
    expect(p.args).toContain("-filter_script:v");
    const vf = p.filterFiles.find((f) => f.name === "vf.txt");
    expect(vf).toBeTruthy();
    expect(vf.text).toContain("scale=1920:1080");
  });

  it("uses a filter_complex script with an xfade anchored to clip.start when a transition is set", () => {
    const p = buildRenderPlan({ ...base, clips, transitions: ["cut", "fade", "wipeleft"] }, io);
    expect(p.mode).toBe("graph");
    expect(p.args).toContain("-filter_complex_script");
    const fc = filterText(p);
    expect(fc).toContain("xfade=transition=fade");
    expect(fc).toContain("xfade=transition=wipeleft");
    expect(fc).toContain("offset=3.000");
    expect(fc).toContain("offset=6.000");
    expect(p.args).toContain("output.mp4");
  });

  it("adds video fades in the filter file and audio fades on the command line", () => {
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], fadeIn: 0.5, fadeOut: 0.6 }, io
    );
    const vf = filterText(p);
    expect(vf).toContain("fade=t=in:st=0:d=0.500");
    expect(vf).toContain("fade=t=out:st=9.400:d=0.600");
    const s = p.args.join(" ");
    expect(s).toContain("afade=t=in");
    expect(s).toContain("afade=t=out");
  });

  it("routes a video clip through the graph path with -ss trim and a fit-to-slot filter", () => {
    const vio = { ...io, paths: ["img0.png", "clip1.mp4", "img2.png"] };
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], trims: [0, 1.5, 0], volumes: [0, 0.5, 0] },
      { ...vio, audible: [false, true, false] }
    );
    expect(p.mode).toBe("graph");
    // input seeked to the trim in-point
    expect(p.args.join(" ")).toContain("-ss 1.500 -i clip1.mp4");
    const fc = filterText(p);
    // clone-last-frame fill + cut to the slot
    expect(fc).toContain("tpad=stop_mode=clone");
    expect(fc).toContain("trim=duration=");
    // clip audio delayed to its start (3s) and volume-scaled, then mixed
    expect(fc).toContain("volume=0.500");
    expect(fc).toContain("adelay=3000|3000");
    expect(fc).toContain("amix=inputs=2");
  });

  it("skips the audio mix for a video clip with no audio track (audible=false)", () => {
    const vio = { ...io, paths: ["img0.png", "clip1.mp4", "img2.png"] };
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], trims: [0, 0, 0], volumes: [0, 0.7, 0] },
      { ...vio, audible: [false, false, false] }
    );
    const fc = filterText(p);
    expect(fc).not.toContain("amix");
    expect(fc).not.toContain("adelay");
  });

  it("fast-forwards a longer clip to fit its slot (video setpts + audio atempo)", () => {
    const vio = { ...io, paths: ["img0.png", "clip1.mp4", "img2.png"] };
    const p = buildRenderPlan(
      // clip 'b' has a 3s slot; speed 2 = an ~6s clip fit into it
      { ...base, clips, transitions: ["cut", "cut", "cut"], trims: [0, 0, 0], volumes: [0, 0.5, 0], speeds: [1, 2, 1] },
      { ...vio, audible: [false, true, false] }
    );
    const fc = filterText(p);
    expect(fc).toContain("setpts=(PTS-STARTPTS)/2.0000");
    expect(fc).toContain("atempo=2.0"); // audio sped to match
  });

  it("applies a zoom to a video clip via zoompan (per-frame d=1)", () => {
    const vio = { ...io, paths: ["clip0.mp4", "img1.png", "img2.png"] };
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], motions: ["zoomin", "none", "none"], trims: [0, 0, 0], volumes: [0, 0, 0] },
      { ...vio, audible: [false, false, false] }
    );
    const fc = filterText(p);
    expect(fc).toContain("zoompan=");
    expect(fc).toContain(":d=1:");
  });

  it("puts the caption drawtext chain in the filter file, not the command line", () => {
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"] },
      { ...io, capChain: "drawtext=fontfile=caption.ttf:textfile=cap0.txt" }
    );
    expect(filterText(p)).toContain("drawtext=fontfile=caption.ttf");
    // and NOT inline in the args
    expect(p.args.join(" ")).not.toContain("drawtext");
  });
});

describe("sound effects (FX lane)", () => {
  const sfxClips = [{ id: "s1", path: "whoosh.mp3", at: 2, volume: 0.5 }];

  it("forces the graph path and mixes an effect at its marker time", () => {
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"] },
      { ...io, sfxClips }
    );
    expect(p.mode).toBe("graph"); // concat cannot mix per-marker audio
    expect(p.args.join(" ")).toContain("-i whoosh.mp3");
    const fc = filterText(p);
    expect(fc).toContain("volume=0.500");
    expect(fc).toContain("adelay=2000|2000[sfx0]");
    expect(fc).toContain("amix=inputs=2"); // voiceover + the effect
  });

  it("trims a BG clip to its in-point and play length", () => {
    const bg = [{ id: "bg_bg1", path: "music.mp3", at: 1.5, volume: 0.8, offset: 4, duration: 3 }];
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"] },
      { ...io, sfxClips: bg }
    );
    const fc = filterText(p);
    expect(fc).toContain("atrim=start=4.000:duration=3.000");
    expect(fc).toContain("asetpts=PTS-STARTPTS");
    expect(fc).toContain("adelay=1500|1500[sfx0]");
  });

  it("fades a BG clip in and out", () => {
    const bg = [{ id: "bg_bg1", path: "music.mp3", at: 0, volume: 0.8, offset: 0, duration: 6, fadeIn: 1, fadeOut: 2 }];
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"] },
      { ...io, sfxClips: bg }
    );
    const fc = filterText(p);
    expect(fc).toContain("afade=t=in:st=0:d=1.000");
    expect(fc).toContain("afade=t=out:st=4.000:d=2.000");
  });

  it("adds effects to the single audio mix of a segmented render", () => {
    const N = 130, D = 2, TD = 0.4;
    const many = Array.from({ length: N }, (_, k) => ({ name: "c" + k, start: +(k * (D - TD)).toFixed(3), duration: D, gap: false }));
    const paths = Array.from({ length: N }, (_, k) => "img" + k + ".png");
    const trans = many.map((_, k) => (k === 0 ? "cut" : "fade"));
    const p = buildRenderPlan(
      { ...base, clips: many, transitions: trans, transitionDuration: TD },
      { paths, audioName: "audio.mp3", capChain: "", sfxClips }
    );
    expect(p.mode).toBe("segmented");
    const join = p.passes[p.passes.length - 1];
    expect(join.args.join(" ")).toContain("-i whoosh.mp3");
    const afc = join.filterFiles.find((f) => f.name === "fc_audio.txt");
    expect(afc.text).toContain("adelay=2000|2000[sfx0]");
  });
});

describe("voice over effect", () => {
  it("applies a bass chain to the voiceover in concat mode via -af", () => {
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], voiceFx: { effect: "bass", strength: 50 } },
      io
    );
    expect(p.mode).toBe("concat");
    const s = p.args.join(" ");
    expect(s).toContain("-af");
    expect(s).toContain("bass=g=6.00:f=110");
  });

  it("replaces the voiceover input with an effect label in the graph mix", () => {
    const sfxClips = [{ id: "s1", path: "whoosh.mp3", at: 2, volume: 0.5 }];
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], voiceFx: { effect: "bass", strength: 50 } },
      { ...io, sfxClips }
    );
    expect(p.mode).toBe("graph");
    const fc = filterText(p);
    // 3 clip inputs, so the voiceover is input 3 → chain to [vfx], then the mix
    expect(fc).toContain("[3:a]bass=g=6.00:f=110[vfx]");
    expect(fc).toContain("[vfx][sfx0]amix=inputs=2");
  });

  it("bakes the effect into the segmented join's audio filter graph", () => {
    const N = 130, D = 2, TD = 0.4;
    const many = Array.from({ length: N }, (_, k) => ({ name: "c" + k, start: +(k * (D - TD)).toFixed(3), duration: D, gap: false }));
    const paths = Array.from({ length: N }, (_, k) => "img" + k + ".png");
    const trans = many.map((_, k) => (k === 0 ? "cut" : "fade"));
    const p = buildRenderPlan(
      { ...base, clips: many, transitions: trans, transitionDuration: TD, voiceFx: { effect: "radio", strength: 100 } },
      { paths, audioName: "audio.mp3", capChain: "" }
    );
    expect(p.mode).toBe("segmented");
    const join = p.passes[p.passes.length - 1];
    const afc = join.filterFiles.find((f) => f.name === "fc_audio.txt");
    // input 1 = the narration → chain to [vfx]; radio at 100 → top edge at 3200 Hz
    expect(afc.text).toContain("[1:a]highpass=f=300,lowpass=f=3200[vfx]");
  });

  it("compression maps strength to acompressor threshold and ratio", () => {
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], voiceFx: { effect: "compress", strength: 100 } },
      io
    );
    const s = p.args.join(" ");
    expect(s).toContain("acompressor=threshold=-24.0:ratio=8.00");
  });

  it("strength 0 and unknown effects add no filter", () => {
    const none = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], voiceFx: { effect: "clarity", strength: 0 } },
      io
    );
    expect(none.args.join(" ")).not.toContain("-af");
    const bogus = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"], voiceFx: { effect: "bogus", strength: 50 } },
      io
    );
    expect(bogus.args.join(" ")).not.toContain("equalizer");
  });
});

describe("image overlay (watermark)", () => {
  it("forces the graph path and burns the watermark on top of everything", () => {
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"],
        watermarkEnabled: true, watermarkSize: 0.2, watermarkX: 0.25, watermarkY: 0.75, watermarkOpacity: 0.5 },
      { ...io, watermarkName: "logo.png" }
    );
    expect(p.mode).toBe("graph"); // all-images timeline still routes to the graph path
    expect(p.args.join(" ")).toContain("-i logo.png");
    const fc = filterText(p);
    // scaled to size × the smaller canvas edge (0.2 × 1080 = 216)
    expect(fc).toContain("scale=w='min(216,iw)':h='min(216,ih)':force_original_aspect_ratio=decrease");
    // center-based position with in-frame clamping
    expect(fc).toContain("overlay=x='clip(0.2500*main_w,overlay_w/2,main_w-overlay_w/2)-overlay_w/2':y='clip(0.7500*main_h");
    // opacity scales the alpha channel
    expect(fc).toContain("colorchannelmixer=aa=0.500");
    // applied LAST (top-most) and mapped out
    expect(p.args.join(" ")).toContain("-map [vwm]");
  });

  it("does not force the graph path or add an input when disabled", () => {
    const p = buildRenderPlan(
      { ...base, clips, transitions: ["cut", "cut", "cut"] },
      { ...io, watermarkName: "logo.png" }
    );
    expect(p.mode).toBe("concat");
    expect(p.args.join(" ")).not.toContain("logo.png");
  });

  it("adds the watermark to each segment of a segmented render", () => {
    const N = 130, D = 2, TD = 0.4;
    const many = Array.from({ length: N }, (_, k) => ({ name: "c" + k, start: +(k * (D - TD)).toFixed(3), duration: D, gap: false }));
    const paths = Array.from({ length: N }, (_, k) => "img" + k + ".png");
    const trans = many.map((_, k) => (k === 0 ? "cut" : "fade"));
    const io2 = { paths, audioName: "audio.mp3", capChain: "" };
    const p = buildRenderPlan(
      { ...base, clips: many, transitions: trans, transitionDuration: TD, watermarkEnabled: true },
      { ...io2, watermarkName: "logo.png" }
    );
    expect(p.mode).toBe("segmented");
    for (const seg of p.passes.slice(0, 3)) {
      expect(seg.args.join(" ")).toContain("-i logo.png");
      expect(seg.args.join(" ")).toContain("-map [vwm]");
      const fc = seg.filterFiles[0].text;
      expect(fc).toContain("overlay=x='clip(0.8000*main_w"); // defaults
      expect(fc).toContain("colorchannelmixer=aa=0.900");
    }
  });
});

describe("segmented render (large graph timelines)", () => {
  const N = 130, D = 2, TD = 0.4;
  const many = Array.from({ length: N }, (_, k) => ({ name: "c" + k, start: +(k * (D - TD)).toFixed(3), duration: D, gap: false }));
  const paths = Array.from({ length: N }, (_, k) => "img" + k + ".png");
  const trans = many.map((_, k) => (k === 0 ? "cut" : "fade"));
  const io2 = { paths, audioName: "audio.mp3", capChain: "" };

  it("splits a big graph timeline into segment passes + one stream-copy join pass", () => {
    const p = buildRenderPlan({ ...base, clips: many, transitions: trans, transitionDuration: TD }, io2);
    expect(p.mode).toBe("segmented");
    expect(p.passes.length).toBe(4); // 130/60 = 3 segments + join
    expect(p.passes.slice(0, 3).map((x) => x.output)).toEqual(["seg0.mp4", "seg1.mp4", "seg2.mp4"]);
    expect(p.passes[3].output).toBe("output.mp4");
    // Segment boundaries are cuts (no overlap), so total = summed segment durations
    // (60-clip segments = 96.4s each, final 10-clip segment = 16.4s).
    expect(p.total).toBeCloseTo(96.4 + 96.4 + 16.4, 2);
  });

  it("renders each segment video-only at final quality, keeping its internal transitions", () => {
    const p = buildRenderPlan({ ...base, clips: many, transitions: trans, transitionDuration: TD }, io2);
    const seg = p.passes[0];
    expect(seg.args).toContain("-an");
    expect(seg.args.join(" ")).toContain("-crf 23"); // libx264 final quality (each clip encoded once)
    expect(seg.filterFiles[0].name).toBe("fc_s0.txt");
    expect(seg.filterFiles[0].text).toContain("xfade=transition=fade"); // internal transitions kept
  });

  it("joins segments with stream copy (no re-encode) and bakes captions into the segments", () => {
    const captions = [{ start: 1, end: 3, text: "hello" }]; // falls inside segment 0
    const p = buildRenderPlan(
      { ...base, clips: many, transitions: trans, transitionDuration: TD, captions, captionStyle: "classic" },
      io2
    );
    const join = p.passes[3];
    const jargs = join.args.join(" ");
    expect(jargs).toContain("-f concat");    // concat demuxer joins the finished segments
    expect(jargs).toContain("-c:v copy");    // video is stream-copied, NOT re-encoded
    expect(jargs).not.toContain("xfade");    // no cross-segment xfade / re-encode anymore
    expect(jargs).toContain("-i audio.mp3"); // voiceover muxed in
    expect(join.args).toContain("output.mp4");
    // Captions are burned into the segment that contains them, with a per-segment file prefix.
    const seg0fc = p.passes[0].filterFiles[0].text;
    expect(seg0fc).toContain("drawtext");
    expect(seg0fc).toContain("s0_cap0.txt");
  });

  it("stays single-pass below the segment threshold", () => {
    const few = many.slice(0, 10);
    const p = buildRenderPlan({ ...base, clips: few, transitions: trans.slice(0, 10), transitionDuration: TD }, { ...io2, paths: paths.slice(0, 10) });
    expect(p.mode).toBe("graph");
    expect(p.passes).toBeUndefined();
  });
});
