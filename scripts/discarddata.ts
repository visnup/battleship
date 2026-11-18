import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { defaultPolicy, mulberry32 } from "../src/game.ts";
import { discarding, discards } from "../src/discarding.ts";
import { parallel } from "../src/parallel.ts";
import { shardName } from "./dataset.ts";
import { learnedSeat, replay, watch } from "./midturn.ts";

// Every discard with a choice that seat 0 makes in `n` default games, each way to discard played
// out two rounds on `deals` shared shuffles (`midturn.ts`), as features for `learn.py`, like
// `paydata.ts`'s: rows of `discarding`, each row's value and whether it's the default's, and each
// discard's option count.

/** With `learned`, seat 0 pays, says no and discards by the learned models throughout. */
const out = (learned: boolean) => new URL(learned ? "../dataset/discard-learned/" : "../dataset/discard/", import.meta.url);
const always = () => true;

export function shard(players: number, deals: number, learned: boolean, seed: number, n: number) {
  const seat = learned ? learnedSeat() : defaultPolicy;
  const seeds = mulberry32(seed);
  const x: number[] = [];
  const y: number[] = [];
  const groups: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const first = i % players;
    const found: { k: number; options: number[][]; rows: number[][] }[] = [];
    watch("discard", players, s, first, always, (k, game, p, m) => {
      const options = discards(game, p, m);
      if (options.length > 1) found.push({ k, options, rows: options.map((o) => discarding(game, p, m)(o.map((j) => p.hand[j]))) });
    }, seat);
    for (const { k, options, rows } of found) {
      const shuffles = Array.from({ length: deals }, () => Math.floor(seeds() * 2 ** 32));
      options.forEach((o, j) => {
        const value = shuffles.reduce((a, t) => a + replay("discard", players, s, first, always, k, (_, q) => o.map((m) => q.hand[m]), t, seat), 0) / deals;
        x.push(...rows[j]);
        y.push(value, +(j === 0));
      });
      groups.push(options.length);
    }
  }
  const base = new URL(shardName(players, seed), out(learned)).pathname;
  writeFileSync(`${base}.x`, new Float32Array(x));
  writeFileSync(`${base}.y`, new Float32Array(y));
  writeFileSync(`${base}.g`, new Int32Array(groups));
  return [groups.length, y.length / 2];
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "16384" }, deals: { type: "string", default: "32" }, players: { type: "string", default: "2,3,4,5" }, learned: { type: "boolean", default: false } } });
  mkdirSync(out(args.learned), { recursive: true });
  for (const players of args.players.split(",").map(Number)) {
    const t = performance.now();
    const [decisions, options] = await parallel<number[]>(import.meta.url, "shard", [players, Number(args.deals), args.learned], Number(args.n));
    console.log(`${players} players: ${decisions} discards, ${options} ways to discard, ${((performance.now() - t) / 60000).toFixed(1)} min`);
  }
}
