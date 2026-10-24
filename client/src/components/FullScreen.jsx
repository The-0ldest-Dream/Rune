// Full-screen "now playing" view: big cover (or visualizer) above the regular player bar.
import React, { useEffect, useState } from 'react';
import { usePlayer } from '../store/player.jsx';
import Visualizer from './Visualizer.jsx';
import { Cover, Icon, IconButton } from './ui.jsx';

export default function FullScreen({ onClose }) {
  const { current, label } = usePlayer();
  const [view, setView] = useState('cover');

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <section className="fs" role="dialog" aria-label="Full screen player">
      <header className="fs-head">
        <h2>{label || 'Now playing'}</h2>
        <div className="fs-actions">
          <IconButton icon="album" label="Show cover" active={view === 'cover'} onClick={() => setView('cover')} />
          <IconButton icon="eq" label="Show visualizer" active={view === 'viz'} onClick={() => setView('viz')} />
          <span className="fs-sep" />
          <IconButton icon="shrink" label="Exit full screen" onClick={onClose} />
        </div>
      </header>
      <div className="fs-body">
        {!current ? (
          <div className="panel-empty"><Icon name="music" size={48} /><p>Nothing is playing.</p></div>
        ) : view === 'cover' ? (
          <Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="fs-cover" />
        ) : (
          <div className="fs-viz"><Visualizer height={260} bars={56} /><h3>{current.title}</h3><p className="muted">{current.artist}</p></div>
        )}
      </div>
    </section>
  );
}
