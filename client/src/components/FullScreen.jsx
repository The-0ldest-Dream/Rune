// Full-screen "now playing": cover on a backdrop tinted from the cover, with the normal controls below.
// After 5 seconds without interaction it switches to an immersive view (cover + title only); any input brings the controls back.
import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/player.jsx';
import Visualizer from './Visualizer.jsx';
import { VideoSurface } from './Panels.jsx';
import { Cover, Icon, IconButton } from './ui.jsx';

const IDLE_MS = 5000;

export default function FullScreen({ onClose }) {
  const { current, label } = usePlayer();
  const [view, setView] = useState('cover');
  const [immersive, setImmersive] = useState(false);
  // Keep the latest onClose in a ref: the parent re-renders many times a second while music plays, and an effect that
  // depended on a fresh callback every time would restart the 5-second timer on each render, so it never fired.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let timer, last = { x: -99, y: -99 };
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => setImmersive(true), IDLE_MS); };
    const wake = () => { setImmersive(false); arm(); };
    const move = (e) => { if (Math.hypot(e.clientX - last.x, e.clientY - last.y) > 4) { last = { x: e.clientX, y: e.clientY }; wake(); } };
    const esc = (e) => { if (e.key === 'Escape') closeRef.current(); else wake(); };
    arm();
    window.addEventListener('mousemove', move);
    window.addEventListener('keydown', esc);
    for (const ev of ['pointerdown', 'touchstart', 'wheel']) window.addEventListener(ev, wake, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('keydown', esc);
      for (const ev of ['pointerdown', 'touchstart', 'wheel']) window.removeEventListener(ev, wake);
    };
  }, []);

  return (
    <section className={`fs ${immersive ? 'immersive' : ''}`} role="dialog" aria-label="Full screen player">
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
        ) : view === 'cover' && current.kind === 'video' ? (
          <VideoSurface className="fs-video" />
        ) : view === 'cover' ? (
          <Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="fs-cover" />
        ) : (
          <div className="fs-viz"><Visualizer height={260} bars={56} /><h3>{current.title}</h3><p className="muted">{current.artist}</p></div>
        )}
      </div>
      {current && (
        <div className="fs-meta" aria-hidden={!immersive}>
          <strong>{current.title}</strong>
          <span>{current.artist}</span>
        </div>
      )}
    </section>
  );
}
