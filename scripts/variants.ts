import { existsSync, readdirSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { type Card, COLORS } from "../src/cards.ts";
import { decisive, defaultPolicy, finishIn, type Game, heuristic, mulberry32, needed, oneWithin, openWith, others, type Player, type Policy, STEPS, type Step, waitWhile } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { learned } from "../src/learned.ts";
import { colorPlayouts, crowsAhead, dumpPlayouts, headToHead, playouts, STRATEGIES } from "../src/strategies.ts";
import { header } from "./table.ts";

const steps = Object.keys(STEPS) as (keyof typeof STEPS)[];

/** The default's steps with `step` before `before`. */
const insert = (step: Step, before: keyof typeof STEPS) => (): Policy => {
  const i = steps.indexOf(before);
  return heuristic(...steps.slice(0, i), step, ...steps.slice(i));
};

/** With only `k` others left in, behind, pass instead of chasing, unless the chip decides the game. */
const giveUp =
  (k: number): Step =>
  (game, p) => {
    if (game.leader() === p.seat || decisive(game, p) || others(game, p).some((q) => decisive(game, q))) return undefined;
    return others(game, p).filter((q) => !q.passed).length <= k && !p.row.length ? null : undefined;
  };

type Kind = "one" | "fury" | "top";
/** The first card of `kinds` in hand: a force 1, a Fury `p` can play, or the strongest force card or Legend. */
const pick = (game: Game, p: Player, kinds: Kind[]): Card | undefined => {
  for (const k of kinds) {
    const card =
      k === "one"
        ? p.hand.find((c) => c.kind === "force" && c.value === 1)
        : k === "fury"
          ? p.hand.find((c) => c.kind === "fury" && game.playable(p, c))
          : p.hand.filter((c) => c.kind === "force" || c.kind === "legend").sort((a, b) => b.value - a.value)[0];
    if (card) return card;
  }
};

/** Ahead with others still in and at most `row` cards played, the first of `kinds` in hand instead of passing. */
const ahead =
  (kinds: Kind[], row = Infinity): Step =>
  (game, p) => {
    if (p.row.length > row || game.leader() !== p.seat || others(game, p).every((q) => q.passed)) return undefined;
    const card = pick(game, p, kinds);
    return card ? { card } : undefined;
  };

/** Ahead with others still in, Bait back a 1; with `keep`, only if that leaves `p` ahead. */
const stallAhead =
  (keep: boolean): Step =>
  (game, p) => {
    const bait = p.hand.find((c) => c.kind === "bait");
    const take = p.row.find((c) => c.kind === "force" && c.value === 1);
    if (!bait || !take || game.leader() !== p.seat || others(game, p).every((q) => q.passed)) return undefined;
    if (keep) {
      const i = p.row.indexOf(take);
      p.row.splice(i, 1);
      const leads = game.leader() === p.seat;
      p.row.splice(i, 0, take);
      if (!leads) return undefined;
    }
    return { card: bait, take };
  };

const bump = (chips: number[], i: number) => chips.map((c, j) => c + +(i === j));

/** The default's steps without `drop`. */
const without =
  (...drop: (keyof typeof STEPS)[]) =>
  (): Policy =>
    heuristic(...steps.filter((s) => !drop.includes(s)));

/** The default's steps with `step` in place of `old`. */
const replace = (old: keyof typeof STEPS, step: Step) => (): Policy => heuristic(...steps.map((s) => (s === old ? step : s)));

const VARIANTS: Record<string, (seed: number) => Policy> = {
  "the default": () => defaultPolicy,
  "the first default (previous)": STRATEGIES["first default"],
  "open battles (previous)": without("wait"),
  "pass only at a single card's reach of the lead (previous)": without("allIn"),
  "deny every winning chip (previous)": replace("wait", waitWhile(2)),
  "no Bait back after winning (previous)": without("harvest"),
  "pass when ahead with an empty row (previous)": without("press"),
  "open with a 1 or Fury before waiting (previous)": () => heuristic(...steps.filter((s) => s !== "open").flatMap((s) => (s === "wait" ? ["open" as const, "wait" as const] : [s]))),
  ...Object.fromEntries([1, 3].map((k) => [`pass with an empty row while ${k}+ others are in`, replace("wait", waitWhile(k, 3))])),
  "wait even against a winning chip": replace("wait", waitWhile(2, 0)),
  "no 1 once something's played (previous)": without("one"),
  "no Bait back of a 1 while others are in (previous)": without("stall"),
  "neither (previous)": without("one", "stall"),
  "a 1 before Bait back": () => heuristic(...steps.filter((s) => s !== "one").flatMap((s) => (s === "stall" ? ["one" as const, s] : [s]))),
  "give up one on one with an empty row": insert(giveUp(1), "chase"),
  "ahead with others in, a 1 or Fury instead of passing": insert(ahead(["one", "fury"]), "bait"),
  "ahead with others in, the strongest card instead of passing": insert(ahead(["top"]), "bait"),
  "open with a 1 or Fury with nobody else in (previous)": replace("open", openWith(0)),
  "open with a 1 or Fury only with 2+ others in": replace("open", openWith(2)),
  "never Crows": without("crows"),
  "Crows whenever ahead (previous)": replace("crows", crowsAhead),
  "Crows only for a chip that wins the game": replace("crows", (game, p) => (decisive(game, p) ? STEPS.crows(game, p) : undefined)),
  "never Doves": without("doves"),
  "with nobody else in, only overtake with a single card (previous)": without("finish"),
  ...Object.fromEntries([2].map((k) => [`with nobody else in, overtake in up to ${k} cards, strongest first`, replace("finish", finishIn(k))])),
  "Bait back a 1 ahead too, before Crows": insert(stallAhead(false), "crows"),
  "Bait back a 1 ahead too, before Crows, if still ahead after": insert(stallAhead(true), "crows"),
  "Bait back a 1 ahead too, after Crows": insert(stallAhead(false), "doves"),
  "press with the strongest card, not a Fury (previous)": replace("press", ahead(["top"], 0)),
  "press with a 1 first": insert(ahead(["one"], 0), "press"),
  "press only with 2+ others in": replace("press", (game, p) => (others(game, p).filter((q) => !q.passed).length >= 2 ? STEPS.press(game, p) : undefined)),
  "the learned player": () => learned(),
  // every model in dataset/, oldest first, as `learned r34s` for dataset/model-r34s.json
  ...Object.fromEntries(
    (existsSync("dataset") ? readdirSync("dataset") : [])
      .filter((f) => /^model-.*\.json$/.test(f))
      .sort((a, b) => statSync(`dataset/${a}`).mtimeMs - statSync(`dataset/${b}`).mtimeMs)
      .map((f) => [`learned ${f.slice(6, -5)}`, () => learned(`dataset/${f}`)]),
  ),
  "chip at random": (seed) => {
    const rng = mulberry32(seed);
    return { ...defaultPolicy, color: () => COLORS[Math.floor(rng() * 3)] };
  },
  "chip for our own progress only": () => ({ ...defaultPolicy, color: (game, p) => COLORS[[0, 1, 2].reduce((a, b) => (needed(bump(p.chips, b)) < needed(bump(p.chips, a)) ? b : a))] }),
  "chip that helps the closest opponent least, first": () => ({
    ...defaultPolicy,
    color: (game, p) => {
      const score = (i: number) => -10 * Math.min(...others(game, p).map((q) => needed(bump(q.chips, i)))) + needed(bump(p.chips, i));
      return COLORS[[0, 1, 2].reduce((a, b) => (score(b) < score(a) ? b : a))];
    },
  }),
  "chip by playouts on 32 deals": (seed) => colorPlayouts(defaultPolicy, 32, seed),
  "never discard a hand of no force cards": () => ({ ...defaultPolicy, dump: () => false }),
  "discard by playouts on 32 deals": (seed) => dumpPlayouts(defaultPolicy, 32, seed),
  "Doves only with 1 other in": replace("doves", (game, p) => (others(game, p).filter((q) => !q.passed).length <= 1 ? STEPS.doves(game, p) : undefined)),
};

/** Every default so far, each adopted as the best answer to the one before. */
const LEAGUE: Policy[] = [
  STRATEGIES["first default"](0),
  heuristic("stop", crowsAhead, "doves", waitWhile(2), "chase", "allIn", "bait"),
  heuristic("stop", crowsAhead, "doves", waitWhile(2, 3), oneWithin(0), "chase", "allIn", "bait"),
  heuristic("harvest", "stop", crowsAhead, "doves", "press", "open", "wait", "chase", "allIn", "bait"),
  heuristic("harvest", "stop", crowsAhead, "doves", "press", "wait", "open", "chase", "allIn", "bait"),
  heuristic("harvest", "stop", "crows", "doves", "press", "wait", "open", "chase", "allIn", "bait"),
  heuristic("harvest", "stop", "crows", "doves", "press", "wait", "open", "finish", "chase", "allIn", "bait"),
  heuristic("harvest", "stop", "crows", "doves", ahead(["top"], 0), "wait", "open", "finish", "stall", "one", "chase", "allIn", "bait"),
  defaultPolicy,
];

/** Each other seat a default from `LEAGUE` at random, so a rule that only beats the latest one doesn't look good. */
const league = (seed: number) => LEAGUE[Math.floor(mulberry32(seed)() * LEAGUE.length)];

/** Who sits in the other seats: the default, a default from `LEAGUE`, or playouts on 8 deals. */
const FIELDS: Record<string, [string, ((seed: number) => Policy) | undefined]> = {
  default: ["the default player", undefined],
  league: ["a default from every round so far", league],
  playouts: ["playouts on 8 deals", (seed) => playouts(8, seed)],
  learned: ["the learned player", () => learned()],
};

const fieldOf = (field: string): [string, ((seed: number) => Policy) | undefined] => FIELDS[field] ?? [`"${field}"`, VARIANTS[field]];

export const run = (variant: string, players: number, field: string, seed: number, n: number) => headToHead(VARIANTS[variant], players, seed, n, fieldOf(field)[1]);

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "100000" }, players: { type: "string", default: "3,4,5,6" }, only: { type: "string" }, field: { type: "string", default: "default" } },
  });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  console.log(`${n} games each: one player's wins against ${fieldOf(args.field)[0]} in every other seat.\n`);
  header(["variant"], counts, true);
  for (const name of Object.keys(VARIANTS).filter((v) => !args.only || args.only.split("|").some((o) => v.startsWith(o)))) {
    const cells = [];
    for (const players of counts) cells.push(`${((100 * (await parallel<ReturnType<typeof run>>(import.meta.url, "run", [name, players, args.field], n)).wins) / n).toFixed(1)}%`);
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
}
