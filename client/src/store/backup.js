// Export / import of everything except the audio files themselves.
// Songs are matched across devices by file fingerprint (name + size) or, failing that, by title/artist/duration.
import { blobToDataURL, cheapKey, dataURLToBlob, findMatch, shrinkImage } from '../util.js';

const MAGIC = 'rune-backup';

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return new Blob([text], { type: 'application/json' });
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}
async function gunzip(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x1f && u8[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open compressed backups.');
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return new TextDecoder().decode(u8);
}

/**
 * @param {{records:any[], covers:Record<string,Blob|'none'>, profile:any, playlists:any[], stats:any}} src
 * @returns {Promise<Blob>} compressed backup file
 */
export async function buildExport({ records, covers, profile, playlists, stats, theme = null }, shrink = shrinkImage) {
  const images = [], seen = new Map();
  const addImage = async (blob, max) => {
    if (!blob || blob === 'none') return null;
    const key = `${max}:${await cheapKey(blob)}`;
    if (!seen.has(key)) { images.push(await blobToDataURL(await shrink(blob, max))); seen.set(key, images.length - 1); }
    return seen.get(key);
  };

  const idToFp = new Map(), songs = [];
  for (const r of records.filter((x) => x.kind === 'local' || x.kind === 'ghost')) {
    if (!r.fp || [...idToFp.values()].includes(r.fp)) continue;
    idToFp.set(r.id, r.fp);
    songs.push({
      fp: r.fp, sigKey: r.sigKey, title: r.title, artist: r.artist, album: r.album, trackNo: r.trackNo || 0,
      duration: r.duration || 0, fileName: r.fileName, size: r.size, art: await addImage(r.art, 320),
    });
  }

  const outCovers = {};
  for (const [key, val] of Object.entries(covers)) {
    let k = key;
    if (key.startsWith('song:')) { const fp = idToFp.get(key.slice(5)); if (!fp) continue; k = `song:${fp}`; }
    outCovers[k] = val === 'none' ? 'none' : await addImage(val, 640);
  }

  const outStats = {};
  for (const [id, s] of Object.entries(stats)) if (idToFp.has(id)) outStats[idToFp.get(id)] = s;

  const data = {
    app: MAGIC, version: 1, exportedAt: new Date().toISOString(),
    profile: { name: profile.name || '', username: profile.username || '', avatar: await addImage(profile.avatar, 512) },
    theme, images, songs, covers: outCovers, stats: outStats,
    playlists: playlists.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, songs: p.trackIds.map((id) => idToFp.get(id)).filter(Boolean) })),
  };
  return gzip(JSON.stringify(data));
}

export async function parseExport(file) {
  let data;
  try { data = JSON.parse(await gunzip(await file.arrayBuffer())); } catch { throw new Error('That file isn’t a valid Rune backup.'); }
  if (data?.app !== MAGIC || !Array.isArray(data.songs)) throw new Error('That file isn’t a valid Rune backup.');
  return data;
}

/**
 * Works out what importing `data` changes, without touching storage.
 * - songs already on this device get the imported info/covers
 * - songs that aren't here become faded placeholders (kind 'ghost') until the real file is added
 */
export async function planImport(data, records, { uid, now = Date.now() }) {
  const blobs = await Promise.all((data.images || []).map((u) => dataURLToBlob(u)));
  const img = (ref) => (ref == null ? null : blobs[ref] || null);

  const updated = [], created = [], idByFp = new Map(), taken = new Set();
  let matched = 0;
  for (const e of data.songs) {
    const hit = findMatch(records, e, taken);
    const meta = { title: e.title, artist: e.artist, album: e.album || '', trackNo: e.trackNo || 0 };
    if (hit) {
      taken.add(hit.id);
      const next = { ...hit, ...meta };
      if (!next.art && img(e.art)) next.art = img(e.art);
      updated.push(next); idByFp.set(e.fp, hit.id); matched++;
    } else {
      const id = `l:${uid()}`;
      created.push({ id, kind: 'ghost', ...meta, duration: e.duration || 0, fileName: e.fileName, size: e.size, fp: e.fp, sigKey: e.sigKey, art: img(e.art), addedAt: now + created.length });
      idByFp.set(e.fp, id);
    }
  }

  const covers = {};
  for (const [key, val] of Object.entries(data.covers || {})) {
    let k = key;
    if (key.startsWith('song:')) { const id = idByFp.get(key.slice(5)); if (!id) continue; k = `song:${id}`; }
    const v = val === 'none' ? 'none' : img(val);
    if (v) covers[k] = v;
  }

  const playlists = (data.playlists || []).map((p) => ({
    id: p.id, name: p.name, updatedAt: p.updatedAt || 0, trackIds: (p.songs || []).map((fp) => idByFp.get(fp)).filter(Boolean),
  }));
  const stats = {};
  for (const [fp, s] of Object.entries(data.stats || {})) if (idByFp.has(fp)) stats[idByFp.get(fp)] = s;

  return {
    updated, created, covers, playlists, stats,
    theme: data.theme || null,
    profile: { name: data.profile?.name || '', username: data.profile?.username || '', avatar: img(data.profile?.avatar) },
    summary: { matched, missing: created.length, playlists: playlists.length },
  };
}
