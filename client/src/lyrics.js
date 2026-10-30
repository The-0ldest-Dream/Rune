// Lyrics: parsing (plain text and synced .lrc), lookup of the current line, and the optional online lookup (LRCLIB).

/** "[01:23.45]text" → seconds. Returns null for lines without timestamps. */
export function parseLrc(raw) {
  const text = String(raw || '').replace(/\r/g, '');
  let offset = 0;
  const lines = [], plain = [];
  for (const line of text.split('\n')) {
    const off = /^\[offset:\s*([+-]?\d+)\s*\]$/i.exec(line.trim());
    if (off) { offset = Number(off[1]) / 1000; continue; }
    if (/^\[(ti|ar|al|au|by|length|re|ve|tool|la):.*\]$/i.test(line.trim())) continue;     // metadata tags
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const body = line.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim();
    if (!stamps.length) { plain.push(line.trim()); continue; }
    for (const m of stamps) {
      const frac = m[3] ? Number(`0.${m[3]}`) : 0;
      lines.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text: body });
    }
  }
  if (lines.length >= 2) {
    lines.sort((a, b) => a.t - b.t);
    return { synced: true, lines: lines.map((l) => ({ ...l, t: Math.max(0, l.t + offset) })) };
  }
  const all = lines.length ? [...lines.map((l) => l.text), ...plain] : plain;
  return { synced: false, lines: all.map((text) => ({ t: null, text })) };
}

/** Index of the line being sung at `time` (binary search); -1 before the first line. */
export function activeLine(lines, time) {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export const hasLyrics = (rec) => !!rec && !rec.miss && !!String(rec.raw || '').trim();

/** Free community lyrics database (https://lrclib.net). Sends title, artist, album and length. Returns raw LRC/plain text or null. */
export async function fetchOnline(track, fetchFn = fetch) {
  if (!track.title || !track.artist || /^unknown artist$/i.test(track.artist)) return null;
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
  if (track.album) params.set('album_name', track.album);
  if (track.duration) params.set('duration', String(Math.round(track.duration)));
  const pick = (j) => (j && (j.syncedLyrics || j.plainLyrics)) || null;
  const get = await fetchFn(`https://lrclib.net/api/get?${params}`);
  if (get.ok) { const text = pick(await get.json()); if (text) return text; }
  else if (get.status !== 404) throw new Error(`lyrics service ${get.status}`);
  // fall back to a looser search (spelling / extra "(feat. …)" in the title)
  const s = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
  const res = await fetchFn(`https://lrclib.net/api/search?${s}`);
  if (!res.ok) { if (res.status === 404) return null; throw new Error(`lyrics service ${res.status}`); }
  const list = await res.json();
  const near = (Array.isArray(list) ? list : []).filter((r) => !track.duration || !r.duration || Math.abs(r.duration - track.duration) <= 5);
  return pick(near.find((r) => r.syncedLyrics) || near.find((r) => r.plainLyrics) || null);
}
