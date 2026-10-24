// Library store: local files, offline copies, playlists and connectivity — everything that works without the server.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken, STATIC } from '../api.js';
import { idb } from '../idb.js';

const Ctx = createContext(null);
export const useLibrary = () => useContext(Ctx);

const AUDIO_RE = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav|weba)$/i;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** The part of a track we persist in playlists (no blobs). */
export const slim = (t) => ({
  id: t.id, title: t.title, artist: t.artist, artistId: t.artistId, album: t.album, albumId: t.albumId,
  duration: t.duration, genre: t.genre, cover: t.cover, src: t.src, kind: t.kind,
});

function parseName(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const m = /^(?:\d{1,3}[\s.-]+)?(.+?)\s+-\s+(.+)$/.exec(base);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: 'Unknown artist', title: base.replace(/^\d{1,3}[\s.-]+/, '').trim() };
}

function probeDuration(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? Math.round(d) : 0); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    a.src = url;
  });
}

export function LibraryProvider({ children }) {
  const [files, setFiles] = useState([]);            // IndexedDB records incl. blobs (kind: 'local' | 'cached')
  const [playlists, setPlaylists] = useState([]);
  const [online, setOnline] = useState(STATIC ? true : navigator.onLine);
  const [features, setFeatures] = useState({});
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState({});              // trackId -> true while saving offline
  const [notice, setNotice] = useState(null);
  const filesRef = useRef(new Map());
  const plRef = useRef([]);

  const toast = useCallback((text, tone = 'info') => {
    setNotice({ text, tone, key: Date.now() });
  }, []);

  // ---- bootstrap from IndexedDB ----
  useEffect(() => {
    (async () => {
      try {
        const all = await idb.all('files');
        filesRef.current = new Map(all.map((f) => [f.id, f]));
        setFiles(all);
        const pl = (await idb.get('kv', 'playlists')) || [];
        plRef.current = pl;
        setPlaylists(pl);
      } catch {
        toast('Offline storage is unavailable in this browser mode.', 'error');
      }
    })();
  }, [toast]);

  // ---- connectivity: browser flag + server heartbeat ----
  useEffect(() => {
    if (STATIC) return undefined; // static build: the catalogue is local, so the app is always "online"
    let alive = true;
    const ping = async () => {
      if (!navigator.onLine) { alive && setOnline(false); return; }
      try {
        const h = await api.get('/health');
        if (alive) { setOnline(true); setFeatures(h.features || {}); }
      } catch { alive && setOnline(false); }
    };
    ping();
    const timer = setInterval(ping, 30000);
    window.addEventListener('online', ping);
    window.addEventListener('offline', ping);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('online', ping); window.removeEventListener('offline', ping); };
  }, []);

  // ---- restore session ----
  useEffect(() => {
    if (STATIC || !getToken()) return;
    api.get('/auth/me').then((r) => setUser(r.user)).catch((e) => { if (e.status === 401) setToken(null); });
  }, []);

  // ---- local files & offline copies ----
  const putFile = useCallback(async (rec) => {
    await idb.put('files', rec);
    filesRef.current.set(rec.id, rec);
    setFiles(Array.from(filesRef.current.values()));
  }, []);

  const addFiles = useCallback(async (list) => {
    const audio = Array.from(list).filter((f) => f.type.startsWith('audio/') || AUDIO_RE.test(f.name));
    if (!audio.length) { toast('No audio files found in that selection.', 'error'); return; }
    let added = 0;
    for (const f of audio) {
      try {
        const { artist, title } = parseName(f.name);
        const duration = await probeDuration(f);
        await putFile({
          id: `l:${uid()}`, kind: 'local', title, artist, album: 'Local files', duration,
          cover: null, fileName: f.name, size: f.size, addedAt: Date.now(), blob: f,
        });
        added++;
      } catch { toast(`Could not save “${f.name}”. Storage may be full.`, 'error'); }
    }
    if (added) toast(`Added ${added} ${added === 1 ? 'file' : 'files'} to your device library.`);
  }, [putFile, toast]);

  const removeFile = useCallback(async (id) => {
    await idb.del('files', id);
    filesRef.current.delete(id);
    setFiles(Array.from(filesRef.current.values()));
  }, []);

  const saveOffline = useCallback(async (track) => {
    if (filesRef.current.has(track.id)) return;
    setBusy((b) => ({ ...b, [track.id]: true }));
    try {
      let blob;
      if (track.src.startsWith('demo:')) blob = (await import('../static/demo.js')).demoBlob(track.src);
      else {
        const res = await fetch(track.src);
        if (!res.ok) throw new Error('download failed');
        blob = await res.blob();
      }
      await putFile({ ...slim(track), kind: 'cached', addedAt: Date.now(), size: blob.size, blob });
      toast(`Saved “${track.title}” for offline listening.`);
    } catch {
      toast('Could not save this track. Check your connection and try again.', 'error');
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[track.id]; return n; });
    }
  }, [putFile, toast]);

  /** Returns a playable URL for a track: stored blob if we have one, otherwise its streaming URL. */
  const resolveSrc = useCallback(async (track) => {
    let rec = filesRef.current.get(track.id);
    if (!rec && track.id.startsWith('l:')) rec = await idb.get('files', track.id);
    if (rec?.blob) { const url = URL.createObjectURL(rec.blob); return { url, revoke: () => URL.revokeObjectURL(url), offline: true }; }
    if (track.src.startsWith('demo:')) {
      const url = URL.createObjectURL((await import('../static/demo.js')).demoBlob(track.src));
      return { url, revoke: () => URL.revokeObjectURL(url), offline: true };
    }
    return { url: track.src, revoke: null, offline: false };
  }, []);

  const isStored = useCallback((id) => filesRef.current.has(id), [files]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- playlists ----
  const commitPlaylists = useCallback((next) => {
    plRef.current = next;
    setPlaylists(next);
    idb.put('kv', next, 'playlists').catch(() => toast('Could not save playlists on this device.', 'error'));
  }, [toast]);

  const createPlaylist = useCallback((name, tracks = []) => {
    const p = { id: uid(), name: name.trim() || 'New playlist', tracks: tracks.map(slim), updatedAt: Date.now() };
    commitPlaylists([...plRef.current, p]);
    return p;
  }, [commitPlaylists]);

  const updatePlaylist = useCallback((id, fn) => {
    commitPlaylists(plRef.current.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)));
  }, [commitPlaylists]);

  const renamePlaylist = (id, name) => updatePlaylist(id, (p) => ({ ...p, name: name.trim() || p.name }));
  const deletePlaylist = (id) => commitPlaylists(plRef.current.filter((p) => p.id !== id));
  const addToPlaylist = (id, track) =>
    updatePlaylist(id, (p) => (p.tracks.some((t) => t.id === track.id) ? p : { ...p, tracks: [...p.tracks, slim(track)] }));
  const removeFromPlaylist = (id, index) => updatePlaylist(id, (p) => ({ ...p, tracks: p.tracks.filter((_, i) => i !== index) }));

  // ---- account ----
  const signIn = useCallback(async (mode, form) => {
    const r = await api.post(`/auth/${mode}`, form);
    setToken(r.token);
    setUser(r.user);
    return r.user;
  }, []);
  const signOut = useCallback(() => { setToken(null); setUser(null); }, []);

  /** Merge local and server playlists (newest edit wins per playlist), then push the result back. */
  const syncPlaylists = useCallback(async () => {
    try {
      const remote = (await api.get('/me/playlists')).playlists;
      const map = new Map(plRef.current.map((p) => [p.id, p]));
      for (const r of remote) {
        const l = map.get(r.id);
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) map.set(r.id, r);
      }
      const merged = Array.from(map.values());
      commitPlaylists(merged);
      await api.put('/me/playlists', { playlists: merged });
      toast('Playlists synced to your account.');
    } catch (e) {
      toast(e.offline ? 'You are offline. Sync will work when you reconnect.' : e.message, 'error');
    }
  }, [commitPlaylists, toast]);

  const value = useMemo(() => ({
    files, playlists, online, features, user, busy, notice, toast, setNotice,
    localTracks: files.filter((f) => f.kind === 'local'),
    savedTracks: files.filter((f) => f.kind === 'cached'),
    addFiles, removeFile, saveOffline, resolveSrc, isStored,
    createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
    signIn, signOut, syncPlaylists,
  }), [files, playlists, online, features, user, busy, notice]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
