// Edit song info (one or many songs) and covers. KindCover wires a CoverEditor to the library for songs, albums, artists and playlists.
import React, { useEffect, useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { UNKNOWN } from '../util.js';
import { CoverEditor } from './CoverEditor.jsx';
import { IconButton } from './ui.jsx';

/** Cover editor wired to the library for one entity (song, album, artist or playlist). */
export function KindCover({ kind, id, src, label, round, candidates, className, cropTitle }) {
  const lib = useLibrary();
  return (
    <CoverEditor src={src} seed={id} label={label} round={round} className={className} candidates={candidates} cropTitle={cropTitle}
      onSave={(blob) => lib.setCoverBlob(kind, id, blob)}
      onRemove={() => lib.removeCover(kind, id)}
      onExtract={(t) => { const b = lib.artBlob(t.id); if (b) lib.setCoverBlob(kind, id, b); }} />
  );
}

function Dialog({ ed }) {
  const lib = useLibrary();
  const tracks = ed.ids.map((id) => lib.byId.get(id)).filter(Boolean);
  const single = tracks.length === 1 ? tracks[0] : null;
  const [f, setF] = useState(() => single
    ? { title: single.title, artist: single.artist === UNKNOWN ? '' : single.artist, album: single.album, trackNo: single.trackNo || '' }
    : { title: '', artist: ed.init.artist ?? '', album: ed.init.album ?? '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && lib.closeEdit();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [lib]);

  const save = async (e) => {
    e.preventDefault();
    const patch = {};
    if (single) Object.assign(patch, { title: f.title, artist: f.artist, album: f.album, trackNo: Number(f.trackNo) || 0 });
    else {
      if (f.artist.trim()) patch.artist = f.artist;
      if (f.album.trim()) patch.album = f.album;
    }
    await lib.updateTracks(ed.ids, patch);
    lib.closeEdit();
    lib.toast(single ? 'Song updated.' : `Updated ${tracks.length} songs.`);
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && lib.closeEdit()}>
      <form className="modal wide" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <IconButton icon="close" label="Close" className="modal-x" type="button" onClick={lib.closeEdit} />
        <h2 id="edit-title">{single ? 'Edit song' : `Edit ${tracks.length} songs`}</h2>
        {!single && <p className="muted">Leave a field empty to keep each song’s current value.</p>}
        {single && (
          <div className="edit-cover">
            <KindCover kind="song" id={single.id} src={single.cover} label={single.title} className="edit-thumb"
              candidates={lib.tracks.filter((t) => t.art && (t.id === single.id || t.albumKey === single.albumKey || !single.albumKey))} />
            <p className="muted small">Tap the cover to change or remove it. A song cover overrides its album’s cover.</p>
          </div>
        )}
        {single && <label className="field"><span>Title</span><input value={f.title} onChange={set('title')} required /></label>}
        <label className="field"><span>Artist</span><input value={f.artist} onChange={set('artist')} placeholder={single ? UNKNOWN : 'Keep current'} /></label>
        <label className="field"><span>Album</span><input value={f.album} onChange={set('album')} placeholder={single ? 'No album' : 'Keep current'} /></label>
        {single && <label className="field"><span>Track number</span><input type="number" min="0" value={f.trackNo} onChange={set('trackNo')} /></label>}
        <p className="muted small">Songs are grouped into an artist or album once two or more share the same artist (and album).</p>
        <div className="row end"><button type="button" className="btn ghost" onClick={lib.closeEdit}>Cancel</button><button className="btn">Save</button></div>
      </form>
    </div>
  );
}

export default function EditDialog() {
  const { editing } = useLibrary();
  return editing ? <Dialog key={editing.ids.join(',')} ed={editing} /> : null;
}
