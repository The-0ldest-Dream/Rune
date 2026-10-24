// Edit song info (one or many songs) and covers. Also exports CoverPicker, used on artist/album/playlist pages.
import React, { useEffect, useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { UNKNOWN } from '../util.js';
import { Cover, Icon, IconButton } from './ui.jsx';

export function CoverPicker({ kind, id, label = 'Change cover' }) {
  const lib = useLibrary();
  const input = useRef(null);
  return (
    <>
      <button className="btn ghost" onClick={() => input.current.click()}><Icon name="image" size={16} /> {label}</button>
      {lib.hasCover(kind, id) && <button className="btn ghost" onClick={() => lib.clearCover(kind, id)}>Remove custom cover</button>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) lib.setCover(kind, id, f); }} />
    </>
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
            <Cover src={single.cover} seed={single.albumKey || single.id} label={single.title} className="thumb xxl" />
            <div className="row"><CoverPicker kind="song" id={single.id} /></div>
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
