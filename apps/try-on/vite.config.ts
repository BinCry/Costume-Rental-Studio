import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The LiteRT.js Wasm runtime is served from public/litert-wasm/, kept in sync
// from node_modules by tools/copy-litert-wasm.mjs (postinstall / predev).

export default defineConfig(({ mode }) => ({
  // Production is mounted beneath the Studio origin at /try-on/.
  // During standalone development it stays at the origin root for convenience.
  base: mode === 'production' ? '/try-on/' : '/',
  build: {
    outDir: '../web/public/try-on',
    emptyOutDir: true,
  },
  plugins: [react()],
  server: {
    // The Studio web app uses 5173; reserve a separate port for this package.
    port: 5174,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
}));
