import { parseArgs } from "node:util";
import { Game, mulberry32, type Rules } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";

/** Each unsettled rule read the other way from `defaultRules`. */
const READINGS: [string, Partial<Rules>][] = [
  ["One Double the Rent per Rent card", { doubles: 1 }],
  ["Just Say No on your turn is a play", { noIsPlay: true }],
  ["A broken set's house and hotel go to the bank", { strandedToBank: true }],
  ["Deal Breaker leaves the house and hotel", { breakerTakesBuildings: false }],
  ["A set of only multicolored wilds is full", { wildOnlySets: true }],
  ["No reshuffle", { reshuffle: false }],
];

/** Plays `n` games each as read and with `rules`, from the same seeds, and counts what changes. */
export function compare(players: number, rules: Partial<Rules>, seed: number, n: number) {
  const seeds = mulberry32(seed);
  let changed = 0;
  let first = 0;
  let turns = 0;
  let stalled = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const a = new Game({ players, rng: mulberry32(s), first: 0 }).run();
    const b = new Game({ players, rng: mulberry32(s), rules, first: 0 }).run();
    changed += +(a.winner !== b.winner);
    first += +(b.winner === 0) - +(a.winner === 0);
    turns += b.turns - a.turns;
    stalled += +b.stalled - +a.stalled;
  }
  return { changed, first, turns, stalled };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "100000" } } });
  const n = Number(args.n);
  const sign = (x: number, digits = 1) => {
    const v = Number(x.toFixed(digits));
    return `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(digits)}`;
  };
  const counts = [2, 3, 4, 5];
  console.log(`${n} games each. Games whose winner changes; then the change in the first player's wins and in turns per game.\n`);
  console.log(`| reading | ${counts.map((k) => `${k} players`).join(" | ")} |`);
  console.log(`| --- | ${counts.map(() => "---").join(" | ")} |`);
  for (const [label, rules] of READINGS) {
    const cells = [];
    for (const players of counts) {
      const r = await parallel<ReturnType<typeof compare>>(import.meta.url, "compare", [players, rules], n);
      const stalled = r.stalled ? `, ${sign(r.stalled, 0)} stalled` : "";
      cells.push(`${((100 * r.changed) / n).toFixed(1)}%: ${sign((100 * r.first) / n)}, ${sign(r.turns / n)}${stalled}`);
    }
    console.log(`| ${label} | ${cells.join(" | ")} |`);
  }
}
