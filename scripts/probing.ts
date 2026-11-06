import { mulberry32 } from "../src/board.ts";
import { PLACERS, placer } from "../src/fleets.ts";
import { collect } from "../src/parallel.ts";
import { adaptive, type Model, model, play } from "../src/shooters.ts";
import { heat, library } from "./placements.ts";

let models: Model[];

/** A task: `n` fleets from each placer, shot at by the adaptive shooter with and without probing. */
export function games(heatMap: number[], lib: Record<string, Uint8Array>, seed: number, n: number) {
  models ??= PLACERS.map((name) => model(name, lib[name]));
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => PLACERS.flatMap((p) => {
    const fleet = placer(p, heatMap)(rng);
    return [false, true].map((probe) => ({ placer: p, shooter: probe ? "probing" : "adaptive", shots: play(fleet, adaptive(rng, models, probe)).shots.length }));
  }));
}

/** Prints each placer's average shots for both, and probing's cost, with 95% intervals. */
if (import.meta.main) {
  const rows = await collect<{ placer: string; shooter: string; shots: number }>(import.meta.url, "games", [await heat(), await library(20_000)], 2000);
  const ci = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
    return `${m.toFixed(2)} ±${((1.96 * sd) / Math.sqrt(xs.length)).toFixed(2)}`;
  };
  for (const p of PLACERS) {
    const shots = (s: string) => rows.filter((r) => r.placer === p && r.shooter === s).map((r) => r.shots);
    const a = shots("adaptive"), b = shots("probing");
    console.log(p, "adaptive", ci(a), "probing", ci(b), "cost", ci(b.map((x, i) => x - a[i])));
  }
}
