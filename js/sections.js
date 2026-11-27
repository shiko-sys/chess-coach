// The number sections of the old report inside Review and Progress (js/report.js): loading Chart.js, making the
// sections' frames, drawing them for one time control, the "?" next to every section and number card, and jumping to a
// number the coach's notes cite.

import { pieceUrl } from "./look.js";
import { createReport, MARKUP } from "./report.js";
import { el, helpButton } from "./dom.js";
import { has, t } from "./i18n.js";

let chartsReady = null;
let made = null;
let madeFor = null;

// Chart.js (vendor/chart.umd.min.js, MIT) is loaded the first time a section needs it.
export function loadCharts() {
  if (window.Chart) return Promise.resolve();
  if (!chartsReady) {
    chartsReady = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "vendor/chart.umd.min.js";
      script.onload = resolve;
      script.onerror = resolve;  // the tables still work without charts
      document.head.append(script);
    });
  }
  return chartsReady;
}

// Where each section lives in the app: [screen, sub-page].
const HOME = {
  results: ["progress", "ratings"], ratings: ["progress", "ratings"],
  accuracy: ["review", "mistakes"], phases: ["review", "mistakes"], clock: ["review", "mistakes"], motifs: ["review", "mistakes"],
  best: ["review", "best"], reel: ["review", "best"], missed: ["review", "best"],
  openings: ["review", "openings"], drops: ["review", "openings"],
  endings: ["review", "habits"], ends: ["review", "habits"], hours: ["review", "habits"], tilt: ["review", "habits"],
  "rating-diff": ["review", "habits"],
};

function hooks(ctx) {
  return {
    pieceUrl,
    go(next) {
      if (next && next.scope) setScope(ctx, next.scope);
      if (ctx.redraw) ctx.redraw();
    },
    goToFact(id, fact) {
      const [screen, sub] = HOME[fact.section] || ["progress", "coach"];
      if (fact.scope) setScope(ctx, fact.scope);
      ctx.afterRender = () => {
        const target = document.querySelector(`[data-facts~="${CSS.escape(id)}"]`) || document.getElementById(`sec-${fact.section}`);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: target.tagName === "SECTION" ? "start" : "center" });
        target.classList.remove("flash");
        void target.offsetWidth;
        target.classList.add("flash");
      };
      ctx.go(screen, sub);
    },
  };
}

export function report(ctx) {
  if (!made || madeFor !== ctx.data) {
    if (made) made.destroyCharts();
    made = createReport(ctx.data, hooks(ctx));
    madeFor = ctx.data;
  }
  return made;
}

export function scopeOf(ctx) {
  if (!ctx.scope) {
    try { ctx.scope = localStorage.getItem("chess-coach-scope") || "all"; } catch (e) { ctx.scope = "all"; }
  }
  if (ctx.data && !ctx.data.scopes[ctx.scope]) ctx.scope = "all";
  return ctx.scope;
}

export function setScope(ctx, scope) {
  ctx.scope = scope;
  try { localStorage.setItem("chess-coach-scope", scope); } catch (e) { /* fine */ }
}

// Draw sections: keys of MARKUP (the frames), then the render functions, for the current time control.
export async function showSections(box, ctx, keys, renders) {
  await loadCharts();
  const R = report(ctx);
  R.destroyCharts();
  const scope = scopeOf(ctx);
  R.setScope(scope);
  box.className = "report";
  box.innerHTML = keys.map((key) => MARKUP[key]).join("");  // the frames: fixed markup, no data in it
  const S = ctx.data.scopes[scope];
  for (const name of renders) R[name](S);
  R.fitTallLabels();
  addHelp(box);
}

// The "?" next to every section title and every number card whose meaning has a text.
export function addHelp(box) {
  for (const section of box.querySelectorAll("section[id^='sec-']")) {
    const key = section.id.slice(4);
    const title = section.querySelector("h2");
    if (title && has("sections." + key) && !title.querySelector(".help")) {
      const [name, text] = t("sections." + key);
      title.append(" ", helpButton({ title: name, text }));
    }
  }
  for (const label of box.querySelectorAll(".kpi .label")) {
    const key = label.textContent.trim().toLowerCase();
    if (has("terms." + key) && !label.querySelector(".help")) {
      const [name, text] = t("terms." + key);
      label.append(" ", helpButton({ title: name, text }));
    }
  }
}

export function scopeSwitch(ctx, onChange) {
  const scopes = ["all", ...ctx.data.time_classes];
  const box = el("div", { class: "seg", role: "group", "aria-label": t("review.scope") });
  for (const s of scopes) {
    const b = el("button", { type: "button", "aria-pressed": String(s === scopeOf(ctx)) }, t("scopes." + s));
    b.addEventListener("click", () => {
      setScope(ctx, s);
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onChange(s);
    });
    box.append(b);
  }
  return box;
}

window.addEventListener("resize", () => { if (made) made.fitTallLabels(); });
