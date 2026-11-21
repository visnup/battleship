import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { defaultPolicy, Game, mulberry32, type Player, type Policy, TARGET, total, TRUMP } from "../src/game.ts";
import { learned } from "../src/learned.ts";

type Tally = { n: number; model: number; default: number; value: number; highest: number; silver: number };

/** Why a magenta 5 is open to `p` now. */
function reason(game: Game, p: Player) {
  const led = game.led();
  if (!led) return "leading";
  if (led === "magenta") return "magenta led";
  const follow = p.hand.filter((c) => c.color === led).length;
  return follow ? "last card of the led color" : "can't follow";
}

const room = (p: Player) => {
  const r = TARGET - total(p);
  return r < 0 ? "busted" : r <= 5 ? "0–5 to go" : r <= 12 ? "6–12 to go" : "13+ to go";
};

/**
 * Plays `n` games of `players` among learned players, and at each decision of seat `i % players`
 * where a face-down play is legal and there's a choice, tallies by why it's open and how far the
 * player is from 25 how often the model and the default flip, and which card the model flips.
 */
export function flips(model: string, players: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const player = learned(model);
  const groups: Record<string, Tally> = {};
  for (let i = 0; i < n; i++) {
    const seat = i % players;
    const watcher: Policy = {
      play(game, p) {
        const pick = player.play(game, p);
        if (p.seat !== seat) return pick;
        const plays = game.legal(p);
        if (plays.length < 2 || !plays.some((m) => m.down)) return pick;
        const t = (groups[`${reason(game, p)}, ${room(p)}`] ??= { n: 0, model: 0, default: 0, value: 0, highest: 0, silver: 0 });
        t.n++;
        t.default += +defaultPolicy.play(game, p).down;
        if (pick.down) {
          t.model++;
          t.value += pick.card.value;
          t.highest += +p.hand.every((c) => c.value <= pick.card.value);
          t.silver += +(pick.card.color === TRUMP);
        }
        return pick;
      },
    };
    new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watcher }).run();
  }
  return groups;
}

function combine(a: ReturnType<typeof flips>, b: ReturnType<typeof flips>) {
  for (const [k, v] of Object.entries(b)) {
    const t = (a[k] ??= { n: 0, model: 0, default: 0, value: 0, highest: 0, silver: 0 });
    for (const f of Object.keys(v) as (keyof Tally)[]) t[f] += v[f];
  }
  return a;
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "2000" }, players: { type: "string", default: "3,4" }, model: { type: "string", default: "src/packed/model.ts" } } });
  for (const players of args.players.split(",").map(Number)) {
    const groups = await parallel<ReturnType<typeof flips>>(import.meta.url, "flips", [args.model, players], Number(args.n), combine);
    const all = Object.values(groups).reduce((s, t) => s + t.n, 0);
    const pct = (x: number, of: number) => (of ? `${((100 * x) / of).toFixed(0)}%` : "");
    console.log(`\n## ${players} players\n`);
    console.log("| open because, how far from 25 | share of these decisions | model flips | default flips | model's flipped card: mean value | highest in hand | silver |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const [k, t] of Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])))
      console.log(`| ${k} | ${pct(t.n, all)} | ${pct(t.model, t.n)} | ${pct(t.default, t.n)} | ${t.model ? (t.value / t.model).toFixed(1) : ""} | ${pct(t.highest, t.model)} | ${pct(t.silver, t.model)} |`);
  }
}
