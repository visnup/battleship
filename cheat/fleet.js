import { CELLS, label, mulberry32, shipPlacements, SHIPS } from "../src/board.ts";
import { uniform } from "../src/fleets.ts";
import { huntTarget, play, random } from "../src/shooters.ts";
import { ALGORITHMS } from "./algorithms.js";

const SHOOTERS = {
  ...Object.fromEntries(Object.entries(ALGORITHMS).map(([name, { make }]) => [name, make])),
  hunt: (rng) => huntTarget(rng),
  random: (rng) => random(rng),
};
const GAMES = 10;

const $ = (id) => document.getElementById(id);
let fleet = SHIPS.map(() => null);
try {
  const saved = JSON.parse(localStorage.getItem("fleet"));
  if (saved?.length === SHIPS.length) fleet = saved;
} catch {}
let ship = fleet.findIndex((p) => p === null);
let vertical = false;
let shown = "adaptive";
/** Shots per game for each shooter, and its first game. */
let results = {};
let run = 0;

const owners = () => {
  const owner = new Int8Array(CELLS).fill(-1);
  fleet.forEach((p, s) => p !== null && shipPlacements(s)[p].forEach((c) => (owner[c] = s)));
  return owner;
};

const cells = Array.from({ length: CELLS }, (_, c) => {
  const b = document.createElement("button");
  b.onclick = () => place(c);
  return b;
});
const head = (text) => Object.assign(document.createElement("span"), { className: "head", textContent: text });
$("board").append(head(""), ...Array.from({ length: 10 }, (_, i) => head(i + 1)));
for (let r = 0; r < 10; r++) $("board").append(head("ABCDEFGHIJ"[r]), ...cells.slice(r * 10, r * 10 + 10));

function place(cell) {
  const owner = owners();
  if (owner[cell] >= 0) {
    ship = owner[cell];
    fleet[ship] = null;
  } else if (ship >= 0) {
    const p = shipPlacements(ship).findIndex((cs) => cs[0] === cell && (cs[1] - cs[0] === 10) === vertical);
    if (p < 0 || shipPlacements(ship)[p].some((c) => owner[c] >= 0)) return;
    fleet[ship] = p;
    ship = fleet.findIndex((p) => p === null);
  }
  changed();
}

$("rotate").onclick = () => ((vertical = !vertical), render());
$("random").onclick = () => ((fleet = uniform(Math.random)), (ship = -1), changed());
$("clear").onclick = () => ((fleet = SHIPS.map(() => null)), (ship = 0), changed());

function changed() {
  try { localStorage.setItem("fleet", JSON.stringify(fleet)); } catch {}
  results = {};
  simulate(++run);
  render();
}

/** Plays every shooter against the fleet a game at a time, round by round, so the table fills in as it goes. */
async function simulate(id) {
  if (fleet.includes(null)) return;
  for (let seed = 1; seed <= GAMES; seed++)
    for (const [name, make] of Object.entries(SHOOTERS)) {
      await new Promise((r) => setTimeout(r));
      if (id !== run) return;
      const game = play(fleet, make(mulberry32(seed)));
      (results[name] ??= { shots: [], game }).shots.push(game.shots.length);
      render();
    }
}

function render() {
  const owner = owners();
  const game = results[shown]?.game;
  const order = new Map(game?.shots.map((s, i) => [s.cell, i + 1]));
  cells.forEach((b, c) => {
    const n = order.get(c);
    b.className = [owner[c] >= 0 ? "ship" : "", n ? (owner[c] >= 0 ? "hit" : "miss") : ""].join(" ");
    b.textContent = n ?? "";
    b.ariaLabel = `${label(c)}${owner[c] >= 0 ? ` ${SHIPS[owner[c]]}` : ""}${n ? `, shot ${n}` : ""}`;
  });

  $("ships").replaceChildren(...SHIPS.map((name, s) => {
    const b = Object.assign(document.createElement("button"), { textContent: name, className: s === ship ? "current" : fleet[s] !== null ? "placed" : "" });
    b.onclick = () => ((ship = s), render());
    return b;
  }));
  $("rotate").textContent = vertical ? "Down ↓" : "Across →";

  const rows = Object.entries(results)
    .map(([name, { shots }]) => ({ name, shots, mean: shots.reduce((a, b) => a + b) / shots.length }))
    .sort((a, b) => a.mean - b.mean);
  $("results").replaceChildren(...(fleet.includes(null) ? [] : rows.map(({ name, shots, mean }) => {
    const tr = document.createElement("tr");
    tr.className = name === shown ? "current" : "";
    tr.onclick = () => ((shown = name), render());
    tr.innerHTML = `<td>${name}</td><td><span class="bar" style="width:${mean / 25}rem"></span>${new Set([Math.min(...shots), Math.max(...shots)]).values().toArray().join("–")}</td><td>${mean.toFixed(1)}</td>`;
    return tr;
  })));
}

render();
simulate(run);
