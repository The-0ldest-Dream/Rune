// Add songs to a playlist from inside the playlist.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLibrary } from '../store/library.jsx';
import { Cover, Icon, IconButton } from './ui.jsx';

export default function AddSongsDialog({ playlistId, onClose }) {
  const lib = useLibrary();
  const [q, setQ] = useState('');
  const pl = lib.playlists.find((p) => p.id === playlistId);
  const inList = useMemo(() => new Set(pl?.trackIds || []), [pl]);
  const songs = useMemo(() => {
    const n = q.trim().toLowerCase();
    return lib.tracks.filter((t) => !t.missing && (!n || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(n))).slice(0, 300);
  }, [lib.tracks, q]);

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  if (!pl) return null;

  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide add-songs" role="dialog" aria-modal="true" aria-label={`Add songs to ${pl.name}`}>
        <IconButton icon="close" label="Close" className="modal-x" onClick={onClose} />
        <h2>Add songs to “{pl.name}”</h2>
        <label className="searchbox slim"><Icon name="search" size={18} /><input type="search" autoFocus placeholder="Search your songs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your songs" /></label>
        <div className="as-list">
          {songs.length === 0 && <p className="muted status">No songs match.</p>}
          {songs.map((t) => {
            const on = inList.has(t.id);
            return (
              <div key={t.id} className="as-row">
                <Cover src={t.cover} seed={t.albumKey || t.id} label={t.title} className="thumb" />
                <span className="t-text"><span className="t-title">{t.title}</span><span className="t-artist">{t.artist}</span></span>
                <button className={`btn ${on ? 'ghost' : ''} as-btn`} onClick={() => (on ? lib.removeTrackFromPlaylist(pl.id, t.id) : lib.addToPlaylist(pl.id, t.id))} aria-pressed={on}>
                  {on ? <><Icon name="check" size={14} /> Added</> : <><Icon name="plus" size={14} /> Add</>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="row end"><span className="muted small" style={{ marginRight: 'auto' }}>{pl.trackIds.length} in playlist</span><button className="btn" onClick={onClose}>Done</button></div>
      </div>
    </div>,
    document.body
  );
}
