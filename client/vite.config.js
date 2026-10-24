import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites from /<repo-name>/ – the deploy workflow sets BASE_PATH for you.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 600 },
});
