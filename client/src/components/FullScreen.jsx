// Full-screen "now playing". Views: Cover · Visualizer · Verse (lyrics only) · Duet (cover + lyrics).
// Verse and Duet use a colourful "aurora" backdrop made from the cover's colours. After 5 quiet seconds the chrome hides.
import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/player.jsx';
import Visualizer from './Visualizer.jsx';
import { BeatGlow, useBeat } from './BeatGlow.jsx';
import { LyricsPanel, VideoSurface } from './Panels.jsx';
import { Cover, Icon, IconButton } from './ui.jsx';

const IDLE_MS = 5000;
const VIEWS = [
  ['cover', 'album', 'Cover'],
  ['viz', 'eq', 'Visualizer'],
  ['verse', 'lyrics', 'Verse — lyrics only'],
  ['duet', 'duet', 'Duet — cover & lyrics'],
];
const VIEW_KEY = 'rune.fsView';

export default function FullScreen({ onClose, winFull = false, onToggleWindow }) {
  const { current, label } = usePlayer();
  const [view, setView] = useState(() => { const v = localStorage.getItem(VIEW_KEY); return VIEWS.some((x) => x[0] === v) ? v : 'cover'; });
  const [immersive, setImmersive] = useState(false);
  const body = useRef(null);
  useBeat(body);
  const pick = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };
  const aurora = view === 'verse' || view === 'duet';
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

  const art = current && (current.kind === 'video'
    ? <VideoSurface className="fs-video" />
    : <Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="fs-cover" />);

  return (
    <section className={`fs ${aurora ? 'aurora' : ''} ${immersive ? 'immersive' : ''}`} role="dialog" aria-label="Full screen player">
      {aurora && <div className="fs-aurora" aria-hidden="true"><i /><i /><i /><i /></div>}
      <header className="fs-head">
        <h2>{label || 'Now playing'}</h2>
        <div className="fs-actions">
          {VIEWS.map(([key, icon, title]) => <IconButton key={key} icon={icon} label={title} active={view === key} onClick={() => pick(key)} />)}
          <span className="fs-sep" />
          {onToggleWindow && <IconButton icon={winFull ? 'shrink' : 'expand'} label={winFull ? 'Leave window full screen' : 'Full screen window'} onClick={onToggleWindow} />}
          <IconButton icon="collapseArrow" label="Close expanded view" onClick={onClose} />
        </div>
      </header>
      <div className="fs-body" ref={body}>
        {!current ? (
          <div className="panel-empty"><Icon name="music" size={48} /><p>Nothing is playing.</p></div>
        ) : view === 'verse' ? (
          <div className="fs-verse"><LyricsPanel variant="fs" /></div>
        ) : view === 'duet' ? (
          <div className="fs-duet">
            <div className="fs-duet-art">
              {art}
              <div className="fs-duet-meta"><strong>{current.title}</strong><span>{current.artist}</span></div>
            </div>
            <div className="fs-duet-lyrics"><LyricsPanel variant="fs" /></div>
          </div>
        ) : view === 'cover' ? (
          <>
            <BeatGlow />
            {art}
          </>
        ) : (
          <div className="fs-viz"><Visualizer height={260} bars={56} /><h3>{current.title}</h3><p className="muted">{current.artist}</p></div>
        )}
      </div>
      {current && (
        <div className="fs-meta" aria-hidden={!immersive || aurora}>
          <strong>{current.title}</strong>
          <span>{current.artist}</span>
        </div>
      )}
    </section>
  );
}
