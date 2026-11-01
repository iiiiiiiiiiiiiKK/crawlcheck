import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The site is deployed to GitHub Pages under /<repo>/.
// Override with VITE_BASE when deploying elsewhere (e.g. "/" for a custom domain).
const base = process.env.VITE_BASE ?? '/crawlcheck/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
