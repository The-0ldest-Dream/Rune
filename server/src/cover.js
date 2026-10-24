// Deterministic SVG album art (pure string output) – used by the API and the static build.
export function coverSvg(idRaw) {
  const id = Number(idRaw) || 0;
  const h1 = (id * 47) % 360, h2 = (h1 + 40 + ((id * 13) % 90)) % 360;
  const shape = id % 3;
  const art = shape === 0
    ? `<circle cx="${30 + (id * 7) % 40}" cy="${30 + (id * 11) % 40}" r="${24 + (id % 5) * 6}" fill="hsl(${h2} 75% 70% / .55)"/>`
    : shape === 1
      ? `<rect x="${10 + (id % 6) * 6}" y="${10 + (id % 4) * 8}" width="52" height="52" transform="rotate(${(id * 17) % 90} 50 50)" fill="hsl(${h2} 75% 70% / .5)"/>`
      : `<path d="M0 ${60 + (id % 20)} Q 30 ${30 + (id % 30)} 60 ${60 + (id % 15)} T 100 ${50 + (id % 25)} V100 H0Z" fill="hsl(${h2} 75% 65% / .6)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 65% 38%)"/><stop offset="1" stop-color="hsl(${h2} 70% 22%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${art}</svg>`;
}
