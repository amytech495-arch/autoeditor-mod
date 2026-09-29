#!/usr/bin/env python3
"""Transcribe an audio file with faster-whisper (word-level timestamps).

Usage: transcribe.py <audio-file>
Prints PROGRESS:<0..1> lines to stderr as it goes, then a single
RESULT:<json> line to stdout: {"cues": [{start, end, text, words:[{w,start,end}]}], "language": ...}.
Exit 2 if faster-whisper is not installed.
"""
import sys, json, os

# Sanitise proxy env vars: broken IPv6 entries (e.g. "[::1]") make httpx fail
# model downloads with "Invalid port". Also disable the HF xet protocol, which
# fails through proxies.
for _k in ("NO_PROXY", "no_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    _v = os.environ.get(_k, "")
    if "[::1]" in _v or ":1]" in _v:
        del os.environ[_k]
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


def resolve_model(name):
    # A local directory (model.bin + config.json) is used directly; otherwise
    # faster-whisper resolves/downloads the named model from the HF cache.
    if os.path.isdir(name) and os.path.exists(os.path.join(name, "model.bin")):
        return name
    return name


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no audio file given"}))
        sys.exit(1)
    audio = sys.argv[1]
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("RESULT:" + json.dumps({"error": "whisper-missing"}))
        sys.exit(2)

    model_name = resolve_model(os.environ.get("WHISPER_MODEL", "tiny"))
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio, word_timestamps=True, vad_filter=True)
    total = max(1, info.duration or 0)
    cues = []
    for seg in segments:
        words = [
            {"w": w.word.strip(), "start": w.start, "end": w.end}
            for w in (seg.words or [])
            if w.word and w.word.strip()
        ]
        text = (seg.text or "").strip()
        if text:
            cues.append({"start": seg.start, "end": seg.end, "text": text, "words": words})
        print(f"PROGRESS:{min(0.999, seg.end / total):.3f}", file=sys.stderr, flush=True)
    print("RESULT:" + json.dumps({"cues": cues, "language": info.language or ""}))


if __name__ == "__main__":
    main()
