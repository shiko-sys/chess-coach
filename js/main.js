// Chess Coach's screens: start-up, the sidebar (the phone's tab bar), moving between sections, and the update status.
// Each section is a module in js/screens with render(main, ctx, sub). The address keeps the section ("#review/games"),
// so the Back button and a refresh come back to the same place.

import * as api from "./api.js";
import { $, ago, duration, el, hidePop, n, toast } from "./dom.js";
import { loadText, t } from "./i18n.js";
import { applyLook } from "./look.js";

const ICONS = {
  today: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  play: '<circle cx="12" cy="6.2" r="2.9"/><path d="M9.6 9.6c-.4 3-1.6 5.4-3 7.2h10.8c-1.4-1.8-2.6-4.2-3-7.2M5.5 20.5h13l-1.1-3.7H6.6z"/>',
  review: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4l5.1 5.1M7.8 10.5h5.4"/>',
  progress: '<path d="M3.5 17.5l5.2-5.6 3.8 3.4 7.8-8.6"/><path d="M15.3 6.7h5v5"/><path d="M3.5 21h17"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.3"/><circle cx="9" cy="17" r="2.3"/>',
};
const SECTIONS = api.PHONE ? ["today", "review", "progress", "settings"] : ["today", "play", "review", "progress"];
const LOADERS = {
  today: () => import("./screens/today.js"),
  play: () => import("./screens/play.js"),
  review: () => import("./screens/review.js"),
  progress: () => import("./screens/progress.js"),
  settings: () => import("./screens/settings.js"),
};

// What every screen gets: the data, the settings, and ways to move around and save.
export const ctx = {
  state: null,        // /api/state: settings, folders, the update's progress
  data: null,         // the numbers of the last update (app_data.json / data.json)
  screen: null,
  busyScreen: false,  // true while a puzzle or a game is on the board: new numbers wait instead of redrawing
  go,
  saveSettings,
  refreshState,
  reloadData,
  onStatus: new Set(),
  setCount,
};

function icon(name) {
  const span = el("span");
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}

function buildShell() {
  const list = $("#nav-list");
  list.replaceChildren(...SECTIONS.filter((id) => id !== "settings").map((id) =>
    el("button", { class: "nav", type: "button", "data-go": id }, icon(id), el("span", "label", t("nav." + id)),
      id === "today" ? el("span", { class: "count", id: "nav-count", hidden: true }) : null)));
  $("#nav-settings").replaceChildren(icon("settings"), el("span", "label", t("nav.settings")));
  $("#tabbar").replaceChildren(...SECTIONS.map((id) =>
    el("button", { type: "button", "data-go": id }, icon(id), t("nav." + id),
      id === "today" ? el("span", { class: "count", id: "tab-count", hidden: true }) : null)));
  $("#brand-user").textContent = ctx.state.settings.username || (ctx.data && ctx.data.player) || "";
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-go]");
    if (!target) return;
    event.preventDefault();
    go(target.dataset.go);
  });
  $("#sync").addEventListener("click", () => go("settings", "data"));
}

function setCount(count) {
  for (const id of ["#nav-count", "#tab-count"]) {
    const badge = $(id);
    if (!badge) continue;
    badge.hidden = !count;
    badge.textContent = count;
  }
}

function readHash() {
  const [screen, sub] = location.hash.replace(/^#/, "").split("/");
  return { screen: LOADERS[screen] && (SECTIONS.includes(screen) || screen === "settings") ? screen : "today", sub };
}

export function go(screen, sub) {
  const hash = "#" + screen + (sub ? "/" + sub : "");
  if (location.hash !== hash) location.hash = hash;
  else route();
}

let routing = 0;
async function route() {
  hidePop();
  const { screen, sub } = readHash();
  const ticket = ++routing;
  for (const b of document.querySelectorAll("[data-go]")) {
    if (b.classList.contains("nav") || b.closest(".tabbar")) {
      b.toggleAttribute("aria-current", b.dataset.go === screen);
      if (b.dataset.go === screen) b.setAttribute("aria-current", "page");
    }
  }
  const main = $("#main");
  ctx.busyScreen = false;
  try {
    const module = await LOADERS[screen]();
    if (ticket !== routing) return;
    if (ctx.screen && ctx.screen.leave) ctx.screen.leave();
    ctx.screen = module;
    main.replaceChildren();
    window.scrollTo(0, 0);
    await module.render(main, ctx, sub);
    if (ctx.afterRender) { const after = ctx.afterRender; ctx.afterRender = null; requestAnimationFrame(after); }
  } catch (error) {
    console.error(error);
    main.replaceChildren(el("div", "card", el("h2", null, t("app.error", { message: error.message }))));
  }
}

async function saveSettings(patch) {
  try {
    ctx.state = await api.saveSettings(patch);
    if (patch.look) applyLook(ctx.state.settings.look);
    return ctx.state;
  } catch (error) {
    toast(error.message, true);
    throw error;
  }
}

async function refreshState() {
  ctx.state = await api.state();
  return ctx.state;
}

async function reloadData() {
  try {
    ctx.data = await api.data();
  } catch (error) {
    ctx.data = null;
  }
  return ctx.data;
}

// ---------------------------------------------------------------- the update status (sidebar card)
export function updateText(u) {
  if (!u || !u.state) {  // no update since the app came: the numbers still say when they were made
    if (ctx.data && ctx.data.generated) return { title: t("sync.up_to_date"), dot: "dot-ok", line: t("sync.last", { when: ago(ctx.data.generated) }) };
    return { title: t("sync.never"), dot: "dot-bad", line: "" };
  }
  if (u.running) {
    const step = u.key ? t("update.steps." + u.key) : t("update.running");
    let line = step;
    if (u.total) line += " · " + t("update.positions", { done: n(u.done), total: n(u.total) });
    if (u.eta) line += " · " + t("update.left", { time: duration(u.eta) });
    return { title: t("sync.running"), dot: "dot-run", line, share: u.total ? u.done / u.total : null, step: u.step, steps: u.steps };
  }
  if (u.state === "failed") return { title: t("sync.failed"), dot: "dot-bad", line: u.error || "" };
  if (u.state === "stopped") return { title: t("sync.stopped"), dot: "dot-bad", line: u.finished ? ago(u.finished) : "" };
  return { title: t("sync.up_to_date"), dot: "dot-ok", line: u.finished ? t("sync.last", { when: ago(u.finished) }) : "" };
}

function drawSync() {
  const card = $("#sync");
  if (api.PHONE) return;
  const u = ctx.state.update;
  const info = updateText(u);
  const games = ctx.data && ctx.data.scopes ? ctx.data.scopes.all.summary.games : null;
  const parts = [el("b", null, el("i", info.dot), info.title)];
  if (info.line) parts.push(el("span", null, info.line));
  if (u && u.running) {
    const bar = el("div", "bar" + (info.share == null ? " indeterminate" : ""), el("i", { style: { width: Math.round((info.share || 0) * 100) + "%" } }));
    parts.push(bar);
  } else if (games != null) {
    const analyzed = ctx.data.scopes.all.engine ? ctx.data.scopes.all.engine.games : games;
    parts.push(el("span", null, analyzed >= games ? t("sync.games", { games: n(games) }) : t("sync.games_some", { games: n(games), analyzed: n(analyzed) })));
  }
  card.replaceChildren(...parts);
}

let pollTimer = null;
let lastStamp = null;
let wasRunning = false;
async function poll() {
  clearTimeout(pollTimer);
  try {
    await refreshState();
    const u = ctx.state.update || {};
    const stamp = ctx.state.data && ctx.state.data.stamp;
    if (stamp && stamp !== lastStamp) {
      const first = lastStamp === null;
      lastStamp = stamp;
      if (!first) {
        await reloadData();
        if (!ctx.busyScreen) route();
        toast(t("app.new_numbers"));
      }
    }
    if (wasRunning && !u.running && u.state === "done") {
      const s = u.summary || {};
      toast(s.new_games ? t("update.done", { new_games: n(s.new_games), new_puzzles: n(s.new_puzzles || 0) }) : t("update.done_none"));
    }
    wasRunning = Boolean(u.running);
    drawSync();
    for (const fn of ctx.onStatus) fn(ctx.state);
  } catch (error) { /* the server went away (the app is closing): try again later */ }
  pollTimer = setTimeout(poll, wasRunning ? 1500 : 20000);
}
export function pollSoon() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, 300);
}
ctx.pollSoon = pollSoon;

// ---------------------------------------------------------------- first start: which chess.com account?
function welcome() {
  const main = $("#main");
  $("#app").classList.add("first-start");
  const user = el("input", { class: "input", id: "w-user", autocomplete: "off", spellcheck: "false", required: true });
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const zone = el("select", { class: "input", id: "w-zone" }, ...(zones.length ? zones : [here]).map((z) => el("option", { value: z, selected: z === here }, z.replace(/_/g, " "))));
  const msg = el("div", "msg");
  const button = el("button", { class: "btn primary big", type: "submit" }, t("welcome.start"));
  const form = el("form", null, el("label", { for: "w-user" }, t("welcome.username")), user,
    el("label", { for: "w-zone" }, t("welcome.timezone")), zone, msg, button, el("p", "fine", t("welcome.after")));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    msg.className = "msg";
    msg.textContent = t("welcome.checking");
    try {
      const found = await api.post("/api/check-user", { username: user.value });
      if (found.found === false) throw new Error(t("welcome.not_found"));
      if (found.found === null) throw new Error(t("welcome.offline"));
      await saveSettings({ username: found.username, timezone: zone.value });
      await api.post("/api/update");
      $("#app").classList.remove("first-start");
      location.hash = "#settings/data";
      start();
    } catch (error) {
      msg.className = "msg bad";
      msg.textContent = error.message;
      button.disabled = false;
    }
  });
  main.replaceChildren(el("div", "welcome", el("div", "logo", el("img", { src: "icon.svg", alt: "" })),
    el("h1", null, t("welcome.title")), el("p", null, t("welcome.text")), form));
  user.focus();
}

// ---------------------------------------------------------------- start
let started = false;
async function start() {
  if (!ctx.data && ctx.state.data && ctx.state.data.ready) await reloadData();
  lastStamp = ctx.state.data ? ctx.state.data.stamp : null;
  if (!started) {
    started = true;
    buildShell();
    window.addEventListener("hashchange", route);
  }
  $("#brand-user").textContent = ctx.state.settings.username || (ctx.data && ctx.data.player) || "";
  drawSync();
  route();
  if (!api.PHONE) poll();
  // The puzzles left today, on the Today button (without opening Today).
  import("./screens/today.js").then((m) => m.countToday(ctx)).then(setCount).catch(() => {});
}

async function boot() {
  api.init();
  try {
    await loadText("en");
    ctx.state = await api.state();
    applyLook(ctx.state.settings.look);
    if (!api.PHONE && !ctx.state.settings.username) {
      welcome();
      return;
    }
    await start();
  } catch (error) {
    console.error(error);
    $("#main").replaceChildren(el("div", "card", el("h2", null, "Chess Coach couldn't start"), el("p", null, error.message)));
  }
}

boot();
