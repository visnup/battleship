import { defaultPolicy, Game, HANDS, mulberry32, type Play, type Player, type Policy, share, shuffle, TARGET, total, winning } from "./game.ts";

/** Takes the lead whenever it can without busting, with its biggest card, and otherwise plays its smallest, all face up. */
const greedy: Policy = {
  play(game, p) {
    const plays = game
      .legal(p)
      .filter((x) => !x.down)
      .sort((a, b) => a.card.value - b.card.value);
    return plays.filter((x) => winning(game, x) && total(p) + x.card.value <= TARGET).at(-1) ?? plays[0];
  },
};

// Whole-game strategies, each a player of its own, compared head to head in `scripts/strategies.ts`.
export const STRATEGIES: Record<string, (seed: number) => Policy> = {
  /** `defaultPolicy`: take sure wins up to 25, else duck under the trick dumping the biggest card. */
  default: () => defaultPolicy,

  /** The default without face-down plays: never uses the magenta 5. The online game's easy bot. */
  "face up": () => ({ play: (game, p) => pick(defaultPolicy, game, p) }),

  /** Takes the lead whenever it can without busting, with its biggest card, and otherwise plays its smallest. */
  greedy: () => greedy,

  /** Plays a legal card at random. */
  random: (seed) => random(seed),

  /** Plays out every legal play to the end on 32 deals of the hidden cards, and makes the one that wins most. The online game's hard bot plays 16. */
  playouts: (seed) => playouts(32, seed),
  "quick playouts": (seed) => playouts(16, seed),
  "deep playouts": (seed) => playouts(128, seed),
  "racing playouts": (seed) => playouts(128, seed, defaultPolicy, 2),
  /** Playouts to the end of the hand only, scored by `chance`: a fraction of the cost, and less noise. */
  "hand playouts": (seed) => playouts(32, seed, defaultPolicy, 0, 1),
  "quick hand playouts": (seed) => playouts(16, seed, defaultPolicy, 0, 1),
};

/** `policy`'s play from only the face-up plays. */
function pick(policy: Policy, game: Game, p: Player): Play {
  const legal = game.legal.bind(game);
  game.legal = (q) => legal(q).filter((x) => !x.down);
  try {
    return policy.play(game, p);
  } finally {
    delete (game as Partial<Game>).legal;
  }
}

/** One player of `make` against `field` (the default player) everywhere else, rotating seats. Wins count a share when tied. */
export function headToHead(make: (seed: number) => Policy, players: number, seed: number, n: number, field?: (seed: number) => Policy) {
  const seeds = mulberry32(seed);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const seat = i % players;
    const policies = Array.from({ length: players }, (_, j) => (j === seat ? make(s) : field ? field(s + j) : defaultPolicy));
    wins += share(new Game({ players, rng: mulberry32(s), policies }).run().winners, seat);
  }
  return { wins };
}

/** Plays a legal card at random. */
export function random(seed = 1): Policy {
  const rng = mulberry32(seed);
  return {
    play(game, p) {
      const options = game.legal(p);
      return options[Math.floor(rng() * options.length)];
    },
  };
}

/**
 * Plays out every legal play with `rollout` for everyone, and makes the one that wins most. Each
 * playout first deals the cards `p` can't see again, so it doesn't peek. With `z`, plays race on
 * shared deals, 8 at a time, and a play drops out once it's `z` standard errors of the paired
 * difference behind the leader, until `n` deals a play. With `hands`, each playout stops once
 * that many more hands have been dealt and is scored by `chance`.
 */
export function playouts(n: number, seed = 1, rollout = defaultPolicy, z = 0, hands = HANDS): Policy {
  const rng = mulberry32(seed);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    play(game, p) {
      const options = game.legal(p);
      if (options.length === 1) return options[0];
      const wins = options.map(() => [] as number[]);
      let alive = options.map((_, i) => i);
      const step = z ? 8 : n;
      for (let dealt = 0; dealt < n && alive.length > 1; dealt += step) {
        const seeds = Array.from({ length: step }, () => Math.floor(rng() * 2 ** 32));
        for (const m of alive) for (const s of seeds) wins[m].push(playout(game, p, options[m], [s], rollout, hands));
        if (!z) break;
        const lead = alive.reduce((a, b) => (sum(wins[b]) > sum(wins[a]) ? b : a));
        alive = alive.filter((m) => {
          const d = wins[m].map((w, i) => wins[lead][i] - w);
          const mean = sum(d) / d.length;
          const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (d.length - 1)) || 1 / Math.sqrt(d.length);
          return m === lead || mean < (z * sd) / Math.sqrt(d.length);
        });
      }
      return options[alive.reduce((a, b) => (sum(wins[b]) > sum(wins[a]) ? b : a))];
    },
  };
}

/**
 * How many of the games from `seeds` `p` wins making `play` now, then playing like `rollout`:
 * played to the end, or for `hands` more hands and scored by `chance`.
 */
export function playout(game: Game, p: Player, play: Play, seeds: number[], rollout: Policy | Policy[] = defaultPolicy, hands = HANDS) {
  let wins = 0;
  for (const s of seeds) {
    const g = sample(game, p, mulberry32(s), rollout);
    const { winners } = g.run(play, hands);
    wins += winners ? share(winners, p.seat) : chance(g, p.seat);
  }
  return wins;
}

/**
 * A copy of `game` with the cards `p` can't see dealt again at random, everyone played by
 * `rollout`, or each seat by its own. Nobody's dealt a color they've shown they're out of; the
 * cards others played face down are among those dealt again.
 */
export function sample(game: Game, p: Player, rng: () => number, rollout: Policy | Policy[]): Game {
  const g = game.clone();
  g.rng = rng;
  g.log = undefined;
  g.policies = g.players.map((_, i) => (Array.isArray(rollout) ? rollout[i] : rollout));
  const hidden = g.players.filter((q) => q.seat !== p.seat);
  const pool = hidden.flatMap((q) => [...q.hand, ...q.hidden]);
  // the most constrained hands first; a deal that runs out tries again, and after 50 ignores what's shown
  const order = [...hidden].sort((a, b) => b.voids.length - a.voids.length);
  for (let attempt = 0; ; attempt++) {
    let cards = shuffle(pool, rng);
    const hands = new Map<Player, typeof cards>();
    let ok = true;
    for (const q of order) {
      const fits = attempt < 50 ? cards.filter((c) => !q.voids.includes(c.color)) : cards;
      if (fits.length < q.hand.length) {
        ok = false;
        break;
      }
      const hand = fits.slice(0, q.hand.length);
      hands.set(q, hand);
      cards = cards.filter((c) => !hand.includes(c));
    }
    if (!ok) continue;
    for (const q of hidden) {
      q.hand = hands.get(q)!;
      q.hidden = cards.splice(0, q.hidden.length);
    }
    return g;
  }
}

/** What `chance` weighs for each player at the end of a hand: chips, and whether no one has more. */
export const features = (game: Game, p: Player) => [p.chips, +game.players.every((q) => q.chips <= p.chips)];

/**
 * Weights of `features` by player count and hands left, fitted by `scripts/chance.ts --model
 * dataset/model-r6-rollout.json` to learned players' games. Fit to default players' games, a chip
 * was worth 40–60% less, and playouts scored by those undervalued chips.
 */
const WEIGHTS: Record<number, number[][]> = {
  // 1, 2 and 3 hands left; log loss 0.620, 0.831 and 0.978 against 1.099 for a guess
  3: [
    [0.824, -0.963],
    [0.414, -0.02],
    [0.391, -0.15],
  ],
  // log loss 0.743, 1.016 and 1.220 against 1.386
  4: [
    [0.661, -0.783],
    [0.397, -0.173],
    [0.32, -0.054],
  ],
};

/** `seat`'s chance to win from the chips at the start of a hand: a softmax over players of their weighted `features`. */
export function chance(game: Game, seat: number) {
  const w = WEIGHTS[game.players.length][HANDS - game.hand];
  const e = game.players.map((q) => Math.exp(features(game, q).reduce((s, v, i) => s + v * (w[i] ?? 0), 0)));
  return e[seat] / e.reduce((a, b) => a + b, 0);
}
