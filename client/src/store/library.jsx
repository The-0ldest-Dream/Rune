// Library store: songs, videos, covers, playlists, profile and listening stats — all kept on this device (IndexedDB).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { idb } from '../idb.js';
import { readTags } from '../tags.js';
import { UNKNOWN, albumKeyOf, artistKeyOf, findMatch, fpOf, groupTracks, resizeImage, sigKeyOf } from '../util.js';
import { buildExport, parseExport, planImport } from './backup.js';

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
          let dirtyRec = false;
          if (r.kind === 'local' && r.album === 'Local files') { r.album = ''; dirtyRec = true; } // v1 placeholder album name
          if ((r.kind === 'local' || r.kind === 'ghost') && !r.fp) { r.fp = fpOf(r.fileName || r.title, r.size); r.sigKey = r.sigKey || sigKeyOf(r.title, r.artist); dirtyRec = true; }
          if (dirtyRec) idb.put('files', r);
          all.push(r);
        }
        recMap.current = new Map(all.filter((r) => ['local', 'ghost', 'video'].includes(r.kind)).map((r) => [r.id, r]));
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
  // A stored cover entry is a Blob (custom cover) or 'none' (the user removed the cover).
  const customUrl = useCallback((key) => { const v = coverBlobs[key]; return v && v !== 'none' ? urlOf(v) : null; }, [coverBlobs, urlOf]);

  const tracks = useMemo(() => records.filter((r) => r.kind === 'local' || r.kind === 'ghost').map((r) => {
    const t = { id: r.id, kind: r.kind, missing: r.kind === 'ghost', title: r.title, artist: r.artist || UNKNOWN, album: r.album || '', trackNo: r.trackNo || 0, duration: r.duration || 0, addedAt: r.addedAt };
    t.artistKey = artistKeyOf(t); t.albumKey = albumKeyOf(t);
    t.art = urlOf(r.art);
    t.cover = coverBlobs[`song:${t.id}`] === 'none' ? null : customUrl(`song:${t.id}`) || (t.albumKey && customUrl(`album:${t.albumKey}`)) || t.art || null;
    return t;
  }).sort((a, b) => a.addedAt - b.addedAt), [records, coverBlobs, urlOf, customUrl]);

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const groups = useMemo(() => {
    const g = groupTracks(tracks);
    for (const al of g.albums) {
      al.cover = coverBlobs[`album:${al.key}`] === 'none' ? null
        : customUrl(`album:${al.key}`) || al.tracks.find((t) => t.art)?.art || al.tracks.find((t) => t.cover)?.cover || null;
    }
    for (const a of g.artists) {
      a.cover = coverBlobs[`artist:${a.key}`] === 'none' ? null
        : customUrl(`artist:${a.key}`) || a.albums.find((al) => al.cover)?.cover || a.tracks.find((t) => t.cover)?.cover || null;
    }
    return g;
  }, [tracks, coverBlobs, customUrl]);

  const playlists = useMemo(() => rawPlaylists.map((p) => {
    const list = p.trackIds.map((id) => byId.get(id)).filter(Boolean);
    return { ...p, tracks: list, cover: coverBlobs[`playlist:${p.id}`] === 'none' ? null : customUrl(`playlist:${p.id}`) || list.find((t) => t.cover)?.cover || null };
  }), [rawPlaylists, byId, coverBlobs, customUrl]);

  const videos = useMemo(() => records.filter((r) => r.kind === 'video').map((r) => ({
    id: r.id, title: r.title, duration: r.duration || 0, size: r.size || 0, addedAt: r.addedAt, poster: urlOf(r.poster),
  })).sort((a, b) => b.addedAt - a.addedAt), [records, urlOf]);

  // Videos as playable items (same shape the player uses for songs).
  const videoTracks = useMemo(() => videos.map((v) => ({
    id: v.id, kind: 'video', missing: false, title: v.title, artist: 'Music video', album: '', albumKey: '', artistKey: '', trackNo: 0,
    duration: v.duration, cover: v.poster, art: null, addedAt: v.addedAt,
  })), [videos]);
  const videoById = useMemo(() => new Map(videoTracks.map((v) => [v.id, v])), [videoTracks]);

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
    let added = 0, skipped = 0, claimed = 0;
    for (const f of audio) {
      const fp = fpOf(f.name, f.size);
      if (Array.from(recMap.current.values()).some((r) => r.kind === 'local' && r.fp === fp)) { skipped++; continue; }
      try {
        const tags = await readTags(f);
        const guess = parseName(f.name);
        const { duration } = await probeMedia(f, 'audio');
        const title = tags.title || guess.title || stripExt(f.name);
        const artist = tags.artist || guess.artist || UNKNOWN;
        const sigKey = sigKeyOf(title, artist);
        // A faded placeholder from an imported backup? Fill it in so its info, cover, playlists and stats carry over.
        const ghost = findMatch(Array.from(recMap.current.values()).filter((r) => r.kind === 'ghost'), { fp, sigKey, duration });
        if (ghost) {
          await putRecord({ ...ghost, kind: 'local', blob: f, fileName: f.name, size: f.size, fp, duration: duration || ghost.duration, art: tags.art || ghost.art });
          claimed++; added++;
          continue;
        }
        await putRecord({
          id: `l:${uid()}`, kind: 'local', title, artist, album: tags.album || '', trackNo: tags.trackNo || 0,
          duration, art: tags.art, fileName: f.name, size: f.size, fp, sigKey, addedAt: Date.now() + added, blob: f,
        });
        added++;
      } catch { toast(`Could not save “${f.name}”. Storage may be full.`, 'error'); }
    }
    if (added || skipped) toast(`${added ? `Added ${added} ${added === 1 ? 'song' : 'songs'}${claimed ? ` (${claimed} restored from your backup)` : ''}.` : ''}${skipped ? ` ${skipped} already in your library.` : ''}`.trim());
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
    if (coversRef.current[`song:${id}`]) dropCover('song', id);
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

  // ---- covers (song / album / artist / playlist) ----
  const setCoverBlob = useCallback((kind, id, blob) => {
    const next = { ...coversRef.current };
    if (next[`${kind}:${id}`] && next[`${kind}:${id}`] !== 'none') release(next[`${kind}:${id}`]);
    next[`${kind}:${id}`] = blob;
    persistCovers(next);
  }, [release]); // eslint-disable-line react-hooks/exhaustive-deps
  /** "Remove cover": hides whatever cover is shown (stored as 'none' so embedded art doesn't come back). */
  const removeCover = useCallback((kind, id) => {
    const next = { ...coversRef.current };
    if (next[`${kind}:${id}`] && next[`${kind}:${id}`] !== 'none') release(next[`${kind}:${id}`]);
    next[`${kind}:${id}`] = 'none';
    persistCovers(next);
  }, [release]); // eslint-disable-line react-hooks/exhaustive-deps
  const dropCover = useCallback((kind, id) => {
    const next = { ...coversRef.current };
    if (next[`${kind}:${id}`] && next[`${kind}:${id}`] !== 'none') release(next[`${kind}:${id}`]);
    delete next[`${kind}:${id}`];
    persistCovers(next);
  }, [release]); // eslint-disable-line react-hooks/exhaustive-deps
  const artBlob = useCallback((id) => recMap.current.get(id)?.art || null, []);

  // ---- playlists ----
  const createPlaylist = useCallback((name, trackIds = []) => {
    const p = { id: uid(), name: name.trim() || 'New playlist', trackIds, updatedAt: Date.now() };
    persistPlaylists([...plRef.current, p]);
    return p;
  }, [persistPlaylists]);
  const patchPlaylist = (id, fn) => persistPlaylists(plRef.current.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)));
  const renamePlaylist = (id, name) => patchPlaylist(id, (p) => ({ ...p, name: name.trim() || p.name }));
  const deletePlaylist = (id) => { dropCover('playlist', id); persistPlaylists(plRef.current.filter((p) => p.id !== id)); };
  const addToPlaylist = (id, trackId) => patchPlaylist(id, (p) => (p.trackIds.includes(trackId) ? p : { ...p, trackIds: [...p.trackIds, trackId] }));
  const removeTrackFromPlaylist = (id, trackId) => patchPlaylist(id, (p) => ({ ...p, trackIds: p.trackIds.filter((x) => x !== trackId) }));
  const removeFromPlaylist = (id, index) => patchPlaylist(id, (p) => ({ ...p, trackIds: p.trackIds.filter((_, i) => i !== index) }));

  // ---- profile ----
  const persistProfile = useCallback((next) => {
    setProfileState(next);
    idb.put('kv', next, 'profile').catch(() => toast('Could not save your profile.', 'error'));
  }, [toast]);
  const saveProfile = useCallback(({ name, username }) => {
    persistProfile({ ...profile, name: name.trim(), username: username.trim().replace(/^@/, '') });
  }, [profile, persistProfile]);
  const setAvatar = useCallback((blob) => {
    release(profile.avatar);
    persistProfile({ ...profile, avatar: blob || null });
  }, [profile, release, persistProfile]);

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

  // ---- backup: export / import everything except the audio files ----
  const exportData = useCallback(async () => {
    const file = await buildExport({
      records: Array.from(recMap.current.values()), covers: coversRef.current, profile, playlists: plRef.current, stats: statsRef.current,
    });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = `rune-backup-${new Date().toISOString().slice(0, 10)}.rune`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [profile]);

  const importData = useCallback(async (file) => {
    const data = await parseExport(file);
    const plan = await planImport(data, Array.from(recMap.current.values()), { uid });
    for (const r of [...plan.updated, ...plan.created]) { await idb.put('files', r); recMap.current.set(r.id, r); }
    setRecords(Array.from(recMap.current.values()));
    // covers
    const covers = { ...coversRef.current };
    for (const [k, v] of Object.entries(plan.covers)) { if (covers[k] && covers[k] !== 'none') release(covers[k]); covers[k] = v; }
    persistCovers(covers);
    // playlists: same id → keep the newer one
    const merged = new Map(plRef.current.map((p) => [p.id, p]));
    for (const p of plan.playlists) { const cur = merged.get(p.id); if (!cur || (p.updatedAt || 0) >= (cur.updatedAt || 0)) merged.set(p.id, p); }
    persistPlaylists(Array.from(merged.values()));
    // stats: never lose listening time — keep the larger value
    for (const [id, s] of Object.entries(plan.stats)) {
      const cur = (statsRef.current[id] ||= { seconds: 0, plays: 0 });
      cur.seconds = Math.max(cur.seconds, s.seconds || 0); cur.plays = Math.max(cur.plays, s.plays || 0);
    }
    dirty.current = true; flushStats();
    // profile
    const pr = plan.profile;
    if (pr.avatar) release(profile.avatar);
    persistProfile({ name: pr.name || profile.name, username: pr.username || profile.username, avatar: pr.avatar || profile.avatar });
    return plan.summary;
  }, [profile, release, persistPlaylists, persistProfile, flushStats]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- playback source ----
  const resolveSrc = useCallback(async (track) => {
    const rec = recMap.current.get(track.id) || (await idb.get('files', track.id));
    if (!rec?.blob) throw new Error('missing');
    const url = URL.createObjectURL(rec.blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }, []);
  const videoBlob = useCallback((id) => recMap.current.get(id)?.blob || null, []);

  const value = useMemo(() => ({
    ready, tracks, byId, videos, videoTracks, videoById, playlists, artists: groups.artists, albums: groups.albums, artistByKey: groups.artistByKey, albumByKey: groups.albumByKey,
    profile, avatarUrl, stats, notice, setNotice, toast, editing,
    openEdit: (ids, init = {}) => setEditing({ ids, init }), closeEdit: () => setEditing(null),
    addFiles, addVideos, removeFile: removeRecord, removeVideo: removeRecord, renameVideo, updateTracks, resolveSrc, videoBlob,
    setCoverBlob, removeCover, artBlob, setAvatar, exportData, importData,
    createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, removeTrackFromPlaylist,
    saveProfile, beginListen, recordListen, resetStats,
  }), [ready, tracks, byId, videos, playlists, groups, profile, avatarUrl, stats, notice, editing, coverBlobs]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
