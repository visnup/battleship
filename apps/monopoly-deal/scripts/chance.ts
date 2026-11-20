import { parseArgs } from "node:util";
import { defaultPolicy, Game, MAX_TURNS, mulberry32 } from "../src/game.ts";
import { features } from "../src/strategies.ts";

// Fits `WEIGHTS` in `src/strategies.ts`: the softmax over players of weighted `features` that best
// predicts the winner, from the board before every turn of default-player games, where playouts
// stop.

const { values: args } = parseArgs({ options: { n: { type: "string", default: "3000" } } });

for (const players of [2, 3, 4, 5]) {
  const rows: { f: number[][]; winner: number }[] = [];
  const rng = mulberry32(players);
  for (let i = 0; i < Number(args.n); i++) {
    const g = new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: defaultPolicy, first: i % players });
    const boards: number[][][] = [];
    let result;
    do {
      boards.push(g.players.map((q) => features(g, q)));
      result = g.run(undefined, g.turns + 1);
    } while (result.stalled && result.turns < MAX_TURNS);
    if (result.winner !== null) for (const f of boards) rows.push({ f, winner: result.winner });
  }

  const w = new Array<number>(rows[0].f[0].length).fill(0);
  let loss = 0;
  for (let epoch = 0; epoch < 300; epoch++) {
    const grad = w.map(() => 0);
    loss = 0;
    for (const { f, winner } of rows) {
      const e = f.map((x) => Math.exp(x.reduce((s, v, i) => s + v * w[i], 0)));
      const total = e.reduce((a, b) => a + b, 0);
      loss -= Math.log(e[winner] / total);
      f.forEach((x, j) => x.forEach((v, i) => (grad[i] += (e[j] / total - +(j === winner)) * v)));
    }
    w.forEach((_, i) => (w[i] -= (2 * grad[i]) / rows.length));
  }
  console.log(`  ${players}: [${w.map((x) => +x.toFixed(2)).join(", ")}], // ${rows.length} boards, log loss ${(loss / rows.length).toFixed(3)} against ${Math.log(players).toFixed(3)} for a guess`);
}
