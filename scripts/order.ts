import { parseArgs } from "node:util";
import { heuristic, STEPS } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { headToHead } from "../src/strategies.ts";

type Name = keyof typeof STEPS;

/** One player's wins against `defaultPolicy` with each of `orders` of its steps, on the same deals. */
export function run(orders: Name[][], players: number, seed: number, n: number) {
  return orders.map((order) => headToHead(() => heuristic(...order), players, seed, n).wins);
}

/** Every order with one step moved to another place. */
function neighbors(order: Name[]): Name[][] {
  const out: Name[][] = [];
  order.forEach((step, i) => {
    const rest = order.toSpliced(i, 1);
    for (let j = 0; j <= rest.length; j++) if (j !== i) out.push(rest.toSpliced(j, 0, step));
  });
  return out;
}

// Searches `STEPS` orders by moving one step at a time: each round screens every move on a few
// deals at 2 and 5 players, then plays the best few on many more and keeps the best, if it beats
// the current order by more than the noise.
if (import.meta.main) {
  const { values: args } = parseArgs({ options: { screen: { type: "string", default: "20000" }, confirm: { type: "string", default: "100000" } } });
  const fair = { 2: 0.5, 5: 0.2 };
  const score = async (orders: Name[][], n: number) => {
    const by = await Promise.all(Object.keys(fair).map((k) => parallel<number[]>(import.meta.url, "run", [orders, Number(k)], n)));
    return orders.map((_, i) => (100 * (by[0][i] + by[1][i])) / n / 2);
  };
  let order = Object.keys(STEPS) as Name[];
  for (let round = 1; ; round++) {
    const candidates = [order, ...neighbors(order)];
    const screened = await score(candidates, Number(args.screen));
    const top = candidates
      .map((o, i) => ({ o, s: screened[i] }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4);
    const confirmed = await score([order, ...top.map((t) => t.o)], Number(args.confirm));
    const best = confirmed.slice(1).reduce((b, s, i) => (s > confirmed[b + 1] ? i : b), 0);
    const gain = confirmed[best + 1] - confirmed[0];
    console.log(`round ${round}: ${top[best].o.join(" ")}  ${gain >= 0 ? "+" : ""}${gain.toFixed(2)} points (average of 2 and 5 players)`);
    if (gain < 0.5) break;
    order = top[best].o;
  }
  console.log(`\nbest: ${order.join(", ")}`);
}
