// Pure helpers for gapless playback / crossfade between two media elements.

/** Equal-power fade curves (so the mix keeps constant loudness while one song fades out and the next fades in). */
export function fadeCurves(n = 64) {
  const out = new Float32Array(n), inn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out[i] = Math.cos((t * Math.PI) / 2);
    inn[i] = Math.sin((t * Math.PI) / 2);
  }
  return { out, in: inn };
}

/** Which queue index follows the current one for an automatic (overlapping) transition, or null when none should overlap. */
export function overlapTarget({ index, queue, repeat, sleepSong }) {
  if (sleepSong || repeat === 'one' || index < 0) return null;
  let ni = index + 1;
  if (ni >= queue.length) { if (repeat === 'all' && queue.length > 0) ni = 0; else return null; }
  const cur = queue[index], nxt = queue[ni];
  if (!nxt || !cur || cur.kind === 'video' || nxt.kind === 'video' || nxt.missing) return null;   // videos never overlap
  return ni;
}

/** Seconds before the end at which the next song should start: the crossfade length, or a hair earlier for gapless. */
export const leadSeconds = ({ crossfade, gapless }) => (crossfade > 0 ? crossfade : gapless ? 0.06 : -1);

/** Decide what to do now, given real seconds left in the current song. */
export function transitionStep({ remaining, lead, ready }) {
  if (lead < 0 || !(remaining >= 0)) return 'idle';
  if (remaining <= lead + 0.02) return ready ? 'start' : 'prefetch';
  if (remaining <= lead + 6) return 'prefetch';
  return 'idle';
}

/* ---------- Advanced crossfade: shapes and editable curves ---------- */
export const SHAPES = { equal: 'Equal power', linear: 'Linear', smooth: 'Smooth', late: 'Late blend' };
const smoothstep = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const power = (s) => ({ out: Math.cos((s * Math.PI) / 2), in: Math.sin((s * Math.PI) / 2) });
const SHAPE_FN = {
  equal: (t) => power(t),
  linear: (t) => ({ out: 1 - t, in: t }),
  smooth: (t) => power(t * t * (3 - 2 * t)),                 // eases in and out, constant loudness
  late: (t) => power(smoothstep(0.3, 0.95, t)),               // the old song holds on, then blends quickly
};

/** Gain at normalised time t (0..1) for a preset shape. */
export const shapeAt = (shape, t) => (SHAPE_FN[shape] || SHAPE_FN.equal)(t);

/** Editable control points for a curve: fixed ends, three movable points. */
export function pointsFromShape(shape) {
  const ts = [0, 0.25, 0.5, 0.75, 1];
  return { out: ts.map((t) => ({ t, v: shapeAt(shape, t).out })), in: ts.map((t) => ({ t, v: shapeAt(shape, t).in })) };
}

/** Monotone cubic interpolation through points (no overshoot, so a fade never "bounces"). Returns n samples over t = 0..1. */
export function curveFromPoints(points, n = 64) {
  const p = points.slice().sort((a, b) => a.t - b.t);
  const k = p.length;
  const d = [], m = new Array(k).fill(0);
  for (let i = 0; i < k - 1; i++) d.push((p[i + 1].v - p[i].v) / Math.max(1e-6, p[i + 1].t - p[i].t));
  m[0] = d[0]; m[k - 1] = d[k - 2];
  for (let i = 1; i < k - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < k - 1; i++) {                                // Fritsch–Carlson limiter
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
  }
  const out = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const t = j / (n - 1);
    let i = 0;
    while (i < k - 2 && t > p[i + 1].t) i++;
    const h = Math.max(1e-6, p[i + 1].t - p[i].t), u = (t - p[i].t) / h, u2 = u * u, u3 = u2 * u;
    const v = (2 * u3 - 3 * u2 + 1) * p[i].v + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * p[i + 1].v + (u3 - u2) * h * m[i + 1];
    out[j] = Math.min(1, Math.max(0, v));
  }
  return out;
}

/** The two gain curves for a crossfade setting `{ shape, points? }` (shape 'custom' uses the edited points). */
export function curvesFor(adv, n = 64) {
  if (adv?.shape === 'custom' && adv.points?.out && adv.points?.in) return { out: curveFromPoints(adv.points.out, n), in: curveFromPoints(adv.points.in, n) };
  const c = fadeCurves(n);
  const shape = SHAPE_FN[adv?.shape] ? adv.shape : 'equal';
  if (shape === 'equal') return c;
  const out = new Float32Array(n), inn = new Float32Array(n);
  for (let i = 0; i < n; i++) { const g = shapeAt(shape, i / (n - 1)); out[i] = g.out; inn[i] = g.in; }
  return { out, in: inn };
}
