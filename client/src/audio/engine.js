// Web Audio graph: media element → tone (bass/mid/treble) → 10-band graphic EQ → headroom/preamp gain → analyser → speakers.
import { BAND_Q, EQ_FREQS, TONE, bandType, peakBoostDb } from './eqMath.js';
export { EQ_FREQS } from './eqMath.js';
export const EQ_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

export const PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 6],
  Vocal: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  Rock: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
  Electronic: [5, 4, 1, 0, -2, 2, 1, 2, 4, 5],
  Acoustic: [4, 4, 3, 1, 1, 1, 2, 3, 3, 2],
  'Late night': [-3, -2, 0, 2, 3, 3, 2, 0, -2, -4],
};

const STORAGE_KEY = 'rune.eq';
const DEFAULTS = { enabled: true, autoGain: true, preset: 'Flat', preamp: 0, bass: 0, mid: 0, treble: 0, bands: PRESETS.Flat.slice() };

function load() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    if (!Array.isArray(s.bands) || s.bands.length !== 10) s.bands = PRESETS.Flat.slice();
    return s;
  } catch { return { ...DEFAULTS, bands: PRESETS.Flat.slice() }; }
}

export class AudioEngine {
  constructor(el) {
    this.el = el;
    this.ctx = null;
    this.settings = load();
    this.subs = new Set();
    // Browsers suspend audio contexts in the background / after inactivity: wake it whenever playback starts.
    el.addEventListener('play', () => { if (this.ctx?.state === 'suspended') this.ctx.resume(); });
  }

  /** Must first be called from a user gesture (autoplay policy). Safe to call repeatedly. */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC({ latencyHint: 'playback' }));
      this.source = c.createMediaElementSource(this.el);
      this.tone = TONE.map((t) => this.biquad(t.type, t.f, t.q));
      this.bands = EQ_FREQS.map((f, i) => this.biquad(bandType(i), f, BAND_Q));
      this.pre = c.createGain();
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.82;
      // No compressor here: Web Audio's compressor adds make-up gain and colours the sound even with a flat EQ.
      // Instead the gain stage below lowers the level by exactly the amount the EQ boosts at its loudest frequency.
      const chain = [this.source, ...this.tone, ...this.bands, this.pre, this.analyser, c.destination];
      chain.reduce((a, b) => (a.connect(b), b));
      this.apply();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  biquad(type, freq, q) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  /** dB the volume is lowered to leave room for the boosts. */
  headroom() {
    return this.settings.autoGain ? peakBoostDb(this.settings, this.ctx?.sampleRate || 48000) : 0;
  }

  apply() {
    if (!this.ctx) return;
    const s = this.settings, on = s.enabled, t = this.ctx.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, t, 0.02);
    TONE.forEach((tn, i) => set(this.tone[i].gain, on ? s[tn.key] : 0));
    this.bands.forEach((b, i) => set(b.gain, on ? s.bands[i] : 0));
    set(this.pre.gain, on ? 10 ** ((s.preamp - this.headroom()) / 20) : 1);
  }

  set(partial) {
    this.settings = { ...this.settings, ...partial };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* storage blocked */ }
    this.apply();
    this.subs.forEach((fn) => fn(this.settings));
  }

  setBand(i, gain) {
    const bands = this.settings.bands.slice();
    bands[i] = gain;
    this.set({ bands, preset: 'Custom' });
  }

  setPreset(name) {
    if (PRESETS[name]) this.set({ preset: name, bands: PRESETS[name].slice() });
  }

  reset() { this.set({ ...DEFAULTS, bands: PRESETS.Flat.slice() }); }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
}
