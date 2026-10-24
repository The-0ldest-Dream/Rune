// In-browser stand-in for the Express API (used by the GitHub Pages build).
// It answers the same GET endpoints with the same JSON shapes, from a catalogue generated on first use.
import { generateCatalogue } from '../../../server/src/catalogueData.js';

let C;
function catalogue() {
  if (C) return C;
  const g = generateCatalogue();
  const artistById = new Map(g.artists.map((a) => [a.id, a]));
  const albumById = new Map(g.albums.map((a) => [a.id, a]));
  const tracks = g.tracks.map((t) => ({
    ...t, source: 'demo', artist: artistById.get(t.artist_id).name, album: albumById.get(t.album_id).title,
  }));
  const counts = new Map();
  tracks.forEach((t) => counts.set(t.album_id, (counts.get(t.album_id) || 0) + 1));
  const albums = g.albums.map((a) => ({ ...a, artist: artistById.get(a.artist_id).name, tracks: counts.get(a.id) || 0 }));
  const byArtistName = (a, b) => a.name.localeCompare(b.name);
  C = {
    artists: g.artists, albums, tracks, artistById, albumById,
    tracksSorted: tracks.slice().sort((a, b) =>
      a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || a.track_no - b.track_no),
    albumsSorted: albums.slice().sort((a, b) => a.title.localeCompare(b.title)),
    artistsSorted: g.artists.slice().sort(byArtistName),
  };
  return C;
}

const notFound = (what) => Object.assign(new Error(`${what} not found`), { status: 404 });
const paging = (q) => ({
  limit: Math.min(Math.max(parseInt(q.limit) || 50, 1), 200),
  offset: Math.max(parseInt(q.offset) || 0, 0),
});
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const slice = (list, q) => {
  const { limit, offset } = paging(q);
  return { items: list.slice(offset, offset + limit), total: list.length };
};

export async function handle(path) {
  const url = new URL(path, 'http://local');
  const q = Object.fromEntries(url.searchParams);
  const p = url.pathname;
  const c = catalogue();
  const needle = (q.q || '').toLowerCase();
  const has = (...fields) => fields.some((f) => String(f).toLowerCase().includes(needle));
  let m;

  if (p === '/health') return { ok: true, tracks: c.tracks.length, features: { jamendo: false, static: true } };

  if (p === '/tracks') {
    let list = q.sort === 'random' ? shuffle(c.tracks) : c.tracksSorted;
    if (needle) list = list.filter((t) => has(t.title, t.artist, t.album));
    if (q.genre) list = list.filter((t) => t.genre === q.genre);
    if (q.artist) list = list.filter((t) => t.artist_id === Number(q.artist));
    if (q.album) list = list.filter((t) => t.album_id === Number(q.album));
    return slice(list, q);
  }
  if ((m = p.match(/^\/tracks\/(\d+)$/))) {
    const t = c.tracks[Number(m[1]) - 1];
    if (!t) throw notFound('Track');
    return t;
  }

  if (p === '/albums') {
    let list = q.sort === 'random' ? shuffle(c.albums) : c.albumsSorted;
    if (needle) list = list.filter((a) => has(a.title, a.artist));
    if (q.genre) list = list.filter((a) => a.genre === q.genre);
    return slice(list, q);
  }
  if ((m = p.match(/^\/albums\/(\d+)$/))) {
    const a = c.albums[Number(m[1]) - 1];
    if (!a) throw notFound('Album');
    return { ...a, tracks: c.tracks.filter((t) => t.album_id === a.id).sort((x, y) => x.track_no - y.track_no) };
  }

  if (p === '/artists') {
    let list = c.artistsSorted;
    if (needle) list = list.filter((a) => has(a.name));
    if (q.genre) list = list.filter((a) => a.genre === q.genre);
    const albumCount = new Map();
    c.albums.forEach((al) => albumCount.set(al.artist_id, (albumCount.get(al.artist_id) || 0) + 1));
    const page = slice(list, q);
    return { ...page, items: page.items.map((a) => ({ ...a, albums: albumCount.get(a.id) || 0 })) };
  }
  if ((m = p.match(/^\/artists\/(\d+)$/))) {
    const a = c.artistById.get(Number(m[1]));
    if (!a) throw notFound('Artist');
    const albums = c.albums.filter((al) => al.artist_id === a.id).sort((x, y) => y.year - x.year || x.title.localeCompare(y.title));
    const order = new Map(albums.map((al, i) => [al.id, i]));
    const tracks = c.tracks.filter((t) => t.artist_id === a.id).sort((x, y) => order.get(x.album_id) - order.get(y.album_id) || x.track_no - y.track_no);
    return { ...a, albums: albums.map(({ id, title, year, genre }) => ({ id, title, year, genre })), tracks };
  }

  if (p === '/genres') {
    const n = new Map();
    c.tracks.forEach((t) => n.set(t.genre, (n.get(t.genre) || 0) + 1));
    return Array.from(n, ([name, tracks]) => ({ name, tracks })).sort((a, b) => b.tracks - a.tracks);
  }

  throw Object.assign(new Error('This feature needs the server version of Rune.'), { status: 501 });
}
