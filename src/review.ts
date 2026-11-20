import { name } from "./cards.ts";
import { defaultPolicy, mulberry32, type Play, type Policy, share } from "./game.ts";
import { type Choice, replay, resolve, type Setup } from "./replay.ts";
import { sample } from "./strategies.ts";

/** A decision a player made, with each option's chance of winning when played out. */
export type Reviewed = { n: number; hand: number; trick: number; chose: string; hint: string; options: { label: string; win: number }[] };

/** The deals each option is played out on in a game's review: fewer with Hard bots, which cost more a game. */
export const deals = (setup: Setup) => (setup.bots.includes("learned") ? 100 : 200);

export const label = (play: Play) => `${name(play.card)}${play.down ? " face down" : ""}`;

/**
 * Every decision `seat` made in `log` with a choice, each option played out to the end on `deals`
 * deals of the cards they couldn't see, the same deals for every option. Each bot plays as its
 * kind in `bots`, or the default player, and everyone else as the default. With `part: [i, k]`,
 * only every `k`th decision from the `i`th, so `k` workers can share the review.
 */
export function* review(setup: Setup, log: Choice[], seat: number, { deals = 200, bots = {}, part = [0, 1] }: { deals?: number; bots?: Record<string, Policy>; part?: [number, number] } = {}): Generator<Reviewed> {
  const people = { ...setup, bots: setup.bots.map(() => false as const) };
  const policies = setup.bots.map((b, i) => (i !== seat && b && bots[b]) || defaultPolicy);
  let mine = 0;
  for (const [n, choice] of log.entries()) {
    if (choice.seat !== seat) continue;
    const { game } = replay(people, log.slice(0, n));
    const p = game.players[seat];
    const options = game.legal(p);
    if (options.length < 2 || mine++ % part[1] !== part[0]) continue;
    const rng = mulberry32(n + 1);
    const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
    const odds = (play: Play) => seeds.reduce((w, s) => w + share(sample(game, p, mulberry32(s), policies).run(play).winners, seat), 0) / deals;
    yield {
      n,
      hand: game.hand,
      trick: game.players.reduce((s, q) => s + q.won.length, 0) + 1,
      chose: label(resolve(game, p, choice)),
      hint: label(defaultPolicy.play(game, p)),
      options: options.map((o) => ({ label: label(o), win: odds(o) })),
    };
  }
}
