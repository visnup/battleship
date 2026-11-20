import { existsSync, readdirSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { defaultPolicy, heuristic, mulberry32, type Policy, STEPS, type Step, takeWithin } from "../src/game.ts";
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

const VARIANTS: Record<string, (seed: number) => Policy> = {
  "the default": () => defaultPolicy,
  "face up only": STRATEGIES["face up"],
  "no dumping once busted": without("busted"),
  ...Object.fromEntries([3, 6].map((k) => [`take sure wins only leaving ${k}+ to go`, replace("take", takeWithin(k))])),
  "the learned player": () => learned(),
  "hand playouts among learned players": (seed) => playouts(16, seed, learned("dataset/model-r6-rollout.json"), 0, 1),
  // every model in dataset/, oldest first, as `learned r3` for dataset/model-r3.json
  ...Object.fromEntries(
    (existsSync("dataset") ? readdirSync("dataset") : [])
      .filter((f) => /^model-.*\.json$/.test(f) && !f.includes("-rollout"))
      .sort((a, b) => statSync(`dataset/${a}`).mtimeMs - statSync(`dataset/${b}`).mtimeMs)
      .map((f) => [`learned ${f.slice(6, -5)}`, () => learned(`dataset/${f}`)]),
  ),
};

/** Every default so far, each adopted as the best answer to the one before. */
const LEAGUE: Policy[] = [defaultPolicy];

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
