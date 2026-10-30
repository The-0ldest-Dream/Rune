// Listening recap: aggregates the per-day listening log into week / year summaries.
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The last `n` day keys, oldest first, ending today. */
export function lastDays(n, end = new Date()) {
  return Array.from({ length: n }, (_, i) => { const d = new Date(end); d.setDate(d.getDate() - (n - 1 - i)); return dayKey(d); });
}

const daySeconds = (day) => Object.values(day?.songs || {}).reduce((a, b) => a + b, 0);

/**
 * @param daily  { 'YYYY-MM-DD': { songs: { id: seconds }, plays: n } }
 * @param keys   day keys to include
 * @param byId   Map id → track (to name songs and artists)
 */
export function summarize(daily, keys, byId) {
  const songs = new Map(), artists = new Map();
  const perDay = keys.map((key) => ({ key, seconds: daySeconds(daily[key]) }));
  let plays = 0;
  for (const key of keys) {
    const day = daily[key];
    if (!day) continue;
    plays += day.plays || 0;
    for (const [id, sec] of Object.entries(day.songs || {})) {
      songs.set(id, (songs.get(id) || 0) + sec);
      const t = byId.get(id);
      for (const name of (t && t.artists) || []) artists.set(name, (artists.get(name) || 0) + sec);
    }
  }
  const top = (map, n, mapFn) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(mapFn);
  const best = perDay.reduce((m, d) => (d.seconds > (m?.seconds || 0) ? d : m), null);
  return {
    seconds: perDay.reduce((a, d) => a + d.seconds, 0), plays, activeDays: perDay.filter((d) => d.seconds > 0).length, perDay, bestDay: best,
    topSongs: top(songs, 5, ([id, seconds]) => ({ id, seconds, track: byId.get(id) || null })).filter((x) => x.track),
    topArtists: top(artists, 5, ([name, seconds]) => ({ name, seconds })),
  };
}

/** Seconds listened per month for a calendar year → 12 numbers. */
export function perMonth(daily, year) {
  const out = Array(12).fill(0);
  for (const [key, day] of Object.entries(daily)) if (key.startsWith(`${year}-`)) out[Number(key.slice(5, 7)) - 1] += daySeconds(day);
  return out;
}
export const yearKeys = (daily, year) => Object.keys(daily).filter((k) => k.startsWith(`${year}-`));
