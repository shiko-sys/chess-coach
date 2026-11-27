// Where the screens get their data. In the app: the local server (app/server.py), with the token the window was
// opened with. In the phone app (the same screens on GitHub Pages): the site's data.json, and the phone's own storage
// for the look and the puzzle progress (the same storage key and format the old phone report used, so its progress
// carries over).

import { DEFAULT_LOOK } from "./look.js";

export const PHONE = document.documentElement.dataset.mode === "phone";
const TOKEN_KEY = "chess-coach-token";
const LOOK_KEY = "chess-coach-look";
const PUZZLES_KEY = "chess-coach-puzzles";
let token = "";

export function init() {
  if (PHONE) return;
  const params = new URLSearchParams(location.search);
  token = params.get("t") || sessionStorage.getItem(TOKEN_KEY) || "";
  if (params.get("t")) {
    sessionStorage.setItem(TOKEN_KEY, token);
    history.replaceState(null, "", location.pathname + location.hash);  // keep the token out of sight
  }
}

async function call(method, path, body) {
  const headers = { "X-Token": token };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method, headers, cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await response.json(); } catch (e) { /* not JSON */ }
  if (!response.ok) {
    const error = new Error((data && data.error) || response.statusText);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const get = (path) => call("GET", path);
export const post = (path, body = {}) => call("POST", path, body);

function phoneLook() {
  try { return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(LOOK_KEY) || "{}") }; } catch (e) { return { ...DEFAULT_LOOK }; }
}

export async function state() {
  if (!PHONE) return get("/api/state");
  return { phone: true, settings: { look: phoneLook(), language: "en", username: "" }, data: { ready: true }, update: {} };
}

export async function data() {
  if (!PHONE) return get("/api/data");
  const response = await fetch("data.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("data.json: " + response.status);
  return response.json();
}

export async function saveSettings(patch) {
  if (!PHONE) return post("/api/settings", patch);
  if (patch.look) localStorage.setItem(LOOK_KEY, JSON.stringify({ ...phoneLook(), ...patch.look }));
  return state();
}

export async function puzzleState() {
  if (!PHONE) return get("/api/puzzles");
  try { return JSON.parse(localStorage.getItem(PUZZLES_KEY) || "null") || {}; } catch (e) { return {}; }
}

export async function savePuzzleState(value) {
  if (!PHONE) return post("/api/puzzles", value);
  try { localStorage.setItem(PUZZLES_KEY, JSON.stringify(value)); } catch (e) { /* storage blocked: progress lasts until the page closes */ }
  return { saved: true };
}

export function openOutside(url) {
  if (PHONE) { window.open(url, "_blank", "noopener"); return; }
  post("/api/open", { what: "url", url }).catch(() => window.open(url, "_blank", "noopener"));
}

export function openFolder(what) {
  return post("/api/open", { what });
}
