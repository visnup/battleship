import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { defaultPolicy, Game, moves, mulberry32, type Policy } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { encode, key, observe } from "../src/replay.ts";
import { playout } from "../src/strategies.ts";

const OUT = new URL("../dataset/data/", import.meta.url);

/**
 * Plays `n` default games of `players` and writes every move decision with a choice to a shard:
 * what the mover sees, each legal move's two-round playout value on `deals` shared deals, the
 * default's pick, and whether the mover went on to win.
 */
export function shard(players: number, deals: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const file = new URL(`${players}p-${String(seed).padStart(3, "0")}.jsonl`, OUT);
  writeFileSync(file, "");
  let decisions = 0;
  for (let i = 0; i < n; i++) {
    const gameSeed = Math.floor(rng() * 2 ** 32);
    const rows: Record<string, unknown>[] = [];
    const watcher: Policy = {
      ...defaultPolicy,
      move(game, p, left) {
        const choice = defaultPolicy.move(game, p, left);
        const options = [null, ...moves(game, p, left)];
        const keys = options.map((m) => key(encode(game, p, m)));
        let pick = keys.indexOf(key(encode(game, p, choice)));
        if (pick < 0) pick = options.push(choice) - 1;
        if (options.length > 1) {
          const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
          const values = options.map((m) => seeds.map((s) => playout(game, p, m, [s], defaultPolicy, 2 * players)));
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
        return choice;
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
  const [games, deals] = process.argv.slice(2).map(Number);
  mkdirSync(OUT, { recursive: true });
  for (const players of [2, 3, 4, 5]) {
    const t = performance.now();
    const decisions = await parallel<number>(import.meta.url, "shard", [players, deals], games);
    console.log(`${players} players: ${games} games, ${decisions} decisions, ${((performance.now() - t) / 60000).toFixed(1)} min`);
  }
}
