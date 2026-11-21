import { Game, mulberry32 } from "../src/game.ts";
import { learned } from "../src/learned.ts";
import { playouts } from "../src/strategies.ts";

const n = Number(process.argv[2] ?? 200);
const kind = process.argv[3] ?? "learned";
const make = kind === "learned" ? () => learned() : kind === "rollout" ? () => learned("src/packed/rollout.ts") : (s: number) => playouts(16, s, learned("src/packed/rollout.ts"), 0, 1);
const t0 = performance.now();
let sum = 0;
for (let i = 0; i < n; i++) {
  const players = 3 + (i % 2);
  const g = new Game({ players, rng: mulberry32(i + 1), policies: Array.from({ length: players }, (_, s) => (kind === "playouts" && s ? learned("src/packed/rollout.ts") : make(i))) });
  g.run();
  sum += g.winners!.reduce((a, b) => a * 7 + b, i);
}
console.log(`${kind}: ${((performance.now() - t0) / n).toFixed(2)} ms a game, checksum ${sum}`);
