// Puzzles from your own games: the same rules as the old report (puzzles.py picks and checks them; this file plays
// them). Every day: the reviews that are due first, then new puzzles, half of them from your most common mistake,
// mixed so the theme can't be guessed. A missed puzzle comes back after 1 day, then 3, then 7; solving it at the
// one-week review means it's learned. Progress: the app's data folder (puzzle_progress.json), or the phone's storage.
//
// Puzzle ids "<game>:<ply>:<kind>" never change, so saved progress always finds its puzzle.

import * as api from "./api.js";

export const WAIT = [1, 3, 7];
const LOG_DAYS = 182;
const two = (h) => String(h).padStart(2, "0");

export function day(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function addDays(dayText, n) {
  const d = new Date(dayText + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function monday(dayText) {
  return addDays(dayText, -((new Date(dayText + "T00:00:00").getDay() + 6) % 7));
}

function hash(text) {  // FNV-1a: a pseudo-random number per text, the same every time
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- positions (the page doesn't know chess rules:
// Python sent every legal move with the puzzle)
export function position(placement) {
  const pos = {};
  placement.split("/").forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") { file += Number(ch); continue; }
      pos[String.fromCharCode(97 + file) + (8 - i)] = ch;
      file++;
    }
  });
  return pos;
}

export function placement(pos) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = "", empty = 0;
    for (let file = 0; file < 8; file++) {
      const ch = pos[String.fromCharCode(97 + file) + rank];
      if (!ch) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += ch;
    }
    rows.push(row + (empty || ""));
  }
  return rows.join("/");
}

// The position after a legal move: castling moves the rook, en passant removes the pawn, a promotion puts the piece.
export function apply(pos, uci) {
  const from = uci.slice(0, 2), to = uci.slice(2, 4), piece = pos[from];
  const next = { ...pos };
  delete next[from];
  if ((piece === "P" || piece === "p") && from[0] !== to[0] && !pos[to]) delete next[to[0] + from[1]];
  if ((piece === "K" || piece === "k") && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
    const [rookFrom, rookTo] = to[0] === "g" ? ["h", "f"] : ["a", "d"];
    next[rookTo + from[1]] = next[rookFrom + from[1]];
    delete next[rookFrom + from[1]];
  }
  next[to] = uci[4] ? (piece === "P" ? uci[4].toUpperCase() : uci[4]) : piece;
  return next;
}

// ---------------------------------------------------------------- the trainer: today's plan and the answers
export class Trainer {
  constructor(data) {
    this.items = (data && data.puzzles && data.puzzles.items) || [];
    this.set = Object.assign({ new_per_day: 10, margin: 5, days: 60, blunders: 150, keep_days: 183,
      open_win_chance: [20, 80], top_motif: null, top_share: 0.5, max_moves: 3 }, (data && data.puzzles && data.puzzles.settings) || {});
    this.state = { v: 1, p: {}, day: "", fresh: 0, freshTop: 0, extra: 0, log: [] };
  }

  async load() {
    try {
      const saved = await api.puzzleState();
      if (saved && saved.v === 1 && saved.p && typeof saved.p === "object") {
        if (!Array.isArray(saved.log)) saved.log = [];
        this.state = saved;
      }
    } catch (e) { /* no progress yet */ }
    return this;
  }

  save() {
    return api.savePuzzleState(this.state).catch(() => {});
  }

  st(p) {
    return this.state.p[p.id];
  }

  // Today's plan: the reviews that are due (oldest first), then new puzzles (newest games first) up to the day's number.
  plan() {
    const today = day();
    if (this.state.day !== today) Object.assign(this.state, { day: today, fresh: 0, freshTop: 0, extra: 0 });
    const due = this.items.filter((p) => this.st(p) && typeof this.st(p).s === "number" && this.st(p).due <= today)
      .sort((a, b) => this.st(a).due.localeCompare(this.st(b).due));
    const unseen = this.items.filter((p) => !this.st(p));
    const limit = this.set.new_per_day + (this.state.extra || 0);
    return { due, unseen, fresh: this.fresh(unseen, limit, Math.max(0, limit - this.state.fresh), today) };
  }

  fresh(unseen, limit, left, today) {
    const top = this.set.top_motif;
    if (!top || !left) return unseen.slice(0, left);
    const tops = unseen.filter((p) => p.motif === top), others = unseen.filter((p) => p.motif !== top);
    const topLeft = Math.max(0, Math.round(limit * this.set.top_share) - (this.state.freshTop || 0));
    let pickTop = tops.slice(0, Math.min(topLeft, left));
    const pickOther = others.slice(0, left - pickTop.length);
    if (pickTop.length + pickOther.length < left) pickTop = tops.slice(0, left - pickOther.length);
    return [...pickTop, ...pickOther].sort((a, b) => hash(today + a.id) - hash(today + b.id));
  }

  next() {
    const plan = this.plan();
    return plan.due[0] || plan.fresh[0] || null;
  }

  doneToday() {
    const today = day();
    return (this.state.log || []).filter((e) => e.d === today).length;
  }

  // Count an answer (right = every step right; uci null = "Show the answer"), move the puzzle along its repeats, save.
  answer(p, right) {
    const before = this.st(p);
    let after;
    if (!before) {
      after = right ? { s: "done" } : { s: 1, due: day(WAIT[0]) };
      this.state.fresh += 1;
      if (p.motif && p.motif === this.set.top_motif) this.state.freshTop = (this.state.freshTop || 0) + 1;
    } else if (typeof before.s === "number") {
      after = !right ? { s: 1, due: day(WAIT[0]) }
        : before.s < WAIT.length ? { s: before.s + 1, due: day(WAIT[before.s]) } : { s: "learned" };
    } else {
      after = before;
    }
    this.state.p[p.id] = { ...after, tries: ((before && before.tries) || 0) + 1 };
    const oldest = day(-LOG_DAYS);
    this.state.log = (this.state.log || []).filter((e) => e.d >= oldest);
    this.state.log.push({ d: day(), id: p.id, r: right ? 1 : 0, f: before ? 0 : 1 });
    this.save();
    return { before, after };
  }

  moreToday() {
    this.state.extra = (this.state.extra || 0) + this.set.new_per_day;
    this.save();
  }

  waiting() {
    return this.items.map((p) => this.st(p)).filter((s) => s && typeof s.s === "number").map((s) => s.due).sort();
  }
}

// ---------------------------------------------------------------- one puzzle on the board
// node: the step being solved (the first position, or a later step of the solution tree); moves: what was played so
// far. After the end, line + positions + at drive the back and next buttons.
export function startPuzzle(p) {
  const start = position(p.board);
  return { p, node: { right: p.right, legal: p.legal, lines: p.lines, branches: p.tree ? p.tree.branches : null,
    best: p.tree ? p.tree.best : null },
    step: 1, moves: [], start, pos: start, last: p.last, busy: false, answer: null, line: null, positions: null, at: 0,
    wrong: null };
}

// The answer's whole line from a step: the best answer and its reply at every step of the tree, then the rest.
export function bestLine(c, node) {
  const move = node.best || (node.lines || []).map(([u]) => u).find((u) => node.right.includes(u)) || node.right[0];
  const branch = node.branches && node.branches[move];
  if (branch) return branch.next && branch.line.length > 1 ? [...branch.line.slice(0, 2), ...bestLine(c, branch.next)] : branch.line;
  const p = c.p, san = (node.legal.find(([u]) => u === move) || [move, move])[1];
  return move === p.lines[0][0] && p.reply ? [[move, san], [p.reply, p.reply_san]] : [[move, san]];
}

// The puzzle is over: set up the line for the stepper. Solved: your moves and the replies, then the rest of the line.
// Missed: up to the step you missed, then the right answer and its line from there.
export function finishLine(c, right, uci, branch) {
  const tagged = (pairs, first) => pairs.map(([u, s], i) => ({ uci: u, san: s, who: i === 0 ? first : "rest" }));
  if (right) {
    const tail = branch ? tagged(branch.line.slice(1), "rest")
      : uci === c.p.lines[0][0] && c.p.reply ? [{ uci: c.p.reply, san: c.p.reply_san, who: "rest" }] : [];
    c.line = [...c.moves, ...tail];
    c.at = c.moves.length;
  } else {
    const before = uci ? c.moves.slice(0, -1) : c.moves.slice();
    c.wrong = uci ? { uci, san: c.moves[c.moves.length - 1].san, at: before.length } : null;
    c.line = [...before, ...tagged(bestLine(c, c.node), "answer")];
    c.at = before.length;
  }
  c.positions = [c.start];
  for (const m of c.line) c.positions.push(apply(c.positions[c.positions.length - 1], m.uci));
}

// "14. Nb5", "14... Nxa2": the line's moves numbered from the puzzle's first move.
export function numbered(c, i) {
  const m = c.line[i], white = c.p.color === "white", n0 = c.p.move_number;
  if (white) return i % 2 === 0 ? `${n0 + i / 2}. ${m.san}` : m.san;
  if (i === 0) return `${n0}... ${m.san}`;
  return i % 2 === 1 ? `${n0 + (i + 1) / 2}. ${m.san}` : m.san;
}
