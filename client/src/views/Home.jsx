import React, { useMemo } from 'react';
import { useLibrary } from '../store/library.jsx';
import { rankByStats } from '../util.js';
import { AlbumCard, Icon, PlaylistTile, Status, TrackList } from '../components/ui.jsx';
import { usePlayer } from '../store/player.jsx';

const plays = (tracks, stats) => tracks.reduce((n, t) => n + (stats[t.id]?.plays || 0), 0);

export default function Home() {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const { stats } = lib;
  const name = lib.profile.name;

  const topPlaylists = useMemo(() => lib.playlists
    .map((p) => ({ p, score: plays(p.tracks, stats) }))
    .sort((a, b) => b.score - a.score || b.p.updatedAt - a.p.updatedAt)
    .slice(0, 6).map((x) => x.p), [lib.playlists, stats]);

  const topAlbums = useMemo(() => lib.albums
    .map((a) => ({ a, score: plays(a.tracks, stats) }))
    .sort((x, y) => y.score - x.score || y.a.tracks.length - x.a.tracks.length)
    .slice(0, 5).map((x) => x.a), [lib.albums, stats]);

  const mostPlayed = useMemo(
    () => rankByStats(lib.tracks.filter((t) => stats[t.id]?.plays > 0), stats).slice(0, 10),
    [lib.tracks, stats]
  );

  return (
    <>
      <h1>{name ? `Welcome, ${name}` : 'Welcome'}</h1>
      {!name && <p className="muted tight">Add your name in <a href="#/profile">your profile</a> to personalise this page.</p>}

      {lib.ready && lib.tracks.length === 0 && (
        <section className="notice-card">
          <strong>Your library is empty.</strong> Add songs from your device and they’ll show up here — with cover art, artists and albums found automatically.
          <div className="row"><a className="btn" href="#/local"><Icon name="upload" size={16} /> Add songs</a></div>
        </section>
      )}

      <section>
        {topPlaylists.length > 0
          ? <div className="tiles">{topPlaylists.map((p) => <PlaylistTile key={p.id} playlist={p} />)}</div>
          : <p className="muted">Your top playlists appear here. <a href="#/library">Create a playlist</a> to get started.</p>}
      </section>

      <section>
        <h2>Top albums</h2>
        {topAlbums.length > 0
          ? <div className="hscroll">{topAlbums.map((a) => <AlbumCard key={a.key} album={a} />)}</div>
          : <p className="muted">Albums appear automatically when two or more of your songs share the same artist and album.</p>}
      </section>

      <section>
        <div className="section-head">
          <h2>Most played songs</h2>
          {mostPlayed.length > 0 && <button className="btn" onClick={() => playQueue(mostPlayed, 0, 'Most played')}><Icon name="play" size={16} /> Play all</button>}
        </div>
        {mostPlayed.length > 0
          ? <TrackList tracks={mostPlayed} label="Most played" />
          : <Status empty emptyText="Play some songs and your favourites will show up here." />}
      </section>
    </>
  );
}
