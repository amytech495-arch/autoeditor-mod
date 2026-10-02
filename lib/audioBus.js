// One Web Audio graph for the whole preview.
//
// Everything the preview plays — the narration element, each background clip and
// each sound-effect element — is routed through this bus so a live meter can tap
// it. Two rules make that safe:
//
//   1. createMediaElementSource() throws if it is called twice for the same
//      element, so sources are cached per element and reused.
//   2. Routing an element through Web Audio means the context must be resumed on
//      the play gesture or the preview goes silent — call resume() from there.
//
// Fading/muting a strip is done by scaling the element's own .volume, which
// still affects the MediaElementAudioSourceNode, so no extra gain nodes are
// needed per strip.

import { rms } from "./audioMeter";

export const METER_FFT = 512;

// The AudioContext factory. Injectable so the graph can be tested with a fake.
export function browserAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

// createAudioBus([makeContext]) → bus
export function createAudioBus(makeContext) {
  const factory = makeContext || browserAudioContext;
  let ctx = null;
  let master = null;              // everything sums here, then out
  const srcs = new WeakMap();     // element → MediaElementAudioSourceNode
  const taps = new Map();         // id → { analyser, fxNodes, buf }
  const masterTap = { analyser: null, buf: null };
  const attached = new Map();     // id → element (so we can re-attach on a new src)

  function ensure() {
    if (ctx) return ctx;
    let c = null;
    try { c = factory(); } catch (_) { return null; }
    if (!c) return null;
    ctx = c;
    // master gain → master analyser → destination. The analyser sits in the
    // signal path (it passes audio through unchanged) so the master meter taps
    // the real output. Wiring it up once here avoids a second path to the
    // speakers, which would double the volume.
    master = ctx.createGain();
    master.gain.value = 1;
    const mAnalyser = ctx.createAnalyser();
    mAnalyser.fftSize = METER_FFT;
    mAnalyser.smoothingTimeConstant = 0;
    masterTap.analyser = mAnalyser;
    masterTap.buf = new Float32Array(mAnalyser.fftSize);
    master.connect(mAnalyser);
    mAnalyser.connect(ctx.destination);
    return ctx;
  }

  // A strip's tap. AnalyserNode analyses a mono down-mix of its input (that is
  // what the Web Audio spec makes getFloatTimeDomainData return), so one
  // analyser gives one honest level per strip. Slicing it into L/R bars would
  // leave one bar permanently dead on mono sources.
  function makeTap(c) {
    const analyser = c.createAnalyser();
    analyser.fftSize = METER_FFT;
    // Ballistics live in the meter, not the analyser.
    analyser.smoothingTimeConstant = 0;
    analyser.connect(master); // passes the audio through to the master bus
    return { analyser, buf: new Float32Array(analyser.fftSize) };
  }

  // The element source for `el`, created at most once per element.
  function sourceFor(el) {
    const c = ensure();
    if (!c || !el) return null;
    let s = srcs.get(el);
    if (!s) {
      try { s = c.createMediaElementSource(el); } catch (_) { return null; } // already routed elsewhere
      srcs.set(el, s);
    }
    return s;
  }

  // attach(id, element, fxNodes) — route `element` through the bus under `id`,
  // optionally through effect nodes, and tap it for metering. Re-attaching the
  // same id with the same element is a no-op; a new element rebuilds the tap.
  function attach(id, el, fxNodes) {
    const c = ensure();
    if (!c || !el) return null;
    const src = sourceFor(el);
    if (!src) return null;
    const existing = taps.get(id);
    if (existing && attached.get(id) === el) return existing;

    // Unwire whatever fed this tap before, so a rebuilt chain never doubles up.
    if (existing) {
      const oldEl = attached.get(id);
      const oldSrc = oldEl ? srcs.get(oldEl) : null;
      if (oldSrc && existing.head) { try { oldSrc.disconnect(existing.head); } catch (_) {} }
      if (src !== oldSrc && existing.head) { try { src.disconnect(existing.head); } catch (_) {} }
      for (const n of existing.fxNodes || []) { try { n.disconnect(); } catch (_) {} }
    }

    const tap = existing || makeTap(c);
    tap.fxNodes = (fxNodes || []).slice();
    let prev = src;
    for (const n of tap.fxNodes) {
      try { prev.connect(n); prev = n; } catch (_) {}
    }
    try { prev.connect(tap.analyser); } catch (_) {}
    // Remember both ends so a later rebuild knows what to disconnect.
    tap.head = tap.fxNodes[0] || tap.analyser;
    tap.tail = prev;
    taps.set(id, tap);
    attached.set(id, el);
    return tap;
  }

  // Rebuild just the effect chain of an already-attached strip.
  function refx(id, fxNodes) {
    const tap = taps.get(id);
    const el = attached.get(id);
    if (!tap || !el) return null;
    const src = srcs.get(el);
    if (!src) return null;
    // The source feeds the head node, not the analyser directly when FX are on.
    if (tap.head) { try { src.disconnect(tap.head); } catch (_) {} }
    for (const n of tap.fxNodes || []) { try { n.disconnect(); } catch (_) {} }
    tap.fxNodes = (fxNodes || []).slice();
    let prev = src;
    for (const n of tap.fxNodes) {
      try { prev.connect(n); prev = n; } catch (_) {}
    }
    try { prev.connect(tap.analyser); } catch (_) {}
    tap.head = tap.fxNodes[0] || tap.analyser;
    tap.tail = prev;
    return tap;
  }

  function detach(id) {
    const tap = taps.get(id);
    if (!tap) return;
    const el = attached.get(id);
    const src = el ? srcs.get(el) : null;
    if (src && tap.head) { try { src.disconnect(tap.head); } catch (_) {} }
    for (const n of tap.fxNodes || []) { try { n.disconnect(); } catch (_) {} }
    try { tap.analyser.disconnect(master); } catch (_) {}
    taps.delete(id);
    attached.delete(id);
  }

  // Read a strip's current linear amplitude (0..1-ish).
  function read(id) {
    const tap = taps.get(id);
    if (!tap) return 0;
    tap.analyser.getFloatTimeDomainData(tap.buf);
    return rms(tap.buf);
  }

  // Meter the summed master bus.
  function readMaster() {
    if (!ctx || !masterTap.analyser) return 0;
    masterTap.analyser.getFloatTimeDomainData(masterTap.buf);
    return rms(masterTap.buf);
  }

  function resume() {
    if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (_) {} }
  }

  function close() {
    for (const id of [...taps.keys()]) detach(id);
    if (ctx) { try { ctx.close(); } catch (_) {} }
    ctx = null;
    master = null;
    masterTap.analyser = null;
  }

  return {
    attach,
    refx,
    detach,
    read,
    readMaster,
    resume,
    // Create the context up front (attach() would do it too, but callers that
    // need the context to build effect nodes before attaching ask for it here).
    prepare: () => ensure(),
    close,
    has: (id) => taps.has(id),
    ids: () => [...taps.keys()],
    get context() { return ctx; },
    get connected() { return !!ctx; },
  };
}