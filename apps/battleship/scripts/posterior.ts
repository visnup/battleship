import { mulberry32 } from "../src/board.ts";
import { placer } from "../src/fleets.ts";
import { collect } from "../src/parallel.ts";
import { density, play, posterior } from "../src/shooters.ts";

/** A task: `n` uniform fleets, each shot at by density and by both posterior shooters. */
export function games(samples: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const fleet = placer("uniform", [])(rng);
    return [
      ["density", () => density(rng)],
      ["exact", () => posterior(rng, "hit", samples)],
      ["info", () => posterior(rng, "info", samples)],
    ].map(([shooter, make]) => {
      const { shots } = play(fleet, make());
      return { shooter, shots: shots.length, first_hit: shots.findIndex((s) => s.hit) + 1 };
    });
  });
}

/** Prints each shooter's average shots and first hit, and each pair's difference, with 95% intervals. */
if (import.meta.main) {
  const rows = await collect<{ shooter: string; shots: number; first_hit: number }>(import.meta.url, "games", [1000], 2000);
  const by = Map.groupBy(rows, (r) => r.shooter);
  const ci = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
    return `${m.toFixed(2)} ±${((1.96 * sd) / Math.sqrt(xs.length)).toFixed(2)}`;
  };
  for (const [name, rs] of by) console.log(name, "shots", ci(rs.map((r) => r.shots)), "first hit", ci(rs.map((r) => r.first_hit)));
  const shots = (name: string) => by.get(name)!.map((r) => r.shots);
  for (const [a, b] of [["exact", "density"], ["info", "density"], ["info", "exact"]])
    console.log(`${a} − ${b}`, ci(shots(a).map((x, i) => x - shots(b)[i])));
}
