// Web Audio graph: <audio> → tone (bass/mid/treble) → 10-band graphic EQ → preamp → limiter → analyser → speakers.
export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
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
const DEFAULTS = { enabled: true, preset: 'Flat', preamp: 0, bass: 0, mid: 0, treble: 0, bands: PRESETS.Flat.slice() };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; } catch { return { ...DEFAULTS }; }
}

export class AudioEngine {
  constructor(el) {
    this.el = el;
    this.ctx = null;
    this.settings = load();
    this.subs = new Set();
  }

  /** Must first be called from a user gesture (autoplay policy). Safe to call repeatedly. */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.source = c.createMediaElementSource(this.el);
      this.bass = this.biquad('lowshelf', 120);
      this.mid = this.biquad('peaking', 1000, 0.8);
      this.treble = this.biquad('highshelf', 6000);
      this.bands = EQ_FREQS.map((f, i) =>
        this.biquad(i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking', f, 1.1)
      );
      this.pre = c.createGain();
      this.limiter = c.createDynamicsCompressor(); // soft safety limiter so boosts don't clip
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.82;
      const chain = [this.source, this.bass, this.mid, this.treble, ...this.bands, this.pre, this.limiter, this.analyser, c.destination];
      chain.reduce((a, b) => (a.connect(b), b));
      this.apply();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  biquad(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  apply() {
    if (!this.ctx) return;
    const s = this.settings, on = s.enabled, t = this.ctx.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, t, 0.015);
    set(this.bass.gain, on ? s.bass : 0);
    set(this.mid.gain, on ? s.mid : 0);
    set(this.treble.gain, on ? s.treble : 0);
    this.bands.forEach((b, i) => set(b.gain, on ? s.bands[i] : 0));
    set(this.pre.gain, on ? 10 ** (s.preamp / 20) : 1);
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
