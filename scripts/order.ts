import { parseArgs } from "node:util";
import { heuristic, STEPS } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { paired } from "../src/strategies.ts";

type Name = keyof typeof STEPS;

/** For each of `orders` of the default's steps, one player's wins less the default's on the same deals, and the squared differences. */
export function run(orders: Name[][], players: number, seed: number, n: number) {
  return orders.map((order) => {
    const { wins, base, sq } = paired(() => heuristic(...order), players, seed, n);
    return [wins - base, sq];
  });
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
// deals, then plays the best few on many more and keeps the best, if its gain over the current
// order, added up over the player counts, is more than 3 standard errors.
if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { screen: { type: "string", default: "20000" }, confirm: { type: "string", default: "200000" }, players: { type: "string", default: "2,3,4,5" }, top: { type: "string", default: "6" } },
  });
  const counts = args.players.split(",").map(Number);
  const score = async (orders: Name[][], n: number) => {
    const by = [];
    for (const k of counts) by.push(await parallel<number[][]>(import.meta.url, "run", [orders, k], n));
    return orders.map((_, i) => {
      const gains = by.map((b) => (100 * b[i][0]) / n);
      const se = Math.sqrt(by.reduce((s, b) => s + (b[i][1] / n - (b[i][0] / n) ** 2) / n, 0)) * 100;
      return { gains, total: gains.reduce((a, b) => a + b, 0), se };
    });
  };
  const show = (s: { gains: number[]; se: number }) => `${s.gains.map((g) => (g < 0 ? "−" : "+") + Math.abs(g).toFixed(2)).join(" ")} (sum ± ${(2 * s.se).toFixed(2)})`;
  let order = Object.keys(STEPS) as Name[];
  // gains are over the default, so a new order has to beat the last one's
  let current = 0;
  for (let round = 1; ; round++) {
    // the same order can come from two moves
    const candidates = [...new Map(neighbors(order).map((o) => [o.join(), o])).values()];
    const screened = await score(candidates, Number(args.screen));
    const top = candidates
      .map((o, i) => ({ o, s: screened[i] }))
      .sort((a, b) => b.s.total - a.s.total)
      .slice(0, Number(args.top));
    const confirmed = await score(
      top.map((t) => t.o),
      Number(args.confirm),
    );
    confirmed.forEach((s, i) => console.log(`  ${top[i].o.join(" ")}  ${show(s)}`));
    const best = confirmed.reduce((b, s, i) => (s.total > confirmed[b].total ? i : b), 0);
    console.log(`round ${round}: ${top[best].o.join(" ")}  ${show(confirmed[best])} points at ${counts.join(", ")} players`);
    if (confirmed[best].total - current < 3 * confirmed[best].se) break;
    [order, current] = [top[best].o, confirmed[best].total];
  }
  console.log(`\nbest: ${order.join(", ")}`);
}
