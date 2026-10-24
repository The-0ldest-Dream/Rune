// Full catalogue browsers for albums and artists, with filter + "show more".
import React, { useEffect, useState } from 'react';
import { qs, usePaged } from '../api.js';
import { AlbumCard, ArtistCard, Status } from '../components/ui.jsx';

export default function Browse({ kind }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(text), 250); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setText(''); setQ(''); }, [kind]);

  const list = usePaged(`/${kind}?${qs({ q })}`, 48);
  const Card = kind === 'albums' ? AlbumCard : ArtistCard;
  const prop = kind === 'albums' ? 'album' : 'artist';

  return (
    <>
      <div className="section-head">
        <h1>{kind === 'albums' ? 'Albums' : 'Artists'}</h1>
        <input className="filter-input" type="search" placeholder={`Filter ${kind}`} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Filter ${kind}`} />
      </div>
      {list.total > 0 && <p className="muted">{list.total.toLocaleString()} {kind}</p>}
      <div className="grid">{list.items.map((x) => <Card key={x.id} {...{ [prop]: x }} />)}</div>
      <Status loading={list.loading} error={list.error} onRetry={list.reload} empty={!list.loading && !list.error && !list.items.length} emptyText={`No ${kind} match “${q}”.`} />
      {list.hasMore && !list.loading && <button className="btn ghost center" onClick={list.more}>Show more</button>}
    </>
  );
}
