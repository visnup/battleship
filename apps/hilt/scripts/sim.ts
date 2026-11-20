import { parseArgs } from "node:util";
import { Game, mulberry32 } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";

/** Plays `n` games of `players`, the Favor card starting in seat 0, and tallies wins by seat. */
export function simulate(players: number, seed: number, n: number, emit?: { csv?: boolean; log?: boolean }) {
  const rng = mulberry32(seed);
  const wins = Array(players).fill(0);
  let battles = 0;
  let rounds = 0;
  let stalled = 0;
  for (let i = 0; i < n; i++) {
    const game = new Game({ players, rng, first: 0, log: emit?.log ? console.log : undefined });
    const result = game.run();
    if (emit?.csv) console.log([i, result.winner ?? "", result.battles, result.rounds].join(","));
    if (result.winner !== null) wins[result.winner]++;
    battles += result.battles;
    rounds += result.rounds;
    stalled += +result.stalled;
  }
  return { wins, battles, rounds, stalled };
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: {
      n: { type: "string", default: "100000" },
      players: { type: "string", default: "4" },
      // Only for --csv and --log, which run on one core; otherwise each chunk has its own seed.
      seed: { type: "string", default: "1" },
      csv: { type: "boolean", default: false },
      log: { type: "boolean", default: false },
    },
  });
  const n = Number(args.n);
  const players = Number(args.players);
  if (args.csv || args.log) {
    if (args.csv) console.log("game,winner,battles,rounds");
    simulate(players, Number(args.seed), n, { csv: args.csv, log: args.log });
  } else {
    const { wins, battles, rounds, stalled } = await parallel<ReturnType<typeof simulate>>(import.meta.url, "simulate", [players], n);
    const pct = (x: number) => `${((100 * x) / n).toFixed(1)}%`.padStart(6);
    console.log(`${n} games of ${players}; even odds of winning are ${pct(n / players)}\n`);
    console.log("seat    win");
    wins.forEach((w, seat) => console.log(`${String(seat + 1).padEnd(5)}${pct(w)}`));
    console.log(`\nbattles per game: ${(battles / n).toFixed(1)}, rounds per game: ${(rounds / n).toFixed(1)}, stalled: ${stalled}`);
  }
}
