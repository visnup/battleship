import { parseArgs } from "node:util";
import { type Card, DECK, name } from "../src/cards.ts";
import { Game, mulberry32 } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { header } from "./table.ts";

/** One of each kind of card. */
export const KINDS: Card[] = [...new Set(DECK)];

/**
 * Plays `n` default games of `players` twice from the same deal: as dealt, and with a random card
 * in seat `i % players`' opening hand swapped for a copy of `kind` from the undealt cards (deals
 * without one are skipped). Returns the wins each way, so the difference is what one more copy is
 * worth.
 */
export function swap(players: number, kind: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const card = KINDS[kind];
  let games = 0;
  let base = 0;
  let more = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(rng() * 2 ** 32);
    const seat = i % players;
    const plain = new Game({ players, rng: mulberry32(s), first: 0 });
    const swapped = new Game({ players, rng: mulberry32(s), first: 0 });
    const p = swapped.players[seat];
    const j = swapped.stock.indexOf(card);
    const out = p.hand.filter((c) => c !== card);
    if (j < 0 || !out.length) continue;
    const k = p.hand.indexOf(out[Math.floor(rng() * out.length)]);
    [p.hand[k], swapped.stock[j]] = [swapped.stock[j], p.hand[k]];
    games++;
    base += +(plain.run().winner === seat);
    more += +(swapped.run().winner === seat);
  }
  return { games, base, more };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "200000" }, players: { type: "string", default: "3,4,5,6" } } });
  const counts = args.players.split(",").map(Number);
  console.log(`${args.n} deals each: the points one more copy in an opening hand adds, in place of a random card.\n`);
  header(["card"], counts);
  for (let kind = 0; kind < KINDS.length; kind++) {
    const cells = [];
    for (const players of counts) {
      const r = await parallel<ReturnType<typeof swap>>(import.meta.url, "swap", [players, kind], Number(args.n));
      cells.push(`${((100 * (r.more - r.base)) / r.games).toFixed(1).replace("-", "−")}`);
    }
    console.log(`| ${name(KINDS[kind])} | ${cells.join(" | ")} |`);
  }
}
