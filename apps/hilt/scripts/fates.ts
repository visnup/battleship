import { parseArgs } from "node:util";
import { COLORS } from "../src/cards.ts";
import { decisive, defaultPolicy, Game, type Move, mulberry32, needed, others, type Player, type Policy } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";
import { playout } from "../src/strategies.ts";

type Groups = Record<string, { n: number; gain: number; better: number }>;

/** The default's move as if Doves weren't in `p`'s hand. */
function without(game: Game, p: Player): Move {
  const hand = p.hand;
  p.hand = hand.filter((c) => c.kind !== "doves");
  const m = p.hand.length ? defaultPolicy.move(game, p) : null;
  p.hand = hand;
  return m;
}

const bucket = (x: number, cuts: number[]) => (cuts.findIndex((c) => x <= c) < 0 ? `>${cuts.at(-1)}` : `≤${cuts[cuts.findIndex((c) => x <= c)]}`);

/** Where `p` stands when Doves is playable, along several dimensions, each a key to group by. */
function where(game: Game, p: Player): string[] {
  const leader = game.players[game.leader()];
  const rest = others(game, p);
  const alive = rest.filter((q) => !q.passed);
  const mine = decisive(game, p);
  const theirs = rest.some((q) => decisive(game, q));
  const stakes = mine && theirs ? "both" : mine ? "yours" : theirs ? (decisive(game, leader) ? "theirs, leading" : "theirs, not leading") : "neither";
  const spent = rest.reduce((s, q) => s + q.row.length, 0);
  const force = p.hand.filter((c) => c.kind === "force" || c.kind === "legend").reduce((s, c) => s + c.value, 0);
  const color = COLORS.indexOf(game.color!);
  return [
    `chip wins the game for: ${stakes}`,
    `others still in: ${alive.length}`,
    `your cards down: ${Math.min(p.row.length, 3)}`,
    `leader's cards down: ${Math.min(leader.row.length, 3)}`,
    `share of the leader's hand they've put down: ${bucket(leader.row.length / (leader.row.length + leader.hand.length), [0.1, 0.25, 0.5])}`,
    `cards left in the leader's hand: ${bucket(leader.hand.length, [2, 5, 8])}`,
    `leader's strength down: ${bucket(game.strength(leader), [5, 10, 20])}`,
    `others' cards down: ${bucket(spent, [0, 2, 4])}`,
    `Favor: ${game.favor === p.seat ? "yours" : game.favor === leader.seat ? "the leader's" : "someone else's"}`,
    `your hand's strength: ${bucket(force, [10, 20, 30])}`,
    `chips you need: ${needed(p.chips)}`,
    `chips the leader needs after this one: ${needed(leader.chips.map((c, i) => c + +(i === color)))}`,
    `battle: ${bucket(game.battles, [2, 5, 9])}`,
    `${game.players.length === 3 ? "3 players" : "4+ players"}, ${stakes}, ${alive.length === 1 ? "one on one" : "more in"}`,
  ];
}

/**
 * Plays `n` default games of `players`, and at every decision of seat `i % players` where Doves can
 * be played on someone else's lead, plays out Doves and the default's move without Doves on `deals`
 * shared deals. Groups the difference by where the player stands.
 */
export function doves(players: number, deals: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const groups: Groups = {};
  let total = 0;
  for (let i = 0; i < n; i++) {
    const seat = i % players;
    const watcher: Policy = {
      ...defaultPolicy,
      move(game, p) {
        const pick = defaultPolicy.move(game, p);
        const card = p.hand.find((c) => c.kind === "doves");
        if (p.seat !== seat || !card || game.leader() === p.seat) return pick;
        const other = without(game, p);
        const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
        const gain = (playout(game, p, { card }, seeds) - playout(game, p, other, seeds)) / deals;
        total++;
        for (const k of where(game, p)) {
          const g = (groups[k] ??= { n: 0, gain: 0, better: 0 });
          g.n++;
          g.gain += gain;
          g.better += +(gain > 0);
        }
        return pick;
      },
    };
    new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watcher, first: 0 }).run();
  }
  return { total, groups };
}

function combine(a: ReturnType<typeof doves>, b: ReturnType<typeof doves>) {
  for (const [k, v] of Object.entries(b.groups)) {
    const g = (a.groups[k] ??= { n: 0, gain: 0, better: 0 });
    g.n += v.n;
    g.gain += v.gain;
    g.better += v.better;
  }
  return { total: a.total + b.total, groups: a.groups };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "4000" }, players: { type: "string", default: "3,4,5,6" }, deals: { type: "string", default: "64" } } });
  const all: Groups = {};
  let total = 0;
  let games = 0;
  for (const players of args.players.split(",").map(Number)) {
    const r = await parallel<ReturnType<typeof doves>>(import.meta.url, "doves", [players, Number(args.deals)], Number(args.n), combine);
    combine({ total, groups: all }, r);
    total += r.total;
    games += Number(args.n);
  }
  console.log(`${games} games, ${total} decisions with Doves playable on someone else's lead.\n`);
  console.log("| where you stand | decisions | per game | Doves over your other move, points | Doves better |\n| --- | --- | --- | --- | --- |");
  for (const [k, v] of Object.entries(all).sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })))
    console.log(`| ${k} | ${v.n} | ${(v.n / games).toFixed(2)} | ${((100 * v.gain) / v.n).toFixed(1)} | ${((100 * v.better) / v.n).toFixed(0)}% |`);
}
