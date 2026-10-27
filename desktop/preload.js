// Bridge between the web app and the Windows shell (taskbar thumbnail buttons). Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('runeDesktop', {
  /** Calls cb('prev' | 'toggle' | 'next') when a taskbar button is pressed. Returns an unsubscribe function. */
  onTransport(cb) {
    const handler = (_event, cmd) => cb(cmd);
    ipcRenderer.on('transport', handler);
    return () => ipcRenderer.removeListener('transport', handler);
  },
  /** Tells the shell whether music is playing so it can show Play or Pause. */
  sendState(state) {
    ipcRenderer.send('player-state', { playing: !!state?.playing, hasTrack: !!state?.hasTrack });
  },
});
