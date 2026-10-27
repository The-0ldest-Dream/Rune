// Frequency-bar visualiser driven by the engine's AnalyserNode.
import React, { useEffect, useRef } from 'react';
import { usePlayer } from '../store/player.jsx';

export default function Visualizer({ height = 120, bars = 40 }) {
  const { engine, playing } = usePlayer();
  const canvas = useRef(null);

  useEffect(() => {
    const el = canvas.current;
    const g = el.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let accent = '#1ed760', frame = 0;
    const readAccent = () => { accent = getComputedStyle(el).getPropertyValue('--accent').trim() || accent; };
    readAccent();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf, data;

    const fit = () => { el.width = el.clientWidth * dpr; el.height = el.clientHeight * dpr; };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const draw = () => {
      if (frame++ % 30 === 0) readAccent();
      const { width: w, height: h } = el;
      g.clearRect(0, 0, w, h);
      const an = engine.analyser;
      if (an && !data) data = new Uint8Array(an.frequencyBinCount);
      if (an && playing) an.getByteFrequencyData(data);
      const gap = 3 * dpr, bw = (w - gap * (bars - 1)) / bars;
      g.fillStyle = accent;
      for (let i = 0; i < bars; i++) {
        // squared mapping gives the low end more bars than a linear one
        const bin = data && playing ? Math.floor(((i / bars) ** 1.7) * data.length * 0.75) : 0;
        const v = data && playing ? data[bin] / 255 : 0.04;
        const bh = Math.max(3 * dpr, v * h);
        g.globalAlpha = 0.45 + v * 0.55;
        g.beginPath();
        g.roundRect ? g.roundRect(i * (bw + gap), h - bh, bw, bh, 2 * dpr) : g.rect(i * (bw + gap), h - bh, bw, bh);
        g.fill();
      }
      if (playing && !reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [engine, playing, bars]);

  return <canvas ref={canvas} className="viz" style={{ height }} aria-label="Audio visualiser" role="img" />;
}
