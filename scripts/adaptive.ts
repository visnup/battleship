import { mulberry32, SHIPS } from "../src/board.ts";
import { PLACERS, placer } from "../src/fleets.ts";
import { collect } from "../src/parallel.ts";
import { parquet, query } from "../src/results.ts";
import { adaptive, density, model, play } from "../src/shooters.ts";
import { heat } from "./placements.ts";

/** The first `n` sampled fleets of each placer in `placements.parquet`, flat: a placement index per ship. */
export async function library(n: number) {
  const rows = await query<Record<string, number>>(`
    select placer, ${SHIPS.join(", ")} from ${parquet("placements")} where placer != 'naive' and fleet < ${n} order by placer, fleet`);
  return Object.fromEntries(PLACERS.map((name) => [name, Uint8Array.from(rows.filter((r) => r.placer === name).flatMap((r) => SHIPS.map((s) => r[s])))]));
}

let models: ReturnType<typeof model>[];

/**
 * A task: `n` fleets from each placer, shot at by plain density, density tuned to the true placer,
 * and the adaptive shooter with and without probing. Fleets are fresh, not from the library.
 */
export function games(heatMap: number[], lib: Record<string, Uint8Array>, seed: number, n: number) {
  models ??= PLACERS.map((name) => model(name, lib[name]));
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => PLACERS.flatMap((p, k) => {
    const fleet = placer(p, heatMap)(rng);
    return Object.entries({
      density: () => density(rng),
      tuned: () => density(rng, models[k].weights),
      adaptive: () => adaptive(rng, models),
      probing: () => adaptive(rng, models, true),
    }).map(([shooter, make]) => {
      const s = make();
      const { shots } = play(fleet, s);
      return { placer: p, shooter, shots: shots.length, belief: "belief" in s ? (s.belief as number[])[k] : null };
    });
  }));
}

if (import.meta.main) {
  const rows = await collect<{ placer: string; shooter: string; shots: number; belief: number | null }>(import.meta.url, "games", [await heat(), await library(50_000)], 2000);
  const by = Map.groupBy(rows, (r) => `${r.placer} ${r.shooter}`);
  for (const [key, rs] of by) {
    const xs = rs.map((r) => r.shots), m = xs.reduce((a, b) => a + b) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
    const b = rs[0].belief === null ? "" : ` belief in the truth at the end ${(rs.reduce((a, r) => a + r.belief!, 0) / rs.length).toFixed(2)}`;
    console.log(key, m.toFixed(2), `±${((1.96 * sd) / Math.sqrt(xs.length)).toFixed(2)}${b}`);
  }
}
