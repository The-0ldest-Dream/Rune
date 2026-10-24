// Top search bar: while focused it lists your songs and recent searches; Enter opens full results.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { Cover, Icon, IconButton, artistHref } from './ui.jsx';

const KEY = 'rune.searches';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

export const matches = (t, q) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q);

export default function SearchBox({ route }) {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(load);
  const box = useRef(null);

  useEffect(() => { if (route.name === 'search') setValue(route.arg); }, [route]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const q = value.trim().toLowerCase();
  const songs = useMemo(
    () => (q ? lib.tracks.filter((t) => matches(t, q)).slice(0, 6) : lib.tracks.slice().reverse().slice(0, 6)),
    [lib.tracks, q]
  );
  const artists = useMemo(() => (q ? lib.artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 3) : []), [lib.artists, q]);

  const remember = (text) => {
    const t = text.trim();
    if (t.length < 2) return;
    const next = [t, ...history.filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, 10);
    setHistory(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };
  const forget = (text) => {
    const next = text ? history.filter((h) => h !== text) : [];
    setHistory(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };
  const go = (text) => {
    remember(text);
    setValue(text);
    setOpen(false);
    location.hash = `#/search/${encodeURIComponent(text.trim())}`;
  };

  return (
    <div className="searchbox-wrap" ref={box}>
      <form className="searchbox" role="search" onSubmit={(e) => { e.preventDefault(); if (q) go(value); else { setOpen(false); location.hash = '#/search'; } }}>
        <Icon name="search" size={20} />
        <input type="search" value={value} onFocus={() => setOpen(true)} onChange={(e) => { setValue(e.target.value); setOpen(true); }}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Search your songs, artists, playlists" aria-label="Search" autoComplete="off" />
      </form>

      {open && (
        <div className="dropdown" role="listbox">
          {!q && history.length > 0 && (
            <section>
              <div className="dd-head"><h4>Recent searches</h4><button className="link-btn" onClick={() => forget()}>Clear all</button></div>
              {history.map((h) => (
                <div key={h} className="dd-row">
                  <button className="dd-main" onClick={() => go(h)}><Icon name="history" size={18} /><span>{h}</span></button>
                  <IconButton icon="close" size={14} label={`Remove ${h} from history`} onClick={() => forget(h)} />
                </div>
              ))}
            </section>
          )}
          {artists.length > 0 && (
            <section>
              <div className="dd-head"><h4>Artists</h4></div>
              {artists.map((a) => (
                <a key={a.key} className="dd-row dd-main" href={artistHref(a.key)} onClick={() => { remember(value); setOpen(false); }}>
                  <Cover round src={a.cover} seed={a.key} label={a.name} className="thumb" /><span>{a.name}</span>
                </a>
              ))}
            </section>
          )}
          <section>
            <div className="dd-head"><h4>{q ? 'Songs' : 'Your songs'}</h4></div>
            {songs.length === 0 && <p className="muted dd-empty">{q ? 'No songs match.' : 'Add songs in Device files to see them here.'}</p>}
            {songs.map((t, i) => (
              <button key={t.id} className="dd-row dd-main" onClick={() => { if (q) remember(value); playQueue(songs, i, q ? 'Search results' : 'Your songs'); setOpen(false); }}>
                <Cover src={t.cover} seed={t.albumKey || t.id} label={t.title} className="thumb" />
                <span className="t-text"><span className="t-title">{t.title}</span><span className="t-artist">{t.artist}</span></span>
              </button>
            ))}
          </section>
          {q && <button className="dd-all" onClick={() => go(value)}><Icon name="search" size={16} /> See all results for “{value.trim()}”</button>}
        </div>
      )}
    </div>
  );
}
