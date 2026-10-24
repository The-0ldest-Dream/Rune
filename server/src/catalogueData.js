// Pure catalogue generator (no Node APIs) – shared by the server seeder and the static GitHub Pages build.
export const GENRES = ['Pop', 'Rock', 'Electronic', 'Jazz', 'Classical', 'Hip-Hop', 'Ambient', 'Folk', 'Lo-fi', 'Funk'];

const ADJ = ['Velvet', 'Neon', 'Quiet', 'Paper', 'Golden', 'Hollow', 'Electric', 'Lunar', 'Crimson', 'Silver', 'Wild', 'Slow', 'Distant', 'Brass', 'Glass', 'Northern', 'Faded', 'Midnight', 'Amber', 'Static', 'Gentle', 'Rusty', 'Sunken', 'Bright'];
const NOUN = ['Harbor', 'Engines', 'Orchard', 'Signals', 'Tide', 'Garden', 'Caravan', 'Echoes', 'Lanterns', 'Meadow', 'Circuit', 'Parade', 'Compass', 'Shadows', 'Rivers', 'Satellites', 'Windows', 'Canyon', 'Bridges', 'Ravens', 'Station', 'Atlas', 'Pilots', 'Fields'];
const FIRST = ['Mara', 'Jonah', 'Ines', 'Theo', 'Priya', 'Luca', 'Noor', 'Kai', 'Elena', 'Omar', 'Sana', 'Felix', 'Aiko', 'Diego', 'Freya', 'Ravi', 'Zoe', 'Mateo', 'Leila', 'Anders'];
const LAST = ['Okafor', 'Lindqvist', 'Moreau', 'Tanaka', 'Silva', 'Haddad', 'Novak', 'Reyes', 'Kowalski', 'Bianchi', 'Sharma', 'Dubois', 'Ito', 'Mbeki', 'Larsen', 'Costa'];
const W1 = ['Falling', 'Golden', 'Last', 'Open', 'Blue', 'Burning', 'Soft', 'Long', 'Broken', 'Rising', 'Secret', 'Green', 'Paper', 'Late', 'Small', 'Thousand'];
const W2 = ['Light', 'Hour', 'Road', 'Summer', 'Machine', 'Letter', 'Season', 'Weather', 'Promise', 'Feeling', 'Window', 'Radio', 'Season', 'Story', 'Morning', 'Skyline'];
const VERB = ['Chasing', 'Waiting for', 'Dancing with', 'Counting', 'Following', 'Borrowing', 'Leaving', 'Finding', 'Painting', 'Remember'];
const PLACE = ['Lisbon', 'Osaka', 'July', 'Valparaíso', 'the Rain', 'Berlin', 'Slow Motion', 'Marseille', 'Reverse', 'Technicolor', 'Nairobi', 'Reykjavík'];

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns { artists, albums, tracks } with sequential 1-based ids; fully deterministic for a given seed. */
export function generateCatalogue({ artists: artistCount = 140, seed = 42 } = {}) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const used = new Set();
  const title = () => {
    const p = r();
    return p < 0.4 ? `${pick(W1)} ${pick(W2)}` : p < 0.7 ? `${pick(VERB)} ${pick(NOUN)}` : `${pick(NOUN)} in ${pick(PLACE)}`;
  };
  const artists = [], albums = [], tracks = [];

  for (let i = 0; i < artistCount; i++) {
    let name;
    do {
      const p = r();
      name = p < 0.5 ? `${pick(ADJ)} ${pick(NOUN)}` : p < 0.75 ? `The ${pick(ADJ)} ${pick(NOUN)}` : `${pick(FIRST)} ${pick(LAST)}`;
    } while (used.has(name));
    used.add(name);
    const genre = GENRES[i % GENRES.length];
    const artist = { id: artists.length + 1, name, genre };
    artists.push(artist);
    const albumCount = 2 + Math.floor(r() * 3);
    for (let a = 0; a < albumCount; a++) {
      const album = { id: albums.length + 1, title: title(), artist_id: artist.id, year: 1985 + Math.floor(r() * 41), genre };
      albums.push(album);
      const trackCount = 8 + Math.floor(r() * 7);
      for (let t = 1; t <= trackCount; t++) {
        tracks.push({ id: tracks.length + 1, title: title(), artist_id: artist.id, album_id: album.id, track_no: t, duration: 30, genre });
      }
    }
  }
  return { artists, albums, tracks };
}
