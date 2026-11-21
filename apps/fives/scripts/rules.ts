import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { defaultPolicy, Game, mulberry32, type Policy, type Rules, share, TARGET } from "../src/game.ts";
import { learned } from "../src/learned.ts";
import { STRATEGIES } from "../src/strategies.ts";

/** Each player's place chips for a hand's totals, with ties taking the lowest place they tie for or the highest. */
const placed = (totals: number[], tiesLow: boolean) =>
  totals.map((t) => {
    if (t > TARGET) return 0;
    const fine = totals.filter((q) => q <= TARGET);
    const place = tiesLow ? fine.filter((q) => q >= t).length : 1 + fine.filter((q) => q > t).length;
    return Math.max(0, totals.length - place);
  });

/**
 * Plays `n` games of `players` under `rules`, with `who` in seat `i % players` and the default
 * elsewhere: its wins, and how many hands would have scored differently under the other reading.
 */
export function rules(who: string, tiesLow: boolean, players: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  const make: Policy = who === "learned" ? learned("src/packed/model.ts") : STRATEGIES[who](seed);
  let wins = 0;
  let hands = 0;
  let differ = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const policies = Array.from({ length: players }, (_, j) => (j === seat ? make : defaultPolicy));
    const game = new Game({ players, rng: mulberry32(s), policies, rules: { tiesLow } satisfies Rules });
    wins += share(game.run().winners!, seat);
    for (const { totals } of game.scores) {
      hands++;
      differ += +(placed(totals, true).join() !== placed(totals, false).join());
    }
  }
  return { wins, hands, differ };
}

const combine = (a: ReturnType<typeof rules>, b: ReturnType<typeof rules>) => ({ wins: a.wins + b.wins, hands: a.hands + b.hands, differ: a.differ + b.differ });

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "20000" }, players: { type: "string", default: "3,4" }, who: { type: "string", default: "learned,face up" } } });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  console.log(`${n} games each: one player against the default in every other seat, with tied players taking the lowest place they tie for (the booklet) or the highest.\n`);
  console.log(`| player, ties take | ${counts.map((k) => `${k} players`).join(" | ")} | ${counts.map((k) => `hands it decides, ${k} players`).join(" | ")} |`);
  console.log(`| --- | ${counts.map(() => "--- | ---").join(" | ")} |`);
  for (const who of args.who.split(","))
    for (const tiesLow of [true, false]) {
      const rs = [];
      for (const players of counts) rs.push(await parallel<ReturnType<typeof rules>>(import.meta.url, "rules", [who, tiesLow, players], n, combine));
      const pct = (x: number, of: number) => `${((100 * x) / of).toFixed(1)}%`;
      console.log(`| ${who}, ${tiesLow ? "lowest" : "highest"} | ${rs.map((r) => pct(r.wins, n)).join(" | ")} | ${rs.map((r) => pct(r.differ, r.hands)).join(" | ")} |`);
    }
}
