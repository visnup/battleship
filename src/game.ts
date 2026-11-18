import { BIRTHDAY, type Card, type Color, COLORS, DEBT, DECK, HOTEL_RENT, HOUSE_RENT } from "./cards.ts";

export const COLOR_NAMES = Object.keys(COLORS) as Color[];
/** How many cards make a full set of `color`. */
export const size = (color: Color) => COLORS[color].rent.length;
const INDEX = Object.fromEntries(COLOR_NAMES.map((c, i) => [c, i])) as Record<Color, number>;
const SIZES = COLOR_NAMES.map(size);
export const buildable = (color: Color) => color !== "railroad" && color !== "utility";

/** A property or wild card on the table, and the color it's being used as. */
export type Placed = { card: Card; color: Color };

export type Player = {
  seat: number;
  hand: Card[];
  bank: Card[];
  props: Placed[];
  /** Houses and hotels, on the full set of their color. */
  built: Placed[];
};

export type Move =
  | { type: "bank"; card: Card }
  | { type: "place"; card: Card; color: Color }
  | { type: "rent"; card: Card; color: Color; target?: number; doubles: Card[] }
  | { type: "action"; card: Card; target?: number; take?: Placed; give?: Placed; color?: Color };

/** The rules the sheet leaves open, each read the way `defaultRules` says. */
export type Rules = {
  /** A set made only of multicolored wilds counts as full. */
  wildOnlySets: boolean;
  /** When the draw pile runs out, the play pile is shuffled into a new one. */
  reshuffle: boolean;
  /** How many Double the Rents can go on one Rent card. */
  doubles: number;
  /** Just Say No on your own turn counts as one of your three plays. */
  noIsPlay: boolean;
  /** Where a house or hotel goes once its set is no longer full: it stays, or goes to its owner's bank or the discard pile. */
  stranded: "stay" | "bank" | "discard";
  /** Cards past 7 in hand go on the discard pile, not the bottom of the draw pile. */
  overflowToPile: boolean;
  /** Deal Breaker takes the set's house and hotel; otherwise they go to the victim's bank. */
  breakerTakesBuildings: boolean;
};

export const defaultRules: Rules = {
  wildOnlySets: false,
  reshuffle: true,
  doubles: 2,
  noIsPlay: true,
  stranded: "discard",
  overflowToPile: true,
  breakerTakesBuildings: true,
};

export type Policy = {
  /** The next card to play, or null to end the turn. `left` is how many plays remain. */
  move(game: Game, p: Player, left: number): Move | null;
  /** Cards from the table worth at least `amount`, or everything payable if that falls short. */
  pay(game: Game, p: Player, amount: number): (Card | Placed)[];
  /** Whether to play Just Say No against `move`, or against a No played on `move`. */
  sayNo(game: Game, p: Player, move: Move, from: Player): boolean;
  /** Which cards to give up past 7 in hand. */
  discard(game: Game, p: Player, n: number): Card[];
};

export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const remove = <T>(xs: T[], x: T) => {
  const i = xs.indexOf(x);
  if (i < 0) throw new Error("not there");
  xs.splice(i, 1);
};

export type GameOptions = {
  players: number;
  rng?: () => number;
  /** One per seat, or one for everyone. */
  policies?: Policy | Policy[];
  rules?: Partial<Rules>;
  /** Who goes first; random by default. */
  first?: number;
  /** A deck to deal from the top of, in place of a shuffled one. */
  deck?: Card[];
  log?: boolean;
};

export type GameResult = { winner: number | null; turns: number; stalled: boolean; reshuffles: number };

// Not an Error, so throwing it doesn't capture a stack trace every game.
class GameOver {}

export const MAX_TURNS = 200;

export class Game {
  players: Player[];
  draw: Card[];
  pile: Card[] = [];
  rng: () => number;
  rules: Rules;
  policies: Policy[];
  current: number;
  turns = 0;
  /** Plays the current player has left this turn. */
  left = 0;
  reshuffles = 0;
  winner: number | null = null;
  log?: string[];

  constructor(o: GameOptions) {
    this.rng = o.rng ?? Math.random;
    this.rules = { ...defaultRules, ...o.rules };
    this.policies = Array.isArray(o.policies) ? o.policies : Array(o.players).fill(o.policies ?? defaultPolicy);
    this.draw =
      o.deck ??
      shuffle(
        DECK.map((c) => ({ ...c })),
        this.rng,
      );
    this.players = Array.from({ length: o.players }, (_, seat) => ({ seat, hand: [], bank: [], props: [], built: [] }));
    for (let i = 0; i < 5; i++) for (const p of this.players) p.hand.push(...this.take(1));
    this.current = o.first ?? Math.floor(this.rng() * o.players);
    if (o.log) this.log = [];
  }

  say(line: string) {
    this.log?.push(line);
  }

  take(n: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < n; i++) {
      if (!this.draw.length && this.rules.reshuffle && this.pile.length) {
        this.draw = shuffle(this.pile, this.rng);
        this.pile = [];
        this.reshuffles++;
      }
      const card = this.draw.shift();
      if (card) cards.push(card);
    }
    return cards;
  }

  /**
   * Plays the game out, or with `move`, first finishes the current turn starting with it. With
   * `until`, stops after that many turns in all, with no winner.
   */
  run(move?: Move | null, until = MAX_TURNS): GameResult {
    try {
      if (move !== undefined) {
        this.plays(this.players[this.current], move);
        this.current = (this.current + 1) % this.players.length;
      }
      while (this.turns < Math.min(until, MAX_TURNS)) {
        this.turn(this.players[this.current]);
        this.current = (this.current + 1) % this.players.length;
      }
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    return { winner: this.winner, turns: this.turns, stalled: this.winner === null, reshuffles: this.reshuffles };
  }

  /** A copy to play on without changing this one. Cards are shared; they never change. */
  clone(): Game {
    const g: Game = Object.assign(Object.create(Game.prototype), this);
    g.players = this.players.map((p) => ({
      seat: p.seat,
      hand: [...p.hand],
      bank: [...p.bank],
      props: p.props.map((x) => ({ ...x })),
      built: p.built.map((x) => ({ ...x })),
    }));
    g.draw = [...this.draw];
    g.pile = [...this.pile];
    g.log = undefined;
    return g;
  }

  turn(p: Player) {
    this.turns++;
    p.hand.push(...this.take(p.hand.length ? 2 : 5));
    this.say(`turn ${this.turns}: P${p.seat} draws, holds ${p.hand.length}`);
    arrange(this, p);
    this.checkWin(p);
    this.left = 3;
    this.plays(p);
  }

  /** The rest of `p`'s turn: plays until it stops or runs out, then the discard. */
  plays(p: Player, first?: Move | null) {
    while (this.left > 0) {
      const move = first !== undefined ? first : this.policies[p.seat].move(this, p, this.left);
      first = undefined;
      if (!move) break;
      this.left -= 1 + (move.type === "rent" ? move.doubles.length : 0);
      this.play(p, move);
      if (move.type !== "bank" && !isAction(move.card, "passGo")) {
        arrange(this, p);
        this.checkWin(p);
      }
    }
    if (p.hand.length > 7) {
      const cards = this.policies[p.seat].discard(this, p, p.hand.length - 7);
      for (const c of cards) remove(p.hand, c);
      (this.rules.overflowToPile ? this.pile : this.draw).push(...cards);
      this.say(`P${p.seat} discards ${cards.map(name).join(", ")}`);
    }
  }

  checkWin(p: Player) {
    if (fullColors(this, p).length >= 3) {
      this.winner = p.seat;
      this.say(`P${p.seat} wins with ${fullColors(this, p).join(", ")}`);
      throw new GameOver();
    }
  }

  play(p: Player, move: Move) {
    const { card } = move;
    remove(p.hand, card);
    if (move.type === "bank") {
      p.bank.push(card);
      this.say(`P${p.seat} banks ${name(card)}`);
      return;
    }
    if (move.type === "place") {
      if (card.kind === "action") p.built.push({ card, color: move.color });
      else p.props.push({ card, color: move.color });
      this.say(`P${p.seat} places ${name(card)} as ${move.color}`);
      return;
    }
    this.pile.push(card);
    for (const d of move.type === "rent" ? move.doubles : []) {
      remove(p.hand, d);
      this.pile.push(d);
    }
    const detail = [
      move.type === "rent" && `${move.color} for ${rent(this, p, move.color) * 2 ** move.doubles.length}`,
      move.type === "action" && move.take && `taking ${name(move.take.card)}`,
      move.type === "action" && move.give && `for ${name(move.give.card)}`,
      move.type === "action" && move.color && `taking ${move.color}`,
      move.target !== undefined && `from P${move.target}`,
    ].filter(Boolean);
    this.say(`P${p.seat} plays ${name(card)}${detail.length ? ` (${detail.join(" ")})` : ""}`);
    const targets = move.target !== undefined ? [this.players[move.target]] : this.players.filter((q) => q !== p);
    if (move.type === "rent") {
      const amount = rent(this, p, move.color) * 2 ** move.doubles.length;
      for (const q of targets) if (!this.refused(p, q, move)) this.collect(q, p, amount);
      return;
    }
    if (card.kind !== "action") throw new Error(`can't play ${name(card)}`);
    switch (card.action) {
      case "passGo":
        p.hand.push(...this.take(2));
        return;
      case "birthday":
        for (const q of targets) if (!this.refused(p, q, move)) this.collect(q, p, BIRTHDAY);
        return;
      case "debtCollector":
        if (!this.refused(p, targets[0], move)) this.collect(targets[0], p, DEBT);
        return;
      case "slyDeal": {
        const q = targets[0];
        if (this.refused(p, q, move)) return;
        remove(q.props, move.take!);
        receive(this, p, move.take!);
        return;
      }
      case "forcedDeal": {
        const q = targets[0];
        if (this.refused(p, q, move)) return;
        remove(q.props, move.take!);
        remove(p.props, move.give!);
        receive(this, p, move.take!);
        receive(this, q, move.give!);
        return;
      }
      case "dealBreaker": {
        const q = targets[0];
        if (this.refused(p, q, move)) return;
        const color = move.color!;
        const set = setOf(this, q, color);
        for (const x of set) {
          remove(q.props, x);
          p.props.push(x);
        }
        for (const x of q.built.filter((b) => b.color === color).slice(0, 2)) {
          remove(q.built, x);
          if (this.rules.breakerTakesBuildings) p.built.push(x);
          else q.bank.push(x.card);
        }
        return;
      }
      default:
        throw new Error(`can't play ${card.action}`);
    }
  }

  /** Plays out a chain of Just Say Nos from `q` against `p`'s `move`; true if it's cancelled. */
  refused(p: Player, q: Player, move: Move): boolean {
    let [from, to] = [q, p];
    let cancelled = false;
    for (;;) {
      const no = from.hand.find((c) => c.kind === "action" && c.action === "justSayNo");
      const play = this.rules.noIsPlay && from === this.players[this.current];
      if (!no || (play && this.left <= 0) || !this.policies[from.seat].sayNo(this, from, move, to)) return cancelled;
      if (play) this.left--;
      remove(from.hand, no);
      this.pile.push(no);
      cancelled = !cancelled;
      this.say(`P${from.seat} says no`);
      [from, to] = [to, from];
    }
  }

  /** `q` pays `p` at least `amount`, or all it can. */
  collect(q: Player, p: Player, amount: number) {
    const paid = this.policies[q.seat].pay(this, q, amount);
    for (const x of paid) {
      if ("kind" in x) {
        remove(q.bank, x);
        p.bank.push(x);
      } else if (q.built.includes(x)) {
        remove(q.built, x);
        p.bank.push(x.card);
      } else {
        remove(q.props, x);
        receive(this, p, x);
      }
    }
    if (this.rules.stranded !== "stay")
      for (const b of q.built.filter((b) => !fullSets(this, q, b.color))) {
        remove(q.built, b);
        (this.rules.stranded === "bank" ? q.bank : this.pile).push(b.card);
      }
    this.say(`P${q.seat} pays P${p.seat} ${paid.map((x) => name("kind" in x ? x : x.card)).join(", ") || "nothing"} for ${amount}`);
  }
}

/** Puts a property `p` gained on its table, as the color that helps most. */
function receive(game: Game, p: Player, x: Placed) {
  const colors = colorsOf(x.card);
  x.color = colors.reduce((a, b) => (progress(game, p, b, 1) > progress(game, p, a, 1) ? b : a), colors.includes(x.color) ? x.color : colors[0]);
  p.props.push(x);
}

export function name(c: Card): string {
  switch (c.kind) {
    case "money":
      return `$${c.value}M`;
    case "property":
      return c.color;
    case "wild":
    case "rent":
      return `${c.kind}(${c.colors === "any" ? "any" : c.colors.join("/")})`;
    case "action":
      return c.action;
  }
}

export function colorsOf(c: Card): Color[] {
  if (c.kind === "property") return [c.color];
  if (c.kind === "wild" || c.kind === "rent") return c.colors === "any" ? COLOR_NAMES : [...c.colors];
  return [];
}

export const count = (p: Player, color: Color) => {
  let n = 0;
  for (const x of p.props) if (x.color === color) n++;
  return n;
};

/** How many full sets of `color` `p` has. */
export function fullSets(game: Game, p: Player, color: Color): number {
  let n = 0;
  let real = game.rules.wildOnlySets;
  for (const x of p.props)
    if (x.color === color) {
      n++;
      real ||= x.card.kind !== "wild" || x.card.colors !== "any";
    }
  return real ? Math.floor(n / size(color)) : 0;
}

export const fullColors = (game: Game, p: Player) => COLOR_NAMES.filter((c) => fullSets(game, p, c) > 0);

/** The cards of one full set of `color`, real properties first. */
function setOf(game: Game, p: Player, color: Color): Placed[] {
  const cards = p.props.filter((x) => x.color === color);
  return cards.sort((a, b) => +(a.card.kind === "wild") - +(b.card.kind === "wild")).slice(0, size(color));
}

/** Whether `x` can be taken by Sly Deal or Forced Deal: not part of a full set. */
export function loose(game: Game, p: Player, x: Placed): boolean {
  const n = count(p, x.color);
  return n % size(x.color) !== 0 || fullSets(game, p, x.color) === 0;
}

/** The rent `p` charges for `color`, from its best set of that color. */
export function rent(game: Game, p: Player, color: Color): number {
  const n = Math.min(count(p, color), size(color));
  if (!n) return 0;
  let r = COLORS[color].rent[n - 1];
  if (fullSets(game, p, color)) {
    const built = p.built.filter((b) => b.color === color);
    if (built.some((b) => b.card.kind === "action" && b.card.action === "house")) r += HOUSE_RENT;
    if (built.some((b) => b.card.kind === "action" && b.card.action === "hotel")) r += HOTEL_RENT;
  }
  return r;
}

/** How far `p` is toward a full set of `color` with `extra` more cards, from 0 to 1. */
export function progress(game: Game, p: Player, color: Color, extra = 0): number {
  return Math.min(1, (count(p, color) + extra) / size(color));
}

/** What everything `p` could pay with is worth. */
export const assets = (p: Player) => banked(p) + p.props.reduce((s, x) => s + x.card.value, 0) + p.built.reduce((s, x) => s + x.card.value, 0);
export const banked = (p: Player) => p.bank.reduce((s, c) => s + c.value, 0);
/** Everything `p` could pay with: the bank, houses and hotels, then properties worth something. */
export const payable = (p: Player): (Card | Placed)[] => [...p.bank, ...p.built, ...p.props.filter((x) => x.card.value > 0)];
/** What a card in a bank, or one on the table, is worth as payment. */
export const worth = (x: Card | Placed) => ("kind" in x ? x : x.card).value;

/**
 * Moves wilds between colors on `p`'s turn to make the most full sets, then the most progress,
 * keeping every house and hotel on a full set.
 */
export function arrange(game: Game, p: Player) {
  const wilds = p.props.filter((x) => x.card.kind === "wild");
  if (!wilds.length) return;
  // The answer depends only on this key, and the same tables come up again and again in playouts
  const n = new Array<number>(COLOR_NAMES.length).fill(0);
  for (const x of p.props) if (x.card.kind !== "wild") n[INDEX[x.color]]++;
  let key = `${+game.rules.wildOnlySets}`;
  for (const c of COLOR_NAMES) key += +p.built.some((b) => b.color === c);
  for (const k of n) key += k;
  for (const x of wilds) key += `${x.card.kind === "wild" && x.card.colors}${INDEX[x.color]}`;
  let best = arranged.get(key);
  if (!best) {
    if (arranged.size > 100_000) arranged.clear();
    arranged.set(key, (best = arrangement(game, p, wilds)));
  }
  wilds.forEach((x, i) => {
    const color = COLOR_NAMES[best[i]];
    if (game.log && x.color !== color) game.say(`P${p.seat} moves ${name(x.card)} to ${color}`);
    x.color = color;
  });
}
const arranged = new Map<string, number[]>();

function arrangement(game: Game, p: Player, wilds: Placed[]): number[] {
  const options = wilds.map((x) => colorsOf(x.card).map((c) => INDEX[c]));
  const combos = options.reduce((n, o) => n * o.length, 1);
  if (combos > 20000) return wilds.map((x) => INDEX[x.color]);
  // Cards of each color, and of those, how many aren't multicolored wilds
  const n = new Array<number>(COLOR_NAMES.length).fill(0);
  const real = new Array<number>(COLOR_NAMES.length).fill(0);
  for (const x of p.props) {
    if (x.card.kind === "wild") continue;
    n[INDEX[x.color]]++;
    real[INDEX[x.color]]++;
  }
  const built = COLOR_NAMES.map((c) => p.built.some((b) => b.color === c));
  const any = wilds.map((x) => x.card.kind === "wild" && x.card.colors === "any");
  const score = () => {
    let s = 0;
    for (let c = 0; c < SIZES.length; c++) {
      const full = game.rules.wildOnlySets || real[c] ? Math.floor(n[c] / SIZES[c]) : 0;
      if (built[c] && !full) return -Infinity;
      s += (full ? 100 : 0) + Math.min(1, n[c] / SIZES[c]) ** 2 * 10 + Math.max(0, n[c] - SIZES[c]) * -1;
    }
    return s;
  };
  const choice = wilds.map((x) => INDEX[x.color]);
  for (let i = 0; i < wilds.length; i++) {
    n[choice[i]]++;
    if (!any[i]) real[choice[i]]++;
  }
  let best = [...choice];
  let top = score();
  for (let i = 0; i < wilds.length; i++) {
    n[choice[i]]--;
    if (!any[i]) real[choice[i]]--;
  }
  const go = (i: number) => {
    if (i === wilds.length) {
      const s = score();
      if (s > top) [top, best] = [s, [...choice]];
      return;
    }
    for (const c of options[i]) {
      choice[i] = c;
      n[c]++;
      if (!any[i]) real[c]++;
      go(i + 1);
      n[c]--;
      if (!any[i]) real[c]--;
    }
  };
  go(0);
  return best;
}

export const isAction = (c: Card, action: string) => c.kind === "action" && c.action === action;

/** One rule of a hand-written player: a move, or null to fall through to the next rule. */
export type Step = (game: Game, p: Player, left: number) => Move | null;

// In turn order from `p`, so ties go to the next player and not to seat 0: by seat, the first
// player in seat 0 took every tie and won 21.9% at 5 players, not 23.5%.
const others = (game: Game, p: Player) => game.players.map((_, i) => game.players[(p.seat + 1 + i) % game.players.length]).slice(0, -1);
const placeable = (p: Player) => p.hand.filter((c) => c.kind === "property" || (c.kind === "wild" && (c.colors !== "any" || p.props.length)));
const bestColor = (game: Game, p: Player, c: Card) => colorsOf(c).reduce((a, b) => (gain(game, p, b) > gain(game, p, a) ? b : a));

/** Who pays a charge of `amount` aimed at one player: Debt Collector, or the any-color Rent. */
export type Target = (game: Game, p: Player, amount: number) => Player;
export const richest: Target = (game, p) => others(game, p).reduce((a, b) => (assets(b) > assets(a) ? b : a));
/** The opponent closest to winning: the most full sets, then the most progress toward more. */
export const leader: Target = (game, p) => {
  const lead = (q: Player) => fullColors(game, q).length * 10 + COLOR_NAMES.reduce((s, c) => s + progress(game, q, c), 0);
  return most(others(game, p), lead);
};
/** The first of `xs` that scores highest. */
function most<T>(xs: T[], score: (x: T) => number): T {
  const s = xs.map(score);
  return xs[s.indexOf(Math.max(...s))];
}
/**
 * Someone whose bank can't cover the charge, so they pay in property, which comes to us. Then
 * whoever pays the most, then the leader.
 */
export const inProperty: Target = (game, p, amount) => {
  const top = leader(game, p, amount);
  const score = (q: Player) => +(banked(q) < amount && assets(q) > banked(q)) * 100 + Math.min(assets(q), amount) + +(q === top) / 2;
  return most(others(game, p), score);
};

/** Any property, as the color it helps most. */
const layDown: Step = (game, p) => {
  const cards = placeable(p);
  const c = cards.find((c) => c.kind === "property") ?? cards[0];
  return c ? { type: "place", card: c, color: bestColor(game, p, c) } : null;
};

/** The rent that collects the most, doubled when it's 3 or more, if it collects `least` or more: $1M at 2 players, else $2M. */
export const charge =
  (target: Target, least?: number): Step =>
  (game, p, left) => {
    const doubles = p.hand.filter((c) => isAction(c, "doubleRent"));
    let move: Move | null = null;
    let most = 0;
    const targets = new Map<number, Player>();
    for (const c of p.hand) {
      if (c.kind !== "rent") continue;
      const wild = c.colors === "any";
      for (const color of colorsOf(c)) {
        const r = rent(game, p, color);
        if (r < (wild ? 3 : 1)) continue;
        const d = doubles.slice(0, Math.min(left - 1, r >= 3 ? game.rules.doubles : 0));
        const amount = r * 2 ** d.length;
        if (wild && !targets.has(amount)) targets.set(amount, target(game, p, amount));
        const q = wild ? targets.get(amount) : undefined;
        const payers = q ? [q] : others(game, p);
        const value = payers.reduce((s, q) => s + Math.min(assets(q), amount), 0);
        if (value > most) [most, move] = [value, { type: "rent", card: c, color, target: q?.seat, doubles: d }];
      }
    }
    return move && most >= (least ?? (game.players.length === 2 ? 1 : 2)) ? move : null;
  };

/** Debt Collector on `target`, if it has anything to pay with. */
export const collect =
  (target: Target): Step =>
  (game, p) => {
    const debt = p.hand.find((c) => isAction(c, "debtCollector"));
    if (!debt) return null;
    const q = target(game, p, DEBT);
    return assets(q) > 0 ? { type: "action", card: debt, target: q.seat } : null;
  };

/** `defaultPolicy`'s rules, in its order. */
export const STEPS = {
  /**
   * Forced Deal as money in the first round at 3+ players, when there's little worth swapping:
   * +0.35 to +0.4 points at 3–5 players, −0.3 at 2 (`variants.ts`, 400,000 games).
   */
  bankForcedDeal(game, p) {
    const c = game.players.length >= 3 && game.turns <= game.players.length && p.hand.find((c) => isAction(c, "forcedDeal"));
    return c ? { type: "bank", card: c } : null;
  },
  /** Pass Go while there's a play left after it. */
  passGo(game, p, left) {
    const c = p.hand.find((c) => isAction(c, "passGo"));
    return c && left >= 2 ? { type: "action", card: c } : null;
  },
  /** A property that completes a set. */
  complete(game, p) {
    for (const c of placeable(p)) {
      const color = bestColor(game, p, c);
      if (count(p, color) + 1 === size(color)) return { type: "place", card: c, color };
    }
    return null;
  },
  /** The highest-rent full set of a color we don't have. */
  dealBreaker(game, p) {
    const breaker = p.hand.find((c) => isAction(c, "dealBreaker"));
    if (!breaker) return null;
    const sets = others(game, p).flatMap((q) => fullColors(game, q).map((color) => ({ q, color })));
    const pick = sets.filter((s) => !fullSets(game, p, s.color)).sort((a, b) => rent(game, b.q, b.color) - rent(game, a.q, a.color))[0];
    return pick ? { type: "action", card: breaker, target: pick.q.seat, color: pick.color } : null;
  },
  /** The loose property that helps us most. */
  slyDeal(game, p) {
    const sly = p.hand.find((c) => isAction(c, "slyDeal"));
    const take = sly && stealable(game, p, others(game, p))[0];
    return take ? { type: "action", card: sly, target: take.q.seat, take: take.x } : null;
  },
  /**
   * The best rent, the any-color one on someone who has to pay in property: +2.8 points at 5
   * players, with Debt Collector, over aiming both at the leader (`variants.ts`). At 2 players,
   * even a $1M rent: +2.0 points there, and −0.2 to −0.3 at 3 and 4.
   */
  rent: charge(inProperty),
  /** Debt Collector on someone who has to pay in property. */
  debtCollector: collect(inProperty),
  /**
   * Birthday, but not in the first round, when the others have little to pay with: +0.3 to +0.9
   * points at 3–5 players, even at 2 (`variants.ts`, 100,000 games).
   */
  birthday(game, p) {
    const birthday = game.turns > game.players.length && p.hand.find((c) => isAction(c, "birthday"));
    return birthday && others(game, p).some((q) => assets(q) > 0) ? { type: "action", card: birthday } : null;
  },
  /** Our least-built loose property for one that helps more. */
  forcedDeal(game, p) {
    const forced = p.hand.find((c) => isAction(c, "forcedDeal"));
    if (!forced) return null;
    const take = stealable(game, p, others(game, p))[0];
    const give = p.props.filter((x) => loose(game, p, x) && x.color !== take?.x.color && x.card.kind !== "wild").sort((a, b) => progress(game, p, a.color) - progress(game, p, b.color))[0];
    return take && give && gain(game, p, take.x.color) > progress(game, p, give.color) ? { type: "action", card: forced, target: take.q.seat, take: take.x, give } : null;
  },
  /** Once $10M is banked, a property before more money: +0.8 points (`variants.ts`). */
  placeWhenBanked: (game, p, left) => (banked(p) >= 10 ? layDown(game, p, left) : null),
  /** Double the Rent as money, before money: +0.5 points at 2 players, +0.35 at 3 (`variants.ts`). */
  bankDoubleRent(game, p) {
    const c = p.hand.find((c) => isAction(c, "doubleRent"));
    return c ? { type: "bank", card: c } : null;
  },
  bank(game, p) {
    const money = p.hand.find((c) => c.kind === "money");
    return money ? { type: "bank", card: money } : null;
  },
  /** A house or hotel, as money. Building them instead loses 2 points a game (`variants.ts`). */
  bankBuildings(game, p) {
    const c = p.hand.find((c) => isAction(c, "house") || isAction(c, "hotel"));
    return c ? { type: "bank", card: c } : null;
  },
  /**
   * Any property, as the color it helps most, once there's nothing to charge or bank. Laying
   * them down earlier leaves them to be taken: charging first wins 2–3 points, and banking first
   * 4 more (`variants.ts`, `order.ts`). Properties before wilds: +0.2 to +0.8 points at 2–5
   * players (`variants.ts`, 400,000 games), found where `learned.ts`'s model overrules the default.
   */
  place: layDown,
  /** Pass Go with the last play. */
  passGoLast(game, p) {
    const c = p.hand.find((c) => isAction(c, "passGo"));
    return c ? { type: "action", card: c } : null;
  },
  /**
   * When the plays left can empty the hand, what's left as money, so the next turn draws 5
   * instead of 2: +0.3 to +0.8 points at 2–5 players (`variants.ts`, 100,000 games). Found where
   * `learned.ts`'s model overrules the default.
   */
  emptyHand(game, p, left) {
    const c = p.hand.length <= left && p.hand.find((c) => c.kind !== "property" && c.kind !== "wild");
    return c ? { type: "bank", card: c } : null;
  },
} satisfies Record<string, Step>;

/**
 * A player that makes the first move of `steps` that applies, each a name from `STEPS` or a step
 * of its own, and otherwise plays like `defaultPolicy`.
 */
export function heuristic(...steps: (keyof typeof STEPS | Step)[]): Policy {
  return { ...defaultPolicy, move: first(steps.map((s) => (typeof s === "string" ? STEPS[s] : s))) };
}

function first(steps: Step[]): Policy["move"] {
  return (game, p, left) => {
    for (const step of steps) {
      const move = step(game, p, left);
      if (move) return move;
    }
    return null;
  };
}

/** A hand-written player: complete sets, steal, charge, bank, then lay down properties. */
export const defaultPolicy: Policy = {
  move: first(Object.values(STEPS)),

  pay(game, p, amount) {
    const bank = [...p.bank].sort((a, b) => a.value - b.value);
    const total = banked(p);
    if (total >= amount) {
      // The fewest cards with the least change, over sums of subsets
      type Picked = { card?: Card; length: number; rest?: Picked };
      const best: (Picked | undefined)[] = [{ length: 0 }];
      for (const c of bank)
        for (let s = best.length - 1; s >= 0; s--) {
          const prev = best[s];
          if (prev && (!best[s + c.value] || best[s + c.value]!.length > prev.length + 1)) best[s + c.value] = { card: c, length: prev.length + 1, rest: prev };
        }
      for (let s = amount; ; s++)
        if (best[s]) {
          const cards: Card[] = [];
          for (let x = best[s]; x?.card; x = x.rest) cards.unshift(x.card);
          return cards;
        }
    }
    const paid: (Card | Placed)[] = [...bank];
    let owed = amount - total;
    const table = [...p.built, ...p.props.filter((x) => x.card.value > 0)].sort((a, b) => +!loose(game, p, a) - +!loose(game, p, b) || a.card.value - b.card.value);
    for (const x of table) {
      if (owed <= 0) break;
      paid.push(x);
      owed -= x.card.value;
    }
    return paid;
  },

  sayNo(game, p, move, from) {
    if (move.card.kind === "action" && move.card.action === "dealBreaker") return true;
    if (move.type === "rent") return rent(game, game.players[game.current], move.color) * 2 ** move.doubles.length >= 5;
    if (move.type === "action" && move.card.kind === "action" && (move.card.action === "slyDeal" || move.card.action === "forcedDeal")) {
      const victim = game.players[game.current] === p ? from : p;
      return progress(game, victim, move.take!.color) >= 0.5;
    }
    return move.card.kind === "action" && move.card.action === "debtCollector";
  },

  discard(game, p, n) {
    const keep = (c: Card) => (c.kind === "property" || c.kind === "wild" ? 3 : isAction(c, "justSayNo") || isAction(c, "dealBreaker") ? 2 : c.kind === "money" ? 1 : 0);
    return [...p.hand].sort((a, b) => keep(a) - keep(b) || a.value - b.value).slice(0, n);
  },
};

/** How much one more card of `color` would help `p`: toward a set, or none past a full one. */
export function gain(game: Game, p: Player, color: Color): number {
  return count(p, color) % size(color) === 0 && count(p, color) ? 0 : progress(game, p, color, 1);
}

/** Loose properties of others, the most useful to `p` first. */
export function stealable(game: Game, p: Player, others: Player[]) {
  return others
    .flatMap((q) => q.props.filter((x) => loose(game, q, x)).map((x) => ({ q, x, helps: Math.max(...colorsOf(x.card).map((c) => gain(game, p, c))) })))
    .filter(({ helps }) => helps > 0)
    .sort((a, b) => b.helps - a.helps || b.x.card.value - a.x.card.value);
}

/** Every legal move for `p` with `left` plays, one per kind of card in hand. */
export function moves(game: Game, p: Player, left: number): Move[] {
  const out: Move[] = [];
  const others = game.players.filter((q) => q !== p);
  const doubles = p.hand.filter((c) => isAction(c, "doubleRent"));
  const seen = new Set<string>();
  for (const card of p.hand) {
    const key = JSON.stringify(card);
    if (seen.has(key)) continue;
    seen.add(key);
    if (card.kind === "money" || card.kind === "action" || card.kind === "rent") out.push({ type: "bank", card });
    if (card.kind === "property" || card.kind === "wild") {
      // One color is enough: `arrange` moves wilds to their best color after every play
      out.push({ type: "place", card, color: colorsOf(card)[0] });
    } else if (card.kind === "rent") {
      for (const color of colorsOf(card)) {
        if (!rent(game, p, color)) continue;
        for (let d = 0; d <= Math.min(game.rules.doubles, doubles.length, left - 1); d++)
          for (const target of card.colors === "any" ? others.map((q) => q.seat) : [undefined]) out.push({ type: "rent", card, color, target, doubles: doubles.slice(0, d) });
      }
    } else if (card.kind === "action") {
      out.push(...actions(game, p, card, others));
    }
  }
  return out;
}

function actions(game: Game, p: Player, card: Card, others: Player[]): Move[] {
  if (card.kind !== "action") return [];
  // Identical cards of one player are the same move
  const looseOf = (q: Player) => [...new Map(q.props.filter((x) => loose(game, q, x)).map((x) => [JSON.stringify(x), x])).values()];
  const has = (color: string, a: string) => p.built.some((b) => b.color === color && isAction(b.card, a));
  const sets = fullColors(game, p).filter(buildable);
  switch (card.action) {
    case "passGo":
    case "birthday":
      return [{ type: "action", card }];
    case "debtCollector":
      return others.map((q) => ({ type: "action", card, target: q.seat }));
    case "slyDeal":
      return others.flatMap((q) => looseOf(q).map((take) => ({ type: "action", card, target: q.seat, take }) as Move));
    case "forcedDeal":
      return others.flatMap((q) => looseOf(q).flatMap((take) => looseOf(p).map((give) => ({ type: "action", card, target: q.seat, take, give }) as Move)));
    case "dealBreaker":
      return others.flatMap((q) => fullColors(game, q).map((color) => ({ type: "action", card, target: q.seat, color }) as Move));
    case "house":
      return sets.filter((c) => !has(c, "house")).map((color) => ({ type: "place", card, color }));
    case "hotel":
      return sets.filter((c) => has(c, "house") && !has(c, "hotel")).map((color) => ({ type: "place", card, color }));
    default:
      return [];
  }
}
