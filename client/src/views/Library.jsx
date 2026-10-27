// Playlists and the device song library.
import React, { useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { KindCover } from '../components/EditDialog.jsx';
import { Cover, Icon, Status, TrackList } from '../components/ui.jsx';

export function PlaylistsPage() {
  const lib = useLibrary();
  return (
    <>
      <div className="section-head">
        <h1>Your playlists</h1>
        <button className="btn" onClick={() => { location.hash = `#/playlist/${lib.createPlaylist(`Playlist ${lib.playlists.filter((x) => !x.system).length + 1}`).id}`; }}>
          <Icon name="plus" size={16} /> New playlist
        </button>
      </div>
      <p className="muted">Playlists are stored in this browser and work offline. Clearing your browser data removes them.</p>
      {lib.playlists.length === 0
        ? <Status empty emptyText="No playlists yet. Create one, or use “Add to playlist” on any song." />
        : (
          <div className="grid">
            {lib.playlists.map((p) => (
              <a key={p.id} className="card" href={`#/playlist/${p.id}`}>
                <Cover src={p.cover} seed={p.id} label={p.name} />
                <strong>{p.name}</strong>
                <span className="muted">{p.tracks.length} {p.tracks.length === 1 ? 'song' : 'songs'}</span>
              </a>
            ))}
          </div>
        )}
    </>
  );
}

export function PlaylistPage({ id }) {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const p = lib.playlists.find((x) => x.id === id);
  const [name, setName] = useState(null);
  if (!p) return <Status empty emptyText={lib.ready ? 'This playlist doesn’t exist on this device.' : 'Loading…'} />;

  const commit = () => { if (name !== null) lib.renamePlaylist(p.id, name); setName(null); };
  return (
    <>
      <header className="hero">
        <KindCover kind="playlist" id={p.id} src={p.cover} label={p.name} className="hero-cover" candidates={p.tracks} />
        <div>
          <span className="muted">Playlist</span>
          <input className="title-input" value={name ?? p.name} aria-label="Playlist name" readOnly={p.system}
            onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <p className="muted">{p.tracks.length} songs</p>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" aria-label="Play playlist" disabled={!p.tracks.length} onClick={() => playQueue(p.tracks, 0, p.name)}><Icon name="play" size={28} /></button>
        {!p.system && (
          <button className="btn ghost danger" onClick={() => { if (confirm(`Delete “${p.name}”?`)) { lib.deletePlaylist(p.id); location.hash = '#/library'; } }}>
            <Icon name="trash" size={16} /> Delete playlist
          </button>
        )}
      </div>
      <TrackList tracks={p.tracks} label={p.name} onRemove={(i) => lib.removeFromPlaylist(p.id, i)} removeLabel="Remove from playlist"
        emptyText={p.system ? 'No liked songs yet. Tap the heart next to a song’s name to save it here.' : 'This playlist is empty. Add songs from any song’s ⋯ menu.'} />
    </>
  );
}

export function LocalPage() {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const fileInput = useRef(null);
  const dirInput = useRef(null);
  const [over, setOver] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const unknown = lib.tracks.filter((t) => !t.artistKey);
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const stop = () => { setSelecting(false); setSelected(new Set()); };
  const ids = [...selected];

  return (
    <>
      <div className="section-head">
        <h1>Device files</h1>
        <div className="row">
          <a className="icon-btn mobile-only" href="#/videos" aria-label="Upload music videos" title="Upload music videos"><Icon name="video" size={22} /></a>
          {lib.tracks.length > 0 && !selecting && <button className="btn ghost" onClick={() => setSelecting(true)}>Select</button>}
          {lib.tracks.length > 0 && !selecting && <button className="btn" onClick={() => playQueue(lib.tracks, 0, 'Device files')}><Icon name="play" size={16} /> Play all</button>}
        </div>
      </div>

      <div className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); lib.addFiles(e.dataTransfer.files); }}>
        <Icon name="upload" size={32} />
        <p><strong>Drop songs here</strong><br /><span className="muted">MP3, FLAC, OGG, M4A, WAV, OPUS. Cover art, artist and album are read from the file. Stored in your browser — files never leave your device.</span></p>
        <div className="row">
          <button className="btn" onClick={() => fileInput.current.click()}>Choose files</button>
          <button className="btn ghost" onClick={() => dirInput.current.click()}>Choose folder</button>
        </div>
        <input ref={fileInput} type="file" accept="audio/*,.flac,.opus,.m4a" multiple hidden onChange={(e) => { lib.addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={dirInput} type="file" webkitdirectory="" directory="" multiple hidden onChange={(e) => { lib.addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {unknown.length > 0 && !selecting && (
        <div className="notice-card">
          <strong>{unknown.length} {unknown.length === 1 ? 'song has' : 'songs have'} no artist info.</strong> Give them an artist and album so they group together.
          <div className="row"><button className="btn" onClick={() => { setSelecting(true); setSelected(new Set(unknown.map((t) => t.id))); }}>Select &amp; edit</button></div>
        </div>
      )}

      {selecting && (
        <div className="selbar" role="toolbar" aria-label="Selection">
          <strong>{ids.length} selected</strong>
          <button className="btn ghost" onClick={() => setSelected(new Set(lib.tracks.map((t) => t.id)))}>Select all</button>
          <button className="btn" disabled={!ids.length} onClick={() => { lib.openEdit(ids); stop(); }}><Icon name="edit" size={16} /> Edit info</button>
          <button className="btn ghost danger" disabled={!ids.length}
            onClick={() => { if (confirm(`Remove ${ids.length} song(s) from your library?`)) { ids.forEach((id) => lib.removeFile(id)); stop(); } }}>
            <Icon name="trash" size={16} /> Remove
          </button>
          <button className="btn ghost" onClick={stop}>Done</button>
        </div>
      )}

      <TrackList tracks={lib.tracks} label="Device files" selectable={selecting} selected={selected} onToggle={toggle}
        onRemove={(i) => lib.removeFile(lib.tracks[i].id)} removeLabel="Remove from library" emptyText="No songs yet — add some above." />
    </>
  );
}
