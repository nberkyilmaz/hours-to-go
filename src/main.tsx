import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/b612/400.css';
import '@fontsource/b612/700.css';
import { App } from './App';
import { locale } from './i18n';
import './styles.css';

document.documentElement.lang = locale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Keeps the app on this device, so it opens at the airport with no signal (D41). Built pages only:
// in development it would serve old files over the ones being changed.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Without it the app still works online; it just won't open offline.
    });
  });
}
