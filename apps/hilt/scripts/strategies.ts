import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { headToHead, STRATEGIES } from "../src/strategies.ts";
import { header } from "kit/table.ts";

export const run = (strategy: string, players: number, seed: number, n: number) => headToHead(STRATEGIES[strategy], players, seed, n);

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: {
      n: { type: "string", default: "100000" },
      only: { type: "string" },
      players: { type: "string", default: "3,4,5,6" },
    },
  });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  const names = args.only ? args.only.split(",") : Object.keys(STRATEGIES).filter((s) => !s.includes("playouts"));
  console.log(`${n} games each: one player's wins against the default player in every other seat, by player count.\n`);
  header(["strategy"], counts, true);
  for (const name of names) {
    const cells = [];
    for (const players of counts) {
      const r = await parallel<ReturnType<typeof run>>(import.meta.url, "run", [name, players], n);
      cells.push(`${((100 * r.wins) / n).toFixed(1)}%${r.stalled ? ` (${r.stalled} stalled)` : ""}`);
    }
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
}
