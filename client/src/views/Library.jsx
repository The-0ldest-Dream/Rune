// Playlists, device files (offline) and saved-for-offline tracks.
import React, { useRef, useState } from 'react';
import { STATIC } from '../api.js';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { Cover, Icon, Status, TrackList } from '../components/ui.jsx';

export function PlaylistsPage({ openAuth }) {
  const lib = useLibrary();
  return (
    <>
      <div className="section-head">
        <h1>Your playlists</h1>
        <div className="row">
          {lib.user && <button className="btn ghost" onClick={lib.syncPlaylists} disabled={!lib.online}><Icon name="sync" size={16} /> Sync</button>}
          <button className="btn" onClick={() => { location.hash = `#/playlist/${lib.createPlaylist(`Playlist ${lib.playlists.length + 1}`).id}`; }}>
            <Icon name="plus" size={16} /> New playlist
          </button>
        </div>
      </div>
      <p className="muted">Playlists are stored in this browser and work offline.{' '}
        {STATIC ? 'Clearing your browser data will remove them.'
          : lib.user ? 'Use Sync to back them up to your account.' : <>Want a backup? <button className="link-btn" onClick={openAuth}>Sign in</button>.</>}
      </p>
      {lib.playlists.length === 0
        ? <Status empty emptyText="No playlists yet. Create one, or use “Add to playlist” on any track." />
        : (
          <div className="grid">
            {lib.playlists.map((p) => (
              <a key={p.id} className="card" href={`#/playlist/${p.id}`}>
                <Cover src={p.tracks[0]?.cover} seed={p.id} label={p.name} />
                <strong>{p.name}</strong>
                <span className="muted">{p.tracks.length} {p.tracks.length === 1 ? 'track' : 'tracks'}</span>
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
  if (!p) return <Status empty emptyText="This playlist doesn’t exist on this device." />;

  const commit = () => { if (name !== null) lib.renamePlaylist(p.id, name); setName(null); };
  return (
    <>
      <header className="hero">
        <Cover src={p.tracks[0]?.cover} seed={p.id} label={p.name} className="hero-cover" />
        <div>
          <span className="muted">Playlist</span>
          <input className="title-input" value={name ?? p.name} aria-label="Playlist name"
            onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <p className="muted">{p.tracks.length} tracks</p>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" aria-label="Play playlist" disabled={!p.tracks.length} onClick={() => playQueue(p.tracks)}><Icon name="play" size={28} /></button>
        <button className="btn ghost danger" onClick={() => { if (confirm(`Delete “${p.name}”?`)) { lib.deletePlaylist(p.id); location.hash = '#/library'; } }}>
          <Icon name="trash" size={16} /> Delete playlist
        </button>
      </div>
      <TrackList tracks={p.tracks} onRemove={(i) => lib.removeFromPlaylist(p.id, i)} emptyText="This playlist is empty. Add tracks from any track’s ⋯ menu." />
    </>
  );
}

export function LocalPage() {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const fileInput = useRef(null);
  const dirInput = useRef(null);
  const [over, setOver] = useState(false);

  const onDrop = (e) => { e.preventDefault(); setOver(false); lib.addFiles(e.dataTransfer.files); };
  return (
    <>
      <div className="section-head">
        <h1>Device files</h1>
        {lib.localTracks.length > 0 && <button className="btn" onClick={() => playQueue(lib.localTracks)}><Icon name="play" size={16} /> Play all</button>}
      </div>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      >
        <Icon name="upload" size={32} />
        <p><strong>Drop audio files here</strong><br /><span className="muted">MP3, FLAC, OGG, M4A, WAV, OPUS — stored in your browser and playable offline. Files never leave your device.</span></p>
        <div className="row">
          <button className="btn" onClick={() => fileInput.current.click()}>Choose files</button>
          <button className="btn ghost" onClick={() => dirInput.current.click()}>Choose folder</button>
        </div>
        <input ref={fileInput} type="file" accept="audio/*,.flac,.opus,.m4a" multiple hidden onChange={(e) => { lib.addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={dirInput} type="file" webkitdirectory="" directory="" multiple hidden onChange={(e) => { lib.addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      <TrackList tracks={lib.localTracks} onRemove={(i) => lib.removeFile(lib.localTracks[i].id)} emptyText="No device files yet." />

      <section>
        <div className="section-head"><h2>Saved for offline</h2></div>
        <p className="muted">Streamed tracks you saved with “Save for offline”.</p>
        <TrackList tracks={lib.savedTracks} emptyText="Nothing saved yet. Open a track’s ⋯ menu and choose “Save for offline”." />
      </section>
    </>
  );
}
