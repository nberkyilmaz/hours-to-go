import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Copied from public/ as they are, so not in the bundle; the app's icons and manifest.
const PUBLIC_FILES = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

/**
 * Writes the service worker (src/sw.js) with every file of this build in it, and a version named
 * after them, so the app is kept on the device whole and a new version replaces it whole (D41).
 */
function serviceWorker(): Plugin {
  return {
    name: 'hours-to-go-service-worker',
    apply: 'build',
    // After Vite has added the pages to the bundle.
    enforce: 'post',
    generateBundle(_, bundle) {
      const built = Object.values(bundle).filter((f) => !f.fileName.endsWith('.map'));
      // A page is kept under its folder's address, which is the one opened.
      const files = [...built.map((f) => `./${f.fileName.replace(/index\.html$/, '')}`), ...PUBLIC_FILES.map((f) => `./${f}`)].sort();
      const hash = createHash('sha256');
      for (const f of built) hash.update(f.fileName).update(f.type === 'asset' ? f.source : f.code);
      const source = readFileSync(fileURLToPath(new URL('src/sw.js', import.meta.url)), 'utf8')
        .replace('%VERSION%', hash.digest('hex').slice(0, 12))
        .replace(`'%FILES%'`, JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // The published page lives at nberkyilmaz.com/hours-to-go/, so its build needs the path.
  // Local builds, and the server serving dist/, keep the root.
  base: process.env.VITE_BASE ?? '/',
  build: {
    rollupOptions: {
      // The app, and the privacy and terms page beside it at privacy/.
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('privacy/index.html', import.meta.url)),
        privacyFr: fileURLToPath(new URL('privacy/fr/index.html', import.meta.url)),
      },
    },
  },
  server: {
    // The API runs separately in development (npm run dev:api).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    // The whole-app tests click through a real form, and a busy machine can take seconds over it.
    testTimeout: 15_000,
    environment: 'jsdom',
    globals: false,
  },
});
