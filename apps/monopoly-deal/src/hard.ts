import type { Policy } from "./game.ts";
import { learned } from "./learned.ts";
import discard from "./packed/discard.ts";
import model from "./packed/model.ts";
import pay from "./packed/pay.ts";
import sayno from "./packed/sayno.ts";
import { unpack } from "./trees.ts";

let player: Policy | undefined;

/** The learned player from `src/packed`, for the online game's hard bots. */
export const hard = () => (player ??= learned(unpack(model), unpack(pay), unpack(sayno), unpack(discard)));
