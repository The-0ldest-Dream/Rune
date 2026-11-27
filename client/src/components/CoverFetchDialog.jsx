// "Find covers online" for the songs you selected.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLibrary } from '../store/library.jsx';
import { Icon, IconButton } from './ui.jsx';

export default function CoverFetchDialog({ ids, onClose }) {
  const lib = useLibrary();
  const [phase, setPhase] = useState('options');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: ids.length, rows: [] });
  const [summary, setSummary] = useState(null);
  const stop = useRef(false);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && phase !== 'running') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [phase, onClose]);

  const start = async () => {
    stop.current = false;
    setPhase('running');
    const res = await lib.findCoversOnline(ids, {
      onlyMissing, cancelled: () => stop.current,
      onProgress: (p) => setProgress((prev) => ({ done: p.done, total: p.total, rows: [...prev.rows.slice(-6), p] })),
    });
    setSummary(res);
    setPhase('done');
  };

  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && phase !== 'running' && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="cf-title">
        <IconButton icon="close" label="Close" className="modal-x" onClick={() => { stop.current = true; onClose(); }} />
        <h2 id="cf-title">Find covers online</h2>
        {phase === 'options' && (
          <>
            <p>Rune will look up cover art for <strong>{ids.length}</strong> {ids.length === 1 ? 'song' : 'songs'} in Apple’s iTunes catalogue and MusicBrainz / the Cover Art Archive, and save it on your device.</p>
            <label className="radio"><input type="radio" checked={onlyMissing} onChange={() => setOnlyMissing(true)} /> Only songs that have no cover</label>
            <label className="radio"><input type="radio" checked={!onlyMissing} onChange={() => setOnlyMissing(false)} /> Replace the cover of every selected song</label>
            <p className="muted small">This sends each song’s title and artist to those services. Songs of the same album reuse one lookup.</p>
            <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={start}>Start</button></div>
          </>
        )}
        {phase === 'running' && (
          <>
            <div className="cf-bar" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}><span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
            <p className="muted">{progress.done} of {progress.total}</p>
            <ul className="cf-rows">{progress.rows.map((r, i) => <li key={`${r.id}${i}`}><Icon name={r.status === 'found' ? 'check' : 'close'} size={14} /> <span>{r.title}</span><span className="muted">{r.status === 'found' ? 'cover found' : r.status === 'skipped' ? 'already has a cover' : 'not found'}</span></li>)}</ul>
            <div className="row end"><button className="btn ghost" onClick={() => { stop.current = true; }}>Stop</button></div>
          </>
        )}
        {phase === 'done' && (
          <>
            <p><strong>{summary.found}</strong> cover{summary.found === 1 ? '' : 's'} added{summary.missing ? `, ${summary.missing} not found` : ''}{summary.skipped ? `, ${summary.skipped} skipped (already had one)` : ''}.</p>
            {summary.missing > 0 && <p className="muted small">Not found? Tap a song’s cover in <em>Edit info</em> to add one yourself.</p>}
            <div className="row end"><button className="btn" onClick={onClose}>Done</button></div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
