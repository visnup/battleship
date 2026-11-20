import { defaultPolicy, type Game, type Move, mulberry32, type Player } from "./game.ts";
import { type Choice, encode, key, replay, resolve, type Setup } from "./replay.ts";
import { playout } from "./strategies.ts";

/**
 * A play a player made: the options played out, each with its chance of winning, and which of
 * them they chose, the Hint (the default player) would, and the Hard bot's model would. Moves
 * are named by `key(encode())`.
 */
export type Reviewed = { n: number; turn: number; chose: string; hint: string; hard: string; options: { key: string; win: number }[] };

/** The deals each option is played out on in a game's review: a whole game takes a few seconds a core. */
export const DEALS = 400;

/** Every legal move and ending the turn, best first, as `ranked()` in `learned.ts` gives them. */
export type Rank = (game: Game, p: Player, left: number) => (Move | null)[];

/**
 * Every play `seat` made in `log` where there was a choice: `rank`'s `top` moves, theirs and the
 * Hint's, each played out on `deals` deals of the cards they couldn't see, the same deals for
 * every option, everyone playing like the default player for two rounds and the board then
 * scored by `chance`, as the `playouts` strategy does. With `part: [i, k]`, only every `k`th play
 * from the `i`th, so `k` workers can share the review.
 */
export function* review(setup: Setup, log: Choice[], seat: number, rank: Rank, { deals = 200, top = 5, part = [0, 1] }: { deals?: number; top?: number; part?: [number, number] } = {}): Generator<Reviewed> {
  const people = { ...setup, bots: setup.bots.map(() => false as const) };
  let mine = 0;
  for (const [n, choice] of log.entries()) {
    if (choice.kind !== "move" || choice.seat !== seat || mine++ % part[1] !== part[0]) continue;
    const { game, prompt } = replay(people, log.slice(0, n));
    if (prompt?.kind !== "move") continue;
    const p = game.players[seat];
    const ranked = rank(game, p, prompt.left);
    if (ranked.length === 1) continue;
    const k = (m: Move | null) => key(encode(game, p, m));
    const chose = k(resolve(game, p, prompt.left, choice.move));
    const hint = k(defaultPolicy.move(game, p, prompt.left));
    const rng = mulberry32(n + 1);
    const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
    yield {
      n,
      turn: game.turns,
      chose,
      hint,
      hard: k(ranked[0]),
      options: ranked.filter((m, i) => i < top || k(m) === chose || k(m) === hint).map((m) => ({ key: k(m), win: playout(game, p, m, seeds, defaultPolicy, 2 * game.players.length) / deals })),
    };
  }
}
