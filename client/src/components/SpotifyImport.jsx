// Import Spotify playlists from Spotify's "Download your data" JSON or an Exportify CSV.
import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLibrary } from '../store/library.jsx';
import { matchSpotifyTrack, parseSpotifyExport } from '../spotify.js';
import CoverFetchDialog from './CoverFetchDialog.jsx';
import { Icon, IconButton } from './ui.jsx';

export default function SpotifyImport({ onClose }) {
  const lib = useLibrary();
  const [step, setStep] = useState('pick');
  const [lists, setLists] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [covers, setCovers] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const real = useMemo(() => lib.tracks.filter((t) => !t.missing), [lib.tracks]);
  const have = useMemo(() => lists.map((p) => p.tracks.filter((t) => matchSpotifyTrack(t, real)).length), [lists, real]);

  const onFile = async (file) => {
    setErr('');
    try {
      const { playlists } = parseSpotifyExport(await file.text(), file.name);
      if (!playlists.length) throw new Error('No playlists with songs were found in that file.');
      setLists(playlists); setSel(new Set(playlists.map((_, i) => i))); setStep('choose');
    } catch (e) { setErr(e instanceof SyntaxError ? 'That file isn’t a Spotify export.' : e.message); }
  };
  const run = async () => {
    setBusy(true);
    try { setResult(await lib.importSpotifyPlaylists(lists.filter((_, i) => sel.has(i)))); setStep('done'); } finally { setBusy(false); }
  };
  const toggle = (i) => setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide spotify" role="dialog" aria-modal="true" aria-labelledby="sp-title">
        <IconButton icon="close" label="Close" className="modal-x" onClick={onClose} />
        <h2 id="sp-title">Import from Spotify</h2>
        {step === 'pick' && (
          <>
            <p>Bring your playlists over: every song name is kept, and songs you already own are linked. Songs you don’t have yet appear faded until you add the files.</p>
            <ol className="sp-steps">
              <li><strong>Get your playlist file</strong> — either Spotify’s <em>Account → Privacy settings → Download your data</em> (choose “Account data”, then use <code>Playlist1.json</code> from the email) or export a playlist as CSV with a free tool such as Exportify.</li>
              <li><strong>Choose the file here.</strong></li>
            </ol>
            {err && <p className="form-error" role="alert">{err}</p>}
            <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={() => input.current.click()}><Icon name="upload" size={16} /> Choose file</button></div>
            <input ref={input} type="file" accept=".json,.csv,text/csv,application/json,text/plain" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); }} />
          </>
        )}
        {step === 'choose' && (
          <>
            <p className="muted">Found {lists.length} {lists.length === 1 ? 'playlist' : 'playlists'}. Pick what to import.</p>
            <ul className="sp-lists">
              {lists.map((p, i) => (
                <li key={i}><label><input type="checkbox" checked={sel.has(i)} onChange={() => toggle(i)} /> <strong>{p.name}</strong><span className="muted"> · {p.tracks.length} songs · {have[i]} already in your library</span></label></li>
              ))}
            </ul>
            <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={run} disabled={!sel.size || busy}>{busy ? 'Importing…' : `Import ${sel.size}`}</button></div>
          </>
        )}
        {step === 'done' && result && (
          <>
            <p>Imported <strong>{result.playlists.length}</strong> {result.playlists.length === 1 ? 'playlist' : 'playlists'}: {result.matched} songs matched your library{result.placeholders ? `, ${result.placeholders} added as faded placeholders (add the files to play them)` : ''}.</p>
            <div className="row end">
              {result.ghostIds.length > 0 && <button className="btn ghost" onClick={() => setCovers(true)}>Find covers online ({result.ghostIds.length})</button>}
              <button className="btn" onClick={() => { location.hash = `#/playlist/${result.playlists[0].id}`; onClose(); }}>Open playlist</button>
            </div>
          </>
        )}
        {covers && <CoverFetchDialog ids={result.ghostIds} onClose={() => setCovers(false)} />}
      </div>
    </div>,
    document.body
  );
}
