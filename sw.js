/* Excerpt Desk: keeps the app usable offline. Pages load fresh when online, so updates arrive by themselves. */
const CACHE = 'xdesk-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
/* Share from WhatsApp / Files (Android, and Windows/ChromeOS where offered): keep the files, then open the app,
   which asks which matter they belong to. */
function keepShared(files, title) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('xdesk-share', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('items', {keyPath: 'id'});
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const t = r.result.transaction('items', 'readwrite');
      t.objectStore('items').put({id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), title: title || '', files});
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    };
  });
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const files = fd.getAll('files').filter(f => f && typeof f !== 'string').map(f => ({name: f.name, type: f.type, blob: f}));
        await keepShared(files, String(fd.get('title') || fd.get('text') || '').slice(0, 80));
        return Response.redirect('./?share=1', 303);
      } catch (err) { return Response.redirect('./?share=error', 303); }
    })());
    return;
  }
  if (req.method !== 'GET') return;                       // sync calls to Google are never cached
  const url = new URL(req.url);
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r && (r.ok || r.type === 'opaque') && (url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com' || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com'))) {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy));
    }
    return r;
  })));
});
