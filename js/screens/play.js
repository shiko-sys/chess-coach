// Play: a game against Gojo bot (Maia-3 trained on your moves), base Maia-3 at a chosen rating, or the blind test
// (one of the two, hidden; two questions after the game). The bot runs in its own process (app/bot.py); the board
// sends your moves and draws its answers.

import * as api from "../api.js";
import { el, helpButton, n, seg, toast } from "../dom.js";
import { t } from "../i18n.js";
import { Board, kingSquare } from "../board.js";
import { play as playSound } from "../sound.js";

let ctx = null;
let board = null;
let S = null;         // the server's state of the game on the board
let busy = false;
let guess = null;     // blind test: the answer to the first question
let choice = null;    // { mode, color, style }
let info = null;      // /api/play/info: the model, the book, the blind score
let parts = null;

export function leave() {
  if (board) board.destroy();
  board = null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function render(main, context) {
  ctx = context;
  main.append(el("header", "top", el("div", null, el("p", "kicker", t("play.kicker")), el("h1", null, t("play.title")))));
  if (api.PHONE) {
    main.append(el("div", "card empty-state", el("p", null, t("play.phone"))));
    return;
  }
  const bot = ctx.state.bot || {};
  if (!bot.installed) {
    main.append(el("div", "card empty-state", el("p", null, t("play.not_installed"))));
    return;
  }
  const settings = ctx.state.settings.bot, tuned = ctx.state.tuned_bot;
  choice = choice || { mode: settings.opponent === "maia" || !bot.model ? "maia" : "fine", color: "white",
    style: settings.style || tuned.style };
  const boardBox = el("div", "play-board");
  parts = {
    status: el("div", "play-status", t("play.waking")),
    who: el("p", "play-who"),
    moves: el("div", "play-moves"),
    ask: el("div", { class: "card play-ask", hidden: true }),
    score: el("p", "note"),
    newButton: el("button", { class: "btn primary", type: "button", disabled: true }, t("play.new")),
    endButton: el("button", { class: "btn", type: "button", disabled: true }, t("play.end")),
    info: el("p", "fine"),
  };
  parts.newButton.addEventListener("click", newGame);
  parts.endButton.addEventListener("click", endGame);
  const opponents = el("div", "opponents");
  const drawOpponents = () => {
    opponents.replaceChildren(...["fine", "blind", "maia"].map((mode) => {
      const [title, line] = t("play.opponents." + mode, { model: bot.model || "?", elo: settings.maia_elo });
      const disabled = mode !== "maia" && !bot.model;
      const card = el("button", { type: "button", class: "opponent", "aria-pressed": String(choice.mode === mode), disabled: disabled || null },
        el("b", null, title, mode === "blind" ? helpButton("blind") : null), el("span", null, line));
      card.addEventListener("click", () => { choice.mode = mode; drawOpponents(); });
      return card;
    }));
  };
  drawOpponents();
  const setup = el("div", "card play-setup",
    el("h3", null, t("play.opponent")), opponents,
    el("div", "play-row", el("span", "lbl", t("play.color")),
      seg(["white", "black", "random"].map((c) => [c, t("play.colors." + c)]), choice.color, (c) => (choice.color = c))),
    el("div", "play-row", el("span", "lbl", t("play.style")),
      seg(["bullet", "blitz", "rapid"].map((s) => [s, t("play.styles." + s)]), choice.style, (s) => (choice.style = s))),
    el("div", "pz-actions", parts.newButton, parts.endButton), parts.info);
  const game = el("div", "card play-game", parts.status, parts.who, parts.moves);
  main.append(el("div", "play-layout", boardBox, el("div", "play-panel", game, parts.ask, setup, el("div", "card", parts.score))));
  board = new Board(boardBox);
  board.set({ fen: S ? S.board : undefined, last: S ? S.last : null });
  if (S) draw(false);
  try {
    info = await api.post("/api/play/info");
    parts.info.append(t("play.ready", { model: info.fine_tuned || "–", book: n(info.book_positions) }), " ", helpButton("book"));
    drawScore(info.score);
    if (!S) parts.status.textContent = t("play.press_new");
    parts.newButton.disabled = false;
    if (S) draw(false);
  } catch (error) {
    parts.status.textContent = error.message;
  }
}

async function run(task) {
  if (busy) return;
  busy = true;
  draw(false);
  try { await task(); } catch (error) { toast(error.message, true); }
  busy = false;
  draw(false);
}

function newGame() {
  run(async () => {
    guess = null;
    S = await api.post("/api/play/new", { mode: choice.mode, color: choice.color, style: choice.style });
    draw(false);
    if (S.to_move === "bot") {
      await sleep(300);
      S = await api.post("/api/play/bot", { id: S.id });
      draw(true);
    }
  });
}

function onMove(uci, { dropped } = {}) {
  run(async () => {
    S = await api.post("/api/play/move", { id: S.id, uci });
    draw(!dropped);
    if (S.to_move === "bot") {
      await sleep(250);
      S = await api.post("/api/play/bot", { id: S.id });
      draw(true);
    }
  });
}

function endGame() {
  run(async () => { S = await api.post("/api/play/end", { id: S.id }); });
}

function answer(likeMe) {
  run(async () => {
    S = await api.post("/api/play/answer", { id: S.id, guess, like_me: likeMe });
    if (S.score) drawScore(S.score);
  });
}

function botName() {
  return S && S.bot !== "hidden" ? S.bot : t("play.opponents.blind")[0];
}

function statusText() {
  if (!S) return t("play.press_new");
  if (S.over) {
    const r = S.over.result, mine = S.user_color === "white" ? "1-0" : "0-1";
    const what = r === "*" ? t("play.ended") : r === "1/2-1/2" ? t("play.draw") : r === mine ? t("play.won") : t("play.lost", { bot: botName() });
    const reasons = t("play.reasons");
    return `${what} (${reasons[S.over.reason] || S.over.reason})`;
  }
  return S.to_move === "user" ? (S.check ? t("play.check") : t("play.your_move")) : t("play.thinking", { bot: botName() });
}

let lastOver = false;
function draw(animate) {
  if (!parts || !board) return;
  ctx.busyScreen = Boolean(S && !S.over);
  parts.status.textContent = statusText();
  parts.newButton.disabled = busy || !info;
  parts.endButton.disabled = busy || !S || Boolean(S.over);
  if (!S) return;
  const whiteToMove = S.moves.length % 2 === 0;
  board.setFlip(S.user_color === "black");
  board.set({ fen: S.board, last: S.last, check: S.check ? kingSquare(S.board, whiteToMove) : null }, { animate, sound: animate });
  if (S.to_move === "user" && !busy) board.enable(S.legal.map(([u]) => u), onMove);
  else board.disable();
  if (S.over && !lastOver) playSound("end");
  lastOver = Boolean(S.over);
  const style = t("play.styles." + S.style);
  const source = S.source ? " · " + (S.source === "book" ? t("play.from_book") : t("play.from_model")) : "";
  const name = S.bot === "hidden" ? t("play.hidden") : S.bot;
  parts.who.textContent = (S.mode === "maia" ? t("play.who_maia", { bot: name }) : t("play.who", { bot: name, style })) + source;
  const list = [];
  S.moves.forEach((san, i) => {
    if (i % 2 === 0) list.push(el("b", null, `${i / 2 + 1}.`));
    list.push(el("span", null, san));
  });
  parts.moves.replaceChildren(...list);
  parts.moves.scrollTop = parts.moves.scrollHeight;
  drawAsk();
}

function drawAsk() {
  const box = parts.ask;
  box.hidden = !(S && (S.ask || (S.mode === "blind" && S.answer)));
  if (box.hidden) return;
  const buttons = (items) => el("div", "pz-actions", ...items.map(([label, onClick]) =>
    el("button", { class: "btn", type: "button", disabled: busy || null, onclick: onClick }, label)));
  if (S.answer) {
    const it = S.answer.secret === "fine" ? t("play.fine") : t("play.base");
    box.replaceChildren(el("p", "pz-verdict " + (S.answer.correct ? "good" : "bad"),
      t("play.it_was", { it, right: S.answer.correct ? t("play.right") : t("play.wrong") })));
    return;
  }
  if (!guess) {
    box.replaceChildren(el("h3", null, t("play.q1")),
      buttons([[t("play.base"), () => { guess = "base"; drawAsk(); }], [t("play.fine"), () => { guess = "fine"; drawAsk(); }]]));
  } else {
    box.replaceChildren(el("p", "note", t("play.your_guess", { guess: guess === "fine" ? t("play.fine") : t("play.base") })),
      el("h3", null, t("play.q2")), buttons([[t("play.yes"), () => answer(true)], [t("play.no"), () => answer(false)]]));
  }
}

function drawScore(score) {
  if (!score || !parts) return;
  const p = score.per_model;
  parts.score.textContent = score.games
    ? t("play.score", { right: n(score.right), games: n(score.games), base: `${p.base.like_me}/${p.base.games}`, fine: `${p.fine.like_me}/${p.fine.games}` })
    : t("play.score_none");
}
