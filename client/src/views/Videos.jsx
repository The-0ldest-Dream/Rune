// "Upload file" tab: add and watch music videos stored on this device.
import React, { useEffect, useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { Cover, Icon, IconButton, Status, fmtTime } from '../components/ui.jsx';

const mb = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

function VideoModal({ video, onClose }) {
  const lib = useLibrary();
  const { pause } = usePlayer();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    pause(); // don't play a song and a video at the same time
    const blob = lib.videoBlob(video.id);
    if (!blob) { setFailed(true); return undefined; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => { URL.revokeObjectURL(u); window.removeEventListener('keydown', esc); };
  }, [video.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="video-modal" role="dialog" aria-modal="true" aria-label={video.title}>
        <div className="video-head"><h2>{video.title}</h2><IconButton icon="close" label="Close video" onClick={onClose} /></div>
        {failed ? <p className="status">This video is no longer stored on this device.</p>
          : url && <video src={url} controls autoPlay playsInline onError={() => setFailed(true)} />}
        {failed && url && <p className="muted">Your browser can’t play this format. MP4 (H.264) and WebM play everywhere; MKV and AVI usually don’t.</p>}
      </div>
    </div>
  );
}

export default function VideosPage({ openId }) {
  const lib = useLibrary();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const current = openId ? lib.videos.find((v) => v.id === openId) : null;

  return (
    <>
      <div className="section-head"><h1>Upload file</h1></div>
      <p className="muted">Add music videos from your device. They’re stored in this browser and can be watched offline.</p>

      <div className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); lib.addVideos(e.dataTransfer.files); }}>
        <Icon name="video" size={32} />
        <p><strong>Drop music videos here</strong><br /><span className="muted">MP4 and WebM work in every browser. Files never leave your device.</span></p>
        <div className="row"><button className="btn" onClick={() => input.current.click()}>Choose videos</button></div>
        <input ref={input} type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => { lib.addVideos(e.target.files); e.target.value = ''; }} />
      </div>

      <h2>Music videos {lib.videos.length > 0 && <span className="muted">· {lib.videos.length}</span>}</h2>
      {lib.videos.length === 0 ? <Status empty emptyText="No videos yet." /> : (
        <div className="grid wide">
          {lib.videos.map((v) => (
            <div key={v.id} className="card video-card">
              <a href={`#/videos/${v.id}`} className="video-thumb" aria-label={`Play ${v.title}`}>
                <Cover src={v.poster} seed={v.id} label={v.title} className="wide-cover" />
                <span className="video-play"><Icon name="play" size={28} /></span>
                {v.duration > 0 && <span className="video-dur">{fmtTime(v.duration)}</span>}
              </a>
              <strong title={v.title}>{v.title}</strong>
              <span className="muted">{mb(v.size)}</span>
              <div className="row">
                <button className="link-btn" onClick={() => { const t = prompt('Rename video', v.title); if (t) lib.renameVideo(v.id, t); }}>Rename</button>
                <button className="link-btn danger" onClick={() => { if (confirm(`Remove “${v.title}”?`)) lib.removeVideo(v.id); }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {openId && current && <VideoModal video={current} onClose={() => { location.hash = '#/videos'; }} />}
    </>
  );
}
