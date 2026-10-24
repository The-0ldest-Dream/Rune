import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two build flavours:
//   npm run build         → talks to the Express API (default)
//   npm run build:static  → fully in-browser build for GitHub Pages (mode "static")
export default defineConfig(({ mode }) => {
  const isStatic = mode === 'static';
  return {
    plugins: [react()],
    // GitHub Pages serves project sites from /<repo-name>/ (the workflow sets BASE_PATH automatically).
    base: isStatic ? process.env.BASE_PATH || '/rune/' : '/',
    define: { __STATIC__: JSON.stringify(isStatic) },
    // In development the API runs on :3001; proxying keeps everything same-origin,
    // which the Web Audio equalizer requires for streamed audio.
    server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
    build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 600 },
  };
});
