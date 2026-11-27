// Progress: are you getting better? Ratings (results and rating over time), Trends (your big mistakes and the other
// tracked numbers week by week against your coach's goals), Coach's notes (the monthly notes and this week's note),
// and Puzzles (your progress by theme and week).

import * as api from "../api.js";
import { el, fmtDate, helpButton, n, pct } from "../dom.js";
import { t } from "../i18n.js";
import { notesOf } from "../coach.js";
import { addDays, monday, day, Trainer } from "../puzzles.js";
import { loadCharts, scopeOf, scopeSwitch, showSections } from "../sections.js";

const SUBS = ["ratings", "trends", "coach", "puzzles"];
let ctx = null;
let charts = [];

export function leave() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

export async function render(main, context, sub) {
  ctx = context;
  leave();
  if (!ctx.data) {
    main.append(el("header", "top", el("div", null, el("h1", null, t("nav.progress")))),
      el("div", "card empty-state", el("h2", null, t("app.not_ready")), el("p", null, t("app.not_ready_text"))));
    return;
  }
  const page = SUBS.includes(sub) ? sub : "ratings";
  const right = el("div", "top-right");
  const content = el("div");
  main.append(el("header", "top", el("div", null, el("p", "kicker", t("progress.kicker")), el("h1", null, t("progress.titles." + page))), right),
    el("nav", { class: "subnav", "aria-label": t("nav.progress") }, ...SUBS.map((id) =>
      el("button", { type: "button", "aria-current": id === page ? "page" : null, onclick: () => ctx.go("progress", id) }, t("progress.tabs." + id)))),
    content);
  ctx.redraw = () => { main.replaceChildren(); render(main, ctx, page); };
  if (page === "puzzles") return drawPuzzles(content);
  if (page === "trends") {
    right.append(scopeSwitch(ctx, () => drawTrends(content)));
    return drawTrends(content);
  }
  right.append(scopeSwitch(ctx, () => drawPage(content, page)));
  await drawPage(content, page);
}

async function drawPage(box, page) {
  if (page === "ratings") await showSections(box, ctx, ["overview"], ["renderOverview", "renderRatings"]);
  else await showSections(box, ctx, ["coach"], ["renderCoach"]);
}

// ---------------------------------------------------------------- Trends
async function drawTrends(box) {
  leave();
  await loadCharts();
  const scope = scopeOf(ctx);
  const classes = scope === "all" ? ctx.data.time_classes.filter((tc) => ctx.data.scopes[tc].progress) : [scope];
  const notes = notesOf(ctx.data) || {};
  box.replaceChildren(el("p", "note", t("progress.trends_intro")));
  for (const tc of classes) {
    const P = ctx.data.scopes[tc] && ctx.data.scopes[tc].progress;
    if (!P || !P.weeks || !P.weeks.length) continue;
    const targets = (notes[tc] && notes[tc].targets) || {};
    const card = el("section", "card trend-card");
    card.append(el("h2", null, t("scopes." + tc)));
    const grid = el("div", "grid-3");
    grid.append(
      trendChart(P.weeks, (w) => (w.late_moves ? (w.late_blunders / w.late_moves) * 100 : null), targets.late_blunders,
        t("progress.chart_blunders"), "trend_blunders", (v) => v.toFixed(1), "lower", (w) => w.late_moves < 300),
      trendChart(P.weeks, (w) => (w.winning ? (w.converted / w.winning) * 100 : null), targets.converted,
        t("progress.chart_converted"), "trend_converted", (v) => Math.round(v) + "%", "higher", (w) => w.winning < (ctx.data.settings.small_sample_winning || 20)),
      trendChart(P.weeks, (w) => (w.games ? (w.abandoned / w.games) * 100 : null), targets.abandoned,
        t("progress.chart_abandoned"), "trend_abandoned", (v) => Math.round(v) + "%", "lower", (w) => w.games < 30));
    card.append(grid);
    box.append(card);
  }
}

function trendChart(weeks, valueOf, goal, title, helpKey, format, better, isSmall) {
  const values = weeks.map(valueOf);
  const last = [...values].reverse().find((v) => v != null);
  const reached = goal != null && last != null && (better === "lower" ? last <= goal : last >= goal);
  const head = el("div", "trend-head", el("span", "lbl", title, helpButton(helpKey)),
    el("span", "trend-now", last != null ? format(last) : "–"),
    el("span", "chip " + (goal == null ? "" : reached ? "good" : "bad"), goal == null ? t("progress.no_goal") : t("progress.goal", { goal: format(goal) })));
  const canvasBox = el("div", "trend-chart");
  const box = el("div", "trend", head, canvasBox);
  if (!window.Chart) return box;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const canvas = el("canvas", { role: "img", "aria-label": title });
  canvasBox.append(canvas);
  const labels = weeks.map((w) => fmtDate(w.week, { day: "numeric", month: "short" }));
  const datasets = [{ data: values, borderColor: css("--accent"), backgroundColor: css("--accent"), borderWidth: 2, tension: 0.3,
    pointRadius: weeks.map((w) => (isSmall(w) ? 2 : 3)), pointBackgroundColor: weeks.map((w) => (isSmall(w) ? css("--muted") : css("--accent"))), spanGaps: true }];
  if (goal != null) datasets.push({ data: weeks.map(() => goal), borderColor: css("--good"), borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0 });
  charts.push(new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => (c.datasetIndex ? t("progress.goal", { goal: format(c.raw) }) : format(c.raw)),
        title: (items) => t("progress.week_of", { date: fmtDate(weeks[items[0].dataIndex].week) }) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: css("--muted"), maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { size: 10 } } },
        y: { grid: { color: css("--grid") }, ticks: { color: css("--muted"), font: { size: 10 }, callback: (v) => format(v) } },
      },
    },
  }));
  return box;
}

// ---------------------------------------------------------------- Puzzles
async function drawPuzzles(box) {
  const trainer = await new Trainer(ctx.data).load();
  const labels = ctx.data.motif_labels || {};
  const st = (p) => trainer.st(p);
  const tried = trainer.items.filter(st);
  if (!tried.length) {
    box.replaceChildren(el("div", "card empty-state", el("p", null, t("progress.pz_none"))));
    return;
  }
  const groups = new Map();
  const theme = (p) => p.motif || "untyped";
  for (const p of trainer.items) {
    const g = groups.get(theme(p)) || { set: 0, tried: 0, first: 0, learning: 0, learned: 0 };
    const s = st(p);
    g.set += 1;
    if (s) {
      g.tried += 1;
      g.first += s.s === "done";
      g.learning += typeof s.s === "number";
      g.learned += s.s === "learned";
    }
    groups.set(theme(p), g);
  }
  const total = { set: 0, tried: 0, first: 0, learning: 0, learned: 0 };
  for (const g of groups.values()) for (const k in total) total[k] += g[k];
  const first = (g) => (g.tried ? `${t("progress.of", { a: n(g.first), b: n(g.tried) })} · ${pct(g.first / g.tried)}` : "–");
  const name = (key) => (key === "untyped" ? t("progress.untyped") : labels[key] || key) + (key === trainer.set.top_motif ? t("progress.top") : "");
  const rows = [...groups.entries()].sort((a, b) => b[1].set - a[1].set || b[1].tried - a[1].tried)
    .map(([key, g]) => el("tr", null, el("td", null, name(key)), el("td", "r", first(g)), el("td", "r", n(g.learning)), el("td", "r", n(g.learned)), el("td", "r", n(g.set))));
  rows.push(el("tr", "total", el("td", null, t("progress.all_themes")), el("td", "r", first(total)), el("td", "r", n(total.learning)),
    el("td", "r", n(total.learned)), el("td", "r", n(total.set))));
  const th = (key, r, helpKey) => el("th", r ? "r" : null, t("progress.cols." + key), helpKey ? helpButton(helpKey) : null);
  const byTheme = el("table", "data", el("thead", null, el("tr", null, th("theme"), th("first", true, "pz_first"), th("back", true, "pz_due"),
    th("learned", true, "pz_learned"), th("set", true))), el("tbody", null, ...rows));
  const log = trainer.state.log || [];
  const firsts = log.filter((e) => e.f);
  const thisWeek = monday(day());
  const weekRows = [];
  for (let back = 7; back >= 0; back--) {
    const start = addDays(thisWeek, -7 * back), next = addDays(start, 7);
    const inside = firsts.filter((e) => e.d >= start && e.d < next);
    const right = inside.filter((e) => e.r).length;
    weekRows.push(el("tr", null, el("td", null, `${fmtDate(start, { day: "numeric", month: "short" })} – ${fmtDate(addDays(start, 6), { day: "numeric", month: "short" })}`),
      el("td", "r", n(inside.length)), el("td", "r", inside.length ? `${n(right)} · ${pct(right / inside.length)}` : "–")));
  }
  const byWeek = el("table", "data", el("thead", null, el("tr", null, th("week"), th("tried", true), th("right", true))), el("tbody", null, ...weekRows));
  const since = log.length ? log.reduce((a, e) => (e.d < a ? e.d : a), log[0].d) : null;
  box.replaceChildren(
    el("section", "card", el("h2", null, t("progress.pz_by_theme")), el("div", "table-wrap", byTheme)),
    el("section", "card", el("h2", null, t("progress.pz_weeks")), el("div", "table-wrap", byWeek),
      el("p", "note", (since ? t("progress.log_since", { date: fmtDate(since) }) + " " : "") + t("progress.pz_note"))));
}

