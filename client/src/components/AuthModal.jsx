import React, { useState } from 'react';
import { useLibrary } from '../store/library.jsx';
import { IconButton } from './ui.jsx';

export default function AuthModal({ onClose }) {
  const lib = useLibrary();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await lib.signIn(mode === 'login' ? 'login' : 'register', form);
      await lib.syncPlaylists();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <IconButton icon="close" label="Close" className="modal-x" onClick={onClose} />
        <h2 id="auth-title">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
        <p className="muted">An account is optional. It backs up your playlists so you can use them on other devices.</p>
        {mode === 'register' && <label className="field"><span>Name</span><input value={form.name} onChange={set('name')} autoComplete="name" /></label>}
        <label className="field"><span>Email</span><input type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></label>
        <label className="field"><span>Password</span><input type="password" required minLength={mode === 'register' ? 8 : 1} value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn wide" disabled={busy || !lib.online}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        {!lib.online && <p className="muted">You’re offline — connect to sign in.</p>}
        <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
