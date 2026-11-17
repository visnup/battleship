import { parseArgs } from "node:util";
import { type Game, loose, payable, type Player } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { payments } from "../src/paying.ts";
import { report, search as searchAt } from "./midturn.ts";

// What to pay with, by playouts at each of the default player's payments (`midturn.ts`).

/** Whether `p` has a choice: more to pay with than `amount`. */
export const counts = (_: Game, p: Player, amount: number) => payable(p).reduce((s, x) => s + ("kind" in x ? x : x.card).value, 0) > amount;

/** What kind of payment `o` is: from the bank, loose properties, or a full set. */
function kind(game: Game, p: Player, o: number[]): string {
  const all = payable(p);
  const parts = new Set(o.map((j) => all[j]).map((x) => ("kind" in x ? "bank" : p.built.includes(x) ? "building" : loose(game, p, x) ? "loose property" : "set property")));
  return ["bank", "building", "loose property", "set property"].filter((k) => parts.has(k)).join(" + ") || "nothing";
}

export const search = (players: number, seed: number, n: number) =>
  searchAt("pay", players, seed, n, counts, (game, p, amount) => payments(game, p, amount).map((o) => ({ decide: (_: Game, q: Player) => o.map((j) => payable(q)[j]), label: kind(game, p, o) })));

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "256" }, players: { type: "string", default: "5" }, min: { type: "string", default: "10" } } });
  const n = Number(args.n);
  const result = await parallel<ReturnType<typeof search>>(import.meta.url, "search", [Number(args.players)], n, (a, b) => ({ count: a.count + b.count, rows: a.rows.concat(b.rows) }));
  report(result, "payments", n, Number(args.players), Number(args.min));
}
