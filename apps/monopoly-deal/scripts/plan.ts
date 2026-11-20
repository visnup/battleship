import { parseArgs } from "node:util";
import type { Policy } from "../src/game.ts";
import { learned, ranked } from "../src/learned.ts";
import { parallel } from "../src/parallel.ts";
import { headToHead, playouts } from "../src/strategies.ts";
import { header } from "./table.ts";

// Whether planning a whole turn beats picking each move on its own: the learned player, against
// one that tries the model's top `k` moves, finishes the turn as the learned player on `n`
// reshuffles of what it can't see, and makes the move whose end of turn `chance` likes best.

const turn = (k: number, n: number) => (seed: number) => {
  const rank = ranked();
  return { ...learned(), move: playouts(n, seed, learned(), 2, 0, (game, p, left) => rank(game, p, left).slice(0, k)).move } as Policy;
};

const PLAYERS: Record<string, (seed: number) => Policy> = {
  learned: () => learned(),
  "top 3, to the end of the turn": turn(3, 8),
  "top 5, to the end of the turn": turn(5, 8),
};

export const run = (who: string, players: number, seed: number, n: number) => headToHead(PLAYERS[who], players, seed, n);

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "20000" }, players: { type: "string", default: "2,3,4,5" } } });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  console.log(`${n} games each against the default player in every other seat.\n`);
  header(["player"], counts, true);
  for (const who of Object.keys(PLAYERS)) {
    const cells = [];
    for (const players of counts) cells.push(`${((100 * (await parallel<ReturnType<typeof run>>(import.meta.url, "run", [who, players], n)).wins) / n).toFixed(1)}%`);
    console.log(`| ${who} | ${cells.join(" | ")} |`);
  }
}
