import { parseArgs } from "node:util";
import { name } from "../src/cards.ts";
import { decisive, defaultPolicy, Game, type Move, moves, mulberry32, others, type Player, type Policy } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { playout } from "../src/strategies.ts";

/** A move as a short label: `pass`, a card, or `bait 6`. */
const label = (m: Move) => (m ? (m.take ? `bait ${name(m.take)}` : name(m.card)) : "pass");

/** Where the default player stands at a decision, coarsely. */
function situation(game: Game, p: Player) {
  const leads = game.leader() === p.seat;
  const stakes = decisive(game, p) ? "wins game" : others(game, p).some((q) => decisive(game, q)) ? "loses game" : "";
  const alive = others(game, p).filter((q) => !q.passed).length;
  return [leads ? "ahead" : "behind", `row ${Math.min(p.row.length, 3)}`, `${alive ? alive : "no"} others in`, stakes].filter(Boolean).join(", ");
}

/**
 * Plays `n` default games of `players`, and at every decision of seat `i % players` with a choice,
 * plays out each legal move on `deals` shared deals. Tallies, by situation and by the default's
 * pick and the best move, how often playouts prefer another move by more than 2 standard errors
 * of the paired difference, and the wins it gains.
 */
export function decisions(players: number, deals: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const groups: Record<string, { n: number; gain: number }> = {};
  let total = 0;
  for (let i = 0; i < n; i++) {
    const seat = i % players;
    const watcher: Policy = {
      ...defaultPolicy,
      move(game, p) {
        const pick = defaultPolicy.move(game, p);
        if (p.seat !== seat) return pick;
        const options = moves(game, p);
        if (options.length < 2) return pick;
        total++;
        const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
        const wins = options.map((m) => seeds.map((s) => playout(game, p, m, [s])));
        const d = options.findIndex((m) => label(m) === label(pick));
        const b = wins.reduce((a, _, j) => (sum(wins[j]) > sum(wins[a]) ? j : a), d);
        if (b !== d) {
          const diff = wins[b].map((w, k) => w - wins[d][k]);
          const mean = sum(diff) / deals;
          const se = Math.sqrt(diff.reduce((s, x) => s + (x - mean) ** 2, 0) / (deals - 1) / deals);
          if (mean > 2 * se) {
            const key = `${situation(game, p)}: ${label(pick)} → ${label(options[b])}`;
            const g = (groups[key] ??= { n: 0, gain: 0 });
            g.n++;
            g.gain += mean;
          }
        }
        return pick;
      },
    };
    new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watcher, first: 0 }).run();
  }
  return { total, groups };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function combine(a: ReturnType<typeof decisions>, b: ReturnType<typeof decisions>) {
  for (const [k, v] of Object.entries(b.groups)) {
    const g = (a.groups[k] ??= { n: 0, gain: 0 });
    g.n += v.n;
    g.gain += v.gain;
  }
  return { total: a.total + b.total, groups: a.groups };
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "2000" }, players: { type: "string", default: "3,6" }, deals: { type: "string", default: "64" }, top: { type: "string", default: "25" } },
  });
  for (const players of args.players.split(",").map(Number)) {
    const n = Number(args.n);
    const { total, groups } = await parallel<ReturnType<typeof decisions>>(import.meta.url, "decisions", [players, Number(args.deals)], n, combine);
    console.log(`\n## ${players} players: ${n} games, ${total} decisions with a choice\n`);
    console.log("| situation: default → playouts | times | per game | points each |\n| --- | --- | --- | --- |");
    for (const [k, v] of Object.entries(groups)
      .sort((a, b) => b[1].gain - a[1].gain)
      .slice(0, Number(args.top)))
      console.log(`| ${k} | ${v.n} | ${(v.n / n).toFixed(2)} | ${((100 * v.gain) / v.n).toFixed(1)} |`);
  }
}
