import { useEffect } from 'react';
import { usePlayer } from '../store/player.jsx';
import { bassEnergy, followLevel, glowAmount } from '../beat.js';
import { prefersReduced } from '../effects.js';

/** Drives the --beat CSS variable (0..1) on `ref`'s element from the bass of the music. Cheap: one analyser read per frame, only while playing. */
export function useBeat(ref, strength = 1) {
  const { engine, playing } = usePlayer();
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!playing || prefersReduced()) { el.style.setProperty('--beat', '0'); return undefined; }
    let raf, level = 0, avg = 0, data;
    const loop = () => {
      const an = engine.analyser;
      if (an) {
        data ||= new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data);
        level = followLevel(level, bassEnergy(data, engine.ctx?.sampleRate || 48000, an.fftSize));
        avg += (level - avg) * 0.03;
        el.style.setProperty('--beat', (glowAmount(level, avg * 1.02) * strength).toFixed(3));
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); el.style.setProperty('--beat', '0'); };
  }, [playing, engine, strength]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const BeatGlow = () => <span className="beat-glow" aria-hidden="true" />;
