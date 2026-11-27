// Reads Spotify playlist exports: the "Download your data" JSON (Playlist1.json) or an Exportify-style CSV.
import { norm, parseArtists } from './util.js';

/** Minimal CSV parser (quotes, commas and newlines inside quotes). */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const clean = (s) => String(s || '').trim();

/** → { playlists: [{ name, tracks: [{ title, artist, album, duration (seconds), uri, image }] }] } */
export function parseSpotifyExport(text, filename = 'Spotify playlist') {
  const body = String(text || '').replace(/^\uFEFF/, '').trim();
  const baseName = filename.replace(/\.[^.]+$/, '') || 'Spotify playlist';
  if (body.startsWith('{') || body.startsWith('[')) {
    const data = JSON.parse(body);
    const list = Array.isArray(data) ? data : data.playlists || [data];
    const playlists = list.map((p, i) => ({
      name: clean(p.name) || `${baseName} ${i + 1}`,
      tracks: (p.items || p.tracks || []).map((it) => {
        const t = it.track || it.localTrack || it;
        return { title: clean(t.trackName || t.name), artist: clean(t.artistName || (Array.isArray(t.artists) ? t.artists.map((a) => a.name || a).join(', ') : t.artist)), album: clean(t.albumName || t.album?.name || t.album), duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : 0, uri: clean(t.trackUri || t.uri), image: '' };
      }).filter((t) => t.title),
    })).filter((p) => p.tracks.length);
    return { playlists };
  }
  const rows = parseCsv(body);
  if (rows.length < 2) return { playlists: [] };
  const head = rows[0].map((h) => norm(h));
  const col = (re) => head.findIndex((h) => re.test(h));
  const cTitle = col(/^(track name|name|title|song)$/), cArtist = col(/artist/), cAlbum = col(/^(album name|album)$/);
  const cDur = col(/duration/), cUri = col(/uri/), cImg = col(/image|cover|artwork/);
  if (cTitle < 0) return { playlists: [] };
  const tracks = rows.slice(1).map((r) => ({
    title: clean(r[cTitle]), artist: cArtist >= 0 ? clean(r[cArtist]) : '', album: cAlbum >= 0 ? clean(r[cAlbum]) : '',
    duration: cDur >= 0 ? Math.round(Number(r[cDur]) / (/ms/.test(head[cDur]) || Number(r[cDur]) > 2000 ? 1000 : 1)) || 0 : 0,
    uri: cUri >= 0 ? clean(r[cUri]) : '', image: cImg >= 0 ? clean(r[cImg]) : '',
  })).filter((t) => t.title);
  return { playlists: tracks.length ? [{ name: baseName, tracks }] : [] };
}

const strip = (t) => norm(String(t).replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+(remaster(ed)?|live|mono|stereo|single|radio edit|version).*$/i, ''));

/** Finds a library song for a Spotify track: same title and a shared artist (duration, when known on both sides, within 8 s). */
export function matchSpotifyTrack(sp, songs) {
  const artistKeys = parseArtists(sp.artist).map(norm);
  const ok = (t) => (!sp.duration || !t.duration || Math.abs(t.duration - sp.duration) <= 8)
    && (!artistKeys.length || !t.artistKeys?.length || t.artistKeys.some((k) => artistKeys.includes(k)));
  return songs.find((t) => norm(t.title) === norm(sp.title) && ok(t))
    || songs.find((t) => strip(t.title) === strip(sp.title) && strip(t.title) !== '' && ok(t)) || null;
}
