import { mulberry32, SHIPS } from "../src/board.ts";
import { PLACERS, placer } from "../src/fleets.ts";
import { collect } from "kit/parallel.ts";
import { write } from "../src/results.ts";
import { lineup, model, play, type Shooter, SHOOTERS, shooter } from "../src/shooters.ts";
import { heat, library } from "./placements.ts";

let shooters: [string, (rng: () => number) => Shooter][];

/**
 * A task: `n` games, each a fleet from every placer shot at by every shooter but the slow posterior
 * ones. The tuned shooters know all 200,000 of each placer's fleets in `lib`, and adaptive the
 * first 100,000. Every shooter faces the same fleets.
 */
export function games(heatMap: number[], lib: Record<string, Uint8Array>, seed: number, n: number) {
  shooters ??= Object.entries(lineup(
    PLACERS.map((name) => model(name, lib[name].subarray(0, 100_000 * SHIPS.length))),
    PLACERS.map((name) => model(name, lib[name])),
  )).filter(([name]) => name !== "exact" && name !== "info").map(([name, { make }]) => [name, make]);
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => PLACERS.flatMap((p) => {
    const fleet = placer(p, heatMap)(rng);
    return shooters.map(([name, make]) => {
      const { shots, sunkAt } = play(fleet, make(rng));
      return { shooter: name, placer: p, shots: shots.length, first_hit: shots.findIndex((s) => s.hit) + 1, ...Object.fromEntries(SHIPS.map((s, i) => [s, sunkAt[i]])) };
    });
  }));
}

/** A task: every shot of `n` games against uniform fleets, by each plain shooter. */
export function shots(seed: number, n: number) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const fleet = placer("uniform", [])(rng);
    return SHOOTERS.flatMap((name) => play(fleet, shooter(name, rng)).shots.map((s, i) =>
      ({ shooter: name, shot: i + 1, cell: s.cell, hit: +s.hit, sunk: s.sunk === null ? null : SHIPS[s.sunk] })));
  });
}

if (import.meta.main) {
  await write("games", await collect(import.meta.url, "games", [await heat(), await library(200_000)], 50_000));
  await write("shots", await collect(import.meta.url, "shots", [], 10_000));
}
