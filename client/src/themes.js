// Colour themes. A theme is a handful of colours; everything else (hover, borders, menus…) is derived so presets stay consistent.
const KEY = 'rune.theme';

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
export const luminance = (h) => { const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Black or white text, whichever reads better on `bg`. */
export const readable = (bg) => (ratio(bg, '#0b0b0d') >= ratio(bg, '#ffffff') ? '#0b0b0d' : '#ffffff');

/** Builds the full variable set from a few colours. */
export function buildVars({ bg, panel, accent, text }) {
  const t = text || (luminance(panel) > 0.5 ? '#14161a' : '#f5f5f7');
  const light = luminance(t) < 0.4;
  return {
    '--bg': bg, '--panel': panel, '--text': t,
    '--elev': mix(panel, t, 0.045), '--hover': mix(panel, t, 0.1), '--line': mix(panel, t, 0.12), '--line-strong': mix(panel, t, 0.32),
    '--menu': mix(panel, t, light ? 0 : 0.09), '--track': mix(panel, t, 0.26), '--muted': mix(t, panel, 0.34),
    '--accent': accent, '--accent-ink': readable(accent), '--on-text': readable(t),
    '--ov': light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.07)', '--ov-strong': light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.16)',
    '--ov-border': light ? 'rgba(0,0,0,.32)' : 'rgba(255,255,255,.45)', '--scheme': light ? 'light' : 'dark',
  };
}

export const THEMES = [
  { id: 'rune', name: 'Rune', spec: { bg: '#000000', panel: '#121212', accent: '#1ed760', text: '#ffffff' } },
  { id: 'midnight', name: 'Midnight', spec: { bg: '#04060d', panel: '#0d1220', accent: '#6ea8ff', text: '#eef2ff' } },
  { id: 'graphite', name: 'Graphite', spec: { bg: '#0a0a0b', panel: '#17171a', accent: '#cfd3da', text: '#f2f2f3' } },
  { id: 'ember', name: 'Ember', spec: { bg: '#0b0705', panel: '#181008', accent: '#ff8a3d', text: '#fff4ec' } },
  { id: 'rose', name: 'Rosewood', spec: { bg: '#0d0709', panel: '#1a1014', accent: '#f2879f', text: '#fff1f4' } },
  { id: 'forest', name: 'Forest', spec: { bg: '#050a07', panel: '#0e1710', accent: '#8bd450', text: '#f0f8ec' } },
  { id: 'ocean', name: 'Ocean', spec: { bg: '#031014', panel: '#09191f', accent: '#3dd6d0', text: '#eafcfb' } },
  { id: 'violet', name: 'Violet', spec: { bg: '#08060e', panel: '#130f1f', accent: '#b794ff', text: '#f4efff' } },
  { id: 'mono', name: 'Mono', spec: { bg: '#000000', panel: '#0a0a0a', accent: '#ffffff', text: '#ffffff' } },
  { id: 'daylight', name: 'Daylight', spec: { bg: '#e6e9ee', panel: '#ffffff', accent: '#159947', text: '#14161a' } },
  { id: 'sand', name: 'Sand', spec: { bg: '#e9e2d6', panel: '#f7f2e9', accent: '#c0561b', text: '#2a241d' } },
];
export const DEFAULT_CUSTOM = { bg: '#0b0f14', panel: '#151b23', accent: '#ff5d8f' };

let current = { id: 'rune', custom: DEFAULT_CUSTOM };
const subs = new Set();

export function loadTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    if (t && (t.id === 'custom' || THEMES.some((x) => x.id === t.id))) return { id: t.id, custom: { ...DEFAULT_CUSTOM, ...t.custom } };
  } catch { /* fall through */ }
  return { id: 'rune', custom: DEFAULT_CUSTOM };
}

export const varsFor = (theme) => buildVars(theme.id === 'custom' ? theme.custom : (THEMES.find((t) => t.id === theme.id) || THEMES[0]).spec);

export function applyTheme(theme) {
  current = theme;
  const vars = varsFor(theme), root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) k === '--scheme' ? (root.style.colorScheme = v) : root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--bg']);
  subs.forEach((fn) => fn(current));
}
export function setTheme(theme) {
  try { localStorage.setItem(KEY, JSON.stringify(theme)); } catch { /* storage blocked */ }
  applyTheme(theme);
}
export const getTheme = () => current;
export const subscribeTheme = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const applyStoredTheme = () => applyTheme(loadTheme());
