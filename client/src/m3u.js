// M3U / M3U8 / PLS playlist files: parse, match against the library, and build.
import { norm } from './util.js';

const base = (path) => String(path).split(/[\\/]/).pop();
const stripExt = (n) => n.replace(/\.[^.]+$/, '');

/** → [{ path, title?, artist?, duration? }] */
export function parsePlaylist(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  if (lines[0]?.toLowerCase() === '[playlist]') {                       // PLS
    const files = {}, titles = {}, lens = {};
    for (const l of lines) {
      let m;
      if ((m = /^File(\d+)=(.*)$/i.exec(l))) files[m[1]] = m[2];
      else if ((m = /^Title(\d+)=(.*)$/i.exec(l))) titles[m[1]] = m[2];
      else if ((m = /^Length(\d+)=(-?\d+)$/i.exec(l))) lens[m[1]] = Number(m[2]);
    }
    for (const k of Object.keys(files).sort((a, b) => a - b)) out.push({ path: files[k], ...splitTitle(titles[k]), duration: lens[k] > 0 ? lens[k] : undefined });
    return out;
  }
  let info = null;
  for (const l of lines) {
    if (l.startsWith('#EXTINF:')) {
      const m = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)\s*(?:,(.*))?$/.exec(l);
      info = m ? { duration: Number(m[1]) > 0 ? Number(m[1]) : undefined, ...splitTitle(m[2]) } : null;
    } else if (!l.startsWith('#')) {
      out.push({ path: l.replace(/^file:\/\/\/?/i, ''), ...(info || {}) });
      info = null;
    }
  }
  return out;
}

function splitTitle(text) {
  const t = String(text || '').trim();
  if (!t) return {};
  const m = /^(.+?)\s+-\s+(.+)$/.exec(t);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: t };
}

/** Finds the library songs for playlist entries. Returns { ids (unique, in order), matched, missing }. */
export function matchEntries(entries, tracks) {
  const byFile = new Map(), byLabel = new Map();
  for (const t of tracks) {
    if (t.fileName) byFile.set(norm(t.fileName), t);
    byLabel.set(norm(`${t.artist} - ${t.title}`), t);
    if (!byLabel.has(norm(t.title))) byLabel.set(norm(t.title), t);
  }
  const ids = [], seen = new Set();
  let missing = 0;
  for (const e of entries) {
    const file = base(e.path);
    let hit = byFile.get(norm(file)) || byLabel.get(norm(stripExt(file)));
    if (!hit && e.title) {
      hit = tracks.find((t) => norm(t.title) === norm(e.title) && (!e.artist || norm(t.artist) === norm(e.artist))
        && (!e.duration || !t.duration || Math.abs(t.duration - e.duration) <= 3));
    }
    if (!hit) { missing++; continue; }
    if (!seen.has(hit.id)) { seen.add(hit.id); ids.push(hit.id); }
  }
  return { ids, matched: ids.length, missing };
}

/** Builds an extended M3U (UTF-8). Paths are the original file names. */
export function buildM3U(name, tracks) {
  const lines = ['#EXTM3U', `#PLAYLIST:${name}`];
  for (const t of tracks) {
    lines.push(`#EXTINF:${Math.round(t.duration || -1)},${t.artist && t.artist !== 'Unknown artist' ? `${t.artist} - ` : ''}${t.title}`);
    lines.push(t.fileName || `${t.title}.mp3`);
  }
  return `${lines.join('\n')}\n`;
}
