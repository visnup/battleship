import { mulberry32, shipPlacements, SHIPS } from "../src/board.ts";
import { PLACERS, placer } from "../src/fleets.ts";
import { collect } from "../src/parallel.ts";
import { adaptive, density, type Model, model, play } from "../src/shooters.ts";
import { heat, library } from "./placements.ts";

const onEdge = (c: number) => c < 10 || c >= 90 || c % 10 === 0 || c % 10 === 9;

/** Hiders outside the five habits adaptive knows: `naive`, and the carrier and battleship on the rim with the rest anywhere. */
const strangers = {
  naive: () => placer("naive", []),
  "half edges": () => (rng: () => number) => {
    for (;;) {
      const fleet = placer("uniform", [])(rng);
      if ([0, 1].every((s) => shipPlacements(s)[fleet[s]].every(onEdge))) return fleet;
    }
  },
};

let models: Model[], big: Model[];

/**
 * A task: `n` fleets from each placer and stranger, shot at by density and variants of adaptive: as in the
 * matrix, probing, with a prior of mostly uniform, and with five times the sample fleets.
 */
export function games(heatMap: number[], lib: Record<string, Uint8Array>, seed: number, n: number) {
  models ??= PLACERS.map((name) => model(name, lib[name].subarray(0, 20_000 * SHIPS.length)));
  big ??= PLACERS.map((name) => model(name, lib[name]));
  const rng = mulberry32(seed);
  const hiders = [...PLACERS.map((p) => [p, placer(p, heatMap)] as const), ...Object.entries(strangers).map(([name, make]) => [name, make()] as const)];
  const variants = {
    adaptive: () => adaptive(rng, big),
    density: () => density(rng),
    "20,000 fleets": () => adaptive(rng, models),
    probing: () => adaptive(rng, big, { probe: true }),
    "mostly uniform": () => adaptive(rng, big, { prior: [0.6, 0.1, 0.1, 0.1, 0.1] }),
  };
  return Array.from({ length: n }, () => hiders.flatMap(([hider, place]) => {
    const fleet = place(rng);
    return Object.entries(variants).map(([shooter, make]) => ({ hider, shooter, shots: play(fleet, make()).shots.length }));
  }));
}

/** Prints each variant's average shots against each hider, and its difference from adaptive, with 95% intervals. */
if (import.meta.main) {
  const rows = await collect<{ hider: string; shooter: string; shots: number }>(import.meta.url, "games", [await heat(), await library(100_000)], 2000);
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
