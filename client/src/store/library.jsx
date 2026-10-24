// Library store: songs, videos, covers, playlists, profile and listening stats — all kept on this device (IndexedDB).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { idb } from '../idb.js';
import { readTags } from '../tags.js';
import { UNKNOWN, albumKeyOf, artistKeyOf, groupTracks, resizeImage } from '../util.js';

const Ctx = createContext(null);
export const useLibrary = () => useContext(Ctx);

const AUDIO_RE = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav|weba|wma)$/i;
const VIDEO_RE = /\.(mp4|m4v|webm|mov|mkv|ogv|avi)$/i;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const stripExt = (n) => n.replace(/\.[^.]+$/, '');

function parseName(name) {
  const base = stripExt(name).replace(/_/g, ' ');
  const m = /^(?:\d{1,3}[\s.-]+)?(.+?)\s+-\s+(.+)$/.exec(base);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base.replace(/^\d{1,3}[\s.-]+/, '').trim() };
}

function probeMedia(file, tag) {
  return new Promise((resolve) => {
    const el = document.createElement(tag);
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (duration, poster) => { if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(url); resolve({ duration: Number.isFinite(duration) ? Math.round(duration) : 0, poster }); };
    const timer = setTimeout(() => finish(0, null), 6000);
    el.preload = 'metadata';
    el.muted = true;
    el.onerror = () => finish(0, null);
    el.onloadedmetadata = () => {
      if (tag === 'audio') return finish(el.duration, null);
      el.currentTime = Math.min(1, (el.duration || 2) / 2); // grab a frame for the thumbnail
    };
    el.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        const s = Math.min(1, 480 / (el.videoWidth || 480));
        c.width = Math.round((el.videoWidth || 480) * s); c.height = Math.round((el.videoHeight || 270) * s);
        c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
        c.toBlob((b) => finish(el.duration, b), 'image/jpeg', 0.8);
      } catch { finish(el.duration, null); }
    };
    el.src = url;
  });
}

export function LibraryProvider({ children }) {
  const [records, setRecords] = useState([]);          // every stored file (kind: 'local' | 'video')
  const [rawPlaylists, setRawPlaylists] = useState([]);
  const [coverBlobs, setCoverBlobs] = useState({});
  const [profile, setProfileState] = useState({ name: '', username: '', avatar: null });
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [statsTick, setStatsTick] = useState(0);
  const [ready, setReady] = useState(false);

  const recMap = useRef(new Map());
  const plRef = useRef([]);
  const coversRef = useRef({});
  const urls = useRef(new Map());                      // Blob → object URL (kept stable between renders)
  const statsRef = useRef({});
  const session = useRef({ id: null, secs: 0, counted: false });
  const dirty = useRef(false);

  const toast = useCallback((text, tone = 'info') => setNotice({ text, tone, key: Date.now() }), []);
  const urlOf = useCallback((blob) => {
    if (!blob) return null;
    if (!urls.current.has(blob)) urls.current.set(blob, URL.createObjectURL(blob));
    return urls.current.get(blob);
  }, []);
  const release = useCallback((blob) => {
    if (blob && urls.current.has(blob)) { URL.revokeObjectURL(urls.current.get(blob)); urls.current.delete(blob); }
  }, []);

  // ---- load everything from IndexedDB ----
  useEffect(() => {
    (async () => {
      try {
        const all = [];
        for (const r of await idb.all('files')) {
          if (r.kind === 'cached') { idb.del('files', r.id); continue; }          // v1 "saved for offline" demo songs no longer exist
          if (r.kind === 'local' && r.album === 'Local files') { r.album = ''; idb.put('files', r); } // v1 placeholder album name
          all.push(r);
        }
        recMap.current = new Map(all.filter((r) => r.kind === 'local' || r.kind === 'video').map((r) => [r.id, r]));
        setRecords(Array.from(recMap.current.values()));
        const pl = ((await idb.get('kv', 'playlists')) || []).map((p) => ({
          id: p.id, name: p.name, updatedAt: p.updatedAt || 0,
          trackIds: p.trackIds || (p.tracks || []).map((t) => t.id).filter((id) => recMap.current.has(id)),
        }));
        plRef.current = pl; setRawPlaylists(pl);
        coversRef.current = (await idb.get('kv', 'covers')) || {}; setCoverBlobs(coversRef.current);
        const prof = await idb.get('kv', 'profile');
        if (prof) setProfileState({ name: prof.name || '', username: prof.username || '', avatar: prof.avatar || null });
        statsRef.current = (await idb.get('kv', 'stats')) || {};
        setStatsTick((n) => n + 1);
      } catch {
        toast('Storage is unavailable in this browser mode (private window?). Nothing will be saved.', 'error');
      } finally { setReady(true); }
    })();
  }, [toast]);

  // ---- derived songs, covers, groups, playlists ----
  const tracks = useMemo(() => records.filter((r) => r.kind === 'local').map((r) => {
    const t = { id: r.id, kind: 'local', title: r.title, artist: r.artist || UNKNOWN, album: r.album || '', trackNo: r.trackNo || 0, duration: r.duration || 0, addedAt: r.addedAt };
    t.artistKey = artistKeyOf(t); t.albumKey = albumKeyOf(t);
    t.art = urlOf(r.art);
    const song = coverBlobs[`song:${t.id}`], album = t.albumKey && coverBlobs[`album:${t.albumKey}`];
    t.cover = urlOf(song) || urlOf(album) || t.art || null;
    return t;
  }).sort((a, b) => a.addedAt - b.addedAt), [records, coverBlobs, urlOf]);

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const groups = useMemo(() => {
    const g = groupTracks(tracks);
    for (const al of g.albums) al.cover = urlOf(coverBlobs[`album:${al.key}`]) || al.tracks.find((t) => t.art)?.art || al.tracks.find((t) => t.cover)?.cover || null;
    for (const a of g.artists) a.cover = urlOf(coverBlobs[`artist:${a.key}`]) || a.albums.find((al) => al.cover)?.cover || a.tracks.find((t) => t.cover)?.cover || null;
    return g;
  }, [tracks, coverBlobs, urlOf]);

  const playlists = useMemo(() => rawPlaylists.map((p) => {
    const list = p.trackIds.map((id) => byId.get(id)).filter(Boolean);
    return { ...p, tracks: list, cover: urlOf(coverBlobs[`playlist:${p.id}`]) || list.find((t) => t.cover)?.cover || null };
  }), [rawPlaylists, byId, coverBlobs, urlOf]);

  const videos = useMemo(() => records.filter((r) => r.kind === 'video').map((r) => ({
    id: r.id, title: r.title, duration: r.duration || 0, size: r.size || 0, addedAt: r.addedAt, poster: urlOf(r.poster),
  })).sort((a, b) => b.addedAt - a.addedAt), [records, urlOf]);

  const avatarUrl = useMemo(() => urlOf(profile.avatar), [profile.avatar, urlOf]);

  // ---- adding / removing files ----
  const putRecord = useCallback(async (rec) => {
    await idb.put('files', rec);
    recMap.current.set(rec.id, rec);
    setRecords(Array.from(recMap.current.values()));
  }, []);

  const addFiles = useCallback(async (list) => {
    const audio = Array.from(list).filter((f) => f.type.startsWith('audio/') || AUDIO_RE.test(f.name));
    if (!audio.length) { toast('No audio files found in that selection.', 'error'); return; }
    let added = 0, skipped = 0;
    for (const f of audio) {
      if (Array.from(recMap.current.values()).some((r) => r.kind === 'local' && r.fileName === f.name && r.size === f.size)) { skipped++; continue; }
      try {
        const tags = await readTags(f);
        const guess = parseName(f.name);
        const { duration } = await probeMedia(f, 'audio');
        await putRecord({
          id: `l:${uid()}`, kind: 'local', title: tags.title || guess.title || stripExt(f.name),
          artist: tags.artist || guess.artist || UNKNOWN, album: tags.album || '', trackNo: tags.trackNo || 0,
          duration, art: tags.art, fileName: f.name, size: f.size, addedAt: Date.now() + added, blob: f,
        });
        added++;
      } catch { toast(`Could not save “${f.name}”. Storage may be full.`, 'error'); }
    }
    if (added || skipped) toast(`${added ? `Added ${added} ${added === 1 ? 'song' : 'songs'}.` : ''}${skipped ? ` ${skipped} already in your library.` : ''}`.trim());
  }, [putRecord, toast]);

  const addVideos = useCallback(async (list) => {
    const vids = Array.from(list).filter((f) => f.type.startsWith('video/') || VIDEO_RE.test(f.name));
    if (!vids.length) { toast('No video files found in that selection.', 'error'); return; }
    let added = 0;
    for (const f of vids) {
      try {
        const { duration, poster } = await probeMedia(f, 'video');
        await putRecord({ id: `v:${uid()}`, kind: 'video', title: stripExt(f.name).replace(/_/g, ' '), duration, poster, fileName: f.name, size: f.size, addedAt: Date.now() + added, blob: f });
        added++;
      } catch { toast(`Could not save “${f.name}”. Storage may be full.`, 'error'); }
    }
    if (added) toast(`Added ${added} ${added === 1 ? 'video' : 'videos'}.`);
  }, [putRecord, toast]);

  const persistCovers = (next) => {
    coversRef.current = next; setCoverBlobs(next);
    idb.put('kv', next, 'covers').catch(() => toast('Could not save covers on this device.', 'error'));
  };
  const persistPlaylists = useCallback((next) => {
    plRef.current = next; setRawPlaylists(next);
    idb.put('kv', next, 'playlists').catch(() => toast('Could not save playlists on this device.', 'error'));
  }, [toast]);

  const removeRecord = useCallback(async (id) => {
    const rec = recMap.current.get(id);
    await idb.del('files', id);
    recMap.current.delete(id);
    if (rec) { release(rec.art); release(rec.poster); }
    setRecords(Array.from(recMap.current.values()));
    if (coversRef.current[`song:${id}`]) { const c = { ...coversRef.current }; release(c[`song:${id}`]); delete c[`song:${id}`]; persistCovers(c); }
    if (plRef.current.some((p) => p.trackIds.includes(id))) persistPlaylists(plRef.current.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => x !== id) })));
  }, [release, persistPlaylists]); // eslint-disable-line react-hooks/exhaustive-deps

  const renameVideo = useCallback(async (id, title) => {
    const r = recMap.current.get(id);
    if (r && title.trim()) await putRecord({ ...r, title: title.trim() });
  }, [putRecord]);

  // ---- editing song info (also used for whole artists / albums) ----
  const updateTracks = useCallback(async (ids, patch) => {
    const clean = {};
    for (const k of ['title', 'artist', 'album', 'trackNo']) if (patch[k] !== undefined) clean[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
    if (clean.artist === '') clean.artist = UNKNOWN;
    if (clean.title === '') delete clean.title;
    const before = ids.map((id) => recMap.current.get(id)).filter(Boolean);
    const moves = [];
    for (const b of before) {
      const a = { ...b, ...clean };
      await idb.put('files', a);
      recMap.current.set(a.id, a);
      const bt = { artist: b.artist, album: b.album }, at = { artist: a.artist, album: a.album };
      if (albumKeyOf(bt) !== albumKeyOf(at)) moves.push(['album', albumKeyOf(bt), albumKeyOf(at)]);
      if (artistKeyOf(bt) !== artistKeyOf(at)) moves.push(['artist', artistKeyOf(bt), artistKeyOf(at)]);
    }
    setRecords(Array.from(recMap.current.values()));
    // carry custom artist/album covers over to the new name when nothing else uses the old one
    const still = Array.from(recMap.current.values()).filter((r) => r.kind === 'local');
    const next = { ...coversRef.current };
    let changed = false;
    for (const [kind, from, to] of moves) {
      if (!from || !next[`${kind}:${from}`]) continue;
      const used = still.some((r) => (kind === 'album' ? albumKeyOf(r) : artistKeyOf(r)) === from);
      if (to && !next[`${kind}:${to}`]) next[`${kind}:${to}`] = next[`${kind}:${from}`];
      if (!used) delete next[`${kind}:${from}`];
      changed = true;
    }
    if (changed) persistCovers(next);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- covers ----
  const setCover = useCallback(async (kind, id, file) => {
    try {
      const blob = await resizeImage(file);
      const next = { ...coversRef.current }; release(next[`${kind}:${id}`]); next[`${kind}:${id}`] = blob;
      persistCovers(next);
    } catch { toast('That file doesn’t look like an image.', 'error'); }
  }, [release, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearCover = useCallback((kind, id) => {
    const next = { ...coversRef.current }; release(next[`${kind}:${id}`]); delete next[`${kind}:${id}`]; persistCovers(next);
  }, [release]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasCover = useCallback((kind, id) => !!coverBlobs[`${kind}:${id}`], [coverBlobs]);

  // ---- playlists ----
  const createPlaylist = useCallback((name, trackIds = []) => {
    const p = { id: uid(), name: name.trim() || 'New playlist', trackIds, updatedAt: Date.now() };
    persistPlaylists([...plRef.current, p]);
    return p;
  }, [persistPlaylists]);
  const patchPlaylist = (id, fn) => persistPlaylists(plRef.current.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)));
  const renamePlaylist = (id, name) => patchPlaylist(id, (p) => ({ ...p, name: name.trim() || p.name }));
  const deletePlaylist = (id) => { clearCover('playlist', id); persistPlaylists(plRef.current.filter((p) => p.id !== id)); };
  const addToPlaylist = (id, trackId) => patchPlaylist(id, (p) => (p.trackIds.includes(trackId) ? p : { ...p, trackIds: [...p.trackIds, trackId] }));
  const removeFromPlaylist = (id, index) => patchPlaylist(id, (p) => ({ ...p, trackIds: p.trackIds.filter((_, i) => i !== index) }));

  // ---- profile ----
  const saveProfile = useCallback(async ({ name, username, avatarFile, removeAvatar }) => {
    let avatar = profile.avatar;
    try {
      if (avatarFile) { release(avatar); avatar = await resizeImage(avatarFile, 512); }
      else if (removeAvatar) { release(avatar); avatar = null; }
    } catch { toast('That file doesn’t look like an image.', 'error'); }
    const next = { name: name.trim(), username: username.trim().replace(/^@/, ''), avatar };
    setProfileState(next);
    idb.put('kv', next, 'profile').catch(() => toast('Could not save your profile.', 'error'));
  }, [profile.avatar, release, toast]);

  // ---- listening stats ----
  const beginListen = useCallback((id) => { session.current = { id, secs: 0, counted: false }; }, []);
  const recordListen = useCallback((id, duration) => {
    if (!id) return;
    if (session.current.id !== id) session.current = { id, secs: 0, counted: false };
    const s = session.current, st = (statsRef.current[id] ||= { seconds: 0, plays: 0 });
    st.seconds += 1; s.secs += 1;
    if (!s.counted && s.secs >= Math.min(30, Math.max(5, (duration || 50) * 0.6))) { st.plays += 1; s.counted = true; }
    dirty.current = true;
  }, []);
  const flushStats = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    idb.put('kv', statsRef.current, 'stats').catch(() => {});
    setStatsTick((n) => n + 1);
  }, []);
  useEffect(() => {
    const t = setInterval(flushStats, 5000);
    const hide = () => document.visibilityState === 'hidden' && flushStats();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', flushStats);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', flushStats); };
  }, [flushStats]);
  const resetStats = useCallback(() => { statsRef.current = {}; dirty.current = false; idb.put('kv', {}, 'stats'); setStatsTick((n) => n + 1); }, []);
  const stats = useMemo(() => ({ ...statsRef.current }), [statsTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- playback source ----
  const resolveSrc = useCallback(async (track) => {
    const rec = recMap.current.get(track.id) || (await idb.get('files', track.id));
    if (!rec?.blob) throw new Error('missing');
    const url = URL.createObjectURL(rec.blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }, []);
  const videoBlob = useCallback((id) => recMap.current.get(id)?.blob || null, []);

  const value = useMemo(() => ({
    ready, tracks, byId, videos, playlists, artists: groups.artists, albums: groups.albums, artistByKey: groups.artistByKey, albumByKey: groups.albumByKey,
    profile, avatarUrl, stats, notice, setNotice, toast, editing,
    openEdit: (ids, init = {}) => setEditing({ ids, init }), closeEdit: () => setEditing(null),
    addFiles, addVideos, removeFile: removeRecord, removeVideo: removeRecord, renameVideo, updateTracks, resolveSrc, videoBlob,
    setCover, clearCover, hasCover,
    createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
    saveProfile, beginListen, recordListen, resetStats,
  }), [ready, tracks, byId, videos, playlists, groups, profile, avatarUrl, stats, notice, editing, coverBlobs]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
