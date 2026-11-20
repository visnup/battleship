import { parseArgs } from "node:util";
import { COLOR_NAMES, fullColors, Game, mulberry32 } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";
import { header } from "./table.ts";

/** At the end of `n` games, which colors the winner's sets were, and the full sets losers held. */
export function colors(players: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const won = COLOR_NAMES.map(() => 0);
  const lost = COLOR_NAMES.map(() => 0);
  let losers = 0;
  for (let i = 0; i < n; i++) {
    const game = new Game({ players, rng });
    const { winner } = game.run();
    if (winner === null) continue;
    for (const p of game.players) {
      const tally = p.seat === winner ? won : lost;
      for (const c of fullColors(game, p)) tally[COLOR_NAMES.indexOf(c)]++;
      losers += +(p.seat !== winner);
    }
  }
  return { won, lost, losers };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "100000" } } });
  const n = Number(args.n);
  const counts = [2, 3, 4, 5];
  const results = [];
  for (const players of counts) results.push(await parallel<ReturnType<typeof colors>>(import.meta.url, "colors", [players], n));
  console.log(`${n} games each: how often each color is one of the winner's full sets, and (in parentheses) a loser's at the end.\n`);
  header(["color"], counts);
  const pct = (x: number, of: number) => `${((100 * x) / of).toFixed(0)}%`;
  COLOR_NAMES.forEach((c, i) => console.log(`| ${c} | ${results.map((r) => `${pct(r.won[i], n)} (${pct(r.lost[i], r.losers)})`).join(" | ")} |`));
}
