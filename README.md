# Rune

A private, offline-first music player that runs entirely in your browser. Add your own songs and music videos, and Rune reads their cover art and tags, groups them into artists and albums, tracks what you listen to, and lets you shape the sound with an equalizer. Nothing is uploaded anywhere — your files stay in your browser's storage.

> Rune is an independent project inspired by the layout of mainstream music apps. It is not affiliated with Spotify. There are no social features.

## Features

- **Your library** – add songs (MP3, FLAC, OGG/Opus, M4A, WAV…) by dragging files or choosing a folder. Embedded **cover art, title, artist, album and track number** are read automatically.
- **Auto artists & albums** – a song group becomes an **artist** (or **album**) once two or more songs share the same artist (and album). Albums are opened from their artist's page. Songs with no artist stay in *Device files* until you edit them.
- **Edit info & covers** – fix title/artist/album for one song or many at once (use *Select*). Every **song, album, artist and playlist** (and your profile photo) has a cover you can edit: tap the **+** to add one (with a crop/zoom step), or tap an existing cover for *Remove cover*, *Change cover* or *Extract from a song*.
- **Playlists** – create, rename, delete, add/remove songs, custom cover.
- **Music videos** – the **Upload file** tab stores videos (MP4/WebM work everywhere) and plays them in a viewer.
- **Search** – the top bar shows your songs and **recent searches** as you focus it, and searches songs, artists, playlists and videos — all on-device, so it works offline.
- **Full-screen player** – big cover (or visualizer), shown with the normal controls; also enters the browser's real full-screen mode.
- **Profile** – photo, name and username, plus a **top-10 songs** bar chart of your listening time. The Home page greets you by name, shows your top playlists, top albums and most-played songs.
- **Player** – shuffle, repeat, queue (drag to reorder), media keys, 10-band **equalizer** with bass/mid/treble, presets and a live visualizer.
- **Backup & sync** – *Profile → Export data* saves everything except the song files (profile, covers, artists/albums, edited info, playlists, stats) into one `.rune` file. *Import data* on another device restores it for songs found there; songs that aren't there are listed faded until you add the files.
- **Offline** – installable PWA; the app works with no connection after the first visit.

## Run it

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in client/dist
npm test           # unit tests (tag reader, grouping, backup)
```

## Deploy to GitHub Pages

The workflow `.github/workflows/pages.yml` builds and publishes on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site appears at `https://<your-username>.github.io/<repo-name>/`.

## How data is stored

Everything lives in your browser (IndexedDB + localStorage): song and video files, covers, playlists, profile and listening stats. Clearing site data erases it, and it is not shared between browsers or devices.

## Project structure

```
client/src/
  tags.js           ID3 / FLAC / Ogg / MP4 tag + cover-art reader (no dependencies)
  util.js           artist/album grouping, ranking, formatting
  idb.js            IndexedDB helper
  audio/engine.js   Web Audio graph: EQ, limiter, analyser
  store/            library.jsx (files, covers, playlists, profile, stats) · player.jsx (queue, playback) · backup.js (export/import)
  components/       PlayerBar, FullScreen, SearchBox, EditDialog, CoverEditor, Panels, Visualizer, ui
  views/            Home, Search, Artists, Detail (artist/album), Library (playlists, device files), Videos, Profile
client/test/        node:test unit tests
```

## Notes

- Listening time counts seconds actually played; a "play" counts after about 30 seconds (or 60% of a short song).
- Videos aren't routed through the equalizer. MKV/AVI usually can't be played by browsers.
- Only add music and videos you have the right to use.

## License

MIT – see [LICENSE](LICENSE).
