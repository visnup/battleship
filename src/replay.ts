import { type Card, type Color, COLORS, name } from "./cards.ts";
import { defaultPolicy, Game, mulberry32, type Move, type Player, type Policy } from "./game.ts";

// A game played by people is its seed and every decision made in it. The state is the game
// replayed from the seed through those decisions, stopped at the next one nobody has made.

/** A decision: the Favor holder's chip, a card to play (by its place in hand, and for Bait the force card in the row it takes back) or `null` to pass, or whether to discard a hand of no force cards. */
export type Choice = { kind: "color"; seat: number; color: Color } | { kind: "move"; seat: number; card: number | null; take?: number } | { kind: "dump"; seat: number; dump: boolean };

export type Prompt = { kind: Choice["kind"]; seat: number };

/** A game to replay, with each seat's kind of bot, or false for a person. */
export type Setup = { players: number; seed: number; first: number; bots: (string | false)[] };

/** A saved game's setup, from its seats: a player's or a bot's. */
export const setup = ({ seats, seed, first }: { seats: ({ bot: string } | object)[]; seed: number; first: number }): Setup => ({
  players: seats.length,
  seed,
  first,
  bots: seats.map((s) => ("bot" in s ? s.bot : false)),
});

/** A battle as it ended, before its cards were discarded: its chip, every row and strength, and who won it, or null for Doves. */
export type Battle = { color: Color; rows: Card[][]; strengths: number[]; winner: number | null };

class Waiting {
  prompt: Prompt;
  constructor(prompt: Prompt) {
    this.prompt = prompt;
  }
}

/** `m` as places in `p`'s hand and row. */
export function choose(p: Player, m: Move): { card: number | null; take?: number } {
  if (!m) return { card: null };
  return { card: p.hand.indexOf(m.card), ...(m.take && { take: p.row.indexOf(m.take) }) };
}

/** `c` as a move in `game`, if `p` can make it. */
export function resolve(game: Game, p: Player, c: { card: number | null; take?: number }): Move {
  if (c.card === null) return null;
  const card = p.hand[c.card];
  if (!card) throw new Error("no such card");
  if (!game.playable(p, card)) throw new Error(`can't play ${name(card)} now`);
  if (card.kind !== "bait") return { card };
  const take = c.take === undefined ? undefined : p.row[c.take];
  if (take?.kind !== "force") throw new Error("Bait takes back a force card from your row");
  return { card, take };
}

/**
 * Plays `setup` through `log`, with bots deciding for their seats as the player of their kind in
 * `bots`, or the default player. Returns the game, the decision it's waiting on, the bots'
 * decisions made past `log`, the game's log lines, and the last battle to end.
 */
export function replay(setup: Setup, log: Choice[], bots: Record<string, Policy> = {}) {
  const decisions: Choice[] = [];
  const lines: string[] = [];
  const bot = (p: Player) => bots[setup.bots[p.seat] || ""] ?? defaultPolicy;
  let next = 0;
  const decide = <C extends Choice>(prompt: Prompt, made: () => C): C => {
    let choice = log[next] as C | undefined;
    if (choice) {
      if (choice.kind !== prompt.kind || choice.seat !== prompt.seat) throw new Error(`decision ${next} is ${choice.kind} by ${choice.seat}, but the game wants ${prompt.kind} by ${prompt.seat}`);
    } else if (setup.bots[prompt.seat]) {
      choice = made();
      decisions.push(choice);
    } else throw new Waiting(prompt);
    next++;
    return choice;
  };
  const policy: Policy = {
    color(game, p) {
      const { color } = decide({ kind: "color", seat: p.seat }, () => ({ kind: "color", seat: p.seat, color: bot(p).color(game, p) }));
      if (!COLORS.includes(color)) throw new Error(`no ${color} chip`);
      return color;
    },
    move(game, p) {
      return resolve(
        game,
        p,
        decide({ kind: "move", seat: p.seat }, () => ({ kind: "move", seat: p.seat, ...choose(p, bot(p).move(game, p)) })),
      );
    },
    dump(game, p) {
      return decide({ kind: "dump", seat: p.seat }, () => ({ kind: "dump", seat: p.seat, dump: bot(p).dump(game, p) })).dump;
    },
  };
  const game = new Game({ players: setup.players, rng: mulberry32(setup.seed), first: setup.first, policies: policy, log: (line) => lines.push(line) });
  let last: Battle | undefined;
  const settle = game.settle.bind(game);
  game.settle = () => {
    last = { color: game.color!, rows: game.players.map((p) => [...p.row]), strengths: game.players.map((p) => game.strength(p)), winner: game.ended === "doves" ? null : game.leader() };
    return settle();
  };
  let prompt: Prompt | undefined;
  let result: ReturnType<Game["run"]> | undefined;
  try {
    result = game.run();
  } catch (e) {
    if (!(e instanceof Waiting)) throw e;
    prompt = e.prompt;
  }
  if (next < log.length) throw new Error(`${log.length - next} decisions past the end of the game`);
  return { game, prompt, result, decisions, lines, last };
}
