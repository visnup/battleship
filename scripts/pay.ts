import { parseArgs } from "node:util";
import { type Card, defaultPolicy, type Game, loose, type Placed, type Player } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { report, search as searchAt } from "./replay.ts";

// What to pay with, by playouts at each of the default player's payments (`replay.ts`).

type Piece = Card | Placed;

/** Everything `p` could pay with, in a fixed order, so a payment can be named by indices. */
const pieces = (p: Player): Piece[] => [...p.bank, ...p.built, ...p.props.filter((x) => x.card.value > 0)];
const value = (x: Piece) => ("kind" in x ? x.value : x.card.value);
const counts = (_: Game, p: Player, amount: number) => pieces(p).reduce((s, x) => s + value(x), 0) > amount;

/** The payments where no piece could be left out, plus the default's, as indices into `pieces`. */
function payments(game: Game, p: Player, amount: number, cap = 200): number[][] {
  const all = pieces(p);
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
      .map((j) => label1(game, p, all[j]))
      .sort()
      .join();
  const seen = new Set<string>();
  return [mine, ...found].filter((o) => !seen.has(key(o)) && seen.add(key(o)));
}

const label1 = (game: Game, p: Player, x: Piece) => ("kind" in x ? `$${x.value}${x.kind === "money" ? "" : "a"}` : p.built.includes(x) ? "building" : `${x.color}${loose(game, p, x) ? "" : "!"}`);

/** What kind of payment `o` is: from the bank, loose properties, or a full set. */
function kind(game: Game, p: Player, o: number[]): string {
  const all = pieces(p);
  const parts = new Set(o.map((j) => all[j]).map((x) => ("kind" in x ? "bank" : p.built.includes(x) ? "building" : loose(game, p, x) ? "loose property" : "set property")));
  return ["bank", "building", "loose property", "set property"].filter((k) => parts.has(k)).join(" + ") || "nothing";
}

export const search = (players: number, seed: number, n: number) =>
  searchAt("pay", players, seed, n, counts, (game, p, amount) => payments(game, p, amount).map((o) => ({ decide: (_: Game, q: Player) => o.map((j) => pieces(q)[j]), label: kind(game, p, o) })));

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "256" }, players: { type: "string", default: "5" }, min: { type: "string", default: "10" } } });
  const n = Number(args.n);
  const result = await parallel<ReturnType<typeof search>>(import.meta.url, "search", [Number(args.players)], n, (a, b) => ({ count: a.count + b.count, rows: a.rows.concat(b.rows) }));
  report(result, "payments", n, Number(args.players), Number(args.min));
}
