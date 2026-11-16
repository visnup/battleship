import { parseArgs } from "node:util";
import { type Card, defaultPolicy, Game, loose, mulberry32, type Placed, type Player, type Policy, shuffle } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { chance } from "../src/strategies.ts";

// What to pay with, by playouts. A payment happens mid-turn, often someone else's, so a copy of
// the game can't simply play on from it. Instead each payment is reached again by replaying the
// game from its seed, where the default player, which has no randomness, makes the same choices;
// there the cards the payer can't see are reshuffled, the payment is made, and the game goes on
// for two rounds before `chance` scores it.

type Piece = Card | Placed;
class Stop {}

/** Everything `p` could pay with, in a fixed order, so a payment can be named by indices. */
const pieces = (p: Player): Piece[] => [...p.bank, ...p.built, ...p.props.filter((x) => x.card.value > 0)];
const value = (x: Piece) => ("kind" in x ? x.value : x.card.value);

/** The payments where no piece could be left out, plus the default's, as indices into `pieces`. */
function options(game: Game, p: Player, amount: number, cap = 200): number[][] {
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
  const key = (o: number[]) => o.map((j) => label1(game, p, all[j])).sort().join();
  const seen = new Set<string>();
  return [mine, ...found].filter((o) => !seen.has(key(o)) && seen.add(key(o)));
}

const label1 = (game: Game, p: Player, x: Piece) =>
  "kind" in x ? `$${x.value}${x.kind === "money" ? "" : "a"}` : p.built.includes(x) ? "building" : `${x.color}${loose(game, p, x) ? "" : "!"}`;

/** What kind of payment `o` is: from the bank, loose properties, or a full set. */
function kind(game: Game, p: Player, o: number[]): string {
  const all = pieces(p);
  const parts = new Set(o.map((j) => all[j]).map((x) => ("kind" in x ? "bank" : p.built.includes(x) ? "building" : loose(game, p, x) ? "loose property" : "set property")));
  return ["bank", "building", "loose property", "set property"].filter((k) => parts.has(k)).join(" + ") || "nothing";
}

/**
 * Plays game `seed` again up to seat 0's `k`th payment with a choice, reshuffles what seat 0 can't
 * see with `shuffleSeed`, pays with `choice`, and scores seat 0 two rounds later.
 */
function replay(players: number, seed: number, first: number, k: number, choice: number[], shuffleSeed: number): number {
  let n = 0;
  let limit = Infinity;
  const timed: Policy = {
    ...defaultPolicy,
    move(game, p, left) {
      if (game.turns > limit) throw new Stop();
      return defaultPolicy.move(game, p, left);
    },
  };
  const payer: Policy = {
    ...timed,
    pay(game, p, amount) {
      if (pieces(p).reduce((s, x) => s + value(x), 0) <= amount || n++ !== k) return defaultPolicy.pay(game, p, amount);
      const rng = mulberry32(shuffleSeed);
      game.rng = rng;
      const hidden = game.players.filter((q) => q !== p);
      const cards = shuffle([...hidden.flatMap((q) => q.hand), ...game.draw], rng);
      for (const q of hidden) q.hand = cards.splice(0, q.hand.length);
      game.draw = cards;
      limit = game.turns + 2 * players;
      const all = pieces(p);
      return choice.map((j) => all[j]);
    },
  };
  const g = new Game({ players, rng: mulberry32(seed), policies: Array.from({ length: players }, (_, j) => (j === 0 ? payer : timed)), first });
  try {
    const { winner } = g.run();
    return +(winner === 0);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    return chance(g, 0);
  }
}

/**
 * At each of seat 0's payments with a choice in `n` default games, plays every option on 40 shared
 * shuffles. When another beats the default's, both are played again on 200 fresh ones, and the row
 * records the gain there.
 */
export function search(players: number, seed: number, n: number) {
  const seeds = mulberry32(seed);
  const rows: { mine: string; best: string; gain: number; options: number }[] = [];
  let count = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(seeds() * 2 ** 32);
    const first = i % players;
    const found: { k: number; opts: number[][]; kinds: string[] }[] = [];
    let k = 0;
    const watcher: Policy = {
      ...defaultPolicy,
      pay(game, p, amount) {
        if (pieces(p).reduce((s, x) => s + value(x), 0) > amount) {
          const opts = options(game, p, amount);
          if (opts.length > 1) found.push({ k, opts, kinds: opts.map((o) => kind(game, p, o)) });
          k++;
        }
        return defaultPolicy.pay(game, p, amount);
      },
    };
    new Game({ players, rng: mulberry32(s), policies: Array.from({ length: players }, (_, j) => (j === 0 ? watcher : defaultPolicy)), first }).run();
    for (const { k, opts, kinds } of found) {
      count++;
      const draw = (m: number) => Array.from({ length: m }, () => Math.floor(seeds() * 2 ** 32));
      const shared = draw(40);
      const score = opts.map((o) => shared.reduce((a, t) => a + replay(players, s, first, k, o, t), 0));
      const best = score.indexOf(Math.max(...score));
      if (best === 0) continue;
      const fresh = draw(200);
      const gain = fresh.reduce((a, t) => a + replay(players, s, first, k, opts[best], t) - replay(players, s, first, k, opts[0], t), 0) / fresh.length;
      rows.push({ mine: kinds[0], best: kinds[best], gain, options: opts.length });
    }
  }
  return { count, rows };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "256" }, players: { type: "string", default: "5" }, min: { type: "string", default: "10" } } });
  const n = Number(args.n);
  const { count, rows } = await parallel<ReturnType<typeof search>>(import.meta.url, "search", [Number(args.players)], n, (a, b) => ({ count: a.count + b.count, rows: a.rows.concat(b.rows) }));
  const total = rows.reduce((s, r) => s + r.gain, 0);
  console.log(`${count} payments with a choice in ${n} games of ${args.players}; playouts chose another in ${rows.length}.`);
  console.log(`Their gain, rechecked on fresh shuffles, sums to ${(total / n).toFixed(3)} wins a game.\n`);
  console.log("| default → playouts | times | gain each | gain a game |");
  console.log("| --- | --- | --- | --- |");
  const groups = Map.groupBy(rows, (r) => `${r.mine} → ${r.best}`);
  for (const [group, rs] of [...groups].sort((a, b) => b[1].reduce((s, r) => s + r.gain, 0) - a[1].reduce((s, r) => s + r.gain, 0))) {
    if (rs.length < Number(args.min)) continue;
    const sum = rs.reduce((s, r) => s + r.gain, 0);
    console.log(`| ${group} | ${rs.length} | ${((100 * sum) / rs.length).toFixed(1)} | ${((100 * sum) / n).toFixed(2)} |`);
  }
}
