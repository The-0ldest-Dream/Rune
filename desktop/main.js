// Rune for Windows: a thin Electron shell around the built web app (../client/dist copied into ./app).
// The app is served from a private "app://" scheme so IndexedDB, Web Audio and fullscreen behave like on a real website.
const { app, BrowserWindow, Menu, ipcMain, nativeImage, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, 'app');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// Let music keep playing without a click after launch, and enable keyboard media keys.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService');

let win = null;
let playerState = { playing: false, hasTrack: false };

// Windows taskbar thumbnail buttons: previous / play-pause / next (like other music players).
function updateThumbar() {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;
  const img = (name) => nativeImage.createFromPath(path.join(__dirname, 'build', 'thumb', `${name}.png`));
  const flags = playerState.hasTrack ? [] : ['disabled'];
  const send = (cmd) => () => win && !win.isDestroyed() && win.webContents.send('transport', cmd);
  win.setThumbarButtons([
    { tooltip: 'Previous', icon: img('prev'), flags, click: send('prev') },
    { tooltip: playerState.playing ? 'Pause' : 'Play', icon: img(playerState.playing ? 'pause' : 'play'), flags, click: send('toggle') },
    { tooltip: 'Next', icon: img('next'), flags, click: send('next') },
  ]);
}
ipcMain.on('player-state', (_event, state) => { playerState = state; updateThumbar(); });

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 760, minWidth: 360, minHeight: 520,
    backgroundColor: '#000000', title: 'Rune', icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  win.loadURL('app://rune/index.html');
  win.webContents.on('did-finish-load', updateThumbar);
  const external = (url) => { if (/^https?:/.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); external(url); } });
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle('app', async (request) => {
      let pathname = decodeURIComponent(new URL(request.url).pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const file = path.normalize(path.join(ROOT, pathname));
      if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
      try {
        const body = await fs.readFile(file);
        return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });

  app.on('window-all-closed', () => app.quit());
}
