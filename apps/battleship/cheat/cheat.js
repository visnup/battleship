import { CELLS, label, mulberry32, shipPlacements, SHIPS } from "../src/board.ts";
import { ALGORITHMS, models } from "./algorithms.js";

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
  const can = selected === null ? null : options(selected, afloat, sunkCells);
  $("answer").querySelector("[data-result=hit]").disabled = !can?.hit;
  $("sinks").replaceChildren(...afloat.map((i) => {
    const b = Object.assign(document.createElement("button"), { textContent: `Sank ${SHIPS[i]}`, disabled: !can?.sinks.has(i) });
    b.onclick = () => record(true, i);
    return b;
  }));
  $("count").textContent = `${history.length} shots, ${history.filter((h) => h.hit).length} hits, ${SHIPS.length - afloat.length} of ${SHIPS.length} sunk`;
  $("mistake").hidden = picks.find((p) => p.name === "exact").s.fits !== false;

  const { belief } = picks.find((p) => p.name === "adaptive").s;
  $("picks").replaceChildren(...picks.map(({ name, cell }) => {
    const tr = document.createElement("tr");
    tr.className = name === algo ? "current" : "";
    const k = models.findIndex((m) => name === `tuned ${m.name}`);
    const odds = k < 0 ? "" : `<span class="bar" style="width:${belief[k] * 6}rem"></span>${Math.round(belief[k] * 100)}%`;
    tr.innerHTML = `<td>${name}</td><td>${odds}</td><td>${cell === null ? "—" : label(cell)}</td>`;
    return tr;
  }));
}

/**
 * Which answers `cell` could get. A hit needs a ship afloat that could cross it without crossing a
 * miss or a sunk ship and still have cells left; sinking a ship needs a line of hits it could
 * have been that this shot completes. Answers that only fail on the whole fleet get past this,
 * and set off the warning instead.
 */
function options(cell, afloat, claimed) {
  const shot = new Map(history.map((h) => [h.cell, h.hit]));
  const lines = (s) => shipPlacements(s).filter((cs) => cs.includes(cell) && cs.every((c) => c === cell || (shot.get(c) !== false && !claimed.has(c))));
  return {
    hit: afloat.some((s) => lines(s).some((cs) => cs.some((c) => c !== cell && !shot.has(c)))),
    sinks: new Set(afloat.filter((s) => lines(s).some((cs) => cs.every((c) => c === cell || shot.get(c))))),
  };
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
