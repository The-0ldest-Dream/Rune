// Pure helpers: key normalisation, auto-grouping of songs into artists/albums, formatting.
export const UNKNOWN = 'Unknown artist';
/** A group (artist or album) is only created once this many songs match. */
export const MIN_GROUP = 2;

export const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const isUnknown = (artist) => !norm(artist) || norm(artist) === norm(UNKNOWN);
export const artistKeyOf = (t) => (isUnknown(t.artist) ? '' : norm(t.artist));
export const albumKeyOf = (t) => (artistKeyOf(t) && norm(t.album) ? `${artistKeyOf(t)}|${norm(t.album)}` : '');

const byTrackNo = (a, b) => (a.trackNo || 999) - (b.trackNo || 999) || a.title.localeCompare(b.title);

/** Builds artist and album lists from songs. Unknown artists never group together. */
export function groupTracks(tracks) {
  const artistMap = new Map(), albumMap = new Map();
  for (const t of tracks) {
    if (t.artistKey) {
      if (!artistMap.has(t.artistKey)) artistMap.set(t.artistKey, { key: t.artistKey, name: t.artist, tracks: [] });
      artistMap.get(t.artistKey).tracks.push(t);
    }
    if (t.albumKey) {
      if (!albumMap.has(t.albumKey)) albumMap.set(t.albumKey, { key: t.albumKey, title: t.album, artist: t.artist, artistKey: t.artistKey, tracks: [] });
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
