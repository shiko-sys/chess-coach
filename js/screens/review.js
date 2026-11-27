// Review: your games and what they say. My games (every game, move by move, with its verdicts and Stockfish's move),
// Mistakes, Openings, Best moves and Habits (the old report's sections, the same numbers, js/report.js).

import * as api from "../api.js";
import { el, fmtDate, fmtTime, helpButton, n, seg, svgEl } from "../dom.js";
import { t } from "../i18n.js";
import { Board } from "../board.js";
import { scopeOf, scopeSwitch, showSections } from "../sections.js";

const SUBS = api.PHONE ? ["mistakes", "openings", "best", "habits"] : ["games", "mistakes", "openings", "best", "habits"];
const SECTIONS = {
  mistakes: [["mistakes"], ["renderAccuracy", "renderPhases", "renderClock", "renderMotifs"]],
  openings: [["openings"], ["renderOpenings", "renderDrops"]],
  best: [["best_stats", "best_reel", "best_missed"], ["renderBest", "renderReel", "renderMissed"]],
  habits: [["endings", "habits"], ["renderEndings", "renderEnds", "renderHours", "renderTilt", "renderRatingDiff"]],
};

let ctx = null;
let board = null;
let keyHandler = null;
const list = { games: [], total: 0, result: "", tc: null };
let open = null;   // the game in the viewer
let at = 0;        // how many of its moves are on the board

export function leave() {
  if (board) board.destroy();
  board = null;
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = null;
}

export async function render(main, context, sub) {
  ctx = context;
  if (!ctx.data) {
    main.append(el("header", "top", el("div", null, el("h1", null, t("nav.review")))),
      el("div", "card empty-state", el("h2", null, t("app.not_ready")), el("p", null, t("app.not_ready_text"))));
    return;
  }
  const page = SUBS.includes(sub) ? sub : SUBS[0];
  const tabs = el("nav", { class: "subnav", "aria-label": t("nav.review") }, ...SUBS.map((id) =>
    el("button", { type: "button", "aria-current": id === page ? "page" : null, onclick: () => { open = null; ctx.go("review", id); } },
      t("review.tabs." + id))));
  const content = el("div");
  const right = el("div", "top-right");
  main.append(el("header", "top", el("div", null, el("p", "kicker", t("review.kicker")), el("h1", null, t("review.titles." + page))), right),
    tabs, content);
  ctx.redraw = () => render(Object.assign(main, { innerHTML: "" }), ctx, page);
  if (page === "games") {
    right.append(scopeSwitch(ctx, () => { list.games = []; open = null; drawGames(content); }));
    return drawGames(content);
  }
  right.append(scopeSwitch(ctx, () => drawSections(content, page)));
  await drawSections(content, page);
}

async function drawSections(box, page) {
  const [keys, renders] = SECTIONS[page];
  await showSections(box, ctx, keys, renders);
}

// ---------------------------------------------------------------- My games: the list
async function drawGames(box) {
  leave();
  if (open) return drawGame(box);
  const scope = scopeOf(ctx);
  const tc = scope === "all" ? null : scope;
  if (list.tc !== tc) { list.games = []; list.tc = tc; }
  const results = seg([["", t("review.all_results")], ["win", t("review.results.win")], ["loss", t("review.results.loss")], ["draw", t("review.results.draw")]],
    list.result, (value) => { list.result = value; list.games = []; drawGames(box); });
  const tableBox = el("div", "table-wrap");
  const more = el("button", { class: "btn", type: "button" }, t("review.more"));
  const count = el("span", "note");
  box.replaceChildren(el("div", "card", el("div", "games-head", results, count), tableBox, el("div", "pz-actions", more)));
  async function load() {
    more.disabled = true;
    const params = new URLSearchParams({ offset: list.games.length, limit: 50 });
    if (tc) params.set("tc", tc);
    if (list.result) params.set("result", list.result);
    const answer = await api.get("/api/games?" + params);
    list.games.push(...answer.games);
    list.total = answer.total;
    drawTable();
  }
  function drawTable() {
    const rows = list.games.map((g) => {
      const tr = el("tr", "clickable",
        el("td", null, fmtDate(g.when, { day: "numeric", month: "short" }), el("span", "muted", " " + fmtTime(g.when))),
        el("td", null, g.opponent, el("span", "muted", ` (${n(g.opp_rating)})`)),
        el("td", null, el("span", "chip " + (g.result === "win" ? "good" : g.result === "loss" ? "bad" : ""), t("review.result_word." + g.result)),
          el("span", "muted", " " + (g.end || ""))),
        el("td", "r", g.accuracy != null ? g.accuracy.toFixed(1) : el("span", "muted", t("review.not_checked"))),
        el("td", "r", g.blunders != null ? el("span", g.blunders ? "bad-text" : "", n(g.blunders)) : "–"),
        el("td", "r", (g.brilliant ? "‼ " + g.brilliant + "  " : "") + (g.great ? "! " + g.great : "") || "–"),
        el("td", null, g.opening || "–"));
      tr.addEventListener("click", () => { open = { id: g.id }; drawGames(box); });
      return tr;
    });
    const head = (key, r, helpKey) => el("th", r ? "r" : null, t("review.cols." + key), helpKey ? helpButton(helpKey) : null);
    tableBox.replaceChildren(el("table", "data", el("thead", null, el("tr", null, head("date"), head("opponent"), head("result"),
      head("accuracy", true, "accuracy_game"), head("mistakes", true, "blunders_game"), head("best", true, "best_game"), head("opening"))),
      el("tbody", null, ...rows)));
    count.textContent = t("review.count", { shown: n(list.games.length), total: n(list.total) });
    more.hidden = list.games.length >= list.total;
    more.disabled = false;
  }
  more.addEventListener("click", load);
  if (list.games.length) drawTable(); else await load();
}

// ---------------------------------------------------------------- My games: one game, move by move
const VERDICT_MARK = { blunder: "??", mistake: "?", inaccuracy: "?!", brilliant: "!!", great: "!", missed: "" };
const VERDICT_CLASS = { blunder: "v-blunder", mistake: "v-mistake", inaccuracy: "v-inaccuracy", brilliant: "v-brilliant", great: "v-great" };

function verdictOf(m) {
  if (m.special === "brilliant" || m.special === "great") return m.special;
  return m.verdict;
}

async function drawGame(box) {
  if (!open.moves) open = await api.get("/api/game?id=" + open.id);
  const g = open;
  at = Math.min(at || 0, g.moves.length);
  const boardBox = el("div", "game-board");
  const info = el("div", "game-info");
  const movesBox = el("div", "game-moves");
  const chart = el("div", "game-chart");
  const resultWord = t("review.result_word." + g.result);
  box.replaceChildren(
    el("div", "game-top", el("button", { class: "btn small ghost", type: "button", onclick: () => { open = null; at = 0; drawGames(box); } }, t("review.back")),
      el("div", null, el("h2", null, t("review.vs", { opponent: g.opponent, rating: n(g.opp_rating) })),
        el("p", "sub", t("review.you_played", { color: g.color === "white" ? "White" : "Black", tc: cap(g.time_class), control: g.control || "",
          when: `${fmtDate(g.when)} ${fmtTime(g.when)}` }))),
      el("span", "chip " + (g.result === "win" ? "good" : g.result === "loss" ? "bad" : ""), t("review.ended", { result: resultWord, end: g.end })),
      el("button", { class: "link", type: "button", style: { marginTop: 0 }, onclick: () => api.openOutside(g.url) }, t("review.open"))),
    el("div", "game-layout", boardBox, el("div", "card game-panel", chart, info, movesBox, navButtons())));
  board = new Board(boardBox, { flip: g.color === "black" });
  if (!g.analyzed) info.append(el("p", "note", t("review.no_analysis")));
  drawChart(chart);
  drawMoves(movesBox);
  show(false);
  keyHandler = (event) => {
    if (event.target.closest && event.target.closest("input, select, textarea")) return;
    if (event.key === "ArrowLeft") { step(at - 1); event.preventDefault(); }
    if (event.key === "ArrowRight") { step(at + 1); event.preventDefault(); }
  };
  document.addEventListener("keydown", keyHandler);

  function navButtons() {
    const b = (text, label, fn) => el("button", { class: "btn small", type: "button", "aria-label": label, onclick: fn }, text);
    return el("div", "pz-actions",
      b("⏮", t("review.start"), () => step(0)), b("◀", t("review.prev"), () => step(at - 1)),
      b("▶", t("review.next"), () => step(at + 1)), b("⏭", t("review.end"), () => step(g.moves.length)),
      el("button", { class: "btn small", type: "button", onclick: nextMistake }, t("review.next_mistake")));
  }
  function nextMistake() {
    const i = g.moves.findIndex((m, k) => k + 1 > at && m.me && ["blunder", "mistake"].includes(m.verdict));
    if (i >= 0) step(i + 1);
  }
  function step(next) {
    const target = Math.max(0, Math.min(g.moves.length, next));
    const forward = target === at + 1;
    at = target;
    show(forward);
  }
  function show(animate) {
    const m = g.moves[at - 1];
    const v = m ? verdictOf(m) : null;
    const before = at >= 2 ? g.moves[at - 2].fen : g.start;
    if (m && m.best && ["blunder", "mistake", "inaccuracy"].includes(m.verdict)) {
      // a mistake: the position before it, your move dashed red and Stockfish's move as the arrow
      board.set({ fen: before, last: at >= 2 ? g.moves[at - 2].uci : null,
        arrows: [{ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), kind: "bad", dashed: true }, { from: m.best.slice(0, 2), to: m.best.slice(2, 4) }] });
    } else {
      board.set({ fen: m ? m.fen : g.start, last: m ? m.uci : null, marks: m && (v === "brilliant" || v === "great") ? { [m.uci.slice(2, 4)]: "good" } : {},
        check: m && m.check ? findKing(m.fen, (at % 2) === 0) : null }, { animate, sound: animate });
    }
    info.replaceChildren();
    if (!g.analyzed) info.append(el("p", "note", t("review.no_analysis")));
    if (m) {
      const number = `${Math.ceil(at / 2)}${at % 2 ? "." : "..."} ${m.san}`;
      info.append(el("div", "game-move", el("b", null, number), v ? el("span", "chip " + (VERDICT_CLASS[v] || ""), t("review.verdicts." + v)) : null,
        m.motif && ctx.data.motif_labels && ctx.data.motif_labels[m.motif] ? el("span", "muted", " " + ctx.data.motif_labels[m.motif]) : null));
      if (m.before != null) {
        const mine = (x) => Math.round(m.me ? x : 100 - x) + "%";
        info.append(el("p", null, t("review.chance", { before: mine(m.before), after: mine(m.after) }), " ", helpButton("win_chance")));
      }
      if (m.best_san && v && ["blunder", "mistake", "inaccuracy"].includes(m.verdict)) info.append(el("p", "game-best", t("review.best_was", { move: m.best_san })));
    }
    info.append(el("p", "note", t("review.move_of", { n: at, total: g.moves.length })));
    movesBox.querySelectorAll(".mv").forEach((node) => node.classList.toggle("on", Number(node.dataset.at) === at));
    const current = movesBox.querySelector(".mv.on");
    if (current) current.scrollIntoView({ block: "nearest" });
  }
  function drawMoves(container) {
    const rows = [];
    for (let i = 0; i < g.moves.length; i += 2) {
      const cell = (k) => {
        const m = g.moves[k];
        if (!m) return el("span");
        const v = verdictOf(m);
        const b = el("button", { type: "button", class: "mv" + (m.me ? " me" : "") + (v ? " " + VERDICT_CLASS[v] : ""), "data-at": k + 1,
          onclick: () => step(k + 1) }, m.san + (v ? VERDICT_MARK[v] || "" : ""));
        return b;
      };
      rows.push(el("span", "mv-n", `${i / 2 + 1}.`), cell(i), cell(i + 1));
    }
    container.replaceChildren(...rows);
  }
  function drawChart(container) {
    const points = g.moves.map((m) => (m.after == null ? null : (m.me ? m.after : 100 - m.after)));
    if (!points.some((p) => p != null)) return;
    const w = 300, h = 60, dx = w / Math.max(1, points.length);
    const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, class: "chance", preserveAspectRatio: "none", role: "img", "aria-label": "Your chance to win, move by move" });
    let d = `M 0 ${h / 2}`;
    points.forEach((p, i) => { if (p != null) d += ` L ${(i + 1) * dx} ${h - (p / 100) * h}`; });
    svg.append(svgEl("rect", { x: 0, y: 0, width: w, height: h / 2, class: "chance-top" }));
    svg.append(svgEl("path", { d: d + ` L ${w} ${h / 2} Z`, class: "chance-area" }), svgEl("path", { d, class: "chance-line" }));
    svg.append(svgEl("line", { x1: 0, x2: w, y1: h / 2, y2: h / 2, class: "chance-mid" }));
    g.moves.forEach((m, i) => {
      const v = verdictOf(m);
      if (m.me && (v === "blunder" || v === "mistake")) {
        svg.append(svgEl("circle", { cx: (i + 1) * dx, cy: h - ((m.me ? m.after : 100 - m.after) / 100) * h, r: 2.6, class: "dot-" + v }));
      }
    });
    svg.addEventListener("click", (event) => {
      const box2 = svg.getBoundingClientRect();
      step(Math.round(((event.clientX - box2.left) / box2.width) * points.length));
    });
    container.append(el("div", "lbl", t("review.chart"), helpButton("win_chance")), svg);
  }
}

function findKing(fen, white) {
  const rows = fen.split("/");
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (ch >= "1" && ch <= "8") { f += Number(ch); continue; }
      if (ch === (white ? "K" : "k")) return String.fromCharCode(97 + f) + (8 - r);
      f++;
    }
  }
  return null;
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
