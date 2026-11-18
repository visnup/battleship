import { BIRTHDAY, DEBT } from "./cards.ts";
import { assets, banked, fullColors, type Game, gain, isAction, type Move, type Player, progress, rent } from "./game.ts";

// Whether to Just Say No, as numbers for a learned scorer, like `paying.ts` for payments.

const ACTIONS = ["slyDeal", "forcedDeal", "dealBreaker", "debtCollector", "birthday"];

/**
 * `p`, holding a Just Say No, deciding whether to play it on `move`, with `to` on the other side:
 * the decision as numbers, given whether it says no. It's the action against `p`, or `p`'s own
 * action that `to` said no to.
 */
export function refusal(game: Game, p: Player, move: Move, to: Player): (no: boolean) => number[] {
  const mover = game.players[game.current];
  const attacked = mover !== p;
  const victim = attacked ? p : to;
  const amount = move.type === "rent" ? rent(game, mover, move.color) * 2 ** move.doubles.length : isAction(move.card, "debtCollector") ? DEBT : isAction(move.card, "birthday") ? BIRTHDAY : 0;
  const take = move.type === "action" ? move.take : undefined;
  const give = move.type === "action" ? move.give : undefined;
  const set = move.type === "action" && isAction(move.card, "dealBreaker") ? move.color : undefined;
  const lead = Math.max(...game.players.filter((q) => q !== p).map((q) => fullColors(game, q).length));
  const table = [
    game.players.length,
    game.turns / game.players.length,
    +attacked,
    p.hand.filter((c) => isAction(c, "justSayNo")).length,
    p.hand.length,
    to.hand.length,
    +(move.type === "rent"),
    ...ACTIONS.map((a) => +isAction(move.card, a)),
    amount,
    banked(victim),
    assets(victim),
    +(amount > banked(victim)),
    take ? take.card.value : -1,
    take ? progress(game, victim, take.color) : -1,
    take ? gain(game, mover, take.color) : -1,
    give ? give.card.value : -1,
    give ? progress(game, mover, give.color) : -1,
    set ? rent(game, victim, set) : -1,
    fullColors(game, p).length,
    fullColors(game, mover).length,
    lead,
    +(fullColors(game, mover).length === lead && attacked),
  ];
  return (no) => [...table, +no];
}
