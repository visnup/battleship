import { ranked } from "../learned.ts";
import light from "../packed/light.ts";
import type { Choice, Setup } from "../replay.ts";
import { DEALS, review } from "../review.ts";
import { unpack } from "../trees.ts";

// Plays out its share of a finished game's plays off the page's thread, posting each as it's
// done, then null. Moves are ranked by a 200-tree version of the Hard bot's model, which only
// this worker loads.
self.onmessage = ({ data: [setup, log, seat, part] }: MessageEvent<[Setup, Choice[], number, [number, number]]>) => {
  for (const r of review(setup, log, seat, ranked(unpack(light)), { deals: DEALS, part })) self.postMessage(r);
  self.postMessage(null);
};
