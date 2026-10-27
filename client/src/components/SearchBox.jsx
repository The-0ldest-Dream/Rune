// Top search bar. While focused it lists the songs you recently played FROM search (not what you typed) and your songs;
// typing shows matching artists and songs. Enter opens the full results page.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { Cover, Icon, IconButton, artistHref } from './ui.jsx';

export const matches = (t, q) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q);

function SongRow({ t, onPlay, onForget }) {
  return (
    <div className="dd-row">
      <button className={`dd-main ${t.missing ? 'missing' : ''}`} onClick={onPlay}>
        <Cover src={t.cover} seed={t.albumKey || t.id} label={t.title} className="thumb" />
        <span className="t-text"><span className="t-title">{t.title}</span><span className="t-artist">{t.artist}</span></span>
      </button>
      {onForget && <IconButton icon="close" size={14} label={`Remove ${t.title} from recent`} onClick={onForget} />}
    </div>
  );
}

export default function SearchBox({ route }) {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
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
    () => (q ? lib.tracks.filter((t) => matches(t, q)).slice(0, 6) : lib.tracks.filter((t) => !t.missing).slice().reverse().slice(0, 6)),
    [lib.tracks, q]
  );
  const artists = useMemo(() => (q ? lib.artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 3) : []), [lib.artists, q]);
  const recent = useMemo(() => lib.searchPlays.map((id) => lib.byId.get(id)).filter((t) => t && !t.missing), [lib.searchPlays, lib.byId]);

  const go = () => {
    setOpen(false);
    location.hash = q ? `#/search/${encodeURIComponent(value.trim())}` : '#/search';
  };

  return (
    <div className="searchbox-wrap" ref={box}>
      <form className="searchbox" role="search" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <Icon name="search" size={20} />
        <input type="search" value={value} onFocus={() => setOpen(true)} onChange={(e) => { setValue(e.target.value); setOpen(true); }}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Search your songs, artists, playlists" aria-label="Search" autoComplete="off" />
      </form>

      {open && (
        <div className="dropdown" role="listbox">
          {!q && recent.length > 0 && (
            <section>
              <div className="dd-head"><h4>Recently played from search</h4><button className="link-btn" onClick={lib.clearSearchPlays}>Clear all</button></div>
              {recent.map((t, i) => (
                <SongRow key={t.id} t={t} onForget={() => lib.forgetSearchPlay(t.id)}
                  onPlay={() => { playQueue(recent, i, 'Recently played'); setOpen(false); }} />
              ))}
            </section>
          )}
          {artists.length > 0 && (
            <section>
              <div className="dd-head"><h4>Artists</h4></div>
              {artists.map((a) => (
                <a key={a.key} className="dd-row dd-main" href={artistHref(a.key)} onClick={() => setOpen(false)}>
                  <Cover round src={a.cover} seed={a.key} label={a.name} className="thumb" /><span>{a.name}</span>
                </a>
              ))}
            </section>
          )}
          <section>
            <div className="dd-head"><h4>{q ? 'Songs' : 'Your songs'}</h4></div>
            {songs.length === 0 && <p className="muted dd-empty">{q ? 'No songs match.' : 'Add songs in Device files to see them here.'}</p>}
            {songs.map((t, i) => (
              <SongRow key={t.id} t={t} onPlay={() => { playQueue(songs, i, q ? 'Search results' : 'Your songs'); setOpen(false); }} />
            ))}
          </section>
          {q && <button className="dd-all" onClick={go}><Icon name="search" size={16} /> See all results for “{value.trim()}”</button>}
        </div>
      )}
    </div>
  );
}
