import { existsSync, readdirSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { defaultPolicy, heuristic, mulberry32, type Play, type Policy, STEPS, type Step, takeWithin, TARGET, total, TRUMP, winning } from "../src/game.ts";
import { learned } from "../src/learned.ts";
import { parallel } from "kit/parallel.ts";
import { headToHead, playouts, STRATEGIES } from "../src/strategies.ts";
import { header } from "kit/table.ts";

const steps = Object.keys(STEPS) as (keyof typeof STEPS)[];

/** The default's steps with `step` before `before`. */
export const insert = (step: Step, before: keyof typeof STEPS) => (): Policy => {
  const i = steps.indexOf(before);
  return heuristic(...steps.slice(0, i), step, ...steps.slice(i));
};

/** The default's steps without `drop`. */
const without =
  (...drop: (keyof typeof STEPS)[]) =>
  (): Policy =>
    heuristic(...steps.filter((s) => !drop.includes(s)));

/** The default's steps with `step` in place of `old`. */
const replace = (old: keyof typeof STEPS, step: Step) => (): Policy => heuristic(...steps.map((s) => (s === old ? step : s)));

/** The default before `leadDown`. */
const previous = heuristic(...steps.filter((s) => s !== "leadDown").map((s) => (s === "take" ? takeWithin(0) : s)));

/** Leading, with `min` or more to go: the highest card face down, as a magenta 5. */
const leadDown =
  (min: number): Step =>
  (game, p, plays) =>
    !game.trick.length && TARGET - total(p) >= min ? plays.reduce<Play | undefined>((b, x) => (x.down && (!b || x.card.value > b.card.value) ? x : b), undefined) : undefined;

/** The default before `leadDown` flipped trump first. */
const highest = heuristic(...steps.map((s) => (s === "leadDown" ? leadDown(5) : s === "take" ? takeWithin(0) : s)));

/** The default before `take` waited when last early at 4 players. */
const eager = heuristic(...steps.map((s) => (s === "take" ? takeWithin(0) : s)));

const VARIANTS: Record<string, (seed: number) => Policy> = {
  "the default": () => defaultPolicy,
  "face up only": STRATEGIES["face up"],
  "no dumping once busted": without("busted"),
  ...Object.fromEntries([3, 6].map((k) => [`take sure wins only leaving ${k}+ to go`, replace("take", takeWithin(k))])),
  "never lead face down (previous)": () => previous,
  ...Object.fromEntries([3, 7, 10].map((k) => [`lead the highest card face down with ${k}+ to go`, replace("leadDown", leadDown(k))])),
  "lead the highest card face down, trump or not (previous)": () => highest,
  "lead the lowest trump face down, if any, else the highest card": replace("leadDown", (game, p, plays) => {
    if (game.trick.length || TARGET - total(p) < 5) return undefined;
    return plays.filter((x) => x.down && x.card.color === TRUMP).sort((a, b) => a.card.value - b.card.value)[0] ?? leadDown(5)(game, p, plays);
  }),
  "take every sure win that doesn't bust (previous)": () => eager,
  "last, take only with 6 or less to go early, at 4 players": replace("take", (game, p, plays) =>
    game.players.length === 4 && game.trick.length === 3 && p.hand.length > 8 && TARGET - total(p) > 6 ? undefined : takeWithin(0)(game, p, plays),
  ),
  ...Object.fromEntries(
    [6, 12].map((k) => [
      `last, early, ${k}+ from 25: duck with the lowest losing card`,
      insert((game, p, plays) => {
        if (game.trick.length !== game.players.length - 1 || p.hand.length <= 8 || TARGET - total(p) <= k) return undefined;
        return plays.filter((x) => !x.down && !winning(game, x)).sort((a, b) => a.card.value - b.card.value)[0];
      }, "duck"),
    ]),
  ),
  ...Object.fromEntries(
    [6, 12].map((k) => [
      `2nd, early, ${k}+ from 25: take with the highest of the led color`,
      insert((game, p, plays) => {
        if (game.trick.length !== 1 || p.hand.length <= 8 || TARGET - total(p) <= k) return undefined;
        return plays.filter((x) => !x.down && x.card.color === game.led() && winning(game, x) && x.card.value <= TARGET - total(p)).sort((a, b) => b.card.value - a.card.value)[0];
      }, "duck"),
    ]),
  ),
  ...Object.fromEntries(
    [6, 8].map((k) => [
      `lead face down only a card over ${k - 1}`,
      replace("leadDown", (game, p, plays) => {
        const x = STEPS.leadDown(game, p, plays);
        return x && x.card.value >= k ? x : undefined;
      }),
    ]),
  ),
  "once busted, dump the biggest card face up": replace("busted", (game, p, plays) => (TARGET - total(p) < 0 ? plays.filter((x) => !x.down).sort((a, b) => b.card.value - a.card.value)[0] : undefined)),
  ...Object.fromEntries(
    [6, 13].map((k) => [
      `magenta led, ${k}+ from 25: flip the highest card`,
      insert((game, p, plays) => (game.led() === "magenta" && TARGET - total(p) >= k ? plays.filter((x) => x.down).sort((a, b) => b.card.value - a.card.value)[0] : undefined), "exact"),
    ]),
  ),
  "the learned player": () => learned(),
  "the learned player, told the previous default's pick": () => learned(undefined, previous),
  "hand playouts among learned players": (seed) => playouts(16, seed, learned("dataset/model-r6-rollout.json"), 0, 1),
  "hand playouts among round 9's rollout players": (seed) => playouts(16, seed, learned("dataset/model-r9-rollout.json"), 0, 1),
  ...Object.fromEntries([2, 4].map((k) => [`hand playouts on ${k} deals among round 9's full players`, (seed: number) => playouts(k, seed, learned("dataset/model-r9.json"), 0, 1)])),
  "hand playouts on 64 deals among round 9's rollout players": (seed) => playouts(64, seed, learned("dataset/model-r9-rollout.json"), 0, 1),
  "full-game playouts among round 9's rollout players": (seed) => playouts(16, seed, learned("dataset/model-r9-rollout.json")),
  // every model in dataset/, oldest first, as `learned r3` for dataset/model-r3.json
  ...Object.fromEntries(
    (existsSync("dataset") ? readdirSync("dataset") : [])
      .filter((f) => /^model-.*\.json$/.test(f) && !f.includes("-rollout"))
      .sort((a, b) => statSync(`dataset/${a}`).mtimeMs - statSync(`dataset/${b}`).mtimeMs)
      .map((f) => [`learned ${f.slice(6, -5)}`, () => learned(`dataset/${f}`)]),
  ),
};

/** Every default so far, each adopted as the best answer to the one before. */
const LEAGUE: Policy[] = [previous, highest, eager, defaultPolicy];

/** Each other seat a default from `LEAGUE` at random, so a rule that only beats the latest one doesn't look good. */
const league = (seed: number) => LEAGUE[Math.floor(mulberry32(seed)() * LEAGUE.length)];

/** Who sits in the other seats: the default, a default from `LEAGUE`, playouts, or the learned player. */
const FIELDS: Record<string, [string, ((seed: number) => Policy) | undefined]> = {
  default: ["the default player", undefined],
  league: ["a default from every round so far", league],
  playouts: ["hand playouts on 16 deals", (seed) => playouts(16, seed, defaultPolicy, 0, 1)],
  "learned playouts": ["hand playouts on 16 deals among learned players", (seed) => playouts(16, seed, learned("dataset/model-r6-rollout.json"), 0, 1)],
  learned: ["the learned player", () => learned()],
};

const fieldOf = (field: string): [string, ((seed: number) => Policy) | undefined] => FIELDS[field] ?? [`"${field}"`, VARIANTS[field]];

export const run = (variant: string, players: number, field: string, seed: number, n: number) => headToHead(VARIANTS[variant], players, seed, n, fieldOf(field)[1]);

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "40000" }, players: { type: "string", default: "3,4" }, only: { type: "string" }, field: { type: "string", default: "default" } },
  });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  console.log(`${n} games each: one player's wins against ${fieldOf(args.field)[0]} in every other seat.\n`);
  header(["variant"], counts, true);
  for (const name of Object.keys(VARIANTS).filter((v) => !args.only || args.only.split("|").some((o) => (o in VARIANTS ? v === o : v.startsWith(o))))) {
    const cells = [];
    for (const players of counts) cells.push(`${((100 * (await parallel<ReturnType<typeof run>>(import.meta.url, "run", [name, players, args.field], n)).wins) / n).toFixed(1)}%`);
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
}
