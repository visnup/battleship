import { BACK, type Card, type Color, COLORS, deck, name } from "./cards.ts";

/** A card from the hand, face up, or `down` as the magenta 5 on its back. */
export type Play = { card: Card; down: boolean };

/** Every choice a player makes. */
export interface Policy {
  /** The card to play, from `game.legal(p)`. */
  play(game: Game, p: Player): Play;
}

export type Player = {
  seat: number;
  hand: Card[];
  /** The plays that won tricks this hand, which score. */
  won: Play[];
  chips: number;
  /** The total of `won`. */
  points: number;
  /** Colors this player has shown they have none of this hand. */
  voids: Color[];
  /** Cards this player has played face down this hand, which only they know. */
  hidden: Card[];
};

/** Readings the sheet leaves open. */
export type Rules = {
  /** Whether players tied for a place all take the lowest of the places they tie for, as the sheet says, or the highest. */
  tiesLow: boolean;
};
export const RULES: Rules = { tiesLow: true };

export const TARGET = 25;
export const HANDS = 4;
export const TRUMP: Color = "silver";

export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The card a play counts as: its face, or the magenta 5. */
export const face = (play: Play): Card => (play.down ? BACK : play.card);

/** Every play, face up and down, made once, so finding the legal ones allocates nothing. */
const UP: Play[] = [];
const DOWN: Play[] = [];
export const up = (card: Card) => (UP[card.id] ??= { card, down: false });
export const down = (card: Card) => (DOWN[card.id] ??= { card, down: true });

/** Whether `a` beats `b` in a trick led in `led`: silver over everything else, then the led color, then the higher number. */
export const beats = (a: Card, b: Card, led: Color) => (a.color === b.color ? a.value > b.value : a.color === TRUMP || (a.color === led && b.color !== TRUMP));

/** A hand's total: the faces of the plays that won tricks. */
export const total = (p: Player) => p.points;

/** A hand's scoring: each player's total and the chips each gained or lost. */
export type Scored = { hand: number; totals: number[]; gained: number[]; pot: number };

/** A trick as it ended, and who won it. */
export type Trick = { plays: { seat: number; play: Play }[]; winner: number };

export class Game {
  players: Player[];
  policies: Policy[];
  rng: () => number;
  rules: Rules;
  /** The hand being played, from 1. */
  hand = 0;
  /** The trick under way, in the order played. */
  trick: { seat: number; play: Play }[] = [];
  /** The last trick to end. */
  last: Trick | null = null;
  current = 0;
  /** Chips carried over from a hand whose best score was tied, for the next hand's closest player. */
  pot = 0;
  /** Cards played face up this hand, which everyone has seen. */
  seen: Card[] = [];
  scores: Scored[] = [];
  /** Cards played in the game so far. */
  played = 0;
  /** Who won the game, more than one when they share it. */
  winners: number[] | null = null;
  log?: (line: string) => void;

  constructor({ players, rng, policies = defaultPolicy, rules = RULES, log }: { players: number; rng: () => number; policies?: Policy | Policy[]; rules?: Rules; log?: (line: string) => void }) {
    if (players < 3 || players > 4) throw new Error("3 or 4 players");
    this.rng = rng;
    this.rules = rules;
    this.log = log;
    this.policies = Array.isArray(policies) ? policies : Array.from({ length: players }, () => policies);
    this.players = Array.from({ length: players }, (_, seat) => ({ seat, hand: [], won: [], points: 0, chips: 5, voids: [], hidden: [] }));
    this.deal();
  }

  clone(): Game {
    const g = Object.create(Game.prototype) as Game;
    Object.assign(g, this);
    g.players = this.players.map((p) => ({ ...p, hand: [...p.hand], won: [...p.won], voids: [...p.voids], hidden: [...p.hidden] }));
    g.trick = [...this.trick];
    g.seen = [...this.seen];
    g.scores = [...this.scores];
    return g;
  }

  /** Shuffles and deals every card, and whoever has the magenta 0 leads. */
  deal() {
    this.hand++;
    const cards = shuffle(deck(this.players.length), this.rng);
    const k = cards.length / this.players.length;
    for (const p of this.players) Object.assign(p, { hand: cards.splice(0, k), won: [], points: 0, voids: [], hidden: [] });
    this.seen = [];
    this.trick = [];
    this.current = this.players.find((p) => p.hand.some((c) => c.color === "magenta" && c.value === 0))!.seat;
    this.log?.(`hand ${this.hand}: ${this.players.map((p) => `${p.seat}: ${p.hand.map(name).join(", ")}`).join(" | ")}`);
  }

  /** The color led this trick, if it's begun. */
  led(): Color | undefined {
    return this.trick[0] && face(this.trick[0].play).color;
  }

  /** The seat winning the trick so far. */
  taking(): number | undefined {
    const led = this.led()!;
    let best = this.trick[0];
    for (const t of this.trick) if (beats(face(t.play), face(best.play), led)) best = t;
    return best?.seat;
  }

  /** Every play `p` may make now. */
  legal(p: Player): Play[] {
    const led = this.led();
    // only one magenta 5 a trick
    const back = !this.trick.some((t) => t.play.down);
    let follow = 0;
    if (led) for (const c of p.hand) follow += +(c.color === led);
    const out: Play[] = [];
    for (const card of p.hand) if (!follow || card.color === led) out.push(up(card));
    // leading, with nothing to follow, or following magenta, any card can be the magenta 5; else
    // only the last card of the led color, flipped
    if (back) for (const card of p.hand) if (!follow || led === "magenta" || (follow === 1 && card.color === led)) out.push(down(card));
    return out;
  }

  /** Whether `p` may make `play` now. */
  allowed(p: Player, play: Play): boolean {
    if (!p.hand.includes(play.card)) return false;
    const led = this.led();
    let follow = 0;
    if (led) for (const c of p.hand) follow += +(c.color === led);
    if (!play.down) return !follow || play.card.color === led;
    return !this.trick.some((t) => t.play.down) && (!follow || led === "magenta" || (follow === 1 && play.card.color === led));
  }

  /** The current player plays `play`, or what their policy picks. */
  step(play: Play = this.policies[this.current].play(this, this.players[this.current])) {
    const p = this.players[this.current];
    if (!this.allowed(p, play)) throw new Error(`${p.seat} can't play ${name(play.card)}${play.down ? " face down" : ""}`);
    const led = this.led();
    p.hand.splice(p.hand.indexOf(play.card), 1);
    if (play.down) p.hidden.push(play.card);
    else this.seen.push(play.card);
    // A magenta 5 off a led color other than magenta means none of it is left in hand; off magenta it shows nothing.
    if (led && face(play).color !== led && !(led === "magenta" && play.down) && !p.voids.includes(led)) p.voids.push(led);
    this.trick.push({ seat: p.seat, play });
    this.played++;
    this.log?.(`  ${p.seat} plays ${play.down ? "a magenta 5 face down" : name(play.card)}`);
    if (this.trick.length < this.players.length) {
      this.current = (this.current + 1) % this.players.length;
      return;
    }
    const w = this.taking()!;
    const winner = this.players[w];
    const won = this.trick.find((t) => t.seat === w)!.play;
    winner.won.push(won);
    winner.points += face(won).value;
    this.last = { plays: this.trick, winner: w };
    this.trick = [];
    this.current = w;
    this.log?.(`  ${w} wins the trick: ${winner.points}`);
    if (!p.hand.length) this.score();
  }

  /** Scores the hand, then deals the next or ends the game. */
  score() {
    const n = this.players.length;
    const totals = this.players.map(total);
    const gained = totals.map(() => 0);
    const fine = this.players.filter((p) => totals[p.seat] <= TARGET);
    for (const p of fine) {
      // the place of a score: tied players take the lowest place they tie for, or the highest
      const place = this.rules.tiesLow ? fine.filter((q) => totals[q.seat] >= totals[p.seat]).length : 1 + fine.filter((q) => totals[q.seat] > totals[p.seat]).length;
      gained[p.seat] += Math.max(0, n - place) + +(totals[p.seat] === TARGET);
    }
    const top = Math.max(-1, ...fine.map((p) => totals[p.seat]));
    const best = fine.filter((p) => totals[p.seat] === top);
    // each bust gives a chip to the one closest, or to the pot when that's tied or nobody
    let pot = this.pot;
    for (const p of this.players)
      if (totals[p.seat] > TARGET && p.chips > 0) {
        gained[p.seat]--;
        pot++;
      }
    if (best.length === 1) {
      gained[best[0].seat] += pot;
      pot = 0;
    }
    for (const p of this.players) p.chips += gained[p.seat];
    this.pot = this.hand === HANDS ? 0 : pot;
    this.scores.push({ hand: this.hand, totals, gained, pot: this.pot });
    this.log?.(`hand ${this.hand} scores: ${totals.map((t, i) => `${i}: ${t} ${gained[i] >= 0 ? "+" : ""}${gained[i]}`).join(", ")}${this.pot ? `; ${this.pot} in the pot` : ""}`);
    if (this.hand < HANDS) return this.deal();
    // most chips, then closest to 25 in the last hand, then shared
    const key = (p: Player) => [p.chips, totals[p.seat] <= TARGET ? totals[p.seat] : -1];
    const [chips, closest] = this.players.map(key).reduce((a, b) => (b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? b : a));
    this.winners = this.players.filter((p) => key(p)[0] === chips && key(p)[1] === closest).map((p) => p.seat);
    this.log?.(`${this.winners.join(" and ")} ${this.winners.length > 1 ? "share" : "wins"} with ${chips} chips`);
  }

  /** Makes `play` for the current player, if given, then plays to the end, or until `hands` more hands have been dealt. */
  run(play?: Play, hands = HANDS) {
    if (play) this.step(play);
    const until = this.hand + hands;
    while (!this.winners && this.hand < until) this.step();
    return { winners: this.winners, chips: this.players.map((p) => p.chips) };
  }
}

/** A share of a win: 1, or a fraction when it's shared. */
export const share = (winners: number[] | null, seat: number) => (winners?.includes(seat) ? 1 / winners.length : 0);

/** The other players, in turn order from `p`. */
export const others = (game: Game, p: Player) => game.players.map((_, i) => game.players[(p.seat + 1 + i) % game.players.length]).slice(0, -1);

/** Cards `p` hasn't seen: not in their hand, not played face up, and not played face down by them. */
export function unseen(game: Game, p: Player): Card[] {
  if (outGame === game && outPlayed === game.played && outSeat === p.seat) return out;
  [outGame, outPlayed, outSeat] = [game, game.played, p.seat];
  const known = new Set([...p.hand, ...game.seen, ...p.hidden]);
  return (out = deck(game.players.length).filter((c) => !known.has(c)));
}
// the last answer, since a decision asks for it once a play
let out: Card[] = [];
let outGame: Game | undefined;
let outPlayed = -1;
let outSeat = -1;

const known = new Uint8Array(52);
const top4 = new Int8Array(4);
let topGame: Game | undefined;
let topPlayed = -1;
let topSeat = -1;
/** The highest value of each color (by its place in `COLORS`) `p` hasn't seen, or −1, worked out once a decision. */
export function top(game: Game, p: Player): Int8Array {
  if (topGame === game && topPlayed === game.played && topSeat === p.seat) return top4;
  [topGame, topPlayed, topSeat] = [game, game.played, p.seat];
  known.fill(0);
  for (const c of p.hand) known[c.id] = 1;
  for (const c of game.seen) known[c.id] = 1;
  for (const c of p.hidden) known[c.id] = 1;
  top4.fill(-1);
  for (const c of deck(game.players.length)) {
    const i = COLORS.indexOf(c.color);
    if (!known[c.id] && c.value > top4[i]) top4[i] = c.value;
  }
  return top4;
}

/** Whether `play` would be winning the trick once played. */
export function winning(game: Game, play: Play): boolean {
  const f = face(play);
  const led = game.led() ?? f.color;
  for (const t of game.trick) if (!beats(f, face(t.play), led)) return false;
  return true;
}

/** Whether `p` playing `play` now is sure to win the trick: nobody still to play can hold a card that beats it. */
export function sure(game: Game, p: Player, play: Play): boolean {
  if (!winning(game, play)) return false;
  if (game.trick.length === game.players.length - 1) return true;
  const f = face(play);
  const led = game.led() ?? f.color;
  const t = top(game, p);
  if (t[2] > (f.color === TRUMP ? f.value : -1)) return false;
  if (f.color !== TRUMP && t[COLORS.indexOf(led)] > f.value) return false;
  // a magenta 5 from someone still to play
  return !(led === "magenta" && f.value < 5 && !play.down && !game.trick.some((x) => x.play.down));
}

/** A rule of the default player's: a play, or `undefined` to leave it to the next rule. */
export type Step = (game: Game, p: Player, plays: Play[]) => Play | undefined;

const room = (p: Player) => TARGET - total(p);

/** Of the plays `ok` allows, the one `score` puts highest, the last of equals; `undefined` if none. */
function most(plays: Play[], score: (x: Play) => number, ok: (x: Play) => boolean = () => true): Play | undefined {
  let best: Play | undefined;
  let s = -Infinity;
  for (const x of plays)
    if (ok(x)) {
      const v = score(x);
      if (v >= s) [best, s] = [x, v];
    }
  return best;
}
/** Of the plays `ok` allows, the one `score` puts lowest, the first of equals. */
const least = (plays: Play[], score: (x: Play) => number, ok?: (x: Play) => boolean) => {
  let best: Play | undefined;
  let s = Infinity;
  for (const x of plays)
    if (!ok || ok(x)) {
      const v = score(x);
      if (v < s) [best, s] = [x, v];
    }
  return best;
};
const value = (x: Play) => face(x).value;

/** A sure win that leaves at least `slack` to go, or reaches 25 exactly: the biggest. */
export const takeWithin =
  (slack: number): Step =>
  (game, p, plays) =>
    most(plays, value, (x) => (value(x) === room(p) || value(x) <= room(p) - slack) && sure(game, p, x));

export const STEPS = {
  /** Once busted, nothing more can be lost this hand: dump the biggest card. */
  busted(game, p, plays) {
    return room(p) < 0 ? most(plays, (x) => x.card.value) : undefined;
  },
  /** A sure win that makes exactly 25. */
  exact(game, p, plays) {
    return plays.find((x) => value(x) === room(p) && sure(game, p, x));
  },
  /** A sure win that doesn't bust. */
  take: takeWithin(0),
  /** A play that loses the trick for now, dumping the biggest card: face down, if that also loses, gets rid of a high card for a 5. */
  duck(game, p, plays) {
    if (!game.trick.length)
      return least(
        plays,
        (x) => x.card.value,
        (x) => !x.down,
      );
    return least(
      plays,
      (x) => -x.card.value * 2 - +x.down,
      (x) => !winning(game, x),
    );
  },
  /** Winning whatever's played: the biggest that doesn't bust if it holds, or else the smallest, the likeliest to be beaten. */
  least(game, p, plays) {
    return most(plays, value, (x) => value(x) <= room(p)) ?? least(plays, value);
  },
} satisfies Record<string, Step>;

export function heuristic(...steps: (keyof typeof STEPS | Step)[]): Policy {
  const rules = steps.map((s) => (typeof s === "string" ? STEPS[s] : s));
  return {
    play(game, p) {
      const plays = game.legal(p);
      if (plays.length === 1) return plays[0];
      for (const step of rules) {
        const play = step(game, p, plays);
        if (play) return play;
      }
      return plays[0];
    },
  };
}

export const defaultPolicy: Policy = heuristic(...(Object.keys(STEPS) as (keyof typeof STEPS)[]));
