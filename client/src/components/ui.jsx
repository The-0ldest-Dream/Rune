// Shared presentational pieces: icons, cover art, status messages, track list and the per-track menu.
import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/player.jsx';
import { useLibrary } from '../store/library.jsx';

const PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
  prev: 'M6 6h2v12H6zM9.5 12l8.5 6V6z',
  shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8v8a4.5 4.5 0 002.5-4z',
  mute: 'M16.5 12A4.5 4.5 0 0014 8v2.18l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  home: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  library: 'M4 4h2v16H4zm5 0h2v16H9zm4.5.5l1.9-.5 4.1 15.5-1.9.5z',
  queue: 'M3 6h12v2H3zm0 5h12v2H3zm0 5h8v2H3zm13-1v6l5-3z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z',
  trash: 'M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  check: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
  eq: 'M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  music: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  sync: 'M12 4V1L8 5l4 4V6a6 6 0 016 6c0 1-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14a6 6 0 01-6-6c0-1 .25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
  more: 'M6 10a2 2 0 100 4 2 2 0 000-4zm12 0a2 2 0 100 4 2 2 0 000-4zm-6 0a2 2 0 100 4 2 2 0 000-4z',
  album: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 14a4 4 0 110-8 4 4 0 010 8zm0-5.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  panel: 'M3 4h18v16H3V4zm12 2v12h4V6h-4z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  expand: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  shrink: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
  image: 'M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z',
  video: 'M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z',
  history: 'M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 117 7 6.9 6.9 0 01-4.9-2.1l-1.42 1.42A8.9 8.9 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z',
};

export function Icon({ name, size = 20, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export const IconButton = ({ icon, label, active, size = 20, className = '', ...rest }) => (
  <button type="button" className={`icon-btn ${active ? 'on' : ''} ${className}`} aria-label={label} title={label} {...rest}>
    <Icon name={icon} size={size} />
  </button>
);

export const fmtTime = (s) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

const hash = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export function Cover({ src, seed = '', round = false, label = '', className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const h = hash(seed || label) % 360;
  return (
    <div className={`cover ${round ? 'round' : ''} ${className}`} style={{ '--h': h }}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : round ? (
        <span className="initials">{label.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
      ) : (
        <Icon name="music" size={28} />
      )}
    </div>
  );
}

export function Status({ loading, empty, emptyText }) {
  if (loading) return <div className="status" role="status"><span className="spinner" /> Loading…</div>;
  if (empty) return <div className="status muted">{emptyText || 'Nothing here yet.'}</div>;
  return null;
}

export function Eq({ active }) {
  return <span className={`bars ${active ? 'live' : ''}`} aria-hidden="true"><i /><i /><i /></span>;
}

export const albumHref = (key) => `#/album/${encodeURIComponent(key)}`;
export const artistHref = (key) => `#/artist/${encodeURIComponent(key)}`;

/** ⋯ menu for a song: queue actions, playlists, edit info and optional removal. */
export function TrackMenu({ track, onRemove, removeLabel = 'Remove' }) {
  const { playNext, addToQueue } = usePlayer();
  const lib = useLibrary();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('main');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const done = (fn) => () => { fn(); setOpen(false); setView('main'); };

  return (
    <div className="menu-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <IconButton icon="more" label="More options" onClick={() => { setOpen(!open); setView('main'); }} />
      {open && (
        <div className="menu" role="menu">
          {view === 'main' ? (
            <>
              <button role="menuitem" onClick={done(() => playNext(track))}>Play next</button>
              <button role="menuitem" onClick={done(() => addToQueue(track))}>Add to queue</button>
              <button role="menuitem" onClick={() => setView('playlists')}>Add to playlist…</button>
              <button role="menuitem" onClick={done(() => lib.openEdit([track.id]))}>Edit info &amp; cover</button>
              {onRemove && <button role="menuitem" className="danger" onClick={done(onRemove)}>{removeLabel}</button>}
            </>
          ) : (
            <>
              <button role="menuitem" onClick={() => setView('main')}>‹ Back</button>
              <button role="menuitem" onClick={done(() => { const p = lib.createPlaylist(`Playlist ${lib.playlists.length + 1}`, [track.id]); lib.toast(`Created “${p.name}”.`); })}>
                + New playlist
              </button>
              {lib.playlists.map((p) => (
                <button key={p.id} role="menuitem" onClick={done(() => { lib.addToPlaylist(p.id, track.id); lib.toast(`Added to “${p.name}”.`); })}>
                  {p.name}{p.tracks.some((t) => t.id === track.id) ? ' ✓' : ''}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Song table. `label` names the queue's source (shown in full-screen view). */
export function TrackList({ tracks, onRemove, removeLabel, showAlbum = true, emptyText, label = '', selectable = false, selected, onToggle }) {
  const { playQueue, current, playing } = usePlayer();
  const lib = useLibrary();
  if (!tracks.length) return <Status empty emptyText={emptyText || 'No songs to show.'} />;
  return (
    <div className="tracklist" role="table" aria-label="Songs">
      {tracks.map((t, i) => {
        const isCur = current?.id === t.id;
        const act = () => (selectable ? onToggle(t.id) : playQueue(tracks, i, label));
        return (
          <div
            key={`${t.id}-${i}`} role="row" tabIndex={0}
            className={`track ${isCur ? 'current' : ''} ${showAlbum ? '' : 'no-album'} ${selectable && selected?.has(t.id) ? 'selected' : ''}`}
            onClick={act} onKeyDown={(e) => { if (e.key === 'Enter') act(); }}
          >
            <span className="num">
              {selectable
                ? <input type="checkbox" checked={!!selected?.has(t.id)} onChange={() => onToggle(t.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${t.title}`} />
                : isCur ? <Eq active={playing} /> : <>{i + 1}<Icon name="play" size={16} className="hover-play" /></>}
            </span>
            <span className="title-cell">
              <Cover src={t.cover} seed={t.albumKey || t.id} label={t.title} className="thumb" />
              <span className="t-text">
                <span className="t-title">{t.title}</span>
                <span className="t-artist">
                  {lib.artistByKey.has(t.artistKey)
                    ? <a href={artistHref(t.artistKey)} onClick={(e) => e.stopPropagation()}>{t.artist}</a> : t.artist}
                </span>
              </span>
            </span>
            {showAlbum && (
              <span className="album-cell">
                {lib.albumByKey.has(t.albumKey) ? <a href={albumHref(t.albumKey)} onClick={(e) => e.stopPropagation()}>{t.album}</a> : t.album}
              </span>
            )}
            <span className="dur">{fmtTime(t.duration)}</span>
            {selectable ? <span /> : <TrackMenu track={t} onRemove={onRemove ? () => onRemove(i) : undefined} removeLabel={removeLabel} />}
          </div>
        );
      })}
    </div>
  );
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function AlbumCard({ album }) {
  return (
    <a className="card" href={albumHref(album.key)}>
      <Cover src={album.cover} seed={album.key} label={album.title} />
      <strong>{album.title}</strong>
      <span className="muted">{album.artist} · {count(album.tracks.length, 'song', 'songs')}</span>
    </a>
  );
}

export function ArtistCard({ artist }) {
  return (
    <a className="card" href={artistHref(artist.key)}>
      <Cover round src={artist.cover} seed={artist.key} label={artist.name} />
      <strong>{artist.name}</strong>
      <span className="muted">{artist.albums.length ? `${count(artist.albums.length, 'album', 'albums')} · ` : ''}{count(artist.tracks.length, 'song', 'songs')}</span>
    </a>
  );
}

export function PlaylistTile({ playlist }) {
  return (
    <a className="tile" href={`#/playlist/${playlist.id}`}>
      <Cover src={playlist.cover} seed={playlist.id} label={playlist.name} className="thumb xl" />
      <span className="tile-name">{playlist.name}</span>
    </a>
  );
}

export function Avatar({ url, name, size = 40 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {url ? <img src={url} alt="" /> : name ? name.trim()[0].toUpperCase() : <Icon name="user" size={size * 0.55} />}
    </span>
  );
}
