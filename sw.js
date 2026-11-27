// Chess Coach service worker: lets the phone app open without internet, and quickly on a slow connection.
// - The numbers (data.json): network first, but when saved numbers exist, never wait more than 3 seconds for the
//   network: then the saved numbers show, and the download keeps going in the background and replaces the saved copy,
//   so the next opening shows the new ones. The very first visit (nothing saved yet) waits for the network.
// - Everything else (the screens, styles, text, pieces, Chart.js, icons): saved at install, then cache first.
//   chess_coach/site.py fills in VERSION from those files, so when one of them changes, this file changes too and the
//   phone downloads them again. A page visit gets the saved index.html (with internet, a newer one when there is).
const VERSION = "02b0d337dab2";
const CACHE = "chess-coach-" + VERSION;
const DATA = "./data.json";
const FILES = ["./", "./index.html", "./app.css", "./js/api.js", "./js/board.js", "./js/coach.js", "./js/dom.js", "./js/i18n.js", "./js/look.js", "./js/main.js", "./js/puzzles.js", "./js/report.js", "./js/screens/play.js", "./js/screens/progress.js", "./js/screens/review.js", "./js/screens/settings.js", "./js/screens/today.js", "./js/sections.js", "./js/sound.js", "./js/update.js", "./licenses.json", "./pieces/cburnett/bB.svg", "./pieces/cburnett/bK.svg", "./pieces/cburnett/bN.svg", "./pieces/cburnett/bP.svg", "./pieces/cburnett/bQ.svg", "./pieces/cburnett/bR.svg", "./pieces/cburnett/wB.svg", "./pieces/cburnett/wK.svg", "./pieces/cburnett/wN.svg", "./pieces/cburnett/wP.svg", "./pieces/cburnett/wQ.svg", "./pieces/cburnett/wR.svg", "./pieces/celtic/bB.svg", "./pieces/celtic/bK.svg", "./pieces/celtic/bN.svg", "./pieces/celtic/bP.svg", "./pieces/celtic/bQ.svg", "./pieces/celtic/bR.svg", "./pieces/celtic/wB.svg", "./pieces/celtic/wK.svg", "./pieces/celtic/wN.svg", "./pieces/celtic/wP.svg", "./pieces/celtic/wQ.svg", "./pieces/celtic/wR.svg", "./pieces/chessnut/bB.svg", "./pieces/chessnut/bK.svg", "./pieces/chessnut/bN.svg", "./pieces/chessnut/bP.svg", "./pieces/chessnut/bQ.svg", "./pieces/chessnut/bR.svg", "./pieces/chessnut/wB.svg", "./pieces/chessnut/wK.svg", "./pieces/chessnut/wN.svg", "./pieces/chessnut/wP.svg", "./pieces/chessnut/wQ.svg", "./pieces/chessnut/wR.svg", "./pieces/fantasy/bB.svg", "./pieces/fantasy/bK.svg", "./pieces/fantasy/bN.svg", "./pieces/fantasy/bP.svg", "./pieces/fantasy/bQ.svg", "./pieces/fantasy/bR.svg", "./pieces/fantasy/wB.svg", "./pieces/fantasy/wK.svg", "./pieces/fantasy/wN.svg", "./pieces/fantasy/wP.svg", "./pieces/fantasy/wQ.svg", "./pieces/fantasy/wR.svg", "./pieces/firi/bB.svg", "./pieces/firi/bK.svg", "./pieces/firi/bN.svg", "./pieces/firi/bP.svg", "./pieces/firi/bQ.svg", "./pieces/firi/bR.svg", "./pieces/firi/wB.svg", "./pieces/firi/wK.svg", "./pieces/firi/wN.svg", "./pieces/firi/wP.svg", "./pieces/firi/wQ.svg", "./pieces/firi/wR.svg", "./pieces/kiwen-suwi/bB.svg", "./pieces/kiwen-suwi/bK.svg", "./pieces/kiwen-suwi/bN.svg", "./pieces/kiwen-suwi/bP.svg", "./pieces/kiwen-suwi/bQ.svg", "./pieces/kiwen-suwi/bR.svg", "./pieces/kiwen-suwi/wB.svg", "./pieces/kiwen-suwi/wK.svg", "./pieces/kiwen-suwi/wN.svg", "./pieces/kiwen-suwi/wP.svg", "./pieces/kiwen-suwi/wQ.svg", "./pieces/kiwen-suwi/wR.svg", "./pieces/letter/bB.svg", "./pieces/letter/bK.svg", "./pieces/letter/bN.svg", "./pieces/letter/bP.svg", "./pieces/letter/bQ.svg", "./pieces/letter/bR.svg", "./pieces/letter/wB.svg", "./pieces/letter/wK.svg", "./pieces/letter/wN.svg", "./pieces/letter/wP.svg", "./pieces/letter/wQ.svg", "./pieces/letter/wR.svg", "./pieces/LICENSES.md", "./pieces/merida/bB.svg", "./pieces/merida/bK.svg", "./pieces/merida/bN.svg", "./pieces/merida/bP.svg", "./pieces/merida/bQ.svg", "./pieces/merida/bR.svg", "./pieces/merida/wB.svg", "./pieces/merida/wK.svg", "./pieces/merida/wN.svg", "./pieces/merida/wP.svg", "./pieces/merida/wQ.svg", "./pieces/merida/wR.svg", "./pieces/mpchess/bB.svg", "./pieces/mpchess/bK.svg", "./pieces/mpchess/bN.svg", "./pieces/mpchess/bP.svg", "./pieces/mpchess/bQ.svg", "./pieces/mpchess/bR.svg", "./pieces/mpchess/wB.svg", "./pieces/mpchess/wK.svg", "./pieces/mpchess/wN.svg", "./pieces/mpchess/wP.svg", "./pieces/mpchess/wQ.svg", "./pieces/mpchess/wR.svg", "./pieces/pixel/bB.svg", "./pieces/pixel/bK.svg", "./pieces/pixel/bN.svg", "./pieces/pixel/bP.svg", "./pieces/pixel/bQ.svg", "./pieces/pixel/bR.svg", "./pieces/pixel/wB.svg", "./pieces/pixel/wK.svg", "./pieces/pixel/wN.svg", "./pieces/pixel/wP.svg", "./pieces/pixel/wQ.svg", "./pieces/pixel/wR.svg", "./pieces/rhosgfx/bB.svg", "./pieces/rhosgfx/bK.svg", "./pieces/rhosgfx/bN.svg", "./pieces/rhosgfx/bP.svg", "./pieces/rhosgfx/bQ.svg", "./pieces/rhosgfx/bR.svg", "./pieces/rhosgfx/wB.svg", "./pieces/rhosgfx/wK.svg", "./pieces/rhosgfx/wN.svg", "./pieces/rhosgfx/wP.svg", "./pieces/rhosgfx/wQ.svg", "./pieces/rhosgfx/wR.svg", "./pieces/shapes/bB.svg", "./pieces/shapes/bK.svg", "./pieces/shapes/bN.svg", "./pieces/shapes/bP.svg", "./pieces/shapes/bQ.svg", "./pieces/shapes/bR.svg", "./pieces/shapes/wB.svg", "./pieces/shapes/wK.svg", "./pieces/shapes/wN.svg", "./pieces/shapes/wP.svg", "./pieces/shapes/wQ.svg", "./pieces/shapes/wR.svg", "./pieces/spatial/bB.svg", "./pieces/spatial/bK.svg", "./pieces/spatial/bN.svg", "./pieces/spatial/bP.svg", "./pieces/spatial/bQ.svg", "./pieces/spatial/bR.svg", "./pieces/spatial/wB.svg", "./pieces/spatial/wK.svg", "./pieces/spatial/wN.svg", "./pieces/spatial/wP.svg", "./pieces/spatial/wQ.svg", "./pieces/spatial/wR.svg", "./report.css", "./text/en.json", "./vendor/chart.js-LICENSE.md", "./vendor/chart.umd.min.js", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon.svg", "./manifest.webmanifest"];
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
      .then((names) => Promise.all(names.filter((name) => name.startsWith("chess-coach-") && name !== CACHE && name !== "chess-coach-data")
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;  // links to chess.com etc. go straight to the internet
  if (url.pathname.endsWith("/data.json")) {
    const download = downloadData(request);
    event.waitUntil(download.saved.catch(() => {}));  // keep going until the new numbers are saved
    event.respondWith(dataResponse(download.response));
  } else if (request.mode === "navigate") {
    event.respondWith(page(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

// The numbers live in their own cache, so a new version of the screens doesn't throw the saved numbers away.
function downloadData(request) {
  const response = fetch(request.url, { cache: "no-cache" });  // ask GitHub whether they changed
  const saved = response.then((fresh) => {
    if (!fresh.ok) return;
    const copy = fresh.clone();
    return caches.open("chess-coach-data").then((cache) => cache.put(DATA, copy));
  });
  return { response, saved };
}

async function dataResponse(download) {
  const saved = await (await caches.open("chess-coach-data")).match(DATA);
  if (!saved) return download.catch(() => Response.error());
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

async function page(request) {
  const saved = await caches.match("./index.html");
  try {
    const fresh = await Promise.race([fetch(request), new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS))]);
    if (fresh && fresh.ok && !fresh.redirected) return fresh;
  } catch (error) { /* no internet */ }
  return saved || fetch(request);
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
