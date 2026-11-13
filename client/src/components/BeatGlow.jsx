import { useEffect } from 'react';
import { usePlayer } from '../store/player.jsx';
import { bassEnergy, followLevel, glowAmount } from '../beat.js';
import { prefersReduced } from '../effects.js';

/**
 * Beat-reactive glow. Reads the bass from the audio analyser and writes opacity / scale straight onto the glow and cover
 * elements (about 30 times a second). Writing CSS variables on a big container would restyle every descendant — the cause
 * of the lag in the first version — so only these two elements are touched. `strength` 0 switches it off.
 */
export function useBeat(glowRef, coverRef, strength = 1) {
  const { engine, playing } = usePlayer();
  useEffect(() => {
    const glow = glowRef.current, cover = coverRef?.current;
    const reset = () => { if (glow) { glow.style.opacity = ''; glow.style.scale = ''; } if (cover) cover.style.scale = ''; };
    if (!glow || !playing || !strength || prefersReduced()) { reset(); return undefined; }
    let raf, level = 0, avg = 0, data, last = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 32) return;
      last = now;
      const an = engine.analyser;
      if (!an) return;
      data ||= new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(data);
      level = followLevel(level, bassEnergy(data, engine.ctx?.sampleRate || 48000, an.fftSize));
      avg += (level - avg) * 0.04;
      const b = glowAmount(level, avg * 1.02) * strength;
      glow.style.opacity = (0.16 + b * 0.6).toFixed(3);
      glow.style.scale = (1 + b * 0.2).toFixed(3);
      if (cover) cover.style.scale = (1 + b * 0.015).toFixed(4);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); reset(); };
  }, [playing, engine, strength]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const BeatGlow = ({ glowRef }) => <span ref={glowRef} className="beat-glow" aria-hidden="true" />;
