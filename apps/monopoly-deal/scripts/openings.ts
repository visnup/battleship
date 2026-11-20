import { parseArgs } from "node:util";
import { Game, mulberry32 } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";
import { header } from "./table.ts";

const KINDS = ["action", "property", "money"] as const;
/** What a card counts as in an opening hand: Rent cards are actions, and wilds properties. */
const kind = (c: { kind: string }) => (c.kind === "rent" ? "action" : c.kind === "wild" ? "property" : c.kind) as (typeof KINDS)[number];

/** In `n` default-player games, each player's wins by how many of each kind of card its opening hand held. */
export function openings(players: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const hands = KINDS.map(() => new Array<number>(6).fill(0));
  const wins = KINDS.map(() => new Array<number>(6).fill(0));
  for (let i = 0; i < n; i++) {
    const game = new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), first: i % players });
    const dealt = game.players.map((p) => KINDS.map((k) => p.hand.filter((c) => kind(c) === k).length));
    const { winner } = game.run();
    dealt.forEach((counts, seat) =>
      counts.forEach((m, k) => {
        hands[k][m]++;
        wins[k][m] += +(winner === seat);
      }),
    );
  }
  return { hands, wins };
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "100000" } } });
  const n = Number(args.n);
  const counts = [2, 3, 4, 5];
  const results = [];
  for (const players of counts) results.push(await parallel<ReturnType<typeof openings>>(import.meta.url, "openings", [players], n));
  console.log(`${n} games each: a player's wins, in fair shares, by how many of its 5 opening cards are of each kind, and (in parentheses) how many hands that is.\n`);
  for (const [k, label] of KINDS.entries()) {
    header([{ action: "actions", property: "properties", money: "money cards" }[label]], counts);
    for (let m = 0; m <= 5; m++) console.log(`| ${m} | ${results.map((r, i) => `${((r.wins[k][m] / r.hands[k][m]) * counts[i]).toFixed(2)} (${((100 * r.hands[k][m]) / (n * counts[i])).toFixed(0)}%)`).join(" | ")} |`);
    console.log();
  }
}
