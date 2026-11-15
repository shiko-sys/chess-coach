// Chess Coach service worker: lets the phone app open without internet.
// - The report (index.html): network first. Online you get the newest report, offline the last one saved.
// - Everything else (chart.js, icons, manifest): cache first. chess_coach/site.py fills in VERSION from these
//   files, so when one of them changes, this file changes too and the phone downloads them again.
const VERSION = "dadb713ecd4c";
const CACHE = "chess-coach-" + VERSION;
const PAGE = "./index.html";
const FILES = ["./index.html", "./apple-touch-icon.png", "./chart.umd.min.js", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon.svg", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith("chess-coach-") && name !== CACHE).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;  // links to chess.com etc. go straight to the internet
  if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // "no-cache" asks GitHub whether the report changed, instead of trusting the browser's 10-minute copy.
    let fresh = await fetch(request.url, { cache: "no-cache" });
    if (fresh.redirected) {  // a page that came through a redirect can't answer a page visit as it is
      fresh = new Response(await fresh.blob(), { status: fresh.status, headers: fresh.headers });
    }
    if (fresh.ok) await cache.put(PAGE, fresh.clone());
    return fresh;
  } catch (error) {
    const saved = await cache.match(PAGE);
    return saved || Response.error();
  }
}

async function cacheFirst(request) {
  const saved = await caches.match(request, { ignoreSearch: true });
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
