// The chess board every screen uses: drawn as SVG in the colors and pieces of Settings > Look, with highlights,
// arrows and move dots. A board can also take moves: click a piece then a square, or drag it. The legal moves always
// come from outside (the puzzle's list, the bot server): the board only draws and asks.
//
//   const b = new Board(container, { flip: false, coords: true });
//   b.set({ fen, last: "e2e4", arrows: [{ from: "g1", to: "f3" }], marks: { e4: "good" } });
//   b.enable(legalUcis, (uci) => ...)     // let the player move; called with "e2e4" or "e7e8q"
//   b.disable()

import { el, svgEl } from "./dom.js";
import { animMs, look, onLookChange, pieceUrl } from "./look.js";
import { play as playSound } from "./sound.js";

const SQ = 100;
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
export const START_FEN = START + " w KQkq - 0 1";

export function placementOf(fen) {
  const pos = {};
  (fen || START).split(" ")[0].split("/").forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") { file += Number(ch); continue; }
      pos[String.fromCharCode(97 + file) + (8 - i)] = ch;
      file++;
    }
  });
  return pos;
}

const code = (ch) => (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase();
const isWhite = (ch) => ch === ch.toUpperCase();

export class Board {
  constructor(container, options = {}) {
    this.box = el("div", "board-box");
    container.append(this.box);
    this.flip = Boolean(options.flip);
    this.coords = options.coords;  // undefined = follow Settings > Look
    this.state = { fen: START, last: null, arrows: [], marks: {}, check: null };
    this.legal = null;
    this.onMove = null;
    this.selected = null;
    this.drag = null;
    this.promo = null;
    this.svg = null;
    this.unlisten = onLookChange(() => this.draw());
    this.draw();
  }

  destroy() {
    this.unlisten();
    this.box.remove();
  }

  setFlip(flip) {
    this.flip = Boolean(flip);
    this.draw();
  }

  // Show a position. With animate, the pieces that moved slide there from where they were (and a sound plays).
  set(state, { animate = false, sound = animate } = {}) {
    const before = placementOf(this.state.fen);
    this.state = { last: null, arrows: [], marks: {}, check: null, ...state };
    this.selected = null;
    this.promo = null;
    this.draw();
    const after = placementOf(this.state.fen);
    if (animate) this.animate(before, after);
    if (sound) {
      const captured = Object.keys(before).length > Object.keys(after).length;
      playSound(this.state.check ? "check" : captured ? "capture" : "move");
    }
  }

  enable(legal, onMove) {
    this.legal = legal;
    this.onMove = onMove;
    this.draw();
  }

  disable() {
    this.legal = null;
    this.onMove = null;
    this.selected = null;
    this.draw();
  }

  xy(square) {
    const f = square.charCodeAt(0) - 97, r = Number(square[1]) - 1;
    return [(this.flip ? 7 - f : f) * SQ, (this.flip ? r : 7 - r) * SQ];
  }

  squareAt(event) {
    const box = this.svg.getBoundingClientRect();
    const fx = Math.min(7, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * 8)));
    const fy = Math.min(7, Math.max(0, Math.floor(((event.clientY - box.top) / box.height) * 8)));
    return String.fromCharCode(97 + (this.flip ? 7 - fx : fx)) + (this.flip ? fy + 1 : 8 - fy);
  }

  movesFrom(square) {
    return (this.legal || []).filter((u) => u.slice(0, 2) === square);
  }

  draw() {
    const { fen, last, arrows, marks, check } = this.state;
    const pos = placementOf(fen);
    const showCoords = this.coords ?? look().coords;
    const svg = svgEl("svg", { viewBox: "0 0 800 800", class: "board" + (this.legal ? " can-move" : ""), role: "img",
      "aria-label": `Chess board, ${this.flip ? "Black" : "White"} at the bottom` });
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      svg.append(svgEl("rect", { x: f * SQ, y: r * SQ, width: SQ, height: SQ, class: (r + f) % 2 ? "sq-d" : "sq-l" }));
    }
    const mark = (square, cls) => {
      const [x, y] = this.xy(square);
      svg.append(svgEl("rect", { x, y, width: SQ, height: SQ, class: cls }));
    };
    if (last) { mark(last.slice(0, 2), "hl-last"); mark(last.slice(2, 4), "hl-last"); }
    for (const [square, kind] of Object.entries(marks || {})) mark(square, "hl-" + kind);
    if (check) mark(check, "hl-check");
    if (this.selected) mark(this.selected, "hl-sel");
    if (showCoords) {
      for (let i = 0; i < 8; i++) {
        const file = String.fromCharCode(97 + (this.flip ? 7 - i : i)), rank = this.flip ? i + 1 : 8 - i;
        const letter = svgEl("text", { x: i * SQ + 94, y: 793, "text-anchor": "end", class: "coord " + (i % 2 ? "on-l" : "on-d") });
        letter.textContent = file;
        const number = svgEl("text", { x: 6, y: i * SQ + 19, class: "coord " + (i % 2 ? "on-d" : "on-l") });
        number.textContent = rank;
        svg.append(letter, number);
      }
    }
    this.pieces = {};
    for (const [square, ch] of Object.entries(pos)) {
      const [x, y] = this.xy(square);
      const image = svgEl("image", { href: pieceUrl(code(ch)), x, y, width: SQ, height: SQ, class: "pc", "data-sq": square });
      svg.append(image);
      this.pieces[square] = image;
    }
    if (this.selected && look().dots) {
      for (const uci of this.movesFrom(this.selected)) {
        const to = uci.slice(2, 4);
        const [x, y] = this.xy(to);
        if (pos[to] || (pos[this.selected] && pos[this.selected].toLowerCase() === "p" && to[0] !== this.selected[0])) {
          svg.append(svgEl("circle", { cx: x + 50, cy: y + 50, r: 44, class: "ring" }));
        } else {
          svg.append(svgEl("circle", { cx: x + 50, cy: y + 50, r: 15, class: "dot" }));
        }
      }
    }
    for (const a of arrows || []) svg.append(this.arrow(a));
    if (this.legal) this.listen(svg);
    this.svg = svg;
    const extra = this.promo ? [this.promoLayer()] : [];
    this.box.replaceChildren(svg, ...extra);
  }

  arrow({ from, to, kind = "", dashed = false }) {
    const [x1, y1] = this.xy(from).map((v) => v + 50), [x2, y2] = this.xy(to).map((v) => v + 50);
    const ang = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(ang), s = Math.sin(ang), head = 36;
    const bx = x2 - c * (head + 4), by = y2 - s * (head + 4), tx = x2 - c * 6, ty = y2 - s * 6;
    const g = svgEl("g", { class: `arrow ${kind}${dashed ? " dashed" : ""}` });
    g.append(svgEl("line", { x1, y1, x2: bx + c * 4, y2: by + s * 4, "stroke-width": 16, "stroke-linecap": "round" }));
    g.append(svgEl("polygon", { points: `${tx},${ty} ${bx - s * head * 0.62},${by + c * head * 0.62} ${bx + s * head * 0.62},${by - c * head * 0.62}` }));
    return g;
  }

  // Pieces that changed squares slide from their old square (Web Animations: the board is already final).
  animate(before, after) {
    const ms = animMs();
    if (!ms) return;
    const gone = [], came = [];
    for (const [sq, p] of Object.entries(before)) if (after[sq] !== p) gone.push({ sq, p });
    for (const [sq, p] of Object.entries(after)) if (before[sq] !== p) came.push({ sq, p });
    const dist = (a, b) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(a[1] - b[1]);
    for (const c of came) {
      let best = null;
      for (const g of gone) {
        const same = g.p === c.p || (g.p.toLowerCase() === "p" && isWhite(g.p) === isWhite(c.p) && "qrbn".includes(c.p.toLowerCase()));
        if (!g.used && same && (!best || dist(g.sq, c.sq) < dist(best.sq, c.sq))) best = g;
      }
      if (!best) continue;
      best.used = true;
      const image = this.pieces[c.sq];
      const [x0, y0] = this.xy(best.sq), [x1, y1] = this.xy(c.sq);
      image.animate([{ transform: `translate(${x0 - x1}px, ${y0 - y1}px)` }, { transform: "translate(0, 0)" }],
        { duration: ms, easing: "cubic-bezier(.2, .7, .2, 1)" });
    }
  }

  // ---------------------------------------------------------------- taking moves: click-click or drag
  listen(svg) {
    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.promo) return;
      const square = this.squareAt(event);
      if (this.selected && this.tryMove(this.selected, square)) return;
      if (this.movesFrom(square).length) {
        this.selected = this.selected === square ? null : square;
        this.draw();
        if (this.selected) this.startDrag(event, square);
        if (this.onSelect) this.onSelect(this.selected, null);
      } else {
        // A piece of the side to move that has no legal move: say so (the caller shows it).
        const pos = placementOf(this.state.fen), mover = this.legal && this.legal[0] ? pos[this.legal[0].slice(0, 2)] : null;
        const own = pos[square] && mover && isWhite(pos[square]) === isWhite(mover);
        if (this.selected) { this.selected = null; this.draw(); }
        if (this.onSelect) this.onSelect(null, own ? "no-move" : null);
      }
    });
  }

  startDrag(event, square) {
    const svg = this.svg, image = this.pieces[square];
    if (!image) return;
    const ghost = image.cloneNode();
    ghost.setAttribute("class", "drag");
    svg.append(ghost);
    image.classList.add("dragging");
    const box = svg.getBoundingClientRect();
    const move = (e) => {
      const x = ((e.clientX - box.left) / box.width) * 800 - 50, y = ((e.clientY - box.top) / box.height) * 800 - 50;
      ghost.setAttribute("x", x);
      ghost.setAttribute("y", y);
    };
    move(event);
    svg.setPointerCapture(event.pointerId);
    const up = (e) => {
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
      ghost.remove();
      image.classList.remove("dragging");
      const target = this.squareAt(e);
      if (target !== square) this.tryMove(square, target, true);
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
  }

  tryMove(from, to, dropped = false) {
    const moves = (this.legal || []).filter((u) => u.slice(0, 4) === from + to);
    if (!moves.length) return false;
    if (moves.length > 1) {  // a promotion: ask which piece
      this.promo = { from, to, moves };
      this.draw();
      return true;
    }
    this.finish(moves[0], dropped);
    return true;
  }

  finish(uci, dropped) {
    const handler = this.onMove;
    this.selected = null;
    this.promo = null;
    if (handler) handler(uci, { dropped });
  }

  promoLayer() {
    const { moves } = this.promo;
    const white = isWhite(placementOf(this.state.fen)[this.promo.from] || "P");
    const row = el("div", "row");
    for (const letter of "qrbn") {
      const uci = moves.find((u) => u[4] === letter);
      if (!uci) continue;
      const b = el("button", { type: "button", "aria-label": { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[letter] },
        el("img", { src: pieceUrl((white ? "w" : "b") + letter.toUpperCase()), alt: "" }));
      b.addEventListener("click", () => this.finish(uci, false));
      row.append(b);
    }
    const layer = el("div", "promo", row);
    layer.addEventListener("click", (event) => { if (event.target === layer) { this.promo = null; this.draw(); } });
    return layer;
  }
}

// The square of the king of the side to move, when it is in check (the page doesn't know chess rules, so the caller
// says whether it is check; this only finds the king).
export function kingSquare(fen, white) {
  const pos = placementOf(fen);
  return Object.keys(pos).find((sq) => pos[sq] === (white ? "K" : "k")) || null;
}
