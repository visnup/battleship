import { name } from "./cards.ts";
import { defaultPolicy, Game, mulberry32, type Play, type Player, type Policy, type Trick } from "./game.ts";

// A game played by people is its seed and every decision made in it. The state is the game
// replayed from the seed through those decisions, stopped at the next one nobody has made.

/** A decision: a card to play, by its place in hand, face up or down. */
export type Choice = { kind: "play"; seat: number; card: number; down: boolean };

export type Prompt = { kind: Choice["kind"]; seat: number };

/** A game to replay, with each seat's kind of bot, or false for a person. */
export type Setup = { players: number; seed: number; bots: (string | false)[] };

/** A saved game's setup, from its seats: a player's or a bot's. */
export const setup = ({ seats, seed }: { seats: ({ bot: string } | object)[]; seed: number }): Setup => ({
  players: seats.length,
  seed,
  bots: seats.map((s) => ("bot" in s ? s.bot : false)),
});

class Waiting {
  prompt: Prompt;
  constructor(prompt: Prompt) {
    this.prompt = prompt;
  }
}

/** `play` as a place in `p`'s hand. */
export const choose = (p: Player, play: Play) => ({ card: p.hand.indexOf(play.card), down: play.down });

/** `c` as a play in `game`, if `p` can make it. */
export function resolve(game: Game, p: Player, c: { card: number; down: boolean }): Play {
  const card = p.hand[c.card];
  if (!card) throw new Error("no such card");
  const play = { card, down: !!c.down };
  if (!game.legal(p).some((l) => l.card === card && l.down === play.down)) throw new Error(`can't play ${name(card)}${play.down ? " face down" : ""} now`);
  return play;
}

/**
 * Plays `setup` through `log`, with bots deciding for their seats as the player of their kind in
 * `bots`, or the default player. Returns the game, the decision it's waiting on, the bots'
 * decisions made past `log`, the game's log lines, and every trick played.
 */
export function replay(setup: Setup, log: Choice[], bots: Record<string, Policy> = {}) {
  const decisions: Choice[] = [];
  const lines: string[] = [];
  const bot = (p: Player) => bots[setup.bots[p.seat] || ""] ?? defaultPolicy;
  let next = 0;
  const policy: Policy = {
    play(game, p) {
      let choice = log[next];
      if (choice) {
        if (choice.seat !== p.seat) throw new Error(`decision ${next} is by ${choice.seat}, but the game wants ${p.seat}`);
      } else if (setup.bots[p.seat]) {
        choice = { kind: "play", seat: p.seat, ...choose(p, bot(p).play(game, p)) };
        decisions.push(choice);
      } else throw new Waiting({ kind: "play", seat: p.seat });
      next++;
      return resolve(game, p, choice);
    },
  };
  const game = new Game({ players: setup.players, rng: mulberry32(setup.seed), policies: policy, log: (line) => lines.push(line) });
  const tricks: Trick[] = [];
  let prompt: Prompt | undefined;
  let result: { winners: number[]; chips: number[] } | undefined;
  try {
    while (!game.winners) {
      game.step();
      if (game.last && game.last !== tricks.at(-1)) tricks.push(game.last);
    }
    result = { winners: game.winners!, chips: game.players.map((p) => p.chips) };
  } catch (e) {
    if (!(e instanceof Waiting)) throw e;
    prompt = e.prompt;
  }
  if (next < log.length) throw new Error(`${log.length - next} decisions past the end of the game`);
  return { game, prompt, result, decisions, lines, tricks };
}
