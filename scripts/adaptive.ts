import { mulberry32, shipPlacements, SHIPS } from "../src/board.ts";
import { dialed, PLACERS, placer } from "../src/fleets.ts";
import { collect, parallel } from "../src/parallel.ts";
import { adaptive, density, type Model, model, play } from "../src/shooters.ts";
import { heat, library } from "./placements.ts";

const EDGES = [0, 0.25, 0.5, 0.75, 1];
const TOUCHES = ["spread", "any", "clustered"] as const;
const DIALS = EDGES.flatMap((edge) => TOUCHES.map((touch) => ({ name: `rim ${edge} ${touch}`, place: dialed(edge, touch) })));
const onEdge = (c: number) => c < 10 || c >= 90 || c % 10 === 0 || c % 10 === 9;

/** Hiders outside the five habits: `naive`, a few dial settings off the grid, and `half edges`, the carrier and battleship on the rim. */
const strangers = {
  naive: () => placer("naive", []),
  "half edges": () => (rng: () => number) => {
    for (;;) {
      const fleet = placer("uniform", [])(rng);
      if ([0, 1].every((s) => shipPlacements(s)[fleet[s]].every(onEdge))) return fleet;
    }
  },
  "rim 0.4 clustered": () => dialed(0.4, "clustered"),
  "rim 0.6 spread": () => dialed(0.6, "spread"),
};
/** A task: `n` fleets from each dial setting, flat, a placement index per ship. */
export function dials(seed: number, n: number) {
  const rng = mulberry32(seed);
  return Object.fromEntries(DIALS.map(({ name, place }) => [name, Array.from({ length: n }, () => place(rng)).flat()]));
}

let models: Model[], big: Model[], grid: Model[];

/**
 * A task: `n` fleets from each placer and stranger, shot at by density and variants of adaptive:
 * as in the matrix, with a fifth of the sample fleets, probing, with a prior of mostly uniform, and
 * knowing the dial grid plus cold in place of the five habits.
 */
export function games(heatMap: number[], lib: Record<string, Uint8Array>, dialLib: Record<string, Uint8Array>, seed: number, n: number) {
  models ??= PLACERS.map((name) => model(name, lib[name].subarray(0, 20_000 * SHIPS.length)));
  big ??= PLACERS.map((name) => model(name, lib[name]));
  grid ??= [...DIALS.map(({ name }) => model(name, dialLib[name])), big[PLACERS.indexOf("cold")]];
  const rng = mulberry32(seed);
  const hiders = [...PLACERS.map((p) => [p, placer(p, heatMap)] as const), ...Object.entries(strangers).map(([name, make]) => [name, make()] as const)];
  const variants = {
    adaptive: () => adaptive(rng, big),
    density: () => density(rng),
    "20,000 fleets": () => adaptive(rng, models),
    probing: () => adaptive(rng, big, { probe: true }),
    "mostly uniform": () => adaptive(rng, big, { prior: [0.6, 0.1, 0.1, 0.1, 0.1] }),
    dials: () => adaptive(rng, grid),
  };
  return Array.from({ length: n }, () => hiders.flatMap(([hider, place]) => {
    const fleet = place(rng);
    return Object.entries(variants).map(([shooter, make]) => ({ hider, shooter, shots: play(fleet, make()).shots.length }));
  }));
}

/** Prints each variant's average shots against each hider, and its difference from adaptive, with 95% intervals. */
if (import.meta.main) {
  const dialLib = await parallel<Record<string, number[]>>(import.meta.url, "dials", [], 100_000, (a, b) =>
    Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.concat(b[k])])));
  const rows = await collect<{ hider: string; shooter: string; shots: number }>(import.meta.url, "games", [await heat(), await library(100_000), Object.fromEntries(Object.entries(dialLib).map(([k, v]) => [k, Uint8Array.from(v)]))], 2000);
  const ci = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
    return `${m.toFixed(2)} ±${((1.96 * sd) / Math.sqrt(xs.length)).toFixed(2)}`;
  };
  for (const [hider, rs] of Map.groupBy(rows, (r) => r.hider)) {
    const shots = (s: string) => rs.filter((r) => r.shooter === s).map((r) => r.shots);
    const base = shots("adaptive");
    console.log(hider, "adaptive", ci(base), ...[...new Set(rs.map((r) => r.shooter))].slice(1).map((s) => `| ${s} ${ci(shots(s).map((x, i) => x - base[i]))}`));
  }
}
