// Settings > Look: light or dark, the board's colors, the pieces, the highlight colors, how fast pieces move.
// Applying the look sets CSS variables on <html>, so every board in the app changes at once.

export const DEFAULT_LOOK = { theme: "dark", board: "classic", pieces: "cburnett", last: "sun", sel: "sun", arrow: "green",
  speed: "normal", sound: true, volume: 0.6, coords: true, dots: true };  // the same as chess_coach/profile.py

// [id, light square, dark square]: the app's own colors.
export const BOARDS = [
  ["classic", "#ecd6b0", "#b2865f"], ["walnut", "#e3c9a0", "#8a5c3e"], ["sea", "#dce7f0", "#6b8fb3"],
  ["forest", "#e6ecd6", "#779461"], ["slate", "#dde2e7", "#7a8592"], ["aqua", "#d6f0f3", "#3f9daf"],
  ["rose", "#f1dfdf", "#c08890"], ["night", "#5b6e7f", "#2f3e4b"],
];
// [id, swatch, last-move fill, picked-up fill]
export const HIGHLIGHTS = [
  ["sun", "#ffd246", "rgba(255, 210, 70, .42)", "rgba(255, 210, 70, .66)"],
  ["aqua", "#17cde7", "rgba(23, 205, 231, .34)", "rgba(23, 205, 231, .55)"],
  ["lime", "#9ad73c", "rgba(150, 215, 60, .40)", "rgba(150, 215, 60, .62)"],
  ["coral", "#ff7d69", "rgba(255, 125, 105, .38)", "rgba(255, 125, 105, .60)"],
  ["lilac", "#a082ff", "rgba(160, 130, 255, .36)", "rgba(160, 130, 255, .58)"],
];
export const ARROWS = [["green", "#3ccf91"], ["aqua", "#17cde7"], ["blue", "#4c8dff"], ["orange", "#ffa24a"], ["pink", "#ff6fae"]];
export const SPEEDS = { off: 0, fast: 120, normal: 220, slow: 380 };

// The piece sets in ui/pieces (from github.com/lichess-org/lila, public/piece; licenses in ui/licenses.json).
export const PIECE_SETS = [
  ["cburnett", "Classic"], ["merida", "Merida"], ["chessnut", "Chessnut"], ["mpchess", "MPChess"], ["fantasy", "Fantasy"],
  ["celtic", "Celtic"], ["spatial", "Spatial"], ["firi", "Firi"], ["kiwen-suwi", "Kiwen-suwi"], ["pixel", "Pixel"],
  ["letter", "Letter"], ["shapes", "Shapes"], ["rhosgfx", "RhosGFX"],
];

let current = { ...DEFAULT_LOOK };
const listeners = new Set();

export function look() {
  return current;
}

// "wN" / "bQ" -> the picture of that piece in the chosen set
export function pieceUrl(code, set = current.pieces) {
  return `pieces/${set}/${code}.svg`;
}

export function animMs() {
  return SPEEDS[current.speed] ?? SPEEDS.normal;
}

export function isDark() {
  return current.theme === "dark" || (current.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyLook(next) {
  current = { ...DEFAULT_LOOK, ...(next || {}) };
  const root = document.documentElement;
  root.dataset.theme = isDark() ? "dark" : "light";
  const board = BOARDS.find((b) => b[0] === current.board) || BOARDS[0];
  root.style.setProperty("--sq-l", board[1]);
  root.style.setProperty("--sq-d", board[2]);
  root.style.setProperty("--hl-last", (HIGHLIGHTS.find((h) => h[0] === current.last) || HIGHLIGHTS[0])[2]);
  root.style.setProperty("--hl-sel", (HIGHLIGHTS.find((h) => h[0] === current.sel) || HIGHLIGHTS[0])[3]);
  root.style.setProperty("--arrow-good", (ARROWS.find((a) => a[0] === current.arrow) || ARROWS[0])[1]);
  root.style.setProperty("--anim", animMs() + "ms");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark() ? "#0d1014" : "#fbfbfa";
  for (const fn of listeners) fn(current);
}

// Boards that show pieces redraw when the piece set changes.
export function onLookChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (current.theme === "system") applyLook(current); });
