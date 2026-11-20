import { defaultPolicy, type Policy } from "../game.ts";
import { ranked } from "../learned.ts";
import light from "../packed/light.ts";
import type { Choice, Setup } from "../replay.ts";
import { deals, review } from "../review.ts";
import { STRATEGIES } from "../strategies.ts";
import { unpack } from "../trees.ts";

// Plays out its share of a finished game's decisions off the page's thread, posting each as it's
// done, then null. A 200-tree version of the Hard bot's model, which only this worker loads,
// gives the play to compare each of yours with, and is how a Hard bot plays here (it pays, says
// no and discards like Medium).
const rank = ranked(unpack(light));
self.onmessage = ({ data: [setup, log, seat, part] }: MessageEvent<[Setup, Choice[], number, [number, number]]>) => {
  const bots: Record<string, Policy> = { builder: STRATEGIES.builder(0), learned: { ...defaultPolicy, move: (game, p, left) => rank(game, p, left)[0] } };
  for (const r of review(setup, log, seat, { deals: deals(setup), bots, rank, part })) self.postMessage(r);
  self.postMessage(null);
};
