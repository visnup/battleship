import { parseArgs } from "node:util";
import { defaultPolicy, Game, mulberry32, type Policy } from "../src/game.ts";
import { learned, ranked } from "../src/learned.ts";
import { parallel } from "../src/parallel.ts";
import { playouts } from "../src/strategies.ts";

const player = (strategy: string, model: string, seed: number): Policy => {
  if (strategy === "learned") return learned(model);
  const rank = ranked(model);
  return playouts(160, seed, defaultPolicy, 2, 2, (g, p, l) => rank(g, p, l).slice(0, 5));
};

/**
 * Two models, as `strategy`, each in the same seat of the same deals against the default player,
 * or against the learned player of `field`: wins for each and the squared differences, so the
 * gap (`b` less `a`) has the paired error.
 */
export function pair(strategy: string, a: string, b: string, field: string, players: number, seed: number, n: number) {
  const other = field ? learned(field) : defaultPolicy;
  const seeds = mulberry32(seed);
  let wa = 0;
  let wb = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const win = (model: string) => {
      const policies = Array.from({ length: players }, (_, j) => (j === seat ? player(strategy, model, s) : other));
      return +(new Game({ players, rng: mulberry32(s), policies, first: 0 }).run().winner === seat);
    };
    const x = win(a);
    const y = win(b);
    wa += x;
    wb += y;
    sq += (x - y) ** 2;
  }
  return { wa, wb, sq };
}

if (import.meta.main) {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: { n: { type: "string", default: "20000" }, players: { type: "string", default: "2,3,4,5" }, strategy: { type: "string", default: "learned" }, field: { type: "string", default: "" } },
  });
  const [a, b] = positionals;
  const n = Number(args.n);
  for (const players of args.players.split(",").map(Number)) {
    const t = performance.now();
    const { wa, wb, sq } = await parallel<ReturnType<typeof pair>>(import.meta.url, "pair", [args.strategy, a, b, args.field, players], n);
    const d = (wb - wa) / n;
    const se = Math.sqrt((sq / n - d * d) / n);
    const name = (f: string) => f.split("/").pop();
    console.log(
      `${args.strategy}${args.field ? ` against ${name(args.field)}` : ""}, ${players} players: ${name(a)} ${((100 * wa) / n).toFixed(1)}%, ${name(b)} ${((100 * wb) / n).toFixed(1)}%,` +
        ` ${(100 * d).toFixed(2)} ± ${(200 * se).toFixed(2)} points, ${n} deals, ${((performance.now() - t) / 1000).toFixed(0)} s`,
    );
  }
}
