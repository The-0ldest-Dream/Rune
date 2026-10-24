// Player store: owns the single <audio> element, the queue and the equalizer engine.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../audio/engine.js';
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

export function PlayerProvider({ children }) {
  const lib = useLibrary();
  const libRef = useRef(lib);
  libRef.current = lib;

  const audioRef = useRef(null);
  if (!audioRef.current) { audioRef.current = new Audio(); audioRef.current.preload = 'auto'; }
  const audio = audioRef.current;
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new AudioEngine(audio);
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
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off'); // off | all | one
  const shuffleRef = useRef(false);
  const repeatRef = useRef('off');
  const origOrder = useRef([]);   // qids in original order, used to undo shuffle
  const loadId = useRef(0);
  const revokeRef = useRef(null);

  // Always show the latest title/artist/cover (songs can be edited while queued).
  const queue = useMemo(() => st.queue.map((q) => (lib.byId.get(q.id) ? { ...lib.byId.get(q.id), qid: q.qid } : q)), [st.queue, lib.byId]);
  const current = st.index >= 0 ? queue[st.index] || null : null;
  const currentIdRef = useRef(null);
  currentIdRef.current = current?.id || null;
  const durRef = useRef(0);
  durRef.current = duration || current?.duration || 0;

  // ---- load & play a queue index ----
  const playIndex = useCallback(async (i, autoplay = true) => {
    const { queue, label } = stRef.current;
    const track = queue[i];
    if (!track) return;
    engine.ensure(); // inside the user-gesture call stack
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
      audio.src = url;
      if (autoplay) await audio.play();
    } catch (e) {
      if (id !== loadId.current || e?.name === 'AbortError') return;
      libRef.current.toast('This song couldn’t be played. The file may be missing or in a format your browser can’t decode.', 'error');
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, [audio, engine]);

  const advance = useCallback((dir, auto = false) => {
    const { queue, index } = stRef.current;
    if (!queue.length) return;
    if (auto && repeatRef.current === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    let ni = index + dir;
    if (ni >= queue.length) {
      if (repeatRef.current === 'all') ni = 0;
      else { audio.pause(); audio.currentTime = 0; return; }
    }
    if (ni < 0) ni = repeatRef.current === 'all' ? queue.length - 1 : 0;
    playIndex(ni);
  }, [audio, playIndex]);

  // ---- audio element events ----
  useEffect(() => {
    const on = (ev, fn) => audio.addEventListener(ev, fn);
    const handlers = {
      timeupdate: () => setTime(audio.currentTime),
      loadedmetadata: () => Number.isFinite(audio.duration) && setDuration(audio.duration),
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      ended: () => { libRef.current.beginListen(null); advance(1, true); },
      waiting: () => setLoading(true),
      playing: () => setLoading(false),
      canplay: () => setLoading(false),
    };
    Object.entries(handlers).forEach(([e, f]) => on(e, f));
    return () => Object.entries(handlers).forEach(([e, f]) => audio.removeEventListener(e, f));
  }, [audio, advance]);

  useEffect(() => { audio.volume = volume; localStorage.setItem('rune.vol', String(volume)); }, [audio, volume]);
  useEffect(() => { audio.muted = muted; }, [audio, muted]);

  // ---- public controls ----
  const toggle = useCallback(() => {
    if (!stRef.current.queue.length) return;
    engine.ensure();
    if (audio.paused) {
      if (!audio.src) playIndex(Math.max(stRef.current.index, 0));
      else audio.play().catch(() => {});
    } else audio.pause();
  }, [audio, engine, playIndex]);

  const next = useCallback(() => advance(1), [advance]);
  const prev = useCallback(() => { if (audio.currentTime > 3) audio.currentTime = 0; else advance(-1); }, [audio, advance]);
  const seek = useCallback((t) => { audio.currentTime = t; setTime(t); }, [audio]);
  const setVolume = (v) => { setVolumeState(v); if (v > 0) setMuted(false); };

  const playQueue = useCallback((tracks, start = 0, label = '') => {
    if (!tracks.length) return;
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
    const item = withQid(track);
    origOrder.current.push(item.qid);
    const { queue, index } = stRef.current;
    commit({ ...stRef.current, queue: [...queue, item], index });
    if (index < 0) playIndex(0, false);
    libRef.current.toast(`Added “${track.title}” to the queue.`);
  }, [playIndex]);

  const playNext = useCallback((track) => {
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
    else if (!nq.length) { audio.pause(); audio.removeAttribute('src'); commit({ queue: [], index: -1, label: '' }); }
    else { commit({ ...stRef.current, queue: nq, index: Math.min(i, nq.length - 1) }); playIndex(Math.min(i, nq.length - 1), !audio.paused); }
  }, [audio, playIndex]);

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

  // ---- listening stats: one tick per second of actual playback ----
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => libRef.current.recordListen(currentIdRef.current, durRef.current), 1000);
    return () => clearInterval(t);
  }, [playing]);

  // ---- OS media controls (lock screen, headset keys) ----
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (current) {
      ms.metadata = new MediaMetadata({
        title: current.title, artist: current.artist, album: current.album,
        artwork: current.cover ? [{ src: current.cover, sizes: '512x512', type: /svg/.test(current.cover) ? 'image/svg+xml' : 'image/jpeg' }] : [],
      });
    }
    ms.setActionHandler('play', toggle);
    ms.setActionHandler('pause', toggle);
    ms.setActionHandler('previoustrack', prev);
    ms.setActionHandler('nexttrack', next);
    ms.setActionHandler('seekto', (d) => d.seekTime != null && seek(d.seekTime));
  }, [current, toggle, prev, next, seek]);

  const value = useMemo(() => ({
    engine, current, queue, index: st.index, label: st.label, playing, loading, time, duration, volume, muted, shuffle, repeat,
    toggle, pause: () => audio.pause(), next, prev, seek, setVolume, toggleMute: () => setMuted((m) => !m), toggleShuffle, cycleRepeat,
    playQueue, playIndex, addToQueue, playNext, removeFromQueue, moveInQueue, clearQueue,
  }), [engine, current, queue, st, playing, loading, time, duration, volume, muted, shuffle, repeat]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
