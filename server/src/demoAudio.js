// Server wrapper: synthesised demo WAVs as Buffers, with a small LRU so seeks/replays are instant.
import { synthPcm16, wavBytes } from './demoSynth.js';

export function synthWav(id, genre = 'Pop') {
  return Buffer.from(wavBytes(synthPcm16(id, genre)));
}

const cache = new Map();
export function getDemoWav(id, genre) {
  if (cache.has(id)) {
    const v = cache.get(id);
    cache.delete(id); cache.set(id, v);
    return v;
  }
  const wav = synthWav(id, genre);
  cache.set(id, wav);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return wav;
}
