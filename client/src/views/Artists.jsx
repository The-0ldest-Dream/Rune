import React, { useMemo, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { ArtistCard, Status } from '../components/ui.jsx';

export default function ArtistsPage() {
  const lib = useLibrary();
  const [q, setQ] = useState('');
  const list = useMemo(() => lib.artists.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())), [lib.artists, q]);
  return (
    <>
      <div className="section-head">
        <h1>Artists</h1>
        {lib.artists.length > 0 && <input className="filter-input" type="search" placeholder="Filter artists" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter artists" />}
      </div>
      <p className="muted">An artist appears here once two or more of your songs share the same artist name. Open an artist to see their albums.</p>
      {list.length > 0 ? <div className="grid">{list.map((a) => <ArtistCard key={a.key} artist={a} />)}</div>
        : <Status empty emptyText={lib.artists.length ? 'No artists match your filter.' : 'No artists yet. Add songs in Device files — songs tagged “Unknown artist” can be fixed with Edit info.'} />}
    </>
  );
}
