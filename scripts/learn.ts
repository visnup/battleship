import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { board, type Enc, learned, MODEL, move } from "../src/learned.ts";
import { parallel } from "../src/parallel.ts";
import { headToHead } from "../src/strategies.ts";

const DATA = new URL("../dataset/data/", import.meta.url);
const FEATURES = new URL("../dataset/features/", import.meta.url);

/**
 * Features for shard `seed` of `players`, for `learn.py`: rows of floats, then each row's value
 * and the default's pick as 0 or 1, and each decision's move count.
 */
export function extract(players: number, seed: number) {
  const lines = readFileSync(new URL(`${players}p-${String(seed).padStart(3, "0")}.jsonl`, DATA), "utf8")
    .trim()
    .split("\n");
  const x: number[] = [];
  const y: number[] = [];
  const groups: number[] = [];
  for (const line of lines) {
    const r = JSON.parse(line);
    const b = board(players, r);
    r.moves.forEach((m: Enc & { value: number }, j: number) => {
      x.push(...b, ...move(r, m, j === r.default));
      y.push(m.value, +(j === r.default));
    });
    groups.push(r.moves.length);
  }
  const base = new URL(`${players}p-${String(seed).padStart(3, "0")}`, FEATURES).pathname;
  writeFileSync(`${base}.x`, new Float32Array(x));
  writeFileSync(`${base}.y`, new Float32Array(y));
  writeFileSync(`${base}.g`, new Int32Array(groups));
  return [groups.length, (x.length / y.length) * 2];
}

export const play = (model: string, players: number, seed: number, n: number) => headToHead(() => learned(model), players, seed, n);

if (import.meta.main) {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: { n: { type: "string", default: "64" }, players: { type: "string", default: "2,3,4,5" }, model: { type: "string", default: MODEL } },
  });
  const counts = args.players.split(",").map(Number);
  if (positionals[0] === "extract") {
    mkdirSync(FEATURES, { recursive: true });
    for (const players of counts) {
      const [decisions, features] = await parallel<number[]>(import.meta.url, "extract", [players], Number(args.n), (a, b) => [a[0] + b[0], b[1]]);
      console.log(`${players} players: ${decisions} decisions from ${args.n} shards, ${features} features`);
    }
  } else {
    const n = Number(args.n);
    for (const players of counts) {
      const r = await parallel<{ wins: number }>(import.meta.url, "play", [args.model, players], n);
      console.log(`learned, ${players} players: ${((100 * r.wins) / n).toFixed(1)}% of ${n}`);
    }
  }
}
