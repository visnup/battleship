import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { Game, mulberry32 } from "../src/game.ts";

type Tally = { hands: number; busts: number; chips: number };
const ROLES = ["holds the 0 and leads", "holds the 0, doesn't lead", "leads without the 0", "neither"] as const;
type Tallies = Record<(typeof ROLES)[number], Tally>;

/**
 * Plays `n` default games of `players`. With `swap`, a random other seat leads each hand's first
 * trick instead of the magenta 0's holder. Tallies busts and chips gained a hand by whether a seat
 * held the 0 and whether it led.
 */
export function leads(players: number, swap: boolean, seed: number, n: number) {
  const rng = mulberry32(seed);
  const t = Object.fromEntries(ROLES.map((r) => [r, { hands: 0, busts: 0, chips: 0 }])) as Tallies;
  for (let i = 0; i < n; i++) {
    const holders: number[] = [];
    const leaders: number[] = [];
    const game = new (class extends Game {
      deal() {
        super.deal();
        holders.push(this.current);
        if (swap) this.current = (this.current + 1 + Math.floor(rng() * (players - 1))) % players;
        leaders.push(this.current);
      }
    })({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)) });
    game.run();
    game.scores.forEach((s, h) => {
      for (let seat = 0; seat < players; seat++) {
        const role = ROLES[(seat === holders[h] ? 0 : 2) + (seat === leaders[h] ? 0 : 1)];
        t[role].hands++;
        t[role].busts += +(s.totals[seat] > 25);
        t[role].chips += s.gained[seat];
      }
    });
  }
  return t;
}

function combine(a: Tallies, b: Tallies) {
  for (const r of ROLES) for (const f of ["hands", "busts", "chips"] as const) a[r][f] += b[r][f];
  return a;
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "40000" }, players: { type: "string", default: "3,4" } } });
  const n = Number(args.n);
  console.log(`${n} default games each, with the magenta 0's holder leading each hand (the booklet) or a random other seat.\n`);
  console.log("| players, who leads | seat | busts | chips a hand |\n| --- | --- | --- | --- |");
  for (const players of args.players.split(",").map(Number))
    for (const swap of [false, true]) {
      const t = await parallel<Tallies>(import.meta.url, "leads", [players, swap], n, combine);
      for (const r of ROLES) if (t[r].hands) console.log(`| ${players}, ${swap ? "another seat" : "the holder"} | ${r} | ${((100 * t[r].busts) / t[r].hands).toFixed(1)}% | ${(t[r].chips / t[r].hands).toFixed(2)} |`);
    }
}
