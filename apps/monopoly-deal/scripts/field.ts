import { parseArgs } from "node:util";
import { defaultPolicy, type Policy } from "../src/game.ts";
import { learned, MODEL } from "../src/learned.ts";
import { parallel } from "../src/parallel.ts";
import { headToHead, STRATEGIES } from "../src/strategies.ts";
import { header } from "./table.ts";

// One player against learned players in every other seat, instead of the default: whether what
// beats the default still wins when the others play better. The learned player itself should
// come out fair.

const PLAYERS: Record<string, (seed: number) => Policy> = {
  default: () => defaultPolicy,
  learned: () => learned(MODEL),
  "quick playouts": STRATEGIES["quick playouts"],
  playouts: STRATEGIES.playouts,
};

export const run = (who: string, players: number, seed: number, n: number) => headToHead(PLAYERS[who], players, seed, n, () => learned(MODEL));

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "100000" }, players: { type: "string", default: "2,3,4,5" }, only: { type: "string" } } });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  console.log(`${n} games each: one player's wins against the learned player in every other seat.\n`);
  header(["player"], counts, true);
  for (const who of Object.keys(PLAYERS).filter((p) => !args.only || args.only.split(",").includes(p))) {
    const cells = [];
    for (const players of counts) cells.push(`${((100 * (await parallel<ReturnType<typeof run>>(import.meta.url, "run", [who, players], n)).wins) / n).toFixed(1)}%`);
    console.log(`| ${who} | ${cells.join(" | ")} |`);
  }
}
