import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { defaultPolicy, Game, mulberry32, type Policy } from "../src/game.ts";
import { features, learned, same, VERSION } from "../src/learned.ts";
import { parallel } from "kit/parallel.ts";
import { playout } from "../src/strategies.ts";

/**
 * Plays `n` default games of `players` and writes every decision of seat `i % players` with a
 * choice to `out/<players>p-<seed>.jsonl`: the board as numbers, each legal play's numbers and its
 * playout value on `deals` shared deals, for `hands` hands (from this one) and scored by `chance`, centered on
 * the decision's mean. With `play`, the learned player of that model plays the games, and with
 * `rollout`, everyone in the playouts.
 */
export function shard(players: number, deals: number, hands: number, out: string, play: string, roll: string, seed: number, n: number) {
  const rng = mulberry32(seed);
  const player = play ? learned(play) : defaultPolicy;
  const rollout = roll ? learned(roll) : defaultPolicy;
  const file = `${out}/${players}p-${String(seed).padStart(3, "0")}.jsonl`;
  writeFileSync(file, "");
  const { board, move } = features();
  let decisions = 0;
  for (let i = 0; i < n; i++) {
    const seat = i % players;
    const rows: string[] = [];
    const watcher: Policy = {
      play(game, p) {
        const choice = player.play(game, p);
        if (p.seat !== seat) return choice;
        const options = game.legal(p);
        if (options.length < 2) return choice;
        const pick = defaultPolicy.play(game, p);
        const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
        const values = options.map((m) => playout(game, p, m, seeds, rollout, hands) / deals);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const b = board(game, p);
        rows.push(JSON.stringify({ game: i, v: VERSION, board: b, moves: options.map((m) => move(game, p, m, same(m, pick))), values: values.map((v) => +(v - mean).toFixed(5)) }));
        return choice;
      },
    };
    new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watcher }).run();
    if (rows.length) appendFileSync(file, rows.join("\n") + "\n");
    decisions += rows.length;
  }
  return decisions;
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: {
      games: { type: "string", default: "4000" },
      deals: { type: "string", default: "32" },
      hands: { type: "string", default: "1" },
      players: { type: "string", default: "3,4" },
      out: { type: "string", default: "dataset/data" },
      play: { type: "string", default: "" },
      rollout: { type: "string", default: "" },
    },
  });
  mkdirSync(args.out, { recursive: true });
  for (const players of args.players.split(",").map(Number)) {
    const t = performance.now();
    const decisions = await parallel<number>(import.meta.url, "shard", [players, Number(args.deals), Number(args.hands), args.out, args.play, args.rollout], Number(args.games));
    console.log(`${new Date().toTimeString().slice(0, 5)} ${players} players: ${args.games} games, ${decisions} decisions, ${((performance.now() - t) / 60000).toFixed(1)} min`);
  }
}
