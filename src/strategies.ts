import {
  buildable,
  colorsOf,
  defaultPolicy,
  fullColors,
  Game,
  heuristic,
  isAction,
  loose,
  type Move,
  mulberry32,
  type Placed,
  type Player,
  type Policy,
  rent,
  STEPS,
  shuffle,
  type Step,
} from "./game.ts";
import type { Card } from "./cards.ts";

/** `defaultPolicy`'s steps, in its order. */
const DEFAULT = Object.keys(STEPS) as (keyof typeof STEPS)[];

/** Banks money first until the bank holds `amount`, so rent rarely costs properties. */
const cushion =
  (amount: number): Step =>
  (game, p) => {
    const money = p.hand.find((c) => c.kind === "money");
    return money && p.bank.reduce((s, c) => s + c.value, 0) < amount ? { type: "bank", card: money } : null;
  };

/** Banks any action or rent card. */
const bankAll: Step = (game, p) => {
  const card = p.hand.find((c) => c.kind === "action" || c.kind === "rent" || c.kind === "money");
  return card ? { type: "bank", card } : null;
};

/** A house or hotel on a full set that can take it. */
export const build: Step = (game, p) => {
  for (const c of p.hand.filter((c) => isAction(c, "house") || isAction(c, "hotel"))) {
    const has = (color: string, a: string) => p.built.some((b) => b.color === color && isAction(b.card, a));
    const color = fullColors(game, p)
      .filter(buildable)
      .find((color) => (isAction(c, "house") ? !has(color, "house") : has(color, "house") && !has(color, "hotel")));
    if (color) return { type: "place", card: c, color };
  }
  return null;
};

// Whole-game strategies, each a player of its own, compared head to head in `scripts/strategies.ts`.
export const STRATEGIES: Record<string, (seed: number) => Policy> = {
  /** `defaultPolicy`: complete sets, steal, charge rent, lay down properties, then bank. */
  "default": () => defaultPolicy,

  /** Lays down properties and builds houses and hotels before charging rent, like the first `defaultPolicy`. */
  "builder": () => heuristic("passGo", "complete", "dealBreaker", "slyDeal", "place", build, "rent", "debtCollector", "birthday", "forcedDeal", "bank", "passGoLast"),

  /** Banks $10M before anything else, then plays like the default. */
  "banker": () => heuristic(cushion(10), ...DEFAULT),

  /** Never takes from anyone: lays down properties and banks every action card. */
  "pacifist": () => heuristic("passGo", "complete", "place", bankAll, "passGoLast"),

  /** Plays a legal move at random, or ends the turn. */
  "random": (seed) => random(seed),

  /** Plays out every legal move on 80 deals, and makes the one that wins most. */
  "playouts": (seed) => playouts(80, seed),
};

/**
 * Plays `n` games of one player made by `make` against `defaultPolicy` everywhere else, taking
 * each seat in turn, and counts its wins.
 */
export function headToHead(make: (seed: number) => Policy, players: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  let wins = 0;
  let turns = 0;
  let stalled = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const policies = Array.from({ length: players }, (_, j) => (j === seat ? make(s) : defaultPolicy));
    const result = new Game({ players, rng: mulberry32(s), policies, first: 0 }).run();
    wins += +(result.winner === seat);
    turns += result.turns;
    stalled += +result.stalled;
  }
  return { wins, turns, stalled };
}

/** Every legal move for `p` with `left` plays, one per kind of card in hand. */
export function moves(game: Game, p: Player, left: number): Move[] {
  const out: Move[] = [];
  const others = game.players.filter((q) => q !== p);
  const doubles = p.hand.filter((c) => isAction(c, "doubleRent"));
  const seen = new Set<string>();
  for (const card of p.hand) {
    const key = JSON.stringify(card);
    if (seen.has(key)) continue;
    seen.add(key);
    if (card.kind === "money" || card.kind === "action" || card.kind === "rent") out.push({ type: "bank", card });
    if (card.kind === "property" || card.kind === "wild") {
      for (const color of colorsOf(card)) out.push({ type: "place", card, color });
    } else if (card.kind === "rent") {
      for (const color of colorsOf(card)) {
        if (!rent(game, p, color)) continue;
        for (let d = 0; d <= Math.min(game.rules.doubles, doubles.length, left - 1); d++)
          for (const target of card.colors === "any" ? others.map((q) => q.seat) : [undefined])
            out.push({ type: "rent", card, color, target, doubles: doubles.slice(0, d) });
      }
    } else if (card.kind === "action") {
      out.push(...actions(game, p, card, others));
    }
  }
  return out;
}

function actions(game: Game, p: Player, card: Card, others: Player[]): Move[] {
  if (card.kind !== "action") return [];
  const looseOf = (q: Player) => q.props.filter((x) => loose(game, q, x));
  const has = (color: string, a: string) => p.built.some((b) => b.color === color && isAction(b.card, a));
  const sets = fullColors(game, p).filter(buildable);
  switch (card.action) {
    case "passGo":
    case "birthday":
      return [{ type: "action", card }];
    case "debtCollector":
      return others.map((q) => ({ type: "action", card, target: q.seat }));
    case "slyDeal":
      return others.flatMap((q) => looseOf(q).map((take) => ({ type: "action", card, target: q.seat, take }) as Move));
    case "forcedDeal":
      return others.flatMap((q) => looseOf(q).flatMap((take) => looseOf(p).map((give) => ({ type: "action", card, target: q.seat, take, give }) as Move)));
    case "dealBreaker":
      return others.flatMap((q) => fullColors(game, q).map((color) => ({ type: "action", card, target: q.seat, color }) as Move));
    case "house":
      return sets.filter((c) => !has(c, "house")).map((color) => ({ type: "place", card, color }));
    case "hotel":
      return sets.filter((c) => has(c, "house") && !has(c, "hotel")).map((color) => ({ type: "place", card, color }));
    default:
      return [];
  }
}

/** Plays a legal move at random, or ends the turn. */
export function random(seed = 1): Policy {
  const rng = mulberry32(seed);
  return {
    ...defaultPolicy,
    move(game, p, left) {
      const options = [null, ...moves(game, p, left)];
      return options[Math.floor(rng() * options.length)];
    },
  };
}

/**
 * Plays out every legal move, and ending the turn, `n` times each with `rollout` for everyone,
 * and makes the move that wins most. Each playout first shuffles the cards `p` can't see, the
 * other hands and the draw pile, so it doesn't peek. Every move is played out on the same `n`
 * shuffles, so they differ by the move and not by the luck of the deal. (Successive halving,
 * dropping the worse half of the moves after 8 deals, then 16, and so on, lost to this at 2
 * players: 46.9% against 60.0% with 80 here.)
 */
export function playouts(n: number, seed = 1, rollout = defaultPolicy): Policy {
  const rng = mulberry32(seed);
  return {
    ...defaultPolicy,
    move(game, p, left) {
      const options = [null, ...moves(game, p, left)];
      if (options.length === 1) return null;
      const seeds = Array.from({ length: n }, () => Math.floor(rng() * 2 ** 32));
      const wins = options.map((m) => playout(game, p, m, seeds, rollout));
      return options[wins.indexOf(Math.max(...wins))];
    },
  };
}

/** How many of the games from `seeds` `p` wins making `move` now, then playing like `rollout`. */
export function playout(game: Game, p: Player, move: Move | null, seeds: number[], rollout = defaultPolicy) {
  let wins = 0;
  for (const s of seeds) {
    const g = sample(game, p, mulberry32(s), rollout);
    wins += +(g.run(move && translate(move, game, g)).winner === p.seat);
  }
  return wins;
}

/** A copy of `game` with the cards `p` can't see dealt again at random, played by `rollout`. */
function sample(game: Game, p: Player, rng: () => number, rollout: Policy): Game {
  const g = game.clone();
  g.rng = rng;
  g.policies = g.players.map(() => rollout);
  const hidden = g.players.filter((q) => q.seat !== p.seat);
  const cards = shuffle([...hidden.flatMap((q) => q.hand), ...g.draw], rng);
  for (const q of hidden) q.hand = cards.splice(0, q.hand.length);
  g.draw = cards;
  return g;
}

/** `move` with its properties on the table swapped for their copies in `g`. */
function translate(move: Move, game: Game, g: Game): Move {
  if (move.type !== "action") return move;
  const copy = (x: Placed, seat: number) => g.players[seat].props[game.players[seat].props.indexOf(x)];
  return {
    ...move,
    take: move.take && copy(move.take, move.target!),
    give: move.give && copy(move.give, game.current),
  };
}
