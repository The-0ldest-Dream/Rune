// "Upload file" page: add music videos. They play in the normal player (video shows where the cover would).
import React, { useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { Cover, Eq, Icon, Status, fmtTime } from '../components/ui.jsx';

const mb = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

export default function VideosPage() {
  const lib = useLibrary();
  const { playQueue, current, playing } = usePlayer();
  const input = useRef(null);
  const [over, setOver] = useState(false);

  return (
    <>
      <div className="section-head">
        <h1>Upload file</h1>
        {lib.videoTracks.length > 0 && <button className="btn" onClick={() => playQueue(lib.videoTracks, 0, 'Music videos')}><Icon name="play" size={16} /> Play all</button>}
      </div>
      <p className="muted">Add music videos from your device. They’re stored in this browser and play in the same player as your songs — the picture appears where the cover would.</p>

      <div className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); lib.addVideos(e.dataTransfer.files); }}>
        <Icon name="video" size={32} />
        <p><strong>Drop music videos here</strong><br /><span className="muted">MP4 and WebM work in every browser. Files never leave your device.</span></p>
        <div className="row"><button className="btn" onClick={() => input.current.click()}>Choose videos</button></div>
        <input ref={input} type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => { lib.addVideos(e.target.files); e.target.value = ''; }} />
      </div>

      <h2>Music videos {lib.videos.length > 0 && <span className="muted">· {lib.videos.length}</span>}</h2>
      {lib.videoTracks.length === 0 ? <Status empty emptyText="No videos yet." /> : (
        <div className="grid wide">
          {lib.videoTracks.map((v, i) => {
            const meta = lib.videos.find((x) => x.id === v.id);
            const isCur = current?.id === v.id;
            return (
              <div key={v.id} className={`card video-card ${isCur ? 'current' : ''}`}>
                <button className="video-thumb" onClick={() => playQueue(lib.videoTracks, i, 'Music videos')} aria-label={`Play ${v.title}`}>
                  <Cover src={v.cover} seed={v.id} label={v.title} className="wide-cover" />
                  <span className="video-play">{isCur ? <Eq active={playing} /> : <Icon name="play" size={28} />}</span>
                  {v.duration > 0 && <span className="video-dur">{fmtTime(v.duration)}</span>}
                </button>
                <strong title={v.title}>{v.title}</strong>
                <span className="muted">{mb(meta?.size || 0)}</span>
                <div className="row">
                  <button className="link-btn" onClick={() => { const t = prompt('Rename video', v.title); if (t) lib.renameVideo(v.id, t); }}>Rename</button>
                  <button className="link-btn danger" onClick={() => { if (confirm(`Remove “${v.title}”?`)) lib.removeVideo(v.id); }}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
