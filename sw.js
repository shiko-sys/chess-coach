// Chess Coach service worker: lets the phone app open without internet, and quickly on a slow connection.
// - The report (index.html): network first, but when a saved report exists, never wait more than 3 seconds for
//   the network: then the saved report opens, and the download keeps going in the background and replaces the saved
//   copy, so the next opening shows the new report. The very first visit (nothing saved yet) waits for the network.
// - Everything else (chart.js, icons, manifest): cache first. chess_coach/site.py fills in VERSION from these
//   files, so when one of them changes, this file changes too and the phone downloads them again.
const VERSION = "ff4145637a4f";
const CACHE = "chess-coach-" + VERSION;
const PAGE = "./index.html";
const FILES = ["./index.html", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon.svg", "./manifest.webmanifest", "./chart.js-LICENSE.md", "./chart.umd.min.js"];
const NETWORK_TIMEOUT_MS = 3000;

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
    const download = downloadReport(request);
    // Keep the service worker alive until the new report is saved, even when the saved one answered first.
    event.waitUntil(download.saved.catch(() => {}));
    event.respondWith(reportResponse(download.response));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

// Start downloading the newest report: { response, saved }. `saved` settles once the copy is in the cache.
function downloadReport(request) {
  // "no-cache" asks GitHub whether the report changed, instead of trusting the browser's 10-minute copy.
  const response = fetch(request.url, { cache: "no-cache" }).then(async (fresh) => {
    if (fresh.redirected) {  // a page that came through a redirect can't answer a page visit as it is
      fresh = new Response(await fresh.blob(), { status: fresh.status, headers: fresh.headers });
    }
    return fresh;
  });
  const saved = response.then((fresh) => {
    if (!fresh.ok) return;
    const copy = fresh.clone();  // right away, before the page starts reading the response
    return caches.open(CACHE).then((cache) => cache.put(PAGE, copy));
  });
  return { response, saved };
}

// The new report if it arrives within NETWORK_TIMEOUT_MS, else the saved one (at once when there's no internet).
async function reportResponse(download) {
  const saved = await (await caches.open(CACHE)).match(PAGE);
  if (!saved) return download.catch(() => Response.error());  // first visit: nothing saved, so wait for the network
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS); });
  try {
    const fresh = await Promise.race([download, timeout]);
    return fresh && fresh.ok ? fresh : saved;
  } catch (error) {
    return saved;  // no internet
  } finally {
    clearTimeout(timer);
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
