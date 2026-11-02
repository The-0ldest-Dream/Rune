// "Reduce effects": turns off the beat glow, blur and page transitions. Also follows the system "reduce motion" setting.
const KEY = 'rune.reduceFx';
export const getReduceFx = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const prefersReduced = () => getReduceFx() || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function setReduceFx(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  document.documentElement.dataset.fx = on ? 'reduced' : '';
}
export const applyStoredFx = () => { document.documentElement.dataset.fx = getReduceFx() ? 'reduced' : ''; };
