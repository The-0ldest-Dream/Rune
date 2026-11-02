// Right-hand panel: Now playing, Queue and Equalizer.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../store/player.jsx';
import { useLibrary } from '../store/library.jsx';
import { EQ_LABELS, PRESETS } from '../audio/engine.js';
import { chainDb, logFreqs } from '../audio/eqMath.js';
import { activeLine, hasLyrics, lineProgress, parseLrc } from '../lyrics.js';
import { BeatGlow, useBeat } from './BeatGlow.jsx';
import TransitionEditor from './TransitionEditor.jsx';
import Visualizer from './Visualizer.jsx';
import { ArtistLinks, Cover, Icon, IconButton, LikeButton, albumHref, fmtTime } from './ui.jsx';

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
  const [expanded, setExpanded] = useState(false);
  const root = useRef(null);
  useBeat(root, expanded ? 0 : 1);        // restarts when the cover comes back after "Show less"
  if (!current) {
    return (
      <div className="panel-empty">
        <Icon name="music" size={40} />
        <p>Pick something to play and it shows up here.</p>
      </div>
    );
  }
  const isVideo = current.kind === 'video';
  if (expanded && !isVideo) {
    // "Show more": the cover gives way to the lyrics
    return (
      <div className="np-expanded">
        <div className="np-mini">
          <Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="thumb lg" />
          <span className="t-text"><span className="t-title">{current.title}</span><span className="t-artist">{current.artist}</span></span>
          <LikeButton track={current} />
        </div>
        <LyricsCard expanded onToggle={() => setExpanded(false)} />
      </div>
    );
  }
  return (
    <div className="nowplaying" ref={root}>
      <div className="np-cover">
        <BeatGlow />
        {isVideo
          ? <VideoSurface className="np-video" />
          : <Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="big" />}
      </div>
      <div className="np-title"><h2>{current.title}</h2><LikeButton track={current} size={24} /></div>
      <p className="muted">
        <ArtistLinks track={current} />
        {current.album ? <> · {lib.albumByKey.has(current.albumKey) ? <a href={albumHref(current.albumKey)}>{current.album}</a> : current.album}</> : null}
      </p>
      {isVideo ? <Visualizer /> : <LyricsCard onToggle={() => setExpanded(true)} />}
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

/** Loads lyrics for a song: stored (file tags / .lrc) first, then — if the user allowed it — the online lookup. */
function useLyrics(track) {
  const lib = useLibrary();
  const [state, setState] = useState({ status: 'idle' });
  const [again, setAgain] = useState(0);
  const trackRef = useRef(track);
  trackRef.current = track;
  const id = track?.id, kind = track?.kind;
  useEffect(() => {
    let live = true;
    if (!id) { setState({ status: 'idle' }); return undefined; }
    if (kind === 'video') { setState({ status: 'video' }); return undefined; }
    setState({ status: 'loading' });
    (async () => {
      const rec = await lib.getLyrics(id);
      if (!live) return;
      if (hasLyrics(rec)) { setState({ status: 'ready', rec }); return; }
      if (rec?.miss && Date.now() - rec.at < 30 * 86400000) { setState({ status: 'none' }); return; }   // looked before: don't ask again for 30 days
      if (lib.lyricsOnline === '1') {
        try {
          const r = await lib.findLyricsOnline(trackRef.current);
          if (live) setState(hasLyrics(r) ? { status: 'ready', rec: r } : { status: 'none' });
        } catch { if (live) setState({ status: 'error' }); }
      } else setState({ status: lib.lyricsOnline === '0' ? 'none' : 'ask' });
    })();
    return () => { live = false; };
  }, [id, kind, lib.lyricsTick, lib.lyricsOnline, again]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, retry: async () => {
    setState({ status: 'loading' });
    try { const r = await lib.findLyricsOnline(trackRef.current); setState(hasLyrics(r) ? { status: 'ready', rec: r } : { status: 'none' }); }
    catch { setState({ status: 'error' }); }
  }, refresh: () => setAgain((n) => n + 1) };
}

const SOURCES = { file: 'embedded in the song file', lrc: 'from a .lrc file', online: 'LRCLIB (online)' };

/**
 * Lyrics lines + states (loading / ask / none / error). `variant`: 'panel' (side panel), 'card' (small card in Now playing),
 * 'fs' (big, full-screen Verse / Duet look).
 */
function LyricsBody({ lyr, variant = 'panel' }) {
  const { current, time, seek } = usePlayer();
  const lib = useLibrary();
  const { state, retry } = lyr;
  const [dismissed, setDismissed] = useState(false);
  const box = useRef(null);
  const manual = useRef(0);                         // timestamp of the last manual scroll
  const parsed = useMemo(() => (state.rec ? parseLrc(state.rec.raw) : null), [state.rec]);
  const active = parsed?.synced ? activeLine(parsed.lines, time + 0.2) : -1;
  const small = variant === 'card';

  useEffect(() => {
    if (!parsed?.synced || active < 0 || !box.current || Date.now() - manual.current < 4000) return;
    const el = box.current.querySelector(`[data-i="${active}"]`);
    if (el) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight * (variant === 'fs' ? 0.38 : 0.45) + el.clientHeight / 2, behavior: 'smooth' });
  }, [active, parsed, variant]);

  const msg = (icon, text, extra) => (
    <div className={`panel-empty ${small ? 'small' : ''}`}>{!small && <Icon name={icon} size={36} />}<p>{text}</p>{extra}</div>
  );
  if (!current) return msg('lyrics', 'Play a song to see its lyrics.');
  if (state.status === 'video') return msg('video', 'Lyrics aren’t available for videos.');
  if (state.status === 'loading' || state.status === 'idle') return <div className="status" role="status"><span className="spinner" /> Looking for lyrics…</div>;
  if (state.status === 'ask' && !dismissed) {
    return msg('lyrics', 'No lyrics are stored for this song. Rune can look them up online, once per song, in the free LRCLIB database.', (
      <>
        <p className="muted small">This sends the song’s title, artist, album and length to lrclib.net. You can switch it off any time in Profile.</p>
        <div className="row center"><button className="btn" onClick={() => lib.setLyricsOnline(true)}>Find lyrics online</button><button className="btn ghost" onClick={() => setDismissed(true)}>Not now</button></div>
      </>
    ));
  }
  if (state.status === 'error') return msg('lyrics', 'Couldn’t reach the lyrics service. Check your connection.', <button className="btn" onClick={retry}>Try again</button>);
  if (state.status !== 'ready') {
    return msg('lyrics', 'No lyrics found for this song.', lib.lyricsOnline === '1'
      ? <button className="btn ghost" onClick={retry}>Search again</button>
      : <p className="muted small">Turn on online lyrics in Profile, or put a .lrc file with the same name next to the song.</p>);
  }
  return (
    <div className={`lyrics ${variant} ${parsed.synced ? 'synced' : 'plain'}`} ref={box}
      onWheel={() => { manual.current = Date.now(); }} onTouchMove={() => { manual.current = Date.now(); }}>
      {parsed.lines.map((l, i) => {
        const on = i === active;
        const style = parsed.synced && active >= 0 ? { '--d': Math.abs(i - active), ...(on ? { '--p': lineProgress(parsed.lines, i, time).toFixed(3) } : null) } : undefined;
        return (
          <p key={i} data-i={i} style={style} className={`ly-line ${on ? 'active' : ''} ${!l.text ? 'gap' : ''}`}
            onClick={parsed.synced ? () => { manual.current = 0; seek(l.t); } : undefined}>
            <span className="ly-text">{l.text || '\u00a0'}</span>
          </p>
        );
      })}
      <p className="ly-source">Lyrics {SOURCES[state.rec.source] || ''}{parsed.synced ? ' · synced' : ''}</p>
    </div>
  );
}

/** Lyrics for the current song (side panel or the full-screen Verse / Duet themes). */
export function LyricsPanel({ variant = 'panel' }) {
  const { current } = usePlayer();
  const lyr = useLyrics(current);
  return <LyricsBody lyr={lyr} variant={variant} />;
}

/** The coloured card in Now playing: a few lines of lyrics (or the visualizer), with Show more / Show less. */
function LyricsCard({ expanded = false, onToggle }) {
  const { current } = usePlayer();
  const lib = useLibrary();
  const lyr = useLyrics(current);
  const [mode, setMode] = useState(() => localStorage.getItem('rune.npMode') || 'lyrics');
  const status = lyr.state.status;
  const showViz = mode === 'viz' || status === 'none';        // no lyrics → show the visualizer instead of an empty card
  const flip = () => { const n = mode === 'viz' ? 'lyrics' : 'viz'; setMode(n); try { localStorage.setItem('rune.npMode', n); } catch { /* ignore */ } };
  return (
    <section className={`lyrics-card ${expanded ? 'expanded' : ''}`}>
      <header>
        <strong>{showViz ? (mode === 'lyrics' && status === 'none' ? 'No lyrics for this song' : 'Visualizer') : 'Lyrics'}</strong>
        <span>
          <IconButton icon="wave" size={18} label={mode === 'viz' ? 'Show lyrics' : 'Show visualizer'} active={mode === 'viz'} onClick={flip} />
          <IconButton icon={expanded ? 'collapseArrow' : 'expandArrow'} size={18} label={expanded ? 'Show less' : 'Show more'} onClick={onToggle} />
        </span>
      </header>
      <div className="lc-body">
        {showViz
          ? <><Visualizer height={expanded ? 220 : 110} bars={32} />{mode === 'lyrics' && status === 'none' && lib.lyricsOnline !== '1' && <p className="lc-note">Turn on online lyrics in Profile, or add a .lrc file.</p>}</>
          : <LyricsBody lyr={lyr} variant="card" />}
      </div>
      {!showViz && status === 'ready' && <button className="btn show-more" onClick={onToggle}>{expanded ? 'Show less' : 'Show more'}</button>}
    </section>
  );
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEPS = [15, 30, 45, 60];
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Playback speed, sleep timer, crossfade and gapless playback. */
export function PlaybackPanel() {
  const { rate, setRate, xfade, setXfade, gapless, setGapless, sleep, setSleep } = usePlayer();
  const [now, setNow] = useState(Date.now());
  const [custom, setCustom] = useState('');
  const [editor, setEditor] = useState(false);
  useEffect(() => {
    if (sleep.mode !== 'timer') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sleep.mode]);
  const left = sleep.mode === 'timer' ? Math.max(0, sleep.endsAt - now) : 0;
  return (
    <div className="playback">
      <section>
        <h3>Speed <span className="muted">· {rate}×</span></h3>
        <div className="pills" role="group" aria-label="Playback speed">
          {SPEEDS.map((v) => <button key={v} className={`pill ${rate === v ? 'on' : ''}`} onClick={() => setRate(v)}>{v}×</button>)}
        </div>
        <input type="range" min="0.5" max="2" step="0.05" value={rate} aria-label="Playback speed" onChange={(e) => setRate(Number(e.target.value))}
          style={{ '--p': `${((rate - 0.5) / 1.5) * 100}%` }} />
      </section>

      <section>
        <h3>Sleep timer {sleep.mode === 'timer' && <span className="muted">· stops in {mmss(left)}</span>}{sleep.mode === 'song' && <span className="muted">· after this song</span>}</h3>
        <div className="pills" role="group" aria-label="Sleep timer">
          <button className={`pill ${sleep.mode === 'off' ? 'on' : ''}`} onClick={() => setSleep(null)}>Off</button>
          {SLEEPS.map((m) => <button key={m} className={`pill ${sleep.mode === 'timer' && sleep.minutes === m ? 'on' : ''}`} onClick={() => setSleep({ minutes: m })}>{m} min</button>)}
          <button className={`pill ${sleep.mode === 'song' ? 'on' : ''}`} onClick={() => setSleep('song')}>End of song</button>
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const m = Number(custom); if (m >= 1 && m <= 720) { setSleep({ minutes: Math.round(m) }); setCustom(''); } }}>
          <input className="filter-input" type="number" min="1" max="720" placeholder="Custom minutes" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom minutes" />
          <button className="btn ghost" disabled={!custom}>Set</button>
        </form>
        <p className="muted small">The music fades out over the last 10 seconds.</p>
      </section>

      <section>
        <h3 className="h-row">Crossfade <span className="muted">· {xfade ? `${xfade} s` : 'off'}</span><button className="link-btn adv" onClick={() => setEditor(true)}>Advanced</button></h3>
        <input type="range" min="0" max="12" step="1" value={xfade} aria-label="Crossfade seconds" onChange={(e) => setXfade(Number(e.target.value))}
          style={{ '--p': `${(xfade / 12) * 100}%` }} />
        <label className="switch small">
          <input type="checkbox" checked={gapless} onChange={(e) => setGapless(e.target.checked)} />
          <span>Gapless playback (no pause between songs)</span>
        </label>
        <p className="muted small">Crossfade blends the end of a song into the next one. Music videos never overlap. “Advanced” lets you shape the fade and hear it.</p>
      </section>
      {editor && <TransitionEditor onClose={() => setEditor(false)} />}
    </div>
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
