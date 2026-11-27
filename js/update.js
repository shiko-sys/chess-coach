// "Update now" with its progress bar: the same update the nightly task runs, started from the app. Used by Today and
// by Settings > Updates & data. The bar follows progress.json, so it also shows the nightly run while that runs.

import * as api from "./api.js";
import { ago, duration, el, n, toast } from "./dom.js";
import { t } from "./i18n.js";

export function stepLine(u) {
  const parts = [];
  if (u.step && u.steps) parts.push(t("update.step", { step: u.step, steps: u.steps }));
  parts.push(u.key ? t("update.steps." + u.key) : t("update.running"));
  if (u.total) parts.push(t("update.positions", { done: n(u.done), total: n(u.total) }));
  if (u.detail && u.detail.games_total) parts.push(t("update.games", { done: n(u.detail.games_done), total: n(u.detail.games_total) }));
  if (u.eta) parts.push(t("update.left", { time: duration(u.eta) }));
  return parts.join(" · ");
}

// The share of the whole update that is done: whole steps, plus the part of the current step when it counts items.
function share(u) {
  if (!u.steps) return 0.02;
  const inStep = u.total ? u.done / u.total : 0;
  return Math.max(0.02, Math.min(1, ((u.step || 1) - 1 + inStep) / u.steps));
}

function resultLine(u, data) {
  if (!u || !u.state) return data && data.generated ? t("sync.last", { when: ago(data.generated) }) + "." : t("sync.never");
  if (u.state === "failed") return t("update.failed", { error: u.error || "?" });
  if (u.state === "stopped") return t("update.stopped");
  const s = u.summary || {};
  const done = s.new_games ? t("update.done", { new_games: n(s.new_games), new_puzzles: n(s.new_puzzles || 0) }) : t("update.done_none");
  return (u.finished ? t("sync.last", { when: ago(u.finished) }) + ". " : "") + done;
}

export function updatePanel(ctx, { compact = false } = {}) {
  const button = el("button", { class: "btn primary", type: "button" }, t("update.now"));
  const bar = el("div", "bar", el("i", { style: { width: "0%" } }));
  const line = el("p");
  const job = el("div", "job", bar, line);
  const result = el("p", "note");
  const box = el("div", null, compact ? null : button, job, result);

  function draw(state) {
    const u = (state && state.update) || {};
    button.disabled = Boolean(u.running);
    button.textContent = u.running ? t("update.running") : t("update.now");
    job.hidden = !u.running;
    result.hidden = Boolean(u.running);
    if (u.running) {
      bar.firstChild.style.width = Math.round(share(u) * 100) + "%";
      line.textContent = stepLine(u) + (u.started_here ? "" : " · " + t("update.nightly_running"));
    } else {
      result.textContent = resultLine(u, ctx.data);
    }
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const answer = await api.post("/api/update");
      ctx.state.update = answer.update;
      draw(ctx.state);
      toast(t("update.background"));
      ctx.pollSoon();
    } catch (error) {
      toast(error.status === 409 ? t("update.busy") : error.message, true);
      button.disabled = false;
    }
  });

  const listener = (state) => { if (box.isConnected) draw(state); else ctx.onStatus.delete(listener); };
  ctx.onStatus.add(listener);
  draw(ctx.state);
  box.button = button;
  return box;
}
