import { CELLS, label, mulberry32, shipPlacements, SHIPS } from "../src/board.ts";
import { adaptive, density, huntTarget, model, posterior } from "../src/shooters.ts";

const PLACERS = ["uniform", "edges", "spread", "clustered", "cold"];
const bytes = new Uint8Array(await (await fetch("library.bin")).arrayBuffer());
const per = bytes.length / PLACERS.length;
const models = PLACERS.map((name, k) => model(name, bytes.subarray(k * per, (k + 1) * per)));

/** Every algorithm, rebuilt and replayed from scratch on every change, since shooters keep state. */
const ALGORITHMS = {
  adaptive: { note: "works out their habit as it goes", make: (rng) => adaptive(rng, models) },
  exact: { note: "likeliest cell, from 1,000 fleets that fit", make: (rng) => posterior(rng, "hit", 1000) },
  density: { note: "the classic probability density", make: (rng) => density(rng) },
  info: { note: "the shot that tells you most", make: (rng) => posterior(rng, "info", 1000) },
  ...Object.fromEntries(models.map((m) => [`tuned ${m.name}`, { note: `if they always hide ${m.name}`, make: (rng) => density(rng, m.weights) }])),
  parity: { note: "checkerboard, then neighbors of hits", make: (rng) => huntTarget(rng, true) },
};

const $ = (id) => document.getElementById(id);
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

/** @type {{ cell: number, hit: boolean, sunk: number | null }[]} */
let history = load("history", []);
let algo = load("algo", "adaptive");
if (!(algo in ALGORITHMS)) algo = "adaptive";
let selected = null;

$("algo").append(...Object.entries(ALGORITHMS).map(([name, { note }]) => new Option(`${name}: ${note}`, name)));
$("algo").value = algo;
$("algo").onchange = () => ((algo = $("algo").value), save("algo", algo), render());

const cells = Array.from({ length: CELLS }, (_, c) => {
  const b = document.createElement("button");
  b.onclick = () => ((selected = c), render());
  return b;
});
const head = (text) => Object.assign(document.createElement("span"), { className: "head", textContent: text });
$("board").append(head(""), ...Array.from({ length: 10 }, (_, i) => head(i + 1)));
for (let r = 0; r < 10; r++) $("board").append(head("ABCDEFGHIJ"[r]), ...cells.slice(r * 10, r * 10 + 10));

const record = (hit, sunk = null) => {
  history.push({ cell: selected, hit, sunk });
  save("history", history);
  selected = null;
  render();
};
$("answer").querySelector("[data-result=miss]").onclick = () => record(false);
$("answer").querySelector("[data-result=hit]").onclick = () => record(true);
$("undo").onclick = () => (history.pop(), save("history", history), (selected = null), render());
$("reset").onclick = () => ((history = []), save("history", history), (selected = null), render());

function render() {
  const picks = Object.entries(ALGORITHMS).map(([name, { make }]) => {
    const s = make(mulberry32(1));
    for (const { cell, hit, sunk } of history) s.observe(cell, hit, sunk);
    const done = history.filter((h) => h.sunk !== null).length === SHIPS.length;
    return { name, s, cell: done ? null : s.next() };
  });
  const current = picks.find((p) => p.name === algo);
  selected ??= current.cell;

  const shot = new Map(history.map((h) => [h.cell, h]));
  const sunkCells = sunkLines();
  const score = current.s.score;
  const max = score ? Math.max(...score) : 0;
  cells.forEach((b, c) => {
    const h = shot.get(c);
    b.className = [h ? (h.hit ? "hit" : "miss") : "", sunkCells.has(c) ? "sunk" : "", c === current.cell ? "pick" : "", c === selected && !h ? "selected" : ""].join(" ");
    b.style.setProperty("--heat", !h && max ? (0.85 * score[c]) / max : 0);
    b.disabled = !!h;
    b.ariaLabel = `${label(c)}${h ? (h.hit ? " hit" : " miss") : ""}`;
  });

  const afloat = SHIPS.map((_, i) => i).filter((i) => !history.some((h) => h.sunk === i));
  $("answer").hidden = selected === null || shot.has(selected);
  $("target").textContent = selected === null ? "" : label(selected);
  $("sinks").replaceChildren(...afloat.map((i) => {
    const b = Object.assign(document.createElement("button"), { textContent: `Sank ${SHIPS[i]}` });
    b.onclick = () => record(true, i);
    return b;
  }));
  $("count").textContent = `${history.length} shots, ${history.filter((h) => h.hit).length} hits, ${SHIPS.length - afloat.length} of ${SHIPS.length} sunk`;

  $("picks").replaceChildren(...picks.map(({ name, cell }) => {
    const tr = document.createElement("tr");
    tr.className = name === algo ? "current" : "";
    tr.innerHTML = `<td>${name}</td><td>${cell === null ? "—" : label(cell)}</td>`;
    return tr;
  }));
  const { belief } = picks.find((p) => p.name === "adaptive").s;
  $("belief").replaceChildren(...models.map((m, k) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${m.name}</td><td><span class="bar" style="width:${belief[k] * 8}rem"></span>${Math.round(belief[k] * 100)}%</td>`;
    return tr;
  }));
}

/** The cells of each sunk ship: the line of hits it must have been, when there's only one. */
function sunkLines() {
  const hits = new Set(history.filter((h) => h.hit).map((h) => h.cell));
  const out = new Set();
  for (const { cell, sunk } of history) {
    if (sunk === null) continue;
    const lines = shipPlacements(sunk).filter((line) => line.includes(cell) && line.every((c) => hits.has(c)));
    if (lines.length === 1) for (const c of lines[0]) out.add(c);
  }
  return out;
}

render();
