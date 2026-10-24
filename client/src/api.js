// Thin fetch wrapper + data hooks. All server calls go through /api.
import { useCallback, useEffect, useState } from 'react';
import { coverSvg } from '../../server/src/cover.js';

/** True in the GitHub Pages build: the catalogue and demo audio live in the browser, there is no server. */
export const STATIC = typeof __STATIC__ !== 'undefined' && __STATIC__;


const TOKEN_KEY = 'rune.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(method, path, body) {
  if (STATIC) {
    if (method !== 'GET') throw Object.assign(new Error('Accounts and sync need the server version of Rune.'), { status: 501 });
    return (await import('./static/catalogue.js')).handle(path);
  }
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    const e = new Error('Cannot reach the server. Local files and saved tracks still work.');
    e.offline = true;
    throw e;
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
};

export const qs = (o) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

/** Album art URL: generated in the browser for the static build, served by the API otherwise. */
export const coverUrl = (albumId) =>
  STATIC ? `data:image/svg+xml,${encodeURIComponent(coverSvg(albumId))}` : `/api/cover/${albumId}.svg`;

/** Convert a server track row into the client's track shape. */
export const toTrack = (t) => ({
  id: `s:${t.id}`, title: t.title, artist: t.artist, artistId: t.artist_id,
  album: t.album, albumId: t.album_id, duration: t.duration, genre: t.genre,
  cover: coverUrl(t.album_id), src: STATIC ? `demo:${t.id}:${t.genre}` : `/api/stream/${t.id}`,
});

/** Fetch a single resource. Pass null to skip. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setState({ data: null, error: null, loading: false }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(path)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error) => live && setState({ data: null, error, loading: false }));
    return () => { live = false; };
  }, [path, tick]);
  return { ...state, reload: useCallback(() => setTick((n) => n + 1), []) };
}

/** Paged list endpoint returning { items, total }. */
export function usePaged(base, pageSize = 48) {
  const [s, setS] = useState({ items: [], total: 0, loading: !!base, error: null });
  const [tick, setTick] = useState(0);
  const sep = base && base.includes('?') ? '&' : '?';

  useEffect(() => {
    if (!base) { setS({ items: [], total: 0, loading: false, error: null }); return; }
    let live = true;
    setS({ items: [], total: 0, loading: true, error: null });
    api.get(`${base}${sep}limit=${pageSize}&offset=0`)
      .then((d) => live && setS({ items: d.items, total: d.total ?? d.items.length, loading: false, error: null }))
      .catch((error) => live && setS({ items: [], total: 0, loading: false, error }));
    return () => { live = false; };
  }, [base, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = useCallback(() => {
    setS((cur) => {
      if (cur.loading) return cur;
      api.get(`${base}${sep}limit=${pageSize}&offset=${cur.items.length}`)
        .then((d) => setS((p) => ({ ...p, items: [...p.items, ...d.items], loading: false })))
        .catch((error) => setS((p) => ({ ...p, loading: false, error })));
      return { ...cur, loading: true };
    });
  }, [base, sep, pageSize]);

  return { ...s, more, reload: () => setTick((n) => n + 1), hasMore: s.items.length < s.total };
}
