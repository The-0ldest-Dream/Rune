import React, { useMemo } from 'react';
import { useLibrary } from '../store/library.jsx';
import { matches } from '../components/SearchBox.jsx';
import { ArtistCard, Cover, Status, TrackList } from '../components/ui.jsx';
import { fmtTime } from '../components/ui.jsx';

export default function Search({ q }) {
  const lib = useLibrary();
  const needle = q.trim().toLowerCase();

  const songs = useMemo(() => (needle ? lib.tracks.filter((t) => matches(t, needle)) : []), [lib.tracks, needle]);
  const artists = useMemo(() => (needle ? lib.artists.filter((a) => a.name.toLowerCase().includes(needle)) : []), [lib.artists, needle]);
  const playlists = useMemo(() => (needle ? lib.playlists.filter((p) => p.name.toLowerCase().includes(needle)) : []), [lib.playlists, needle]);
  const videos = useMemo(() => (needle ? lib.videos.filter((v) => v.title.toLowerCase().includes(needle)) : []), [lib.videos, needle]);

  if (!needle) {
    return (
      <>
        <h1>Search</h1>
        <p className="muted">Search your songs, artists, playlists and music videos. Everything is searched on this device, so it works offline.</p>
      </>
    );
  }
  const none = !songs.length && !artists.length && !playlists.length && !videos.length;

  return (
    <>
      <h1>Results for “{q.trim()}”</h1>
      {none && <Status empty emptyText="Nothing on this device matches your search." />}
      {artists.length > 0 && <section><h2>Artists</h2><div className="grid">{artists.map((a) => <ArtistCard key={a.key} artist={a} />)}</div></section>}
      {songs.length > 0 && <section><h2>Songs <span className="muted">· {songs.length}</span></h2><TrackList tracks={songs} label="Search results" /></section>}
      {playlists.length > 0 && (
        <section><h2>Playlists</h2>
          <div className="grid">{playlists.map((p) => (
            <a key={p.id} className="card" href={`#/playlist/${p.id}`}><Cover src={p.cover} seed={p.id} label={p.name} /><strong>{p.name}</strong><span className="muted">{p.tracks.length} songs</span></a>
          ))}</div>
        </section>
      )}
      {videos.length > 0 && (
        <section><h2>Music videos</h2>
          <div className="grid">{videos.map((v) => (
            <a key={v.id} className="card" href={`#/videos/${v.id}`}><Cover src={v.poster} seed={v.id} label={v.title} /><strong>{v.title}</strong><span className="muted">{fmtTime(v.duration)}</span></a>
          ))}</div>
        </section>
      )}
    </>
  );
}
