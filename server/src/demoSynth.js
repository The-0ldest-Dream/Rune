// Pure demo-song synthesiser (no Node APIs) – shared by the server and the static browser build.
// Produces a deterministic 30-second melody for any track id, styled by genre.
export const SR = 22050;
export const SECONDS = 30;

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pent: [0, 2, 4, 7, 9],
};
const GENRE_STYLE = {
  Pop: { scale: 'major', bpm: 112, kick: true, len: 0.8 },
  Rock: { scale: 'minor', bpm: 128, kick: true, len: 0.6 },
  Electronic: { scale: 'minor', bpm: 124, kick: true, len: 0.5 },
  Jazz: { scale: 'dorian', bpm: 96, kick: false, len: 0.9 },
  Classical: { scale: 'major', bpm: 80, kick: false, len: 1.6 },
  'Hip-Hop': { scale: 'pent', bpm: 90, kick: true, len: 0.7 },
  Ambient: { scale: 'pent', bpm: 60, kick: false, len: 3.0 },
  Folk: { scale: 'major', bpm: 100, kick: false, len: 0.9 },
  'Lo-fi': { scale: 'dorian', bpm: 78, kick: true, len: 1.1 },
  Funk: { scale: 'dorian', bpm: 108, kick: true, len: 0.5 },
};

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns 16-bit mono PCM samples (Int16Array) at SR Hz. */
export function synthPcm16(id, genre = 'Pop') {
  const style = GENRE_STYLE[genre] || GENRE_STYLE.Pop;
  const rnd = mulberry32(Math.imul(id + 1, 2654435761) >>> 0);
  const bpm = style.bpm + Math.floor(rnd() * 17) - 8;
  const step = 60 / bpm / 2; // eighth note
  const scale = SCALES[style.scale];
  const root = 43 + Math.floor(rnd() * 12); // MIDI note
  const pattern = Array.from({ length: 16 }, () => (rnd() < 0.7 ? Math.floor(rnd() * scale.length * 2) : -1));
  const progression = [0, 5 % scale.length, 3 % scale.length, 4 % scale.length];

  const n = SR * SECONDS;
  const buf = new Float32Array(n);
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  const degreeToMidi = (d, base) => base + 12 * Math.floor(d / scale.length) + scale[d % scale.length];

  const tone = (start, dur, freq, amp, harmonics) => {
    const i0 = Math.floor(start * SR);
    const len = Math.floor(dur * SR);
    for (let j = 0; j < len && i0 + j < n; j++) {
      const t = j / SR;
      const env = Math.min(1, t / 0.012) * Math.exp((-3 * t) / dur);
      let s = Math.sin(2 * Math.PI * freq * t);
      for (let h = 0; h < harmonics.length; h++) s += harmonics[h] * Math.sin(2 * Math.PI * freq * (h + 2) * t);
      buf[i0 + j] += amp * env * s;
    }
  };

  const steps = Math.ceil(SECONDS / step);
  for (let i = 0; i < steps; i++) {
    const t0 = i * step;
    const note = pattern[i % 16];
    if (note >= 0) tone(t0, step * style.len, hz(degreeToMidi(note, root + 12)), 0.22, [0.35, 0.12]);
    if (i % 4 === 0) {
      const degree = progression[Math.floor(i / 16) % 4];
      tone(t0, step * 3.6, hz(degreeToMidi(degree, root - 12)), 0.32, [0.2]);
    }
    if (style.kick && i % 4 === 0) {
      const i0 = Math.floor(t0 * SR);
      for (let j = 0; j < SR * 0.18 && i0 + j < n; j++) {
        const t = j / SR;
        buf[i0 + j] += 0.5 * Math.sin(2 * Math.PI * (45 * t + 90 * (1 - Math.exp(-t * 28)) / 28)) * Math.exp(-t * 20);
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const gain = peak > 0 ? 0.8 / peak : 1;
  const fade = Math.floor(SR * 0.05);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, i / fade, (n - i) / fade);
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(buf[i] * gain * f * 32767)));
  }
  return pcm;
}

/** Wraps mono 16-bit PCM in a WAV container → Uint8Array. */
export function wavBytes(pcm) {
  const n = pcm.length;
  const out = new Uint8Array(44 + n * 2);
  const dv = new DataView(out.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, pcm[i], true);
  return out;
}
