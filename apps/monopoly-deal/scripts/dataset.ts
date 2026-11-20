import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { defaultPolicy, Game, moves, mulberry32, type Policy } from "../src/game.ts";
import { discarded, learned, paid, ranked, said } from "../src/learned.ts";
import { parallel } from "kit/parallel.ts";
import { encode, key, observe } from "../src/replay.ts";
import { playout } from "../src/strategies.ts";

/** A shard's file name, less its extension: `5p-012`. */
export const shardName = (players: number, seed: number) => `${players}p-${String(seed).padStart(3, "0")}`;

/**
 * Plays `n` games of `players` and writes every move decision with a choice to a shard in `out`:
 * what the mover sees, each legal move's two-round playout value on `deals` shared deals, the
 * default's pick, and whether the mover went on to win. With `model`, the learned player plays
 * the games, and with `top` too, only its `top` moves, the default's pick and one other at random
 * are played out, and with `label` only that fraction of decisions is. With `pay`, the mover
 * pays, says no and discards by the learned models in the playouts. With `strong`, everyone in the playouts is the
 * learned player of that model, so each label asks which move is best if good players play on.
 */
export function shard(players: number, deals: number, model: string, top: number, pay: boolean, label: number, out: string, strong: string, seed: number, n: number) {
  const rng = mulberry32(seed);
  const rank = model ? ranked(model) : null;
  const field = strong ? learned(strong) : defaultPolicy;
  const rollout = strong ? field : pay ? { ...defaultPolicy, pay: paid(), sayNo: said(), discard: discarded() } : defaultPolicy;
  const file = `${out}/${shardName(players, seed)}.jsonl`;
  writeFileSync(file, "");
  let decisions = 0;
  for (let i = 0; i < n; i++) {
    const gameSeed = Math.floor(rng() * 2 ** 32);
    const rows: Record<string, unknown>[] = [];
    const watcher: Policy = {
      ...defaultPolicy,
      move(game, p, left) {
        const choice = defaultPolicy.move(game, p, left);
        const order = rank?.(game, p, left);
        let options = [null, ...moves(game, p, left)];
        const keys = options.map((m) => key(encode(game, p, m)));
        let pick = keys.indexOf(key(encode(game, p, choice)));
        if (pick < 0) {
          pick = options.push(choice) - 1;
          keys.push(key(encode(game, p, choice)));
        }
        if (order && top) {
          const keep = new Set([...order.slice(0, top).map((m) => key(encode(game, p, m))), keys[pick]]);
          const rest = keys.filter((k) => !keep.has(k));
          if (rest.length) keep.add(rest[Math.floor(rng() * rest.length)]);
          const kept = keys.flatMap((k, j) => (keep.has(k) ? [j] : []));
          options = kept.map((j) => options[j]);
          pick = kept.indexOf(pick);
        }
        if (options.length > 1 && (label >= 1 || rng() < label)) {
          const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
          const values = options.map((m) => seeds.map((s) => playout(game, p, m, [s], rollout, 2 * players, field)));
          rows.push({
            game: `${players}p-${seed}-${i}`,
            game_seed: gameSeed,
            players,
            seat: p.seat,
            ...observe(game, p, left),
            moves: options.map((m, j) => {
              const v = values[j];
              const mean = v.reduce((a, b) => a + b, 0) / deals;
              const se = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (deals - 1) / deals);
              return { ...encode(game, p, m), value: mean, se };
            }),
            default: pick,
          });
        }
        return order ? order[0] : choice;
      },
    };
    const { winner } = new Game({ players, rng: mulberry32(gameSeed), policies: watcher, first: i % players }).run();
    for (const r of rows) r.won = winner === null ? null : winner === r.seat;
    appendFileSync(file, rows.map((r) => JSON.stringify(r) + "\n").join(""));
    decisions += rows.length;
  }
  return decisions;
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: {
      games: { type: "string", default: "10000" },
      deals: { type: "string", default: "32" },
      model: { type: "string", default: "" },
      top: { type: "string", default: "0" },
      pay: { type: "boolean", default: false },
      label: { type: "string", default: "1" },
      players: { type: "string", default: "2,3,4,5" },
      out: { type: "string", default: "dataset/data" },
      strong: { type: "string", default: "" },
    },
  });
  mkdirSync(args.out, { recursive: true });
  const out = args.out;
  for (const players of args.players.split(",").map(Number)) {
    const t = performance.now();
    const decisions = await parallel<number>(import.meta.url, "shard", [players, Number(args.deals), args.model, Number(args.top), args.pay, Number(args.label), out, args.strong], Number(args.games));
    console.log(`${players} players: ${args.games} games, ${decisions} decisions, ${((performance.now() - t) / 60000).toFixed(1)} min`);
  }
}
