import type { Card } from "./cards.ts";
import { banked, colorsOf, count, defaultPolicy, fullColors, type Game, isAction, name, type Player, progress, size } from "./game.ts";
import { memory } from "./memory.ts";
import { observe } from "./replay.ts";

// What to discard past 7 in hand: the choices worth considering, and each as numbers for a
// learned scorer, like `paying.ts` for payments.

/** The default's discard, then every other way to give up `n` cards, as indices into the hand, at most `cap` and one of each set of identical cards. */
export function discards(game: Game, p: Player, n: number, cap = 24): number[][] {
  const mine = defaultPolicy.discard(game, p, n).map((c) => p.hand.indexOf(c));
  const found: number[][] = [mine];
  const seen = new Set([key(p, mine)]);
  const pick = (i: number, chosen: number[]) => {
    if (found.length >= cap) return;
    if (chosen.length === n) {
      const k = key(p, chosen);
      if (!seen.has(k)) {
        found.push([...chosen]);
        seen.add(k);
      }
      return;
    }
    for (let j = i; j < p.hand.length; j++) pick(j + 1, [...chosen, j]);
  };
  pick(0, []);
  return found;
}

const key = (p: Player, cards: number[]) =>
  cards
    .map((j) => name(p.hand[j]))
    .sort()
    .join();

/** Whether `c` would help `p` toward a set it doesn't have full. */
const helps = (game: Game, p: Player, c: Card) => colorsOf(c).some((color) => c.kind !== "rent" && count(p, color) % size(color) !== 0 && progress(game, p, color) < 1);

/** `p` discarding `n`: given what's given up, it and what's kept as numbers. */
export function discarding(game: Game, p: Player, n: number): (cards: Card[]) => number[] {
  const table = [game.players.length, game.turns / game.players.length, n, p.hand.length, banked(p), fullColors(game, p).length, Math.max(...game.players.filter((q) => q !== p).map((q) => fullColors(game, q).length))];
  const describe = (cards: Card[]) => [
    cards.filter((c) => c.kind === "money").reduce((s, c) => s + c.value, 0),
    cards.filter((c) => c.kind === "property").length,
    cards.filter((c) => c.kind === "wild").length,
    cards.filter((c) => c.kind === "rent").length,
    cards.filter((c) => c.kind === "action").length,
    cards.filter((c) => isAction(c, "justSayNo")).length,
    cards.filter((c) => isAction(c, "dealBreaker")).length,
    cards.filter((c) => isAction(c, "slyDeal") || isAction(c, "forcedDeal")).length,
    cards.filter((c) => helps(game, p, c)).length,
    cards.reduce((s, c) => s + c.value, 0),
  ];
  const mem = memory(observe(game, p, 0));
  return (cards) => [...table, ...describe(cards), ...describe(p.hand.filter((c) => !cards.includes(c))), ...mem];
}
