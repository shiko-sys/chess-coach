// Small helpers every screen uses: making elements, numbers and dates, Arabic text with Latin words inside,
// and the "what does this mean?" buttons.

import { t } from "./i18n.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// el("div", "card", "text") or el("div", { class: "card", dir: "rtl" }, child, "text", ...)
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (typeof attrs === "string") node.className = attrs;
  else if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
      else node.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

const NUMBER = new Intl.NumberFormat("en-US");
export const n = (x) => (x == null || !isFinite(x) ? "–" : NUMBER.format(x));
export const pct = (x, digits = 0) => (x == null || !isFinite(x) ? "–" : (x * 100).toFixed(digits) + "%");
export const fixed = (x, digits = 1) => (x == null || !isFinite(x) ? "–" : Number(x).toFixed(digits));
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function fmtDate(iso, options = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "–";
  const d = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString("en-GB", options);
}

export function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// "last night, 23:30", "yesterday, 18:02", "3 days ago": when something happened, in plain words.
export function ago(iso, now = new Date()) {
  if (!iso) return "–";
  const d = new Date(iso.replace(" ", "T"));
  const minutes = (now - d) / 60000;
  if (minutes < 2) return t("when.just_now");
  if (minutes < 60) return t("when.minutes", { n: Math.round(minutes) });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((day(now) - day(d)) / 86400000);
  const time = fmtTime(d);
  if (days === 0) return t("when.today", { time });
  if (days === 1) return d.getHours() >= 18 || d.getHours() < 5 ? t("when.last_night", { time }) : t("when.yesterday", { time });
  if (days < 7) return t("when.days", { n: days });
  return t("when.on", { date: fmtDate(d.toISOString()) });
}

// 125 -> "2 min", 5400 -> "1 h 30 min"
export function duration(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  if (seconds < 60) return t("duration.s", { n: seconds });
  if (seconds < 3600) return t("duration.min", { n: Math.round(seconds / 60) });
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  return h >= 10 ? t("duration.hours", { n: h }) : t("duration.h", { h, m });
}

// Latin words, chess moves and numbers inside Arabic text: each run in its own <span dir="ltr">, so they read
// in the right order (the same rule as the old report).
const LTR_RUN = /[+\-−]?[A-Za-z0-9](?:[A-Za-z0-9_+\-−.,:%/'’()…→#=×≤≥ ]*[A-Za-z0-9_%)#+])?/g;
export function iso(node, text) {
  text = String(text ?? "");
  let last = 0;
  for (const match of text.matchAll(LTR_RUN)) {
    if (match.index < last) continue;
    if (match.index > last) node.append(document.createTextNode(text.slice(last, match.index)));
    let run = match[0];
    const count = (ch) => run.split(ch).length - 1;
    while (run.endsWith(")") && count(")") > count("(")) run = run.slice(0, -1);
    const span = document.createElement("span");
    span.dir = "ltr";
    span.textContent = run;
    node.append(span);
    last = match.index + run.length;
  }
  if (last < text.length) node.append(document.createTextNode(text.slice(last)));
  return node;
}

export const arText = (tag, text, cls) => iso(el(tag, { class: cls, dir: "rtl", lang: "ar" }), text);

// Paragraphs (a blank line between them) and lists (lines starting with "- "), Arabic.
export function richText(text) {
  const box = el("div", { class: "rich", dir: "rtl", lang: "ar" });
  for (const block of String(text || "").split(/\n\s*\n/)) {
    let p = null, list = null;
    for (const line of block.split("\n").filter((l) => l.trim())) {
      if (/^\s*[-•]\s+/.test(line)) {
        if (!list) box.append((list = el("ul")));
        list.append(iso(el("li"), line.replace(/^\s*[-•]\s+/, "")));
        p = null;
      } else {
        if (p) p.append(el("br"));
        else box.append((p = el("p")));
        iso(p, line);
        list = null;
      }
    }
  }
  return box;
}

// ---------------------------------------------------------------- "what does this mean?"
// helpButton("depth") shows text "help.depth" = [title, text]; or helpButton({ title, text }) for text made here.
let popFor = null;

export function helpButton(key, vars) {
  const button = el("button", { class: "help", type: "button", "aria-label": t("app.help_label"), "aria-expanded": "false" }, "?");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const [title, text] = typeof key === "string" ? t("help." + key, vars) : [key.title, key.text];
    showPop(button, title, text);
  });
  return button;
}

export function showPop(button, title, text) {
  const pop = $("#pop");
  if (popFor === button) return hidePop();
  hidePop();
  pop.replaceChildren(el("b", null, title), el("div", null, text));
  pop.hidden = false;
  const r = button.getBoundingClientRect();
  const width = Math.min(310, document.documentElement.clientWidth - 16);
  let left = window.scrollX + r.left - 12;
  left = Math.min(left, window.scrollX + document.documentElement.clientWidth - width - 8);
  pop.style.left = Math.max(8, left) + "px";
  pop.style.top = window.scrollY + r.bottom + 8 + "px";
  button.setAttribute("aria-expanded", "true");
  popFor = button;
}

export function hidePop() {
  const pop = $("#pop");
  if (pop) pop.hidden = true;
  if (popFor) popFor.setAttribute("aria-expanded", "false");
  popFor = null;
}

document.addEventListener("click", (event) => { if (!event.target.closest(".pop")) hidePop(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") hidePop(); });
window.addEventListener("resize", hidePop);

// A number with its label, its "?" and an optional small line under it.
export function stat(label, value, helpKey, extra, helpVars) {
  return el("div", "stat",
    el("div", "lbl", label, helpKey ? helpButton(helpKey, helpVars) : null),
    typeof value === "object" && value instanceof Node ? el("div", "val", value) : el("div", "val", value),
    extra ? el("div", "extra", extra) : null);
}

let toastTimer = null;
export function toast(text, bad = false) {
  const box = $("#toast");
  box.textContent = text;
  box.className = "toast" + (bad ? " bad" : "");
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), bad ? 5000 : 1800);
}

// A segmented control: seg([["light", "Light"], ...], current, onPick)
export function seg(options, current, onPick) {
  const box = el("div", { class: "seg", role: "group" });
  for (const [value, label] of options) {
    const b = el("button", { type: "button", "aria-pressed": String(value === current) }, label);
    b.addEventListener("click", () => {
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onPick(value);
    });
    box.append(b);
  }
  return box;
}

export function toggle(checked, onChange, attrs = {}) {
  const box = el("input", { type: "checkbox", class: "toggle", ...attrs });
  box.checked = Boolean(checked);
  box.addEventListener("change", () => onChange(box.checked));
  return box;
}
