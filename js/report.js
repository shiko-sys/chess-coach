// The number sections of the old report (Phases 1-6), moved into the app with the same computations and wording.
// Made once from chess_coach/report_template.html; from now on this file is the one to change. Review and Progress
// make the sections' frames (MARKUP below), choose the time class, then call the render functions.
//
//   const R = createReport(data, { go, goToFact, pieceUrl });
//   R.setScope("blitz"); R.renderAccuracy(data.scopes.blitz);

export function createReport(DATA, hooks) {

  // ---------------------------------------------------------------- basics
  const SMALL = DATA.settings.small_sample;
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const PARTS = [["win", "Wins"], ["draw", "Draws"], ["loss", "Losses"]];
  const SCOPES = ["all", ...DATA.time_classes];
  const NUMBER = new Intl.NumberFormat("en-US");

  const n = (x) => NUMBER.format(x);
  const pct = (x, digits = 0) => (x == null || !isFinite(x) ? "–" : (x * 100).toFixed(digits) + "%");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const $ = (selector) => document.querySelector(selector);
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const winRate = (r) => (r.games ? r.win / r.games : null);
  const scoreOf = (r) => (r.games ? (r.win + r.draw / 2) / r.games : null);
  const tz = DATA.settings.timezone.replace("_", " ");
  const two = (h) => String(h).padStart(2, "0");

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;  // textContent, never innerHTML: names are data
    return node;
  }

  function fmtDate(iso, options = { month: "short", day: "numeric", year: "numeric" }) {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
  }

  // Deep-merge plain objects (used to combine chart options).
  function merge(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === "object" && !Array.isArray(value)) target[key] = merge(target[key] || {}, value);
      else target[key] = value;
    }
    return target;
  }

  // ---------------------------------------------------------------- the app decides the section and the time class
  const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let scope = "all", page = "", sub = "";
  const go = (next) => hooks.go(next);
  const setScope = (next) => hooks.go({ scope: next });

  // ---------------------------------------------------------------- tooltip
  const tip = $("#tip");

  function showTip(x, y, content) {
    tip.replaceChildren();
    if (content.title) tip.append(el("div", "tt", content.title));
    for (const row of content.rows || []) {
      const line = el("div", "tr");
      const key = el("span", "tk");
      if (row.color) key.style.background = row.color; else key.style.visibility = "hidden";
      line.append(key, el("span", "tv", row.value));
      if (row.label) line.append(el("span", "tl", row.label));
      tip.append(line);
    }
    if (content.note) tip.append(el("div", "tn", content.note));
    tip.style.display = "block";
    const gap = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + gap, top = y + gap;
    if (left + w > window.innerWidth - 8) left = x - w - gap;
    if (top + h > window.innerHeight - 8) top = y - h - gap;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }

  function hideTip() { tip.style.display = "none"; }

  function hoverTip(node, contentFn) {
    node.addEventListener("pointermove", (e) => showTip(e.clientX, e.clientY, contentFn()));
    node.addEventListener("pointerleave", hideTip);
  }

  function wdlTip(title, r) {
    return {
      title,
      rows: PARTS.map(([key, name]) => ({ color: `var(--${key})`, value: `${n(r[key])} (${pct(r[key] / r.games)})`, label: name })),
      note: `${n(r.games)} games · score ${pct(scoreOf(r))}`,
    };
  }

  // ---------------------------------------------------------------- small building blocks
  function legend(items, kind) {
    const box = el("div", "legend");
    for (const [color, label] of items) {
      const item = el("span", "li");
      const key = el("i", kind);
      key.style.background = color;
      item.append(key, document.createTextNode(label));
      box.append(item);
    }
    return box;
  }

  // rows: arrays of cells, or { cells, tip } to show a tooltip when hovering the row.
  // A cell is text, a DOM node, or { text, cls }.
  function table(headers, rows) {
    const t = el("table");
    const headRow = el("tr");
    for (const h of headers) {
      const th = el("th", h.num ? "num" : null, h.text);
      if (h.width) th.style.width = h.width;
      headRow.append(th);
    }
    const thead = el("thead");
    thead.append(headRow);
    const tbody = el("tbody");
    for (const row of rows) {
      const cells = Array.isArray(row) ? row : row.cells;
      const tr = el("tr");
      cells.forEach((cell, i) => {
        const td = el("td", headers[i].num ? "num" : null);
        if (cell instanceof Node) td.append(cell);
        else if (cell && typeof cell === "object") { td.textContent = cell.text; if (cell.cls) td.classList.add(cell.cls); }
        else td.textContent = cell;
        tr.append(td);
      });
      if (row.tip) { tr.classList.add("hoverable"); hoverTip(tr, row.tip); }
      tbody.append(tr);
    }
    t.append(thead, tbody);
    return t;
  }

  function scrollBox(node) {
    const box = el("div", "scroll");
    box.append(node);
    return box;
  }

  // A percentage cell that turns lighter when it rests on few games.
  function pctCell(r, value = winRate(r)) {
    return { text: pct(value), cls: r.games < SMALL ? "small" : null };
  }

  // Thin win/draw/loss bar for table rows (no text: the row has the numbers).
  function thinBar(r) {
    const bar = el("div", "thin");
    for (const [key] of PARTS) {
      if (!r[key]) continue;  // a part at zero draws nothing
      const segment = el("span");
      segment.style.flexGrow = r[key];
      segment.style.background = `var(--${key})`;
      bar.append(segment);
    }
    return bar;
  }

  // Tall win/draw/loss bar with the share printed inside each block (when it fits).
  function tallBar(r) {
    const bar = el("div", "tall");
    for (const [key, name] of PARTS) {
      if (!r[key]) continue;
      const block = el("div", "block");
      block.style.flexGrow = r[key];
      block.style.background = `var(--${key})`;
      block.style.color = key === "draw" ? "#0b0b0b" : "#ffffff";
      block.dataset.label = pct(r[key] / r.games);
      hoverTip(block, () => ({ title: name, rows: [{ color: `var(--${key})`, value: pct(r[key] / r.games, 1), label: `${n(r[key])} games` }] }));
      bar.append(block);
    }
    return bar;
  }

  const measure = document.createElement("canvas").getContext("2d");
  function fitTallLabels() {
    measure.font = `600 13px ${FONT}`;
    document.querySelectorAll(".tall .block").forEach((block) => {
      const text = block.dataset.label;
      block.textContent = measure.measureText(text).width + 16 <= block.clientWidth ? text : "";
    });
  }

  // Horizontal bars, one per row: name, bar, figure. Bar length = value / max.
  function rankedList(items, color, max) {
    const box = el("div", "ranked");
    for (const item of items) {
      const row = el("div", item.small ? "row small" : "row");
      const track = el("div", "track");
      const fill = el("div", "fill");
      fill.style.width = (max ? (item.value / max) * 100 : 0) + "%";
      fill.style.background = color;
      track.append(fill);
      const fig = el("div", "fig", item.figure);
      if (item.sub) fig.append(el("small", null, " " + item.sub));
      row.append(el("div", "name", item.name), track, fig);
      if (item.tip) hoverTip(row, item.tip);
      box.append(row);
    }
    return box;
  }

  function deltaCell(points, small) {
    const box = el("span", small ? "delta small" : "delta");
    const up = points >= 0;
    const arrow = el("span", up ? "arrow up" : "arrow down", up ? "▲" : "▼");
    arrow.setAttribute("aria-hidden", "true");
    box.append(arrow, document.createTextNode(` ${up ? "+" : "−"}${Math.abs(points).toFixed(1)} pts`));
    return box;
  }

  function kpi(label, value, extra) {
    const box = el("div", "kpi");
    box.append(el("div", "label", label), el("div", "value", value));
    if (extra) box.append(el("div", "extra", extra));
    return box;
  }

  // ---------------------------------------------------------------- charts (Chart.js)
  let charts = [];

  const BAR_STYLE = { borderRadius: 4, borderSkipped: "start", maxBarThickness: 24, categoryPercentage: 0.86, barPercentage: 0.9 };

  // Draws a 1px line across the chart at a given value (the "your average" line).
  const baselinePlugin = {
    id: "baseline",
    afterDatasetsDraw(chart, args, opts) {
      if (!opts || opts.value == null) return;
      const y = Math.round(chart.scales.y.getPixelForValue(opts.value)) + 0.5;
      const { left, right } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = cssVar("--text-2");
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.restore();
    },
  };

  // Vertical hairline that follows the hovered date on line charts.
  const crosshairPlugin = {
    id: "crosshair",
    afterDatasetsDraw(chart) {
      const active = chart.tooltip ? chart.tooltip.getActiveElements() : [];
      if (!active.length) return;
      const x = Math.round(active[0].element.x) + 0.5;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = cssVar("--muted");
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.restore();
    },
  };

  // End dot + "Bullet 1,111" label at the last point of each line (skipped if labels would collide).
  const endLabelPlugin = {
    id: "endLabels",
    afterDatasetsDraw(chart, args, opts) {
      if (!opts || !opts.enabled) return;
      const ends = [];
      chart.data.datasets.forEach((dataset, i) => {
        const points = chart.getDatasetMeta(i).data;
        for (let j = dataset.data.length - 1; j >= 0; j--) {
          if (dataset.data[j].y != null) {
            ends.push({ x: points[j].x, y: points[j].y, color: dataset.borderColor, text: `${dataset.label} ${n(dataset.data[j].y)}` });
            break;
          }
        }
      });
      const ctx = chart.ctx;
      ctx.save();
      for (const end of ends) {
        ctx.beginPath();
        ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = end.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = cssVar("--surface");
        ctx.stroke();
      }
      const ys = ends.map((e) => e.y).sort((a, b) => a - b);
      if (!ys.some((y, i) => i > 0 && y - ys[i - 1] < 15)) {
        ctx.font = `12px ${FONT}`;
        ctx.fillStyle = cssVar("--text-2");
        ctx.textBaseline = "middle";
        for (const end of ends) ctx.fillText(end.text, end.x + 9, end.y);
      }
      ctx.restore();
    },
  };

  // Chart.js calls this on hover; we show our own HTML tooltip instead of its canvas one.
  function externalTip(contentFn) {
    return ({ chart, tooltip }) => {
      if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) { hideTip(); return; }
      const content = contentFn(tooltip.dataPoints[0].dataIndex, tooltip.dataPoints);
      if (!content) { hideTip(); return; }
      const box = chart.canvas.getBoundingClientRect();
      showTip(box.left + tooltip.caretX, box.top + tooltip.caretY, content);
    };
  }

  function baseOptions(contentFn) {
    const ticks = { color: cssVar("--muted"), font: { family: FONT, size: 11 } };
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: REDUCED_MOTION ? false : { duration: 750, easing: "easeOutQuart" },  // charts draw themselves in
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTip(contentFn) } },
      scales: {
        x: { grid: { display: false }, border: { color: cssVar("--axis") }, ticks: { ...ticks, maxRotation: 0, autoSkipPadding: 8 } },
        y: { grid: { color: cssVar("--grid") }, border: { display: false }, ticks: { ...ticks } },
      },
    };
  }

  function makeChart(selector, label, config) {
    const box = $(selector);
    box.replaceChildren();
    if (!window.Chart) {
      box.append(el("p", "empty", "Charts need the file chart.umd.min.js next to this page (run.bat puts it there). The tables work without it."));
      return;
    }
    const canvas = el("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
    box.append(canvas);
    charts.push(new Chart(canvas, config));
  }

  // ---------------------------------------------------------------- engine-analysis helpers
  const SMALL_MOVES = DATA.settings.small_sample_moves;
  const fmt1 = (x) => (x == null || !isFinite(x) ? "–" : x.toFixed(1));
  const fmt0 = (x) => (x == null || !isFinite(x) ? "–" : n(Math.round(x)));
  const per100 = (count, moves) => (moves ? (count / moves) * 100 : null);
  const shortDay = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const weekName = (iso) => `Week of ${fmtDate(iso)}`;
  const MIN_CHART_GAMES = 10;  // groups with fewer games are too noisy to chart (they stay in the tables)

  // A y-axis range with round, evenly spaced ticks (e.g. 60, 65, 70) that covers lo..hi and stays inside floor..ceil.
  function niceRange(lo, hi, floor = -Infinity, ceil = Infinity) {
    const raw = Math.max(hi - lo, 1) / 5;
    const step = [1, 2, 5, 10, 20, 25, 50].find((s) => s >= raw) || 100;
    return { min: Math.max(floor, Math.floor(lo / step) * step), max: Math.min(ceil, Math.ceil(hi / step) * step), step };
  }

  // Engine sections show their body, or a hint when none of this scope's games is analyzed yet.
  function engineGate(bodySelector, E) {
    const body = $(bodySelector);
    const hint = body.previousElementSibling;  // the <p class="empty"> right before the body
    body.hidden = !E;
    hint.hidden = Boolean(E);
    if (!E) {
      hint.textContent = DATA.engine
        ? "None of these games is analyzed yet: the update works from your newest games to your oldest."
        : "No engine analysis yet. Press Update now (Today, or Settings > Updates & data): Stockfish checks every move in the background.";
    }
    return Boolean(E);
  }

  function openNote() {
    const [lo, hi] = DATA.settings.open_win_chance;
    return `Only moves made while the game was still open count here: your winning chances were between ${lo}% and ${hi}% ` +
      "before the move. Once a game is decided, the formula can't call any move a blunder, so those late moves would make " +
      "endgames and time trouble look safer than they really are.";
  }

  // A tall bar split into parts (like the results bar), with each part's share printed inside when it fits.
  function segmentBar(parts, total) {
    const bar = el("div", "tall");
    for (const part of parts) {
      if (!part.value) continue;
      const block = el("div", "block");
      block.style.flexGrow = part.value;
      block.style.background = part.color;
      block.style.color = part.ink;
      block.dataset.label = pct(part.value / total);
      hoverTip(block, () => ({ title: part.label, rows: [{ color: part.color, value: pct(part.value / total, 1), label: `${n(part.value)} games` }] }));
      bar.append(block);
    }
    return bar;
  }

  // Bars that start at the average and go up (blue) or down (red) to each group's value.
  // counts[i] = games behind values[i]: under MIN_CHART_GAMES the bar is left out, under SMALL it is faded.
  function vsAverageChart(selector, ariaLabel, labels, rawValues, avg, counts, tipFn, unit) {
    const values = rawValues.map((v, i) => (counts[i] >= MIN_CHART_GAMES ? v : null));
    const small = counts.map((c) => c < SMALL);
    const present = values.filter((v) => v != null);
    if (!present.length) {
      $(selector).replaceChildren(el("p", "empty", "Not enough games here to chart."));
      return;
    }
    const lo = Math.min(avg, ...present), hi = Math.max(avg, ...present);
    const pad = Math.max(1, (hi - lo) * 0.1);
    const range = niceRange(lo - pad, hi + pad, 0, 100);
    const colorOf = (i) => (values[i] >= avg ? cssVar("--win") : cssVar("--loss"));
    makeChart(selector, ariaLabel, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: values.map((v) => (v == null ? null : [avg, v])),
          backgroundColor: values.map((v, i) => (v == null ? "transparent" : colorOf(i) + (small[i] ? "59" : ""))),
          ...BAR_STYLE,
        }],
      },
      options: merge(baseOptions((i) => (values[i] == null ? null : tipFn(i, colorOf(i)))), {
        scales: { y: { min: range.min, max: range.max, ticks: { stepSize: range.step, callback: (v) => v + unit } } },
        plugins: { baseline: { value: avg } },
      }),
      plugins: [baselinePlugin],
    });
  }



  // Line icons (24 x 24, drawn with the text color): each one is a list of SVG shapes.
  const ICONS = {
    grid: [["rect", { x: 3.5, y: 3.5, width: 7, height: 7, rx: 1.8 }], ["rect", { x: 13.5, y: 3.5, width: 7, height: 7, rx: 1.8 }],
      ["rect", { x: 3.5, y: 13.5, width: 7, height: 7, rx: 1.8 }], ["rect", { x: 13.5, y: 13.5, width: 7, height: 7, rx: 1.8 }]],
    chat: [["path", { d: "M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" }],
      ["path", { d: "M8.5 8.5h7M8.5 11.5h4.5" }]],
    target: [["circle", { cx: 12, cy: 12, r: 8.5 }], ["circle", { cx: 12, cy: 12, r: 4.5 }], ["circle", { cx: 12, cy: 12, r: 0.8 }]],
    spark: [["path", { d: "M12 3.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5-6.5-2 6.5-2z" }], ["path", { d: "M18.5 3.5v3M17 5h3" }]],
    book: [["path", { d: "M12 6.5C10.5 5 8.5 4.5 4.5 4.5v13c4 0 6 .5 7.5 2 1.5-1.5 3.5-2 7.5-2v-13c-4 0-6 .5-7.5 2z" }],
      ["path", { d: "M12 6.5v13" }]],
    flag: [["path", { d: "M5.5 20.5v-17" }], ["path", { d: "M5.5 4h11.5l-2.5 4 2.5 4H5.5" }]],
    clock: [["circle", { cx: 12, cy: 12, r: 8.5 }], ["path", { d: "M12 7.5V12l3 2" }]],
    arrow: [["path", { d: "M5 12h13M13 6.5l5.5 5.5-5.5 5.5" }]],
    puzzle: [["path", { d: "M9.5 4.5a2.5 2.5 0 0 1 5 0V6h4.5v4.5h-1.5a2.5 2.5 0 0 0 0 5H19V20h-4.5v-1.5a2.5 2.5 0 0 0-5 0V20H5v-4.5h1.5a2.5 2.5 0 0 0 0-5H5V6h4.5z" }]],
  };

  function icon(name, className) {
    const svg = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
    if (className) svg.setAttribute("class", className);
    for (const [tag, attrs] of ICONS[name]) svg.append(svgEl(tag, attrs));
    return svg;
  }


  // The highlight behind the open tab slides to it; on a narrow screen the open tab also scrolls into view.
  let pillPlaced = false;


  // A rating card's "best": the highest rating after chess.com's starting rating settled (your first games swing a lot,
  // see the coach's notes), like facts.rating_best in Python.
  function ratingBest(tc) {
    const story = (DATA.ratings.story || {})[tc];
    return story && story.settled_peak != null
      ? `best after the start ${n(story.settled_peak)}` : `best ${n(DATA.ratings.peak[tc])} (still settling)`;
  }

  function renderOverview(S) {
    const s = S.summary;
    const kpis = $("#kpis");
    kpis.replaceChildren(
      kpi("Games", n(s.games), `${n(s.rated)} rated`),
      kpi("Win rate", pct(winRate(s), 1), `${n(s.win)} W · ${n(s.draw)} D · ${n(s.loss)} L`),
    );
    for (const tc of scope === "all" ? DATA.time_classes : [scope]) {
      const current = DATA.ratings.current[tc];
      if (current != null) kpis.append(kpi(`${cap(tc)} rating`, n(current), ratingBest(tc)));
    }

    $("#wdl-bar").replaceChildren(tallBar(s), legend(PARTS.map(([key, name]) => [`var(--${key})`, name]), "box"));
    requestAnimationFrame(fitTallLabels);

    const headers = (first) => [
      { text: first }, { text: "Games", num: true }, { text: "Wins", num: true }, { text: "Draws", num: true },
      { text: "Losses", num: true }, { text: "Win %", num: true }, { text: "", width: "28%" },
    ];
    const rows = (list) => list.map((r) => ({
      cells: [cap(r.label), n(r.games), n(r.win), n(r.draw), n(r.loss), pctCell(r), thinBar(r)],
      tip: () => wdlTip(cap(r.label), r),
    }));
    $("#by-color").replaceChildren(el("h3", null, "By color"), scrollBox(table(headers("Color"), rows(S.by_color))));
    if (scope === "all") {
      $("#by-tc").replaceChildren(el("h3", null, "By time class"), scrollBox(table(headers("Time class"), rows(S.by_time_class))));
    } else {
      $("#by-tc").replaceChildren();
    }
  }


  const firstSentence = (text, max = 120) => {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    const end = s.search(/[.!؟?]\s/);
    const cut = end > 0 && end < max ? s.slice(0, end + 1) : s.slice(0, max);
    return cut.length < s.length && !/[.!؟?]$/.test(cut) ? cut.replace(/\s+\S*$/, "") + "…" : cut;
  };


  function renderOpenings(S) {
    const min = DATA.settings.min_opening_games;
    $("#openings-sub").textContent =
      `Your most played openings, grouped by opening family. Only openings with ${min}+ games. Score counts a draw as half a win.`;
    const build = (list) => {
      if (!list.length) return el("p", "empty", `No opening has ${min}+ games here yet.`);
      const headers = [{ text: "Opening" }, { text: "Games", num: true }, { text: "Win %", num: true }, { text: "Score", num: true }, { text: "", width: "26%" }];
      return scrollBox(table(headers, list.map((r) => ({
        cells: [r.label, n(r.games), pctCell(r), pctCell(r, scoreOf(r)), thinBar(r)],
        tip: () => wdlTip(r.label, r),
      }))));
    };
    for (const color of ["white", "black"]) {
      $(`#op-${color}`).replaceChildren(el("h3", null, `As ${cap(color)}`), build(S.openings[color]));
      $(`#var-${color}`).replaceChildren(el("h3", null, `As ${cap(color)}`), build(S.variations[color]));
    }
  }

  // Where your results drop (Phase 6, step 3): for each main opening, the move of the first moves after which your
  // score falls the most (openings.py), with Stockfish's eval before and after it. The verdicts use the same words as
  // the coach's facts (facts.DROP_VERDICTS).
  const DROP_SET = Object.assign({ min_games: 150, plies: 20, min_after: 25, prior: 20, luck: 50, eval_drop: 5 },
    DATA.settings.opening_drops || {});
  const DROP_VERDICTS = {
    worse: { true: "a bad move: Stockfish's eval drops too", false: "your position gets worse after it: Stockfish's eval drops too" },
    fine: { true: "the move is fine: the problem is what comes after", false: "the move is fine: the problem is what comes after" },
    better: { true: "Stockfish even likes your position more after it: the problem is what comes after",
      false: "Stockfish even likes your position more after it: the problem is what comes after" },
  };

  function renderDrops(S) {
    const d = DROP_SET;
    $("#drops-sub").textContent = `For each opening you played ${n(d.min_games)}+ times (by family and color): the move in ` +
      `your first ${d.plies / 2} moves after which your score falls the most. A move needs ${d.min_after}+ games after it, ` +
      `and the ranking counts it as if ${d.prior} more games had scored like the position before it, so a short streak ` +
      `doesn't win. Stockfish's eval before and after the move says whether the move itself is bad: only when your ` +
      `winning chances fall by ${d.eval_drop}+ points.`;
    const drops = S.opening_drops || [];
    $("#drops").replaceChildren(...(drops.length ? drops.map(dropCard)
      : [el("p", "empty", `No opening has ${n(d.min_games)}+ games here yet.`)]));
    $("#drops-note").textContent = "Arrows: red = your move after which your score drops, gray = what you usually play " +
      `there, blue = Stockfish's move. A drop resting on fewer than ${d.luck} games might be luck.`;
  }

  function dropCard(x) {
    const card = el("article", "hl");
    card.dataset.facts = `${scope}.opening_drop.${x.color}.${slugOf(x.family)}`;
    const usual = x.usual && x.usual.uci !== x.uci ? x.usual : null;  // my own move can be my usual move too
    const arrows = x.mine ? [[x.uci, "played", true], [usual && usual.uci, "usual", false]] : [[usual && usual.uci, "usual", true]];
    arrows.push([x.best && x.best.uci, "best", false]);
    const marks = { squares: x.last ? [[x.last.slice(0, 2), "last"], [x.last.slice(2, 4), "last"]] : [], dots: [] };
    card.append(boardSvg({ board: x.board, color: x.color, move: x.mine ? x.move : `your move after ${x.move}` }, arrows, marks));
    const body = el("div", "body");
    const title = el("div", "title");
    const tag = el("span", "badge");
    const dot = el("i");
    dot.style.background = x.verdict === "worse" ? "var(--critical)" : "var(--great)";
    tag.append(dot, document.createTextNode(`${x.family} · as ${cap(x.color)}`));
    title.append(tag);
    if (x.luck) {
      const luck = el("span", "badge");
      const grey = el("i");
      grey.style.background = "var(--text-2)";
      luck.append(grey, document.createTextNode("might be luck"));
      title.append(luck);
    }
    const cut = x.moves.lastIndexOf(" ") + 1;  // the moves there, the one that drops in bold
    const moves = el("div", "line", x.moves.slice(0, cut));
    moves.append(el("b", null, x.moves.slice(cut)));
    body.append(title, moves);
    const whose = x.mine ? "your" : "your opponent's";
    body.append(el("div", "line", `Your score: ${pct(x.before.score)} in this position (${n(x.before.games)} games), ` +
      `${pct(x.after.score)} after ${whose} ${x.move} (${n(x.after.games)} games).`));
    body.append(el("div", "line", x.eval
      ? `Stockfish: your winning chances ${pct(x.eval.before / 100)} → ${pct(x.eval.after / 100)}, so ${DROP_VERDICTS[x.verdict][x.mine]}.`
      : "No Stockfish eval for this position yet."));
    if (x.mine && x.usual && x.usual.uci === x.uci) {
      body.append(el("div", "line", `It is your usual move here too.`));
    } else if (x.usual) {
      body.append(el("div", "line", `${x.mine ? "Your usual move here" : "What you usually play next"}: ${x.usual.san} ` +
        `(${n(x.usual.games)} games, ${pct(x.usual.score)}).`));
    }
    if (x.best) body.append(el("div", "line", `Stockfish's move here: ${x.best.san}.`));
    const link = (game, text) => {
      const a = el("a", null, text);
      a.href = game.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      return a;
    };
    if (x.losses.length) {
      const losses = el("div", "meta");
      losses.append(document.createTextNode("Your newest losses from here: "));
      x.losses.forEach((g, i) => {
        if (i) losses.append(document.createTextNode(" · "));
        losses.append(link(g, `${fmtDate(g.date, { month: "short", day: "numeric" })} vs ${g.opponent} ↗`));
      });
      body.append(losses);
    }
    const latest = el("div");
    latest.append(link(x.latest, `Your latest game here (${fmtDate(x.latest.date, { month: "short", day: "numeric" })}) ↗`));
    body.append(latest);
    card.append(body);
    return card;
  }

  const END_LABELS = {
    win: { timeout: "Opponent ran out of time", resignation: "Opponent resigned", checkmate: "You checkmated them", abandonment: "Opponent abandoned" },
    loss: { timeout: "You ran out of time", resignation: "You resigned", checkmate: "You got checkmated", abandonment: "You abandoned the game" },
    draw: {
      "timeout vs insufficient material": "Flag fell, no mating material", repetition: "Repetition", stalemate: "Stalemate",
      "insufficient material": "Insufficient material", agreement: "Agreed", "50-move rule": "50-move rule",
    },
  };

  function renderEndings(S) {
    const box = $("#endings");
    box.replaceChildren();
    const groups = [["win", "How you win", "wins"], ["loss", "How you lose", "losses"], ["draw", "How draws happen", "draws"]];
    for (const [key, title, noun] of groups) {
      const items = S.endings[key];
      const total = items.reduce((sum, item) => sum + item.count, 0);
      const column = el("div");
      column.append(el("h3", null, `${title} · ${n(total)}`));
      if (!items.length) {
        column.append(el("p", "empty", `No ${noun} yet.`));
      } else {
        const max = Math.max(...items.map((item) => item.count));
        column.append(rankedList(items.map((item) => {
          const name = END_LABELS[key][item.reason] || cap(item.reason);
          return {
            name, value: item.count, figure: pct(item.count / total), sub: n(item.count),
            tip: () => ({ title: name, rows: [{ color: `var(--${key})`, value: `${n(item.count)} games`, label: `${pct(item.count / total, 1)} of ${noun}` }] }),
          };
        }), `var(--${key})`, max));
      }
      box.append(column);
    }
  }

  function renderRatingDiff(S) {
    const headers = [
      { text: "Opponent vs you" }, { text: "Games", num: true }, { text: "Win %", num: true }, { text: "Score", num: true },
      { text: "Expected", num: true }, { text: "Difference", num: true }, { text: "", width: "22%" },
    ];
    const rows = S.rating_diff.filter((r) => r.games).map((r) => {
      const actual = scoreOf(r);
      return {
        cells: [r.label, n(r.games), pctCell(r), pctCell(r, actual), pct(r.expected), deltaCell((actual - r.expected) * 100, r.games < SMALL), thinBar(r)],
        tip: () => ({ ...wdlTip(r.label, r), note: `${n(r.games)} games · score ${pct(actual, 1)} vs expected ${pct(r.expected, 1)}` }),
      };
    });
    $("#rating-diff").replaceChildren(table(headers, rows));
  }

  function renderHours(S) {
    const rows = S.hours;
    const avg = winRate(S.summary) * 100;
    const labels = rows.map((r) => two(r.hour));
    const hourName = (h) => `${two(h)}:00–${two(h)}:59`;
    $("#hours-sub").textContent =
      `By the hour each game started (${tz} time). In the second chart, bars go up when you won more often than your ` +
      `${avg.toFixed(1)}% average in that hour, and down when you won less often.`;

    makeChart("#hours-games", "Games played per hour. The numbers are in the table below.", {
      type: "bar",
      data: { labels, datasets: [{ data: rows.map((r) => r.games), backgroundColor: cssVar("--volume"), ...BAR_STYLE }] },
      options: merge(baseOptions((i) => ({
        title: hourName(rows[i].hour),
        rows: [{ color: cssVar("--volume"), value: n(rows[i].games), label: "games" }, { value: pct(winRate(rows[i]), 1), label: "win rate" }],
      })), { scales: { y: { beginAtZero: true, ticks: { precision: 0, callback: (v) => n(v) } } } }),
    });

    const values = rows.map((r) => (r.games ? winRate(r) * 100 : null));
    const present = values.filter((v) => v != null);
    const lo = Math.min(avg, ...present), hi = Math.max(avg, ...present);
    const pad = Math.max(2, (hi - lo) * 0.1);
    const colorOf = (i) => (values[i] >= avg ? cssVar("--win") : cssVar("--loss"));
    makeChart("#hours-win", "Win rate by hour compared with your average. The numbers are in the table below.", {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: values.map((v) => (v == null ? null : [avg, v])),  // floating bars: from the average to the hour's win rate
          backgroundColor: rows.map((r, i) => (values[i] == null ? "transparent" : colorOf(i) + (r.games < SMALL ? "59" : ""))),
          ...BAR_STYLE,
        }],
      },
      options: merge(baseOptions((i) => {
        const r = rows[i];
        if (!r.games) return null;
        const diff = values[i] - avg;
        return {
          title: hourName(r.hour),
          rows: [
            { color: colorOf(i), value: pct(winRate(r), 1), label: "win rate" },
            { value: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts`, label: "vs your average" },
            { value: n(r.games), label: "games" },
          ],
          note: r.games < SMALL ? "Few games: treat with care" : null,
        };
      }), {
        scales: { y: { min: Math.floor(lo - pad), max: Math.ceil(hi + pad), ticks: { callback: (v) => v + "%" } } },
        plugins: { baseline: { value: avg } },
      }),
      plugins: [baselinePlugin],
    });

    const headers = [{ text: "Hour" }, { text: "Games", num: true }, { text: "Wins", num: true }, { text: "Draws", num: true }, { text: "Losses", num: true }, { text: "Win %", num: true }];
    $("#hours-table").replaceChildren(table(headers, rows.filter((r) => r.games).map((r) => [hourName(r.hour), n(r.games), n(r.win), n(r.draw), n(r.loss), pctCell(r)])));
  }

  function renderTilt(S) {
    const T = S.tilt;
    const names = {
      "0": "Fresh: no loss right before",
      "1": "After 1 loss in a row",
      "2": "After 2 losses in a row",
      "3+": "After 3+ losses in a row",
    };
    const box = $("#tilt");
    box.replaceChildren();
    const more = ["#tilt-after", "#tilt-number-win", "#tilt-number-acc", "#tilt-number-table"];
    if (!T.sessions) {
      box.append(el("p", "empty", "No live games here."));
      $("#tilt-note").textContent = $("#tilt-more-note").textContent = "";
      more.forEach((selector) => $(selector).replaceChildren());
      return;
    }
    const accuracyText = (r) => (r.accuracy == null ? "" : ` · accuracy ${fmt1(r.accuracy)}`);
    box.append(...rankedList(T.buckets.map((b) => ({
      name: names[b.label],
      value: winRate(b) || 0,
      figure: pct(winRate(b), 1),
      sub: `${n(b.games)} games${accuracyText(b)}`,
      small: b.games < SMALL,
      tip: () => ({ ...wdlTip(names[b.label], b), note: `${n(b.games)} games${accuracyText(b)}` }),
    })), "var(--win)", 1).children);
    $("#tilt-note").textContent =
      `Bars show win rate on a 0–100% scale. ${n(T.sessions)} sessions, ${T.avg_games.toFixed(1)} games each on average, ` +
      `longest ${n(T.max_games)} games. A break of ${DATA.settings.session_gap_minutes}+ minutes between games starts a new session; ` +
      `a win or a draw resets the streak. Daily games are left out.`;

    // The game right after a win / draw / loss, compared with the first game of a session.
    const afterNames = { first: "First game of a session", win: "Right after a win", draw: "Right after a draw", loss: "Right after a loss" };
    const afterHeaders = [
      { text: "Game" }, { text: "Games", num: true }, { text: "Win %", num: true }, { text: "Accuracy", num: true },
      { text: "Seconds per move", num: true }, { text: "", width: "22%" },
    ];
    $("#tilt-after").replaceChildren(table(afterHeaders, T.after.filter((r) => r.games).map((r) => ({
      cells: [afterNames[r.label], n(r.games), pctCell(r), { text: fmt1(r.accuracy), cls: r.analyzed < SMALL ? "small" : null },
        r.seconds_per_move == null ? "–" : `${r.seconds_per_move.toFixed(2)} s`, thinBar(r)],
      tip: () => wdlTip(afterNames[r.label], r),
    }))));

    // Win rate and accuracy by game number in the session, as bars from the average.
    const rows = T.by_number;
    const labels = rows.map((r) => r.label);
    const total = rows.reduce((t, r) => ({ games: t.games + r.games, win: t.win + r.win }), { games: 0, win: 0 });
    const winValues = rows.map((r) => (r.games ? winRate(r) * 100 : null));
    const avgWin = winRate(total) * 100;
    const gameName = (i) => `Game ${labels[i]} of a session`;
    vsAverageChart("#tilt-number-win", "Win rate by game number in the session. The numbers are in the table below.",
      labels, winValues, avgWin, rows.map((r) => r.games), (i, color) => ({
        title: gameName(i),
        rows: [
          { color, value: pct(winRate(rows[i]), 1), label: "win rate" },
          { value: `${winValues[i] >= avgWin ? "+" : "−"}${Math.abs(winValues[i] - avgWin).toFixed(1)} pts`, label: "vs your average" },
          { value: n(rows[i].games), label: "games" },
        ],
        note: rows[i].games < SMALL ? "Few games: treat with care" : null,
      }), "%");
    const analyzed = rows.reduce((t, r) => t + r.analyzed, 0);
    const accValues = rows.map((r) => (r.analyzed ? r.accuracy : null));
    const avgAcc = analyzed ? rows.reduce((t, r) => t + (r.analyzed ? r.accuracy * r.analyzed : 0), 0) / analyzed : null;
    if (avgAcc == null) {
      $("#tilt-number-acc").replaceChildren(el("p", "empty", "Needs engine analysis: double-click analyze.bat."));
    } else {
      vsAverageChart("#tilt-number-acc", "Accuracy by game number in the session. The numbers are in the table below.",
        labels, accValues, avgAcc, rows.map((r) => r.analyzed), (i, color) => ({
          title: gameName(i),
          rows: [
            { color, value: fmt1(accValues[i]), label: "accuracy" },
            { value: `${accValues[i] >= avgAcc ? "+" : "−"}${Math.abs(accValues[i] - avgAcc).toFixed(1)}`, label: "vs your average" },
            { value: n(rows[i].analyzed), label: "analyzed games" },
          ],
          note: rows[i].analyzed < SMALL ? "Few games: treat with care" : null,
        }), "");
    }
    const numberHeaders = [{ text: "Game in the session" }, { text: "Games", num: true }, { text: "Win %", num: true }, { text: "Accuracy", num: true }];
    $("#tilt-number-table").replaceChildren(table(numberHeaders, rows.filter((r) => r.games).map((r) => [
      r.label, n(r.games), pctCell(r), { text: fmt1(r.accuracy), cls: r.analyzed < SMALL ? "small" : null },
    ])));
    $("#tilt-more-note").textContent =
      `The baseline in both charts is your average${avgAcc == null ? "" : ` (win rate ${avgWin.toFixed(1)}%, accuracy ${avgAcc.toFixed(1)})`}. ` +
      `Faded bars and lighter numbers: fewer than ${SMALL} games; game numbers with fewer than ${MIN_CHART_GAMES} games are only in the table. ` +
      "Accuracy only counts analyzed games. Seconds per move = the time " +
      "you used divided by your moves, from the clock. In \"All games\" it mixes time controls, so compare it inside Bullet, Blitz or Rapid.";
  }

  function renderRatings() {
    const R = DATA.ratings;
    const shown = (scope === "all" ? DATA.time_classes : [scope]).filter((tc) => R.current[tc] != null);
    const legendBox = $("#rating-legend");
    legendBox.replaceChildren();
    if (!shown.length) {
      $("#rating-chart").replaceChildren(el("p", "empty", "No rated games here."));
      $("#rating-table").replaceChildren();
      return;
    }
    if (shown.length > 1) legendBox.append(legend(shown.map((tc) => [cssVar(`--tc-${tc}`), cap(tc)]), "line"));

    const xs = R.days.map((day) => Date.parse(day + "T00:00:00Z"));
    const first = xs.findIndex((_, i) => shown.some((tc) => R.series[tc][i] != null));
    const index = xs.map((_, i) => i).slice(first);
    const datasets = shown.map((tc) => ({
      label: cap(tc),
      data: index.map((i) => ({ x: xs[i], y: R.series[tc][i] })),
      borderColor: cssVar(`--tc-${tc}`),
      backgroundColor: cssVar(`--tc-${tc}`),
      borderWidth: 2,
      borderJoinStyle: "round",
      borderCapStyle: "round",
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: cssVar("--surface"),
      tension: 0,
    }));
    const shortDate = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    makeChart("#rating-chart", "Rating over time. Month-end values are in the table below.", {
      type: "line",
      data: { datasets },
      options: merge(baseOptions((i, points) => ({
        title: fmtDate(new Date(points[0].raw.x).toISOString().slice(0, 10)),
        rows: points.filter((p) => p.raw.y != null).map((p) => ({ color: p.dataset.borderColor, value: n(p.raw.y), label: p.dataset.label })),
      })), {
        layout: { padding: { top: 8, right: 100 } },
        scales: {
          x: { type: "linear", min: xs[index[0]], max: xs[index[index.length - 1]], ticks: { maxTicksLimit: 8, callback: (v) => shortDate(v) } },
          y: { ticks: { callback: (v) => n(v) } },
        },
        plugins: { endLabels: { enabled: true } },
      }),
      plugins: [crosshairPlugin, endLabelPlugin],
    });

    const lastDayOfMonth = {};
    R.days.forEach((day, i) => { lastDayOfMonth[day.slice(0, 7)] = i; });
    const headers = [{ text: "Month" }, ...shown.map((tc) => ({ text: cap(tc), num: true }))];
    const rows = Object.entries(lastDayOfMonth).map(([month, i]) => [
      fmtDate(month + "-01", { month: "long", year: "numeric" }),
      ...shown.map((tc) => (R.series[tc][i] == null ? "–" : n(R.series[tc][i]))),
    ]);
    $("#rating-table").replaceChildren(table(headers, rows));
  }

  // ---------------------------------------------------------------- engine sections (Phase 2)
  function renderAccuracy(S) {
    const E = S.engine;
    $("#acc-sub").textContent = "How close your moves were to Stockfish's choice, from 0 to 100.";
    if (!engineGate("#acc-body", E)) return;
    const s = E.summary;
    const partial = E.games < E.total ? ` (the newest ${n(E.games)} of ${n(E.total)})` : "";
    $("#acc-sub").textContent += ` Based on ${n(E.games)} analyzed games${partial}, ${fmtDate(E.first_day)} – ${fmtDate(E.last_day)}.`;
    $("#acc-kpis").replaceChildren(
      kpi("Your accuracy", fmt1(s.accuracy), `opponents ${fmt1(s.opp_accuracy)}`),
      kpi("Centipawn loss per move", fmt0(s.acpl), `opponents ${fmt0(s.opp_acpl)} · lower is better`),
      kpi("Blunders", fmt1(per100(s.blunder, s.moves)), `per 100 moves · ${fmt1(s.blunder / s.games)} per game`),
      kpi("Mistakes", fmt1(per100(s.mistake, s.moves)), `per 100 moves · inaccuracies ${fmt1(per100(s.inaccuracy, s.moves))}`),
    );

    if (scope === "all" && E.by_time_class.length > 1) {
      const headers = [
        { text: "Time class" }, { text: "Games", num: true }, { text: "Your accuracy", num: true }, { text: "Opponents", num: true },
        { text: "Centipawn loss", num: true }, { text: "Inaccuracies /100", num: true }, { text: "Mistakes /100", num: true },
        { text: "Blunders /100", num: true },
      ];
      $("#acc-tc").replaceChildren(el("h3", null, "By time class"), scrollBox(table(headers, E.by_time_class.map((r) => {
        const small = r.games < SMALL ? "small" : null;
        return [cap(r.label), n(r.games), { text: fmt1(r.accuracy), cls: small }, { text: fmt1(r.opp_accuracy), cls: small },
          { text: fmt0(r.acpl), cls: small }, fmt1(per100(r.inaccuracy, r.moves)), fmt1(per100(r.mistake, r.moves)),
          fmt1(per100(r.blunder, r.moves))];
      }))));
    } else {
      $("#acc-tc").replaceChildren();
    }

    // Weekly line chart: you highlighted in blue, opponents as the gray backdrop.
    const W = E.weekly;
    const xs = W.map((w) => Date.parse(w.week + "T00:00:00Z"));
    const lines = [
      { key: "accuracy", label: "You", color: cssVar("--me") },
      { key: "opp_accuracy", label: "Opponents", color: cssVar("--volume") },
    ];
    const values = W.flatMap((w) => [w.accuracy, w.opp_accuracy]).filter((v) => v != null);
    const yRange = niceRange(Math.min(...values) - 1, Math.max(...values) + 1, 0, 100);
    const sparse = W.filter((w) => w.games).length <= 12;
    $("#acc-legend").replaceChildren(legend(lines.map((l) => [l.color, l.label]), "line"));
    makeChart("#acc-chart", "Average accuracy per week, yours and your opponents'. The numbers are in the table below.", {
      type: "line",
      data: {
        datasets: lines.map((l) => ({
          label: l.label,
          data: W.map((w, i) => ({ x: xs[i], y: w[l.key] == null ? null : Math.round(w[l.key] * 10) / 10 })),
          borderColor: l.color,
          backgroundColor: l.color,
          borderWidth: 2,
          borderJoinStyle: "round",
          borderCapStyle: "round",
          pointRadius: sparse ? 4 : 0,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: cssVar("--surface"),
          spanGaps: false,
          tension: 0,
        })),
      },
      options: merge(baseOptions((i) => {
        const w = W[i];
        if (!w.games) return null;
        return {
          title: weekName(w.week),
          rows: lines.map((l) => ({ color: l.color, value: fmt1(w[l.key]), label: l.label.toLowerCase() })),
          note: `${n(w.games)} games` + (w.games < SMALL ? " · few games, treat with care" : ""),
        };
      }), {
        layout: { padding: { top: 8, right: 110 } },
        scales: {
          x: { type: "linear", min: xs[0], max: xs[xs.length - 1], ticks: { maxTicksLimit: 8, callback: (v) => shortDay(v) } },
          y: { min: yRange.min, max: yRange.max, ticks: { stepSize: yRange.step } },
        },
        plugins: { endLabels: { enabled: true } },
      }),
      plugins: [crosshairPlugin, endLabelPlugin],
    });
    const weekHeaders = [{ text: "Week" }, { text: "Games", num: true }, { text: "Your accuracy", num: true }, { text: "Opponents", num: true }];
    $("#acc-table").replaceChildren(table(weekHeaders, W.filter((w) => w.games).map((w) => [
      weekName(w.week), n(w.games), { text: fmt1(w.accuracy), cls: w.games < SMALL ? "small" : null }, fmt1(w.opp_accuracy),
    ])));

    const c = E.chesscom;
    const compare = c.games
      ? ` On the ${n(c.games)} of these games where you also ran chess.com's Game Review, chess.com gave you ${fmt1(c.theirs)} on average and this report ${fmt1(c.ours)}.`
      : "";
    $("#acc-note").textContent =
      `Accuracy uses Lichess's published formula, so it is close to chess.com's Game Review but not the same.${compare} ` +
      "An inaccuracy, mistake or blunder is a move that dropped your winning chances by 5, 10 or 15+ points. " +
      `Engine: ${DATA.engine.name}, looking at ${n(DATA.engine.nodes)} positions for every position of your games.`;
  }

  // Table rows shared by the phase and clock sections: rates per 100 moves made in open positions.
  function moveGroupTable(firstHeader, rows, nameOf) {
    const headers = [
      { text: firstHeader }, { text: "Your moves", num: true }, { text: "Still open", num: true },
      { text: "Inaccuracies /100", num: true }, { text: "Mistakes /100", num: true }, { text: "Blunders /100", num: true },
      { text: "Move accuracy", num: true },
    ];
    return table(headers, rows.map((r) => {
      const small = r.moves < SMALL_MOVES ? "small" : null;
      return [nameOf(r), n(r.all_moves), pct(r.all_moves ? r.moves / r.all_moves : null),
        { text: fmt1(per100(r.inaccuracy, r.moves)), cls: small }, { text: fmt1(per100(r.mistake, r.moves)), cls: small },
        { text: fmt1(per100(r.blunder, r.moves)), cls: small }, { text: fmt1(r.accuracy), cls: small }];
    }));
  }

  function renderPhases(S) {
    const E = S.engine;
    const st = DATA.settings;
    $("#phase-sub").textContent =
      `Opening = moves 1–${st.opening_moves}. Endgame = ${st.endgame_pieces} or fewer queens, rooks, bishops and knights ` +
      "left on the board, both sides together. Middlegame = everything in between.";
    if (!engineGate("#phase-body", E)) return;
    const rows = E.phases;
    const rates = rows.map((r) => per100(r.blunder, r.moves));
    const box = $("#phase-bars");
    box.replaceChildren(...rankedList(rows.map((r, i) => ({
      name: cap(r.label),
      value: rates[i] || 0,
      figure: fmt1(rates[i]),
      sub: `${n(r.moves)} open moves`,
      small: r.moves < SMALL_MOVES,
      tip: () => ({
        title: cap(r.label),
        rows: [
          { color: "var(--critical)", value: fmt1(rates[i]), label: "blunders per 100 moves" },
          { value: n(r.blunder), label: "blunders" },
          { value: n(r.moves), label: "moves while the game was open" },
        ],
      }),
    })), "var(--critical)", Math.max(...rates.map((v) => v || 0))).children);
    $("#phase-table").replaceChildren(moveGroupTable("Phase", rows, (r) => cap(r.label)));
    $("#phase-body .open-note").textContent = openNote();
  }

  function renderClock(S) {
    const E = S.engine;
    if (!engineGate("#clock-body", E)) return;
    const rows = E.clock.filter((r) => r.moves);
    const charted = rows.filter((r) => r.moves >= SMALL);  // a handful of moves can show "100 blunders per 100 moves"
    const rates = charted.map((r) => per100(r.blunder, r.moves));
    const color = cssVar("--critical");
    const chartBox = $("#clock-chart");
    chartBox.style.height = charted.length < 2 ? "auto" : "";
    if (charted.length < 2) {  // one bar is not a comparison
      chartBox.replaceChildren(el("p", "empty", "Too few moves with little time left to compare: in these games you rarely get short of time."));
    } else makeChart("#clock-chart", "Blunders per 100 moves by the time you had left. The numbers are in the table below.", {
      type: "bar",
      data: {
        labels: charted.map((r) => r.label),
        datasets: [{ data: rates, backgroundColor: charted.map((r) => color + (r.moves < SMALL_MOVES ? "59" : "")), ...BAR_STYLE }],
      },
      options: merge(baseOptions((i) => ({
        title: `${charted[i].label} left`,
        rows: [
          { color, value: fmt1(rates[i]), label: "blunders per 100 moves" },
          { value: n(charted[i].blunder), label: "blunders" },
          { value: n(charted[i].moves), label: "moves while the game was open" },
        ],
        note: charted[i].moves < SMALL_MOVES ? "Few moves: treat with care" : null,
      })), { scales: { y: { beginAtZero: true } } }),
    });
    $("#clock-table").replaceChildren(moveGroupTable("Time left", rows, (r) => r.label));
    $("#clock-body .open-note").textContent =
      openNote() + ` The opening (moves 1–${DATA.settings.opening_moves}) is left out too: you nearly always have time there, ` +
      "and its moves are rarely blunders, so they would make \"30 s or more\" look safer than the rest of the game. " +
      "Time left = your clock when the move started. " +
      `Faded bars and lighter numbers: fewer than ${n(SMALL_MOVES)} open moves; under ${SMALL} they are only in the table.`;
  }

  const END_EVAL_NAMES = { winning: "Winning", equal: "About equal", losing: "Losing" };
  const END_EVAL_COLORS = { winning: ["var(--win)", "#ffffff"], equal: ["var(--draw)", "#0b0b0b"], losing: ["var(--loss)", "#ffffff"] };

  function renderEnds(S) {
    const E = S.engine;
    const edge = (DATA.settings.decisive_eval_cp / 100).toFixed(1);
    $("#ends-sub").textContent =
      `Stockfish's verdict on the final position of each of these games, from your side: winning (+${edge} pawns or better), ` +
      `about equal, or losing (−${edge} or worse). For your losses, the last column says how often one of your last 3 moves ` +
      "was a blunder. Your wins show how often the clock (or an opponent leaving) won you a game you were losing.";
    if (!engineGate("#ends-body", E)) return;
    const box = $("#ends");
    box.replaceChildren();
    const groups = [
      ["Your losses", "losses", E.end_evals, [["abandonment", "You abandoned the game"], ["timeout", "You ran out of time"]]],
      ["Your wins", "wins", E.win_end_evals || {}, [["timeout", "Opponent ran out of time"], ["abandonment", "Opponent abandoned"]]],
    ];
    for (const [heading, noun, evals, reasons] of groups) {
      const grid = el("div", "two");
      for (const [reason, title] of reasons) {
        const d = evals[reason];
        if (!d) continue;
        const losses = noun === "losses";
        const column = el("div");
        column.append(el("h4", null, `${title} · ${n(d.total)} ${noun}`));
        if (!d.analyzed) {
          column.append(el("p", "empty", d.total ? "None of these is analyzed yet." : "None here."));
          grid.append(column);
          continue;
        }
        column.append(
          segmentBar(d.rows.map((r) => ({ value: r.games, color: END_EVAL_COLORS[r.label][0], ink: END_EVAL_COLORS[r.label][1], label: END_EVAL_NAMES[r.label] })), d.analyzed),
          legend(d.rows.map((r) => [END_EVAL_COLORS[r.label][0], END_EVAL_NAMES[r.label]]), "box"),
        );
        const headers = [{ text: "When it ended" }, { text: "Games", num: true }, { text: "Share", num: true },
          ...(losses ? [{ text: "Blunder in last 3", num: true }] : [])];
        column.append(scrollBox(table(headers, d.rows.map((r) => [
          END_EVAL_NAMES[r.label], n(r.games), { text: pct(r.games / d.analyzed), cls: d.analyzed < SMALL ? "small" : null },
          ...(losses ? [r.games ? `${n(r.last3_blunder)} (${pct(r.last3_blunder / r.games)})` : "–"] : []),
        ]))));
        let text;
        if (losses) {
          const blundered = d.rows.reduce((sum, r) => sum + r.last3_blunder, 0);
          text = `${n(blundered)} of these ${n(d.analyzed)} losses (${pct(blundered / d.analyzed)}) came right after a blunder in your last 3 moves.`;
        } else {
          const losing = d.rows.find((r) => r.label === "losing").games;
          text = `${n(losing)} of these ${n(d.analyzed)} wins (${pct(losing / d.analyzed)}) came when you were losing.`;
        }
        if (d.analyzed < d.total) text += ` ${n(d.analyzed)} of the ${n(d.total)} are analyzed so far.`;
        column.append(el("p", "note", text));
        grid.append(column);
      }
      box.append(el("h3", null, heading), grid);
    }
    requestAnimationFrame(fitTallLabels);
  }

  // ---------------------------------------------------------------- best moves
  const KIND_NAMES = { brilliant: "Brilliant", great: "Great", missed: "Missed brilliant" };
  const MOTIF_NAMES = {
    takes: "Took material your opponent left",
    saves: "Saved an attacked piece",
    other: "Everything else: defences, quiet only-moves, forced trades, attacks",
  };
  const RESULT_NAMES = {
    my_brilliant: "With a Brilliant from you",
    my_great: "With a Great move from you",
    neither: "With neither",
    opp_brilliant: "With a Brilliant from your opponent",
    all: "All checked games",
  };
  const RESULT_TEXT = { win: "You won", loss: "You lost", draw: "Draw" };
  const PIECE_WORDS = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  // Best moves are only known in the games where Stockfish has checked the second-best move of every candidate
  // (games_great). Until almost all games of a group are checked, its numbers stay hidden: the games that get
  // finished first (short ones with nothing for Stockfish to check) aren't typical, so rates would be wrong.
  const GREAT_READY = 0.95;
  const greatReady = (group) => group.games_great > 0 && group.games_great >= GREAT_READY * group.games;
  const gamesFor = (group) => group.games_great;
  const rate100 = (group, kind, who) => (greatReady(group) ? per100(group[who][kind], group.games_great) : null);
  const per1000 = (count, moves) => (moves ? (count / moves) * 1000 : null);
  const greatPending = (group) =>
    `Best moves: ${n(group.games_great)} of ${n(group.games)} games checked so far. Run analyze.bat to check the rest (Stockfish looks at the second-best move).`;

  // An eval in centipawns for the player who moved, as pawns: +0.4, −2.1, or +M3 for a forced mate.
  function fmtEval(cp) {
    if (cp == null) return "–";
    const sign = cp >= 0 ? "+" : "−";
    if (Math.abs(cp) >= 9000) return `${sign}M${10000 - Math.abs(cp)}`;
    if (Math.abs(cp) < 5) return "0.0";  // would round to "−0.0"
    return sign + (Math.abs(cp) / 100).toFixed(1);
  }
  const signedPawns = (cp) => (cp >= 0 ? "+" : "−") + Math.abs(cp / 100);
  const pawnsWorth = (value) => (value === 1 ? "1 pawn's worth" : `${value} pawns' worth`);

  function badge(kind) {
    const box = el("span", "badge");
    const dot = el("i");
    dot.style.background = `var(--${kind === "missed" ? "brilliant" : kind})`;
    box.append(dot, document.createTextNode(KIND_NAMES[kind]));
    return box;
  }

  function renderBest(S) {
    const B = S.best;
    $("#best-sub").textContent =
      "Your Brilliant and Great moves, and your opponents', judged by the same rules (they are explained at the bottom).";
    if (!engineGate("#best-body", B)) return;
    const sum = { ...B.summary, games: B.games, games_great: B.games_great };  // for rate100 and greatReady
    const ready = greatReady(sum);
    $("#best-sub").textContent += ` Based on ${n(B.games)} analyzed games.`;

    const results = Object.fromEntries(B.results.map((r) => [r.label, r]));
    const counters = B.counterattacks || { brilliant: { me: 0, opp: 0 }, missed: { me: 0, opp: 0 } };
    const realBrilliants = sum.me.brilliant - counters.brilliant.me;
    // Counterattacks only exist with BRILLIANT_COUNTER_CAPTURES = False: then say how many of the moves they are.
    const realNote = counters.brilliant.me ? `, ${n(realBrilliants)} of them real sacrifices` : "";
    const counterNote = counters.brilliant.me
      ? `Of your ${n(sum.me.brilliant)} Brilliant moves, ${n(realBrilliants)} are real sacrifices (the material stays lost) and ` +
        `${n(counters.brilliant.me)} are counterattacks: if your opponent takes, you win material back elsewhere. `
      : "";
    const waiting = `waiting for analyze.bat · ${n(B.games_great)} of ${n(B.games)} games checked`;
    $("#best-kpis").replaceChildren(
      kpi("Brilliant moves", ready ? fmt1(rate100(sum, "brilliant", "me")) : "–",
        ready ? `per 100 games · opponents ${fmt1(rate100(sum, "brilliant", "opp"))} · ${n(sum.me.brilliant)} in total${realNote}` : waiting),
      kpi("Great moves", ready ? fmt1(rate100(sum, "great", "me")) : "–",
        ready ? `per 100 games · opponents ${fmt1(rate100(sum, "great", "opp"))} · ${n(sum.me.great)} in total` : waiting),
      kpi("Missed brilliants", ready ? fmt1(rate100(sum, "missed", "me")) : "–",
        ready ? `per 100 games · opponents ${fmt1(rate100(sum, "missed", "opp"))}` : waiting),
      kpi("Win rate in games with your Brilliant", ready && results.my_brilliant.games ? pct(winRate(results.my_brilliant)) : "–",
        ready ? `${n(results.my_brilliant.games)} games · ${pct(winRate(results.all))} in all checked games` : waiting),
    );

    if (scope === "all" && B.by_time_class.length > 1) {
      const headers = [
        { text: "Time class" }, { text: "Games", num: true }, { text: "Brilliant /100", num: true }, { text: "Opponents", num: true },
        { text: "Great /100", num: true }, { text: "Opponents", num: true }, { text: "Missed brilliants /100", num: true },
      ];
      $("#best-tc").replaceChildren(el("h3", null, "By time class"), scrollBox(table(headers, B.by_time_class.map((r) => {
        const small = r.games < SMALL ? "small" : null;
        const greatSmall = r.games_great < SMALL ? "small" : null;
        return [cap(r.label), n(r.games),
          { text: fmt1(rate100(r, "brilliant", "me")), cls: small }, { text: fmt1(rate100(r, "brilliant", "opp")), cls: small },
          { text: fmt1(rate100(r, "great", "me")), cls: greatSmall }, { text: fmt1(rate100(r, "great", "opp")), cls: greatSmall },
          { text: fmt1(rate100(r, "missed", "me")), cls: small }];
      }))));
    } else {
      $("#best-tc").replaceChildren();
    }

    const lines = [{ who: "me", label: "You", color: cssVar("--me") }, { who: "opp", label: "Opponents", color: cssVar("--volume") }];
    $("#best-legend").replaceChildren(legend(lines.map((l) => [l.color, l.label]), "line"));
    for (const kind of ["brilliant", "great"]) bestMonthlyChart(`#best-chart-${kind}`, B.monthly, kind, lines);
    const monthHeaders = [
      { text: "Month" }, { text: "Games", num: true }, { text: "Your Brilliants /100", num: true }, { text: "Opponents", num: true },
      { text: "Your Great moves /100", num: true }, { text: "Opponents", num: true },
    ];
    $("#best-monthly").replaceChildren(table(monthHeaders, B.monthly.filter((m) => m.games).map((m) => [
      fmtDate(m.month + "-01", { month: "long", year: "numeric" }), n(m.games),
      { text: fmt1(rate100(m, "brilliant", "me")), cls: m.games < SMALL ? "small" : null }, fmt1(rate100(m, "brilliant", "opp")),
      { text: fmt1(rate100(m, "great", "me")), cls: m.games_great < SMALL ? "small" : null }, fmt1(rate100(m, "great", "opp")),
    ])));

    const mineTotal = B.pieces.reduce((t, p) => t + p.me, 0);
    $("#best-pieces").replaceChildren(table(
      [{ text: "Piece given up" }, { text: "Your Brilliants", num: true }, { text: "Share", num: true },
        { text: "Opponents' Brilliants", num: true }, { text: "Your missed", num: true }],
      B.pieces.map((p) => [cap(p.piece), n(p.me), pct(mineTotal ? p.me / mineTotal : null), n(p.opp), n(p.missed)]),
    ));

    if (ready) {
      const total = (who) => B.motifs.reduce((t, m) => t + m[who], 0);
      const [me, opp] = [total("me"), total("opp")];
      $("#best-motifs").replaceChildren(table(
        [{ text: "Kind of Great move" }, { text: "You", num: true }, { text: "Share", num: true }, { text: "Opponents", num: true }, { text: "Share", num: true }],
        B.motifs.map((m) => [MOTIF_NAMES[m.motif], n(m.me), pct(me ? m.me / me : null), n(m.opp), pct(opp ? m.opp / opp : null)]),
      ));
    } else {
      $("#best-motifs").replaceChildren(el("p", "empty", greatPending(B)));
    }

    $("#best-phases").replaceChildren(bestGroupTable("Phase", B.phases, (r) => cap(r.label), ready));
    $("#best-clock").replaceChildren(bestGroupTable("Time left", B.clock.filter((r) => r.moves), (r) => r.label, ready));

    const resultHeaders = [
      { text: "Games" }, { text: "Games", num: true }, { text: "Win %", num: true }, { text: "Score", num: true }, { text: "", width: "24%" },
    ];
    $("#best-results").replaceChildren(ready ? table(resultHeaders, B.results.map((r) => ({
      cells: [RESULT_NAMES[r.label], n(r.games), pctCell(r), pctCell(r, scoreOf(r)), thinBar(r)],
      tip: () => wdlTip(RESULT_NAMES[r.label], r),
    }))) : el("p", "empty", greatPending(B)));

    $("#best-note").textContent = counterNote +
      "Per 100 games counts moves, not games: two Brilliant moves in one game count twice. Per 1,000 moves compares phases " +
      "and clock times fairly, because you make different numbers of moves in each. Time left = your clock when the move started. " +
      `Lighter numbers: fewer than ${SMALL} games (${n(SMALL_MOVES)} moves for the phase and clock tables). ` +
      "Win rates in games with a Brilliant or Great move show a link, not a cause: these moves come up more in some kinds of games." +
      (ready ? "" : " " + greatPending(B));
    $("#best-defs").replaceChildren(...bestDefinitions().map((text) => el("li", null, text)));
  }

  function bestMonthlyChart(selector, months, kind, lines) {
    const chartBox = $(selector);
    // A month with a handful of games is just noise; a month whose games aren't all checked yet would mislead.
    const counted = (m) => gamesFor(m) >= MIN_CHART_GAMES && greatReady(m);
    if (months.filter(counted).length < 2) {  // one month is a dot, not a line
      chartBox.style.height = "auto";
      const total = months.reduce((t, m) => ({ games: t.games + m.games, games_great: t.games_great + m.games_great }), { games: 0, games_great: 0 });
      chartBox.replaceChildren(el("p", "empty", !greatReady(total) ? greatPending(total) : "Not enough games per month to chart yet."));
      return;
    }
    chartBox.style.height = "";
    const labels = months.map((m) => fmtDate(m.month + "-01", { month: "short", year: "2-digit" }));
    const value = (m, who) => (counted(m) ? rate100(m, kind, who) : null);
    makeChart(selector, `${KIND_NAMES[kind]} moves per 100 games, yours and your opponents', by month. The numbers are in the table below.`, {
      type: "line",
      data: {
        labels,
        datasets: lines.map((l) => ({
          label: l.label,
          data: months.map((m) => (value(m, l.who) == null ? null : Math.round(value(m, l.who) * 10) / 10)),
          borderColor: l.color,
          backgroundColor: l.color,
          borderWidth: 2,
          borderJoinStyle: "round",
          borderCapStyle: "round",
          pointRadius: 4,
          pointHoverRadius: 5,
          pointBorderColor: cssVar("--surface"),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: cssVar("--surface"),
          spanGaps: false,
          tension: 0,
        })),
      },
      options: merge(baseOptions((i) => {
        const m = months[i];
        if (!counted(m)) return null;
        return {
          title: fmtDate(m.month + "-01", { month: "long", year: "numeric" }),
          rows: lines.map((l) => ({ color: l.color, value: fmt1(value(m, l.who)), label: `${l.label.toLowerCase()} · ${n(m[l.who][kind])} moves` })),
          note: `per 100 games · ${n(gamesFor(m))} games` + (gamesFor(m) < SMALL ? " · few games, treat with care" : ""),
        };
      }), { scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmt1(v) } } } }),
    });
  }

  // Phase and clock tables: my Brilliant and Great moves per 1,000 of my moves in that group.
  function bestGroupTable(firstHeader, rows, nameOf, ready) {
    const headers = [
      { text: firstHeader }, { text: "Your moves", num: true }, { text: "Brilliant", num: true }, { text: "Per 1,000 moves", num: true },
      { text: "Great", num: true }, { text: "Per 1,000 moves", num: true },
    ];
    return table(headers, rows.map((r) => {
      const small = r.moves_great < SMALL_MOVES ? "small" : null;
      const shown = (x) => (ready ? x : "–");
      return [nameOf(r), n(r.moves_great), shown(n(r.brilliant)), { text: shown(fmt1(per1000(r.brilliant, r.moves_great))), cls: small },
        shown(n(r.great)), { text: shown(fmt1(per1000(r.great, r.moves_great))), cls: small }];
    }));
  }

  function bestDefinitions() {
    const s = DATA.settings.best;
    const [lo, hi] = s.great_win_chance;
    const counter = s.brilliant_counter_captures !== false;  // older reports don't have this setting: it was on
    const pawns = (k) => (k === 1 ? "a pawn" : `${k} pawns`);
    const captureMin = s.brilliant_min_sac_capture ?? s.brilliant_min_sac;
    return [
      "Brilliant: a sacrifice that works. It is Stockfish's top move" +
        (s.brilliant_max_loss > 0 ? `, or costs at most ${s.brilliant_max_loss} points of winning chances. ` : ". ") +
        "Right after it, your opponent can take one of your knights, bishops, rooks or queens and come out ahead in " +
        `material: at least ${pawns(captureMin)} for a capture (like Nxf7 Kxf7), at least ${pawns(s.brilliant_min_sac)} for ` +
        "a quiet move, " +
        (counter ? "counting everything that follows: your captures anywhere in reply, theirs back, and so on" : "after the trades on that square") +
        " (whatever your move captured itself counts for you)." +
        (s.brilliant_king_moves === false ? " King moves never count: they are usually escapes that leave something behind." : "") +
        ` You are still fine afterwards (winning chances ${s.brilliant_min_win_after}% or more). When you were already far ` +
        `ahead (above ${s.brilliant_max_win_before}%), only Stockfish's top move counts, and only if its next best move would ` +
        `have left you at ${s.brilliant_far_next_best ?? s.brilliant_max_win_before}% or less: the sacrifice was clearly the most ` +
        "crushing move. It must be a choice: when every legal move loses as much material (a fork, a trapped piece, a pawn " +
        "about to promote), or Stockfish's best other move gets mated, the sacrifice was forced and doesn't count. " +
        "These thresholds were picked by comparing with chess.com's own list of your Brilliant moves.",
      `Great: the only good move. You played the engine's best move, and the second-best move would have cost at least ` +
        `${s.great_min_gap} points of winning chances (so every other move was a blunder). The game wasn't decided (winning ` +
        `chances ${lo}–${hi}% before the move), or the move completed a turnaround: from losing (${signedPawns(s.great_losing_cp)} ` +
        `pawns or worse) before your opponent's last move to about equal or better (${signedPawns(-s.great_equal_cp)} or better) after ` +
        `yours, or from about equal (within ±${s.great_equal_cp / 100}) to winning (${signedPawns(s.great_winning_cp)} or better). ` +
        "Taking back on the square your opponent just captured on, forced moves (only one legal move) and checkmates never count. " +
        (s.great_include_obvious
          ? "Obvious only-moves (taking material your opponent left hanging, saving an attacked piece) do count, but they rank last in the highlights."
          : "Obvious only-moves (taking material your opponent left hanging, saving an attacked piece) are left out."),
      `Missed brilliant: the best move was a sacrifice like that, and you played a move that cost at least ${s.missed_min_loss} ` +
        "points of winning chances instead.",
      "Your opponents' moves are judged by exactly the same rules. chess.com keeps its own rules secret, so its Game Review " +
        "won't always agree. Every threshold can be changed in chess_coach/config.py.",
    ];
  }

  // ---------------------------------------------------------------- chess boards (highlight reel)
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SQ = 45;  // python-chess draws its pieces in a 45 x 45 box: one square
  const PIECE_IDS = {
    P: "white-pawn", N: "white-knight", B: "white-bishop", R: "white-rook", Q: "white-queen", K: "white-king",
    p: "black-pawn", n: "black-knight", b: "black-bishop", r: "black-rook", q: "black-queen", k: "black-king",
  };

  // A button (from the old puzzles code, which the app replaced; the mistake types' view switch still uses it).
  function pzButton(text, className, onClick) {
    const button = el("button", className, text);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }

  // The piece drawings come from python-chess (generated by the report, not user data). They go into one
  // hidden <svg> once; every board then shows them with <use href="#white-knight">.
  let piecesInstalled = false;
  function installPieces() { /* the app's pieces are pictures */ }

  // Top-left corner of a square like "e4", with White at the bottom (or Black, when flipped).
  function squareXY(square, flip) {
    const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
    return [(flip ? 7 - file : file) * SQ, (flip ? rank : 7 - rank) * SQ];
  }

  // The piece letter on a square ("N", "p", ...) in the piece-placement part of a FEN, or null.
  function pieceAt(placement, square) {
    const row = placement.split("/")[8 - Number(square[1])];
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") { file += Number(ch); continue; }
      if (file === square.charCodeAt(0) - 97) return ch;
      file++;
    }
    return null;
  }

  // arrows: [uci, class, dashed]
  // marks (puzzles): { squares: [[square, class]] tinted under the pieces, dots: [[square, capture]] for the moves of the
  // piece you tapped: a dot on an empty square, a ring around a piece it can take }
  function boardSvg(card, arrows, marks = null) {
    const flip = card.color === "black";  // seen from the side of the player who moved
    const svg = svgEl("svg", { viewBox: `0 0 ${8 * SQ} ${8 * SQ}`, class: "board", role: "img",
      "aria-label": `Board before ${card.move}, from ${card.color === "white" ? "White" : "Black"}'s side` });
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const [x, y] = squareXY(String.fromCharCode(97 + file) + (rank + 1), flip);
        svg.append(svgEl("rect", { x, y, width: SQ, height: SQ, class: (file + rank) % 2 === 0 ? "sq-dark" : "sq-light" }));
      }
    }
    for (const [square, cls] of (marks && marks.squares) || []) {
      const [x, y] = squareXY(square, flip);
      svg.append(svgEl("rect", { x, y, width: SQ, height: SQ, class: "mark-" + cls }));
    }
    // Coordinates in the corners of the bottom row and the left column.
    for (let i = 0; i < 8; i++) {
      const file = flip ? 7 - i : i, bottomRank = flip ? 7 : 0;
      const letter = svgEl("text", { x: i * SQ + SQ - 3, y: 8 * SQ - 3, "text-anchor": "end",
        class: "coord " + ((file + bottomRank) % 2 === 0 ? "on-dark" : "on-light") });
      letter.textContent = String.fromCharCode(97 + file);
      const rank = flip ? i : 7 - i, leftFile = flip ? 7 : 0;
      const number = svgEl("text", { x: 3, y: i * SQ + 11, class: "coord " + ((leftFile + rank) % 2 === 0 ? "on-dark" : "on-light") });
      number.textContent = String(rank + 1);
      svg.append(letter, number);
    }
    card.board.split("/").forEach((row, i) => {
      let file = 0;
      for (const ch of row) {
        if (ch >= "1" && ch <= "8") { file += Number(ch); continue; }
        const [x, y] = squareXY(String.fromCharCode(97 + file) + (8 - i), flip);
        svg.append(svgEl("image", { href: hooks.pieceUrl((ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase()), x, y, width: SQ, height: SQ }));
        file++;
      }
    });
    for (const [square, capture] of (marks && marks.dots) || []) {
      const [x, y] = squareXY(square, flip);
      svg.append(svgEl("circle", capture ? { cx: x + SQ / 2, cy: y + SQ / 2, r: SQ * 0.45, class: "ring" }
        : { cx: x + SQ / 2, cy: y + SQ / 2, r: SQ * 0.16, class: "dot" }));
    }
    for (const [uci, cls, dashed] of arrows) if (uci) svg.append(arrowSvg(uci, cls, dashed, flip));
    return svg;
  }

  function arrowSvg(uci, cls, dashed, flip) {
    const center = (square) => squareXY(square, flip).map((v) => v + SQ / 2);
    const [x1, y1] = center(uci.slice(0, 2)), [x2, y2] = center(uci.slice(2, 4));
    const length = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / length, uy = (y2 - y1) / length;  // unit vector along the arrow
    const head = SQ * 0.45, halfWidth = SQ * 0.28, shaft = SQ * 0.17;
    const bx = x2 - ux * head, by = y2 - uy * head;           // where the head starts
    const group = svgEl("g", { class: "arrow " + cls });
    const line = svgEl("line", { x1: x1 + ux * SQ * 0.18, y1: y1 + uy * SQ * 0.18, x2: bx, y2: by,
      "stroke-width": shaft, "stroke-linecap": dashed ? "butt" : "round" });
    if (dashed) line.setAttribute("stroke-dasharray", `${shaft * 1.1} ${shaft * 0.9}`);
    const arrowHead = svgEl("polygon", {
      points: `${x2},${y2} ${bx - uy * halfWidth},${by + ux * halfWidth} ${bx + uy * halfWidth},${by - ux * halfWidth}` });
    group.append(line, arrowHead);
    return group;
  }

  function highlightCard(c) {
    const card = el("article", "hl");
    const arrows = c.kind === "missed" ? [[c.alt_uci, "played", true], [c.uci, "brilliant", false]] : [[c.uci, c.kind, false]];
    card.append(boardSvg(c, arrows));
    const body = el("div", "body");
    const title = el("div", "title");
    title.append(badge(c.kind), el("span", "move", c.move));
    body.append(title);
    for (const text of cardLines(c)) body.append(el("div", "line", text));
    const rating = c.opp_rating ? ` (${n(c.opp_rating)})` : "";
    body.append(el("div", "meta", `${cap(c.time_class)} · ${fmtDate(c.date)} · vs ${c.opponent}${rating} · ${RESULT_TEXT[c.result] || c.result}`));
    const linkLine = el("div");
    const link = el("a", null, "Open the game on chess.com ↗");
    link.href = c.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    linkLine.append(link, el("span", "small", ` · move ${c.move_number}`));
    body.append(linkLine);
    card.append(body);
    return card;
  }

  function cardLines(c) {
    const evals = `Eval for you: ${fmtEval(c.eval_before)} → ${fmtEval(c.eval_after)}`;
    const counterLine = "A counterattack: if your opponent takes, you win material back elsewhere";
    if (c.kind === "brilliant") {
      const lines = [`Sacrifices a ${c.piece}: gives up ${pawnsWorth(c.sac_value)} of material`];
      if (c.motif === "counter") lines.push(counterLine);
      // Made when you were already far ahead: it counts because it was needed to stay there.
      if (c.alt_san) lines.push(`Needed to stay this far ahead: the next best move, ${c.alt_san}, only kept ${fmtEval(c.alt_eval)}`);
      lines.push(evals);
      return lines;
    }
    if (c.kind === "missed") {
      const lines = [`The sacrifice gives up a ${c.piece} (${pawnsWorth(c.sac_value)}) and keeps ${fmtEval(c.eval_before)}`];
      if (c.motif === "counter") lines.push(counterLine);
      lines.push(`You played ${c.alt_san} instead: ${fmtEval(c.eval_after)}`);
      return lines;
    }
    const moved = PIECE_WORDS[(pieceAt(c.board, c.uci.slice(0, 2)) || "").toLowerCase()] || "piece";
    const what = c.motif === "takes" ? "Took the material your opponent left"
      : c.motif === "saves" ? `Saved your attacked ${moved}` : "The only good move";
    const lines = [`${what}. Next best: ${c.alt_san} (${fmtEval(c.alt_eval)}), ${Math.round(c.gap)} points of winning chances worse`];
    if (c.turnaround && c.prev_eval != null) lines.push(`Before your opponent's last move you stood at ${fmtEval(c.prev_eval)}`);
    lines.push(evals);
    return lines;
  }

  function fillReel(selector, cards, emptyText) {
    $(selector).replaceChildren(...(cards.length ? cards.map(highlightCard) : [el("p", "empty", emptyText)]));
  }

  function renderReel(S) {
    const B = S.best;
    $("#reel-sub").textContent =
      "Your most impressive moves. Each board shows the position before the move, from your side; the arrow is the move you played.";
    if (!engineGate("#reel-body", B)) return;
    installPieces();
    fillReel("#reel-brilliant", B.highlights.brilliant, "No Brilliant moves here yet.");
    fillReel("#reel-great", B.highlights.great, B.games_great
      ? "No Great moves here yet." : "Great moves need analyze.bat: Stockfish checks the second-best move first.");
    $("#reel-note").textContent =
      "Brilliant moves are ranked with real sacrifices first (counterattacks after them), then by how much material they gave up. " +
      "Great moves are ranked by how much worse the next best move was; moves in games that were already decided count half, " +
      "and obvious only-moves (taking free material, saving an attacked piece) come last. The move number is the one on chess.com.";
  }

  function renderMissed(S) {
    const B = S.best;
    $("#missed-sub").textContent =
      `Positions where the best move was a sound sacrifice, and you played a move that cost at least ${DATA.settings.best.missed_min_loss} ` +
      "points of winning chances instead. On each board the solid arrow is the sacrifice and the dashed red arrow is the move you played.";
    if (!engineGate("#missed-body", B)) return;
    installPieces();
    const sum = { ...B.summary, games: B.games, games_great: B.games_great };
    const ready = greatReady(sum);
    $("#missed-kpis").replaceChildren(
      kpi("Missed brilliants", ready ? fmt1(rate100(sum, "missed", "me")) : "–",
        ready ? `per 100 games · opponents ${fmt1(rate100(sum, "missed", "opp"))}` : greatPending(B)),
      kpi("In total", n(sum.me.missed), `in ${n(B.games_great)} checked games · Brilliants you did play: ${n(sum.me.brilliant)}`),
    );
    fillReel("#reel-missed", B.highlights.missed, "No missed brilliants here.");
  }

  // ---------------------------------------------------------------- mistake types (Phase 6)
  // What each blunder of yours in an open position allowed or missed, read by motifs.py from Stockfish's line around it.
  // Two views: blunders made with at least TIME_TROUBLE_SECONDS on the clock (the patterns to train; your top motif is
  // counted there), and all of them. The numbers match the facts the coach may quote (facts.motifs).
  const MOTIF_LABELS = Object.assign({ sacrifice: "A sacrifice" }, DATA.motif_labels || {});
  const MOTIF_COLORS = ["--win", "--tc-blitz", "--great", "--tc-rapid"];
  let motifView = "time";

  function renderMotifs(S) {
    const M = S.motifs, tt = PROG.time_trouble_seconds;
    $("#motifs-sub").textContent = "What each of your blunders in an open position allowed or missed, read from " +
      `Stockfish's best line around it. A blunder made with less than ${tt} seconds on your clock is a clock problem ` +
      "more than a pattern you can't see: switch between the two views below.";
    const body = $("#motifs-body"), hint = body.previousElementSibling;
    body.hidden = !M;
    hint.hidden = Boolean(M);
    if (!M) {
      hint.textContent = "No mistake types here yet: analyze.bat reads them from Stockfish's lines around your blunders " +
        "(about 20 minutes the first time, then a minute a week).";
      return;
    }
    installPieces();
    const views = $("#motifs-view");
    views.replaceChildren(...[["time", `Made with ${tt}+ s on the clock`], ["all", "All open blunders"]].map(([id, text]) => {
      const button = pzButton(text, null, () => { motifView = id; renderMotifs(S); });
      button.setAttribute("aria-pressed", String(motifView === id));
      return button;
    }));
    const V = M.views[motifView], R = V.recent, top = DATA.top_motif;
    // A window's numbers show once 95% of its blunders have their type (motifs.ready): before the first analyze.bat
    // has gone through all of them, the older weeks only have some.
    const ready = (W) => W.expected > 0 && W.blunders >= 0.95 * W.expected;
    const share = (W, m) => (ready(W) && W.blunders ? (W.types[m] || 0) / W.blunders : null);
    const rate = (W, m) => (ready(W) ? per100(W.types[m] || 0, W.open_moves) : null);
    const allRecent = M.views.all.recent, timeRecent = M.views.time.recent;
    const topKpi = kpi("Your top motif", top ? MOTIF_LABELS[top] : "–", top
      ? `all games, last ${PROG.compare_weeks} weeks, blunders made with time · here ${fmt1(rate(timeRecent, top))} per 100 open moves`
      : "No pattern yet");
    topKpi.querySelector(".value").classList.add("text");
    $("#motifs-kpis").replaceChildren(
      topKpi,
      kpi(`Blunders, last ${PROG.compare_weeks} weeks`, n(R.blunders), `in ${n(R.open_moves)} open moves`),
      kpi("Made in time trouble", allRecent.blunders ? pct((allRecent.blunders - timeRecent.blunders) / allRecent.blunders) : "–",
        `of your open blunders, last ${PROG.compare_weeks} weeks (under ${tt} s)`),
    );
    const order = Object.keys(V.all.types).sort((a, b) => (V.all.types[b] - V.all.types[a]) || a.localeCompare(b));
    const headers = [{ text: "Mistake type" },
      { text: `Last ${PROG.compare_weeks} weeks`, num: true }, { text: "/100 open moves", num: true },
      { text: `The ${PROG.compare_weeks} before`, num: true }, { text: "/100 open moves", num: true },
      { text: "All games", num: true }, { text: "/100 open moves", num: true }];
    $("#motifs-table").replaceChildren(table(headers, order.map((m) => {
      const cell = (W, f) => ({ text: f(W, m) == null ? "–" : (f === share ? pct(f(W, m)) : fmt1(f(W, m))),
        cls: W.blunders < SMALL ? "small" : null });
      return [{ text: MOTIF_LABELS[m] + (m === top && motifView === "time" ? "  ← your top motif" : "") },
        cell(V.recent, share), cell(V.recent, rate), cell(V.previous, share), cell(V.previous, rate),
        cell(V.all, share), cell(V.all, rate)];
    }).concat([[{ text: "All open blunders" }, ...[V.recent, V.previous, V.all].flatMap((W) => ready(W)
      ? [n(W.blunders), fmt1(per100(W.blunders, W.open_moves))]
      : [{ text: `${n(W.blunders)} of ${n(W.expected)}`, cls: "small" }, "–"])]])));

    // Monthly trend of the four most common types (no clear tactic left out), per 100 open moves.
    const shown = order.filter((m) => m !== "other").slice(0, 4);
    const months = M.months[motifView].filter((row) => row.open_moves >= SMALL_MOVES);
    const lines = shown.map((m, i) => ({ key: m, label: MOTIF_LABELS[m], color: cssVar(MOTIF_COLORS[i]) }));
    $("#motifs-legend").replaceChildren(legend(lines.map((l) => [l.color, l.label]), "line"));
    if (months.length < 2) {
      $("#motifs-chart").replaceChildren(el("p", "empty", "Not enough months with enough open moves to chart yet."));
    } else {
      makeChart("#motifs-chart", "Your most common mistake types per 100 open moves, month by month.", {
        type: "line",
        data: {
          labels: months.map((row) => fmtMonth(row.month)),
          datasets: lines.map((l) => ({
            label: l.label, borderColor: l.color, backgroundColor: l.color, borderWidth: 2, tension: 0,
            pointRadius: months.length <= 12 ? 3 : 0, pointHoverRadius: 5,
            data: months.map((row) => Math.round(per100(row.types[l.key] || 0, row.open_moves) * 100) / 100),
          })),
        },
        options: merge(baseOptions((i) => ({
          title: fmtMonth(months[i].month),
          rows: lines.map((l) => ({ color: l.color, value: fmt1(per100(months[i].types[l.key] || 0, months[i].open_moves)),
            label: l.label.toLowerCase() })),
          note: `${n(months[i].open_moves)} open moves`,
        })), { scales: { y: { min: 0 } } }),
        plugins: [crosshairPlugin],
      });
    }
    const cards = (M.examples || []).map(motifCard);
    $("#motifs-examples").replaceChildren(...(cards.length ? cards : [el("p", "empty", "No examples here yet.")]));
    const pending = ready(V.all) ? "" : `Still working out the types: ${n(V.all.blunders)} of your ${n(V.all.expected)} ` +
      "open blunders so far, newest first (analyze.bat continues where it stopped); a dash means not enough of that " +
      "window is done yet. ";
    $("#motifs-note").textContent = pending + `Open moves: your moves made while your winning chances were between ` +
      `${DATA.settings.open_win_chance[0]}% and ${DATA.settings.open_win_chance[1]}%, the same as everywhere in this tab. ` +
      "Lighter numbers rest on fewer than " + SMALL + " blunders. Examples: your newest blunder of each common type " +
      `made with ${tt}+ seconds; the dashed red arrow is your move, the blue one Stockfish's answer (or, for a missed ` +
      "chance, Stockfish's move instead of yours).";
    $("#motifs-defs").replaceChildren(...[
      "Each blunder is read twice: Stockfish's best line after your move (what it allowed your opponent) and your " +
        "best line before it (what you missed). A pattern only counts when its line wins material (or mates).",
      "Left a piece (or a pawn) hanging: your opponent's first move takes it, and the trades on that square leave you down.",
      "Fork: one piece attacks two targets at once (the king, or pieces worth more than it, or undefended ones), and one falls.",
      "Pin: a bishop, rook or queen attacks a piece that can't move away because the king (or something worth more) is behind it.",
      "Skewer: the same line attack the other way round: the piece in front is worth more, it moves, and the one behind falls.",
      "Discovered attack: a move uncovers another piece's attack (or check), and the double threat wins material.",
      "Trapped piece: an attacked piece has nowhere safe to go. Back-rank mate: mate on the last rank, the king boxed in by its own pawns.",
      "Another tactic: the line wins material in another way. No clear tactic: nothing tactical in the line (a positional " +
        "or endgame mistake, a slow plan).",
      "The main type is picked in this order: a mate, a piece or pawn left hanging, a tactic you allowed, a free capture " +
        "you missed, a tactic you missed.",
    ].map((t) => el("li", null, t)));
  }

  function fmtMonth(ym) {
    return new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }

  function motifCard(ex) {
    const card = el("article", "hl");
    const missed = ex.motif.endsWith("_missed");
    const answer = missed ? ex.best : ex.reply;
    card.append(boardSvg({ board: ex.board, color: ex.color, move: ex.move }, [[ex.uci, "played", true], [answer, "best", false]]));
    const body = el("div", "body");
    const title = el("div", "title");
    const tag = el("span", "badge");
    const dot = el("i");
    dot.style.background = "var(--critical)";
    tag.append(dot, document.createTextNode(MOTIF_LABELS[ex.motif] || ex.motif));
    title.append(tag, el("span", "move", ex.move));
    body.append(title);
    if (missed && ex.best_san) body.append(el("div", "line", `Stockfish's move instead: ${ex.best_san}`));
    if (!missed && ex.reply_san) body.append(el("div", "line", `Stockfish's answer: ${ex.reply_san}`));
    if (ex.clock != null) body.append(el("div", "line", `Your clock: ${fmt1(ex.clock)} s`));
    body.append(el("div", "meta", `${cap(ex.time_class)} · ${fmtDate(ex.date)} · vs ${ex.opponent}`));
    const linkLine = el("div");
    const link = el("a", null, "Open this move on chess.com ↗");
    link.href = ex.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    linkLine.append(link);
    body.append(linkLine);
    card.append(body);
    return card;
  }

  // ---------------------------------------------------------------- coach's notes (Phase 3)
  // The notes are written in Egyptian Arabic in a Claude Code session (data/<user>/coach_notes.json) and checked by
  // coach.py: every number in a text is on one of the facts the text cites. Those facts are the chips under the text,
  // and a click on one shows that number in its place in the report. The tables print "shown", the same strings the
  // facts have (facts.py), so a number in the text is exactly a number in a table. The tables update every run;
  // the text stays as it was written until a session writes it again.
  const COACH = DATA.coach || { status: "none" };
  // This week (Phase 6, step 4): the short update the local model writes once a week (weekly_note.py), from the weekly
  // table's last two rows. Its numbers are checked like the notes' (its chips show where they come from); its wording isn't.
  const WEEKLY = DATA.coach_weekly || null;
  const WEEKLY_TAGS = { late_blunders: "Blunders", converted: "المواقف الكسبانة", abandoned: "الماتشات اللي سبتها",
    accuracy: "الدقة", top_motif: "أكتر غلطة", rating: "الريتنج" };
  const PROG = DATA.settings.progress || { compare_weeks: 4, time_trouble_seconds: 10, winning_chance: 80, settle_games: 50, settle_days: 30 };
  const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const arDate = (iso, year = false) => {
    const d = new Date(iso + "T00:00:00Z");
    return `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]}` + (year ? ` ${d.getUTCFullYear()}` : "");
  };
  const arMonth = (ym) => `${AR_MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const scopeName = (s) => (s === "all" ? "All games" : cap(s));
  const slugOf = (text) => text.toLowerCase().replace(/[^a-z0-9+]+/g, "-").replace(/^-+|-+$/g, "");  // like facts.slug
  const coachNotes = (s) => (COACH.notes && COACH.notes.scopes && COACH.notes.scopes[s]) || {};
  // The weekly progress numbers: [target key in the notes, value name in the facts, label (or a function of the scope's
  // progress numbers: the top-motif column names its motif)]
  const METRICS = [
    ["late_blunders", "blunders /100 after the opening", "Blunders لكل 100 نقلة بعد الافتتاح"],
    ["converted", "winning positions won", "المواقف الكسبانة اللي كسبتها"],
    ["abandoned", "abandoned", "الماتشات اللي سبتها"],
    ["accuracy", "accuracy", "Accuracy"],
    ["top_motif", "top-motif blunders /100 open moves", (P) => `${MOTIF_LABELS[P.top_motif] || P.top_motif} لكل 100 نقلة`],
  ];  // (blunders under 10 s is only in the 4-weeks comparison: a bullet game has about 0.4 such moves, too few for a week)
  const TARGET_BETTER = { late_blunders: "lower", converted: "higher", abandoned: "lower", accuracy: "higher", top_motif: "lower" };
  // The metrics of one scope's table: the top-motif column only once the scope has a top motif (mistake types typed).
  const metricsOf = (P) => METRICS.filter(([key]) => key !== "top_motif" || (P && P.top_motif))
    .map(([key, name, label]) => [key, name, typeof label === "function" ? label(P) : label]);
  const SMALL_WINNING = DATA.settings.small_sample_winning || 20;
  const PERCENT_TARGETS = new Set(["converted", "abandoned"]);
  // The 4-weeks comparison: [value name in the facts, label]
  const COMPARE_ROWS = [
    ["games", "الماتشات"],
    ["win %", "نسبة الفوز"],
    ["score", "النقط (التعادل بنص نقطة)"],
    ["expected score", "النقط المتوقعة من الريتنج"],
    ["opponents' rating", "متوسط ريتنج الخصوم"],
    ["rating change", "تغيير الريتنج"],
    ["rating at the end", "الريتنج في الآخر"],
    ["accuracy", "Accuracy"],
    ["blunders /100 after the opening", "Blunders لكل 100 نقلة بعد الافتتاح"],
    ["blunders /100 under time trouble", `Blunders لكل 100 نقلة تحت ${PROG.time_trouble_seconds} ثواني`],
    ["games with a winning position", `ماتشات وصلت فيها لـ ${PROG.winning_chance}% فرصة فوز`],
    ["winning positions won", "منها كسبت"],
    ["abandoned", "الماتشات اللي سبتها"],
    ["lost on time", "خسرت بالوقت"],
    ["lost on time while winning", "خسرت بالوقت وانت كسبان"],
    ["seconds per move", "ثواني لكل نقلة"],
    ["time controls", "أنواع الماتشات"],
  ];
  const COACH_KINDS = {
    blunder: ["Blunder", "var(--critical)"], mistake: ["Mistake", "var(--loss)"], inaccuracy: ["Inaccuracy", "var(--draw)"],
    good: ["Good move", "var(--win)"], brilliant: ["Brilliant", "var(--brilliant)"], great: ["Great", "var(--great)"],
    missed: ["Missed brilliant", "var(--brilliant)"], end: ["آخر الماتش", "var(--muted)"],
  };
  const AR_PIECES = { queen: "الوزير", rook: "الطابية", bishop: "الفيل", knight: "الحصان", pawn: "العسكري", king: "الملك" };
  const AR_ENDS = {
    win: { checkmate: "كسبت بكش مات", timeout: "كسبت بالوقت", resignation: "كسبت: الخصم استسلم", abandonment: "كسبت: الخصم ساب الماتش" },
    loss: { checkmate: "خسرت بكش مات", timeout: "خسرت بالوقت", resignation: "خسرت: استسلمت", abandonment: "خسرت: سبت الماتش" },
  };

  // Latin words, chess moves and numbers inside Arabic text: each run goes in its own <span dir="ltr">.
  const LTR_RUN = /[+\-−]?[A-Za-z0-9](?:[A-Za-z0-9_+\-−.,:%/'’()…→#=×≤≥ ]*[A-Za-z0-9_%)#+])?/g;
  function appendIsolated(node, text) {
    text = String(text);
    let last = 0;
    for (const match of text.matchAll(LTR_RUN)) {
      if (match.index < last) continue;
      if (match.index > last) node.append(document.createTextNode(text.slice(last, match.index)));
      let run = match[0];
      const count = (ch) => run.split(ch).length - 1;
      while (run.endsWith(")") && count(")") > count("(")) run = run.slice(0, -1);  // "(من 1,056 لـ 1,159)": the ")" belongs to the Arabic
      const span = el("span", null, run);
      span.dir = "ltr";
      node.append(span);
      last = match.index + run.length;
    }
    if (last < text.length) node.append(document.createTextNode(text.slice(last)));
    return node;
  }
  const iso = (text, cls) => appendIsolated(el("span", cls), text == null ? "–" : text);

  // Paragraphs (a blank line between them) and lists (lines starting with "- "), which can follow a line of text.
  function richText(text) {
    const box = el("div", "rich");
    for (const block of String(text).split(/\n\s*\n/)) {
      let p = null, list = null;
      for (const line of block.split("\n").filter((l) => l.trim())) {
        if (/^\s*[-•]\s+/.test(line)) {
          if (!list) box.append(list = el("ul"));
          list.append(appendIsolated(el("li"), line.replace(/^\s*[-•]\s+/, "")));
          p = null;
        } else {
          if (p) p.append(el("br"));
          else box.append(p = el("p"));
          appendIsolated(p, line);
          list = null;
        }
      }
    }
    return box;
  }

  // The facts a text cites: the value it quotes (then → now, when new games changed it), and where it is.
  function factChips(claim, facts = COACH.facts) {  // facts: the cited facts then and now (the weekly note has its own)
    const box = el("div", "chips");
    for (const id of claim.facts || []) {
      const f = facts && facts[id];
      if (!f) continue;
      const chip = el("button", "chip");
      chip.type = "button";
      chip.dir = "ltr";
      ((claim.quoted || {})[id] || []).forEach((name) => {  // the values this text quotes (a fact cited for context shows just its name)
        const then = f.then[name], now = f.now ? f.now[name] : undefined;
        chip.append(el("b", null, then == null ? "–" : then));
        if (f.now && now !== then) chip.append(el("span", "now", ` → ${now == null ? "–" : now}`));
        chip.append(document.createTextNode(` ${name} · `));
      });
      const other = f.scope !== scope && !f.label.includes(cap(f.scope)) ? ` · ${scopeName(f.scope)}` : "";
      chip.append(document.createTextNode(f.label + other));
      if (!f.now) chip.append(document.createTextNode(" (no longer in the report)"));
      hoverTip(chip, () => ({
        title: `${f.group} · ${scopeName(f.scope)} · ${f.label}`,
        rows: Object.entries(f.now || f.then).slice(0, 10).map(([name, value]) => ({
          value: f.now && f.then[name] !== undefined && f.then[name] !== value ? `${f.then[name]} → ${value}` : value, label: name,
        })),
        note: "Click to see it in the report.",
      }));
      chip.addEventListener("click", () => goToFact(id));
      box.append(chip);
    }
    return box;
  }

  // Show where a fact is: open the tab of its section (the "story", "compare", "controls" and "tracker" tables are
  // here in the coach's notes), then scroll to the tagged row or table, else (switching to the fact's time class)
  // the tagged row there, else the section itself.
  function goToFact(id) {
    const f = (COACH.facts && COACH.facts[id]) || (WEEKLY && WEEKLY.facts[id]);
    if (f) hooks.goToFact(id, f);
  }

  // A text of the notes with its chips and its positions.
  // The "This week" box at the top of All games: the local model's note, when it was written, and a warning when it is
  // an older week's note because the latest attempt failed the checks.
  function weeklyBox() {
    const box = el("div", "weekly");
    box.append(el("h3", null, "ملاحظة الأسبوع"));
    const meta = el("p", "sub");
    const sunday = new Date(Date.parse(WEEKLY.week + "T00:00:00Z") + 6 * 86400000).toISOString().slice(0, 10);
    appendIsolated(meta, `عن أسبوع ${arDate(WEEKLY.week)} – ${arDate(sunday)}، من صفين الجدول الأسبوعي بتوعه. كتبها الموديل ` +
      `المحلي على اللابتوب ده (${WEEKLY.model}) يوم ${arDate(WEEKLY.written.slice(0, 10), true)}. الأرقام اتراجعت ` +
      "(مصدرها تحت كل نقطة)، الصياغة لأ. بتتكتب مرة في الأسبوع، يوم الحد.");
    box.append(meta);
    if (WEEKLY.stale) {
      box.append(banner(`دي ملاحظة أسبوع ${arDate(WEEKLY.week)}: محاولة الأسبوع ده ماعدتش مراجعة الأرقام، فالملاحظة القديمة فضلت.`, true));
    }
    for (const item of WEEKLY.items) {
      const where = item.scope === "all" ? "كل الماتشات" : cap(item.scope);  // set by the code, not the model
      box.append(claimBlock(item, `${WEEKLY_TAGS[item.metric] || item.metric} · ${where}`, WEEKLY.facts));
    }
    return box;
  }

  function claimBlock(claim, tag, facts = COACH.facts) {
    const box = el("div", "claim");
    const text = richText(claim.text || "");
    if (tag && text.firstChild) text.firstChild.prepend(el("span", "tag", tag));
    box.append(text);
    if (claim.facts && claim.facts.length) box.append(factChips(claim, facts));
    const cards = (claim.examples || []).map(coachCard).filter(Boolean);
    if (cards.length) {
      const reel = el("div", "reel");
      reel.append(...cards);
      box.append(reel);
    }
    return box;
  }

  // A position from your games, like the highlight reel: your move dashed red, Stockfish's move blue.
  function coachCard(entry) {
    const name = typeof entry === "string" ? entry : entry && entry.ref;
    const ex = name && COACH.examples ? COACH.examples[name] : null;
    if (!ex) return null;
    const v = ex.values || {};
    const arrows = ex.kind === "end" ? []
      : ex.kind === "brilliant" || ex.kind === "great" ? [[ex.uci, ex.kind, false]]
      : ex.kind === "missed" ? [[ex.uci, "played", true], [ex.best_uci, "brilliant", false]]
      : [[ex.uci, "played", true], ...(ex.best_uci && ex.best_uci !== ex.uci ? [[ex.best_uci, "best", false]] : [])];
    const card = el("article", "hl");
    card.append(boardSvg({ board: ex.board, color: ex.my_color, move: ex.move || "the end of the game" }, arrows));
    const body = el("div", "body");
    const title = el("div", "title");
    const [kindName, color] = COACH_KINDS[ex.kind] || [ex.kind, "var(--muted)"];
    const badgeBox = el("span", "badge");
    const dot = el("i");
    dot.style.background = color;
    badgeBox.append(dot, iso(kindName));
    title.append(badgeBox, iso(ex.kind === "end" ? `بعد نقلة ${ex.move_number}` : ex.move, "move"));
    body.append(title);
    if (entry.text) body.append(richText(entry.text));
    const line = (label, value) => {
      if (!value) return;
      const row = el("div", "line");
      row.append(document.createTextNode(label + " "), iso(value));
      body.append(row);
    };
    if (ex.kind === "end") {
      line("التقييم ليك في الآخر:", v["final eval for you"]);
      line("وقتك بعد آخر نقلة ليك:", v["your clock at your last move"]);
    } else {
      const piece = AR_PIECES[ex.piece] || ex.piece;
      if (ex.kind === "brilliant") line(`ضحيت ب${piece}، قيمته`, `${ex.sac_value} pawns`);
      if (ex.kind === "missed") line(`كان ممكن تضحي ب${piece}، قيمته`, `${ex.sac_value} pawns`);
      if (ex.kind === "missed") {
        line("التضحية كانت:", v["the sacrifice"]);
        line("انت لعبت:", v["you played"]);
      }
      line("فرصتك:", v["winning chances"]);
      line("التقييم ليك:", v["eval for you"]);
      line("وقتك قبل النقلة:", v["clock before the move"]);
      if (ex.kind === "great" && v["next best"]) line("أحسن نقلة بعدها:", `${v["next best"]} · −${Math.round(ex.gap)} points`);
      if (ex.kind === "brilliant") line("أحسن نقلة تانية:", v["next best"]);
      line("Stockfish كان عايز:", v["Stockfish's move"]);
      line("أحسن رد للخصم:", v["their best reply"]);
    }
    const ending = (AR_ENDS[ex.result] || {})[ex.end_reason] || (ex.result === "draw" ? "تعادل" : ex.result);
    body.append(appendIsolated(el("div", "meta"), `${cap(ex.time_class)} ${ex.control} · ${v.date} · ضد ${v.opponent} · ${ending}`));
    const linkLine = el("div");
    const link = el("a", null, ex.kind === "end" ? "افتح آخر الماتش على chess.com ↗" : "افتح النقلة على chess.com ↗");
    link.href = ex.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    linkLine.append(link);
    body.append(linkLine);
    card.append(body);
    return card;
  }

  function itemsBlock(body, title, items, look) {
    if (!items || !items.length) return;
    body.append(el("h3", null, title));
    const list = el("div", "coach-items");
    items.forEach((item, i) => {
      const kind = item.kind === "strength" ? "strong" : item.kind === "weakness" ? "weak" : look;
      const card = el("div", "coach-item" + (kind ? ` ${kind}` : ""));
      const head = el("div", "head");
      head.append(el("span", "num", String(i + 1)), appendIsolated(el("h4"), item.title || ""));
      card.append(head, claimBlock(item));
      if (item.action) {
        const action = el("p", "action");
        action.append(el("b", null, "جرب ده: "));
        card.append(appendIsolated(action, item.action));
      }
      list.append(card);
    });
    body.append(list);
  }

  function planBlock(plan) {
    const box = el("div", "plan");
    if (plan.intro) box.append(claimBlock(plan.intro));
    if (plan.days && plan.days.length) {
      box.append(scrollBox(table([{ text: "اليوم" }, { text: "تعمل إيه" }], plan.days.map((d) => {
        const list = el("ul");
        for (const task of d.tasks || []) list.append(appendIsolated(el("li"), task));
        return [appendIsolated(el("span"), d.day || ""), list];
      }))));
    }
    if (plan.rules && plan.rules.length) {
      box.append(el("h4", null, "قواعد ثابتة"));
      const list = el("ul");
      for (const rule of plan.rules) list.append(appendIsolated(el("li"), rule));
      box.append(list);
    }
    return box;
  }

  // Where your rating started, peaked and stands: one column per time class.
  function storyTable(tcs) {
    const stories = DATA.ratings.story || {};
    const list = tcs.filter((tc) => stories[tc]);
    if (!list.length) return el("p", "empty", "مفيش ماتشات rated هنا.");
    const k = PROG.compare_weeks;
    const rows = [
      ["الماتشات (rated)", (st) => st.shown["rated games"]],
      ["أول ريتنج", (st) => st.shown["first rating"]],
      ["أعلى ريتنج خالص", (st) => `${st.shown["highest ever"]} · الماتش رقم ${st.peak_game} · ${arDate(st.peak_date, true)}`],
      [`أعلى ريتنج بعد أول ${PROG.settle_games} ماتش و${PROG.settle_days} يوم`,
        (st) => (st.settled_peak == null ? "–" : `${st.shown["highest after the start"]} · ${arDate(st.settled_peak_date, true)}`)],
      ["أحسن شهر (متوسط الريتنج)", (st) => (st.best_month ? `${arMonth(st.best_month)}: ${st.shown["best month's median"]}` : "–")],
      ["دلوقتي", (st) => st.shown.now],
      [`متوسط آخر ${k} أسابيع`, (st) => (st.recent.games
        ? `${st.shown[`last ${k} weeks: median`]} (من ${st.shown[`last ${k} weeks: lowest`]} لـ ${st.shown[`last ${k} weeks: highest`]})` : "–")],
    ];
    const t = table([{ text: "" }, ...list.map((tc) => ({ text: cap(tc) }))],
      rows.map(([label, value]) => [label, ...list.map((tc) => iso(value(stories[tc])))]));
    t.dataset.facts = list.map((tc) => `${tc}.story`).join(" ");
    if (list.length === 1) t.classList.add("narrow");
    return scrollBox(t);
  }

  function monthsTable(tc) {
    const st = (DATA.ratings.story || {})[tc];
    const box = el("div");
    if (!st) return box;
    const t = table(
      [{ text: "الشهر" }, { text: "الماتشات" }, { text: "متوسط الريتنج" }, { text: "أقل" }, { text: "أعلى" }, { text: "نسبة الفوز" }, { text: "Accuracy" }],
      st.months.map((m) => [m.settling ? `${arMonth(m.month)} (لسه بيستقر)` : arMonth(m.month), iso(m.shown.games),
        iso(m.shown["median rating"]), iso(m.shown.lowest), iso(m.shown.highest), iso(m.shown["win %"]), iso(m.shown.accuracy)]),
    );
    [...t.tBodies[0].rows].forEach((tr, i) => { tr.dataset.facts = `${tc}.story.${st.months[i].month}`; });
    box.append(el("h4", null, "شهر بشهر"), scrollBox(t));
    return box;
  }

  // What each number of the 4-weeks comparison rests on; fewer than the report's small-sample marks: faded.
  const COMPARE_SAMPLE = {
    "blunders /100 after the opening": (p) => p.late_moves >= SMALL_MOVES,
    "blunders /100 under time trouble": (p) => p.tt_moves >= SMALL_MOVES,
    "winning positions won": (p) => p.winning >= SMALL_WINNING,
    accuracy: (p) => p.analyzed >= SMALL,
  };

  function compareTable(P, tc) {
    const k = PROG.compare_weeks;
    const empty = (x) => x == null || x === "–";
    const faded = (p, name) => ((COMPARE_SAMPLE[name] || ((q) => q.games >= SMALL))(p) ? null : "faded");
    const rows = COMPARE_ROWS.filter(([name]) => !(empty(P.recent.shown[name]) && empty(P.previous.shown[name])))
      .map(([name, label]) => [label, iso(P.previous.shown[name], faded(P.previous, name)), iso(P.recent.shown[name], faded(P.recent, name))]);
    const t = table([{ text: "" }, { text: `الـ ${k} أسابيع اللي قبلهم (${arDate(P.previous.from)} – ${arDate(P.previous.to)})` },
      { text: `آخر ${k} أسابيع (${arDate(P.recent.from)} – ${arDate(P.recent.to)})` }], rows);
    t.dataset.facts = `${tc}.compare.recent ${tc}.compare.previous`;
    return scrollBox(t);
  }

  function controlsTable(P, tc) {
    const box = el("div");
    if (!P.controls.length) return box;
    const cols = [["games", "الماتشات"], ["win %", "نسبة الفوز"], ["score", "النقط"], ["expected score", "المتوقع"],
      ["accuracy", "Accuracy"], ["blunders /100 after the opening", "Blunders/100 بعد الافتتاح"],
      ["winning positions won", "المواقف الكسبانة اللي كسبتها"], ["abandoned", "سبتها"], ["lost on time", "بالوقت"],
      ["rating change", "تغيير الريتنج"]];
    const t = table([{ text: "النوع" }, ...cols.map(([, label]) => ({ text: label }))],
      P.controls.map((c) => [iso(c.label), ...cols.map(([name]) => iso(c.shown[name]))]));
    [...t.tBodies[0].rows].forEach((tr, i) => {
      tr.dataset.facts = `${tc}.controls.${slugOf(P.controls[i].label)}`;
      if (P.controls[i].games < SMALL) tr.classList.add("few");
    });
    const scroller = scrollBox(t);
    scroller.classList.add("wide");
    box.append(el("h4", null, "حسب نوع الماتش (كل ماتشاتك)"), scroller);
    return box;
  }

  // How many moves or games a progress number rests on (fewer than the report's small-sample marks: faded).
  const SAMPLE = {
    late_blunders: (p) => p.late_moves >= SMALL_MOVES, converted: (p) => p.winning >= SMALL_WINNING,
    abandoned: (p) => p.games >= SMALL, accuracy: (p) => p.analyzed >= SMALL, top_motif: (p) => p.tm_moves >= SMALL_MOVES,
  };

  // A progress number, green when it meets the notes' target and red when it doesn't; faded when it rests on few games.
  function markCell(text, key, target, p) {
    const cell = iso(text);
    const value = parseFloat(String(text == null ? "" : text).replace("−", "-").replace(/[^0-9.\-]/g, ""));
    if (target != null && isFinite(value)) {
      const lower = TARGET_BETTER[key] === "lower";
      cell.classList.add((lower ? value <= target : value >= target) ? "good" : "bad");
    }
    if (p && !SAMPLE[key](p)) cell.classList.add("faded");
    return cell;
  }

  function targetText(key, target) {
    if (target == null) return "–";
    // One left-to-right piece: on its own, "≥" in a right-to-left line would be drawn mirrored as "≤".
    const span = el("span", "target", `${TARGET_BETTER[key] === "lower" ? "≤" : "≥"} ${target}${PERCENT_TARGETS.has(key) ? "%" : ""}`);
    span.dir = "ltr";
    return span;
  }

  // One row per week, each counting the 4 weeks up to that week (rolling): one week has too few games for most numbers.
  function trackerTable(P, tc, targets) {
    const weeks = P.weeks.filter((w) => w.games);
    if (!weeks.length) return el("p", "empty", "مفيش ماتشات في الأسابيع دي.");
    const metrics = metricsOf(P);
    const rows = weeks.map((w) => [`${arDate(w.from)} – ${arDate(w.to)}`, iso(w.week_games), iso(w.shown.games),
      iso(w.shown["rating at the end"]), ...metrics.map(([key, name]) => markCell(w.shown[name], key, targets[key], w)),
      iso(w.shown["time controls"])]);
    rows.push(["الهدف", "", "", "", ...metrics.map(([key]) => targetText(key, targets[key])), ""]);
    const t = table([{ text: `الـ ${PROG.compare_weeks} أسابيع` }, { text: "ماتشات آخر أسبوع فيهم" },
      { text: `ماتشات الـ ${PROG.compare_weeks} أسابيع` }, { text: "الريتنج في الآخر" },
      ...metrics.map(([, , label]) => ({ text: label })), { text: "الأنواع" }], rows);
    const trs = [...t.tBodies[0].rows];
    trs.forEach((tr, i) => {
      if (!weeks[i]) return;
      tr.dataset.facts = `${tc}.week.${weeks[i].week}`;
      if (weeks[i].games < SMALL) tr.classList.add("few");
    });
    trs[trs.length - 1].classList.add("target");
    const scroller = scrollBox(t);
    scroller.classList.add("wide");
    if (!P.top_motif) return scroller;
    const box = el("div");  // what the top-motif column counts
    box.append(scroller, appendIsolated(el("p", "sub"), `عمود "${MOTIF_LABELS[P.top_motif] || P.top_motif}": أكتر نوع غلطة ` +
      `في أسابيع الجدول، نفس النوع في كل الصفوف. بيعد الـ blunders من النوع ده اللي لعبتها وعندك ${PROG.time_trouble_seconds} ` +
      `ثواني أو أكتر، لكل 100 نقلة مفتوحة بنفس الوقت. لو نزل يبقى تمرين البازلات شغال.`));
    return box;
  }

  // "All games": each time class's last weeks next to the weeks before, with the targets.
  function progressSummary() {
    const grid = el("div", "three");
    for (const tc of DATA.time_classes) {
      const P = DATA.scopes[tc].progress;
      if (!P) continue;
      const targets = coachNotes(tc).targets || {};
      const t = table([{ text: "" }, { text: "قبلها" }, { text: "آخر أسابيع" }, { text: "الهدف" }],
        metricsOf(P).map(([key, name, label]) => [label, markCell(P.previous.shown[name], key, null, P.previous),
          markCell(P.recent.shown[name], key, targets[key], P.recent), targetText(key, targets[key])]));
      t.dataset.facts = `${tc}.compare.recent ${tc}.compare.previous`;
      const column = el("div");
      column.append(el("h4", null, cap(tc)), scrollBox(t));
      grid.append(column);
    }
    return grid;
  }

  function banner(text, warn) {
    return appendIsolated(el("div", warn ? "banner warn" : "banner"), text);
  }

  function renderCoach(S) {
    installPieces();
    const body = $("#coach-body");
    const sub = $("#coach-sub");
    body.replaceChildren();
    sub.replaceChildren();
    if (COACH.notes) {
      appendIsolated(sub, `كتبها ${COACH.notes.by || "Claude"} يوم ${arDate(COACH.notes.written, true)}، من ${n(COACH.games_then)} ماتش. ` +
        "كل رقم في الكلام موجود في الأرقام: الأرقام اللي تحت كل فقرة هي مصدره، ولو دوست على رقم هيوريك مكانه. " +
        "الجداول بتتحدث مع كل تحديث (كل ليلة، أو لما تدوس Update now).");
      const fresh = COACH.games_now - COACH.games_then;
      if (fresh > 0) {
        body.append(banner(`فيه ${n(fresh)} ماتش جديد من ساعة ما الملاحظات اتكتبت. الكلام زي ما هو، والأرقام اللي اتغيرت ظاهرة كده: ` +
          "قبل → دلوقتي. عشان تحدّث الكلام: افتح Claude Code في فولدر المشروع وقوله \"اكتب ملاحظات المدرب من جديد\"."));
      }
    } else {
      appendIsolated(sub, "الجداول دي بتتحدث مع كل تحديث. الكلام نفسه بيكتبه Claude في Claude Code من reports/coach_summary.md.");
      body.append(banner("لسه مفيش ملاحظات مكتوبة. افتح Claude Code في فولدر المشروع وقوله \"اكتب ملاحظات المدرب\" " +
        "(القواعد في chess_coach/coach_guide.md)."));
    }
    if (COACH.problems && COACH.problems.length) {
      const box = banner("الملاحظات فيها أرقام أو مصادر مش موجودة في التقرير، فلسه متفحصتش. لازم تتصلح والتقرير يتبني تاني:", true);
      const list = el("ul");
      for (const problem of COACH.problems) list.append(el("li", null, problem));
      box.append(list);
      body.append(box);
    }
    const N = coachNotes(scope);
    if (scope === "all") {
      if (WEEKLY && WEEKLY.items && WEEKLY.items.length) body.append(weeklyBox());
      if (N.summary) body.append(el("h3", null, "الخلاصة"), claimBlock(N.summary));
      body.append(el("h3", null, "مستواك الحقيقي في كل نوع"), storyTable(DATA.time_classes));
      for (const level of N.levels || []) body.append(claimBlock(level, level.time_class ? cap(level.time_class) : null));
      itemsBlock(body, "أهم نقط ضعفك", N.weaknesses, "weak");
      itemsBlock(body, "أهم نقط قوتك", N.strengths, "strong");
      if (N.plan) body.append(el("h3", null, "خطة التمرين الأسبوعية"), planBlock(N.plan));
      body.append(el("h3", null, `متابعة التقدم: آخر ${PROG.compare_weeks} أسابيع مقابل الـ ${PROG.compare_weeks} اللي قبلهم`));
      if (N.progress) body.append(claimBlock(N.progress));
      body.append(progressSummary());
      return;
    }
    const name = cap(scope);
    body.append(el("h3", null, `مستواك الحقيقي في الـ ${name}`));
    if (N.level) body.append(claimBlock(N.level));
    body.append(storyTable([scope]), monthsTable(scope));
    body.append(el("h3", null, `إيه اللي اتغير في آخر ${PROG.compare_weeks} أسابيع`));
    if (N.changes) body.append(claimBlock(N.changes));
    if (S.progress) body.append(compareTable(S.progress, scope), controlsTable(S.progress, scope));
    itemsBlock(body, `ملاحظات على الـ ${name}`, N.notes, null);
    body.append(el("h3", null, "المتابعة الأسبوعية"));
    if (N.progress) body.append(claimBlock(N.progress));
    if (S.progress) body.append(trackerTable(S.progress, scope, N.targets || {}));
  }

  return {
    renderOverview, renderRatings, renderAccuracy, renderPhases, renderClock, renderMotifs, renderBest, renderReel, renderMissed, renderOpenings, renderDrops, renderEndings, renderEnds, renderHours, renderTilt, renderRatingDiff, renderCoach, fitTallLabels, hideTip,
    setScope(next) { scope = next; },
    destroyCharts() { charts.forEach((chart) => chart.destroy()); charts = []; hideTip(); },
  };
}

// The old page's frames: one per section, with the ids the render functions fill.
export const MARKUP = {
  overview: `

    <section class="card" id="sec-results">
        <h2>Results</h2>
        <p class="sub">Wins, draws and losses: overall, by color, and by time class.</p>
        <div id="kpis" class="kpis"></div>
        <div id="wdl-bar"></div>
        <div class="two"><div id="by-color"></div><div id="by-tc"></div></div>
      </section>

    <section class="card" id="sec-ratings">
        <h2>Rating over time</h2>
        <p class="sub">Your rating at the end of each day, rated games only. Flat stretches mean you didn't play that time class.</p>
        <div id="rating-legend"></div>
        <div class="chart big" id="rating-chart"></div>
        <details><summary>Show as table (end of each month)</summary><div class="scroll" id="rating-table"></div></details>
      </section>`,
  coach: `
    <section class="card coach" id="sec-coach" dir="rtl" lang="ar">
        <h2>ملاحظات المدرب</h2>
        <p class="sub" id="coach-sub"></p>
        <div id="coach-body"></div>
      </section>`,
  mistakes: `
    <section class="card" id="sec-accuracy">
        <h2>Accuracy</h2>
        <p class="sub" id="acc-sub"></p>
        <p class="empty" hidden></p>
        <div id="acc-body">
          <div id="acc-kpis" class="kpis"></div>
          <div id="acc-tc"></div>
          <h3>Accuracy per week</h3>
          <div id="acc-legend"></div>
          <div class="chart" id="acc-chart"></div>
          <details><summary>Show as table</summary><div class="scroll" id="acc-table"></div></details>
          <p class="note" id="acc-note"></p>
        </div>
      </section>

    <section class="card" id="sec-phases">
        <h2>Mistakes by game phase</h2>
        <p class="sub" id="phase-sub"></p>
        <p class="empty" hidden></p>
        <div id="phase-body">
          <h3>Blunders per 100 moves</h3>
          <div class="ranked" id="phase-bars"></div>
          <div class="scroll" id="phase-table"></div>
          <p class="note open-note"></p>
        </div>
      </section>

    <section class="card" id="sec-clock">
        <h2>Blunders and the clock</h2>
        <p class="sub">How often you blunder depending on the time you had left when the move started.</p>
        <p class="empty" hidden></p>
        <div id="clock-body">
          <h3>Blunders per 100 moves</h3>
          <div class="chart" id="clock-chart"></div>
          <div class="scroll" id="clock-table"></div>
          <p class="note open-note"></p>
        </div>
      </section>

    <section class="card" id="sec-motifs">
        <h2>Mistake types</h2>
        <p class="sub" id="motifs-sub"></p>
        <p class="empty" hidden></p>
        <div id="motifs-body">
          <div class="pz-views" id="motifs-view" role="group" aria-label="Which blunders to count"></div>
          <div id="motifs-kpis" class="kpis"></div>
          <div class="scroll" id="motifs-table"></div>
          <h3>Per 100 open moves, by month</h3>
          <div id="motifs-legend"></div>
          <div class="chart" id="motifs-chart"></div>
          <h3>Examples from your games</h3>
          <div class="reel" id="motifs-examples"></div>
          <p class="note" id="motifs-note"></p>
          <details class="defs"><summary>How the mistake types are found</summary><ul id="motifs-defs"></ul></details>
        </div>
      </section>`,
  openings: `
    <section class="card" id="sec-openings">
        <h2>Openings</h2>
        <p class="sub" id="openings-sub"></p>
        <div class="two"><div id="op-white"></div><div id="op-black"></div></div>
        <details>
          <summary>Exact variations</summary>
          <div class="two"><div id="var-white"></div><div id="var-black"></div></div>
        </details>
        <p class="note">Lighter numbers: fewer than <span class="small-n"></span> games, so they can swing a lot.</p>
      </section>

    <section class="card" id="sec-drops">
        <h2>Where your results drop</h2>
        <p class="sub" id="drops-sub"></p>
        <div class="reel" id="drops"></div>
        <p class="note" id="drops-note"></p>
      </section>`,
  endings: `
    <section class="card" id="sec-endings">
        <h2>How your games end</h2>
        <p class="sub">For wins, the reason is what happened to your opponent; for losses, what happened to you.</p>
        <div class="three" id="endings"></div>
      </section>

    <section class="card" id="sec-ends">
        <h2>Games decided on time or by abandonment</h2>
        <p class="sub" id="ends-sub"></p>
        <p class="empty" hidden></p>
        <div id="ends-body">
          <div id="ends"></div>
        </div>
      </section>`,
  habits: `
    <section class="card" id="sec-hours">
        <h2>Time of day</h2>
        <p class="sub" id="hours-sub"></p>
        <h3>Games played per hour</h3>
        <div class="chart" id="hours-games"></div>
        <h3>Win rate compared with your average</h3>
        <div class="chart" id="hours-win"></div>
        <p class="note">Faded bars: fewer than <span class="small-n"></span> games in that hour.</p>
        <details><summary>Show as table</summary><div class="scroll" id="hours-table"></div></details>
      </section>

    <section class="card" id="sec-tilt">
        <h2>Tilt check</h2>
        <p class="sub">Your win rate right after losing several games in a row, in the same session.</p>
        <div class="ranked" id="tilt"></div>
        <p class="note" id="tilt-note"></p>
        <h3>Right after a win vs. right after a loss</h3>
        <div class="scroll" id="tilt-after"></div>
        <h3>Win rate by game number in the session, compared with your average</h3>
        <div class="chart" id="tilt-number-win"></div>
        <h3>Accuracy by game number in the session, compared with your average</h3>
        <div class="chart" id="tilt-number-acc"></div>
        <details><summary>Show as table</summary><div class="scroll" id="tilt-number-table"></div></details>
        <p class="note" id="tilt-more-note"></p>
      </section>

    <section class="card" id="sec-rating-diff">
        <h2>Stronger vs. weaker opponents</h2>
        <p class="sub">Grouped by the rating gap before the game (opponent minus you).</p>
        <div class="scroll" id="rating-diff"></div>
        <p class="note">Score counts a draw as half a win. Expected is what the Elo formula predicts from each game's rating gap.
          chess.com reports ratings <em>after</em> the game, so the ratings from before it were rebuilt from your previous game.</p>
      </section>`,
  best_stats: `
      <section class="card" id="sec-best">
          <h2>Best moves</h2>
          <p class="sub" id="best-sub"></p>
          <p class="empty" hidden></p>
          <div id="best-body">
            <div id="best-kpis" class="kpis"></div>
            <div id="best-tc"></div>
            <h3>Per 100 games, by month</h3>
            <div id="best-legend"></div>
            <div class="two">
              <div><div class="chart-title">Brilliant moves</div><div class="chart" id="best-chart-brilliant"></div></div>
              <div><div class="chart-title">Great moves</div><div class="chart" id="best-chart-great"></div></div>
            </div>
            <details><summary>Show as table</summary><div class="scroll" id="best-monthly"></div></details>
            <div class="two">
              <div><h3>Pieces you sacrifice</h3><div class="scroll" id="best-pieces"></div></div>
              <div><h3>What your Great moves were</h3><div class="scroll" id="best-motifs"></div></div>
            </div>
            <div class="two">
              <div><h3>By game phase</h3><div class="scroll" id="best-phases"></div></div>
              <div><h3>By time left on your clock</h3><div class="scroll" id="best-clock"></div></div>
            </div>
            <h3>Your results in these games</h3>
            <div class="scroll" id="best-results"></div>
            <p class="note" id="best-note"></p>
            <details class="defs"><summary>How Brilliant and Great are defined</summary><ul id="best-defs"></ul></details>
          </div>
        </section>`,
  best_reel: `
      <section class="card" id="sec-reel">
          <h2>Highlight reel</h2>
          <p class="sub" id="reel-sub"></p>
          <p class="empty" hidden></p>
          <div id="reel-body">
            <h3>Your best Brilliant moves</h3>
            <div class="reel" id="reel-brilliant"></div>
            <h3>Your best Great moves</h3>
            <div class="reel" id="reel-great"></div>
            <p class="note" id="reel-note"></p>
          </div>
        </section>`,
  best_missed: `
      <section class="card" id="sec-missed">
          <h2>Missed brilliants</h2>
          <p class="sub" id="missed-sub"></p>
          <p class="empty" hidden></p>
          <div id="missed-body">
            <div id="missed-kpis" class="kpis"></div>
            <div class="reel" id="reel-missed"></div>
          </div>
        </section>`,
};
