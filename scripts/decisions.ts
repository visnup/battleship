import { parseArgs } from "node:util";
import { defaultPolicy, Game, type Move, mulberry32, name, type Policy } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { moves, playout } from "../src/strategies.ts";

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

const key = (m: Move | null) =>
  m && JSON.stringify([m.type, m.card, "color" in m && m.color, m.target, m.type === "rent" && m.doubles.length, m.type === "action" && [m.take?.card, m.give?.card]]);

/**
 * Plays `n` games with the default player everywhere, and at each of seat 0's decisions plays out every
 * legal move on 40 shared deals, two rounds each like `playouts`. When another move beats the default player's, both are played out
 * again on 200 fresh deals, and the row records how much the other move gains there, in wins.
 */
export function decisions(players: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  const rows: { mine: string; playouts: string; gain: number }[] = [];
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
      if (key(best) !== key(choice)) {
        const fresh = draw(200);
        const gain = (playout(game, p, best, fresh) - playout(game, p, choice, fresh)) / fresh.length;
        rows.push({ mine: label(choice), playouts: label(best), gain });
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
  const { count, rows } = await parallel<ReturnType<typeof decisions>>(import.meta.url, "decisions", [Number(args.players)], Number(args.n), (a, b) => ({
    count: a.count + b.count,
    rows: a.rows.concat(b.rows),
  }));
  const groups = Map.groupBy(rows, (r) => `${r.mine} → ${r.playouts}`);
  const total = rows.reduce((s, r) => s + r.gain, 0);
  console.log(`${count} decisions in ${args.n} games of ${args.players}; playouts chose another move in ${rows.length}.`);
  console.log(`Their gain, rechecked on fresh deals, sums to ${(total / Number(args.n)).toFixed(3)} wins a game.\n`);
  console.log("| default → playouts | times | gain each | gain a game |");
  console.log("| --- | --- | --- | --- |");
  for (const [group, rs] of [...groups].sort((a, b) => b[1].reduce((s, r) => s + r.gain, 0) - a[1].reduce((s, r) => s + r.gain, 0))) {
    if (rs.length < Number(args.min)) continue;
    const sum = rs.reduce((s, r) => s + r.gain, 0);
    console.log(`| ${group} | ${rs.length} | ${((100 * sum) / rs.length).toFixed(1)} | ${((100 * sum) / Number(args.n)).toFixed(2)} |`);
  }
}
