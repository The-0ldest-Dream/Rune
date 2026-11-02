// Waveform peaks and tempo estimation for the crossfade editor (pure functions over decoded samples).

/** Max |sample| per bin over [from, to) → Float32Array(bins) in 0..1. */
export function peaks(samples, from, to, bins) {
  const out = new Float32Array(bins);
  const a = Math.max(0, Math.floor(from)), b = Math.min(samples.length, Math.floor(to));
  if (b <= a) return out;
  const step = (b - a) / bins;
  for (let i = 0; i < bins; i++) {
    const s = a + Math.floor(i * step), e = Math.max(s + 1, a + Math.floor((i + 1) * step));
    let m = 0;
    for (let k = s; k < e && k < b; k++) { const v = Math.abs(samples[k]); if (v > m) m = v; }
    out[i] = Math.min(1, m);
  }
  return out;
}

/** Onset-strength envelope (positive energy flux), `hop` seconds per frame. */
export function onsetEnvelope(samples, sampleRate, hop = 0.01) {
  const size = Math.max(1, Math.round(sampleRate * hop));
  const frames = Math.floor(samples.length / size);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let k = f * size; k < (f + 1) * size; k++) sum += samples[k] * samples[k];
    energy[f] = Math.sqrt(sum / size);
  }
  const env = new Float32Array(frames);
  for (let f = 1; f < frames; f++) env[f] = Math.max(0, energy[f] - energy[f - 1]);
  return { env, rate: 1 / hop };
}

/** Tempo in BPM by autocorrelation of the onset envelope, favouring 70–180 BPM and values near 120. Returns 0 if unclear. */
export function estimateBpm(env, rate, lo = 70, hi = 180) {
  const n = env.length;
  if (n < rate * 6) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const x = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) { x[i] = env[i] - mean; energy += x[i] * x[i]; }
  if (energy < 1e-12) return 0;
  const minLag = Math.floor((rate * 60) / hi), maxLag = Math.ceil((rate * 60) / lo);
  const r = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    r[lag] = s / (n - lag);
  }
  let best = 0, bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * rate) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.7) ** 2);      // gentle preference against half/double-time mistakes
    const score = r[lag] * (0.6 + 0.4 * prior);
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  if (!best || bestScore <= 0) return 0;
  const a = r[best - 1], b = r[best], c = r[best + 1], den = a - 2 * b + c;     // parabolic refinement
  const lag = den ? best + (0.5 * (a - c)) / den : best;
  return Math.round(((60 * rate) / lag) * 10) / 10;
}

/** Bars → seconds for a tempo (4/4). */
export const barsToSeconds = (bars, bpm) => (bpm > 0 ? (bars * 4 * 60) / bpm : 0);
