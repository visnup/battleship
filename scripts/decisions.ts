import { parseArgs } from "node:util";
import { defaultPolicy, Game, type Move, moves, mulberry32, name, type Policy } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { encode, key } from "../src/replay.ts";
import { playout } from "../src/strategies.ts";
import { report } from "./midturn.ts";

/** What kind of move `move` is, for grouping. */
export function label(move: Move | null): string {
  if (!move) return "end turn";
  const card = name(move.card);
  switch (move.type) {
    case "bank":
      return move.card.kind === "money" ? "bank money" : `bank ${card}`;
    case "place":
      return move.card.kind === "action" ? `build ${card}` : `place ${move.card.kind}`;
    case "rent":
      return `rent${move.card.kind === "rent" && move.card.colors === "any" ? " (any)" : ""}${move.doubles.length ? ` ×${2 ** move.doubles.length}` : ""}`;
    case "action":
      return card;
  }
}

/**
 * Plays `n` games with the default player everywhere, and at each of seat 0's decisions plays out every
 * legal move on 40 shared deals, two rounds each like `playouts`. When another move beats the default player's, both are played out
 * again on 200 fresh deals, also for two rounds, and the row records how much the other move gains there, in wins.
 */
export function decisions(players: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  const rows: { mine: string; best: string; gain: number }[] = [];
  let count = 0;
  const watcher: Policy = {
    ...defaultPolicy,
    move(game, p, left) {
      const choice = defaultPolicy.move(game, p, left);
      const options = [null, ...moves(game, p, left)];
      if (options.length === 1) return choice;
      count++;
      const draw = (k: number) => Array.from({ length: k }, () => Math.floor(seeds() * 2 ** 32));
      const first = draw(40);
      const scored = options.map((m) => ({ m, wins: playout(game, p, m, first, defaultPolicy, 2 * players) }));
      const best = scored.reduce((a, b) => (b.wins > a.wins ? b : a)).m;
      if (key(encode(game, p, best)) !== key(encode(game, p, choice))) {
        const fresh = draw(200);
        const gain = (playout(game, p, best, fresh, defaultPolicy, 2 * players) - playout(game, p, choice, fresh, defaultPolicy, 2 * players)) / fresh.length;
        rows.push({ mine: label(choice), best: label(best), gain });
      }
      return choice;
    },
  };
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const policies = Array.from({ length: players }, (_, j) => (j === 0 ? watcher : defaultPolicy));
    new Game({ players, rng: mulberry32(s), policies, first: i % players }).run();
  }
  return { count, rows };
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "256" }, players: { type: "string", default: "5" }, min: { type: "string", default: "20" } },
  });
  const result = await parallel<ReturnType<typeof decisions>>(import.meta.url, "decisions", [Number(args.players)], Number(args.n), (a, b) => ({ count: a.count + b.count, rows: a.rows.concat(b.rows) }));
  report(result, "decisions", Number(args.n), Number(args.players), Number(args.min));
}
