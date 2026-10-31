import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // The published page lives at nberkyilmaz.com/hours-to-go/, so its build needs the path.
  // Local builds, and the server serving dist/, keep the root.
  base: process.env.VITE_BASE ?? '/',
  build: {
    rollupOptions: {
      // The app, and the privacy and terms page beside it at privacy/.
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('privacy/index.html', import.meta.url)),
      },
    },
  },
  server: {
    // The API runs separately in development (npm run dev:api).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
