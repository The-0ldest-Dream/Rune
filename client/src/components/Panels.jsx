// Right-hand panel: Now playing, Queue and Equalizer.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../store/player.jsx';
import { useLibrary } from '../store/library.jsx';
import { EQ_LABELS, PRESETS } from '../audio/engine.js';
import { chainDb, logFreqs } from '../audio/eqMath.js';
import Visualizer from './Visualizer.jsx';
import { Cover, Icon, IconButton, LikeButton, albumHref, artistHref, fmtTime } from './ui.jsx';

/** Hosts the player's <video> element, so a music video shows up where a cover normally would. */
export function VideoSurface({ className = '' }) {
  const { registerSurface, toggle } = usePlayer();
  const host = useRef(null);
  useEffect(() => registerSurface(host.current), [registerSurface]);
  return <div ref={host} className={`video-surface ${className}`} onClick={toggle} role="button" aria-label="Play or pause video" />;
}

export function NowPlaying() {
  const { current } = usePlayer();
  const lib = useLibrary();
  if (!current) {
    return (
      <div className="panel-empty">
        <Icon name="music" size={40} />
        <p>Pick something to play and it shows up here.</p>
      </div>
    );
  }
  return (
    <div className="nowplaying">
      {current.kind === 'video'
        ? <VideoSurface className="np-video" />
        : <Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="big" />}
      <div className="np-title"><h2>{current.title}</h2><LikeButton track={current} size={24} /></div>
      <p className="muted">
        {lib.artistByKey.has(current.artistKey) ? <a href={artistHref(current.artistKey)}>{current.artist}</a> : current.artist}
        {current.album ? <> · {lib.albumByKey.has(current.albumKey) ? <a href={albumHref(current.albumKey)}>{current.album}</a> : current.album}</> : null}
      </p>
      <Visualizer />
    </div>
  );
}

export function Queue() {
  const { queue, index, playIndex, removeFromQueue, moveInQueue, clearQueue } = usePlayer();
  const [drag, setDrag] = useState(null);
  if (!queue.length) return <div className="panel-empty"><Icon name="queue" size={40} /><p>Your queue is empty. Use “Add to queue” on any song.</p></div>;
  const upcoming = queue.length - index - 1;
  return (
    <div className="queue">
      <div className="panel-row">
        <span className="muted">{upcoming > 0 ? `${upcoming} up next` : 'End of queue'}</span>
        <button className="link-btn" onClick={clearQueue}>Clear queue</button>
      </div>
      {queue.map((t, i) => (
        <div
          key={t.qid} draggable
          className={`q-item ${i === index ? 'current' : ''} ${drag === i ? 'dragging' : ''}`}
          onDragStart={() => setDrag(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => { if (drag !== null) moveInQueue(drag, i); setDrag(null); }}
          onDragEnd={() => setDrag(null)}
        >
          <button className="q-main" onClick={() => playIndex(i)}>
            <Cover src={t.cover} seed={t.albumKey || t.id} label={t.title} className="thumb" />
            <span className="t-text"><span className="t-title">{t.title}</span><span className="t-artist">{t.artist}</span></span>
            <span className="dur">{fmtTime(t.duration)}</span>
          </button>
          <span className="q-actions">
            <IconButton icon="prev" size={14} label="Move up" onClick={() => moveInQueue(i, i - 1)} className="rot90" />
            <IconButton icon="close" size={16} label={`Remove ${t.title}`} onClick={() => removeFromQueue(i)} />
          </span>
        </div>
      ))}
    </div>
  );
}

function Slider({ label, value, min = -12, max = 12, onChange, unit = 'dB' }) {
  return (
    <label className="eq-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step="0.5" value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` }} />
      <output>{value > 0 ? '+' : ''}{value} {unit}</output>
    </label>
  );
}

/** Vertical slider built from plain elements: identical in every browser (native vertical range inputs are not). */
function VSlider({ value, min = -12, max = 12, step = 0.5, onChange, label }) {
  const track = useRef(null);
  const dragging = useRef(false);
  const fromY = (y) => {
    const r = track.current.getBoundingClientRect();
    const t = 1 - (y - r.top) / r.height;
    const v = min + (max - min) * Math.min(1, Math.max(0, t));
    onChange(Math.round(v / step) * step);
  };
  const pct = ((value - min) / (max - min)) * 100, zero = ((0 - min) / (max - min)) * 100;
  const onKey = (e) => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 4, PageDown: -4 }[e.key];
    if (d) { e.preventDefault(); onChange(Math.min(max, Math.max(min, value + d * step * (e.shiftKey ? 4 : 1)))); }
    else if (e.key === 'Home') onChange(max); else if (e.key === 'End') onChange(min); else if (e.key === '0') onChange(0);
  };
  return (
    <div className="vslider" role="slider" tabIndex={0} aria-orientation="vertical" aria-label={label}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} dB`}
      onKeyDown={onKey}>
      <div ref={track} className="vs-track"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromY(e.clientY); }}
        onPointerMove={(e) => dragging.current && fromY(e.clientY)}
        onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
        onDoubleClick={() => onChange(0)}>
        <span className="vs-zero" style={{ bottom: `${zero}%` }} />
        <span className="vs-fill" style={{ bottom: `${Math.min(pct, zero)}%`, height: `${Math.abs(pct - zero)}%` }} />
        <span className="vs-thumb" style={{ bottom: `${pct}%` }} />
      </div>
    </div>
  );
}

function HSlider({ label, value, min = -12, max = 12, onChange }) {
  return (
    <label className="eq-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step="0.5" value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` }} />
      <output>{value > 0 ? '+' : ''}{value} dB</output>
    </label>
  );
}

/** Live picture of what the equalizer is doing to the sound. */
function ResponseCurve({ settings }) {
  const W = 300, H = 84, RANGE = 15;
  const pts = useMemo(() => logFreqs(80).map((f, i, a) => {
    const db = Math.max(-RANGE, Math.min(RANGE, chainDb(settings, f)));
    return [(i / (a.length - 1)) * W, H / 2 - (db / RANGE) * (H / 2 - 4)];
  }), [settings]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg className="eq-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Equalizer response curve" preserveAspectRatio="none">
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="eq-grid" />
      <path d={`${line} L${W} ${H / 2} L0 ${H / 2} Z`} className="eq-area" />
      <path d={line} className="eq-line" fill="none" />
    </svg>
  );
}

export function Equalizer() {
  const { engine } = usePlayer();
  const [s, setS] = useState(engine.settings);
  useEffect(() => engine.subscribe(setS), [engine]);
  const headroom = engine.headroom();
  return (
    <div className="eq">
      <Visualizer height={70} bars={32} />
      <div className="panel-row">
        <label className="switch">
          <input type="checkbox" checked={s.enabled} onChange={(e) => engine.set({ enabled: e.target.checked })} />
          <span>Equalizer {s.enabled ? 'on' : 'off'}</span>
        </label>
        <button className="link-btn" onClick={() => engine.reset()}>Reset</button>
      </div>
      <label className="field">
        <span>Preset</span>
        <select value={s.preset} onChange={(e) => engine.setPreset(e.target.value)} disabled={!s.enabled}>
          {s.preset === 'Custom' && <option>Custom</option>}
          {Object.keys(PRESETS).map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <ResponseCurve settings={s} />
      <fieldset disabled={!s.enabled}>
        <legend>Tone</legend>
        <HSlider label="Bass" value={s.bass} onChange={(v) => engine.set({ bass: v, preset: s.preset })} />
        <HSlider label="Mid" value={s.mid} onChange={(v) => engine.set({ mid: v, preset: s.preset })} />
        <HSlider label="Treble" value={s.treble} onChange={(v) => engine.set({ treble: v, preset: s.preset })} />
        <HSlider label="Volume" value={s.preamp} min={-12} max={6} onChange={(v) => engine.set({ preamp: v })} />
      </fieldset>
      <fieldset disabled={!s.enabled}>
        <legend>Frequency bands (Hz) — drag, double-click to reset</legend>
        <div className="bands">
          {s.bands.map((g, i) => (
            <div key={i} className="band">
              <output>{g > 0 ? '+' : ''}{g}</output>
              <VSlider value={g} label={`${EQ_LABELS[i]} Hz`} onChange={(v) => engine.setBand(i, v)} />
              <span>{EQ_LABELS[i]}</span>
            </div>
          ))}
        </div>
      </fieldset>
      <label className="switch small">
        <input type="checkbox" checked={s.autoGain} onChange={(e) => engine.set({ autoGain: e.target.checked })} disabled={!s.enabled} />
        <span>Auto headroom{s.enabled && s.autoGain && headroom > 0.1 ? ` (−${headroom.toFixed(1)} dB to avoid distortion)` : ''}</span>
      </label>
    </div>
  );
}
