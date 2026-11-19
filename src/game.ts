import { type Card, type Color, COLORS, DECK, name } from "./cards.ts";

/** A play: a card from the hand, and for Bait, the force card it takes back. `null` passes. */
export type Move = { card: Card; take?: Card } | null;

/** Every choice a player makes. */
export interface Policy {
  /** As Favor holder, which chip the next battle is over. */
  color(game: Game, p: Player): Color;
  /** Play a card or pass. Only called with cards in hand. */
  move(game: Game, p: Player): Move;
  /** On passing with no force cards in hand, whether to show the hand and discard it. */
  dump(game: Game, p: Player): boolean;
}

export type Player = { seat: number; hand: Card[]; chips: number[]; row: Card[]; passed: boolean };

/** Readings the sheet leaves open. */
export type Rules = {
  /** Whether a Favor holder with no cards left still has the Favor's 1 strength in the battle. */
  emptyFavor: boolean;
};
export const RULES: Rules = { emptyFavor: true };

export const MAX_BATTLES = 500;

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

/** What it takes to win: 3 chips of a color, or one of each. */
export const won = (chips: number[]) => chips.some((c) => c >= 3) || chips.every((c) => c > 0);
/** Chips still needed to win, the fewer of the two ways. */
export const needed = (chips: number[]) => Math.min(3 - Math.max(...chips), chips.filter((c) => c === 0).length);

export class Game {
  players: Player[];
  policies: Policy[];
  rng: () => number;
  rules: Rules;
  favor: number;
  color: Color | null = null;
  winter = false;
  /** Cards played since the round's deal, face up, which everyone has seen. */
  pile: Card[] = [];
  /** What's left of the deck after the deal, which nobody has seen. */
  stock: Card[] = [];
  /** Whose turn it is in the current battle. */
  current = 0;
  /** Whether a battle is under way, and if so, whether Crows or Doves has ended it. */
  fighting = false;
  ended: "crows" | "doves" | null = null;
  battles = 0;
  rounds = 0;
  winner: number | null = null;
  log?: (line: string) => void;

  constructor({ players, rng, policies = defaultPolicy, first = 0, rules = RULES, log }: { players: number; rng: () => number; policies?: Policy | Policy[]; first?: number; rules?: Rules; log?: (line: string) => void }) {
    this.rng = rng;
    this.rules = rules;
    this.log = log;
    this.policies = Array.isArray(policies) ? policies : Array.from({ length: players }, () => policies);
    this.players = Array.from({ length: players }, (_, seat) => ({ seat, hand: [], chips: [0, 0, 0], row: [], passed: false }));
    this.favor = first;
    this.deal();
  }

  clone(): Game {
    const g = Object.create(Game.prototype) as Game;
    Object.assign(g, this);
    g.players = this.players.map((p) => ({ ...p, hand: [...p.hand], chips: [...p.chips], row: [...p.row] }));
    g.pile = [...this.pile];
    g.stock = [...this.stock];
    return g;
  }

  /** Shuffles all 96 cards and deals each player 10, plus one for each chip they have. */
  deal() {
    this.rounds++;
    const deck = shuffle(DECK, this.rng);
    for (const p of this.players) p.hand = deck.splice(0, 10 + p.chips.reduce((a, b) => a + b, 0));
    this.stock = deck;
    this.pile = [];
    this.log?.(`round ${this.rounds}: ${this.players.map((p) => `${p.seat}: ${p.hand.map(name).join(" ")}`).join(" | ")}`);
  }

  /** `p`'s total strength in the battle so far. */
  strength(p: Player): number {
    const fury = p.row.some((c) => c.kind === "fury") ? 2 : 1;
    let s = p.seat === this.favor && (this.rules.emptyFavor || p.hand.length || p.row.length) ? 1 : 0;
    for (const c of p.row) s += c.kind === "force" ? (this.winter ? 1 : c.value) * fury : c.kind === "legend" ? 10 : 0;
    return s;
  }

  /** Who'd win if the battle ended now: highest strength, then fewest cards, then the highest card, then from the Favor holder clockwise. */
  leader(): number {
    const n = this.players.length;
    let best = this.favor;
    for (let k = 1; k < n; k++) {
      const p = this.players[(this.favor + k) % n];
      const b = this.players[best];
      const d = this.strength(p) - this.strength(b) || b.row.length - p.row.length || top(p) - top(b);
      if (d > 0) best = p.seat;
    }
    return best;
  }

  /** Whether `p` may play `card` now. */
  playable(p: Player, card: Card): boolean {
    if (card.kind === "fury") return !p.row.some((c) => c.kind === "fury");
    if (card.kind === "winter") return !this.winter;
    if (card.kind === "bait") return p.row.some((c) => c.kind === "force");
    return true;
  }

  /** Starts a battle: the Favor holder picks its chip, unless Doves left one, and the player to their left goes first. */
  begin() {
    if (!this.color) this.color = this.policies[this.favor].color(this, this.players[this.favor]);
    this.battles++;
    this.fighting = true;
    this.ended = null;
    this.winter = false;
    for (const p of this.players) [p.row, p.passed] = [[], !p.hand.length];
    this.current = (this.favor + 1) % this.players.length;
    this.log?.(`battle ${this.battles} over ${this.color}, favor ${this.favor}`);
  }

  /** Whether the battle is over: everyone has passed, or Crows or Doves ended it. */
  over() {
    return this.ended !== null || this.players.every((p) => p.passed);
  }

  /** The current player makes `move`, or what their policy picks, and the turn moves on to the next player still in. */
  step(move: Move = this.policies[this.current].move(this, this.players[this.current])) {
    const p = this.players[this.current];
    if (!move) {
      p.passed = true;
      const dump = !p.hand.some((c) => c.kind === "force") && this.policies[p.seat].dump(this, p);
      this.log?.(`  ${p.seat} passes${dump ? `, discarding ${p.hand.map(name).join(" ")}` : ""}`);
      if (dump) this.pile.push(...p.hand.splice(0));
    } else {
      if (!this.playable(p, move.card)) throw new Error(`${p.seat} can't play ${name(move.card)}`);
      p.hand.splice(p.hand.indexOf(move.card), 1);
      if (move.card.kind === "bait") {
        const i = move.take ? p.row.indexOf(move.take) : -1;
        if (i < 0 || p.row[i].kind !== "force") throw new Error(`${p.seat} can't take back ${move.take && name(move.take)}`);
        p.hand.push(...p.row.splice(i, 1));
        this.pile.push(move.card);
      } else if (move.card.kind === "winter") {
        this.winter = true;
        this.pile.push(move.card);
      } else p.row.push(move.card);
      this.log?.(`  ${p.seat} plays ${name(move.card)}${move.take ? ` for ${name(move.take)}` : ""}: ${this.strength(p)}`);
      if (move.card.kind === "crows" || move.card.kind === "doves") this.ended = move.card.kind;
      if (!p.hand.length) p.passed = true;
    }
    this.next();
  }

  /** Moves the turn on to the next player still in, unless the battle is over. */
  next() {
    const n = this.players.length;
    if (!this.over()) do this.current = (this.current + 1) % n;
    while (this.players[this.current].passed);
  }

  /** Plays one battle. Returns false once the game is over. */
  battle(): boolean {
    if (!this.fighting) this.begin();
    while (!this.over()) this.step();
    return this.settle();
  }

  /** Ends the battle: the winner takes the chip and the Favor, and a round with one hand left in it ends. Returns false once the game is over. */
  settle(): boolean {
    this.fighting = false;
    for (const p of this.players) this.pile.push(...p.row);
    if (this.ended === "doves") {
      this.log?.(`  doves: no one wins the ${this.color} chip`);
      for (const p of this.players) p.row = [];
    } else {
      const w = this.leader();
      this.log?.(`  ${w} wins the ${this.color} chip with ${this.strength(this.players[w])}`);
      for (const p of this.players) p.row = [];
      const winner = this.players[w];
      winner.chips[COLORS.indexOf(this.color)]++;
      this.favor = w;
      this.color = null;
      if (won(winner.chips)) {
        this.winner = w;
        return false;
      }
    }
    const holding = this.players.filter((p) => p.hand.length);
    if (holding.length <= 1) {
      for (const p of holding) this.pile.push(...p.hand.splice(0));
      this.deal();
    }
    return true;
  }

  /** Makes `move` for the current player, if given, then plays to the end, or until `until` battles have been played. */
  run(move?: Move, until = MAX_BATTLES) {
    if (move !== undefined) this.step(move);
    while (this.winner === null && (this.fighting || this.battles < until) && this.battle());
    return { winner: this.winner, battles: this.battles, rounds: this.rounds, stalled: this.winner === null };
  }
}

const top = (p: Player) => Math.max(0, ...p.row.map((c) => c.value));

/** Every legal move for `p`: passing, each kind of card they can play, and Bait for each force card in their row. */
export function moves(game: Game, p: Player): Move[] {
  const out: Move[] = [null];
  const seen = new Set<Card>();
  for (const card of p.hand) {
    if (seen.has(card) || !game.playable(p, card)) continue;
    seen.add(card);
    if (card.kind !== "bait") out.push({ card });
    else for (const take of new Set(p.row.filter((c) => c.kind === "force"))) out.push({ card, take });
  }
  return out;
}

/** The other players, in turn order from `p`. */
export const others = (game: Game, p: Player) => game.players.map((_, i) => game.players[(p.seat + 1 + i) % game.players.length]).slice(0, -1);

/** Whether `p` would lead after playing `card`. */
export function leadsWith(game: Game, p: Player, card: Card): boolean {
  if (card.kind === "winter") {
    game.winter = true;
    const leads = game.leader() === p.seat;
    game.winter = false;
    return leads;
  }
  p.row.push(card);
  const leads = game.leader() === p.seat;
  p.row.pop();
  return leads;
}

/** Whether winning the battle's chip wins `p` the game. */
export const decisive = (game: Game, p: Player) => won(p.chips.map((c, i) => c + +(COLORS[i] === game.color)));

/** What a card costs to play, to pick the cheapest one that takes the lead. */
const COST: Record<Card["kind"], (c: Card) => number> = { force: (c) => c.value, legend: () => 10, fury: () => 3, winter: () => 3, crows: () => 0, doves: () => 99, bait: () => 99 };

/** A rule of the default player's: a move, `null` to pass, or `undefined` to leave it to the next rule. */
export type Step = (game: Game, p: Player) => Move | undefined;

export const STEPS = {
  /** Once everyone else has passed, Bait back the biggest force card that still leaves the lead: +2 to +4 points. */
  harvest(game, p) {
    const bait = p.hand.find((c) => c.kind === "bait");
    if (!bait || game.leader() !== p.seat || others(game, p).some((q) => !q.passed)) return undefined;
    for (const take of p.row.filter((c) => c.kind === "force").sort((a, b) => b.value - a.value)) {
      const i = p.row.indexOf(take);
      p.row.splice(i, 1);
      const leads = game.leader() === p.seat;
      p.row.splice(i, 0, take);
      if (leads) return { card: bait, take };
    }
    return undefined;
  },
  /** Pass while ahead once everyone else has passed: that ends the battle with a win. */
  stop(game, p) {
    return others(game, p).every((q) => q.passed) && game.leader() === p.seat ? null : undefined;
  },
  /**
   * Crows while ahead ends the battle with a win before anyone can answer. Only with a card of
   * our own played, not on the Favor's 1 strength alone: +2 to +5 points over Crows whenever
   * ahead, and never playing it is +1 to +3.
   */
  crows(game, p) {
    const c = p.hand.find((c) => c.kind === "crows");
    return c && p.row.length && game.leader() === p.seat ? { card: c } : undefined;
  },
  /** Doves when someone else leads with the chip that wins them the game. */
  doves(game, p) {
    const c = p.hand.find((c) => c.kind === "doves");
    const leader = game.players[game.leader()];
    return c && leader !== p && decisive(game, leader) ? { card: c } : undefined;
  },
  /**
   * Ahead with nothing played yet, as the Favor holder is, and others still in: the strongest
   * card rather than a pass, which would leave the battle to them: +11 to +14 points. A Fury
   * first, which stays in for nothing yet doubles what comes after: +4 to +5 more.
   */
  press(game, p) {
    if (p.row.length || game.leader() !== p.seat || others(game, p).every((q) => q.passed)) return undefined;
    const card = p.hand.find((c) => c.kind === "fury") ?? p.hand.filter((c) => c.kind === "force" || c.kind === "legend").sort((a, b) => b.value - a.value)[0];
    return card ? { card } : undefined;
  },
  /**
   * Don't open a battle while 2 or more others are still in: let them spend their cards. Against
   * the first default, which chased, this won 58.8% at 3 players and 70–72% at 4–6 (40,000
   * games). Not when the chip would win `p` the game, nor anyone else with fewer than 3 others
   * in. Leaving the denial to the rest when 3 or more are in gains 6 to 16 points at 4–6
   * players; never denying lost 10 at 3. Against every default so far (`variants.ts --league`),
   * waiting before `open` wins 46.7%, 41.4%, 37.6% and 34.5% at 3–6 players, and opening first
   * 44.8%, 30.1%, 21.1% and 16.4%.
   */
  wait(game, p) {
    if (p.row.length || game.leader() === p.seat || decisive(game, p)) return undefined;
    const alive = others(game, p).filter((q) => !q.passed).length;
    if (alive < 3 && others(game, p).some((q) => decisive(game, q))) return undefined;
    return alive >= 2 ? null : undefined;
  },
  /**
   * Behind with nothing played and someone else still in, a 1 or a Fury, which cost the least:
   * +9 to +15 points over chasing with the cheapest card that takes the lead. With nobody else
   * in, `chase` wins the battle outright.
   */
  open(game, p) {
    if (p.row.length || game.leader() === p.seat || others(game, p).every((q) => q.passed)) return undefined;
    const card = p.hand.find((c) => c.kind === "force" && c.value === 1) ?? p.hand.find((c) => c.kind === "fury" && game.playable(p, c));
    return card ? { card } : undefined;
  },
  /**
   * Behind with nobody else in, nobody can answer: play the strongest card if the strongest 4 in
   * hand would overtake, and `harvest` takes back what isn't needed. +1.4 to +6 points over
   * only taking the lead with a single card.
   */
  finish(game, p) {
    if (game.leader() === p.seat || others(game, p).some((q) => !q.passed)) return undefined;
    const strong = p.hand.filter((c) => (c.kind === "force" || c.kind === "legend" || c.kind === "fury") && game.playable(p, c)).sort((a, b) => b.value - a.value || +(a.kind === "fury") - +(b.kind === "fury"));
    const row = p.row;
    p.row = [...row, ...strong.slice(0, 4)];
    const reaches = game.leader() === p.seat;
    p.row = row;
    return reaches ? { card: strong[0] } : undefined;
  },
  /**
   * Behind with others still in, Bait back a 1: it stays in the battle without spending
   * anything. +4.5 to +7 points against the default, +3.5 to +6 against every default so far.
   */
  stall(game, p) {
    const bait = p.hand.find((c) => c.kind === "bait");
    const take = p.row.find((c) => c.kind === "force" && c.value === 1);
    return bait && take && game.leader() !== p.seat && others(game, p).some((q) => !q.passed) ? { card: bait, take } : undefined;
  },
  /** Behind, a 1 before anything that would take the lead: +3.5 to +7.5 points against the default, +2.5 to +5.5 against every default so far. */
  one(game, p) {
    const card = p.hand.find((c) => c.kind === "force" && c.value === 1);
    return card && game.leader() !== p.seat ? { card } : undefined;
  },
  /**
   * Behind, take the lead with the cheapest card that does it, if this battle has cost at most 3
   * cards so far, or without limit when the chip wins or loses the game.
   */
  chase(game, p) {
    if (game.leader() === p.seat) return undefined;
    const stakes = decisive(game, p) || others(game, p).some((q) => decisive(game, q));
    if (!stakes && p.row.length >= 3) return undefined;
    const best = p.hand.filter((c) => c.kind !== "bait" && c.kind !== "doves" && game.playable(p, c) && leadsWith(game, p, c)).sort((a, b) => COST[a.kind](a) - COST[b.kind](b))[0];
    return best ? { card: best } : undefined;
  },
  /** Behind with the chip that wins the game and no one card to take the lead, play the strongest anyway: +1 to +2 points. */
  allIn(game, p) {
    if (game.leader() === p.seat || !decisive(game, p)) return undefined;
    const card = p.hand.filter((c) => (c.kind === "force" || c.kind === "legend" || c.kind === "fury") && game.playable(p, c)).sort((a, b) => b.value - a.value)[0];
    return card ? { card } : undefined;
  },
  /** Before giving up a battle, take back the biggest force card with Bait. */
  bait(game, p) {
    const c = p.hand.find((c) => c.kind === "bait");
    const take = p.row.filter((c) => c.kind === "force").sort((a, b) => b.value - a.value)[0];
    return c && take && game.leader() !== p.seat ? { card: c, take } : undefined;
  },
} satisfies Record<string, Step>;

export function heuristic(...steps: (keyof typeof STEPS | Step)[]): Policy {
  return { ...defaultPolicy, move: first(steps.map((s) => (typeof s === "string" ? STEPS[s] : s))) };
}

function first(steps: Step[]): Policy["move"] {
  return (game, p) => {
    for (const step of steps) {
      const move = step(game, p);
      if (move !== undefined) return move;
    }
    return null;
  };
}

/** The chip that leaves `p` fewest chips from winning, then the one that helps the closest opponent least. */
export function pickColor(game: Game, p: Player): Color {
  const score = (i: number) => {
    const mine = needed(p.chips.map((c, j) => c + +(i === j)));
    const theirs = Math.min(...others(game, p).map((q) => needed(q.chips.map((c, j) => c + +(i === j)))));
    return mine * 10 - theirs;
  };
  return COLORS[[0, 1, 2].reduce((a, b) => (score(b) < score(a) ? b : a))];
}

export const defaultPolicy: Policy = {
  color: pickColor,
  move: first(Object.values(STEPS)),
  dump: () => true,
};
