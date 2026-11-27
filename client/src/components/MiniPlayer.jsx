// Mini player in its own small window (Picture-in-Picture window where supported, otherwise a pop-up): cover, previous, play/pause, next, like.
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayer } from '../store/player.jsx';
import { Cover, Icon, IconButton, LikeButton } from './ui.jsx';

function MiniPlayer() {
  const { current, playing, toggle, next, prev } = usePlayer();
  if (!current) return <div className="mini mini-empty"><Icon name="music" size={36} /><p>Nothing is playing</p></div>;
  return (
    <div className="mini">
      {current.cover && <div className="mini-bg" aria-hidden="true" style={{ backgroundImage: `url("${current.cover}")` }} />}
      <div className="mini-art"><Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="mini-cover" /></div>
      <div className="mini-info"><strong title={current.title}>{current.title}</strong><span>{current.artist}</span></div>
      <div className="mini-controls">
        <IconButton icon="prev" size={26} label="Previous" onClick={prev} />
        <button className="play-btn big" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}><Icon name={playing ? 'pause' : 'play'} size={26} /></button>
        <IconButton icon="next" size={26} label="Next" onClick={next} />
        <LikeButton track={current} size={24} />
      </div>
    </div>
  );
}

/** Opens / closes the mini player window. Returns the window (or null) and the portal to render. */
export function useMiniPlayer(toast) {
  const [win, setWin] = useState(null);
  const supported = typeof window !== 'undefined';

  const close = useCallback(() => { try { win?.close(); } catch { /* already closed */ } setWin(null); }, [win]);
  const open = useCallback(async () => {
    if (win && !win.closed) { win.focus?.(); return; }
    let w = null;
    try { if (window.documentPictureInPicture) w = await window.documentPictureInPicture.requestWindow({ width: 300, height: 420 }); } catch { /* fall back to a pop-up */ }
    if (!w) w = window.open('', 'rune-mini', 'popup=yes,width=320,height=450');
    if (!w) { toast?.('Your browser blocked the mini player window. Allow pop-ups for this site.', 'error'); return; }
    const doc = w.document;
    doc.title = 'Rune';
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
      const copy = node.cloneNode(true);
      if (copy.tagName === 'LINK') copy.href = node.href;                    // absolute, so it resolves inside the new window
      doc.head.appendChild(copy);
    }
    doc.documentElement.style.cssText = document.documentElement.style.cssText;   // theme colours
    doc.documentElement.dataset.fx = document.documentElement.dataset.fx || '';
    doc.body.className = 'mini-body';
    w.addEventListener('pagehide', () => setWin(null));
    setWin(w);
  }, [win, toast]);

  useEffect(() => {
    const bye = () => { try { win?.close(); } catch { /* ignore */ } };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [win]);

  const portal = win && !win.closed ? createPortal(<MiniPlayer />, win.document.body) : null;
  return { open, close, isOpen: !!win, portal, supported };
}
