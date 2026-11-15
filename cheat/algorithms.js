import { PLACERS } from "../src/fleets.ts";
import { lineup, model } from "../src/shooters.ts";

const bytes = new Uint8Array(await (await fetch("library.bin")).arrayBuffer());
const per = bytes.length / PLACERS.length;
export const models = PLACERS.map((name, k) => model(name, bytes.subarray(k * per, (k + 1) * per)));

/** Every shooter, in the order the cheat sheet offers them. Shooters keep state, so each is made fresh per game. */
const { random, hunt, adaptive, exact, density, info, parity, ...tuned } = lineup(models);
export const ALGORITHMS = { adaptive, exact, density, info, ...tuned, parity };
export const EVERY = { ...ALGORITHMS, hunt, random };
