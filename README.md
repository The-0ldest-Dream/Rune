<div align="center">

# Rune

**Your music and music videos — private, offline, and beautiful.**

Add the songs you already own. Rune finds the cover art, builds your artists and albums, and plays everything with an equalizer. No account, no ads, no tracking.

[**▶ Open Rune in your browser**](https://the-0ldest-dream.github.io/Rune/)

</div>

---

## Download

Rune works in any modern browser, and also comes as an app:

| Platform | Download | Notes |
| --- | --- | --- |
| **Windows** (installer) | [Rune-Setup.exe](https://github.com/The-0ldest-Dream/Rune/releases/download/downloads/Rune-Setup.exe) | Installs like a normal program, with a Start-menu shortcut |
| **Windows** (portable) | [Rune-Portable.exe](https://github.com/The-0ldest-Dream/Rune/releases/download/downloads/Rune-Portable.exe) | No installation — just double-click |
| **Android** | [Rune.apk](https://github.com/The-0ldest-Dream/Rune/releases/download/downloads/Rune.apk) | See "Installing on Android" below |
| **iPhone / iPad / Mac / Linux** | [Open the website](https://the-0ldest-dream.github.io/Rune/) | In Safari: Share → *Add to Home Screen*. In Chrome/Edge: *Install app* in the address bar |

All files are also listed on the [downloads page](https://github.com/The-0ldest-Dream/Rune/releases/tag/downloads).
If a link says "not found", the latest build is still being prepared — try again in a few minutes.

**Windows warning?** The apps aren't code-signed, so Windows SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**.

**Installing on Android:** open the downloaded `Rune.apk`. If Android asks, allow your browser or Files app to **install unknown apps**, then tap *Install*.

---

## What you can do

- 🎵 **Play your own music** — MP3, FLAC, OGG, Opus, M4A, WAV and more. Drag files in or pick a whole folder.
- 🖼️ **Automatic covers, artists and albums** — cover art, title, artist and album are read from your files. Two or more songs by the same artist create an artist page; two or more from the same album create an album.
- ✏️ **Fix and personalise** — edit song info (one song or many at once) and set your own cover for any song, album, artist, playlist or your profile photo, with crop and zoom.
- 🎬 **Music videos too** — add videos and watch them in the same player as your songs.
- 🎚️ **Equalizer & visualizer** — bass / mid / treble, a 10-band equalizer with presets, and live visualizer bars.
- 📋 **Playlists and queue** — create playlists, add songs with the **+** button, reorder the queue by dragging.
- 🔍 **Fast search** — songs, artists, playlists and videos, with recent searches. Works with no internet.
- 🖥️ **Full-screen player** — a big cover on a backdrop coloured from the artwork; after 5 quiet seconds it becomes a clean, immersive view.
- 📊 **Your stats** — see your top 10 most-listened songs on your profile; Home shows your top playlists, albums and most-played songs.
- 💾 **Backup & sync between devices** — export your data (everything except the song files) and import it on another device.

## Getting started in one minute

1. Open Rune and go to **Device files**.
2. Drag in some songs, or tap **Choose files** / **Choose folder**.
3. Press play. Tap the cover or title for the big now-playing view; the equalizer and queue buttons are in the player bar.
4. Open **Profile** (top-right photo) to add your name and photo.

**Music videos:** open **Upload file** (on phones: the video icon at the top of *Device files*) and add your videos. Press play on one and it opens in the player.

## Moving to a new phone or computer

1. On your current device: **Profile → Export data**. You get one small `.rune` file.
2. On the new device: add the same songs first, then **Profile → Import data**.
3. Songs that are found there get all their covers, artists, albums, playlists and stats back. Songs that aren't on the new device are still listed, but faded, until you add the files.

Your songs themselves are never exported — only the information around them.

## Privacy

- Everything stays **on your device**. Rune has no server, no account and no analytics.
- Your songs and videos are copied into the app's own storage (your browser or the app), so they keep working offline. Your original files are never changed.
- **Profile → Delete account** wipes everything Rune has stored. Clearing your browser's site data does the same.

## Questions & problems

**A song won't play.** Your browser couldn't decode that format. MP3, M4A (AAC), OGG, Opus, WAV and FLAC work in current browsers; WMA and some rare formats don't.

**My music disappeared.** Rune stores data in your browser. Clearing site data, using a private window, or switching browsers removes it. Export a backup now and then.

**The Android app stops when the screen is off.** Android can pause apps in the background. Turn off battery optimisation for Rune, or keep the screen on.

**Videos don't play.** MP4 (H.264) and WebM work everywhere; MKV and AVI usually don't work in browsers.

**Is it free?** Yes, and open source (MIT). Please only add music and videos you have the right to use.

---

## For developers

Rune is a React + Vite app that runs entirely in the browser (IndexedDB for storage, Web Audio for the equalizer). The Windows app wraps it with Electron and the Android app with Capacitor.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in client/dist
npm test           # unit tests: tag reader, grouping, backup, colours
```

```
client/src/
  tags.js            ID3 / FLAC / Ogg / MP4 tag and cover-art reader (no dependencies)
  util.js            grouping, ranking, fingerprints, colour helpers
  idb.js             IndexedDB helper
  audio/engine.js    Web Audio graph: equalizer, limiter, analyser
  store/             library.jsx (files, covers, playlists, profile, stats), player.jsx (queue, playback), backup.js
  components/        player bar, full screen, search, cover editor, panels, …
  views/             Home, Search, Artists, Artist/Album, Playlists, Device files, Videos, Profile
client/test/         node:test unit tests
desktop/             Electron shell + installer config (Windows)
mobile/              Capacitor config (Android)
.github/workflows/   pages.yml (website), apps.yml (.exe / .apk), ci.yml
```

**Automatic builds.** Every push to `main` publishes the website to GitHub Pages and builds the Windows and Android apps, attaching them to the **downloads** release (`apps.yml`). Set the repository's *Settings → Pages → Source* to **GitHub Actions** once.

**Hosting elsewhere.** `BASE_PATH=/your-path/ npm run build` produces a static site in `client/dist` that any static host can serve.

Rune is an independent project and isn't affiliated with any streaming service.

## License

MIT — see [LICENSE](LICENSE).
