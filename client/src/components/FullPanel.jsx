// Full-screen version of a side-panel tab (Queue, Equalizer, Playback): whatever you expand is what fills the screen.
import React, { useEffect, useRef } from 'react';
import { Equalizer, PlaybackPanel, Queue } from './Panels.jsx';
import { IconButton } from './ui.jsx';

const TITLES = { queue: 'Queue', eq: 'Equalizer', play: 'Playback' };

export default function FullPanel({ section, onClose, winFull = false, onToggleWindow }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <section className="fs fs-panel" role="dialog" aria-label={`${TITLES[section]} — full screen`}>
      <header className="fs-head">
        <h2>{TITLES[section]}</h2>
        <div className="fs-actions">
          {onToggleWindow && <IconButton icon={winFull ? 'shrink' : 'expand'} label={winFull ? 'Leave window full screen' : 'Full screen window'} onClick={onToggleWindow} />}
          <IconButton icon="collapseArrow" label="Close expanded view" onClick={onClose} />
        </div>
      </header>
      <div className="fs-panel-body">
        <div className={`fs-panel-inner ${section}`}>
          {section === 'queue' && <Queue />}
          {section === 'eq' && <Equalizer />}
          {section === 'play' && <PlaybackPanel />}
        </div>
      </div>
    </section>
  );
}
