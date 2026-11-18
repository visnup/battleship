import { defaultPolicy, Game, mulberry32, type Policy, shuffle } from "../src/game.ts";
import { chance } from "../src/strategies.ts";

// Playouts at decisions that come mid-turn, often someone else's: payments and Just Say No. A copy
// of the game can't play on from inside a turn, so each decision is reached again by replaying the
// game from its seed, where default players, which have no randomness, make the same choices.
// There the cards seat 0 can't see are reshuffled, the decision is made, and the game goes on for
// two rounds before `chance` scores it.

type Hook = "pay" | "sayNo";
type Args<H extends Hook> = Parameters<Policy[H]>;
type Result<H extends Hook> = ReturnType<Policy[H]>;
class Stop {}

/** Plays game `seed` with default players, calling `see` at each of seat 0's `hook` decisions that `counts`. */
export function watch<H extends Hook>(hook: H, players: number, seed: number, first: number, counts: (...a: Args<H>) => boolean, see: (k: number, ...a: Args<H>) => void) {
  let k = 0;
  const watcher = {
    ...defaultPolicy,
    [hook](...a: Args<H>) {
      if (counts(...a)) see(k++, ...a);
      return (defaultPolicy[hook] as (...a: Args<H>) => Result<H>)(...a);
    },
  } as Policy;
  new Game({ players, rng: mulberry32(seed), policies: Array.from({ length: players }, (_, j) => (j === 0 ? watcher : defaultPolicy)), first }).run();
}

/**
 * Seat 0's chance two rounds after its `k`th counted `hook` decision in game `seed`, made by
 * `decide`, with what seat 0 can't see reshuffled by `shuffleSeed`.
 */
export function replay<H extends Hook>(hook: H, players: number, seed: number, first: number, counts: (...a: Args<H>) => boolean, k: number, decide: (...a: Args<H>) => Result<H>, shuffleSeed: number): number {
  let n = 0;
  let limit = Infinity;
  const timed: Policy = {
    ...defaultPolicy,
    move(game, p, left) {
      if (game.turns > limit) throw new Stop();
      return defaultPolicy.move(game, p, left);
    },
  };
  const seat0 = {
    ...timed,
    [hook](...a: Args<H>) {
      if (!counts(...a) || n++ !== k) return (defaultPolicy[hook] as (...a: Args<H>) => Result<H>)(...a);
      const [game, p] = a as unknown as [Game, Game["players"][number]];
      const rng = mulberry32(shuffleSeed);
      game.rng = rng;
      const hidden = game.players.filter((q) => q !== p);
      const cards = shuffle([...hidden.flatMap((q) => q.hand), ...game.draw], rng);
      for (const q of hidden) q.hand = cards.splice(0, q.hand.length);
      game.draw = cards;
      limit = game.turns + 2 * players;
      return decide(...a);
    },
  } as Policy;
  const g = new Game({ players, rng: mulberry32(seed), policies: Array.from({ length: players }, (_, j) => (j === 0 ? seat0 : timed)), first });
  try {
    return +(g.run().winner === 0);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    return chance(g, 0);
  }
}

/** A decision's options, the default's first, each with a label for grouping. */
type Options<H extends Hook> = { decide: (...a: Args<H>) => Result<H>; label: string }[];

/**
 * At each of seat 0's counted `hook` decisions in `n` default games, plays every option from
 * `options` on 40 shared shuffles. When another beats the default's, both are played again on 200
 * fresh ones, and the row records the gain there.
 */
export function search<H extends Hook>(hook: H, players: number, seed: number, n: number, counts: (...a: Args<H>) => boolean, options: (...a: Args<H>) => Options<H>) {
  const seeds = mulberry32(seed);
  const rows: { mine: string; best: string; gain: number }[] = [];
  let count = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const first = i % players;
    const found: { k: number; opts: Options<H> }[] = [];
    watch(hook, players, s, first, counts, (k, ...a) => {
      const opts = options(...a);
      if (opts.length > 1) found.push({ k, opts });
    });
    for (const { k, opts } of found) {
      count++;
      const play = (o: Options<H>[number], t: number) => replay(hook, players, s, first, counts, k, o.decide, t);
      const draw = (m: number) => Array.from({ length: m }, () => Math.floor(seeds() * 2 ** 32));
      const shared = draw(40);
      const score = opts.map((o) => shared.reduce((a, t) => a + play(o, t), 0));
      const best = score.indexOf(Math.max(...score));
      if (best === 0) continue;
      const fresh = draw(200);
      const gain = fresh.reduce((a, t) => a + play(opts[best], t) - play(opts[0], t), 0) / fresh.length;
      rows.push({ mine: opts[0].label, best: opts[best].label, gain });
    }
  }
  return { count, rows };
}

/** Prints `search`'s rows grouped by default → playouts, most gain first. */
/** Two chunks of `search`-like results as one, for `parallel`. */
export const merge = <T extends { count: number; rows: unknown[] }>(a: T, b: T): T => ({ ...a, count: a.count + b.count, rows: a.rows.concat(b.rows) });

export function report({ count, rows }: ReturnType<typeof search>, what: string, n: number, players: number, min: number) {
  const total = rows.reduce((s, r) => s + r.gain, 0);
  console.log(`${count} ${what} with a choice in ${n} games of ${players}; playouts chose another in ${rows.length}.`);
  console.log(`Their gain, rechecked on fresh shuffles, sums to ${(total / n).toFixed(3)} wins a game.\n`);
  console.log("| default → playouts | times | gain each | gain a game |");
  console.log("| --- | --- | --- | --- |");
  const groups = Map.groupBy(rows, (r) => `${r.mine} → ${r.best}`);
  for (const [group, rs] of [...groups].sort((a, b) => b[1].reduce((s, r) => s + r.gain, 0) - a[1].reduce((s, r) => s + r.gain, 0))) {
    if (rs.length < min) continue;
    const sum = rs.reduce((s, r) => s + r.gain, 0);
    console.log(`| ${group} | ${rs.length} | ${((100 * sum) / rs.length).toFixed(1)} | ${((100 * sum) / n).toFixed(2)} |`);
  }
}
