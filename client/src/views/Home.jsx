import React from 'react';
import { toTrack, useApi } from '../api.js';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { AlbumCard, Icon, Status, TrackList } from '../components/ui.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default function Home() {
  const { online, localTracks, playlists } = useLibrary();
  const { playQueue } = usePlayer();
  const genres = useApi('/genres');
  const albums = useApi('/albums?sort=random&limit=12');
  const picks = useApi('/tracks?sort=random&limit=10');

  return (
    <>
      <h1>{greeting()}</h1>

      {!online && (
        <section className="notice-card">
          <strong>You’re offline.</strong> Play your device files{playlists.length ? ' or open a playlist' : ''} — online browsing returns when you reconnect.
          <div className="row">
            <a className="btn" href="#/local">Device files{localTracks.length ? ` (${localTracks.length})` : ''}</a>
            <a className="btn ghost" href="#/library">Playlists</a>
          </div>
        </section>
      )}

      {genres.data && (
        <section>
          <h2>Browse by genre</h2>
          <div className="chips">
            {genres.data.filter((g) => g.name).map((g) => <a key={g.name} className="chip" href={`#/genre/${encodeURIComponent(g.name)}`}>{g.name}</a>)}
          </div>
        </section>
      )}

      <section>
        <h2>Albums to explore</h2>
        <Status loading={albums.loading} error={albums.error} onRetry={albums.reload} />
        {albums.data && <div className="grid">{albums.data.items.map((a) => <AlbumCard key={a.id} album={a} />)}</div>}
      </section>

      <section>
        <div className="section-head">
          <h2>Fresh picks</h2>
          {picks.data && <button className="btn" onClick={() => playQueue(picks.data.items.map(toTrack))}><Icon name="play" size={16} /> Play all</button>}
        </div>
        <Status loading={picks.loading} error={picks.error} onRetry={picks.reload} />
        {picks.data && <TrackList tracks={picks.data.items.map(toTrack)} />}
      </section>
    </>
  );
}
