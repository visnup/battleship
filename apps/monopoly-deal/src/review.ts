import { discards } from "./discarding.ts";
import { defaultPolicy, type Game, type Move, moves, mulberry32, name, payable, type Player, type Policy, shuffle } from "./game.ts";
import { label, payments } from "./paying.ts";
import { type Choice, encode, key, type Prompt, type Ref, ref, replay, resolve, type Setup } from "./replay.ts";
import { chance, playout } from "./strategies.ts";

/**
 * A decision a player made: the options played out, each with its chance of winning, and which
 * of them they chose and the Hint (the default player) would. A move is named by
 * `key(encode())`, a payment by where its cards are (`bank0,props2`), a discard by its cards'
 * places in the hand (`1,4`), and a Just Say No by `true` or `false`.
 */
export type Reviewed = { n: number; kind: Choice["kind"]; turn: number; chose: string; hint: string; hard?: string; options: { key: string; win: number }[] };

/** Every legal move and ending the turn, best first, as `ranked()` in `learned.ts` gives them: its first is a play's `hard`. */
export type Rank = (game: Game, p: Player, left: number) => (Move | null)[];

/** The deals each move is played out on in a game's review, and a quarter as many for the rest: fewer with Hard bots, which cost many times as much a game. */
export const deals = (setup: Setup) => (setup.bots.includes("learned") ? HARD_DEALS : 400);
const HARD_DEALS = 100;

const where = (rs: Ref[]) =>
  rs
    .map((r) => `${r.pile}${r.i}`)
    .sort()
    .join();
const sorted = (xs: (string | number)[]) => [...xs].sort().join();

/**
 * The ways to answer `prompt`, at most `cap` and the one in `choice` among them, with the
 * Hint's: every way worth paying or discarding (`payments`, `discards`), or both answers to an
 * action. A way that differs from the player's only in which of two like cards it uses is theirs.
 */
function answers(game: Game, p: Player, prompt: Prompt, choice: Choice, cap: number): { chose: string; hint: string; options: { key: string; choice: Choice }[] } {
  const seat = p.seat;
  if (prompt.kind === "sayNo" && choice.kind === "sayNo")
    return {
      chose: String(choice.no),
      hint: String(defaultPolicy.sayNo(game, p, prompt.move, game.players[prompt.from])),
      options: [true, false].map((no) => ({ key: String(no), choice: { kind: "sayNo", seat, no } })),
    };
  /** The options as `[what tells them apart, key, choice]`, the Hint's first. */
  let listed: [string, string, Choice][] = [];
  let mine: [string, string, Choice] | undefined;
  if (prompt.kind === "pay" && choice.kind === "pay") {
    const all = payable(p);
    const like = (rs: Ref[]) => sorted(rs.map((r) => label(game, p, p[r.pile][r.i])));
    const option = (paid: Ref[]): [string, string, Choice] => [like(paid), where(paid), { kind: "pay", seat, paid }];
    listed = payments(game, p, prompt.amount, cap).map((js) => option(js.map((j) => ref(p, all[j]))));
    mine = option(choice.paid);
  } else if (prompt.kind === "discard" && choice.kind === "discard") {
    const option = (cards: number[]): [string, string, Choice] => [sorted(cards.map((i) => name(p.hand[i]))), sorted(cards), { kind: "discard", seat, cards }];
    listed = discards(game, p, prompt.n, cap).map(option);
    mine = option(choice.cards);
  }
  if (!mine) return { chose: "", hint: "", options: [] };
  const at = listed.findIndex(([like]) => like === mine[0]);
  if (at >= 0) listed[at] = mine;
  else listed.push(mine);
  return { chose: mine[1], hint: listed[0][1], options: listed.map(([, key, choice]) => ({ key, choice })) };
}

class Stop {}

/**
 * `seat`'s chance `turns` turns after answering the decision `log` stops at with `answer`. It
 * may come mid-turn, where a copy of the game can't play on, so the game is replayed through
 * `log`; there the cards `seat` can't see are dealt again by `seed`, the answer is given, and
 * everyone plays by `field`, the board scored by `chance` when the turns are up.
 * The cards are dealt again inside `seat`'s own decision, as `scripts/midturn.ts` does: at the
 * next one, another player's card may be half played.
 */
function later(setup: Setup, log: Choice[], seat: number, answer: Choice, seed: number, turns: number, field: Policy) {
  let game: Game | undefined;
  let limit = Infinity;
  /** Whether this is the decision the log stops at, having dealt the hidden cards again if so. */
  const first = (g: Game) => {
    if (game) return false;
    game = g;
    const rng = mulberry32(seed);
    g.rng = rng;
    const hidden = g.players.filter((q) => q.seat !== seat);
    const cards = shuffle([...hidden.flatMap((q) => q.hand), ...g.draw], rng);
    for (const q of hidden) q.hand = cards.splice(0, q.hand.length);
    g.draw = cards;
    limit = g.turns + turns;
    return true;
  };
  const rollout: Policy = {
    move(g, p, left) {
      if (g.turns > limit) throw new Stop();
      return field.move(g, p, left);
    },
    pay: (g, p, amount) => (first(g) && answer.kind === "pay" ? answer.paid.map((r) => p[r.pile][r.i]) : field.pay(g, p, amount)),
    sayNo: (g, p, move, from) => (first(g) && answer.kind === "sayNo" ? answer.no : field.sayNo(g, p, move, from)),
    discard: (g, p, n) => (first(g) && answer.kind === "discard" ? answer.cards.map((i) => p.hand[i]) : field.discard(g, p, n)),
  };
  try {
    return +(replay({ ...setup, bots: setup.bots.map(() => "rollout") }, log, { rollout }).result?.winner === seat);
  } catch (e) {
    if (!(e instanceof Stop) || !game) throw e;
    return chance(game, seat);
  }
}

/**
 * Every decision `seat` made in `log` where there was a choice. A play: every legal move and
 * ending the turn, each played out on `deals` deals of the cards they couldn't see, the same
 * deals for every option, for two rounds, the board then scored by `chance`, as the `playouts`
 * strategy does. Each bot plays as its kind in `bots`, or the default player, and `seat` and any
 * other people as the default. A payment, Just Say No or discard: up to `cap` ways, the same way
 * on a quarter of the deals, each a replay of the game (`later`). With `part: [i, k]`, only
 * every `k`th decision from the `i`th, so `k` workers can share the review.
 */
export function* review(
  setup: Setup,
  log: Choice[],
  seat: number,
  { deals = 200, cap = 8, bots = {}, rank, part = [0, 1] }: { deals?: number; cap?: number; bots?: Record<string, Policy>; rank?: Rank; part?: [number, number] } = {},
): Generator<Reviewed> {
  const people = { ...setup, bots: setup.bots.map(() => false as const) };
  const seats = setup.bots.map((b, i) => (i !== seat && b && bots[b]) || defaultPolicy);
  const field: Policy = {
    move: (g, p, left) => seats[p.seat].move(g, p, left),
    pay: (g, p, amount) => seats[p.seat].pay(g, p, amount),
    sayNo: (g, p, move, from) => seats[p.seat].sayNo(g, p, move, from),
    discard: (g, p, n) => seats[p.seat].discard(g, p, n),
  };
  let mine = 0;
  for (const [n, choice] of log.entries()) {
    if (choice.seat !== seat || mine++ % part[1] !== part[0]) continue;
    const { game, prompt } = replay(people, log.slice(0, n));
    if (prompt?.kind !== choice.kind) continue;
    const p = game.players[seat];
    const turns = 2 * game.players.length;
    const rng = mulberry32(n + 1);
    const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
    if (prompt.kind === "move" && choice.kind === "move") {
      const all = [null, ...moves(game, p, prompt.left)];
      if (all.length === 1) continue;
      const k = (m: Move | null) => key(encode(game, p, m));
      const chose = k(resolve(game, p, prompt.left, choice.move));
      const hint = k(defaultPolicy.move(game, p, prompt.left));
      yield {
        n,
        kind: "move",
        turn: game.turns,
        chose,
        hint,
        hard: rank && k(rank(game, p, prompt.left)[0]),
        options: all.map((m) => ({ key: k(m), win: playout(game, p, m, seeds, defaultPolicy, turns, field) / deals })),
      };
    } else {
      const { chose, hint, options } = answers(game, p, prompt, choice, cap);
      if (options.length < 2) continue;
      const few = seeds.slice(0, Math.ceil(deals / 4));
      yield {
        n,
        kind: choice.kind,
        turn: game.turns,
        chose,
        hint,
        options: options.map((o) => ({ key: o.key, win: few.reduce((s, seed) => s + later(setup, log.slice(0, n), seat, o.choice, seed, turns, field), 0) / few.length })),
      };
    }
  }
}
