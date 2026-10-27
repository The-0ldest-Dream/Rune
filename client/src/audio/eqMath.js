// Frequency-response maths for the equalizer (RBJ biquad formulas — the same ones Web Audio's BiquadFilterNode uses).
// Pure functions, so the engine can compute exact headroom and the UI can draw the curve without touching the audio graph.
export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const TONE = [
  { key: 'bass', type: 'lowshelf', f: 120, q: 0.7 },
  { key: 'mid', type: 'peaking', f: 1000, q: 0.8 },
  { key: 'treble', type: 'highshelf', f: 6000, q: 0.7 },
];
export const BAND_Q = 1.4;
export const bandType = (i) => (i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking');

/** Gain in dB of one biquad (peaking / lowshelf / highshelf) at frequency f. */
export function biquadDb(type, f0, q, gainDb, f, fs = 48000) {
  if (!gainDb) return 0;
  const A = 10 ** (gainDb / 40), w0 = (2 * Math.PI * f0) / fs, cos = Math.cos(w0), sin = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peaking') {
    const alpha = sin / (2 * q);
    b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
  } else {
    const alpha = (sin / 2) * Math.SQRT2;           // shelf slope S = 1 (Web Audio ignores Q for shelves)
    const k = 2 * Math.sqrt(A) * alpha;
    if (type === 'lowshelf') {
      b0 = A * ((A + 1) - (A - 1) * cos + k); b1 = 2 * A * ((A - 1) - (A + 1) * cos); b2 = A * ((A + 1) - (A - 1) * cos - k);
      a0 = (A + 1) + (A - 1) * cos + k; a1 = -2 * ((A - 1) + (A + 1) * cos); a2 = (A + 1) + (A - 1) * cos - k;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cos + k); b1 = -2 * A * ((A - 1) + (A + 1) * cos); b2 = A * ((A + 1) + (A - 1) * cos - k);
      a0 = (A + 1) - (A - 1) * cos + k; a1 = 2 * ((A - 1) - (A + 1) * cos); a2 = (A + 1) - (A - 1) * cos - k;
    }
  }
  const w = (2 * Math.PI * f) / fs, cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * cw + b2 * c2, ni = -(b1 * sw + b2 * s2), dr = a0 + a1 * cw + a2 * c2, di = -(a1 * sw + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** Combined response (dB) of tone + 10 bands at frequency f. Preamp not included. */
export function chainDb(s, f, fs = 48000) {
  if (!s.enabled) return 0;
  let db = 0;
  for (const t of TONE) db += biquadDb(t.type, t.f, t.q, s[t.key], f, fs);
  s.bands.forEach((g, i) => { db += biquadDb(bandType(i), EQ_FREQS[i], BAND_Q, g, f, fs); });
  return db;
}

/** Log-spaced frequencies from 20 Hz to 20 kHz. */
export const logFreqs = (n = 96) => Array.from({ length: n }, (_, i) => 20 * 1000 ** (i / (n - 1)));

/** Largest boost anywhere in the spectrum (dB, never negative). The engine lowers the volume by this much so boosts can't clip. */
export function peakBoostDb(s, fs = 48000) {
  if (!s.enabled) return 0;
  let peak = 0;
  for (const f of logFreqs(120)) peak = Math.max(peak, chainDb(s, f, fs));
  return peak;
}
