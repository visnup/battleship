import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { mulberry32, payable } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { payment, payments } from "../src/paying.ts";
import { replay, watch } from "./midturn.ts";
import { counts } from "./pay.ts";

// Every payment with a choice that seat 0 makes in `n` default games, each way to pay played out
// two rounds on `deals` shared shuffles (`midturn.ts`), as features for `learn.py`, like
// `learn.ts extract`'s: rows of `payment`, each row's value and whether it's the default's, and
// each payment's option count.

const OUT = new URL("../dataset/pay/", import.meta.url);

export function shard(players: number, deals: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  const x: number[] = [];
  const y: number[] = [];
  const groups: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const first = i % players;
    const found: { k: number; options: number[][]; rows: number[][] }[] = [];
    watch("pay", players, s, first, counts, (k, game, p, amount) => {
      const options = payments(game, p, amount, 24);
      if (options.length > 1) found.push({ k, options, rows: options.map((o) => payment(game, p, amount, o.map((j) => payable(p)[j]))) });
    });
    for (const { k, options, rows } of found) {
      const shuffles = Array.from({ length: deals }, () => Math.floor(seeds() * 2 ** 32));
      options.forEach((o, j) => {
        const value = shuffles.reduce((a, t) => a + replay("pay", players, s, first, counts, k, (_, q) => o.map((m) => payable(q)[m]), t), 0) / deals;
        x.push(...rows[j]);
        y.push(value, +(j === 0));
      });
      groups.push(options.length);
    }
  }
  const base = new URL(`${players}p-${String(seed).padStart(3, "0")}`, OUT).pathname;
  writeFileSync(`${base}.x`, new Float32Array(x));
  writeFileSync(`${base}.y`, new Float32Array(y));
  writeFileSync(`${base}.g`, new Int32Array(groups));
  return [groups.length, y.length / 2];
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "4096" }, deals: { type: "string", default: "32" }, players: { type: "string", default: "2,3,4,5" } } });
  mkdirSync(OUT, { recursive: true });
  for (const players of args.players.split(",").map(Number)) {
    const t = performance.now();
    const [decisions, options] = await parallel<number[]>(import.meta.url, "shard", [players, Number(args.deals)], Number(args.n));
    console.log(`${players} players: ${decisions} payments, ${options} ways to pay, ${((performance.now() - t) / 60000).toFixed(1)} min`);
  }
}
