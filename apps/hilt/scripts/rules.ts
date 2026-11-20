import { parseArgs } from "node:util";
import { Game, mulberry32, RULES, type Rules } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";

/** Plays `n` default games under `rules`, and tallies the Favor seat's and seat 2's wins, battles, and battles the Favor holder starts with no cards. */
export function play(players: number, rules: Rules, seed: number, n: number) {
  const rng = mulberry32(seed);
  let favor = 0;
  let second = 0;
  let battles = 0;
  let empty = 0;
  for (let i = 0; i < n; i++) {
    const game = new Game({ players, rng, first: 0, rules });
    const begin = game.begin.bind(game);
    game.begin = () => {
      empty += +!game.players[game.favor].hand.length;
      begin();
    };
    const result = game.run();
    favor += +(result.winner === 0);
    second += +(result.winner === 1);
    battles += result.battles;
  }
  return { favor, second, battles, empty };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "100000" }, players: { type: "string", default: "3,4,5,6" } } });
  const n = Number(args.n);
  console.log(`${n} default games each.\n\n| rule | reading | players | Favor seat | seat 2 | battles | Favor holder empty-handed |\n| --- | --- | --- | --- | --- | --- | --- |`);
  for (const key of Object.keys(RULES) as (keyof Rules)[])
    for (const value of [RULES[key], !RULES[key]])
      for (const players of args.players.split(",").map(Number)) {
        const r = await parallel<ReturnType<typeof play>>(import.meta.url, "play", [players, { ...RULES, [key]: value }], n);
        const pct = (x: number) => `${((100 * x) / n).toFixed(1)}%`;
        console.log(`| ${key} | ${value} | ${players} | ${pct(r.favor)} | ${pct(r.second)} | ${(r.battles / n).toFixed(2)} | ${((100 * r.empty) / r.battles).toFixed(2)}% of battles |`);
      }
}
