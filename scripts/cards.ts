import { parseArgs } from "node:util";
import { type Card, DECK } from "../src/cards.ts";
import { defaultPolicy, Game, mulberry32, name, type Policy } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";

const KINDS = [...new Map(DECK.map((c) => [JSON.stringify(c), c])).values()];
const bankable = (c: Card) => c.kind === "action" || c.kind === "rent";

/** Plays like the default, except that its first play banks a card like `kind`. */
const bankFirst = (kind: Card): Policy => {
  let done = false;
  return {
    ...defaultPolicy,
    move(game, p, left) {
      const first = !done;
      done = true;
      const card = first ? p.hand.find((c) => JSON.stringify(c) === JSON.stringify(kind)) : undefined;
      return card ? { type: "bank", card } : defaultPolicy.move(game, p, left);
    },
  };
};

/**
 * Plays `n` deals of `players`, each as dealt and again once per kind of card, with one copy of
 * that card moved from the draw pile into one player's opening hand (a different seat each deal).
 * Action and Rent cards are played a third time, with that player banking a copy on its first
 * play. Returns that player's wins as dealt, with each extra card, and with it banked, and how
 * many deals had one to move.
 */
export function values(players: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  let base = 0;
  const wins = KINDS.map(() => 0);
  const banked = KINDS.map(() => 0);
  const deals = KINDS.map(() => 0);
  const baseWins = KINDS.map(() => 0);
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const won = +(new Game({ players, rng: mulberry32(s), first: 0 }).run().winner === seat);
    base += won;
    KINDS.forEach((kind, k) => {
      const play = (policy = defaultPolicy) => {
        const policies = Array.from({ length: players }, (_, j) => (j === seat ? policy : defaultPolicy));
        const game = new Game({ players, rng: mulberry32(s), first: 0, policies });
        const at = game.draw.findIndex((c) => JSON.stringify(c) === JSON.stringify(kind));
        if (at < 0) return null;
        game.players[seat].hand.push(...game.draw.splice(at, 1));
        return +(game.run().winner === seat);
      };
      const w = play();
      if (w === null) return;
      wins[k] += w;
      if (bankable(kind)) banked[k] += play(bankFirst(kind))!;
      baseWins[k] += won;
      deals[k]++;
    });
  }
  return { base, wins, banked, baseWins, deals };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "50000" } } });
  const n = Number(args.n);
  const counts = [2, 3, 4, 5];
  const results = [];
  for (const players of counts) results.push(await parallel<ReturnType<typeof values>>(import.meta.url, "values", [players], n));
  const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;
  const gain = (r: (typeof results)[number], k: number, wins = r.wins) => (100 * (wins[k] - r.baseWins[k])) / r.deals[k];
  const order = KINDS.map((_, k) => k).sort((a, b) => gain(results[2], b) - gain(results[2], a));
  console.log(`${n} deals each: how many more games a player wins, in points, with one extra card in its opening hand.\n`);
  console.log(`| card | $M | ${counts.map((k) => `${k} players`).join(" | ")} |`);
  console.log(`| --- | --- | ${counts.map(() => "---").join(" | ")} |`);
  for (const k of order) console.log(`| ${name(KINDS[k])} | ${KINDS[k].value} | ${results.map((r) => signed(gain(r, k))).join(" | ")} |`);
  console.log(`\nThe same, with a copy banked on the player's first play (and played as the default plays it).\n`);
  console.log(`| card | $M | ${counts.map((k) => `${k} players`).join(" | ")} |`);
  console.log(`| --- | --- | ${counts.map(() => "---").join(" | ")} |`);
  for (const k of order.filter((k) => bankable(KINDS[k])))
    console.log(`| ${name(KINDS[k])} | ${KINDS[k].value} | ${results.map((r) => `${signed(gain(r, k, r.banked))} (${signed(gain(r, k))})`).join(" | ")} |`);
}
