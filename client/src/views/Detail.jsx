// Album and artist pages.
import React, { useMemo } from 'react';
import { coverUrl, STATIC, toTrack, useApi } from '../api.js';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { AlbumCard, Cover, Icon, Status, TrackList } from '../components/ui.jsx';

export function AlbumPage({ id }) {
  const { data, loading, error, reload } = useApi(`/albums/${id}`);
  const { playQueue, toggleShuffle, shuffle } = usePlayer();
  const lib = useLibrary();
  const tracks = useMemo(() => (data ? data.tracks.map(toTrack) : []), [data]);
  if (!data) return <Status loading={loading} error={error} onRetry={reload} />;
  const missing = tracks.filter((t) => !lib.isStored(t.id));

  return (
    <>
      <header className="hero">
        <Cover src={coverUrl(data.id)} seed={data.id} label={data.title} className="hero-cover" />
        <div>
          <span className="muted">Album</span>
          <h1>{data.title}</h1>
          <p className="muted"><a href={`#/artist/${data.artist_id}`}>{data.artist}</a>{data.year ? ` · ${data.year}` : ''} · {tracks.length} tracks</p>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" aria-label="Play album" onClick={() => playQueue(tracks)}><Icon name="play" size={28} /></button>
        <button className={`btn ghost ${shuffle ? 'on' : ''}`} onClick={() => { if (!shuffle) toggleShuffle(); playQueue(tracks, Math.floor(Math.random() * tracks.length)); }}>
          <Icon name="shuffle" size={16} /> Shuffle play
        </button>
        {missing.length > 0 && lib.online && !STATIC && (
          <button className="btn ghost" onClick={() => missing.forEach((t) => lib.saveOffline(t))}>
            <Icon name="download" size={16} /> Save album offline
          </button>
        )}
      </div>
      <TrackList tracks={tracks} showAlbum={false} />
    </>
  );
}

export function ArtistPage({ id }) {
  const { data, loading, error, reload } = useApi(`/artists/${id}`);
  const { playQueue } = usePlayer();
  const tracks = useMemo(() => (data ? data.tracks.map(toTrack) : []), [data]);
  if (!data) return <Status loading={loading} error={error} onRetry={reload} />;

  return (
    <>
      <header className="hero">
        <Cover round seed={data.id} label={data.name} className="hero-cover" />
        <div>
          <span className="muted">Artist</span>
          <h1>{data.name}</h1>
          <p className="muted">{data.genre} · {data.albums.length} albums · {tracks.length} tracks</p>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" aria-label={`Play ${data.name}`} onClick={() => playQueue(tracks)}><Icon name="play" size={28} /></button>
      </div>
      <section>
        <h2>Popular tracks</h2>
        <TrackList tracks={tracks.slice(0, 10)} />
      </section>
      <section>
        <h2>Discography</h2>
        <div className="grid">{data.albums.map((a) => <AlbumCard key={a.id} album={{ ...a, artist: data.name }} />)}</div>
      </section>
    </>
  );
}
