import {
  assets,
  banked,
  COLOR_NAMES,
  colorsOf,
  defaultPolicy,
  fullColors,
  Game,
  heuristic,
  isAction,
  MAX_TURNS,
  type Move,
  moves,
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
import { discarded, paid, ranked, said } from "./learned.ts";

/** `defaultPolicy`'s steps, in its order. */
const DEFAULT = Object.keys(STEPS) as (keyof typeof STEPS)[];

/** Banks money first until the bank holds `amount`, so rent rarely costs properties. */
const cushion =
  (amount: number): Step =>
  (game, p) => {
    const money = p.hand.find((c) => c.kind === "money");
    return money && banked(p) < amount ? { type: "bank", card: money } : null;
  };

/** Banks any action or rent card. */
const bankAll: Step = (game, p) => {
  const card = p.hand.find((c) => c.kind === "action" || c.kind === "rent" || c.kind === "money");
  return card ? { type: "bank", card } : null;
};

/** A house or hotel on a full set that can take it. */
export const build: Step = (game, p, left) => moves(game, p, left).find((m) => m.type === "place" && m.card.kind === "action") ?? null;

// Whole-game strategies, each a player of its own, compared head to head in `scripts/strategies.ts`.
export const STRATEGIES: Record<string, (seed: number) => Policy> = {
  /** `defaultPolicy`: complete sets, steal, charge rent, bank, then lay down properties. */
  default: () => defaultPolicy,

  /** Lays down properties and builds houses and hotels before charging rent, like the first `defaultPolicy`. */
  builder: () => heuristic("passGo", "complete", "dealBreaker", "slyDeal", "place", build, "rent", "debtCollector", "birthday", "forcedDeal", "bank", "passGoLast"),

  /** Banks $10M before anything else, then plays like the default. */
  banker: () => heuristic(cushion(10), ...DEFAULT),

  /** Never takes from anyone: lays down properties and banks every action card. */
  pacifist: () => heuristic("passGo", "complete", "place", bankAll, "passGoLast"),

  /** Plays a legal move at random, or ends the turn. */
  random: (seed) => random(seed),

  /** Plays out the 5 moves `src/packed/model.ts` ranks highest on 160 deals, and makes the one that wins most. Pays, says no and discards by the learned models. */
  playouts: (seed) => {
    const rank = ranked();
    return { ...playouts(160, seed, defaultPolicy, 2, 2, (game, p, left) => rank(game, p, left).slice(0, 5)), pay: paid(), sayNo: said(), discard: discarded() };
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
  let stalled = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const policies = Array.from({ length: players }, (_, j) => (j === seat ? make(s) : field ? field(s + j) : defaultPolicy));
    const result = new Game({ players, rng: mulberry32(s), policies, first: 0 }).run();
    wins += +(result.winner === seat);
    stalled += +result.stalled;
  }
  return { wins, stalled };
}

const sameCards = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x) => b.includes(x));
const sameMove = (a: Move | null, b: Move | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.type === b.type &&
    a.card === b.card &&
    (a as { color?: string }).color === (b as { color?: string }).color &&
    (a as { target?: number }).target === (b as { target?: number }).target &&
    (a.type === "rent" ? a.doubles.length : 0) === (b.type === "rent" ? b.doubles.length : 0) &&
    (a.type === "action" ? a.take : undefined) === (b.type === "action" ? b.take : undefined) &&
    (a.type === "action" ? a.give : undefined) === (b.type === "action" ? b.give : undefined));

/**
 * `headToHead` against the default field, with the default also playing the same seat of the
 * same deals: `wins` for the player, `base` for the default, and the squared differences, for
 * the paired error. The default plays first while the player is asked what it would do, and the
 * deal is played again only if it would ever choose differently (`differed`), so a player a rule
 * away from the default costs little more than one game a deal, and deals where the rule never
 * comes up add no noise.
 */
export function paired(make: (seed: number) => Policy, players: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  let [wins, base, sq, differed] = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const player = make(s);
    let differs = false;
    const watcher: Policy = {
      move(game, p, left) {
        const move = defaultPolicy.move(game, p, left);
        differs ||= !sameMove(move, player.move(game, p, left));
        return move;
      },
      pay(game, p, amount) {
        const cards = defaultPolicy.pay(game, p, amount);
        differs ||= !sameCards(cards, player.pay(game, p, amount));
        return cards;
      },
      sayNo(game, p, move, from) {
        const no = defaultPolicy.sayNo(game, p, move, from);
        differs ||= no !== player.sayNo(game, p, move, from);
        return no;
      },
      discard(game, p, k) {
        const cards = defaultPolicy.discard(game, p, k);
        differs ||= !sameCards(cards, player.discard(game, p, k));
        return cards;
      },
    };
    const play = (policy: Policy) => +(new Game({ players, rng: mulberry32(s), policies: Array.from({ length: players }, (_, j) => (j === seat ? policy : defaultPolicy)), first: 0 }).run().winner === seat);
    const x = play(watcher);
    const y = differs ? play(player) : x;
    wins += y;
    base += x;
    sq += (x - y) ** 2;
    differed += +differs;
  }
  return { wins, base, sq, differed };
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
export function playouts(n: number, seed = 1, rollout = defaultPolicy, z = 2, rounds = 2, candidates = (game: Game, p: Player, left: number): (Move | null)[] => [null, ...moves(game, p, left)]): Policy {
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
        for (const m of alive) for (const s of seeds) wins[m].push(playout(game, p, options[m], [s], rollout, rounds * game.players.length));
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
 * `turns`, each game stops after that many more turns and scores `p`'s board with `chance`. The
 * others play like `field`.
 */
export function playout(game: Game, p: Player, move: Move | null, seeds: number[], rollout = defaultPolicy, turns = Infinity, field = rollout) {
  let wins = 0;
  for (const s of seeds) {
    const g = sample(game, p, mulberry32(s), rollout, field);
    const { winner, stalled, turns: played } = g.run(move && translate(move, game, g), game.turns + turns);
    wins += stalled && played < MAX_TURNS ? chance(g, p.seat) : +(winner === p.seat);
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
  const bank = banked(q);
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
  2: [1.01, 2.43, 0.39, 0.48, 0.19, 0.12, -0.14, -0.74, 1.33, 0.43, 0.16, 0.1, 0.25, -0.2, 1.13],
  3: [0.97, 2.51, 0.41, 0.49, 0.31, 0.07, 0.03, -0.83, 1.19, 0.35, 0.09, 0.09, 0.42, -0.15, 0.77],
  4: [0.99, 2.64, 0.49, 0.43, 0.42, -0.05, 0.51, -0.92, 0.89, 0.23, -0.04, 0.05, 0.41, -0.34, 0.06],
  5: [1.01, 2.54, 0.6, 0.34, 0.49, -0.11, 1.02, -1.02, 0.81, 0.16, -0.09, -0.01, 0.34, -0.44, -0.58],
};

/** `seat`'s chance to win from the board: a softmax over players of their weighted `features`. */
export function chance(game: Game, seat: number) {
  const weights = WEIGHTS[game.players.length];
  const scores = game.players.map((q) => Math.exp(features(game, q).reduce((s, x, i) => s + x * weights[i], 0)));
  return scores[seat] / scores.reduce((a, b) => a + b, 0);
}

/** A copy of `game` with the cards `p` can't see dealt again at random, `p` played by `rollout` and the others by `field`. */
function sample(game: Game, p: Player, rng: () => number, rollout: Policy, field: Policy): Game {
  const g = game.clone();
  g.rng = rng;
  g.policies = g.players.map((q) => (q.seat === p.seat ? rollout : field));
  const hidden = g.players.filter((q) => q.seat !== p.seat);
  const cards = shuffle([...hidden.flatMap((q) => q.hand), ...g.draw], rng);
  for (const q of hidden) q.hand = cards.splice(0, q.hand.length);
  g.draw = cards;
  return g;
}

/** `move` with its properties on the table swapped for their copies in `g`. */
export function translate(move: Move, game: Game, g: Game): Move {
  if (move.type !== "action") return move;
  const copy = (x: Placed, seat: number) => g.players[seat].props[game.players[seat].props.indexOf(x)];
  return {
    ...move,
    take: move.take && copy(move.take, move.target!),
    give: move.give && copy(move.give, game.current),
  };
}
