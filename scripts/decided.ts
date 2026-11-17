import { parseArgs } from "node:util";
import { Game, MAX_TURNS, mulberry32 } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { header } from "./table.ts";
import { chance } from "../src/strategies.ts";

const ROUNDS = 8;

/**
 * In `n` default-player games, after each round: how many games are still going, and in how many
 * of those the player ahead by `chance`, and the one furthest behind, goes on to win.
 */
export function decided(players: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const going = new Array<number>(ROUNDS).fill(0);
  const ahead = new Array<number>(ROUNDS).fill(0);
  const behind = new Array<number>(ROUNDS).fill(0);
  for (let i = 0; i < n; i++) {
    const game = new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), first: i % players });
    const order: number[][] = [];
    let result = game.run(undefined, players);
    for (let r = 0; r < ROUNDS && result.stalled && result.turns < MAX_TURNS; r++) {
      const c = game.players.map((q) => chance(game, q.seat));
      order.push([c.indexOf(Math.max(...c)), c.indexOf(Math.min(...c))]);
      result = game.run(undefined, game.turns + players);
    }
    if (result.stalled) result = game.run();
    order.forEach(([top, bottom], r) => {
      going[r]++;
      ahead[r] += +(result.winner === top);
      behind[r] += +(result.winner === bottom);
    });
  }
  return { going, ahead, behind };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "100000" } } });
  const n = Number(args.n);
  const counts = [2, 3, 4, 5];
  const results = [];
  for (const players of counts) results.push(await parallel<ReturnType<typeof decided>>(import.meta.url, "decided", [players], n));
  console.log(`${n} games each. After each round, the games still going, and of those, how often the player ahead wins (and the one furthest behind).\n`);
  header(["after round"], counts);
  const pct = (x: number, of: number) => `${((100 * x) / of).toFixed(0)}%`;
  for (let r = 0; r < ROUNDS; r++) console.log(`| ${r + 1} | ${results.map((x) => (x.going[r] < n / 100 ? "" : `${pct(x.going[r], n)}: ${pct(x.ahead[r], x.going[r])} (${pct(x.behind[r], x.going[r])})`)).join(" | ")} |`);
}
