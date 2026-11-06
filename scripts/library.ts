import { writeFile } from "node:fs/promises";
import { PLACERS } from "../src/fleets.ts";
import { library } from "./adaptive.ts";

/** 20,000 sampled fleets per placer, in `PLACERS` order, a byte per ship: the cheat sheet's models. */
const lib = await library(20_000);
await writeFile("cheat/public/library.bin", Buffer.concat(PLACERS.map((p) => lib[p])));
