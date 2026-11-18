import { parseArgs } from "node:util";
import type { Card } from "../src/cards.ts";
import { defaultPolicy, Game, mulberry32, type Policy } from "../src/game.ts";
import { discarded, said } from "../src/learned.ts";

// Where the learned discard and Just Say No models decide differently from the default, in
// default games: what each discards, and which actions each says no to, by how often.

const { values: args } = parseArgs({ options: { n: { type: "string", default: "20000" }, players: { type: "string", default: "2,5" } } });
const kind = (c: Card) => (c.kind === "money" ? `$${c.value}M` : c.kind === "action" ? c.action : c.kind);
const discard = discarded();
const sayNo = said();
const tally = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

for (const players of args.players.split(",").map(Number)) {
  const discards = new Map<string, number>();
  const answers = new Map<string, number>();
  let [d, n] = [0, 0];
  const watcher: Policy = {
    ...defaultPolicy,
    discard(game, p, k) {
      const mine = defaultPolicy.discard(game, p, k);
      const [a, b] = [mine.map(kind).sort().join(" + "), discard(game, p, k).map(kind).sort().join(" + ")];
      d++;
      if (a !== b) tally(discards, `${a} → ${b}`);
      return mine;
    },
    sayNo(game, p, move, to) {
      const mine = defaultPolicy.sayNo(game, p, move, to);
      const theirs = sayNo(game, p, move, to);
      const what = `${game.players[game.current] === p ? "counter a No to my" : "against"} ${move.type === "rent" ? "rent" : kind(move.card)}`;
      n++;
      if (mine !== theirs) tally(answers, `${what}: ${mine ? "no" : "allow"} → ${theirs ? "no" : "allow"}`);
      return mine;
    },
  };
  for (let i = 0; i < Number(args.n); i++) new Game({ players, rng: mulberry32(i + 1), policies: watcher, first: i % players }).run();
  const top = (m: Map<string, number>, of: number) =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => `  ${((100 * v) / of).toFixed(1)}%  ${k}`)
      .join("\n");
  console.log(`\n${players} players, ${d} discards, default → model:\n${top(discards, d)}`);
  console.log(`${players} players, ${n} chances to say no, default → model:\n${top(answers, n)}`);
}
