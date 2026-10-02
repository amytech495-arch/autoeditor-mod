import { describe, it, expect } from "vitest";
import { createAudioBus } from "../audioBus.js";
import { buildVoiceFxNodes } from "../voiceFx.js";

// A minimal stand-in for the Web Audio API: it records connections so we can
// assert the graph shape without a browser.
function fakeAudioContext() {
  const nodes = [];
  const dest = { name: "destination" };
  const mk = (name, extra = {}) => {
    const n = {
      name,
      connections: [],
      connect(target) { this.connections.push(target); return target; },
      disconnect(target) {
        if (target == null) this.connections = [];
        else this.connections = this.connections.filter((c) => c !== target);
      },
      ...extra,
    };
    nodes.push(n);
    return n;
  };
  return {
    state: "running",
    destination: dest,
    nodes,
    sources: [],
    createGain: () => mk("gain", { gain: { value: 1 } }),
    createAnalyser: () => mk("analyser", {
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      buf: null,
      getFloatTimeDomainData(out) {
        const n = this.fftSize;
        for (let i = 0; i < n; i++) out[i] = 1; // full-scale DC → loud
      },
    }),
    createMediaElementSource(el) {
      if (this.sources.includes(el)) throw new Error("already connected");
      this.sources.push(el);
      return mk("src");
    },
    resume() { this.state = "running"; },
    close() { this.closed = true; },
    byName(name) { return nodes.filter((n) => n.name === name); },
    // The master tap is the analyser wired to the speakers; a strip's analyser
    // is any other one (tests also create plain gain nodes as stand-in FX).
    stripAnalyser() {
      return nodes.find(
        (n) => n.name === "analyser" && !n.connections.includes(dest),
      );
    },
  };
}

describe("createAudioBus", () => {
  it("does nothing until a strip is attached", () => {
    let created = 0;
    const bus = createAudioBus(() => {
      created++;
      return {
        createGain: () => ({ connect() {}, disconnect() {} }),
        createAnalyser: () => ({ connect() {}, disconnect() {} }),
      };
    });
    expect(bus.connected).toBe(false);
    expect(bus.ids()).toEqual([]);
    expect(created).toBe(0);
  });

  it("creates the context and routes an element to the master bus", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const el = {};
    bus.attach("voice", el);
    expect(bus.connected).toBe(true);
    expect(bus.has("voice")).toBe(true);
    // element source → analyser → master gain → master analyser → destination
    const src = Ctx.byName("src")[0];
    const analyser = Ctx.stripAnalyser();
    const gain = Ctx.byName("gain")[0];
    expect(src.connections).toContain(analyser);
    expect(analyser.connections).toContain(gain);
    expect(gain.connections[0].connections).toContain(Ctx.destination);
  });

  it("creates the element source only once, even across re-attaches", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const el = {};
    bus.attach("voice", el);
    bus.attach("voice", el);
    bus.attach("voice", el);
    expect(Ctx.sources.length).toBe(1);
  });

  it("inserts effect nodes between the source and the tap", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const fx = Ctx.createGain();
    bus.attach("voice", {}, [fx]);
    const src = Ctx.byName("src")[0];
    const analyser = Ctx.stripAnalyser();
    expect(src.connections).toContain(fx);
    expect(fx.connections).toContain(analyser);
  });

  it("rebuilds the effect chain on refx without duplicating connections", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const el = {};
    const first = Ctx.createGain();
    bus.attach("voice", el, [first]);
    const second = Ctx.createGain();
    bus.refx("voice", [second]);
    const src = Ctx.byName("src")[0];
    const analyser = Ctx.stripAnalyser();
    // The old node is disconnected from the chain and the new one takes its place.
    expect(src.connections).not.toContain(first);
    expect(src.connections).toContain(second);
    expect(second.connections).toContain(analyser);
    expect(first.connections).toHaveLength(0);
  });

  it("clears the chain entirely when refx is given no nodes", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const el = {};
    const fx = Ctx.createGain();
    bus.attach("voice", el, [fx]);
    bus.refx("voice", []);
    const src = Ctx.byName("src")[0];
    const analyser = Ctx.stripAnalyser();
    expect(src.connections).toContain(analyser);
    expect(fx.connections).toHaveLength(0);
  });

  it("replaces the tap when the same id gets a different element", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const elA = {};
    const elB = {};
    bus.attach("bg:1", elA);
    bus.attach("bg:1", elB);
    expect(Ctx.sources.length).toBe(2);
    // The first element's source no longer feeds a tap.
    const [srcA] = Ctx.byName("src");
    expect(srcA.connections.filter((c) => c.name === "analyser")).toHaveLength(0);
  });

  it("detaches a strip without touching the others", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const elA = {};
    const elB = {};
    bus.attach("bg:1", elA);
    bus.attach("bg:2", elB);
    bus.detach("bg:1");
    expect(bus.has("bg:1")).toBe(false);
    expect(bus.has("bg:2")).toBe(true);
  });

  it("reads a non-zero level for an attached strip and 0 for an unknown one", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    bus.attach("voice", {});
    expect(bus.read("voice")).toBeGreaterThan(0.5); // full-scale samples
    expect(bus.read("nope")).toBe(0);
  });

  it("meters the master bus without adding a second path to the speakers", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    bus.attach("voice", {});
    const before = Ctx.byName("analyser").length;
    expect(bus.readMaster()).toBeGreaterThan(0.5);
    bus.readMaster();
    expect(Ctx.byName("analyser").length).toBe(before); // no new nodes on repeat reads
    // The master analyser is in the signal path; the gain reaches the speakers
    // only through it, so nothing is played twice.
    const gain = Ctx.byName("gain")[0];
    expect(gain.connections).toHaveLength(1);
    expect(gain.connections[0].name).toBe("analyser");
    expect(gain.connections[0].connections).toContain(Ctx.destination);
  });

  it("resumes a suspended context", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    bus.attach("voice", {});
    Ctx.state = "suspended";
    bus.resume();
    expect(Ctx.state).toBe("running");
  });

  it("exposes the context via prepare() before anything is attached", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    expect(bus.context).toBeNull();
    expect(bus.connected).toBe(false);
    // Callers build effect nodes with the context before attaching the strip.
    const ctx = bus.prepare();
    expect(ctx).toBe(Ctx);
    expect(bus.connected).toBe(true);
    expect(bus.prepare()).toBe(ctx); // idempotent
  });

  it("routes the narration strip even with no effect nodes", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const ctx = bus.prepare();
    bus.attach("voice", {}, buildVoiceFxNodes(ctx, { effect: "none", strength: 0 }));
    expect(bus.has("voice")).toBe(true);
    expect(bus.ids()).toEqual(["voice"]);
  });

  it("closes the context and forgets its taps", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    bus.attach("voice", {});
    bus.attach("bg:1", {});
    bus.close();
    expect(Ctx.closed).toBe(true);
    expect(bus.ids()).toEqual([]);
    expect(bus.connected).toBe(false);
  });

  it("survives an element it cannot route (already used by another graph)", () => {
    const Ctx = fakeAudioContext();
    const bus = createAudioBus(() => Ctx);
    const el = {};
    bus.attach("voice", el);
    // The browser throws if a second graph takes the same element.
    const el2 = {};
    Ctx.sources.push(el2);
    expect(bus.attach("bg:9", el2)).toBeNull();
    expect(bus.has("bg:9")).toBe(false);
  });
});