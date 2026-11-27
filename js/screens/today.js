// Today: today's puzzles and the one thing to work on (the first weakness of the coach's notes and its number),
// with today's tasks from the coach's weekly plan. "Start puzzles" opens the puzzle board (#today/puzzles).

import * as api from "../api.js";
import { ago, arText, el, fmtDate, helpButton, iso, n, pct, toast } from "../dom.js";
import { t } from "../i18n.js";
import { Board } from "../board.js";
import { focusOf, todaysPlan } from "../coach.js";
import { apply, day, finishLine, numbered, placement, startPuzzle, Trainer } from "../puzzles.js";
import { play as playSound } from "../sound.js";

let ctx = null;
let trainer = null;
let trainerItems = null;
let cur = null;          // the puzzle on the board (puzzles.startPuzzle)
let board = null;
let timer = null;
let lastAt = 0;
let keyHandler = null;

export function leave() {
  if (board) board.destroy();
  board = null;
  clearTimeout(timer);
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = null;
}

async function getTrainer() {
  const items = ctx.data && ctx.data.puzzles ? ctx.data.puzzles.items : null;
  if (!trainer || trainerItems !== items) {
    trainer = await new Trainer(ctx.data).load();
    trainerItems = items;
    if (cur && !trainer.items.some((p) => p.id === cur.p.id)) cur = null;
  }
  return trainer;
}

function leftToday() {
  const plan = trainer.plan();
  return plan.due.length + plan.fresh.length;
}

function refreshCount() {
  ctx.setCount(leftToday());
}

export async function render(main, context, sub) {
  ctx = context;
  if (!ctx.data) {
    main.append(el("header", "top", el("div", null, el("h1", null, t("today.title")))),
      el("div", "card empty-state", el("h2", null, t("app.not_ready")), el("p", null, t("app.not_ready_text"))));
    return;
  }
  await getTrainer();
  refreshCount();
  if (sub === "puzzles") return renderPlayer(main);
  renderOverview(main);
}

// ---------------------------------------------------------------- the overview
function greeting() {
  const h = new Date().getHours();
  return t("today.greeting." + (h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"));
}

function headerRight() {
  if (api.PHONE) return el("div", "top-right", el("span", "status", el("i", "dot-ok"), t("sync.last", { when: ago(ctx.data.generated) })));
  const button = el("button", { class: "btn", type: "button" }, t("update.now"));
  const status = el("span", "status");
  const draw = (state) => {
    const u = state.update || {};
    button.disabled = Boolean(u.running);
    button.textContent = u.running ? t("update.running") : t("update.now");
    const finished = u.finished || ctx.data.generated;
    status.replaceChildren(el("i", u.running ? "dot-run" : u.state === "failed" ? "dot-bad" : "dot-ok"),
      u.running ? t("update.steps." + (u.key || "start")) : t("sync.last", { when: ago(finished) }));
  };
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
  const listener = (state) => { if (button.isConnected) draw(state); else ctx.onStatus.delete(listener); };
  ctx.onStatus.add(listener);
  draw(ctx.state);
  return el("div", "top-right", status, button);
}

function renderOverview(main) {
  const now = new Date();
  main.append(el("header", "top",
    el("div", null, el("p", "kicker", `${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · ${greeting()}`),
      el("h1", null, t("today.title"))),
    headerRight()));
  main.append(el("div", "today", puzzlesCard(), focusCard(), planCard()));
}

function puzzlesCard() {
  const plan = trainer.plan(), set = trainer.set;
  const left = plan.due.length + plan.fresh.length, done = trainer.doneToday();
  const card = el("article", "card");
  card.append(el("div", "card-head", el("div", null, el("h2", null, t("today.puzzles")), el("p", "sub", t("today.puzzles_sub"))),
    helpButton("pz_today")));
  if (!trainer.items.length) {
    card.append(el("p", "fine", t("today.none")));
    return card;
  }
  const next = plan.due[0] || plan.fresh[0];
  const mini = el("div", "mini");
  const info = el("div");
  if (next) {
    const b = new Board(mini, { coords: false, flip: next.color === "black" });
    b.set({ fen: next.board, last: next.last });
    const review = trainer.st(next);
    mini.append(el("span", "tag", el("i", { style: { background: KIND_COLORS[next.kind] } }),
      t("kinds." + next.kind + ".label") + (review ? " · " + t("puzzles.review") : "")));
    const played = new Date(next.date + "T00:00:00");
    const days = Math.round((new Date(day() + "T00:00:00") - played) / 86400000);
    const when = days === 0 ? "today" : days === 1 ? "yesterday" : "on " + fmtDate(next.date, { day: "numeric", month: "short" });
    info.append(
      el("div", "big-num", n(left), el("small", null, t("today.count"))),
      el("div", "split",
        el("div", null, el("span", "lbl", t("today.new"), helpButton("pz_new", { per_day: set.new_per_day, days: set.days })), el("b", null, n(plan.fresh.length))),
        el("div", null, el("span", "lbl", t("today.due"), helpButton("pz_due")), el("b", null, n(plan.due.length))),
        el("div", null, el("span", "lbl", t("today.done")), el("b", null, n(done)))),
      el("div", "bar", el("i", { style: { width: Math.max(2, Math.round((done / Math.max(1, done + left)) * 100)) + "%" } })),
      el("button", { class: "btn primary big", type: "button", onclick: () => ctx.go("today", "puzzles") }, done ? t("today.continue") : t("today.start")),
      el("p", "fine", t("today.first", { tc: next.time_class, when, opponent: next.opponent,
        rating: next.opp_rating ? ` (${n(next.opp_rating)})` : "", color: t("puzzles." + next.color) })));
  } else {
    const waiting = trainer.waiting();
    mini.append(el("div", "done-mark", "✓"));
    info.append(el("div", "big-num", t("today.all_done")),
      el("p", "fine", waiting.length ? t("today.all_done_sub", { when: waiting[0] === day(1) ? "tomorrow" : fmtDate(waiting[0]) }) : t("today.no_reviews")));
    if (plan.unseen.length) {
      info.append(el("button", { class: "btn primary big", type: "button", onclick: () => { trainer.moreToday(); ctx.go("today", "puzzles"); } },
        t("puzzles.more", { n: Math.min(set.new_per_day, plan.unseen.length) })));
    }
  }
  card.append(el("div", "pz", mini, info));
  if (set.top_motif && ctx.data.motif_labels && ctx.data.motif_labels[set.top_motif]) {
    const motif = ctx.data.motif_labels[set.top_motif].toLowerCase();
    card.append(el("div", "pz-foot", el("span", "spark", "✦"),
      el("span", null, t("today.motif", { motif })), helpButton("top_motif", { motif })));
  }
  return card;
}

const KIND_COLORS = { missed: "var(--brilliant)", instead: "var(--bad)", punish: "var(--great)" };

function focusCard() {
  const card = el("article", "card focus");
  card.append(el("div", "card-head", el("span", "eyebrow", t("today.focus")), helpButton("focus")));
  const f = focusOf(ctx.data);
  if (!f) {
    card.append(el("p", "fine", t("today.focus_none")));
    return card;
  }
  card.append(arText("h2", f.weakness.title, "ar focus-title"), arText("p", f.why, "why"));
  if (f.metric && f.value != null) {
    const scope = t("scopes." + f.scope);
    const unit = f.share ? "%" : "";
    const leftToGo = Math.abs(f.goal - f.value);
    const width = f.share ? f.value : Math.min(100, (f.value / Math.max(f.goal, f.value) / 1.25) * 100);
    const mark = f.share ? f.goal : Math.min(100, (f.goal / Math.max(f.goal, f.value) / 1.25) * 100);
    const helpKey = f.metric === "top_motif" ? "top_motif_rate" : f.metric;
    card.append(el("div", "metric",
      el("div", "metric-top", el("span", "num", f.shown), helpButton(helpKey, { goal: f.goal + unit }),
        el("span", "chip " + (f.reached ? "good" : ""), f.reached ? t("today.reached") : t("today.goal", { goal: f.goal + unit }))),
      el("p", "metric-label", t(`metrics.${f.metric}.label`, { scope: scope.toLowerCase() })),
      el("div", "goalbar", el("i", { style: { width: width + "%" } }), el("b", { style: { left: mark + "%" } })),
      el("p", "fine", t("today.focus_fine", { scope, base: f.base ? t(`metrics.${f.metric}.base`, { n: f.base }) : "" }) +
        (f.reached ? "" : " · " + t("today.to_go", { left: (Math.round(leftToGo * 10) / 10) + (f.share ? " points" : "") })))));
  }
  if (f.advice) card.append(el("div", { class: "rule", dir: "rtl", lang: "ar" }, el("span", "rule-lbl", t("today.advice")), arText("p", f.advice)));
  card.append(el("button", { class: "link", type: "button", onclick: () => ctx.go("progress", "coach") }, t("today.read_notes")));
  return card;
}

function planCard() {
  const plan = todaysPlan(ctx.data);
  const card = el("article", "card plan");
  const weekday = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  card.append(el("div", "card-head", el("div", null, el("h2", null, t("today.plan")), el("p", "sub", t("today.plan_sub", { day: weekday }))),
    helpButton("plan")));
  if (!plan || !plan.tasks.length) {
    card.append(el("p", "fine", plan ? t("today.plan_none") : t("today.focus_none")));
    return card;
  }
  const key = "chess-coach-plan";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { saved = {}; }
  if (saved.day !== day()) saved = { day: day(), done: [] };
  const list = el("ul", { dir: "rtl", lang: "ar" });
  plan.tasks.forEach((task, i) => {
    const box = el("input", { type: "checkbox", class: "check" });
    box.checked = saved.done.includes(i);
    box.addEventListener("change", () => {
      saved.done = box.checked ? [...new Set([...saved.done, i])] : saved.done.filter((x) => x !== i);
      try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) { /* fine */ }
    });
    list.append(el("li", null, el("label", null, box, iso(el("span"), task))));
  });
  card.append(list);
  return card;
}

// ---------------------------------------------------------------- the puzzle board
let headLine = null;

function renderPlayer(main) {
  headLine = el("span", "chip accent");
  main.append(el("header", "top",
    el("div", null, el("p", "kicker", t("puzzles.kicker")), el("h1", null, t("today.puzzles"))),
    el("div", "top-right", headLine, el("button", { class: "btn small ghost", type: "button", onclick: () => ctx.go("today") }, t("puzzles.back")))));
  const boardBox = el("div", "pz-board");
  const panel = el("div", "card pz-panel");
  main.append(el("div", "pz-layout", boardBox, panel));
  board = new Board(boardBox);
  if (!cur || (cur.answer && cur.seen)) loadNext();
  if (cur) cur.seen = Boolean(cur.answer);
  keyHandler = (event) => {
    if (!cur || !cur.answer || (event.target.closest && event.target.closest("input, select, textarea"))) return;
    if (event.key === "ArrowLeft") { stepTo(cur.at - 1); event.preventDefault(); }
    if (event.key === "ArrowRight") { stepTo(cur.at + 1); event.preventDefault(); }
  };
  document.addEventListener("keydown", keyHandler);
  draw(panel, boardBox);
}

function loadNext() {
  const p = trainer.next();
  cur = p ? startPuzzle(p) : null;
  lastAt = 0;
}

function updateHead() {
  if (!headLine) return;
  const done = trainer.doneToday(), left = leftToday();
  headLine.textContent = t("puzzles.progress", { done: n(done), total: n(done + left) });
  refreshCount();
}

function draw(panel = document.querySelector(".pz-panel"), boardBox = document.querySelector(".pz-board")) {
  updateHead();
  ctx.busyScreen = Boolean(cur && !cur.answer);
  if (!cur) {
    boardBox.hidden = true;
    panel.replaceChildren(...doneCard());
    return;
  }
  boardBox.hidden = false;
  drawBoard(false);
  panel.replaceChildren(...(cur.answer ? afterPanel() : beforePanel()));
}

function drawBoard(animate) {
  const p = cur.p;
  board.setFlip(p.color === "black");
  if (!cur.answer) {
    board.set({ fen: placement(cur.pos), last: cur.last }, { animate, sound: animate });
    if (cur.busy) board.disable();
    else board.enable(cur.node.legal.map(([u]) => u), onMove);
    return;
  }
  board.disable();
  const pos = cur.positions[cur.at];
  const prev = cur.line[cur.at - 1];
  const lastUci = prev ? prev.uci : p.last;
  const state = { fen: placement(pos), arrows: [], marks: {} };
  if (lastUci) {
    if (prev && prev.who === "you") state.marks = { [lastUci.slice(0, 2)]: "good", [lastUci.slice(2, 4)]: "good" };
    else state.last = lastUci;
  }
  const next = cur.line[cur.at];
  const arrow = (uci, kind, dashed) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), kind, dashed });
  if (cur.wrong && cur.at === cur.wrong.at) {
    state.arrows.push(arrow(cur.wrong.uci, "bad", true));
    if (next) state.arrows.push(arrow(next.uci, "", false));
  } else if (next) {
    state.arrows.push(arrow(next.uci, cur.at % 2 === 0 ? "" : "mine", cur.at % 2 === 1));
  }
  board.set(state, { animate, sound: animate });
}

function onMove(uci, { dropped } = {}) {
  const c = cur, node = c.node;
  const legal = node.legal.find(([u]) => u === uci);
  c.pos = apply(c.pos, uci);
  c.moves.push({ uci, san: legal ? legal[1] : uci, who: "you" });
  c.last = uci;
  const right = node.right.includes(uci);
  const branch = right && node.branches ? node.branches[uci] : null;
  board.set({ fen: placement(c.pos), last: uci }, { animate: !dropped, sound: true });
  if (branch && branch.next && branch.line.length > 1) {
    c.busy = true;
    board.disable();
    document.querySelector(".pz-panel").replaceChildren(...beforePanel());
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (cur !== c || !board) return;
      const [reply, replySan] = branch.line[1];
      c.pos = apply(c.pos, reply);
      c.moves.push({ uci: reply, san: replySan, who: "reply" });
      c.last = reply;
      c.node = branch.next;
      c.step += 1;
      c.busy = false;
      c.hint = null;
      board.set({ fen: placement(c.pos), last: reply }, { animate: true });
      board.enable(c.node.legal.map(([u]) => u), onMove);
      document.querySelector(".pz-panel").replaceChildren(...beforePanel());
    }, 650);
    return;
  }
  finish(right, uci, branch);
}

function finish(right, uci, branch) {
  const result = trainer.answer(cur.p, right);
  cur.answer = { uci, right, before: result.before, after: result.after };
  finishLine(cur, right, uci, branch);
  lastAt = cur.at;
  playSound(right ? "end" : "move");
  draw();
}

function giveUp() {
  clearTimeout(timer);
  cur.busy = false;
  finish(false, null, null);
}

function stepTo(at) {
  if (!cur || !cur.answer) return;
  const next = Math.max(0, Math.min(cur.line.length, at));
  const forward = next === lastAt + 1;
  cur.at = next;
  lastAt = next;
  drawBoard(forward);
  const stepper = document.querySelector(".pz-stepper");
  if (stepper) stepper.replaceWith(makeStepper());
}

function metaLine(p) {
  return t("puzzles.meta", { tc: p.time_class.charAt(0).toUpperCase() + p.time_class.slice(1), control: p.control,
    date: fmtDate(p.date), opponent: p.opponent, rating: p.opp_rating ? ` (${n(p.opp_rating)})` : "" });
}

function tag(p, review) {
  return el("span", "chip", el("i", { class: "kind-dot", style: { background: KIND_COLORS[p.kind] } }),
    t("kinds." + p.kind + ".label") + (review && typeof review.s === "number" ? " · " + t("puzzles.review") : ""));
}

function beforePanel() {
  const c = cur, p = c.p;
  const color = t("puzzles." + p.color);
  const moveNo = p.move_number + c.step - 1;
  const prompt = c.step > 1 ? t("puzzles.keep_going", { step: c.step, max: trainer.set.max_moves }) : t("kinds." + p.kind + ".prompt");
  const hint = c.busy ? t("puzzles.answering") : t("puzzles.tap_piece", { color: color.toLowerCase() });
  return [
    tag(p, trainer.st(p)),
    el("p", "pz-prompt", prompt),
    el("p", "pz-turn", t("puzzles.to_move", { color, move: moveNo })),
    el("p", "pz-meta", metaLine(p)),
    hintLine(hint, color),
    el("div", "pz-actions", el("button", { class: "btn", type: "button", onclick: giveUp, disabled: c.busy || null }, t("puzzles.show"))),
  ];
}

// The hint under the prompt follows the board: pick up a piece, put it down, or "that piece can't move".
function hintLine(text, color) {
  const line = el("p", "pz-hint", text);
  if (board) {
    board.onSelect = (square, why) => {
      if (cur && cur.busy) return;
      line.textContent = square ? t("puzzles.tap_square") : why === "no-move" ? t("puzzles.no_move")
        : t("puzzles.tap_piece", { color: color.toLowerCase() });
    };
  }
  return line;
}

function afterPanel() {
  const c = cur, p = c.p, a = c.answer;
  const white = p.color === "white";
  const moveNo = p.move_number + c.step - 1;
  const label = (san) => `${moveNo}${white ? "." : "..."} ${san}`;
  const lines = c.node.lines || p.lines;
  const out = [tag(p, a.before)];
  let verdict, detail = null;
  if (a.right) {
    verdict = [t("puzzles.right"), "good"];
    detail = c.step > 1 ? t("puzzles.found_all", { n: c.step })
      : p.right.length > 1 ? t("puzzles.one_of_two", { move: label(c.moves[0].san) }) : t("puzzles.best", { move: label(c.moves[0].san) });
  } else if (a.uci == null) {
    verdict = [t("puzzles.shown"), "bad"];
  } else {
    verdict = [t("puzzles.wrong"), "bad"];
    const line = lines.find(([u]) => u === a.uci);
    const where = c.step > 1 ? t("puzzles.step", { step: c.step }) : "";
    detail = el("span", null, where + (line
      ? t("puzzles.kept", { move: label(c.wrong.san), mine: pct(line[2] / 100), best: pct(lines[0][2] / 100) })
      : t("puzzles.worse", { move: label(c.wrong.san) })), " ", line ? helpButton("win_chance") : null);
  }
  out.push(el("p", "pz-verdict " + verdict[1], verdict[0]));
  if (detail) out.push(el("p", null, detail));
  if (p.motif && ctx.data.motif_labels && ctx.data.motif_labels[p.motif]) {
    out.push(el("p", "pz-note", t("puzzles.theme", { motif: ctx.data.motif_labels[p.motif] }) +
      (p.motif === trainer.set.top_motif ? t("puzzles.your_top") : "")));
  }
  if (p.explain) out.push(explainBox(p.explain));
  else {
    const story = p.kind === "missed" ? t("puzzles.story_missed", { move: label(p.played_san || "?") })
      : p.kind === "instead" ? t("puzzles.story_instead", { move: label(p.played_san || "?") })
      : t("puzzles.story_punish", { move: p.blunder_san || "?" });
    out.push(el("p", "pz-note", story));
  }
  out.push(makeStepper(), el("p", "pz-note", scheduleText(a.after)), el("p", "pz-meta", metaLine(p)));
  if (p.link) out.push(el("p", null, el("button", { class: "link", type: "button", style: { marginTop: 0 }, onclick: () => api.openOutside(p.link) }, t("puzzles.chesscom"))));
  out.push(el("div", "pz-actions", el("button", { class: "btn primary", type: "button", onclick: () => { loadNext(); draw(); window.scrollTo(0, 0); } }, t("puzzles.next"))));
  return out;
}

function explainBox(e) {
  const box = el("div", { class: "pz-explain", dir: "rtl", lang: "ar" });
  for (const key of ["idea", "escape", "game", "clue"]) {
    if (!e[key]) continue;
    const para = el("p", null, el("b", null, t("puzzles.explain." + key) + ": "));
    iso(para, e[key]);
    box.append(para);
  }
  if (e.question) box.append(iso(el("p", "q"), e.question));
  return box;
}

function makeStepper() {
  const c = cur;
  const nav = el("div", "pz-nav");
  for (const [text, name, at] of [["⏮", "start", () => 0], ["◀", "back_step", () => c.at - 1], ["▶", "next_step", () => c.at + 1],
    ["⏭", "end", () => c.line.length]]) {
    nav.append(el("button", { class: "btn small", type: "button", "aria-label": t("puzzles." + name), onclick: () => stepTo(at()) }, text));
  }
  const list = el("div", "pz-moves");
  c.line.forEach((m, i) => list.append(el("button", { type: "button", class: "pz-move" + (m.who === "you" ? " you" : "") + (i === c.at - 1 ? " on" : ""),
    onclick: () => stepTo(i + 1) }, numbered(c, i))));
  return el("div", "pz-stepper", nav, list);
}

function scheduleText(after) {
  if (after.s === "done") return t("puzzles.done_first");
  if (after.s === "learned") return t("puzzles.learned");
  const days = Math.round((new Date(after.due + "T00:00:00") - new Date(day() + "T00:00:00")) / 86400000);
  return days === 1 ? t("puzzles.tomorrow") : t("puzzles.in_days", { n: days });
}

function doneCard() {
  const plan = trainer.plan(), set = trainer.set;
  const waiting = trainer.waiting();
  const out = [el("div", "pz-done-big", plan.unseen.length || waiting.length ? t("today.all_done") : t("puzzles.all_solved"))];
  out.push(el("p", "pz-note", waiting.length
    ? t("today.all_done_sub", { when: waiting[0] === day(1) ? "tomorrow" : fmtDate(waiting[0]) }) : t("today.no_reviews")));
  if (plan.unseen.length) {
    out.push(el("p", "pz-note", t("puzzles.waiting", { n: n(plan.unseen.length), per_day: n(set.new_per_day) })));
    out.push(el("div", "pz-actions", el("button", { class: "btn primary", type: "button", onclick: () => { trainer.moreToday(); loadNext(); draw(); } },
      t("puzzles.more", { n: Math.min(set.new_per_day, plan.unseen.length) }))));
  } else {
    out.push(el("p", "pz-note", t("puzzles.no_new")));
  }
  out.push(el("div", "pz-actions", el("button", { class: "btn ghost", type: "button", onclick: () => ctx.go("today") }, t("puzzles.back"))));
  return out;
}

// Today's count on the sidebar badge, without opening Today.
export async function countToday(context) {
  ctx = context;
  if (!ctx.data) return 0;
  await getTrainer();
  return leftToday();
}



