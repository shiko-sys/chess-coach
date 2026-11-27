// Settings: the look (themes, board colors, pieces, highlights, animation, sounds), the account, the analysis, the
// bot, updates and data, the phone app, the language and the licenses. Every change is saved at once.

import * as api from "../api.js";
import { ago, duration, el, fmtDate, helpButton, n, seg, toast, toggle } from "../dom.js";
import { t } from "../i18n.js";
import { applyLook, ARROWS, BOARDS, HIGHLIGHTS, look, PIECE_SETS, pieceUrl } from "../look.js";
import { Board } from "../board.js";
import { play as playSound } from "../sound.js";
import { updatePanel } from "../update.js";

const PAGES = api.PHONE ? ["look", "licenses"] : ["look", "account", "analysis", "bot", "data", "phone", "language", "licenses"];
const DEPTHS = [["fast", 100_000], ["normal", 200_000], ["deep", 500_000], ["max", 1_000_000]];
// The first full check: about 7 hours for 7,965 games at 200,000 nodes with 4 copies (README, Engine analysis).
const SECONDS_PER_GAME = (7 * 3600) / 7965;

let ctx = null;
let previewBoard = null;

export function leave() {
  if (previewBoard) previewBoard.destroy();
  previewBoard = null;
}

export async function render(main, context, sub) {
  ctx = context;
  const page = PAGES.includes(sub) ? sub : "look";
  const nav = el("nav", { class: "snav", "aria-label": t("settings.kicker") });
  PAGES.forEach((id) => {
    if (id === "licenses" && PAGES.length > 2) nav.append(el("hr"));
    nav.append(el("button", { type: "button", "aria-current": id === page ? "page" : null, onclick: () => ctx.go("settings", id) },
      t("settings.pages." + id)));
  });
  const body = el("div");
  main.append(el("header", "top", el("div", null, el("p", "kicker", t("settings.kicker")), el("h1", null, t("settings.title")))),
    el("div", "settings", nav, body));
  await PAGE_RENDER[page](body);
}

const settings = () => ctx.state.settings;

async function save(patch, message = true) {
  await ctx.saveSettings(patch);
  if (message) toast(t("app.saved"));
}

function field(name, hint, helpKey, ...content) {
  return el("div", "field", el("div", "name", el("b", null, name, helpKey ? helpButton(helpKey.key || helpKey, helpKey.vars) : null),
    hint ? el("p", null, hint) : null), el("div", null, ...content));
}

// ---------------------------------------------------------------- Look
function changeLook(key, value) {
  applyLook({ ...look(), [key]: value });  // at once, then saved
  save({ look: { [key]: value } }, false).catch(() => {});
}

function lookPage(body) {
  const L = look();
  const tiles = (items, current, make, key) => {
    const box = el("div", "tiles");
    for (const item of items) {
      const button = el("button", { class: "tile", type: "button", "aria-pressed": String(item[0] === current) }, ...make(item));
      button.addEventListener("click", () => {
        box.querySelectorAll(".tile").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        changeLook(key, item[0]);
        if (key === "board") drawPieceTiles();
      });
      box.append(button);
    }
    return box;
  };
  const boardTiles = tiles(BOARDS, L.board, ([id, light, dark]) => [
    el("div", "checker", ...Array.from({ length: 16 }, (_, i) => el("span", { style: { background: (Math.floor(i / 4) + i) % 2 ? dark : light } }))),
    t("boards." + id)], "board");
  const pieceBox = el("div");
  function drawPieceTiles() {
    const [, light, dark] = BOARDS.find((b) => b[0] === look().board) || BOARDS[0];
    pieceBox.replaceChildren(tiles(PIECE_SETS, look().pieces, ([id, name]) => [
      el("div", "pieces-pair", el("span", { style: { background: light } }, el("img", { src: pieceUrl("wN", id), alt: "" })),
        el("span", { style: { background: dark } }, el("img", { src: pieceUrl("bQ", id), alt: "" }))),
      name, el("small", null, LICENSES[id] || "")], "pieces"));
  }
  drawPieceTiles();
  const swatches = (key, list) => {
    const box = el("div", "swatches");
    for (const item of list) {
      const b = el("button", { class: "sw", type: "button", "aria-pressed": String(look()[key] === item[0]), title: t("colors." + item[0]),
        "aria-label": t("colors." + item[0]), style: { background: item[1] } });
      b.addEventListener("click", () => {
        box.querySelectorAll(".sw").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        changeLook(key, item[0]);
      });
      box.append(b);
    }
    return box;
  };
  const volume = el("input", { type: "range", min: 0, max: 1, step: 0.05, value: L.volume, "aria-label": t("settings.look.volume") });
  volume.addEventListener("change", () => changeLook("volume", Number(volume.value)));
  const controls = el("div", null,
    el("div", "group", el("h3", null, t("settings.look.theme")), el("p", "hint", t("settings.look.theme_hint")),
      seg(["light", "dark", "system"].map((v) => [v, t("settings.look.themes." + v)]), L.theme, (v) => changeLook("theme", v))),
    el("div", "group", el("h3", null, t("settings.look.boards")), el("p", "hint", t("settings.look.boards_hint")), boardTiles),
    el("div", "group", el("h3", null, t("settings.look.pieces")), el("p", "hint", t("settings.look.pieces_hint")), pieceBox),
    el("div", "group", el("h3", null, t("settings.look.highlights")),
      el("div", "row", el("span", null, t("settings.look.last")), swatches("last", HIGHLIGHTS)),
      el("div", "row", el("span", null, t("settings.look.sel")), swatches("sel", HIGHLIGHTS)),
      el("div", "row", el("span", null, t("settings.look.arrow")), swatches("arrow", ARROWS))),
    el("div", "group", el("h3", null, t("settings.look.speed")), el("p", "hint", t("settings.look.speed_hint")),
      seg(["off", "fast", "normal", "slow"].map((v) => [v, t("settings.look.speeds." + v)]), L.speed, (v) => changeLook("speed", v))),
    el("div", "group", el("h3", null, t("settings.look.sounds")),
      el("div", "row", el("span", null, t("settings.look.sound")), toggle(L.sound, (v) => changeLook("sound", v))),
      el("div", "row", el("span", null, t("settings.look.volume")), el("span", "range-row", volume,
        el("button", { class: "btn small", type: "button", onclick: () => { playSound("move"); setTimeout(() => playSound("capture"), 380); } }, t("settings.look.test"))))),
    el("div", "group", el("h3", null, t("settings.look.board")),
      el("div", "row", el("span", null, t("settings.look.coords")), toggle(L.coords, (v) => { changeLook("coords", v); previewBoard.draw(); })),
      el("div", "row", el("span", null, t("settings.look.dots")), toggle(L.dots, (v) => { changeLook("dots", v); previewBoard.draw(); }))));
  const preview = el("aside", "preview");
  const play = el("button", { class: "btn small", type: "button" }, t("settings.look.play_move"));
  body.append(el("div", "look", controls, preview));
  previewBoard = new Board(preview);
  const START = { fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1", last: "g8f6",
    arrows: [{ from: "c2", to: "c3" }] };
  const showStart = () => {
    previewBoard.set(START);
    previewBoard.selected = "f3";
    previewBoard.legal = ["f3e5", "f3g5", "f3h4", "f3d4", "f3d2", "f3g1"];
    previewBoard.draw();
    previewBoard.legal = null;
  };
  showStart();
  preview.append(el("div", "preview-cap", el("span", null, t("settings.look.preview")), play));
  play.addEventListener("click", () => {
    previewBoard.set({ fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p1N1/2B1P3/3P4/PPP2PPP/RNBQK2R b KQkq - 1 1", last: "f3g5" }, { animate: true });
    play.disabled = true;
    setTimeout(() => { if (previewBoard) showStart(); play.disabled = false; }, 1800);
  });
}

let LICENSES = {};
async function loadLicenses() {
  if (LICENSES.loaded) return LICENSES.data;
  const response = await fetch("licenses.json", { cache: "no-cache" });
  const data = await response.json();
  LICENSES = { loaded: true, data };
  for (const p of data.pieces) LICENSES[p.id] = p.license;
  return data;
}

// ---------------------------------------------------------------- Your account
function accountPage(body) {
  const S = settings();
  const input = el("input", { class: "input", value: S.username, autocomplete: "off", spellcheck: "false", "aria-label": t("settings.account.username") });
  const msg = el("div", "msg");
  const use = el("button", { class: "btn primary small", type: "button", hidden: true }, t("settings.account.change"));
  const check = el("button", { class: "btn small", type: "button" }, t("settings.account.check"));
  let found = null;
  check.addEventListener("click", async () => {
    msg.className = "msg";
    msg.textContent = t("welcome.checking");
    use.hidden = true;
    try {
      const answer = await api.post("/api/check-user", { username: input.value });
      if (answer.found === null) throw new Error(t("welcome.offline"));
      if (!answer.found) throw new Error(t("welcome.not_found"));
      found = answer.username;
      msg.className = "msg good";
      msg.textContent = t("settings.account.found");
      use.hidden = found.toLowerCase() === S.username.toLowerCase();
    } catch (error) {
      msg.className = "msg bad";
      msg.textContent = error.message;
    }
  });
  use.addEventListener("click", async () => {
    await save({ username: found });
    location.reload();
  });
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [S.timezone];
  if (!zones.includes(S.timezone)) zones.unshift(S.timezone);
  const zone = el("select", { class: "input", "aria-label": t("settings.account.timezone") },
    ...zones.map((z) => el("option", { value: z, selected: z === S.timezone }, z.replace(/_/g, " "))));
  zone.addEventListener("change", () => save({ timezone: zone.value }));
  body.append(el("div", "form",
    field(t("settings.account.username"), t("settings.account.username_hint"), null,
      el("div", "input-row", input, check, use), msg, el("p", "note", t("settings.account.change_note"))),
    field(t("settings.account.timezone"), t("settings.account.timezone_hint"), null, zone)));
}

// ---------------------------------------------------------------- Analysis
function analysisPage(body) {
  const S = settings().analysis;
  const games = ctx.data && ctx.data.scopes ? ctx.data.scopes.all.summary.games : 0;
  // Games to check
  const newest = el("select", { class: "input", style: { width: "auto", padding: "4px 8px", marginLeft: "6px" } },
    ...[500, 1000, 2000, 5000].map((v) => el("option", { value: v, selected: v === S.games }, n(v))));
  const allRadio = el("input", { type: "radio", name: "games", checked: !S.games });
  const newestRadio = el("input", { type: "radio", name: "games", checked: Boolean(S.games) });
  allRadio.addEventListener("change", () => save({ analysis: { games: 0 } }));
  newestRadio.addEventListener("change", () => save({ analysis: { games: Number(newest.value) } }));
  newest.addEventListener("change", () => { newestRadio.checked = true; save({ analysis: { games: Number(newest.value) } }); });
  // Depth
  const estimate = el("div", "estimate");
  const preset = (DEPTHS.find(([, nodes]) => nodes === S.nodes) || ["custom"])[0];
  const options = DEPTHS.map(([id]) => [id, t("settings.analysis.depths." + id)]);
  if (preset === "custom") options.push(["custom", t("settings.analysis.depths.custom")]);
  const depthSeg = seg(options, preset, (id) => pickDepth(id));
  function describe(nodes, pending) {
    estimate.replaceChildren(el("b", null, t("settings.analysis.depth_text", { nodes: n(nodes) })), " ");
    if (!pending) {
      estimate.append(t("settings.analysis.depth_same"));
      return;
    }
    const workers = settings().analysis.workers;
    const seconds = games * SECONDS_PER_GAME * (nodes / 200_000) * (4 / workers);
    estimate.append(t("settings.analysis.depth_change", { time: duration(seconds), workers }));
    const yes = el("button", { class: "btn primary small", type: "button" }, t("settings.analysis.depths." + pending));
    const no = el("button", { class: "btn small", type: "button" }, "✕");
    yes.addEventListener("click", async () => { await save({ analysis: { nodes } }); describe(nodes, null); });
    no.addEventListener("click", () => analysisRedraw());
    estimate.append(el("div", { class: "input-row", style: { marginTop: "10px" } }, yes, no));
  }
  async function pickDepth(id) {
    const nodes = (DEPTHS.find((d) => d[0] === id) || [null, S.nodes])[1];
    if (nodes > settings().analysis.nodes) return describe(nodes, id);  // deeper: every game is checked again, so ask
    await save({ analysis: { nodes } });
    describe(nodes, null);
  }
  describe(S.nodes, null);
  // Copies
  const cores = ctx.state.cores || 8;
  const workers = el("input", { type: "range", min: 1, max: cores, value: S.workers, "aria-label": t("settings.analysis.workers") });
  const workersN = el("b", null, S.workers);
  workers.addEventListener("input", () => (workersN.textContent = workers.value));
  workers.addEventListener("change", () => save({ analysis: { workers: Number(workers.value) } }));
  // Nightly task and the weekly note
  const task = ctx.state.nightly;
  const nightly = toggle(task ? task.exists && task.state !== "Disabled" : true, async (on) => {
    try {
      const answer = await api.post("/api/nightly", { enabled: on });
      ctx.state.nightly = answer.nightly;
      toast(t("app.saved"));
      analysisRedraw();
    } catch (error) {
      toast(error.message, true);
      nightly.checked = !on;
    }
  });
  const nightlyLine = task && task.exists && task.next ? t("settings.analysis.nightly_next", { when: fmtDate(task.next, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })
    : task && !task.exists ? t("settings.analysis.nightly_missing") : "";
  const note = toggle(settings().weekly_note.enabled, (on) => save({ weekly_note: { enabled: on } }), { disabled: !ctx.state.ollama || null });
  body.append(el("div", "form",
    field(t("settings.analysis.games"), t("settings.analysis.games_hint"), "games",
      el("label", "radio", allRadio, el("span", null, t("settings.analysis.all"), el("small", null, n(games)))),
      el("label", "radio", newestRadio, el("span", null, t("settings.analysis.newest"), newest, el("small", null, t("settings.analysis.newest_hint"))))),
    field(t("settings.analysis.depth"), t("settings.analysis.depth_hint"), "depth", depthSeg, estimate),
    field(t("settings.analysis.workers"), t("settings.analysis.workers_hint"), { key: "workers", vars: { cores } },
      el("div", "range-row", t("settings.analysis.cooler"), workers, t("settings.analysis.faster"), workersN)),
    field(t("settings.analysis.nightly"), t("settings.analysis.nightly_hint"), "nightly",
      el("div", "row", el("span", null, t("settings.analysis.nightly_on")), nightly),
      nightlyLine ? el("p", "note", nightlyLine) : null,
      el("div", "row", el("span", null, t("settings.analysis.note"), " ", helpButton("note")), note),
      ctx.state.ollama ? null : el("p", "note", t("settings.analysis.note_missing")))));
  function analysisRedraw() {
    body.replaceChildren();
    analysisPage(body);
  }
}

// ---------------------------------------------------------------- Gojo bot
function botPage(body) {
  const B = settings().bot, tuned = ctx.state.tuned_bot, info = ctx.state.bot || {};
  const gojo = el("input", { type: "radio", name: "bot", checked: B.opponent === "gojo", disabled: !info.model || null });
  const maia = el("input", { type: "radio", name: "bot", checked: B.opponent === "maia" || !info.model });
  gojo.addEventListener("change", () => save({ bot: { opponent: "gojo" } }));
  maia.addEventListener("change", () => save({ bot: { opponent: "maia" } }));
  const elo = el("select", { class: "input", style: { width: "auto", padding: "4px 8px", marginLeft: "6px" } },
    ...Array.from({ length: 21 }, (_, i) => 600 + i * 100).map((v) => el("option", { value: v, selected: v === B.maia_elo }, v)));
  elo.addEventListener("change", () => save({ bot: { maia_elo: Number(elo.value) } }));
  const style = B.style || tuned.style;
  const temp = B.temperature ?? tuned.temperature, cut = B.cutoff ?? tuned.cutoff;
  const tempInput = el("input", { type: "range", min: 0.5, max: 1.5, step: 0.05, value: temp, "aria-label": t("settings.bot.temperature") });
  const tempN = el("b", null, Number(temp).toFixed(2).replace(/0$/, ""));
  tempInput.addEventListener("input", () => (tempN.textContent = Number(tempInput.value).toFixed(2).replace(/0$/, "")));
  tempInput.addEventListener("change", () => save({ bot: { temperature: Number(tempInput.value) } }).then(() => botRedraw()));
  const cutInput = el("input", { type: "range", min: 0, max: 0.2, step: 0.01, value: cut, "aria-label": t("settings.bot.cutoff") });
  const cutN = el("b", null, t("settings.bot.cutoff_value", { pct: Math.round(cut * 100) + "%" }));
  cutInput.addEventListener("input", () => (cutN.textContent = t("settings.bot.cutoff_value", { pct: Math.round(cutInput.value * 100) + "%" })));
  cutInput.addEventListener("change", () => save({ bot: { cutoff: Number(cutInput.value) } }).then(() => botRedraw()));
  const isTuned = B.temperature == null && B.cutoff == null && B.style == null;
  const reset = el("button", { class: "btn small", type: "button", disabled: isTuned || null }, t("settings.bot.reset"));
  reset.addEventListener("click", async () => { await save({ bot: { temperature: null, cutoff: null, style: null } }); botRedraw(); });
  body.append(el("div", "form",
    info.installed ? null : el("p", "note", t("settings.bot.not_installed")),
    field(t("settings.bot.who"), t("settings.bot.who_hint"), null,
      el("label", "radio", gojo, el("span", null, t("settings.bot.gojo"), el("small", null, info.model ? t("settings.bot.gojo_hint", { model: info.model }) : t("settings.bot.gojo_missing")))),
      el("label", "radio", maia, el("span", null, t("settings.bot.maia"), el("small", null, t("settings.bot.maia_hint"))),
        el("span", { class: "lbl", style: { marginLeft: "10px" } }, t("settings.bot.rating"), elo, helpButton("maia_rating")))),
    field(t("settings.bot.style"), t("settings.bot.style_hint"), null,
      seg(["bullet", "blitz", "rapid"].map((v) => [v, t("settings.bot.styles." + v)]), style, (v) => save({ bot: { style: v } }).then(() => botRedraw()))),
    field(t("settings.bot.tuning"), t("settings.bot.tuning_hint"), null,
      el("div", "row", el("span", "lbl", t("settings.bot.temperature"), helpButton("temperature", { tuned: tuned.temperature })), el("span", "range-row", tempInput, tempN)),
      el("div", "row", el("span", "lbl", t("settings.bot.cutoff"), helpButton("cutoff")), el("span", "range-row", cutInput, cutN)),
      el("div", { class: "input-row", style: { marginTop: "8px" } }, reset, isTuned ? el("span", "note", t("settings.bot.tuned")) : null))));
  function botRedraw() {
    body.replaceChildren();
    botPage(body);
  }
}

// ---------------------------------------------------------------- Updates & data
function dataPage(body) {
  const S = settings();
  const backup = ctx.state.backup;
  const backupButton = el("button", { class: "btn small", type: "button", disabled: ctx.state.backup_running || null },
    ctx.state.backup_running ? t("settings.data.backing_up") : t("settings.data.backup_now"));
  backupButton.addEventListener("click", async () => {
    backupButton.disabled = true;
    backupButton.textContent = t("settings.data.backing_up");
    try {
      await api.post("/api/backup");
      const wait = setInterval(async () => {
        await ctx.refreshState();
        if (!ctx.state.backup_running) {
          clearInterval(wait);
          toast(t("settings.data.backup_done"));
          if (body.isConnected) { body.replaceChildren(); dataPage(body); }
        }
      }, 2000);
    } catch (error) {
      toast(error.message, true);
      backupButton.disabled = false;
    }
  });
  const open = (what) => el("button", { class: "btn small", type: "button", onclick: () => api.openFolder(what).catch((e) => toast(e.message, true)) },
    what === "logs" ? t("settings.data.open_logs") : t("settings.data.open"));
  body.append(el("div", "form",
    field(t("settings.data.update"), t("settings.data.update_hint"), null, updatePanel(ctx)),
    field(t("settings.data.folder"), t("settings.data.folder_hint"), null,
      el("input", { class: "input", value: ctx.state.paths.data, readonly: true }), el("div", { style: { marginTop: "8px" } }, open("data"))),
    field(t("settings.data.backups"), t("settings.data.backups_hint", { keep: S.backup.keep }), null,
      el("input", { class: "input", value: ctx.state.paths.backup, readonly: true }),
      el("p", "note", backup ? t("settings.data.newest", { when: ago(backup.when) }) : t("settings.data.none")),
      el("div", { class: "input-row", style: { marginTop: "8px" } }, backupButton, open("backup"))),
    field(t("settings.data.logs"), t("settings.data.logs_hint"), null, open("logs"))));
}

// ---------------------------------------------------------------- Phone app
function phonePage(body) {
  const P = settings().phone;
  const ready = Boolean(P.site_dir);
  body.append(el("div", "form",
    field(t("settings.phone.send"), t("settings.phone.send_hint"), null,
      el("div", { class: "row", style: { paddingTop: 0 } }, el("span", null, t("settings.phone.on")),
        toggle(P.enabled, (on) => save({ phone: { enabled: on } }), { disabled: !ready || null })),
      P.url ? el("div", "input-row", el("input", { class: "input", value: P.url, readonly: true }),
        el("button", { class: "btn small", type: "button", onclick: () => api.openOutside(P.url) }, t("settings.phone.open"))) : null,
      el("p", "note", P.enabled ? t("settings.phone.public") : t("settings.phone.off_hint")))));
}

// ---------------------------------------------------------------- Language
function languagePage(body) {
  body.append(el("div", "form",
    field(t("settings.language.app"), t("settings.language.app_hint"), null,
      el("select", { class: "input" }, el("option", { value: "en", selected: true }, "English")),
      el("p", "note", t("settings.language.note")))));
}

// ---------------------------------------------------------------- Licenses
async function licensesPage(body) {
  const data = await loadLicenses();
  const programs = el("tbody", null, ...data.programs.map((p) => el("tr", null,
    el("td", null, p.name), el("td", null, p.what), el("td", null, el("span", "lic-badge", p.license)))));
  const pieces = el("tbody", null, ...data.pieces.map((p) => el("tr", null,
    el("td", null, p.name, el("span", { class: "muted", style: { fontWeight: 500 } }, ` (${p.id})`)), el("td", null, p.author),
    el("td", null, el("span", "lic-badge", p.license)))));
  body.append(
    el("h3", "lic-head", t("settings.licenses.programs")),
    el("table", "lic", el("thead", null, el("tr", null, el("th", null, t("settings.licenses.name")), el("th", null, t("settings.licenses.what")), el("th", null, t("settings.licenses.license")))), programs),
    el("h3", "lic-head", t("settings.licenses.pieces")),
    el("table", "lic", el("thead", null, el("tr", null, el("th", null, t("settings.licenses.set")), el("th", null, t("settings.licenses.author")), el("th", null, t("settings.licenses.license")))), pieces),
    el("p", "note", t("settings.licenses.note")));
}

const PAGE_RENDER = {
  look: async (body) => { await loadLicenses().catch(() => {}); lookPage(body); },
  account: accountPage, analysis: analysisPage, bot: botPage, data: dataPage, phone: phonePage,
  language: languagePage, licenses: licensesPage,
};
