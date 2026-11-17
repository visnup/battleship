import {
  assets,
  buildable,
  COLOR_NAMES,
  colorsOf,
  defaultPolicy,
  fullColors,
  Game,
  heuristic,
  isAction,
  loose,
  MAX_TURNS,
  type Move,
  mulberry32,
  type Placed,
  type Player,
  type Policy,
  progress as progressOf,
  rent,
  STEPS,
  shuffle,
  type Step,
} from "./game.ts";
import type { Card } from "./cards.ts";
import { ranked } from "./learned.ts";

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

  /** Plays out the 5 moves `src/model.json` ranks highest on 160 deals, and makes the one that wins most. */
  "playouts": (seed) => {
    const rank = ranked();
    return playouts(160, seed, defaultPolicy, 2, 2, (game, p, left) => rank(game, p, left).slice(0, 5));
  },

  /** Playouts on 16 deals, each cut off after one round: a strong player that's still quick. */
  "quick playouts": (seed) => playouts(16, seed, defaultPolicy, 2, 1),
};

/**
 * Plays `n` games of one player made by `make` against `defaultPolicy`, or players made by `field`,
 * everywhere else, taking each seat in turn, and counts its wins.
 */
export function headToHead(make: (seed: number) => Policy, players: number, seed: number, n: number, field?: (seed: number) => Policy) {
  const seeds = mulberry32(seed);
  let wins = 0;
  let turns = 0;
  let stalled = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const policies = Array.from({ length: players }, (_, j) => (j === seat ? make(s) : field ? field(s + j) : defaultPolicy));
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
      // One color is enough: `arrange` moves wilds to their best color after every play
      out.push({ type: "place", card, color: colorsOf(card)[0] });
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
  // Identical cards of one player are the same move
  const looseOf = (q: Player) => [...new Map(q.props.filter((x) => loose(game, q, x)).map((x) => [JSON.stringify(x), x])).values()];
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
 * Plays out every legal move, and ending the turn, with `rollout` for everyone, and makes the
 * move that wins most. Each playout first shuffles the cards `p` can't see, the other hands and
 * the draw pile, so it doesn't peek, and stops after `rounds` rounds, scored by `chance`. Against
 * playing to the end, two rounds are 2.6× faster at 5 players and 3.7× at 2, and pick better
 * moves (each pick valued on 1,000 full deals: 0.73 ± 0.12 points from the best a decision
 * against 1.21 ± 0.17 at 5 players, 0.54 ± 0.08 against 1.03 ± 0.14 at 2), probably because the
 * end of a game is mostly noise. One round is faster still and worse. Moves race on shared shuffles, 8 at a time, so they differ
 * by the move and not by the luck of the deal: a move drops out once it's `z` standard errors
 * of the paired difference behind the leader, and the race stops at `n` deals a move. Easy
 * decisions end after a round or two. Against `n` deals for every move, this loses no decision
 * quality at 5 players on two thirds of the playouts, and a little at 2 on four fifths. Halving,
 * dropping the worse half after 8 deals, then 16, and so on, only matched it at equal cost.
 */
export function playouts(n: number, seed = 1, rollout = defaultPolicy, z = 2, rounds = 2, candidates = (game: Game, p: Player, left: number): (Move | null)[] => [null, ...moves(game, p, left)], leaf = chance): Policy {
  const rng = mulberry32(seed);
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    ...defaultPolicy,
    move(game, p, left) {
      const options = candidates(game, p, left);
      if (options.length === 1) return options[0];
      const wins = options.map(() => [] as number[]);
      let alive = options.map((_, i) => i);
      for (let dealt = 0; dealt < n && alive.length > 1; dealt += 8) {
        const seeds = Array.from({ length: 8 }, () => Math.floor(rng() * 2 ** 32));
        for (const m of alive) for (const s of seeds) wins[m].push(playout(game, p, options[m], [s], rollout, rounds * game.players.length, leaf));
        const lead = alive.reduce((a, b) => (total(wins[b]) > total(wins[a]) ? b : a));
        alive = alive.filter((m) => {
          const d = wins[m].map((w, i) => wins[lead][i] - w);
          const mean = total(d) / d.length;
          const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (d.length - 1)) || 1 / Math.sqrt(d.length);
          return m === lead || mean < (z * sd) / Math.sqrt(d.length);
        });
      }
      return options[alive.reduce((a, b) => (total(wins[b]) > total(wins[a]) ? b : a))];
    },
  };
}

/**
 * How many of the games from `seeds` `p` wins making `move` now, then playing like `rollout`. With
 * `turns`, each game stops after that many more turns and scores `p`'s board with `leaf`.
 */
export function playout(game: Game, p: Player, move: Move | null, seeds: number[], rollout = defaultPolicy, turns = Infinity, leaf = chance) {
  let wins = 0;
  for (const s of seeds) {
    const g = sample(game, p, mulberry32(s), rollout);
    const { winner, stalled, turns: played } = g.run(move && translate(move, game, g), game.turns + turns);
    wins += stalled && played < MAX_TURNS ? leaf(g, p.seat) : +(winner === p.seat);
  }
  return wins;
}

/** What `chance` weighs for each player. */
export function features(game: Game, q: Player): number[] {
  let progress = 0;
  let nearest = 0;
  for (const c of COLOR_NAMES) {
    const x = progressOf(game, q, c);
    if (x < 1) [progress, nearest] = [progress + x, Math.max(nearest, x)];
  }
  const full = fullColors(game, q).length;
  const bank = q.bank.reduce((s, c) => s + c.value, 0);
  const held = (...actions: string[]) => q.hand.filter((c) => actions.some((a) => isAction(c, a))).length;
  return [
    +(full === 1),
    +(full === 2),
    progress,
    nearest,
    Math.min(bank, 20) / 10,
    (assets(q) - bank) / 10,
    q.hand.length / 7,
    ((q.seat - game.current + game.players.length) % game.players.length) / game.players.length,
    held("dealBreaker"),
    held("justSayNo"),
    held("slyDeal", "forcedDeal"),
    COLOR_NAMES.filter((c) => progressOf(game, q, c) >= 0.5 && progressOf(game, q, c) < 1).length / 3,
    q.hand.filter((c) => c.kind === "rent" && colorsOf(c).some((color) => rent(game, q, color) >= 3)).length / 2,
    q.hand.reduce((s, c) => s + (c.kind === "money" ? c.value : 0), 0) / 10,
    q.hand.filter((c) => c.kind === "property" || c.kind === "wild").length / 7,
  ];
}

/**
 * Weights of `features` by player count, fitted by `scripts/chance.ts` to default-player games.
 * Refit them when the default player changes.
 */
const WEIGHTS: Record<number, number[]> = {
  2: [1.07, 2.56, 0.47, 0.62, 0.29, 0.03, -0.07, -0.83, 1.49, 0.45, 0.17, 0.08, 0.31, -0.21, 0.96],
  3: [1.03, 2.56, 0.48, 0.32, 0.35, 0, 0.1, -0.86, 1.22, 0.41, 0.1, 0.18, 0.44, -0.11, 0.57],
  4: [1.02, 2.67, 0.56, 0.33, 0.42, -0.06, 0.5, -0.94, 0.83, 0.24, 0.04, 0.05, 0.66, -0.37, -0.07],
  5: [1.01, 2.56, 0.61, 0.49, 0.46, -0.12, 0.75, -1.03, 0.73, 0.26, -0.09, -0.09, 0.47, -0.44, -0.55],
};

/** `seat`'s chance to win from the board: a softmax over players of their weighted `features`. */
export function chance(game: Game, seat: number, weights = WEIGHTS[game.players.length]) {
  const scores = game.players.map((q) => Math.exp(features(game, q).reduce((s, x, i) => s + x * weights[i], 0)));
  return scores[seat] / scores.reduce((a, b) => a + b, 0);
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
