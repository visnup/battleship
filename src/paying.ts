import type { Card } from "./cards.ts";
import { assets, banked, defaultPolicy, fullColors, type Game, gain, loose, payable, type Placed, type Player, progress, size } from "./game.ts";

// What to pay with: the payments worth considering, and each as numbers for a learned scorer.

type Piece = Card | Placed;
const value = (x: Piece) => ("kind" in x ? x.value : x.card.value);

/** What kind of piece `x` is, for telling payments apart. */
export const label = (game: Game, p: Player, x: Piece) => ("kind" in x ? `$${x.value}${x.kind === "money" ? "" : "a"}` : p.built.includes(x) ? "building" : `${x.color}${loose(game, p, x) ? "" : "!"}`);

/** The default's payment, then the ones where no piece could be left out, as indices into `payable`, at most `cap`. */
export function payments(game: Game, p: Player, amount: number, cap = 200): number[][] {
  const all = payable(p);
  const found: number[][] = [];
  const pick = (i: number, chosen: number[], sum: number) => {
    if (found.length >= cap) return;
    if (sum >= amount) {
      if (chosen.every((j) => sum - value(all[j]) < amount)) found.push([...chosen]);
      return;
    }
    if (i === all.length) return;
    pick(i + 1, [...chosen, i], sum + value(all[i]));
    pick(i + 1, chosen, sum);
  };
  pick(0, [], 0);
  const mine = defaultPolicy.pay(game, p, amount).map((x) => all.indexOf(x));
  const key = (o: number[]) =>
    o
      .map((j) => label(game, p, all[j]))
      .sort()
      .join();
  const seen = new Set<string>();
  return [mine, ...found].filter((o) => !seen.has(key(o)) && seen.add(key(o))).slice(0, cap);
}

/** `p` paying toward `amount`: given what's paid, it and the table it's paid on as numbers. */
export function payment(game: Game, p: Player, amount: number): (paid: Piece[]) => number[] {
  const to = game.players[game.current];
  const table = [game.players.length, game.turns, amount, banked(p), assets(p), p.props.length, fullColors(game, p).length, fullColors(game, to).length, assets(to), p.hand.length];
  return (paid) => {
    const props = paid.filter((x): x is Placed => !("kind" in x) && !p.built.includes(x));
    const bank = paid.filter((x): x is Card => "kind" in x);
    const total = paid.reduce((s, x) => s + value(x), 0);
    const after = { ...p, bank: p.bank.filter((c) => !bank.includes(c)), props: p.props.filter((x) => !props.includes(x)), built: p.built.filter((x) => !paid.includes(x)) };
    return [
      ...table,
      total,
      total - amount,
      paid.length,
      bank.length,
      bank.reduce((s, c) => s + c.value, 0),
      paid.length - bank.length - props.length,
      props.length,
      props.reduce((s, x) => s + x.card.value, 0),
      props.filter((x) => loose(game, p, x)).length,
      props.filter((x) => x.card.kind === "wild").length,
      props.reduce((s, x) => s + progress(game, p, x.color), 0),
      props.reduce((s, x) => s + gain(game, to, x.color), 0),
      props.filter((x) => gain(game, to, x.color) === 1).length,
      props.reduce((s, x) => s + size(x.color), 0),
      fullColors(game, after).length,
      banked(after),
      assets(after),
    ];
  };
}
