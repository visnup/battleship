import { COLORS, name } from "./cards.ts";
import { defaultPolicy, type Game, type Move, moves, mulberry32, type Policy } from "./game.ts";
import { type Choice, replay, resolve, type Setup } from "./replay.ts";
import { sample } from "./strategies.ts";

/** A decision a player made, with each option's chance of winning when played out. */
export type Reviewed = { n: number; battle: number; kind: Choice["kind"]; chose: string; hint: string; options: { label: string; win: number }[] };

/** The deals each option is played out on in a game's review: fewer with Hard bots, which cost 20 times as much a game. */
export const deals = (setup: Setup) => (setup.bots.includes("learned") ? 200 : 400);

const label = (m: Move) => (m ? (m.take ? `Bait for the ${name(m.take)}` : name(m.card)) : "pass");

/**
 * Every decision `seat` made in `log`, each option played out to the end on `deals` deals of the
 * cards they couldn't see, the same deals for every option. Each bot plays as its kind in `bots`,
 * or the default player, and everyone else as the default. With `part: [i, k]`, only every `k`th
 * decision from the `i`th, so `k` workers can share the review.
 */
export function* review(setup: Setup, log: Choice[], seat: number, { deals = 400, bots = {}, part = [0, 1] }: { deals?: number; bots?: Record<string, Policy>; part?: [number, number] } = {}): Generator<Reviewed> {
  const people = { ...setup, bots: setup.bots.map(() => false as const) };
  const policies = setup.bots.map((b, i) => (i !== seat && b && bots[b]) || defaultPolicy);
  let mine = 0;
  for (const [n, choice] of log.entries()) {
    if (choice.seat !== seat || mine++ % part[1] !== part[0]) continue;
    const { game } = replay(people, log.slice(0, n));
    const p = game.players[seat];
    // an old game's pass with no cards, which replay() skips
    if (choice.kind !== "color" && !p.hand.length) continue;
    const rng = mulberry32(n + 1);
    const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
    const odds = (before: (g: Game) => void, move?: Move) =>
      seeds.reduce((w, s) => {
        const g = sample(game, p, mulberry32(s), policies);
        before(g);
        return w + +(g.run(move).winner === seat);
      }, 0) / deals;
    const battle = game.fighting ? game.battles : game.battles + 1;
    if (choice.kind === "move")
      yield { n, battle, kind: "move", chose: label(resolve(game, p, choice)), hint: label(defaultPolicy.move(game, p)), options: moves(game, p).map((m) => ({ label: label(m), win: odds(() => {}, m) })) };
    else if (choice.kind === "color") yield { n, battle, kind: "color", chose: choice.color, hint: defaultPolicy.color(game, p), options: COLORS.map((c) => ({ label: c, win: odds((g) => (g.color = c)) })) };
    else
      yield {
        n,
        battle,
        kind: "dump",
        chose: String(choice.dump),
        hint: String(defaultPolicy.dump(game, p)),
        // the decision comes partway through passing, before the turn moves on
        options: [false, true].map((dump) => ({
          label: String(dump),
          win: odds((g) => {
            if (dump) g.pile.push(...g.players[seat].hand.splice(0));
            g.next();
          }),
        })),
      };
  }
}
