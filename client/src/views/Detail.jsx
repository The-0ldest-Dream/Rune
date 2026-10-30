// Artist and album pages. Albums are reached through their artist.
import React from 'react';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { KindCover } from '../components/EditDialog.jsx';
import { AlbumCard, Icon, Status, TrackList, artistHref } from '../components/ui.jsx';

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function ArtistPage({ id }) {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const a = lib.artistByKey.get(id);
  if (!a) return <Status empty emptyText={lib.ready ? 'This artist isn’t in your library (artists need two or more songs).' : 'Loading…'} />;
  const ids = a.tracks.map((t) => t.id);
  return (
    <>
      <header className="hero">
        <KindCover kind="artist" id={a.key} src={a.cover} label={a.name} round className="hero-cover" candidates={a.tracks} cropTitle="Adjust artist photo" />
        <div>
          <span className="muted">Artist</span>
          <h1>{a.name}</h1>
          <p className="muted">{count(a.albums.length, 'album', 'albums')} · {count(a.tracks.length, 'song', 'songs')}</p>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" aria-label={`Play ${a.name}`} onClick={() => playQueue(a.tracks, 0, a.name)}><Icon name="play" size={28} /></button>
        <button className="btn ghost" onClick={() => lib.openEdit(ids, { renameArtist: a.name })}><Icon name="edit" size={16} /> Rename artist</button>
      </div>
      {a.albums.length > 0 && <section><h2>Albums</h2><div className="grid">{a.albums.map((al) => <AlbumCard key={al.key} album={al} />)}</div></section>}
      <section><h2>Songs</h2><TrackList tracks={a.tracks} label={a.name} /></section>
    </>
  );
}

export function AlbumPage({ id }) {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const al = lib.albumByKey.get(id);
  if (!al) return <Status empty emptyText={lib.ready ? 'This album isn’t in your library (albums need two or more songs).' : 'Loading…'} />;
  const ids = al.tracks.map((t) => t.id);
  return (
    <>
      <header className="hero">
        <KindCover kind="album" id={al.key} src={al.cover} label={al.title} className="hero-cover" candidates={al.tracks} />
        <div>
          <span className="muted">Album</span>
          <h1>{al.title}</h1>
          <p className="muted">
            {lib.artistByKey.has(al.artistKey) ? <a href={artistHref(al.artistKey)}>{al.artist}</a> : al.artist} · {count(al.tracks.length, 'song', 'songs')}
          </p>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" aria-label="Play album" onClick={() => playQueue(al.tracks, 0, al.title)}><Icon name="play" size={28} /></button>
        <button className="btn ghost" onClick={() => lib.openEdit(ids, { album: al.title })}><Icon name="edit" size={16} /> Rename album</button>
      </div>
      <TrackList tracks={al.tracks} showAlbum={false} label={al.title} />
    </>
  );
}
