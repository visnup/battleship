import { parseArgs } from "node:util";
import { charge, collect, fullColors, fullSets, heuristic, isAction, type Policy, rent, richest, STEPS, type Step, type Target } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { build, headToHead, STRATEGIES } from "../src/strategies.ts";

// Changes to `defaultPolicy`, each from a pattern in `decisions.ts`, played head to head against
// it. Adopted ones move into `STEPS`, and the rest stay here, so the table shows what each costs.

/** Banks a card of one of `actions` instead of playing it. */
const bankIt =
  (...actions: string[]): Step =>
  (game, p) => {
    const card = p.hand.find((c) => actions.some((a) => isAction(c, a)));
    return card ? { type: "bank", card } : null;
  };

const mostBanked: Target = (game, p) => game.players.filter((q) => q !== p).reduce((a, b) => (sum(b.bank) > sum(a.bank) ? b : a));
const sum = (cards: { value: number }[]) => cards.reduce((s, c) => s + c.value, 0);

/** The first Deal Breaker step, which sorted sets of colors we have first and then refused them. */
const dealBreakerBug: Step = (game, p) => {
  const breaker = p.hand.find((c) => isAction(c, "dealBreaker"));
  if (!breaker) return null;
  const sets = game.players.filter((q) => q !== p).flatMap((q) => fullColors(game, q).map((color) => ({ q, color })));
  const pick = sets.sort((a, b) => +!fullSets(game, p, a.color) - +!fullSets(game, p, b.color) || rent(game, b.q, b.color) - rent(game, a.q, a.color))[0];
  return pick && !fullSets(game, p, pick.color) ? { type: "action", card: breaker, target: pick.q.seat, color: pick.color } : null;
};

/** Lays down a wild before anything but completing a set. */
const placeWild: Step = (game, p) => {
  const move = STEPS.place(game, p, 0);
  return move?.card.kind === "wild" ? move : null;
};

/** Lays down properties once `amount` is banked. */
const placeOnce =
  (amount: number): Step =>
  (game, p, left) =>
    sum(p.bank) >= amount ? STEPS.place(game, p, left) : null;

const steps = Object.values(STEPS) as Step[];
const without = (...drop: Step[]) => steps.filter((s) => !drop.includes(s));
const swap = (from: Step, to: Step) => steps.map((s) => (s === from ? to : s));
const { passGo, complete, dealBreaker, place, placeWhenBanked, bankBuildings, passGoLast } = STEPS;

const VARIANTS: Record<string, () => Policy> = {
  "the builder": () => STRATEGIES.builder(0),
  "lay down properties before charging (previous)": () => heuristic(...without(place).toSpliced(4, 0, place)),
  "lay down properties before banking (previous)": () => heuristic(...without(place).toSpliced(7, 0, place)),
  "build houses and hotels, never bank them (previous)": () => heuristic(...without(bankBuildings).toSpliced(-2, 0, build)),
  "Deal Breaker refuses when the best set is a color it has (previous)": () => heuristic(...swap(dealBreaker, dealBreakerBug)),
  "build, else bank them": () => heuristic(...steps.toSpliced(-3, 0, build)),
  "Pass Go only as the last play": () => heuristic(...without(passGo)),
  "bank Pass Go": () => heuristic(...without(passGo, passGoLast), bankIt("passGo")),
  "Deal Breaker before Pass Go": () => heuristic(...without(dealBreaker).toSpliced(0, 0, dealBreaker)),
  "Debt Collector on the richest (previous)": () => heuristic(...swap(STEPS.debtCollector, collect(richest))),
  "any-color Rent on the richest (previous)": () => heuristic(...swap(STEPS.rent, charge(richest))),
  "bank all money before laying down properties (previous)": () => heuristic(...without(placeWhenBanked)),
  "Debt Collector on the most money banked": () => heuristic(...swap(STEPS.debtCollector, collect(mostBanked))),
  "any-color Rent on the most money banked": () => heuristic(...swap(STEPS.rent, charge(mostBanked))),
  "lay down wilds before charging": () => heuristic(...steps.toSpliced(steps.indexOf(complete) + 1, 0, placeWild)),
  ...Object.fromEntries(
    [5, 15].map((amount) => [`lay down properties once $${amount}M is banked`, () => heuristic(...swap(placeWhenBanked, placeOnce(amount)))]),
  ),
};

export const run = (variant: string, players: number, seed: number, n: number) => headToHead(VARIANTS[variant], players, seed, n);

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "100000" }, players: { type: "string", default: "2,5" }, only: { type: "string" } },
  });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  console.log(`${n} games each: one player's wins against the default player in every other seat.\n`);
  console.log(`| variant | ${counts.map((k) => `${k} players (fair ${(100 / k).toFixed(1)}%)`).join(" | ")} |`);
  console.log(`| --- | ${counts.map(() => "---").join(" | ")} |`);
  for (const name of Object.keys(VARIANTS).filter((v) => !args.only || v.startsWith(args.only))) {
    const cells = [];
    for (const players of counts) cells.push(`${((100 * (await parallel<ReturnType<typeof run>>(import.meta.url, "run", [name, players], n)).wins) / n).toFixed(1)}%`);
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
}
