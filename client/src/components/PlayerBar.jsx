import React from 'react';
import { usePlayer } from '../store/player.jsx';
import { Cover, Icon, IconButton, fmtTime } from './ui.jsx';

const pct = (v, max) => `${max ? Math.min(100, (v / max) * 100) : 0}%`;

export default function PlayerBar({ panel, setPanel, onFull, full }) {
  const p = usePlayer();
  const { current } = p;
  const dur = p.duration || current?.duration || 0;
  const toggleTab = (tab) => setPanel(panel.open && panel.tab === tab ? { ...panel, open: false } : { open: true, tab });

  return (
    <footer className="playerbar" aria-label="Player">
      <div className="pb-track">
        {current && (
          <>
            <Cover src={current.cover} seed={current.albumKey || current.id} label={current.title} className="thumb lg" />
            <div className="t-text">
              <span className="t-title">{current.title}</span>
              <span className="t-artist">{current.artist}</span>
            </div>
          </>
        )}
      </div>

      <div className="pb-center">
        <div className="controls">
          <IconButton icon="shuffle" label="Shuffle" active={p.shuffle} onClick={p.toggleShuffle} />
          <IconButton icon="prev" size={24} label="Previous" onClick={p.prev} disabled={!current} />
          <button className="play-btn" aria-label={p.playing ? 'Pause' : 'Play'} onClick={p.toggle} disabled={!current}>
            {p.loading && !p.playing ? <span className="spinner dark" /> : <Icon name={p.playing ? 'pause' : 'play'} size={22} />}
          </button>
          <IconButton icon="next" size={24} label="Next" onClick={p.next} disabled={!current} />
          <button className={`icon-btn ${p.repeat !== 'off' ? 'on' : ''}`} aria-label={`Repeat: ${p.repeat}`} title={`Repeat: ${p.repeat}`} onClick={p.cycleRepeat}>
            <Icon name="repeat" />{p.repeat === 'one' && <sup className="one">1</sup>}
          </button>
        </div>
        <div className="seek">
          <span className="time">{fmtTime(p.time)}</span>
          <input type="range" min="0" max={dur || 1} step="0.1" value={Math.min(p.time, dur || 1)} disabled={!current}
            aria-label="Seek" onChange={(e) => p.seek(Number(e.target.value))} style={{ '--p': pct(p.time, dur) }} />
          <span className="time">{fmtTime(dur)}</span>
        </div>
      </div>

      <div className="pb-right">
        <IconButton icon="eq" label="Equalizer" active={panel.open && panel.tab === 'eq'} onClick={() => toggleTab('eq')} />
        <IconButton icon="queue" label="Queue" active={panel.open && panel.tab === 'queue'} onClick={() => toggleTab('queue')} />
        <IconButton icon="panel" label="Now playing" active={panel.open && panel.tab === 'now'} onClick={() => toggleTab('now')} />
        <IconButton icon={p.muted || p.volume === 0 ? 'mute' : 'volume'} label={p.muted ? 'Unmute' : 'Mute'} onClick={p.toggleMute} />
        <input className="vol" type="range" min="0" max="1" step="0.01" value={p.muted ? 0 : p.volume} aria-label="Volume"
          onChange={(e) => p.setVolume(Number(e.target.value))} style={{ '--p': pct(p.muted ? 0 : p.volume, 1) }} />
        <IconButton icon={full ? 'shrink' : 'expand'} label={full ? 'Exit full screen' : 'Full screen'} onClick={onFull} disabled={!current && !full} />
      </div>
    </footer>
  );
}
