// Advanced crossfade editor: see the end of the current song and the start of the next one, shape the fade curves by dragging,
// and listen to the exact transition. Settings apply to every crossfade.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { SHAPES, curveFromPoints, curvesFor, pointsFromShape } from '../audio/transition.js';
import { barsToSeconds, estimateBpm, onsetEnvelope, peaks } from '../audio/audioAnalysis.js';
import { Cover, Icon, IconButton, fmtTime } from './ui.jsx';

const LANE = 104, GAP = 16, SEG_SECONDS = 40, MAX_BYTES = 90e6;
const STAGE_H = LANE * 2 + GAP;

/** Decodes the last (tail) or first (head) 40 s of a song: stereo samples for preview, mono for waveform + tempo. */
async function analyse(blob, side) {
  if (!blob || blob.size > MAX_BYTES) return null;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const buf = await new Offline(2, 1, 44100).decodeAudioData(await blob.arrayBuffer());
  const sr = buf.sampleRate, n = Math.min(buf.length, Math.floor(SEG_SECONDS * sr));
  const start = side === 'tail' ? buf.length - n : 0;
  const l = buf.getChannelData(0).slice(start, start + n);
  const r = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice(start, start + n);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (l[i] + r[i]) / 2;
  const { env, rate } = onsetEnvelope(mono, sr);
  return { sr, ch: [l, r], mono, bpm: estimateBpm(env, rate), duration: buf.duration };
}

const fake = (n, seed) => Float32Array.from({ length: n }, (_, i) => (Math.sin(i * 0.7 + seed) * 0.5 + 0.5) * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.13 + seed * 2))));

function barsPath(arr, x0, x1, cy, hh, scale) {
  const step = (x1 - x0) / arr.length;
  let d = '';
  for (let i = 0; i < arr.length; i++) {
    const a = Math.max(1.5, arr[i] * (scale ? scale(i) : 1) * hh), x = x0 + (i + 0.5) * step;
    d += `M${x.toFixed(1)} ${(cy - a).toFixed(1)}V${(cy + a).toFixed(1)}`;
  }
  return d;
}

function TrackRow({ track, bpm, label }) {
  return (
    <div className="xfe-track">
      <Cover src={track.cover} seed={track.albumKey || track.id} label={track.title} className="thumb" />
      <span className="t-text"><span className="t-title">{track.title}</span><span className="t-artist">{label} · {track.artist}</span></span>
      <span className="xfe-meta">{bpm ? <b>{Math.round(bpm)} bpm</b> : <span className="muted">– bpm</span>}<span className="muted">{fmtTime(track.duration)}</span></span>
    </div>
  );
}

export default function TransitionEditor({ onClose }) {
  const lib = useLibrary();
  const { queue, index, repeat, xfade, setXfade, xfadeAdv, setXfadeAdv, pause } = usePlayer();
  const [data, setData] = useState({ status: 'loading' });
  const [previewing, setPreviewing] = useState(false);
  const [head, setHead] = useState(null);
  const [w, setW] = useState(0);
  const stage = useRef(null);
  const svg = useRef(null);
  const preview = useRef(null);
  const drag = useRef(null);

  // The pair to show: the current song and what follows it (or two library songs when nothing is queued).
  const pair = useMemo(() => {
    const ok = (t) => t && t.kind !== 'video' && !t.missing;
    const cur = queue[index];
    let ni = index + 1;
    if (ni >= queue.length) ni = repeat === 'all' ? 0 : -1;
    if (ok(cur) && ni >= 0 && ok(queue[ni]) && queue[ni].id !== cur.id) return { out: cur, inn: queue[ni], real: true };
    const songs = lib.tracks.filter(ok);
    return songs.length >= 2 ? { out: songs[0], inn: songs[1], real: false } : null;
  }, [queue, index, repeat, lib.tracks]);

  useEffect(() => { if (!xfade) setXfade(4); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const L = Math.max(1, xfade || 4), pad = Math.max(2, L * 0.5), total = L + 2 * pad;
  const xOf = useCallback((sec) => ((sec + pad) / total) * w, [pad, total, w]);

  useEffect(() => {
    let live = true;
    if (!pair) { setData({ status: 'none' }); return undefined; }
    setData({ status: 'loading' });
    (async () => {
      try {
        const [o, i] = await Promise.all([analyse(lib.fileBlob(pair.out.id), 'tail'), analyse(lib.fileBlob(pair.inn.id), 'head')]);
        if (live) setData({ status: 'ready', out: o, inn: i });
      } catch { if (live) setData({ status: 'ready', out: null, inn: null }); }
    })();
    return () => { live = false; };
  }, [pair?.out.id, pair?.inn.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!stage.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, [pair]);

  // ---- curves ----
  const pts = xfadeAdv.shape === 'custom' && xfadeAdv.points ? xfadeAdv.points : pointsFromShape(SHAPES[xfadeAdv.shape] ? xfadeAdv.shape : 'equal');
  const cOut = useMemo(() => curveFromPoints(pts.out, 90), [pts]);
  const cIn = useMemo(() => curveFromPoints(pts.in, 90), [pts]);
  const caption = xfadeAdv.shape === 'custom' ? 'Custom' : SHAPES[xfadeAdv.shape] || 'Equal power';

  const movePoint = (which, i, ev) => {
    const r = svg.current.getBoundingClientRect();
    const t0 = xOf(0), t1 = xOf(L), top = which === 'out' ? 0 : LANE + GAP;
    const t = (ev.clientX - r.left - t0) / (t1 - t0), v = 1 - (ev.clientY - r.top - top) / LANE;
    const next = { out: pts.out.map((p) => ({ ...p })), in: pts.in.map((p) => ({ ...p })) };
    const list = next[which];
    list[i] = { t: Math.min(list[i + 1].t - 0.05, Math.max(list[i - 1].t + 0.05, t)), v: Math.min(1, Math.max(0, v)) };
    setXfadeAdv({ shape: 'custom', points: next });
  };
  const pickShape = (shape) => setXfadeAdv({ shape });

  // ---- waveforms ----
  const wave = useMemo(() => {
    if (!w || data.status !== 'ready') return null;
    const nOut = Math.max(24, Math.round((w * (L + pad)) / total / 3));
    const norm = (a) => { let m = 0; for (const v of a) if (v > m) m = v; return a.map((v) => Math.min(1, v / Math.max(m, 1e-4) * 0.95)); };
    const out = data.out
      ? norm(peaks(data.out.mono, Math.max(0, data.out.mono.length - (L + pad) * data.out.sr), data.out.mono.length, nOut))
      : fake(nOut, 1);
    const inn = data.inn ? norm(peaks(data.inn.mono, 0, Math.min(data.inn.mono.length, (L + pad) * data.inn.sr), nOut)) : fake(nOut, 5);
    return { out, inn };
  }, [data, w, L, pad, total]);

  // ---- preview (plays the real transition through a separate audio context) ----
  const stopPreview = useCallback(() => {
    const p = preview.current;
    if (!p) return;
    preview.current = null;
    cancelAnimationFrame(p.raf);
    try { p.ctx.close(); } catch { /* already closed */ }
    setPreviewing(false); setHead(null);
  }, []);
  useEffect(() => stopPreview, [stopPreview]);

  const startPreview = () => {
    if (previewing) { stopPreview(); return; }
    if (!data.out || !data.inn) return;
    pause();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const O = data.out, I = data.inn;
    const mk = (seg, from, to) => {
      const b = ctx.createBuffer(2, to - from, seg.sr);
      b.copyToChannel(seg.ch[0].subarray(from, to), 0); b.copyToChannel(seg.ch[1].subarray(from, to), 1);
      return b;
    };
    const oBuf = mk(O, Math.max(0, O.mono.length - Math.round((L + pad) * O.sr)), O.mono.length);
    const iBuf = mk(I, 0, Math.min(I.mono.length, Math.round((L + pad) * I.sr)));
    const curves = curvesFor(xfadeAdv);
    const master = ctx.createGain(), outG = ctx.createGain(), inG = ctx.createGain();
    master.gain.value = 0.9; outG.connect(master); inG.connect(master); master.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.12, tf = t0 + Math.max(0, oBuf.duration - L);      // when the fade begins
    outG.gain.setValueAtTime(1, t0); outG.gain.setValueAtTime(1, tf); outG.gain.setValueCurveAtTime(curves.out, tf, L);
    inG.gain.setValueAtTime(0, t0); inG.gain.setValueAtTime(0, tf); inG.gain.setValueCurveAtTime(curves.in, tf, L);
    const so = ctx.createBufferSource(); so.buffer = oBuf; so.connect(outG); so.start(t0);
    const si = ctx.createBufferSource(); si.buffer = iBuf; si.connect(inG); si.start(tf);
    si.onended = stopPreview;
    const state = { ctx, raf: 0 };
    const tick = () => { setHead(ctx.currentTime - tf); state.raf = requestAnimationFrame(tick); };
    preview.current = state;
    setPreviewing(true);
    tick();
  };

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') { stopPreview(); onClose(); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, stopPreview]);

  // ---- controls ----
  const bpm = data.out?.bpm || data.inn?.bpm || 0;
  const barOptions = bpm > 0 ? [1, 2, 4, 8].filter((b) => barsToSeconds(b, bpm) <= 12.05 && barsToSeconds(b, bpm) >= 0.9) : [];
  const matchBars = barOptions.find((b) => Math.abs(barsToSeconds(b, bpm) - L) < 0.15);
  const lenValue = matchBars ? `b${matchBars}` : 's';
  const onLen = (v) => { if (v.startsWith('b')) setXfade(barsToSeconds(Number(v.slice(1)), bpm)); };
  const gap = data.out?.bpm && data.inn?.bpm ? Math.abs(data.out.bpm - data.inn.bpm) : null;

  const laneTop = { out: 0, in: LANE + GAP };
  const curvePath = (arr, top) => arr.map((v, j, a) => `${j ? 'L' : 'M'}${xOf((j / (a.length - 1)) * L).toFixed(1)} ${(top + LANE * (1 - v)).toFixed(1)}`).join('');
  const handle = (which, top) => pts[which].map((p, i) => (i === 0 || i === pts[which].length - 1) ? null : (
    <circle key={`${which}${i}`} className="xfe-handle" cx={xOf(p.t * L)} cy={top + LANE * (1 - p.v)} r="8" tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { which, i }; }}
      onPointerMove={(e) => drag.current && drag.current.which === which && drag.current.i === i && movePoint(which, i, e)}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
  ));
  const outScale = (i) => { const s = -pad + ((i + 0.5) / wave.out.length) * (L + pad); return s <= 0 ? 1 : cOut[Math.min(89, Math.round((s / L) * 89))]; };
  const inScale = (i) => { const s = ((i + 0.5) / wave.inn.length) * (L + pad); return s >= L ? 1 : cIn[Math.min(89, Math.round((s / L) * 89))]; };

  return createPortal(
    <div className="modal-back xfe-back" onMouseDown={(e) => { if (e.target === e.currentTarget) { stopPreview(); onClose(); } }}>
      <div className="xfe" role="dialog" aria-modal="true" aria-label="Crossfade editor">
        <header className="xfe-head">
          <div><h2>Crossfade</h2><p className="muted small">Drag the dots to shape the blend. Press play to hear it.</p></div>
          <IconButton icon="close" label="Close" onClick={() => { stopPreview(); onClose(); }} />
        </header>

        {!pair ? (
          <p className="status muted">Add at least two songs to design a crossfade.</p>
        ) : (
          <>
            <TrackRow track={pair.out} bpm={data.out?.bpm} label="Outgoing" />
            <div className="xfe-stage" ref={stage} style={{ height: STAGE_H }}>
              <div className="xfe-caption">{caption} · {L.toFixed(1)} s</div>
              {w > 0 && wave && (
                <svg ref={svg} width={w} height={STAGE_H} aria-label="Waveforms and fade curves">
                  <rect className="xfe-lane" x="0" y="0" width={w} height={LANE} rx="12" />
                  <rect className="xfe-lane" x="0" y={LANE + GAP} width={w} height={LANE} rx="12" />
                  <rect className="xfe-zone" x={xOf(0)} y="0" width={xOf(L) - xOf(0)} height={STAGE_H} />
                  {(() => {
                    const stepO = (xOf(L) - xOf(-pad)) / wave.out.length, stepI = (xOf(L + pad) - xOf(0)) / wave.inn.length;
                    return (
                      <>
                        <path className="xfe-wave" d={barsPath(wave.out, xOf(-pad), xOf(L), LANE / 2, LANE / 2 - 8)} strokeWidth={Math.max(1.5, stepO * 0.7)} />
                        <path className="xfe-wave live" d={barsPath(wave.out, xOf(-pad), xOf(L), LANE / 2, LANE / 2 - 8, outScale)} strokeWidth={Math.max(1.5, stepO * 0.7)} />
                        <path className="xfe-wave" d={barsPath(wave.inn, xOf(0), xOf(L + pad), LANE + GAP + LANE / 2, LANE / 2 - 8)} strokeWidth={Math.max(1.5, stepI * 0.7)} />
                        <path className="xfe-wave live" d={barsPath(wave.inn, xOf(0), xOf(L + pad), LANE + GAP + LANE / 2, LANE / 2 - 8, inScale)} strokeWidth={Math.max(1.5, stepI * 0.7)} />
                      </>
                    );
                  })()}
                  <path className="xfe-curve" d={curvePath(cOut, laneTop.out)} />
                  <path className="xfe-curve in" d={curvePath(cIn, laneTop.in)} />
                  {handle('out', laneTop.out)}
                  {handle('in', laneTop.in)}
                  <g className="xfe-playhead" style={{ transform: `translateX(${xOf(head ?? 0)}px)` }}>
                    <line x1="0" x2="0" y1="0" y2={STAGE_H} /><circle cx="0" cy={LANE + GAP / 2} r="4" />
                  </g>
                </svg>
              )}
              {data.status === 'loading' && <div className="xfe-loading"><span className="spinner" /> Analysing songs…</div>}
              <button className={`xfe-play ${previewing ? 'on' : ''}`} onClick={startPreview} disabled={!data.out || !data.inn} aria-label={previewing ? 'Stop preview' : 'Play preview'}
                title={!data.out || !data.inn ? 'These files are too large to preview' : previewing ? 'Stop' : 'Play the transition'}>
                {previewing ? <span className="xfe-stop" /> : <Icon name="play" size={22} />}
              </button>
            </div>
            <TrackRow track={pair.inn} bpm={data.inn?.bpm} label="Incoming" />
            {!pair.real && <p className="muted small xfe-note">Queue two or more songs to design with the real pair — showing two songs from your library.</p>}
            {gap != null && <p className="muted small xfe-note">{gap < 4 ? 'Tempos match — a short blend will sound tight.' : `Tempo gap of ${Math.round(gap)} bpm — a longer blend sounds smoother.`}</p>}

            <div className="xfe-controls">
              <label className="xfe-pill">
                <select value={lenValue} onChange={(e) => onLen(e.target.value)} aria-label="Length of the blend">
                  {barOptions.map((b) => <option key={b} value={`b${b}`}>{b} {b === 1 ? 'bar' : 'bars'}</option>)}
                  {!matchBars && <option value="s">{L.toFixed(1)} s</option>}
                </select>
              </label>
              <label className="xfe-len">
                <span className="muted small">Length</span>
                <input type="range" min="1" max="12" step="0.5" value={L} onChange={(e) => setXfade(Number(e.target.value))} style={{ '--p': `${((L - 1) / 11) * 100}%` }} aria-label="Crossfade length in seconds" />
                <output>{L.toFixed(1)} s</output>
              </label>
            </div>
            <div className="pills xfe-shapes" role="group" aria-label="Fade shape">
              {Object.entries(SHAPES).map(([k, name]) => <button key={k} className={`pill ${xfadeAdv.shape === k ? 'on' : ''}`} onClick={() => pickShape(k)}>{name}</button>)}
              <button className={`pill ${xfadeAdv.shape === 'custom' ? 'on' : ''}`} onClick={() => setXfadeAdv({ shape: 'custom', points: pts })}>Custom</button>
            </div>
          </>
        )}
        <footer className="xfe-foot">
          <button className="link-btn" onClick={() => { setXfadeAdv({ shape: 'equal' }); setXfade(4); }}>Reset</button>
          <button className="btn" onClick={() => { stopPreview(); onClose(); }}>Done</button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
