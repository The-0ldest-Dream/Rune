// Player store: two media elements (A/B — <video> elements play songs AND music videos; B enables gapless + crossfade), the queue, the equalizer engine,
// playback speed and the sleep timer.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../audio/engine.js';
import { leadSeconds, overlapTarget, transitionStep } from '../audio/transition.js';
import { useLibrary } from './library.jsx';

const Ctx = createContext(null);
export const usePlayer = () => useContext(Ctx);

let qidCounter = 0;
const withQid = (t) => ({ ...t, qid: `q${++qidCounter}` });
const shuffled = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const FADE_MS = 10000;   // sleep timer fades the music out over its last 10 seconds
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const makeEl = () => {
  const el = document.createElement('video');   // plays audio files too; shown only while a music video is playing
  el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', ''); el.controls = false;
  return el;
};

export function PlayerProvider({ children }) {
  const lib = useLibrary();
  const libRef = useRef(lib);
  libRef.current = lib;

  const elsRef = useRef(null);
  if (!elsRef.current) elsRef.current = [makeEl(), makeEl()];
  const els = elsRef.current;
  const act = useRef(0);                         // which element is currently the "main" one
  const active = () => els[act.current];
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new AudioEngine(els[0], els[1]);
  const engine = engineRef.current;

  const [st, setSt] = useState({ queue: [], index: -1, label: '' });
  const stRef = useRef(st);
  const commit = (next) => { stRef.current = next; setSt(next); };

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => Number(localStorage.getItem('rune.vol') ?? 0.8));
  const [muted, setMuted] = useState(false);
  const [rate, setRateState] = useState(() => clamp(Number(localStorage.getItem('rune.rate')) || 1, 0.5, 2));
  const [xfade, setXfadeState] = useState(() => clamp(Number(localStorage.getItem('rune.xfade')) || 0, 0, 12));
  const [gapless, setGaplessState] = useState(() => localStorage.getItem('rune.gapless') !== '0');
  const [sleep, setSleepState] = useState({ mode: 'off' });          // off | timer (endsAt) | song (after the current song)
  const volumeRef = useRef(volume), rateRef = useRef(rate), xfadeRef = useRef(xfade), gaplessRef = useRef(gapless), sleepRef = useRef(sleep);
  volumeRef.current = volume; rateRef.current = rate; xfadeRef.current = xfade; gaplessRef.current = gapless; sleepRef.current = sleep;
  const fadeMul = useRef(1);
  const prep = useRef(null);                     // next song loaded into the idle element: { qid, idx, url, revoke, ready }
  const busyUntil = useRef(0);                   // the idle element is still fading out the previous song until then
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off'); // off | all | one
  const shuffleRef = useRef(false);
  const repeatRef = useRef('off');
  const origOrder = useRef([]);   // qids in original order, used to undo shuffle
  const loadId = useRef(0);
  const revokeRef = useRef(null);

  // Always show the latest title/artist/cover (songs can be edited while queued).
  const queue = useMemo(() => st.queue.map((q) => {
    const fresh = lib.byId.get(q.id) || lib.videoById.get(q.id);
    return fresh ? { ...fresh, qid: q.qid } : q;
  }), [st.queue, lib.byId, lib.videoById]);
  const current = st.index >= 0 ? queue[st.index] || null : null;
  const currentIdRef = useRef(null);
  currentIdRef.current = current?.kind === 'video' ? null : current?.id || null;   // listening stats are for songs only
  const durRef = useRef(0);
  durRef.current = duration || current?.duration || 0;

  // ---- where the picture goes: the newest mounted "surface" (Now playing panel / full screen) hosts the video element ----
  const surfaces = useRef([]);
  const attach = useCallback(() => {
    const video = els[0];                       // music videos always play on element A
    const top = surfaces.current[surfaces.current.length - 1];
    if (top) { if (video.parentNode !== top) top.appendChild(video); }
    else if (video.parentNode) video.parentNode.removeChild(video);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const registerSurface = useCallback((el) => {
    surfaces.current.push(el); attach();
    return () => { surfaces.current = surfaces.current.filter((x) => x !== el); attach(); };
  }, [attach]);

  // ---- small helpers ----
  const pauseAll = useCallback(() => els.forEach((e) => e.pause()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const applyVolume = useCallback(() => {
    els.forEach((e) => { e.volume = clamp(volumeRef.current * fadeMul.current, 0, 1); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearPrep = useCallback(() => {
    const p = prep.current;
    if (!p) return;
    prep.current = null;
    const idle = els[1 - act.current];
    if (Date.now() >= busyUntil.current) { try { idle.pause(); idle.removeAttribute('src'); idle.load(); } catch { /* ignore */ } }
    p.revoke?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setSleep = useCallback((spec) => {
    const next = !spec ? { mode: 'off' } : spec === 'song' ? { mode: 'song' } : { mode: 'timer', minutes: spec.minutes, endsAt: Date.now() + spec.minutes * 60000 };
    fadeMul.current = 1; applyVolume();
    sleepRef.current = next; setSleepState(next);
    if (next.mode === 'timer') libRef.current.toast(`Sleep timer: music will stop in ${next.minutes} minutes.`);
    if (next.mode === 'song') libRef.current.toast('Sleep timer: music will stop after this song.');
  }, [applyVolume]);

  // ---- load & play a queue index ----
  const playIndex = useCallback(async (i, autoplay = true) => {
    const { queue, label } = stRef.current;
    const track = queue[i];
    if (!track) return;
    engine.ensure(); // inside the user-gesture call stack
    clearPrep();
    // Videos play on element A; stop whatever the other element is still doing (a fading-out song, a prepared next song).
    if (track.kind === 'video' && act.current !== 0) { els[act.current].pause(); act.current = 0; }
    const idle = els[1 - act.current];
    if (!idle.paused || idle.getAttribute('src')) { idle.pause(); idle.removeAttribute('src'); }
    busyUntil.current = 0;
    engine.setActive(act.current);
    fadeMul.current = 1; applyVolume();
    commit({ queue, index: i, label });
    libRef.current.beginListen(track.id);
    const id = ++loadId.current;
    setLoading(true);
    setTime(0);
    setDuration(track.duration || 0);
    try {
      const { url, revoke } = await libRef.current.resolveSrc(track);
      if (id !== loadId.current) { revoke?.(); return; }
      revokeRef.current?.();
      revokeRef.current = revoke;
      const el = els[act.current];
      el.poster = track.kind === 'video' ? track.cover || '' : '';
      el.src = url;
      el.defaultPlaybackRate = rateRef.current; el.playbackRate = rateRef.current;
      if (autoplay) await el.play();
    } catch (e) {
      if (id !== loadId.current || e?.name === 'AbortError') return;
      libRef.current.toast('This file couldn’t be played. It may be missing or in a format your browser can’t decode.', 'error');
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, [engine, clearPrep, applyVolume]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback((dir, auto = false) => {
    const { queue, index } = stRef.current;
    if (!queue.length) return;
    if (auto && sleepRef.current.mode === 'song') {
      pauseAll(); setSleep(null);
      libRef.current.toast('Sleep timer: stopped after the song.');
      return;
    }
    if (auto && repeatRef.current === 'one') { const el = active(); el.currentTime = 0; el.play().catch(() => {}); return; }
    let ni = index + dir;
    if (ni >= queue.length) {
      if (repeatRef.current === 'all') ni = 0;
      else { pauseAll(); active().currentTime = 0; return; }
    }
    if (ni < 0) ni = repeatRef.current === 'all' ? queue.length - 1 : 0;
    playIndex(ni);
  }, [playIndex, pauseAll, setSleep]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- media element events (only the main element drives the UI) ----
  useEffect(() => {
    const only = (fn) => (e) => { if (e.target === els[act.current]) fn(e); };
    const handlers = {
      timeupdate: only((e) => setTime(e.target.currentTime)),
      loadedmetadata: only((e) => Number.isFinite(e.target.duration) && setDuration(e.target.duration)),
      play: only(() => setPlaying(true)),
      pause: only(() => setPlaying(false)),
      ended: only(() => { libRef.current.beginListen(null); advance(1, true); }),
      waiting: only(() => setLoading(true)),
      playing: only(() => setLoading(false)),
      canplay: only(() => setLoading(false)),
    };
    els.forEach((el) => Object.entries(handlers).forEach(([ev, fn]) => el.addEventListener(ev, fn)));
    return () => els.forEach((el) => Object.entries(handlers).forEach(([ev, fn]) => el.removeEventListener(ev, fn)));
  }, [advance]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { applyVolume(); localStorage.setItem('rune.vol', String(volume)); }, [volume, applyVolume]);
  useEffect(() => { els.forEach((e) => { e.muted = muted; }); }, [muted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- gapless / crossfade: load the next song into the idle element, then start it just before the current one ends ----
  const prefetch = useCallback(async (idx) => {
    const track = stRef.current.queue[idx];
    if (!track) return;
    if (prep.current && prep.current.qid === track.qid) return;
    clearPrep();
    const mine = { qid: track.qid, idx, url: null, revoke: null, ready: false };
    prep.current = mine;
    try {
      const { url, revoke } = await libRef.current.resolveSrc(track);
      if (prep.current !== mine) { revoke?.(); return; }
      mine.url = url; mine.revoke = revoke;
      const idle = els[1 - act.current];
      idle.poster = ''; idle.src = url; idle.preload = 'auto';
      idle.defaultPlaybackRate = rateRef.current; idle.playbackRate = rateRef.current;
      const ready = () => { if (prep.current === mine) mine.ready = true; };
      if (idle.readyState >= 3) ready(); else idle.addEventListener('canplay', ready, { once: true });
    } catch { if (prep.current === mine) prep.current = null; }
  }, [clearPrep]); // eslint-disable-line react-hooks/exhaustive-deps

  const startOverlap = useCallback((idx, seconds) => {
    const p = prep.current, { queue, label } = stRef.current, track = queue[idx];
    if (!p || !p.ready || !track || p.qid !== track.qid) return;
    const from = act.current, to = 1 - from, outEl = els[from], inEl = els[to];
    const fade = Math.max(seconds, 0.06);
    const oldRevoke = revokeRef.current;
    revokeRef.current = p.revoke;
    prep.current = null;
    busyUntil.current = Date.now() + fade * 1000 + 500;
    act.current = to;
    engine.crossfade(from, to, fade);
    inEl.currentTime = 0;
    inEl.play().catch(() => {});
    commit({ queue, index: idx, label });
    libRef.current.beginListen(track.id);
    setTime(0);
    setDuration(Number.isFinite(inEl.duration) && inEl.duration > 0 ? inEl.duration : track.duration || 0);
    setTimeout(() => {
      if (act.current !== from) { outEl.pause(); outEl.removeAttribute('src'); }
      oldRevoke?.();
    }, fade * 1000 + 300);
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      const lead = leadSeconds({ crossfade: xfadeRef.current, gapless: gaplessRef.current });
      if (lead < 0 || !engine.ctx || Date.now() < busyUntil.current) return;
      const el = els[act.current], dur = el.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const { queue, index } = stRef.current;
      const idx = overlapTarget({ index, queue, repeat: repeatRef.current, sleepSong: sleepRef.current.mode === 'song' });
      if (idx == null) return;
      const p = prep.current;
      const step = transitionStep({
        remaining: (dur - el.currentTime) / (el.playbackRate || 1), lead,
        ready: !!(p && p.qid === queue[idx].qid && p.ready),
      });
      if (step === 'prefetch') prefetch(idx);
      else if (step === 'start') startOverlap(idx, xfadeRef.current);
    }, 80);
    return () => clearInterval(timer);
  }, [playing, engine, prefetch, startOverlap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sleep timer (fades the music out, then pauses) ----
  useEffect(() => {
    if (sleep.mode !== 'timer') return undefined;
    const timer = setInterval(() => {
      const left = sleep.endsAt - Date.now();
      if (left <= 0) {
        clearInterval(timer);
        pauseAll(); fadeMul.current = 1; applyVolume();
        sleepRef.current = { mode: 'off' }; setSleepState({ mode: 'off' });
        libRef.current.toast('Sleep timer ended — music stopped.');
        return;
      }
      fadeMul.current = left < FADE_MS ? left / FADE_MS : 1;
      applyVolume();
    }, 250);
    return () => clearInterval(timer);
  }, [sleep.mode, sleep.endsAt, pauseAll, applyVolume]);

  // ---- public controls ----
  const toggle = useCallback(() => {
    if (!stRef.current.queue.length) return;
    engine.ensure();
    const el = active();
    if (el.paused) {
      fadeMul.current = 1; applyVolume();
      if (!el.getAttribute('src')) playIndex(Math.max(stRef.current.index, 0));
      else el.play().catch(() => {});
    } else pauseAll();
  }, [engine, playIndex, pauseAll, applyVolume]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => advance(1), [advance]);
  const prev = useCallback(() => { const el = active(); if (el.currentTime > 3) el.currentTime = 0; else advance(-1); }, [advance]); // eslint-disable-line react-hooks/exhaustive-deps
  const seek = useCallback((t) => { active().currentTime = t; setTime(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setVolume = (v) => { setVolumeState(v); if (v > 0) setMuted(false); };

  const playQueue = useCallback((all, start = 0, label = '') => {
    const chosen = all[start];
    if (chosen?.missing) { libRef.current.toast('This song isn’t on this device. Add the file in Device files to play it.'); return; }
    const tracks = all.filter((t) => !t.missing);              // faded songs (not on this device) can't play
    if (!tracks.length) { libRef.current.toast('None of these songs are on this device yet.'); return; }
    start = Math.max(0, tracks.indexOf(chosen));
    if (label === 'Search results' || label === 'Recently played') libRef.current.recordSearchPlay(chosen.id);
    let items = tracks.map(withQid);
    origOrder.current = items.map((t) => t.qid);
    let index = start;
    if (shuffleRef.current) {
      const first = items[start];
      items = [first, ...shuffled(items.filter((t) => t !== first))];
      index = 0;
    }
    commit({ queue: items, index, label });
    stRef.current = { queue: items, index, label };
    playIndex(index);
  }, [playIndex]);

  const addToQueue = useCallback((track) => {
    if (track.missing) return;
    const item = withQid(track);
    origOrder.current.push(item.qid);
    const { queue, index } = stRef.current;
    commit({ ...stRef.current, queue: [...queue, item], index });
    if (index < 0) playIndex(0, false);
    libRef.current.toast(`Added “${track.title}” to the queue.`);
  }, [playIndex]);

  const playNext = useCallback((track) => {
    if (track.missing) return;
    const item = withQid(track);
    origOrder.current.push(item.qid);
    const { queue, index } = stRef.current;
    const at = index + 1;
    commit({ ...stRef.current, queue: [...queue.slice(0, at), item, ...queue.slice(at)], index });
    if (index < 0) playIndex(0, false);
    libRef.current.toast(`“${track.title}” will play next.`);
  }, [playIndex]);

  const removeFromQueue = useCallback((i) => {
    const { queue, index } = stRef.current;
    const nq = queue.filter((_, k) => k !== i);
    if (i < index) commit({ ...stRef.current, queue: nq, index: index - 1 });
    else if (i > index) commit({ ...stRef.current, queue: nq, index });
    else if (!nq.length) { pauseAll(); clearPrep(); active().removeAttribute('src'); commit({ queue: [], index: -1, label: '' }); }
    else { commit({ ...stRef.current, queue: nq, index: Math.min(i, nq.length - 1) }); playIndex(Math.min(i, nq.length - 1), !active().paused); }
  }, [playIndex, pauseAll, clearPrep]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveInQueue = useCallback((from, to) => {
    const { queue, index } = stRef.current;
    if (from === to || to < 0 || to >= queue.length) return;
    const nq = queue.slice();
    const [m] = nq.splice(from, 1);
    nq.splice(to, 0, m);
    let ni = index;
    if (index === from) ni = to;
    else if (from < index && to >= index) ni = index - 1;
    else if (from > index && to <= index) ni = index + 1;
    commit({ ...stRef.current, queue: nq, index: ni });
  }, []);

  const clearQueue = useCallback(() => {
    const { queue, index } = stRef.current;
    const cur = queue[index];
    origOrder.current = cur ? [cur.qid] : [];
    commit({ ...stRef.current, queue: cur ? [cur] : [], index: cur ? 0 : -1 });
  }, []);

  const toggleShuffle = useCallback(() => {
    const on = !shuffleRef.current;
    shuffleRef.current = on;
    setShuffle(on);
    const { queue, index } = stRef.current;
    if (!queue.length) return;
    const cur = queue[index];
    if (on) {
      origOrder.current = queue.map((t) => t.qid);
      const rest = shuffled(queue.filter((t) => t !== cur));
      commit({ ...stRef.current, queue: cur ? [cur, ...rest] : rest, index: cur ? 0 : -1 });
    } else {
      const pos = new Map(origOrder.current.map((q, i) => [q, i]));
      const nq = queue.slice().sort((a, b) => (pos.get(a.qid) ?? 1e9) - (pos.get(b.qid) ?? 1e9));
      commit({ ...stRef.current, queue: nq, index: Math.max(nq.indexOf(cur), 0) });
    }
  }, []);

  const cycleRepeat = useCallback(() => {
    const n = { off: 'all', all: 'one', one: 'off' }[repeatRef.current];
    repeatRef.current = n;
    setRepeat(n);
  }, []);

  /** Quick command: shuffle every song in the library. */
  const shuffleAll = useCallback((all, label = 'Shuffle all') => {
    const tracks = all.filter((t) => !t.missing);
    if (!tracks.length) { libRef.current.toast('Add some songs first.'); return; }
    if (!shuffleRef.current) { shuffleRef.current = true; setShuffle(true); }
    playQueue(tracks, Math.floor(Math.random() * tracks.length), label);
  }, [playQueue]);

  const setRate = useCallback((r) => {
    const v = Math.round(clamp(r, 0.5, 2) * 100) / 100;
    setRateState(v); rateRef.current = v;
    els.forEach((e) => { e.defaultPlaybackRate = v; e.playbackRate = v; });
    try { localStorage.setItem('rune.rate', String(v)); } catch { /* storage blocked */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setXfade = useCallback((s) => { const v = clamp(Math.round(s), 0, 12); setXfadeState(v); try { localStorage.setItem('rune.xfade', String(v)); } catch { /* ignore */ } }, []);
  const setGapless = useCallback((on) => { setGaplessState(on); try { localStorage.setItem('rune.gapless', on ? '1' : '0'); } catch { /* ignore */ } }, []);

  // ---- listening stats: one tick per second of actual playback ----
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => libRef.current.recordListen(currentIdRef.current, durRef.current), 1000);
    return () => clearInterval(t);
  }, [playing]);

  // ---- OS media controls: media keys, Windows volume flyout, lock screen, headset buttons ----
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (current) {
      ms.metadata = new MediaMetadata({
        title: current.title, artist: current.artist, album: current.album,
        artwork: current.cover ? [{ src: current.cover, sizes: '512x512', type: /svg/.test(current.cover) ? 'image/svg+xml' : 'image/jpeg' }] : [],
      });
    } else ms.metadata = null;
    const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* action not supported here */ } };
    set('play', () => { engine.ensure(); active().play().catch(() => {}); });
    set('pause', () => pauseAll());
    set('stop', () => { pauseAll(); active().currentTime = 0; });
    set('previoustrack', prev);
    set('nexttrack', next);
    set('seekto', (d) => d.seekTime != null && seek(d.seekTime));
    set('seekbackward', (d) => seek(Math.max(0, active().currentTime - (d.seekOffset || 10))));
    set('seekforward', (d) => seek(Math.min(active().duration || 0, active().currentTime + (d.seekOffset || 10))));
  }, [current, prev, next, seek, engine, pauseAll]); // eslint-disable-line react-hooks/exhaustive-deps
  // The OS needs to know whether we are playing, or its play/pause buttons show the wrong state (or none at all).
  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = current ? (playing ? 'playing' : 'paused') : 'none';
  }, [playing, current]);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !(duration > 0)) return;
    try { navigator.mediaSession.setPositionState({ duration, position: Math.min(time, duration), playbackRate: rate }); } catch { /* unsupported */ }
  }, [Math.floor(time), duration, rate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Windows app: taskbar thumbnail buttons (previous / play-pause / next) talk to us through the preload bridge ----
  useEffect(() => {
    const d = window.runeDesktop;
    if (!d) return undefined;
    return d.onTransport((cmd) => { if (cmd === 'toggle') toggle(); else if (cmd === 'next') next(); else if (cmd === 'prev') prev(); });
  }, [toggle, next, prev]);
  useEffect(() => {
    window.runeDesktop?.sendState({ playing, hasTrack: !!current });
  }, [playing, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    engine, current, queue, index: st.index, label: st.label, playing, loading, time, duration, volume, muted, shuffle, repeat,
    media: els[0], registerSurface, toggle, pause: pauseAll, next, prev, seek, setVolume, toggleMute: () => setMuted((m) => !m), toggleShuffle, cycleRepeat,
    playQueue, playIndex, addToQueue, playNext, removeFromQueue, moveInQueue, clearQueue, shuffleAll,
    rate, setRate, xfade, setXfade, gapless, setGapless, sleep, setSleep,
  }), [engine, current, queue, st, playing, loading, time, duration, volume, muted, shuffle, repeat, rate, xfade, gapless, sleep]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
