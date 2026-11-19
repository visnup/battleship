import { COLORS } from "./cards.ts";
import { learned, ranked } from "./learned.ts";
import { defaultPolicy, Game, heuristic, type Move, moves, mulberry32, type Player, type Policy, shuffle, type Step } from "./game.ts";

/** Takes the lead with the cheapest card that does it, however much the battle has cost. */
const chaseAll: Step = (game, p) => {
  if (game.leader() === p.seat) return undefined;
  const c = p.hand.filter((c) => c.kind !== "bait" && c.kind !== "doves" && game.playable(p, c)).sort((a, b) => a.value - b.value);
  for (const card of c) {
    p.row.push(card);
    const leads = game.leader() === p.seat;
    p.row.pop();
    if (leads) return { card };
  }
  return undefined;
};

/** Crows whenever ahead, as the first five defaults played it. */
export const crowsAhead: Step = (game, p) => {
  const card = p.hand.find((c) => c.kind === "crows");
  return card && game.leader() === p.seat ? { card } : undefined;
};

// Whole-game strategies, each a player of its own, compared head to head in `scripts/strategies.ts`.
export const STRATEGIES: Record<string, (seed: number) => Policy> = {
  /** `defaultPolicy`: stop when ahead, Crows to win, Doves to deny, chase up to 3 cards, then Bait back. */
  default: () => defaultPolicy,

  /** The first default: chase every battle up to 3 cards, Crows whenever ahead, then Bait back. The online game's easy bot. */
  "first default": () => heuristic("stop", crowsAhead, "doves", "chase", "bait"),

  /** Chases every battle with no limit on cards. */
  spender: () => heuristic("stop", "crows", "doves", chaseAll, "bait"),

  /** Never plays a card except Crows and Doves: wins only on the Favor's 1 strength. */
  passive: () => heuristic("stop", "crows", "doves"),

  /** The default without Bait. */
  "no bait": () => heuristic("stop", "crows", "doves", "chase"),

  /** Plays a legal move at random, or passes. */
  random: (seed) => random(seed),

  /** Plays out every legal move to the end on 32 deals of the hidden cards, and makes the one that wins most. */
  playouts: (seed) => playouts(32, seed),
  "quick playouts": (seed) => playouts(8, seed),
  "deep playouts": (seed) => playouts(128, seed),
  /** The default, but making the move `src/model.json` ranks first: trees fit to every move's value in playouts among learned players (`learn.py`). */
  learned: () => learned(),
  "racing playouts": (seed) => playouts(128, seed, defaultPolicy, 2),
  "long racing playouts": (seed) => playouts(512, seed, defaultPolicy, 2),
  /** Racing playouts of only the model's top 3 moves. */
  "pruned racing playouts": (seed) => playouts(128, seed, defaultPolicy, 2, 3),
  "long pruned racing playouts": (seed) => playouts(512, seed, defaultPolicy, 2, 3),
};

/** One player of `make` against `field` (the default player) everywhere else, rotating seats. */
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

/** Plays a legal move at random, or passes. */
export function random(seed = 1): Policy {
  const rng = mulberry32(seed);
  return {
    ...defaultPolicy,
    move(game, p) {
      const options = moves(game, p);
      return options[Math.floor(rng() * options.length)];
    },
  };
}

/**
 * Plays out every legal move, and passing, with `rollout` for everyone, and makes the move that
 * wins most. Each playout first deals the cards `p` can't see again, so it doesn't peek. With
 * `z`, moves race on shared deals, 8 at a time, and a move drops out once it's `z` standard errors
 * of the paired difference behind the leader, until `n` deals a move. With `top`, only the moves
 * `src/model.json` ranks highest are played out.
 */
export function playouts(n: number, seed = 1, rollout = defaultPolicy, z = 0, top = Infinity): Policy {
  const rng = mulberry32(seed);
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const rank = top < Infinity ? ranked() : undefined;
  return {
    ...defaultPolicy,
    move(game, p) {
      const options = rank ? rank(game, p).slice(0, top) : moves(game, p);
      if (options.length === 1) return options[0];
      const wins = options.map(() => [] as number[]);
      let alive = options.map((_, i) => i);
      const step = z ? 8 : n;
      for (let dealt = 0; dealt < n && alive.length > 1; dealt += step) {
        const seeds = Array.from({ length: step }, () => Math.floor(rng() * 2 ** 32));
        for (const m of alive) for (const s of seeds) wins[m].push(playout(game, p, options[m], [s], rollout));
        if (!z) break;
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

/** `policy`, but picking the chip by playing out each color on `n` shared deals. */
export function colorPlayouts(policy: Policy, n: number, seed = 1, rollout = defaultPolicy): Policy {
  const rng = mulberry32(seed);
  return {
    ...policy,
    color(game, p) {
      const seeds = Array.from({ length: n }, () => Math.floor(rng() * 2 ** 32));
      const wins = COLORS.map((c) => {
        let w = 0;
        for (const s of seeds) {
          const g = sample(game, p, mulberry32(s), rollout);
          g.color = c;
          w += +(g.run().winner === p.seat);
        }
        return w;
      });
      return COLORS[wins.indexOf(Math.max(...wins))];
    },
  };
}

/** `policy`, but deciding whether to discard a hand of no force cards by playing out both on `n` shared deals. */
export function dumpPlayouts(policy: Policy, n: number, seed = 1, rollout = defaultPolicy): Policy {
  const rng = mulberry32(seed);
  return {
    ...policy,
    dump(game, p) {
      const seeds = Array.from({ length: n }, () => Math.floor(rng() * 2 ** 32));
      const [keep, dump] = [false, true].map((discard) => {
        let w = 0;
        for (const s of seeds) {
          const g = sample(game, p, mulberry32(s), rollout);
          if (discard) g.pile.push(...g.players[p.seat].hand.splice(0));
          g.next();
          w += +(g.run().winner === p.seat);
        }
        return w;
      });
      return dump >= keep;
    },
  };
}

/** How many of the games from `seeds` `p` wins making `move` now, then playing like `rollout`. */
export function playout(game: Game, p: Player, move: Move, seeds: number[], rollout = defaultPolicy) {
  let wins = 0;
  for (const s of seeds) {
    const g = sample(game, p, mulberry32(s), rollout);
    wins += +(g.run(move).winner === p.seat);
  }
  return wins;
}

/** A copy of `game` with the cards `p` can't see dealt again at random, everyone played by `rollout`. */
export function sample(game: Game, p: Player, rng: () => number, rollout: Policy): Game {
  const g = game.clone();
  g.rng = rng;
  g.log = undefined;
  g.policies = g.players.map(() => rollout);
  const hidden = g.players.filter((q) => q.seat !== p.seat);
  const cards = shuffle([...hidden.flatMap((q) => q.hand), ...g.stock], rng);
  for (const q of hidden) q.hand = cards.splice(0, q.hand.length);
  g.stock = cards;
  return g;
}
