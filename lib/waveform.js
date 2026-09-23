// Pick a peak resolution dense enough that even a short slice of a long clip
// still renders as a fine waveform (a clip's peaks are computed for the whole
// file, then sliced down to its window on the timeline).
export function waveBucketCount(seconds, min = 900, max = 12000) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return 1000;
  return Math.max(min, Math.min(max, Math.round(seconds * 75)));
}

// Decode an audio file into normalized peak amplitudes for the waveform lane.
// Returns [] on any failure so the UI can fall back to a flat lane.
export async function getWaveformPeaks(file, buckets = 480) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return [];
    const ctx = new AC();
    const arr = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(arr);
    const data = audio.getChannelData(0);
    const block = Math.floor(data.length / buckets) || 1;
    const peaks = new Array(buckets);
    let max = 0;
    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      const start = i * block;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(data[start + j] || 0);
        if (v > peak) peak = v;
      }
      peaks[i] = peak;
      if (peak > max) max = peak;
    }
    if (ctx.close) ctx.close();
    return max > 0 ? peaks.map((p) => p / max) : peaks;
  } catch {
    return [];
  }
}
