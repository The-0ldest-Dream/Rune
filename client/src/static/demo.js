// Renders demo songs in the browser: src "demo:<id>:<genre>" → WAV Blob (cached, last 12).
import { synthPcm16, wavBytes } from '../../../server/src/demoSynth.js';

const cache = new Map();
export function demoBlob(src) {
  if (cache.has(src)) return cache.get(src);
  const [, id, ...genre] = src.split(':');
  const blob = new Blob([wavBytes(synthPcm16(Number(id), genre.join(':') || 'Pop'))], { type: 'audio/wav' });
  cache.set(src, blob);
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return blob;
}
