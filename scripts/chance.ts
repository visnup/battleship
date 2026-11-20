import { parseArgs } from "node:util";
import { defaultPolicy, Game, HANDS, mulberry32 } from "../src/game.ts";
import { learned } from "../src/learned.ts";
import { features } from "../src/strategies.ts";

// Fits `WEIGHTS` in `src/strategies.ts`: for each player count and number of hands left, the
// softmax over players of weighted `features` that best predicts the winner, from the chips at
// the end of each hand of default-player games, where hand playouts stop. A shared win counts
// as a share to each. With `--model`, the games are that model's learned players'.

const { values: args } = parseArgs({ options: { n: { type: "string", default: "20000" }, model: { type: "string" } } });
// with --model, games among that model's learned players instead
const policies = args.model ? learned(args.model) : defaultPolicy;

for (const players of [3, 4]) {
  const rows: Record<number, { f: number[][]; won: number[] }[]> = { 1: [], 2: [], 3: [] };
  const rng = mulberry32(players);
  for (let i = 0; i < Number(args.n); i++) {
    const g = new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies });
    const boards: [number, number[][]][] = [];
    while (!g.winners) {
      const hand = g.hand;
      g.run(undefined, 1);
      if (!g.winners) boards.push([HANDS - g.hand + 1, g.players.map((q) => features(g, q))]);
      if (g.hand === hand && !g.winners) throw new Error("no progress");
    }
    const won = g.players.map((q) => +g.winners!.includes(q.seat) / g.winners!.length);
    for (const [left, f] of boards) rows[left].push({ f, won });
  }
  const out: number[][] = [];
  for (const left of [1, 2, 3]) {
    const data = rows[left];
    // Newton's method: few weights, so the Hessian is small
    const k = data[0].f[0].length;
    const w = new Array<number>(k).fill(0);
    let loss = 0;
    for (let iteration = 0; iteration < 30; iteration++) {
      const grad = w.map(() => 0);
      const hess = w.map(() => w.map(() => 0));
      loss = 0;
      for (const { f, won } of data) {
        const e = f.map((x) => Math.exp(x.reduce((s, v, i) => s + v * w[i], 0)));
        const total = e.reduce((a, b) => a + b, 0);
        const p = e.map((x) => x / total);
        const mean = w.map((_, i) => f.reduce((s, x, j) => s + p[j] * x[i], 0));
        f.forEach((x, j) => {
          if (won[j]) loss -= won[j] * Math.log(p[j]);
          for (let i = 0; i < k; i++) {
            grad[i] += (p[j] - won[j]) * x[i];
            for (let l = 0; l < k; l++) hess[i][l] += p[j] * x[i] * x[l];
          }
        });
        for (let i = 0; i < k; i++) for (let l = 0; l < k; l++) hess[i][l] -= mean[i] * mean[l];
      }
      w.forEach((_, i) => (w[i] -= solve(hess, grad)[i]));
    }
    out.push(w);
    console.log(
      `  ${players} players, ${left} hands left: [${w.map((x) => +x.toFixed(3)).join(", ")}], // ${data.length} boards, log loss ${(loss / data.length).toFixed(3)} against ${Math.log(players).toFixed(3)} for a guess`,
    );
  }
}

/** `x` with `a x = b`, by Gaussian elimination, with a little ridge so a feature that never varies doesn't make `a` singular. */
function solve(a: number[][], b: number[]) {
  const n = b.length;
  const m = a.map((row, i) => [...row.map((v, j) => v + (i === j ? 1e-6 : 0)), b[i]]);
  for (let i = 0; i < n; i++) {
    const p = m.reduce((best, row, r) => (r >= i && Math.abs(row[i]) > Math.abs(m[best][i]) ? r : best), i);
    [m[i], m[p]] = [m[p], m[i]];
    for (let r = 0; r < n; r++) if (r !== i) for (let c = n; c >= i; c--) m[r][c] -= (m[r][i] / m[i][i]) * m[i][c];
  }
  return m.map((row, i) => row[n] / row[i]);
}
