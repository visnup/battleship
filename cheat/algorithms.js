import { PLACERS } from "../src/fleets.ts";
import { adaptive, density, huntTarget, model, posterior } from "../src/shooters.ts";

const bytes = new Uint8Array(await (await fetch("library.bin")).arrayBuffer());
const per = bytes.length / PLACERS.length;
export const models = PLACERS.map((name, k) => model(name, bytes.subarray(k * per, (k + 1) * per)));

/** Every algorithm the cheat sheet offers. Shooters keep state, so each is made fresh per game. */
export const ALGORITHMS = {
  adaptive: { note: "works out their habit as it goes", make: (rng) => adaptive(rng, models) },
  exact: { note: "likeliest cell, from 1,000 fleets that fit", make: (rng) => posterior(rng, "hit", 1000) },
  density: { note: "the classic probability density", make: (rng) => density(rng) },
  info: { note: "the shot that tells you most", make: (rng) => posterior(rng, "info", 1000) },
  ...Object.fromEntries(models.map((m) => [`tuned ${m.name}`, { note: `if they always hide ${m.name}`, make: (rng) => density(rng, m.weights) }])),
  parity: { note: "checkerboard, then neighbors of hits", make: (rng) => huntTarget(rng, true) },
};
