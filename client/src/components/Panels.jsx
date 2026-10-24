// Right-hand panel: Now playing, Queue and Equalizer.
import React, { useEffect, useState } from 'react';
import { usePlayer } from '../store/player.jsx';
import { useLibrary } from '../store/library.jsx';
import { EQ_LABELS, PRESETS } from '../audio/engine.js';
import Visualizer from './Visualizer.jsx';
import { Cover, Icon, IconButton, albumHref, artistHref, fmtTime } from './ui.jsx';

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
      <Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="big" />
      <h2>{current.title}</h2>
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

export function Equalizer() {
  const { engine } = usePlayer();
  const [s, setS] = useState(engine.settings);
  useEffect(() => engine.subscribe(setS), [engine]);
  return (
    <div className="eq">
      <Visualizer height={90} bars={32} />
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
      <fieldset disabled={!s.enabled}>
        <legend>Tone</legend>
        <Slider label="Bass" value={s.bass} onChange={(v) => engine.set({ bass: v })} />
        <Slider label="Mid" value={s.mid} onChange={(v) => engine.set({ mid: v })} />
        <Slider label="Treble" value={s.treble} onChange={(v) => engine.set({ treble: v })} />
        <Slider label="Preamp" value={s.preamp} min={-12} max={6} onChange={(v) => engine.set({ preamp: v })} />
      </fieldset>
      <fieldset disabled={!s.enabled}>
        <legend>Frequency bands (Hz)</legend>
        <div className="bands">
          {s.bands.map((g, i) => (
            <label key={i} className="band">
              <output>{g > 0 ? '+' : ''}{g}</output>
              <input type="range" min="-12" max="12" step="0.5" value={g} aria-label={`${EQ_LABELS[i]} Hz`}
                onChange={(e) => engine.setBand(i, Number(e.target.value))} />
              <span>{EQ_LABELS[i]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
