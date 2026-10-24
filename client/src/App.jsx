import React, { useEffect, useState } from 'react';
import { LibraryProvider, useLibrary } from './store/library.jsx';
import { PlayerProvider, usePlayer } from './store/player.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import SearchBox from './components/SearchBox.jsx';
import EditDialog from './components/EditDialog.jsx';
import FullScreen from './components/FullScreen.jsx';
import { Equalizer, NowPlaying, Queue } from './components/Panels.jsx';
import { Avatar, Icon, IconButton } from './components/ui.jsx';
import Home from './views/Home.jsx';
import Search from './views/Search.jsx';
import ArtistsPage from './views/Artists.jsx';
import { AlbumPage, ArtistPage } from './views/Detail.jsx';
import { LocalPage, PlaylistPage, PlaylistsPage } from './views/Library.jsx';
import VideosPage from './views/Videos.jsx';
import ProfilePage from './views/Profile.jsx';

/** Tiny hash router: "#/artist/coldplay" → { name: 'artist', arg: 'coldplay' } (works on static hosting and offline). */
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
  ['artists', 'Artists', 'user', '#/artists'],
  ['library', 'Playlists', 'library', '#/library'],
  ['local', 'Device files', 'music', '#/local'],
  ['videos', 'Upload file', 'video', '#/videos'],
];

function Sidebar({ route }) {
  const lib = useLibrary();
  const section = { playlist: 'library', artist: 'artists', album: 'artists' }[route.name] || route.name;
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

function TopBar({ route }) {
  const lib = useLibrary();
  return (
    <header className="topbar">
      <SearchBox route={route} />
      <a className="profile-link" href="#/profile" aria-label="Profile" title={lib.profile.name || 'Profile'}>
        <Avatar url={lib.avatarUrl} name={lib.profile.name} size={40} />
      </a>
    </header>
  );
}

function Toast() {
  const { notice, setNotice } = useLibrary();
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice, setNotice]);
  if (!notice) return null;
  return <div className={`toast ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</div>;
}

function View({ route }) {
  switch (route.name) {
    case 'search': return <Search q={route.arg} />;
    case 'artists': return <ArtistsPage />;
    case 'artist': return <ArtistPage key={route.arg} id={route.arg} />;
    case 'album': return <AlbumPage key={route.arg} id={route.arg} />;
    case 'library': return <PlaylistsPage />;
    case 'playlist': return <PlaylistPage id={route.arg} />;
    case 'local': return <LocalPage />;
    case 'videos': return <VideosPage openId={route.arg} />;
    case 'profile': return <ProfilePage />;
    default: return <Home />;
  }
}

function Shell() {
  const route = useRoute();
  const { toggle, current } = usePlayer();
  const [panel, setPanel] = useState({ open: window.innerWidth > 1100, tab: 'now' });
  const [full, setFull] = useState(false);

  // Space = play/pause (unless typing or focused on a control)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement?.tagName)) { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Full screen: our overlay, plus the browser's real full-screen mode when allowed.
  useEffect(() => {
    if (full) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, [full]);
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const tabs = [['now', 'Now playing'], ['queue', 'Queue'], ['eq', 'Equalizer']];
  return (
    <div className={`app ${panel.open ? 'with-panel' : ''} ${current ? '' : 'no-bar'}`}>
      <Sidebar route={route} />
      <main className="main">
        <TopBar route={route} />
        <div className="content"><View route={route} /></div>
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
      {full && <FullScreen onClose={() => setFull(false)} />}
      <PlayerBar panel={panel} setPanel={setPanel} full={full} onFull={() => setFull((f) => !f)} />
      <Toast />
      <EditDialog />
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
