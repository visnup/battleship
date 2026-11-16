import { parseArgs } from "node:util";
import { DECK } from "../src/cards.ts";
import { Game, mulberry32, name } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";

const KINDS = [...new Map(DECK.map((c) => [JSON.stringify(c), c])).values()];

/**
 * Plays `n` deals of `players`, each as dealt and again once per kind of card, with one copy of
 * that card moved from the draw pile into one player's opening hand (a different seat each deal).
 * Returns that player's wins as dealt and with each extra card, and how many deals had one to move.
 */
export function values(players: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  let base = 0;
  const wins = KINDS.map(() => 0);
  const deals = KINDS.map(() => 0);
  const baseWins = KINDS.map(() => 0);
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const won = +(new Game({ players, rng: mulberry32(s), first: 0 }).run().winner === seat);
    base += won;
    KINDS.forEach((kind, k) => {
      const game = new Game({ players, rng: mulberry32(s), first: 0 });
      const at = game.draw.findIndex((c) => JSON.stringify(c) === JSON.stringify(kind));
      if (at < 0) return;
      game.players[seat].hand.push(...game.draw.splice(at, 1));
      wins[k] += +(game.run().winner === seat);
      baseWins[k] += won;
      deals[k]++;
    });
  }
  return { base, wins, baseWins, deals };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "50000" } } });
  const n = Number(args.n);
  const counts = [2, 3, 4, 5];
  const results = [];
  for (const players of counts) results.push(await parallel<ReturnType<typeof values>>(import.meta.url, "values", [players], n));
  console.log(`${n} deals each: how many more games a player wins, in points, with one extra card in its opening hand.\n`);
  console.log(`| card | $M | ${counts.map((k) => `${k} players`).join(" | ")} |`);
  console.log(`| --- | --- | ${counts.map(() => "---").join(" | ")} |`);
  const gain = (r: (typeof results)[number], k: number) => (100 * (r.wins[k] - r.baseWins[k])) / r.deals[k];
  const order = KINDS.map((_, k) => k).sort((a, b) => gain(results[2], b) - gain(results[2], a));
  for (const k of order)
    console.log(`| ${name(KINDS[k])} | ${KINDS[k].value} | ${results.map((r) => `${gain(r, k) >= 0 ? "+" : "−"}${Math.abs(gain(r, k)).toFixed(1)}`).join(" | ")} |`);
}
