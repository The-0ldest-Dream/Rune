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
