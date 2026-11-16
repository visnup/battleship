import { parseArgs } from "node:util";
import { Game, mulberry32 } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { headToHead, STRATEGIES } from "../src/strategies.ts";
import { VARIANTS } from "./variants.ts";

// The default player's findings rechecked against strong opponents: quick playouts in every
// other seat instead of the default.

const strong = STRATEGIES["quick playouts"];
const players = { ...STRATEGIES, ...VARIANTS } as Record<string, (seed: number) => ReturnType<typeof strong>>;

export const run = (name: string, k: number, seed: number, n: number) => headToHead(players[name], k, seed, n, strong);

/** Wins by seat with quick playouts in every seat. */
export function seats(k: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  const wins = Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const result = new Game({ players: k, rng: mulberry32(s), policies: Array.from({ length: k }, (_, j) => strong(s + j)), first: 0 }).run();
    if (result.winner !== null) wins[result.winner]++;
  }
  return { wins };
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "4000" }, players: { type: "string", default: "2,5" }, only: { type: "string" } },
  });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  const names = args.only ? args.only.split("|") : [];
  if (!names.length) {
    console.log(`${n} games each, quick playouts in every seat: wins by seat.\n`);
    for (const k of counts) {
      const { wins } = await parallel<ReturnType<typeof seats>>(import.meta.url, "seats", [k], n, (a, b) => ({ wins: a.wins.map((w, i) => w + b.wins[i]) }));
      console.log(`| ${k} | ${wins.map((w) => `${((100 * w) / n).toFixed(1)}%`).join(" | ")} |`);
    }
  } else {
    console.log(`${n} games each: one player's wins against quick playouts in every other seat.\n`);
    console.log(`| player | ${counts.map((k) => `${k} players (fair ${(100 / k).toFixed(1)}%)`).join(" | ")} |`);
    console.log(`| --- | ${counts.map(() => "---").join(" | ")} |`);
    for (const name of names) {
      const cells = [];
      for (const k of counts) cells.push(`${((100 * (await parallel<ReturnType<typeof run>>(import.meta.url, "run", [name, k], n)).wins) / n).toFixed(1)}%`);
      console.log(`| ${name} | ${cells.join(" | ")} |`);
    }
  }
}
