// Beat detection helpers for the reactive glow (pure functions; the analyser feeds them frequency bytes).

/** Average low-frequency energy (below ~180 Hz) as 0..1 from analyser bytes. */
export function bassEnergy(data, sampleRate = 48000, fftSize = 512) {
  const binHz = sampleRate / fftSize;
  const hi = Math.max(2, Math.min(data.length, Math.round(180 / binHz)));
  let sum = 0;
  for (let i = 0; i < hi; i++) sum += data[i];
  return sum / hi / 255;
}

/** Fast attack, slow release envelope so the glow jumps on a hit and eases back. */
export const followLevel = (prev, energy, attack = 0.65, release = 0.1) => prev + (energy - prev) * (energy > prev ? attack : release);

/** 0..1 glow amount: a little for loudness plus a lot for sudden rises above the running average. */
export const glowAmount = (level, average) => Math.max(0, Math.min(1, 0.25 * level + 1.8 * Math.max(0, level - average)));
