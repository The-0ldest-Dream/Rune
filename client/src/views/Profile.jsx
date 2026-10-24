// Profile: photo, name, username and a "top 10 songs" listening chart.
import React, { useMemo, useRef, useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { fmtListened } from '../util.js';
import { Avatar, Icon, Status } from '../components/ui.jsx';

export default function ProfilePage() {
  const lib = useLibrary();
  const { profile, avatarUrl, stats } = lib;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const [photo, setPhoto] = useState(null);       // File chosen but not saved yet
  const [dropPhoto, setDropPhoto] = useState(false);
  const input = useRef(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : dropPhoto ? null : avatarUrl), [photo, dropPhoto, avatarUrl]);

  const top = useMemo(() => Object.entries(stats)
    .map(([id, s]) => ({ track: lib.byId.get(id), ...s }))
    .filter((x) => x.track && x.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds).slice(0, 10), [stats, lib.byId]);
  const max = top[0]?.seconds || 1;
  const total = Object.values(stats).reduce((n, s) => n + s.seconds, 0);

  const start = () => { setForm(profile); setPhoto(null); setDropPhoto(false); setEditing(true); };
  const save = async (e) => {
    e.preventDefault();
    await lib.saveProfile({ name: form.name, username: form.username, avatarFile: photo, removeAvatar: dropPhoto });
    setEditing(false);
  };

  return (
    <div className="profile">
      <div className="profile-head">
        <button className="avatar-btn" onClick={editing ? () => input.current.click() : start} aria-label={editing ? 'Choose profile photo' : 'Edit profile'}>
          <Avatar url={editing ? preview : avatarUrl} name={editing ? form.name : profile.name} size={160} />
          <span className="avatar-hint"><Icon name="image" size={22} />{editing ? 'Choose photo' : 'Edit profile'}</span>
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { setPhoto(f); setDropPhoto(false); } }} />

        {!editing ? (
          <>
            <h1 className="profile-name">{profile.name || 'Your name'}</h1>
            <p className="profile-user">{profile.username ? `@${profile.username}` : '@username'}</p>
            <button className="btn ghost" onClick={start}><Icon name="edit" size={16} /> Edit profile</button>
          </>
        ) : (
          <form className="profile-form" onSubmit={save}>
            <label className="field"><span>Name</span><input value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></label>
            <label className="field"><span>Username</span><input value={form.username} maxLength={30} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="optional" /></label>
            {(avatarUrl || photo) && !dropPhoto && <button type="button" className="link-btn" onClick={() => { setPhoto(null); setDropPhoto(true); }}>Remove photo</button>}
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
              <li key={x.track.id}>
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
    </div>
  );
}
