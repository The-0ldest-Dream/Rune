import React, { useEffect, useMemo, useState } from 'react';
import { qs, toTrack, useApi, usePaged } from '../api.js';
import { useLibrary } from '../store/library.jsx';
import { AlbumCard, ArtistCard, Status, TrackList } from '../components/ui.jsx';

export default function Search({ q, genre: genreProp = '' }) {
  const lib = useLibrary();
  const [genre, setGenre] = useState(genreProp);
  const [source, setSource] = useState('library');
  const [debounced, setDebounced] = useState(q);

  useEffect(() => setGenre(genreProp), [genreProp]);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);

  const genres = useApi(lib.online ? '/genres' : null);
  const active = lib.online && source === 'library' && (debounced || genre);
  const tracks = usePaged(active ? `/tracks?${qs({ q: debounced, genre })}` : null, 30);
  const artists = useApi(active && !genre ? `/artists?${qs({ q: debounced, limit: 6 })}` : null);
  const albums = useApi(active ? `/albums?${qs({ q: debounced, genre, limit: 6 })}` : null);
  const jamendo = useApi(lib.online && source === 'jamendo' ? `/jamendo/search?${qs({ q: debounced })}` : null);

  // Offline: search what is stored on this device and in playlists.
  const offlineHits = useMemo(() => {
    if (lib.online) return [];
    const needle = debounced.toLowerCase();
    const pool = new Map();
    [...lib.files, ...lib.playlists.flatMap((p) => p.tracks)].forEach((t) => pool.set(t.id, t));
    return Array.from(pool.values()).filter((t) =>
      !needle || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(needle));
  }, [lib.online, lib.files, lib.playlists, debounced]);

  const trackItems = useMemo(() => tracks.items.map(toTrack), [tracks.items]);

  return (
    <>
      <div className="filters">
        {lib.online && (
          <label className="field inline">
            <span>Genre</span>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} disabled={source !== 'library'}>
              <option value="">All genres</option>
              {(genres.data || []).filter((g) => g.name).map((g) => <option key={g.name}>{g.name}</option>)}
            </select>
          </label>
        )}
        {lib.online && lib.features.jamendo && (
          <div className="seg" role="group" aria-label="Source">
            <button className={source === 'library' ? 'on' : ''} onClick={() => setSource('library')}>Library</button>
            <button className={source === 'jamendo' ? 'on' : ''} onClick={() => setSource('jamendo')}>Jamendo</button>
          </div>
        )}
      </div>

      {!lib.online && (
        <>
          <h2>On this device {debounced && <span className="muted">· “{debounced}”</span>}</h2>
          <p className="muted">You’re offline, so results come from device files, saved tracks and your playlists.</p>
          <TrackList tracks={offlineHits} emptyText="Nothing on this device matches." />
        </>
      )}

      {lib.online && source === 'jamendo' && (
        <>
          <h2>Jamendo {debounced ? `· “${debounced}”` : '· trending this week'}</h2>
          <Status loading={jamendo.loading} error={jamendo.error} onRetry={jamendo.reload} />
          {jamendo.data && <TrackList tracks={jamendo.data.items} emptyText="No Jamendo tracks found." />}
        </>
      )}

      {lib.online && source === 'library' && !active && (
        <div className="status muted">Type in the search bar or pick a genre to start exploring.</div>
      )}

      {active && (
        <>
          {artists.data?.items.length > 0 && (
            <section><h2>Artists</h2><div className="grid">{artists.data.items.map((a) => <ArtistCard key={a.id} artist={a} />)}</div></section>
          )}
          {albums.data?.items.length > 0 && (
            <section><h2>Albums</h2><div className="grid">{albums.data.items.map((a) => <AlbumCard key={a.id} album={a} />)}</div></section>
          )}
          <section>
            <h2>Tracks {tracks.total > 0 && <span className="muted">· {tracks.total.toLocaleString()}</span>}</h2>
            <TrackList tracks={trackItems} emptyText={tracks.loading ? '' : 'No tracks match your search.'} />
            <Status loading={tracks.loading} error={tracks.error} onRetry={tracks.reload} />
            {tracks.hasMore && !tracks.loading && <button className="btn ghost center" onClick={tracks.more}>Show more</button>}
          </section>
        </>
      )}
    </>
  );
}
