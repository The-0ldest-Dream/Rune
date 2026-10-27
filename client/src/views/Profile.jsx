// Profile: photo, name, username, a top-10 songs chart, and backup (export / import).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { usePlayer } from '../store/player.jsx';
import { fmtListened } from '../util.js';
import { DEFAULT_CUSTOM, THEMES, buildVars, getTheme, setTheme, subscribeTheme } from '../themes.js';
import { CoverEditor } from '../components/CoverEditor.jsx';
import { Icon, IconButton, Status } from '../components/ui.jsx';

/** On the GitHub Pages site, works out which repository hosts it: https://<owner>.github.io/<repo>/ */
function hostRepo() {
  if (!location.hostname.endsWith('.github.io')) return null;
  const repo = location.pathname.split('/')[1];
  return repo ? { owner: location.hostname.split('.')[0], repo } : null;
}

const APP_LABELS = {
  'Rune-Setup.exe': 'Windows installer (.exe)',
  'Rune-Portable.exe': 'Windows portable (.exe)',
  'Rune.apk': 'Android app (.apk)',
};

/** Asks GitHub which app files have been published, so we never send people to a "404" page. */
function useAppDownloads() {
  const host = hostRepo();
  const [state, setState] = useState({ status: host ? 'loading' : 'none', files: [] });
  useEffect(() => {
    if (!host) return undefined;
    let live = true;
    fetch(`https://api.github.com/repos/${host.owner}/${host.repo}/releases/tags/downloads`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.status === 404 ? { assets: [] } : r.ok ? r.json() : Promise.reject(new Error('api'))))
      .then((rel) => {
        const files = (rel.assets || []).filter((a) => APP_LABELS[a.name]).map((a) => ({ label: APP_LABELS[a.name], url: a.browser_download_url, mb: Math.max(1, Math.round(a.size / 1e6)) }));
        if (live) setState({ status: files.length ? 'ready' : 'missing', files });
      })
      .catch(() => live && setState({ status: 'error', files: [] }));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, host };
}

function ThemePicker() {
  const [theme, setT] = useState(getTheme);
  useEffect(() => subscribeTheme(setT), []);
  const custom = theme.custom || DEFAULT_CUSTOM;
  const swatch = (spec) => { const v = buildVars(spec); return [v['--bg'], v['--panel'], v['--elev'], v['--accent']]; };
  const setCustom = (key, value) => setTheme({ id: 'custom', custom: { ...custom, [key]: value } });
  return (
    <>
      <div className="theme-grid" role="group" aria-label="Themes">
        {[...THEMES, { id: 'custom', name: 'Custom', spec: custom }].map((t) => (
          <button key={t.id} className="theme-card" aria-pressed={theme.id === t.id} onClick={() => setTheme({ id: t.id, custom })}>
            <span className="theme-swatch">{swatch(t.spec).map((c, i) => <i key={i} style={{ background: c }} />)}</span>
            {t.name}
          </button>
        ))}
      </div>
      <div className="theme-custom">
        <strong>Make your own</strong>
        <label>Background <input type="color" value={custom.bg} onChange={(e) => setCustom('bg', e.target.value)} /></label>
        <label>Panels <input type="color" value={custom.panel} onChange={(e) => setCustom('panel', e.target.value)} /></label>
        <label>Accent <input type="color" value={custom.accent} onChange={(e) => setCustom('accent', e.target.value)} /></label>
      </div>
    </>
  );
}

function DeleteDialog({ onClose }) {
  const lib = useLibrary();
  const player = usePlayer();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  const go = async (e) => {
    e.preventDefault();
    setBusy(true);
    player.pause();
    await lib.deleteEverything();   // reloads the page when done
  };
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal wide" onSubmit={go} role="alertdialog" aria-modal="true" aria-labelledby="del-title">
        <IconButton icon="close" label="Close" className="modal-x" type="button" onClick={onClose} disabled={busy} />
        <h2 id="del-title">Delete your account and all data?</h2>
        <p>This permanently removes everything Rune keeps on this device:</p>
        <ul className="del-list">
          <li>your profile, photo and username</li>
          <li>all songs and music videos stored in Rune, with their covers, artists and albums</li>
          <li>playlists, listening stats, search history and settings</li>
        </ul>
        <p className="muted">The original files on your device aren’t touched. This can’t be undone — export a backup first if you might want it back.</p>
        <label className="field"><span>Type DELETE to confirm</span><input value={text} onChange={(e) => setText(e.target.value)} autoFocus autoComplete="off" /></label>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn danger-solid" disabled={text.trim() !== 'DELETE' || busy}>{busy ? 'Deleting…' : 'Delete everything'}</button>
        </div>
      </form>
    </div>
  );
}

export default function ProfilePage() {
  const lib = useLibrary();
  const { profile, avatarUrl, stats } = lib;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState('');
  const [deleting, setDeleting] = useState(false);
  const importInput = useRef(null);
  const apps = useAppDownloads();

  const top = useMemo(() => Object.entries(stats)
    .map(([id, s]) => ({ track: lib.byId.get(id), ...s }))
    .filter((x) => x.track && x.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds).slice(0, 10), [stats, lib.byId]);
  const max = top[0]?.seconds || 1;
  const total = Object.values(stats).reduce((n, s) => n + s.seconds, 0);

  const save = (e) => { e.preventDefault(); lib.saveProfile(form); setEditing(false); };

  const doExport = async () => {
    setBusy('export');
    try { await lib.exportData(); lib.toast('Backup saved. Import it on your other devices to bring everything over.'); }
    catch { lib.toast('Could not create the backup.', 'error'); }
    setBusy('');
  };
  const doImport = async (file) => {
    setBusy('import');
    try {
      const r = await lib.importData(file);
      lib.toast(`Imported. ${r.matched} songs matched on this device${r.missing ? `, ${r.missing} not on this device (shown faded)` : ''}${r.playlists ? `, ${r.playlists} playlists` : ''}.`);
    } catch (err) { lib.toast(err.message || 'Could not import that file.', 'error'); }
    setBusy('');
  };

  return (
    <div className="profile">
      <div className="profile-head">
        <CoverEditor className="profile-avatar" round src={avatarUrl} label={profile.name || 'profile'} seed="me" candidates={lib.tracks}
          cropTitle="Adjust profile photo"
          onSave={(b) => lib.setAvatar(b)} onRemove={() => lib.setAvatar(null)}
          onExtract={(t) => { const b = lib.artBlob(t.id); if (b) lib.setAvatar(b); }} />

        {!editing ? (
          <>
            <h1 className="profile-name">{profile.name || 'Your name'}</h1>
            <p className="profile-user">{profile.username ? `@${profile.username}` : '@username'}</p>
            <button className="btn ghost" onClick={() => { setForm(profile); setEditing(true); }}><Icon name="edit" size={16} /> Edit profile</button>
          </>
        ) : (
          <form className="profile-form" onSubmit={save}>
            <label className="field"><span>Name</span><input value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></label>
            <label className="field"><span>Username</span><input value={form.username} maxLength={30} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="optional" /></label>
            <div className="row center"><button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button><button className="btn">Save</button></div>
          </form>
        )}
      </div>

      <section className="stats" aria-labelledby="stats-title">
        <div className="stats-head">
          <h2 id="stats-title">Your top 10 songs</h2>
          {total > 0 && <span className="muted">{fmtListened(total)} listened in total</span>}
        </div>
        {top.length === 0 ? <Status empty emptyText="Play some songs and your listening stats will appear here." /> : (
          <ol className="bars-chart">
            {top.map((x, i) => (
              <li key={x.track.id} className={x.track.missing ? 'missing' : ''}>
                <span className="rank">{i + 1}</span>
                <span className="bar-label"><strong>{x.track.title}</strong><span className="muted">{x.track.artist}</span></span>
                <span className="bar-track" role="img" aria-label={`${fmtListened(x.seconds)} listened`}>
                  <span className="bar-fill" style={{ width: `${Math.max(3, (x.seconds / max) * 100)}%` }} />
                </span>
                <span className="bar-value">{fmtListened(x.seconds)}<span className="muted"> · {x.plays} {x.plays === 1 ? 'play' : 'plays'}</span></span>
              </li>
            ))}
          </ol>
        )}
        {total > 0 && <button className="link-btn" onClick={() => { if (confirm('Reset all listening stats?')) lib.resetStats(); }}>Reset stats</button>}
      </section>

      <section className="stats backup" aria-labelledby="theme-title">
        <h2 id="theme-title">Appearance</h2>
        <p className="muted">Pick a theme, or choose “Custom” and set your own colours. Text colours adjust automatically.</p>
        <ThemePicker />
      </section>

      {apps.host && (
        <section className="stats backup" aria-labelledby="apps-title">
          <h2 id="apps-title">Get the app</h2>
          <p className="muted">Prefer a real app? Rune also comes as a Windows program and an Android app — same features, works offline.</p>
          {apps.status === 'loading' && <p className="muted"><span className="spinner" /> Checking for downloads…</p>}
          {apps.status === 'ready' && (
            <div className="row">
              {apps.files.map((f) => (
                <a key={f.url} className="btn" href={f.url}><Icon name="download" size={16} /> {f.label} <span className="muted-on-btn">{f.mb} MB</span></a>
              ))}
            </div>
          )}
          {apps.status === 'missing' && <p className="muted">The app downloads haven’t been published yet. Check back soon.</p>}
          {apps.status === 'error' && (
            <p className="muted">Couldn’t check for downloads right now. You can also find them on the project’s{' '}
              <a href={`https://github.com/${apps.host.owner}/${apps.host.repo}#download`} target="_blank" rel="noreferrer">GitHub page</a>.</p>
          )}
        </section>
      )}

      <section className="stats backup" aria-labelledby="backup-title">
        <h2 id="backup-title">Backup &amp; sync between devices</h2>
        <p className="muted">
          Export saves your profile, covers, artists &amp; albums, edited song info, playlists and listening stats — everything except the song files.
          Import it on another device: songs found there get all this info; songs that aren’t there are listed faded until you add the files.
        </p>
        <div className="row">
          <button className="btn" onClick={doExport} disabled={!!busy}>{busy === 'export' ? 'Preparing…' : 'Export data'}</button>
          <button className="btn ghost" onClick={() => importInput.current.click()} disabled={!!busy}>{busy === 'import' ? 'Importing…' : 'Import data'}</button>
          <input ref={importInput} type="file" accept=".rune,application/gzip,application/json,application/octet-stream" hidden
            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) doImport(f); }} />
        </div>
        <p className="muted small">Tip: add your songs on the new device first, then import — they’re matched by file name and size (or title and artist).</p>
      </section>

      <section className="stats danger-zone" aria-labelledby="danger-title">
        <h2 id="danger-title">Delete account</h2>
        <p className="muted">Removes your profile and everything Rune stores on this device — songs, videos, covers, playlists and stats. There’s no online account; this just wipes the app clean.</p>
        <button className="btn ghost danger" onClick={() => setDeleting(true)}><Icon name="trash" size={16} /> Delete account &amp; all data</button>
      </section>
      {deleting && <DeleteDialog onClose={() => setDeleting(false)} />}
    </div>
  );
}
