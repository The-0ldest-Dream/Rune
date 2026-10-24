// Profile: photo, name, username, a top-10 songs chart, and backup (export / import).
import React, { useMemo, useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { fmtListened } from '../util.js';
import { CoverEditor } from '../components/CoverEditor.jsx';
import { Icon, Status } from '../components/ui.jsx';

export default function ProfilePage() {
  const lib = useLibrary();
  const { profile, avatarUrl, stats } = lib;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState('');
  const importInput = useRef(null);

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
    </div>
  );
}
