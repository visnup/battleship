import { type Card, DECK } from "./cards.ts";
import { defaultPolicy, Game, type GameResult, moves, mulberry32, name, type Move, type Placed, type Player, type Policy, shuffle } from "./game.ts";

// A game played by people is its seed and every decision made in it. The state is the game
// replayed from the seed through those decisions, stopped at the next one nobody has made.

/** A card by where it is: `i` into one of a player's piles. */
export type Ref = { pile: "bank" | "props" | "built"; i: number };

/** A move by position: `card` and `doubles` index the hand, `take` the target's props, `give` the mover's. */
export type MoveChoice = { type: Move["type"]; card: number; color?: string; target?: number; doubles?: number[]; take?: number; give?: number };

export type Choice =
  { kind: "move"; seat: number; move: MoveChoice | null } | { kind: "pay"; seat: number; paid: Ref[] } | { kind: "sayNo"; seat: number; no: boolean } | { kind: "discard"; seat: number; cards: number[] };

export type Prompt =
  { kind: "move"; seat: number; left: number } | { kind: "pay"; seat: number; amount: number; to: number } | { kind: "sayNo"; seat: number; move: Move; from: number } | { kind: "discard"; seat: number; n: number };

/** A decision as saved: the choice, whether a bot made it, and every hand when it was made. */
export type Decision = { choice: Choice; bot: boolean; hands: string[][] };

export type Setup = { players: number; seed: number; first: number; bots: boolean[] };

/** The deck as dealt from, top first. */
export const deal = (seed: number) =>
  shuffle(
    DECK.map((c) => ({ ...c })),
    mulberry32(seed),
  ).map(name);

class Waiting {
  prompt: Prompt;
  constructor(prompt: Prompt) {
    this.prompt = prompt;
  }
}

const canon = (m: Move) =>
  JSON.stringify([
    m.type,
    name(m.card),
    m.type === "place" && m.card.kind !== "action" ? null : "color" in m ? (m.color ?? null) : null,
    "target" in m ? (m.target ?? null) : null,
    m.type === "rent" ? m.doubles.length : 0,
    m.type === "action" && m.take ? [name(m.take.card), m.take.color] : null,
    m.type === "action" && m.give ? [name(m.give.card), m.give.color] : null,
  ]);

/** `m` as positions in `game`, for `p` to make. */
export function choose(game: Game, p: Player, m: Move | null): MoveChoice | null {
  if (!m) return null;
  const c: MoveChoice = { type: m.type, card: p.hand.indexOf(m.card) };
  if ("color" in m && m.color) c.color = m.color;
  if ("target" in m && m.target !== undefined) c.target = m.target;
  if (m.type === "rent" && m.doubles.length) c.doubles = m.doubles.map((d) => p.hand.indexOf(d));
  if (m.type === "action" && m.take) c.take = game.players[m.target!].props.indexOf(m.take);
  if (m.type === "action" && m.give) c.give = p.props.indexOf(m.give);
  return c;
}

/** `c` as a move in `game`, if it's one `p` can make with `left` plays. */
export function resolve(game: Game, p: Player, left: number, c: MoveChoice | null): Move | null {
  if (!c) return null;
  const card = p.hand[c.card];
  if (!card) throw new Error("no such card");
  const target = c.target === undefined ? undefined : game.players[c.target];
  const take = c.take === undefined ? undefined : target?.props[c.take];
  const give = c.give === undefined ? undefined : p.props[c.give];
  const doubles = (c.doubles ?? []).map((i) => p.hand[i]);
  if (new Set([c.card, ...(c.doubles ?? [])]).size !== 1 + doubles.length || doubles.some((d) => d?.kind !== "action" || d.action !== "doubleRent")) throw new Error("bad Double the Rent");
  const move = { ...c, card, target: c.target, doubles, take, give } as Move;
  if (move.type !== "rent") delete (move as { doubles?: unknown }).doubles;
  if (!moves(game, p, left).some((m) => canon(m) === canon(move))) throw new Error(`can't ${c.type} ${name(card)}`);
  return move;
}

function paying(p: Player, amount: number, paid: Ref[]): (Card | Placed)[] {
  if (new Set(paid.map((r) => `${r.pile}${r.i}`)).size !== paid.length) throw new Error("paid twice");
  const cards = paid.map((r) => p[r.pile][r.i]);
  if (cards.some((x) => !x)) throw new Error("no such card");
  const value = (x: Card | Placed) => ("kind" in x ? x : x.card).value;
  if (paid.some((r, i) => r.pile === "props" && value(cards[i]) === 0)) throw new Error("a multicolored wild can't pay");
  const payable = [...p.bank, ...p.built, ...p.props.filter((x) => x.card.value > 0)];
  const total = cards.reduce((s, x) => s + value(x), 0);
  if (total < amount && cards.length < payable.length) throw new Error(`$${total}M is short of $${amount}M`);
  return cards;
}

/**
 * Plays `setup` through `log`, with bots deciding for their seats as the default player. Returns
 * the game, the decision it's waiting on, and the bots' decisions made past `log`.
 */
export function replay(setup: Setup, log: Choice[]) {
  const decisions: Decision[] = [];
  let next = 0;
  const decide = <C extends Choice>(game: Game, prompt: Prompt, bot: () => C): C => {
    const hands = game.players.map((p) => p.hand.map(name));
    let choice = log[next] as C | undefined;
    if (choice) {
      if (choice.kind !== prompt.kind || choice.seat !== prompt.seat) throw new Error(`decision ${next} is ${choice.kind} by ${choice.seat}, but the game wants ${prompt.kind} by ${prompt.seat}`);
    } else if (setup.bots[prompt.seat]) {
      choice = bot();
      decisions.push({ choice, bot: true, hands });
    } else {
      throw new Waiting(prompt);
    }
    if (next === log.length - 1 && !setup.bots[prompt.seat]) decisions.push({ choice, bot: false, hands });
    next++;
    return choice;
  };
  const policy: Policy = {
    move(game, p, left) {
      const c = decide(game, { kind: "move", seat: p.seat, left }, () => ({ kind: "move", seat: p.seat, move: choose(game, p, defaultPolicy.move(game, p, left)) }));
      return resolve(game, p, left, c.move);
    },
    pay(game, p, amount) {
      const c = decide(game, { kind: "pay", seat: p.seat, amount, to: game.current }, () => ({
        kind: "pay",
        seat: p.seat,
        paid: defaultPolicy
          .pay(game, p, amount)
          .map((x): Ref => ("kind" in x ? { pile: "bank", i: p.bank.indexOf(x) } : p.built.includes(x) ? { pile: "built", i: p.built.indexOf(x) } : { pile: "props", i: p.props.indexOf(x) })),
      }));
      return paying(p, amount, c.paid);
    },
    sayNo(game, p, move, from) {
      return decide(game, { kind: "sayNo", seat: p.seat, move, from: from.seat }, () => ({ kind: "sayNo", seat: p.seat, no: defaultPolicy.sayNo(game, p, move, from) })).no;
    },
    discard(game, p, n) {
      const c = decide(game, { kind: "discard", seat: p.seat, n }, () => ({ kind: "discard", seat: p.seat, cards: defaultPolicy.discard(game, p, n).map((x) => p.hand.indexOf(x)) }));
      if (new Set(c.cards).size !== n || c.cards.some((i) => !p.hand[i])) throw new Error(`discard ${n} cards`);
      return c.cards.map((i) => p.hand[i]);
    },
  };
  const game = new Game({ players: setup.players, rng: mulberry32(setup.seed), first: setup.first, policies: policy, log: true });
  let prompt: Prompt | undefined;
  let result: GameResult | undefined;
  try {
    result = game.run();
  } catch (e) {
    if (!(e instanceof Waiting)) throw e;
    prompt = e.prompt;
  }
  if (next < log.length) throw new Error(`${log.length - next} decisions past the end of the game`);
  return { game, prompt, result, decisions };
}
