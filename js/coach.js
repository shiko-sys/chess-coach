// The coach's notes in the app: the notes themselves (written in a Claude Code session, every number checked by
// coach.py) and the tracked numbers of the weekly table with the goals the notes set.

export const METRICS = {
  // key: [value name in the weekly table's facts, better: "higher" | "lower", a share in %]
  converted: ["winning positions won", "higher", true],
  late_blunders: ["blunders /100 after the opening", "lower", false],
  abandoned: ["abandoned", "lower", true],
  accuracy: ["accuracy", "higher", false],
  top_motif: ["top-motif blunders /100 open moves", "lower", false],
};
const BASES = { converted: "games with a winning position", late_blunders: "open moves after the opening",
  abandoned: "games", accuracy: "games", top_motif: null };
const VALUE_TO_METRIC = Object.fromEntries(Object.entries(METRICS).map(([key, [name]]) => [name, key]));

export const notesOf = (data) => (data && data.coach && data.coach.notes && data.coach.notes.scopes) || null;

// chess.com's time classes by the expected length of a game: base + 40 moves of increment.
export function timeClassOf(control) {
  const [base, inc] = String(control).split("+").map(Number);
  const seconds = base * 60 + 40 * (inc || 0);
  return seconds < 180 ? "bullet" : seconds < 600 ? "blitz" : "rapid";
}

function scopeOfFact(id) {
  const parts = id.split(".");
  if (parts[0] !== "all") return parts[0];
  if (parts[1] === "controls" && parts[2]) return timeClassOf(parts[2]);
  return null;
}

export function lastWeek(data, scope) {
  const weeks = data.scopes[scope] && data.scopes[scope].progress && data.scopes[scope].progress.weeks;
  return weeks && weeks.length ? weeks[weeks.length - 1] : null;
}

const numberOf = (text) => (text == null ? null : Number(String(text).replace(/[,%+]/g, "").replace("−", "-")));

// "Your one thing to work on": the first weakness of the notes, and the first tracked number it quotes that has a goal
// (an optional "focus": {"scope", "metric"} in the notes overrides it). Its value now: the weekly table's last row.
export function focusOf(data) {
  const notes = notesOf(data);
  const weakness = notes && notes.all && notes.all.weaknesses && notes.all.weaknesses[0];
  if (!weakness) return null;
  let pick = notes.all.focus || null;
  if (!pick) {
    for (const id of weakness.facts || []) {
      for (const name of (weakness.quoted || {})[id] || []) {
        const metric = VALUE_TO_METRIC[name], scope = scopeOfFact(id);
        if (metric && scope && notes[scope] && notes[scope].targets && notes[scope].targets[metric] != null) {
          pick = { scope, metric };
          break;
        }
      }
      if (pick) break;
    }
  }
  const out = { weakness, why: firstSentence(weakness.text), advice: weakness.action || null };
  if (!pick) return out;
  const row = lastWeek(data, pick.scope);
  const [name, better, share] = METRICS[pick.metric];
  const value = row ? numberOf(row.shown[name]) : null;
  const goal = notes[pick.scope].targets[pick.metric];
  const baseName = BASES[pick.metric];
  return { ...out, ...pick, value, shown: row ? row.shown[name] : null, goal, better, share,
    base: row && baseName ? row.shown[baseName] : null, reached: value != null && (better === "higher" ? value >= goal : value <= goal) };
}

function firstSentence(text) {
  const t = String(text || "").split("\n")[0];
  const cut = t.search(/[.!؟?]\s/);
  return cut > 0 ? t.slice(0, cut + 1) : t;
}

const AR_DAYS = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];  // Sunday first, like Date.getDay()

// Today's tasks from the notes' weekly plan.
export function todaysPlan(data, date = new Date()) {
  const notes = notesOf(data);
  const days = notes && notes.all && notes.all.plan && notes.all.plan.days;
  if (!days) return null;
  const today = days.find((d) => d.day === AR_DAYS[date.getDay()]);
  return { tasks: today ? today.tasks : [], rules: notes.all.plan.rules || [] };
}
