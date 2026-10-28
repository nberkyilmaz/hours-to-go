import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // The published page lives at nberkyilmaz.com/hours-to-go/, so its build needs the path.
  // Local builds, and the server serving dist/, keep the root.
  base: process.env.VITE_BASE ?? '/',
  server: {
    // The API runs separately in development (npm run dev:api).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
