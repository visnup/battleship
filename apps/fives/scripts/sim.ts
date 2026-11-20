import { parseArgs } from "node:util";
import { Game, mulberry32, share } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";

/** Plays `n` default games of `players`, and tallies wins by seat (seat 0 deals first), busts, and hands that hit 25. */
export function simulate(players: number, seed: number, n: number, emit?: { csv?: boolean; log?: boolean }) {
  const rng = mulberry32(seed);
  const wins = Array(players).fill(0);
  let busts = 0;
  let exact = 0;
  let shared = 0;
  for (let i = 0; i < n; i++) {
    const game = new Game({ players, rng, log: emit?.log ? console.log : undefined });
    const { winners, chips } = game.run() as { winners: number[]; chips: number[] };
    if (emit?.csv) console.log([i, winners.join(" "), chips.join(" ")].join(","));
    winners.forEach((w) => (wins[w] += share(winners, w)));
    shared += +(winners.length > 1);
    for (const s of game.scores)
      for (const t of s.totals) {
        busts += +(t > 25);
        exact += +(t === 25);
      }
  }
  return { wins, busts, exact, shared };
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
    if (args.csv) console.log("game,winners,chips");
    simulate(players, Number(args.seed), n, { csv: args.csv, log: args.log });
  } else {
    const { wins, busts, exact, shared } = await parallel<ReturnType<typeof simulate>>(import.meta.url, "simulate", [players], n);
    const pct = (x: number, of = n) => `${((100 * x) / of).toFixed(1)}%`.padStart(6);
    console.log(`${n} games of ${players}; even odds of winning are ${pct(n / players)}\n`);
    console.log("seat    win");
    wins.forEach((w, seat) => console.log(`${String(seat + 1).padEnd(5)}${pct(w)}`));
    const hands = n * 4 * players;
    console.log(`\nhands that bust: ${pct(busts, hands)}, hit 25: ${pct(exact, hands)}; games shared: ${pct(shared)}`);
  }
}
