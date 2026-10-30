import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LibraryProvider, useLibrary } from './store/library.jsx';
import { PlayerProvider, usePlayer } from './store/player.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import SearchBox from './components/SearchBox.jsx';
import EditDialog from './components/EditDialog.jsx';
import FullScreen from './components/FullScreen.jsx';
import { Equalizer, LyricsPanel, NowPlaying, PlaybackPanel, Queue } from './components/Panels.jsx';
import { Avatar, Cover, Icon, IconButton } from './components/ui.jsx';
import { DEFAULT_BACKDROP, backdropFor, backdropFromHue, dominantColor, hueFor } from './util.js';
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
  ['videos', 'Upload file', 'video', '#/videos', 'desk-only'],   // on phones it lives behind an icon in Device files
];

function useMedia(query) {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

const LAYOUT_KEY = 'rune.layout';
const DEF = { side: 240, panel: 340 };
const COMPACT_W = 76, MIN_SIDE = 190, MAX_SIDE = 420, MIN_PANEL = 270, CLOSE_BELOW = 210;
const loadLayout = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(LAYOUT_KEY)) }; } catch { return { ...DEF }; } };

const MOBILE_Q = '(max-width: 800px)';
const isMobile = () => window.matchMedia(MOBILE_Q).matches;

function Sidebar({ route, onNavigate, compact }) {
  const lib = useLibrary();
  const section = { playlist: 'library', artist: 'artists', album: 'artists', ...(isMobile() ? { videos: 'local' } : {}) }[route.name] || route.name;
  return (
    <nav className={`sidebar ${compact ? 'compact' : ''}`} aria-label="Main">
      <a className="brand" href="#/"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="28" height="28" /><span>Rune</span></a>
      <ul>
        {NAV.map(([key, label, icon, href, cls]) => (
          <li key={key} className={cls || ''}><a href={href} onClick={onNavigate} title={label} className={section === key ? 'active' : ''} aria-current={section === key ? 'page' : undefined}><Icon name={icon} size={22} /><span>{label}</span></a></li>
        ))}
      </ul>
      <div className="side-playlists">
        <h3>Playlists</h3>
        {lib.playlists.length === 0 && <p className="muted small">Playlists you create appear here.</p>}
        {lib.playlists.map((p) => (
          <a key={p.id} href={`#/playlist/${p.id}`} onClick={onNavigate} title={p.name} className={route.name === 'playlist' && route.arg === p.id ? 'active' : ''}>
            {compact ? <Cover src={p.cover} seed={p.id} label={p.name} className="thumb" /> : p.name}
          </a>
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
    case 'videos': return <VideosPage />;
    case 'profile': return <ProfilePage />;
    default: return <Home />;
  }
}

/** Colours for the Now playing backdrop, taken from the whole cover (or the placeholder's hue). */
function useBackdrop(current) {
  const [bd, setBd] = useState(DEFAULT_BACKDROP);
  const cover = current?.cover, id = current?.id;
  useEffect(() => {
    let live = true;
    if (!current) { setBd(DEFAULT_BACKDROP); return undefined; }
    const fallback = backdropFromHue(hueFor(current.albumKey || current.id, current.title));
    if (!cover) setBd(fallback);
    else dominantColor(cover).then((rgb) => live && setBd(rgb ? backdropFor(rgb) : fallback));
    return () => { live = false; };
  }, [cover, id]); // eslint-disable-line react-hooks/exhaustive-deps
  return bd;
}

function Shell() {
  const route = useRoute();
  const { toggle, current } = usePlayer();
  const wide = useMedia('(min-width: 1101px)');
  const [panel, setPanel] = useState({ open: window.innerWidth > 1100, tab: 'now' });
  const [full, setFull] = useState(false);
  const [winFull, setWinFull] = useState(!!document.fullscreenElement);
  const viaWindow = useRef(false);               // true when the full-screen view was opened together with browser full screen
  const [layout, setLayout] = useState(loadLayout);
  const [compact, setCompact] = useState(() => loadLayout().side < 150);
  const [dragging, setDragging] = useState('');
  const appRef = useRef(null);
  const bd = useBackdrop(current);

  // Phones: tapping a tab (or any link) while the cover / full screen is open brings the player back to its mini form.
  const minimise = useCallback(() => {
    if (!isMobile()) return;
    setPanel((p) => (p.open ? { ...p, open: false } : p));
    setFull(false);
  }, []);
  useEffect(() => { minimise(); }, [route.name, route.arg, minimise]);

  // Starting a music video opens Now playing so the picture is visible.
  useEffect(() => { if (current?.kind === 'video') setPanel({ open: true, tab: 'now' }); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Space = play/pause (unless typing or focused on a control)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement?.tagName)) { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // ---- full screen ----
  // The arrow in the panel opens the expanded view INSIDE the app. The button in the player bar also makes the window itself full screen.
  const exitWindowFs = () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  const openExpanded = useCallback(() => setFull(true), []);
  const closeFull = useCallback(() => {
    setFull(false);
    if (viaWindow.current) { viaWindow.current = false; exitWindowFs(); }
  }, []);
  const toggleBarFullscreen = () => {
    if (full) { closeFull(); return; }
    viaWindow.current = true;
    setFull(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const toggleWindowFullscreen = useCallback(() => {
    if (document.fullscreenElement) exitWindowFs();
    else { viaWindow.current = true; document.documentElement.requestFullscreen?.().catch(() => {}); }
  }, []);
  useEffect(() => {
    const on = () => {
      setWinFull(!!document.fullscreenElement);
      if (!document.fullscreenElement && viaWindow.current) { viaWindow.current = false; setFull(false); }
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // Publish the player bar's real height so overlays (full screen, toasts) never overlap it.
  useEffect(() => {
    const bar = document.querySelector('.playerbar');
    if (!bar || !appRef.current) return undefined;
    const set = () => appRef.current?.style.setProperty('--bar-real', `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // ---- resizable panes (drag the thin line between them) ----
  const setVar = (name, px) => appRef.current?.style.setProperty(name, `${px}px`);
  const startDrag = (which) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget, startX = e.clientX, start = which === 'side' ? layout.side : layout.panel;
    el.setPointerCapture(e.pointerId);
    setDragging(which);
    let value = start;
    const maxPanel = Math.min(680, window.innerWidth * 0.55);
    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (which === 'side') {
        const w = start + dx;
        value = w < 130 ? COMPACT_W : Math.min(MAX_SIDE, Math.max(MIN_SIDE, w));   // icon-only column, or a normal sidebar
        setVar('--side-w', value);
        setCompact(value < 150);
      } else {
        const w = start - dx;
        value = w < CLOSE_BELOW ? 0 : Math.min(maxPanel, Math.max(MIN_PANEL, w));  // dragged to the edge → closes
        setVar('--panel-w', value);
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      setDragging('');
      if (which === 'side') commit({ ...layout, side: value });
      else if (value === 0) { setVar('--panel-w', layout.panel); setPanel((p) => ({ ...p, open: false })); }
      else commit({ ...layout, panel: value });
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const commit = (next) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const nudge = (which) => (e) => {
    const d = { ArrowLeft: -16, ArrowRight: 16 }[e.key];
    if (!d) return;
    e.preventDefault();
    if (which === 'side') {
      const side = Math.min(MAX_SIDE, Math.max(COMPACT_W, layout.side + d)); setCompact(side < 150); commit({ ...layout, side: side < 130 ? COMPACT_W : Math.max(MIN_SIDE, side) });
    } else commit({ ...layout, panel: Math.min(680, Math.max(MIN_PANEL, layout.panel - d)) });
  };
  const resetPane = (which) => () => { commit({ ...layout, [which]: DEF[which] }); setVar(`--${which === 'side' ? 'side' : 'panel'}-w`, DEF[which]); if (which === 'side') setCompact(false); };

  const titles = { now: 'Now playing', queue: 'Queue', eq: 'Equalizer', play: 'Playback', lyrics: 'Lyrics' };
  const tint = panel.open && panel.tab === 'now' && current;
  return (
    <div ref={appRef}
      style={{ '--c1': bd.c1, '--c2': bd.c2, '--side-w': `${layout.side}px`, '--panel-w': `${layout.panel}px` }}
      className={`app ${panel.open ? 'with-panel' : ''} ${current ? '' : 'no-bar'} ${tint ? 'np-tint' : ''} ${dragging ? 'resizing' : ''}`}>
      <Sidebar route={route} onNavigate={minimise} compact={compact && wide} />
      <main className="main">
        <TopBar route={route} />
        <div className="content"><View route={route} /></div>
      </main>
      {panel.open && (
        <aside className="side" aria-label="Player panel">
          <div className="side-head">
            <h2>{titles[panel.tab]}</h2>
            <span className="side-head-actions">
              {current && <IconButton icon="expandArrow" label="Expand now playing" onClick={openExpanded} />}
              <IconButton icon="close" label="Close panel" onClick={() => setPanel({ ...panel, open: false })} />
            </span>
          </div>
          <div className="side-body">
            {panel.tab === 'now' && <NowPlaying />}
            {panel.tab === 'queue' && <Queue />}
            {panel.tab === 'eq' && <Equalizer />}
            {panel.tab === 'play' && <PlaybackPanel />}
            {panel.tab === 'lyrics' && <LyricsPanel />}
          </div>
        </aside>
      )}
      {wide && (
        <div className={`resizer left ${dragging === 'side' ? 'dragging' : ''}`} role="separator" aria-orientation="vertical" aria-label="Resize sidebar" tabIndex={0}
          onPointerDown={startDrag('side')} onDoubleClick={resetPane('side')} onKeyDown={nudge('side')} />
      )}
      {wide && panel.open && (
        <div className={`resizer right ${dragging === 'panel' ? 'dragging' : ''}`} role="separator" aria-orientation="vertical" aria-label="Resize player panel" tabIndex={0}
          onPointerDown={startDrag('panel')} onDoubleClick={resetPane('panel')} onKeyDown={nudge('panel')} />
      )}
      {full && <FullScreen onClose={closeFull} winFull={winFull} onToggleWindow={toggleWindowFullscreen} />}
      <PlayerBar panel={panel} setPanel={setPanel} full={full} onFull={toggleBarFullscreen} />
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
