// Lets the app open with no signal. Pages load from the network when it answers within a few
// seconds (so updates show straight away) and fall back to the copy saved on the phone otherwise.
// Scores still sync through Firebase, which keeps its own offline queue.
const CACHE = 'jb-golf-v1';
const FIREBASE = [
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js'
];
const APP_FILES = ['./', './index.html', './logo.png', './manifest.json'];
const NETWORK_WAIT_MS = 4000;

self.addEventListener('install', event => {
    // The app's own files must be saved; the Firebase files are saved if they can be (and again on the next online load)
    event.waitUntil(caches.open(CACHE).then(cache => Promise.all([
        cache.addAll(APP_FILES),
        Promise.allSettled(FIREBASE.map(url => cache.add(new Request(url, { mode: 'no-cors' }))))
    ])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    let req = event.request;
    if (req.method !== 'GET') return;
    let url = new URL(req.url);
    let ours = url.origin === self.location.origin;
    if (!ours && !FIREBASE.includes(req.url)) return; // Firestore traffic and everything else goes straight through

    event.respondWith((async () => {
        let cache = await caches.open(CACHE);
        let fromNetwork = fetch(req).then(res => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
        });
        let timeout = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT_MS, null));
        try {
            let res = await Promise.race([fromNetwork, timeout]);
            if (res) return res;
        } catch (e) { /* offline */ }
        // ?cart=1 and ?spectator=true are the same page
        let saved = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
        return saved || fromNetwork;
    })());
});
