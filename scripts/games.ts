import { mulberry32, SHIPS, shipPlacements } from "../src/board.ts";
import { PLACERS, placer } from "../src/fleets.ts";
import { collect } from "../src/parallel.ts";
import { parquet, query, write } from "../src/results.ts";
import { adaptive, density, type Model, model, play, SHOOTERS, shooter } from "../src/shooters.ts";
import { heat, library } from "./placements.ts";

type Weights = Record<string, number[][]>;

/**
 * How often each placer puts each ship at each placement, from `placements.ts`, relative to the
 * average placement: what a shooter who knows your habits would weigh placements by.
 */
export async function habits(): Promise<Weights> {
  const rows = await query<{ placer: string; ship: string; p: number; n: number }>(`
    with u as (unpivot ${parquet("placements")} on ${SHIPS.join(", ")} into name ship value p)
    select placer, ship, p, count(*)::int n from u group by all`);
  return Object.fromEntries(PLACERS.map((name) => [name, SHIPS.map((ship, s) => {
    const counts = shipPlacements(s).map(() => 1);
    for (const r of rows) if (r.placer === name && r.ship === ship) counts[r.p] += r.n;
    const mean = counts.reduce((a, b) => a + b) / counts.length;
    return counts.map((c) => c / mean);
  })]));
}

let models: Model[];

/**
 * A task: `n` games, each a fleet from every placer shot at by every shooter, plus a density
 * shooter tuned to each placer's habits ("tuned edges") and one that works out the habit from
 * `lib`'s sample fleets ("adaptive"). Every shooter faces the same fleets.
 */
export function games(heatMap: number[], weights: Weights, lib: Record<string, Uint8Array>, seed: number, n: number) {
  models ??= PLACERS.map((name) => model(name, lib[name]));
  const rng = mulberry32(seed);
  const shooters = [...SHOOTERS.map((name) => [name, () => shooter(name, rng)] as const),
    ...PLACERS.map((name) => [`tuned ${name}`, () => density(rng, weights[name])] as const),
    ["adaptive", () => adaptive(rng, models)] as const];
  return Array.from({ length: n }, () => PLACERS.flatMap((p) => {
    const fleet = placer(p, heatMap)(rng);
    return shooters.map(([name, make]) => {
      const { shots, sunkAt } = play(fleet, make());
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
  await write("games", await collect(import.meta.url, "games", [await heat(), await habits(), await library(20_000)], 50_000));
  await write("shots", await collect(import.meta.url, "shots", [], 10_000));
}
