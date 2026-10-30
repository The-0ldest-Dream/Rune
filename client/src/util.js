// Pure helpers: key normalisation, auto-grouping of songs into artists/albums, formatting.
export const UNKNOWN = 'Unknown artist';
/** A group (artist or album) is only created once this many songs match. */
export const MIN_GROUP = 2;

export const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const isUnknown = (artist) => !norm(artist) || norm(artist) === norm(UNKNOWN);

// Names that really contain a comma, so "Tyler, The Creator" isn't split into two artists.
const COMMA_NAMES = [
  'tyler, the creator', 'earth, wind & fire', 'earth, wind and fire', 'crosby, stills, nash & young', 'crosby, stills, nash and young',
  'crosby, stills & nash', 'crosby, stills and nash', 'emerson, lake & palmer', 'emerson, lake and palmer', 'peter, paul & mary',
  'peter, paul and mary', 'blood, sweat & tears', 'blood, sweat and tears', 'earth, wind & fire',
];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits an artist tag into individual, de-duplicated artists.
 * "Radiohead, Radiohead" → ["Radiohead"];  "Lana Del Rey, Bleachers, Lana Del Rey" → ["Lana Del Rey", "Bleachers"].
 * Separators: ";" (explicit — when present it is the only separator), otherwise "," and "feat." / "ft." / "featuring".
 * "&" and "/" are NOT separators (Simon & Garfunkel, AC/DC).
 */
export function parseArtists(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  let parts;
  if (text.includes(';')) parts = text.split(';');
  else {
    const kept = [];
    let work = text;
    for (const n of COMMA_NAMES) work = work.replace(new RegExp(escapeRe(n), 'ig'), (m) => { kept.push(m); return `\u0000${kept.length - 1}\u0000`; });
    parts = work.split(/\s*,\s*|\s+(?:feat\.?|ft\.?|featuring)\s+/i).map((p) => p.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]));
  }
  const seen = new Set(), out = [];
  for (const p of parts) {
    const name = p.trim(), key = norm(name);
    if (!name || seen.has(key) || key === norm(UNKNOWN)) continue;
    seen.add(key); out.push(name);
  }
  return out;
}

/** Everything the app needs to know about who made a song. */
export function artistInfo(rawArtist, rawAlbumArtist = '') {
  const artists = parseArtists(rawArtist);
  const artistKeys = artists.map(norm);
  // The album belongs to the album-artist tag if it names one of the song's artists, otherwise to the first artist.
  const aa = parseArtists(rawAlbumArtist).map(norm).find((k) => artistKeys.includes(k));
  const idx = aa ? artistKeys.indexOf(aa) : 0;
  return {
    artists, artistKeys, artist: artists.join(', '),
    artistKey: artistKeys[0] || '',
    albumArtistName: artists[idx] || '', albumArtistKey: artistKeys[idx] || '',
  };
}
export const artistKeyOf = (t) => artistInfo(t.artist).artistKey;
export const albumKeyOf = (t) => {
  const { albumArtistKey } = artistInfo(t.artist, t.albumArtist);
  return albumArtistKey && norm(t.album) ? `${albumArtistKey}|${norm(t.album)}` : '';
};

const byTrackNo = (a, b) => (a.trackNo || 999) - (b.trackNo || 999) || a.title.localeCompare(b.title);

/** Builds artist and album lists from songs. A song with several artists is listed under each of them. */
export function groupTracks(tracks) {
  const artistMap = new Map(), albumMap = new Map();
  for (const t of tracks) {
    (t.artistKeys || []).forEach((key, i) => {
      if (!artistMap.has(key)) artistMap.set(key, { key, name: t.artists[i], tracks: [] });
      artistMap.get(key).tracks.push(t);
    });
    if (t.albumKey) {
      if (!albumMap.has(t.albumKey)) albumMap.set(t.albumKey, { key: t.albumKey, title: t.album, artist: t.albumArtistName, artistKey: t.albumArtistKey, tracks: [] });
      albumMap.get(t.albumKey).tracks.push(t);
    }
  }
  const albums = [...albumMap.values()].filter((a) => a.tracks.length >= MIN_GROUP);
  albums.forEach((a) => a.tracks.sort(byTrackNo));
  const artists = [...artistMap.values()].filter((a) => a.tracks.length >= MIN_GROUP);
  for (const a of artists) {
    a.albums = albums.filter((al) => al.artistKey === a.key).sort((x, y) => x.title.localeCompare(y.title));
    const inAlbum = new Map(a.albums.map((al, i) => [al.key, i]));
    a.tracks.sort((x, y) => (inAlbum.get(x.albumKey) ?? 999) - (inAlbum.get(y.albumKey) ?? 999) || byTrackNo(x, y));
  }
  artists.sort((x, y) => x.name.localeCompare(y.name));
  return { artists, albums, artistByKey: new Map(artists.map((a) => [a.key, a])), albumByKey: new Map(albums.map((a) => [a.key, a])) };
}

export const fmtListened = (sec) => {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60 ? `${sec % 60}s` : ''}`.trim();
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** Sort descending by plays, then listening time. */
export const rankByStats = (items, stats, idOf = (x) => x.id) =>
  items.slice().sort((a, b) => {
    const sa = stats[idOf(a)] || {}, sb = stats[idOf(b)] || {};
    return (sb.plays || 0) - (sa.plays || 0) || (sb.seconds || 0) - (sa.seconds || 0);
  });

/** Downscale an image file to a JPEG blob (keeps stored covers small). */
export async function resizeImage(file, max = 640) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image'))), 'image/jpeg', 0.88));
}

/* ---------- song fingerprints (match the same file across devices) ---------- */
/** Strong match: same file name and byte size. */
export const fpOf = (fileName, size) => `${norm(fileName)}:${size || 0}`;
/** Weak match: same title + artist as first read from the file's tags (plus a similar duration). */
export const sigKeyOf = (title, artist) => `${norm(title)}|${norm(artist)}`;

/** Finds the stored song (real or faded placeholder) that an exported entry refers to. */
export function findMatch(records, entry, taken = new Set()) {
  const pool = records.filter((r) => (r.kind === 'local' || r.kind === 'ghost') && !taken.has(r.id));
  const strong = pool.find((r) => r.fp && r.fp === entry.fp);
  if (strong) return strong;
  return pool.find((r) => r.sigKey && r.sigKey === entry.sigKey && Math.abs((r.duration || 0) - (entry.duration || 0)) <= 2) || null;
}

/* ---------- images ---------- */
export async function blobToDataURL(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}
export const dataURLToBlob = (url) => fetch(url).then((r) => r.blob());

/** Cheap identity for an image blob: size + a sample of its bytes (used to de-duplicate album art in exports). */
export async function cheapKey(blob) {
  const head = new Uint8Array(await blob.slice(0, 128).arrayBuffer());
  const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - 128)).arrayBuffer());
  let h = 0;
  for (const b of [...head, ...tail]) h = (h * 31 + b) | 0;
  return `${blob.size}:${h}`;
}

/** Downscales (never upscales) an image to at most `max` px, as JPEG. Small JPEGs are returned untouched. */
export async function shrinkImage(blob, max = 320) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && blob.type === 'image/jpeg' && blob.size < 150_000) return blob;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/jpeg', 0.82));
}

/* ---------- cover colours (for the Now playing backdrop) ---------- */
export const hashStr = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export const hueFor = (seed, label = '') => hashStr(seed || label) % 360;

/** Picks the prominent colour of the WHOLE image from RGBA bytes: popular + saturated colours win over white/grey/black. */
export function pickDominant(data) {
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    bins.set(key, e);
  }
  let best = null, bestScore = -1;
  for (const e of bins.values()) {
    const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0, light = (mx + mn) / 510;
    const usable = light < 0.06 || light > 0.94 ? 0.25 : 1;      // near-black / near-white make poor backgrounds
    const score = e.n * (0.2 + sat * 1.8) * usable;
    if (score > bestScore) { bestScore = score; best = [r, g, b]; }
  }
  return best;
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

/** Two CSS colours (top → bottom) for a vertical gradient in the cover's shade. */
export function backdropFor(rgb) {
  const { h, s, l } = rgbToHsl(rgb);
  const top = Math.min(0.46, Math.max(0.28, l)), sat = Math.min(0.85, s);
  return { c1: `hsl(${Math.round(h)} ${Math.round(sat * 100)}% ${Math.round(top * 100)}%)`, c2: `hsl(${Math.round(h)} ${Math.round(sat * 100)}% ${Math.round(top * 48)}%)` };
}
export const backdropFromHue = (h) => ({ c1: `hsl(${h} 55% 32%)`, c2: `hsl(${h} 60% 14%)` });
export const DEFAULT_BACKDROP = { c1: '#2a2a2a', c2: '#121212' };

const colourCache = new Map();
export function dominantColor(url) {
  if (!colourCache.has(url)) {
    colourCache.set(url, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const n = 48, c = document.createElement('canvas');
          c.width = c.height = n;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, n, n);
          resolve(pickDominant(g.getImageData(0, 0, n, n).data));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return colourCache.get(url);
}

/** Cover for the built-in "Liked Songs" playlist: purple→blue gradient with a white heart. */
export const LIKED_ID = 'liked';
export const LIKED_COVER = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4a2bdc'/><stop offset='1' stop-color='#9ec8e8'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/><path fill='white' transform='translate(28.4 27.4) scale(1.8)' d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'/></svg>")}`;
