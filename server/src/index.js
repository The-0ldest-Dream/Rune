import { config } from './config.js';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { scanMedia } from './scanner.js';
import { createApp } from './app.js';

const db = openDb(config.dbFile);
const seeded = seedIfEmpty(db);
if (seeded) console.log(`Seeded demo catalogue: ${seeded.artists} artists, ${seeded.albums} albums, ${seeded.tracks} tracks`);
const scan = scanMedia(db, config.mediaDir);
if (scan.added || scan.removed) console.log(`Media scan: +${scan.added} / -${scan.removed} files`);

createApp(db).listen(config.port, () => console.log(`Rune API listening on http://localhost:${config.port}`));
