import test from 'node:test';
import assert from 'node:assert/strict';
import { biquadDb, chainDb, peakBoostDb, logFreqs } from '../src/audio/eqMath.js';
import { PRESETS } from '../src/audio/engine.js';

const flat = { enabled: true, bass: 0, mid: 0, treble: 0, bands: Array(10).fill(0) };

test('biquad maths matches the requested gain', () => {
  assert.ok(Math.abs(biquadDb('peaking', 1000, 1.4, 6, 1000) - 6) < 0.01);
  assert.ok(Math.abs(biquadDb('peaking', 1000, 1.4, -9, 1000) + 9) < 0.01);
  assert.ok(Math.abs(biquadDb('lowshelf', 1000, 0.7, 6, 20) - 6) < 0.2);   // far below the corner: full gain
  assert.ok(Math.abs(biquadDb('lowshelf', 1000, 0.7, 6, 20000)) < 0.2);    // far above: untouched
  assert.ok(Math.abs(biquadDb('highshelf', 6000, 0.7, 6, 20000) - 6) < 0.3);
  assert.ok(Math.abs(biquadDb('highshelf', 6000, 0.7, 6, 40)) < 0.2);
  assert.ok(Math.abs(biquadDb('peaking', 1000, 1.4, 6, 100)) < 1);         // narrow: far-away frequencies barely move
});

test('flat EQ has no boost and presets are compensated exactly', () => {
  assert.equal(peakBoostDb(flat), 0);
  assert.equal(peakBoostDb({ ...flat, enabled: false, bass: 12 }), 0);
  for (const [name, bands] of Object.entries(PRESETS)) {
    const s = { ...flat, bands };
    const peak = peakBoostDb(s);
    const after = Math.max(...logFreqs(200).map((f) => chainDb(s, f) - peak));
    assert.ok(after <= 0.05, `${name}: still ${after.toFixed(2)} dB over after headroom`);
    if (name !== 'Flat' && name !== 'Late night') assert.ok(peak > 1, `${name} should boost something`);
  }
  const bass = peakBoostDb({ ...flat, bass: 12 });
  assert.ok(bass > 10 && bass < 13, `bass +12 → peak ${bass}`);
});
