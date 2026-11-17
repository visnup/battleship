import { parseArgs } from "node:util";
import { type Card, type Color, COLORS } from "../src/cards.ts";
import { assets, charge, colorsOf, collect, count, defaultPolicy, fullColors, fullSets, type Game, gain, heuristic, inProperty, isAction, leader, loose, type Move, mulberry32, type Placed, type Player, type Policy, progress, rent, richest, STEPS, stealable, type Step, type Target } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { build, chance, headToHead, moves, STRATEGIES } from "../src/strategies.ts";

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

/** Lays down a wild before anything but completing a set. */
const placeWild: Step = (game, p) => {
  const move = STEPS.place(game, p, 0);
  return move?.card.kind === "wild" ? move : null;
};

/** Lays down properties once `amount` is banked. */
const placeOnce =
  (amount: number, step: Step = STEPS.place): Step =>
  (game, p, left) =>
    sum(p.bank) >= amount ? step(game, p, left) : null;

/** Lays down the property and color that score highest, instead of the first one in hand. */
const placeBy = (score: (game: Game, p: Player, card: Card, color: Color) => number): Step => {
  const step: Step = (game, p) => {
    let best: { card: Card; color: Color; s: number } | undefined;
    for (const card of p.hand) {
      if (card.kind !== "property" && !(card.kind === "wild" && (card.colors !== "any" || p.props.length))) continue;
      for (const color of colorsOf(card)) {
        const s = score(game, p, card, color);
        if (!best || s > best.s) best = { card, color, s };
      }
    }
    return best ? { type: "place", card: best.card, color: best.color } : null;
  };
  return step;
};
const size = (color: Color) => COLORS[color].rent.length;
/** How far one more card of `color` gets toward a set, or 0 past a full one. */
const toward = (game: Game, p: Player, color: Color) => (count(p, color) % size(color) === 0 && count(p, color) ? 0 : progress(game, p, color, 1));
const placeVariant = (score: Parameters<typeof placeBy>[0]) => {
  const step = placeBy(score);
  return () => heuristic(...swap(place, step).map((s) => (s === placeWhenBanked ? placeOnce(10, step) : s)));
};

/** With a play left to charge after, lays down a property of a color a Rent card in hand charges. */
const placeForRent: Step = (game, p, left) => {
  if (left < 2) return null;
  const charged = new Set(p.hand.flatMap((c) => (c.kind === "rent" ? colorsOf(c) : [])));
  const move = placeBy((game, p, card, color) => (charged.has(color) ? 1 : -Infinity))(game, p, left);
  return move && charged.has((move as { color: Color }).color) ? move : null;
};

const mostProperty: Target = (game, p, amount) => {
  const top = leader(game, p, amount);
  const score = (q: Player) => Math.min(assets(q), amount) - Math.min(sum(q.bank), amount) + +(q === top) / 2;
  return game.players.filter((q) => q !== p).reduce((a, b) => (score(b) > score(a) ? b : a));
};
const leastBanked: Target = (game, p) => game.players.filter((q) => q !== p).reduce((a, b) => (sum(b.bank) < sum(a.bank) ? b : a));
const both = (target: Target) => () => heuristic(...swap(STEPS.rent, charge(target)).map((s) => (s === STEPS.debtCollector ? collect(target) : s)));

/** A property that completes a set only when that set wins the game. */
const completeToWin: Step = (game, p, left) => (fullColors(game, p).length >= 2 ? STEPS.complete(game, p, left) : null);
/** The first property in hand, as the color it helps most, unless it completes a set that doesn't win. */
const placeHolding: Step = (game, p) => {
  for (const card of p.hand) {
    if (card.kind !== "property" && !(card.kind === "wild" && (card.colors !== "any" || p.props.length))) continue;
    const color = colorsOf(card).reduce((a, b) => (toward(game, p, b) > toward(game, p, a) ? b : a));
    if (count(p, color) + 1 === size(color) && fullColors(game, p).length < 2) continue;
    return { type: "place", card, color };
  }
  return null;
};
/** Says no like the default to a Deal Breaker, and to anything else only with more than `spare` Just Say Nos in hand. */
const saveNo =
  (spare: number): Policy["sayNo"] =>
  (game, p, move, from) =>
    isAction(move.card, "dealBreaker") || (p.hand.filter((c) => isAction(c, "justSayNo")).length > spare && defaultPolicy.sayNo(game, p, move, from));

/** Forced Deal taking the most useful loose property, giving our least-built loose one, wilds too with `wilds`, whenever `worth` says so. */
const forced =
  (worth: (gained: number, lost: number) => boolean, wilds = false): Step =>
  (game, p) => {
    const card = p.hand.find((c) => isAction(c, "forcedDeal"));
    if (!card) return null;
    const take = stealable(game, p, game.players.filter((q) => q !== p))[0];
    const give = p.props
      .filter((x) => loose(game, p, x) && x.color !== take?.x.color && (wilds || x.card.kind !== "wild"))
      .sort((a, b) => progress(game, p, a.color) - progress(game, p, b.color))[0];
    return take && give && worth(gain(game, p, take.x.color), progress(game, p, give.color)) ? { type: "action", card, target: take.q.seat, take: take.x, give } : null;
  };
const forcedEarly = (step: Step) => () => heuristic(...without(STEPS.forcedDeal).toSpliced(without(STEPS.forcedDeal).indexOf(STEPS.rent), 0, step));

/**
 * `action` as whichever of its moves leaves `p` the best `chance` from the board, with nobody
 * saying no, so it doesn't peek at their hands. With `only`, just when that beats not playing it.
 */
const byChance =
  (action: string, only = false): Step =>
  (game, p, left) => {
    const options = moves(game, p, left).filter((m) => m.type === "action" && isAction(m.card, action));
    if (!options.length) return null;
    const after = (move: Move | null) => {
      const g = game.clone();
      g.rng = mulberry32(1);
      g.policies = g.players.map(() => ({ ...defaultPolicy, sayNo: () => false }));
      if (move?.type === "action") {
        const copy = (x: Placed, seat: number) => g.players[seat].props[game.players[seat].props.indexOf(x)];
        g.play(g.players[p.seat], { ...move, take: move.take && copy(move.take, move.target!), give: move.give && copy(move.give, p.seat) });
      }
      return chance(g, p.seat);
    };
    let best: Move | null = null;
    let top = only ? after(null) : -Infinity;
    for (const m of options) {
      const c = after(m);
      if (c > top) [top, best] = [c, m];
    }
    return best;
  };
const withStep = (from: Step, to: Step) => () => heuristic(...swap(from, to));
const beforeBank = (step: Step) => () => heuristic(...steps.toSpliced(steps.indexOf(STEPS.bank), 0, step));

/** Banks a two-color Rent card when we have neither color. */
const deadRent: Step = (game, p) => {
  const card = p.hand.find((c) => c.kind === "rent" && c.colors !== "any" && colorsOf(c).every((color) => count(p, color) === 0));
  return card ? { type: "bank", card } : null;
};

/** Pays with the cheapest loose property that covers `amount` alone, if there is one. */
const payOneLoose: Policy["pay"] = (game, p, amount) => {
  const x = p.props.filter((x) => x.card.value >= amount && loose(game, p, x)).sort((a, b) => a.card.value - b.card.value)[0];
  return x ? [x] : defaultPolicy.pay(game, p, amount);
};

/** Pays with loose properties, cheapest first, then like the default for what's left. */
const payLooseFirst: Policy["pay"] = (game, p, amount) => {
  const paid: Placed[] = [];
  let owed = amount;
  for (const x of p.props.filter((x) => x.card.value > 0 && loose(game, p, x)).sort((a, b) => a.card.value - b.card.value)) {
    if (owed <= 0) break;
    paid.push(x);
    owed -= x.card.value;
  }
  return owed > 0 ? [...paid, ...defaultPolicy.pay(game, { ...p, props: p.props.filter((x) => !paid.includes(x)) }, owed)] : paid;
};

/** When the bank can't cover it, pays from loose properties before the bank. */
const payTableFirst: Policy["pay"] = (game, p, amount) =>
  p.bank.reduce((s, c) => s + c.value, 0) >= amount ? defaultPolicy.pay(game, p, amount) : payLooseFirst(game, p, amount);

/** Deal Breaker like the default, but on the leader's sets before anyone else's. */
const breakLeader: Step = (game, p) => {
  const breaker = p.hand.find((c) => isAction(c, "dealBreaker"));
  if (!breaker) return null;
  const top = leader(game, p, 0);
  const sets = game.players.filter((q) => q !== p).flatMap((q) => fullColors(game, q).map((color) => ({ q, color })));
  const pick = sets.filter((s) => !fullSets(game, p, s.color)).sort((a, b) => +(b.q === top) - +(a.q === top) || rent(game, b.q, b.color) - rent(game, a.q, a.color))[0];
  return pick ? { type: "action", card: breaker, target: pick.q.seat, color: pick.color } : null;
};

/** When the plays left can empty the hand, banks what's left, for 5 cards next turn instead of 2. */
const emptyHand: Step = (game, p, left) => {
  const card = p.hand.length <= left && p.hand.find((c) => c.kind !== "property" && c.kind !== "wild");
  return card ? { type: "bank", card } : null;
};

/** `step`, only after the first `rounds` rounds. */
const after =
  (rounds: number, step: Step): Step =>
  (game, p, left) =>
    game.turns > rounds * game.players.length ? step(game, p, left) : null;

const steps = Object.values(STEPS) as Step[];
const without = (...drop: Step[]) => steps.filter((s) => !drop.includes(s));
const swap = (from: Step, to: Step) => steps.map((s) => (s === from ? to : s));
const { passGo, complete, dealBreaker, place, placeWhenBanked, bankBuildings, passGoLast } = STEPS;

export const VARIANTS: Record<string, () => Policy> = {
  "the builder": () => STRATEGIES.builder(0),
  "lay down properties before charging (previous)": () => heuristic(...without(place).toSpliced(4, 0, place)),
  "lay down properties before banking (previous)": () => heuristic(...without(place).toSpliced(7, 0, place)),
  "build houses and hotels, never bank them (previous)": () => heuristic(...without(bankBuildings).toSpliced(-2, 0, build)),
  "build, else bank them": () => heuristic(...steps.toSpliced(-3, 0, build)),
  "Pass Go only as the last play": () => heuristic(...without(passGo)),
  "bank Pass Go": () => heuristic(...without(passGo, passGoLast), bankIt("passGo")),
  "Deal Breaker before Pass Go": () => heuristic(...without(dealBreaker).toSpliced(0, 0, dealBreaker)),
  "Sly Deal before Pass Go": () => heuristic(...without(STEPS.slyDeal).toSpliced(steps.indexOf(STEPS.passGo), 0, STEPS.slyDeal)),
  "Debt Collector on the richest (previous)": () => heuristic(...swap(STEPS.debtCollector, collect(richest))),
  "any-color Rent on the richest (previous)": () => heuristic(...swap(STEPS.rent, charge(richest))),
  "bank all money before laying down properties (previous)": () => heuristic(...without(placeWhenBanked)),
  "Debt Collector on the most money banked": () => heuristic(...swap(STEPS.debtCollector, collect(mostBanked))),
  "any-color Rent on the most money banked": () => heuristic(...swap(STEPS.rent, charge(mostBanked))),
  "lay down wilds before charging": () => heuristic(...steps.toSpliced(steps.indexOf(complete) + 1, 0, placeWild)),
  "lay down the most progress first": placeVariant((game, p, card, color) => toward(game, p, color)),
  "lay down the least progress first": placeVariant((game, p, card, color) => -toward(game, p, color) + (toward(game, p, color) ? 0 : -9)),
  "lay down the most progress first, wilds last": placeVariant((game, p, card, color) => toward(game, p, color) - +(card.kind === "wild")),
  "lay down the cheapest first": placeVariant((game, p, card, color) => -card.value + toward(game, p, color) / 10),
  "lay down the dearest first": placeVariant((game, p, card, color) => card.value + toward(game, p, color) / 10),
  "lay down the highest rent first": placeVariant((game, p, card, color) => COLORS[color].rent[Math.min(count(p, color), size(color) - 1)] + toward(game, p, color) / 10),
  "lay down wilds first": placeVariant((game, p, card, color) => +(card.kind === "wild") + toward(game, p, color) / 10),
  "lay down a property a Rent in hand charges, then charge": () => heuristic(...steps.toSpliced(steps.indexOf(STEPS.rent), 0, placeForRent)),
  "lay down properties before Debt Collector and Birthday": () =>
    heuristic(...without(STEPS.debtCollector, STEPS.birthday).toSpliced(-1, 0, STEPS.debtCollector, STEPS.birthday)),
  "lay down the smallest sets first": placeVariant((game, p, card, color) => -size(color) + toward(game, p, color) / 10),
  "any-color Rent and Debt Collector on the leader (previous)": both(leader),
  "any-color Rent and Debt Collector on the most paid in property": both(mostProperty),
  "any-color Rent on the least banked": () => heuristic(...swap(STEPS.rent, charge(leastBanked))),
  "charge rent worth $2M or more at 2 players (previous)": () => heuristic(...swap(STEPS.rent, charge(inProperty, 2))),
  "hold the card that completes a set unless it wins": () =>
    heuristic(...steps.map((s) => (s === complete ? completeToWin : s === place ? placeHolding : s === placeWhenBanked ? placeOnce(10, placeHolding) : s))),
  "Just Say No only against Deal Breaker": () => ({ ...defaultPolicy, sayNo: saveNo(Infinity) }),
  "keep one Just Say No for a Deal Breaker": () => ({ ...defaultPolicy, sayNo: saveNo(1) }),
  "keep two Just Say Nos for a Deal Breaker": () => ({ ...defaultPolicy, sayNo: saveNo(2) }),
  "Forced Deal before rent": forcedEarly(STEPS.forcedDeal),
  "Forced Deal whenever it can": () => heuristic(...swap(STEPS.forcedDeal, forced(() => true))),
  "Forced Deal giving wilds too": () => heuristic(...swap(STEPS.forcedDeal, forced((a, b) => a > b, true))),
  "Forced Deal unless it gives more progress than it takes": () => heuristic(...swap(STEPS.forcedDeal, forced((a, b) => a >= b))),
  "Forced Deal whenever it can, before rent": forcedEarly(forced(() => true)),
  "Forced Deal whenever it can, giving wilds too, before rent": forcedEarly(forced(() => true, true)),
  "bank Forced Deal": () => heuristic(bankIt("forcedDeal"), ...without(STEPS.forcedDeal)),
  "bank Sly Deal": () => heuristic(bankIt("slyDeal"), ...without(STEPS.slyDeal)),
  "bank Forced Deal and Sly Deal": () => heuristic(bankIt("forcedDeal", "slyDeal"), ...without(STEPS.forcedDeal, STEPS.slyDeal)),
  "play Forced Deal in the first round (previous)": () => heuristic(...without(STEPS.bankForcedDeal)),
  "bank Double the Rent":() => heuristic(bankIt("doubleRent"), ...steps),
  "hold Double the Rent (previous)": () => heuristic(...without(STEPS.bankDoubleRent)),
  "bank Rent cards for colors we have none of": beforeBank(deadRent),
  "Deal Breaker on the leader first": withStep(STEPS.dealBreaker, breakLeader),
  "pay with one loose property when it covers the charge": () => ({ ...defaultPolicy, pay: payOneLoose }),
  "pay with loose properties before money": () => ({ ...defaultPolicy, pay: payLooseFirst }),
  "pay with loose properties before money when the bank can't cover it": () => ({ ...defaultPolicy, pay: payTableFirst }),
  "let Debt Collector through": () => ({ ...defaultPolicy, sayNo: (game, p, move, from) => !isAction(move.card, "debtCollector") && defaultPolicy.sayNo(game, p, move, from) }),
  "never counter a Just Say No": () => ({ ...defaultPolicy, sayNo: (game, p, move, from) => game.players[game.current] !== p && defaultPolicy.sayNo(game, p, move, from) }),
  "Forced Deal for the best chance":withStep(STEPS.forcedDeal, byChance("forcedDeal")),
  "Forced Deal for the best chance, if it raises it": withStep(STEPS.forcedDeal, byChance("forcedDeal", true)),
  "Sly Deal for the best chance": withStep(STEPS.slyDeal, byChance("slyDeal")),
  "Deal Breaker for the best chance": withStep(STEPS.dealBreaker, byChance("dealBreaker")),
  "empty the hand when the plays left can": () => heuristic(...steps, emptyHand),
  "hold Birthday in the first round": withStep(STEPS.birthday, after(1, STEPS.birthday)),
  "Deal Breaker and Sly Deal before Pass Go after round 3": () => heuristic(after(3, dealBreaker), after(3, STEPS.slyDeal), ...steps),
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
