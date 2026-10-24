import React, { useEffect, useState } from 'react';
import { STATIC } from './api.js';
import { LibraryProvider, useLibrary } from './store/library.jsx';
import { PlayerProvider, usePlayer } from './store/player.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import AuthModal from './components/AuthModal.jsx';
import { Equalizer, NowPlaying, Queue } from './components/Panels.jsx';
import { Icon, IconButton } from './components/ui.jsx';
import Home from './views/Home.jsx';
import Search from './views/Search.jsx';
import Browse from './views/Browse.jsx';
import { AlbumPage, ArtistPage } from './views/Detail.jsx';
import { LocalPage, PlaylistPage, PlaylistsPage } from './views/Library.jsx';

/** Tiny hash router: "#/album/12" → { name: 'album', arg: '12' } (hash routes survive static hosting & offline). */
function useRoute() {
  const read = () => {
    const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: name || 'home', arg: decodeURIComponent(rest.join('/')) };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); document.querySelector('.main')?.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

const NAV = [
  ['home', 'Home', 'home', '#/'],
  ['search', 'Search', 'search', '#/search'],
  ['albums', 'Albums', 'album', '#/albums'],
  ['artists', 'Artists', 'user', '#/artists'],
  ['library', 'Playlists', 'library', '#/library'],
  ['local', 'Device', 'upload', '#/local'],
];

function Sidebar({ route }) {
  const lib = useLibrary();
  const section = route.name === 'playlist' ? 'library' : route.name === 'genre' ? 'search' : route.name;
  return (
    <nav className="sidebar" aria-label="Main">
      <a className="brand" href="#/"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="28" height="28" /> Rune</a>
      <ul>
        {NAV.map(([key, label, icon, href]) => (
          <li key={key}><a href={href} className={section === key ? 'active' : ''} aria-current={section === key ? 'page' : undefined}><Icon name={icon} size={22} /><span>{label}</span></a></li>
        ))}
      </ul>
      <div className="side-playlists">
        <h3>Playlists</h3>
        {lib.playlists.length === 0 && <p className="muted small">Playlists you create appear here.</p>}
        {lib.playlists.map((p) => (
          <a key={p.id} href={`#/playlist/${p.id}`} className={route.name === 'playlist' && route.arg === p.id ? 'active' : ''}>{p.name}</a>
        ))}
      </div>
    </nav>
  );
}

function TopBar({ route, openAuth }) {
  const lib = useLibrary();
  const [value, setValue] = useState('');
  useEffect(() => { if (route.name === 'search') setValue(route.arg); }, [route]);

  const onChange = (e) => {
    const v = e.target.value;
    setValue(v);
    const hash = `#/search/${encodeURIComponent(v)}`;
    route.name === 'search' ? location.replace(hash) : (location.hash = hash);
  };

  return (
    <header className="topbar">
      <div className="searchbox">
        <Icon name="search" size={20} />
        <input type="search" value={value} onChange={onChange} placeholder="Search songs, artists, albums" aria-label="Search" />
      </div>
      <span className={`conn ${lib.online ? 'on' : 'off'}`} role="status">{STATIC ? 'Offline-ready' : lib.online ? 'Online' : 'Offline'}</span>
      {STATIC ? null : lib.user
        ? <button className="btn ghost" onClick={lib.signOut} title={lib.user.email}>Sign out ({lib.user.name})</button>
        : <button className="btn ghost" onClick={openAuth}>Sign in</button>}
    </header>
  );
}

function Toast() {
  const { notice, setNotice } = useLibrary();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice, setNotice]);
  if (!notice) return null;
  return <div className={`toast ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</div>;
}

function View({ route, openAuth }) {
  switch (route.name) {
    case 'search': return <Search q={route.arg} />;
    case 'genre': return <Search q="" genre={route.arg} />;
    case 'albums': return <Browse kind="albums" />;
    case 'artists': return <Browse kind="artists" />;
    case 'album': return <AlbumPage key={route.arg} id={route.arg} />;
    case 'artist': return <ArtistPage key={route.arg} id={route.arg} />;
    case 'library': return <PlaylistsPage openAuth={openAuth} />;
    case 'playlist': return <PlaylistPage id={route.arg} />;
    case 'local': return <LocalPage />;
    default: return <Home />;
  }
}

function Shell() {
  const route = useRoute();
  const { toggle } = usePlayer();
  const [panel, setPanel] = useState({ open: window.innerWidth > 1100, tab: 'now' });
  const [auth, setAuth] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement?.tagName) ) { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const tabs = [['now', 'Now playing'], ['queue', 'Queue'], ['eq', 'Equalizer']];
  return (
    <div className={`app ${panel.open ? 'with-panel' : ''}`}>
      <Sidebar route={route} />
      <main className="main">
        <TopBar route={route} openAuth={() => setAuth(true)} />
        <div className="content"><View route={route} openAuth={() => setAuth(true)} /></div>
      </main>
      {panel.open && (
        <aside className="side" aria-label="Player panel">
          <div className="tabs" role="tablist">
            {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={panel.tab === k} className={panel.tab === k ? 'on' : ''} onClick={() => setPanel({ open: true, tab: k })}>{label}</button>)}
            <IconButton icon="close" label="Close panel" onClick={() => setPanel({ ...panel, open: false })} />
          </div>
          <div className="side-body">
            {panel.tab === 'now' && <NowPlaying />}
            {panel.tab === 'queue' && <Queue />}
            {panel.tab === 'eq' && <Equalizer />}
          </div>
        </aside>
      )}
      <PlayerBar panel={panel} setPanel={setPanel} />
      <Toast />
      {auth && <AuthModal onClose={() => setAuth(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <LibraryProvider>
      <PlayerProvider>
        <Shell />
      </PlayerProvider>
    </LibraryProvider>
  );
}
