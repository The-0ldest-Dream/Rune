// Interactive cover: "+" when empty; tap a cover for Remove / Change / Extract from a song. New images open a crop step.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cover, Icon, IconButton } from './ui.jsx';

const FRAME = 300; // crop viewport in CSS px

/** Drag to move, slider / wheel to zoom. Saves a square JPEG. */
export function CropDialog({ file, round, title = 'Adjust cover', out = 640, onSave, onCancel }) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [dims, setDims] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);

  const scale = dims ? (FRAME / Math.min(dims.w, dims.h)) * zoom : 1;
  const limit = (z, d = dims) => {
    if (!d) return { x: 0, y: 0 };
    const s = (FRAME / Math.min(d.w, d.h)) * z;
    return { x: Math.max(0, (d.w * s - FRAME) / 2), y: Math.max(0, (d.h * s - FRAME) / 2) };
  };
  const clamp = (o, z = zoom) => { const l = limit(z); return { x: Math.min(l.x, Math.max(-l.x, o.x)), y: Math.min(l.y, Math.max(-l.y, o.y)) }; };

  const changeZoom = (z) => { const nz = Math.min(4, Math.max(1, z)); setZoom(nz); setOff((o) => clamp(o, nz)); };
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; };
  const move = (e) => { if (drag.current) setOff(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y })); };
  const up = () => { drag.current = null; };

  const save = () => {
    setBusy(true);
    const k = out / FRAME, c = document.createElement('canvas');
    c.width = c.height = out;
    const w = dims.w * scale, h = dims.h * scale;
    c.getContext('2d').drawImage(imgRef.current, (FRAME / 2 - w / 2 + off.x) * k, (FRAME / 2 - h / 2 + off.y) * k, w * k, h * k);
    c.toBlob((b) => { setBusy(false); b ? onSave(b) : onCancel(); }, 'image/jpeg', 0.9);
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p className="muted small">Drag to reposition, use the slider to zoom.</p>
        <div className={`crop ${round ? 'round' : ''}`} style={{ width: FRAME, height: FRAME }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}>
          <img ref={imgRef} src={url} alt="" draggable={false}
            onLoad={(e) => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            style={dims ? { width: dims.w * scale, height: dims.h * scale, transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` } : { visibility: 'hidden' }} />
        </div>
        <label className="zoom-row"><Icon name="image" size={14} />
          <input type="range" min="1" max="4" step="0.01" value={zoom} aria-label="Zoom" onChange={(e) => changeZoom(Number(e.target.value))} style={{ '--p': `${((zoom - 1) / 3) * 100}%` }} />
          <Icon name="image" size={22} />
        </label>
        <div className="row end"><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button type="button" className="btn" onClick={save} disabled={!dims || busy}>Save cover</button></div>
      </div>
    </div>
  );
}

/** Lists songs that have embedded art so one can be used as the cover. */
function ExtractDialog({ candidates, onPick, onCancel }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Extract from a song">
        <IconButton icon="close" label="Close" className="modal-x" onClick={onCancel} />
        <h2>Extract from a song</h2>
        <p className="muted small">Use the cover art embedded in one of these songs.</p>
        <div className="pick-list">
          {candidates.map((t) => (
            <button type="button" key={t.id} className="dd-main" onClick={() => onPick(t)}>
              <Cover src={t.art} seed={t.id} label={t.title} className="thumb" />
              <span className="t-text"><span className="t-title">{t.title}</span><span className="t-artist">{t.artist}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * @param src        current cover URL (falsy → shows the "+" add state)
 * @param candidates songs (with `.art`) that can be extracted from
 * @param onSave(blob) / onRemove() / extract(song) → onExtract(song)
 */
export function CoverEditor({ src, label = '', seed = '', round = false, className = '', candidates = [], onSave, onRemove, onExtract, cropTitle }) {
  const [menu, setMenu] = useState(false);
  const [file, setFile] = useState(null);
  const [extract, setExtract] = useState(false);
  const input = useRef(null);
  const box = useRef(null);
  const withArt = candidates.filter((t) => t.art);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const pick = () => input.current.click();
  return (
    <div className={`cover-edit ${round ? 'is-round' : ''} ${className}`} ref={box}>
      {src ? (
        <button type="button" className="cover-zoom" onClick={() => setMenu(!menu)} aria-label={`Cover options for ${label}`} aria-expanded={menu}>
          <Cover src={src} seed={seed} label={label} round={round} />
        </button>
      ) : (
        <button type="button" className={`cover-add ${round ? 'round' : ''}`} onClick={pick} aria-label={`Add cover for ${label}`}>
          <span className="plus-circle"><Icon name="plus" size={30} /></span>
        </button>
      )}
      {menu && (
        <div className="menu cover-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onRemove(); }}>Remove cover</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); pick(); }}>Change cover</button>
          <button type="button" role="menuitem" disabled={!withArt.length} onClick={() => { setMenu(false); setExtract(true); }}>
            Extract from a song{withArt.length ? '' : ' (no art found)'}
          </button>
        </div>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) setFile(f); }} />
      {file && createPortal(<CropDialog file={file} round={round} title={cropTitle} onCancel={() => setFile(null)} onSave={(b) => { setFile(null); onSave(b); }} />, document.body)}
      {extract && createPortal(<ExtractDialog candidates={withArt} onCancel={() => setExtract(false)} onPick={(t) => { setExtract(false); onExtract(t); }} />, document.body)}
    </div>
  );
}
