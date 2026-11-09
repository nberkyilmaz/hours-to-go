// The service worker (D41): keeps the app itself on this device, so it opens with no signal at the
// airport. The logbook is useLogbook's business (it keeps the signed-in copy and the changes
// waiting); this keeps only the pages, their scripts, styles and fonts, and the icons.
//
// The build (vite.config.ts) writes in every file of this version and a name made from them, so a
// new version is kept whole when it installs and the last one's files go when it takes over.

const VERSION = '%VERSION%';
const FILES = '%FILES%';
const CACHE = `hours-to-go-${VERSION}`;
/** How long opening the app waits for the network before it shows the copy kept here. */
const WAIT_MS = 4000;
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('hours-to-go-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Only this site's own files. The API's answers are the pilot's, and the app decides what to do
  // when it can't reach it.
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (url.pathname.startsWith(`${SCOPE}api/`)) return;
  event.respondWith(request.mode === 'navigate' ? page(event, url) : file(event, url));
});

/**
 * A page: from the network when it answers in time, so a new version shows at once, and kept for
 * next time; otherwise the copy kept here. A weak signal at the airport can hang for a minute.
 */
async function page(event, url) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname.replace(/index\.html$/, '');
  const network = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(key, response.clone());
    return response;
  });
  const late = new Promise((resolve) => setTimeout(resolve, WAIT_MS, null));
  const first = await Promise.race([network.catch(() => null), late]);
  if (first) return first;
  // Answered from here; the network may still bring the new version for next time.
  event.waitUntil(network.catch(() => undefined));
  return (await cache.match(key)) ?? network;
}

/**
 * Anything else: the copy kept here when there is one. Built files are named by their content, so a
 * kept one is never out of date; the icons and the manifest are fetched again for next time.
 */
async function file(event, url) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(event.request);
  const fetchAndKeep = () =>
    fetch(event.request).then(async (response) => {
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    });
  if (!kept) return fetchAndKeep();
  if (!url.pathname.startsWith(`${SCOPE}assets/`)) event.waitUntil(fetchAndKeep().catch(() => undefined));
  return kept;
}
