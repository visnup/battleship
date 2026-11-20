import { parseArgs } from "node:util";
import { defaultPolicy, type Game, type Move, name, type Player, rent } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";
import { merge, report, search as searchAt } from "./midturn.ts";

// When to Just Say No, by playouts at each of the default player's chances to say it (`midturn.ts`).

/** What a Just Say No would cancel: the action and, for rent, how much it charges. */
function what(game: Game, p: Player, move: Move): string {
  if (game.players[game.current] === p) return "a No against my action";
  if (move.type === "rent") return `rent of $${rent(game, game.players[game.current], move.color) * 2 ** move.doubles.length}M`;
  return name(move.card);
}

export const search = (players: number, seed: number, n: number) =>
  searchAt(
    "sayNo",
    players,
    seed,
    n,
    () => true,
    (game, p, move, from) => {
      const mine = defaultPolicy.sayNo(game, p, move, from);
      const situation = what(game, p, move);
      return [mine, !mine].map((no) => ({ decide: () => no, label: `${situation}: ${no ? "say no" : "let it go"}` }));
    },
  );

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "512" }, players: { type: "string", default: "5" }, min: { type: "string", default: "10" } } });
  const n = Number(args.n);
  const result = await parallel<ReturnType<typeof search>>(import.meta.url, "search", [Number(args.players)], n, merge);
  report(result, "Just Say No decisions", n, Number(args.players), Number(args.min));
}
