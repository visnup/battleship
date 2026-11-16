import { parseArgs } from "node:util";
import { defaultPolicy, Game, mulberry32, type Policy } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";

/**
 * In `n` default-player games, every payment: how many there are, how many cost properties, and
 * what was paid in property. Also each player's bank when charged, and whether a winner ever paid
 * in property.
 */
export function payments(players: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  let count = 0;
  let inProperty = 0;
  let propertyValue = 0;
  let bankWhenCharged = 0;
  let winnersPaid = 0;
  let losersPaid = 0;
  let games = 0;
  for (let i = 0; i < n; i++) {
    const paid = new Set<number>();
    const watcher: Policy = {
      ...defaultPolicy,
      pay(game, p, amount) {
        const cards = defaultPolicy.pay(game, p, amount);
        const props = cards.filter((x) => "card" in x);
        count++;
        bankWhenCharged += p.bank.reduce((s, c) => s + c.value, 0);
        if (props.length) {
          inProperty++;
          propertyValue += props.reduce((s, x) => s + x.card.value, 0);
          paid.add(p.seat);
        }
        return cards;
      },
    };
    const { winner } = new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watcher, first: i % players }).run();
    if (winner === null) continue;
    games++;
    winnersPaid += +paid.has(winner);
    losersPaid += [...paid].filter((s) => s !== winner).length;
  }
  return { count, inProperty, propertyValue, bankWhenCharged, winnersPaid, losersPaid, games };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "100000" } } });
  const n = Number(args.n);
  const counts = [2, 3, 4, 5];
  const results = [];
  for (const players of counts) results.push(await parallel<ReturnType<typeof payments>>(import.meta.url, "payments", [players], n));
  console.log(`${n} games each of default players.\n`);
  console.log(`| | ${counts.map((k) => `${k} players`).join(" | ")} |`);
  console.log(`| --- | ${counts.map(() => "---").join(" | ")} |`);
  const row = (label: string, f: (r: (typeof results)[number], k: number) => string) => console.log(`| ${label} | ${results.map((r, i) => f(r, counts[i])).join(" | ")} |`);
  row("payments a game", (r) => (r.count / r.games).toFixed(1));
  row("bank when charged", (r) => `$${(r.bankWhenCharged / r.count).toFixed(1)}M`);
  row("paid partly in property", (r) => `${((100 * r.inProperty) / r.count).toFixed(0)}%`);
  row("property paid a game", (r) => `$${(r.propertyValue / r.games).toFixed(1)}M`);
  row("winner ever paid in property", (r) => `${((100 * r.winnersPaid) / r.games).toFixed(0)}%`);
  row("each loser ever paid in property", (r, k) => `${((100 * r.losersPaid) / r.games / (k - 1)).toFixed(0)}%`);
}
