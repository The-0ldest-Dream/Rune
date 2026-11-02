import test from 'node:test';
import assert from 'node:assert/strict';
import { curveFromPoints, curvesFor, pointsFromShape, shapeAt, SHAPES } from '../src/audio/transition.js';
import { peaks, onsetEnvelope, estimateBpm, barsToSeconds } from '../src/audio/audioAnalysis.js';

test('presets start/end correctly and the equal-power ones keep constant loudness', () => {
  for (const shape of Object.keys(SHAPES)) {
    const c = curvesFor({ shape }, 64);
    assert.ok(Math.abs(c.out[0] - 1) < 1e-6 && Math.abs(c.out[63]) < 1e-6 && Math.abs(c.in[0]) < 1e-6 && Math.abs(c.in[63] - 1) < 1e-6, shape);
    if (shape !== 'linear') for (let i = 0; i < 64; i++) assert.ok(Math.abs(c.out[i] ** 2 + c.in[i] ** 2 - 1) < 0.02, `${shape} @${i}`);
  }
  assert.ok(shapeAt('late', 0.2).out > 0.99);                                    // old song holds on early
});

test('monotone interpolation passes through points and never overshoots', () => {
  const pts = [{ t: 0, v: 1 }, { t: 0.25, v: 0.9 }, { t: 0.5, v: 0.2 }, { t: 0.75, v: 0.15 }, { t: 1, v: 0 }];
  const c = curveFromPoints(pts, 101);
  for (const p of pts) assert.ok(Math.abs(c[Math.round(p.t * 100)] - p.v) < 1e-6, `point ${p.t}`);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] <= c[i - 1] + 1e-6, `monotone at ${i}`);        // a falling curve never rises
  assert.ok(Math.min(...c) >= 0 && Math.max(...c) <= 1);
  const custom = curvesFor({ shape: 'custom', points: pointsFromShape('smooth') }, 64);
  const smooth = curvesFor({ shape: 'smooth' }, 64);
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(custom.out[i] - smooth.out[i]) < 0.06);              // sampled preset ≈ preset
});

test('peaks and tempo detection', () => {
  const sr = 8000, secs = 24;
  const clicks = (bpm) => { const x = new Float32Array(sr * secs), gap = (60 / bpm) * sr; for (let t = 0; t < x.length; t += gap) for (let k = 0; k < 40; k++) x[Math.floor(t) + k] = (k % 2 ? 1 : -1) * Math.exp(-k / 10) * 0.9; return x; };
  for (const bpm of [100, 120, 128, 150]) {
    const { env, rate } = onsetEnvelope(clicks(bpm), sr);
    const est = estimateBpm(env, rate);
    assert.ok(Math.abs(est - bpm) <= 2, `${bpm} → ${est}`);
  }
  assert.equal(estimateBpm(new Float32Array(2000), 100), 0);                                           // silence
  const p = peaks(Float32Array.from([0, 0.5, -0.9, 0.1, 0, 0, 0.3, -0.2]), 0, 8, 4);
  assert.deepEqual([...p].map((v) => Math.round(v * 10) / 10), [0.5, 0.9, 0, 0.3]);
  assert.equal(Math.round(barsToSeconds(4, 120) * 100) / 100, 8); assert.equal(barsToSeconds(2, 0), 0);
});
