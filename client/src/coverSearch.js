// Finds cover art on the internet for a song: Apple's iTunes Search API first, then MusicBrainz + the Cover Art Archive.
// Sends the song title and artist to those services. Network access is injectable so this can be tested.
import { norm, parseArtists } from './util.js';

const tokens = (s) => norm(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/** 0..1 word overlap (Jaccard). */
export function similarity(a, b) {
  const x = new Set(tokens(a)), y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both);
}

/** "Song (feat. X) - Remastered 2011" → "Song" for searching. */
export const cleanTitle = (t) => String(t || '').replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+(remaster(ed)?|live|mono|stereo|single|radio edit|version|\d{4}).*$/i, '').replace(/\s+/g, ' ').trim();

const firstArtist = (t) => parseArtists(t.artist)[0] || '';

/** Best search hit for a song (needs a decent title match and, when we know the artist, an artist match). */
export function pickBest(results, track) {
  const artist = parseArtists(track.artist).join(' ');
  let best = null, bestScore = 0;
  for (const r of results) {
    const ts = Math.max(similarity(r.title, track.title), similarity(cleanTitle(r.title), cleanTitle(track.title)));
    const as = artist ? similarity(r.artist, artist) : 0.5;
    const score = ts * 0.65 + as * 0.35;
    if (ts >= 0.5 && (!artist || as >= 0.25) && score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

export const upscale = (url) => String(url).replace(/\/\d+x\d+(bb)?\.(jpg|jpeg|png)/i, '/600x600bb.$2');

export async function searchItunes(track, { fetchFn = fetch } = {}) {
  const term = `${cleanTitle(track.title)} ${firstArtist(track)}`.trim();
  const res = await fetchFn(`https://itunes.apple.com/search?${new URLSearchParams({ term, media: 'music', entity: 'song', limit: '10' })}`);
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  const data = await res.json();
  const hit = pickBest((data.results || []).map((r) => ({ title: r.trackName, artist: r.artistName, image: r.artworkUrl100 })), track);
  return hit?.image ? [upscale(hit.image)] : [];
}

export async function searchMusicBrainz(track, { fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  await sleep(1100);                                           // MusicBrainz asks for at most one request per second
  const artist = firstArtist(track);
  const q = `recording:"${cleanTitle(track.title).replace(/"/g, '')}"${artist ? ` AND artist:"${artist.replace(/"/g, '')}"` : ''}`;
  const res = await fetchFn(`https://musicbrainz.org/ws/2/recording/?${new URLSearchParams({ query: q, fmt: 'json', limit: '6' })}`);
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const data = await res.json();
  const recs = (data.recordings || []).map((r) => ({ title: r.title, artist: (r['artist-credit'] || []).map((a) => a.name).join(' '), releases: r.releases || [] }));
  const hit = pickBest(recs, track);
  return (hit?.releases || []).slice(0, 3).map((rel) => `https://coverartarchive.org/release/${rel.id}/front-500`);
}

export async function downloadImage(url, { fetchFn = fetch } = {}) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  const blob = await res.blob();
  if (!String(blob.type).startsWith('image/')) throw new Error('not an image');
  return blob;
}

/** Tries each source in turn and returns the first cover image that downloads, or null. `imageUrl` (e.g. from a Spotify CSV) goes first. */
export async function findCoverBlob(track, opts = {}) {
  const sources = [() => (track.imageUrl ? [track.imageUrl] : []), () => searchItunes(track, opts), () => searchMusicBrainz(track, opts)];
  for (const source of sources) {
    let urls = [];
    try { urls = await source(); } catch { /* source unavailable: try the next */ }
    for (const u of urls) { try { return await downloadImage(u, opts); } catch { /* next candidate */ } }
  }
  return null;
}
