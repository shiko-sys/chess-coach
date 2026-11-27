// All the app's text comes from one file per language (ui/text/en.json), so the app can be translated.
// t("settings.look.theme") -> the text; t("update.positions", { done: 5, total: 9 }) fills in {done} and {total}.

let TEXT = {};
let LANG = "en";

export async function loadText(lang = "en") {
  const response = await fetch(`text/${lang}.json`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`text/${lang}.json: ${response.status}`);
  TEXT = await response.json();
  LANG = lang;
  document.documentElement.lang = lang;
}

export function lang() {
  return LANG;
}

function lookup(key) {
  let node = TEXT;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

export function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (all, name) => (vars && vars[name] != null ? vars[name] : all));
}

// The text for a key, with {name} filled in from vars. A missing key shows itself, so it is easy to spot.
export function t(key, vars) {
  const value = lookup(key);
  if (value == null) return key;
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (typeof value === "object") return value;
  return fill(value, vars);
}

export function has(key) {
  return lookup(key) != null;
}
