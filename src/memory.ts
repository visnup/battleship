import { DECK } from "./cards.ts";
import { name } from "./game.ts";
import type { observe } from "./replay.ts";

/** The actions, in the order the learned models number them. */
export const ACTIONS = ["dealBreaker", "justSayNo", "slyDeal", "forcedDeal", "debtCollector", "birthday", "doubleRent", "house", "hotel", "passGo"];

const unseen = (c: string) => (c.startsWith("rent(") ? "rent" : c);
const TOTAL = Map.groupBy(DECK.map(name), unseen);

/**
 * What a player can't see yet: how many of each action and of the Rent cards aren't in their
 * hand, a bank, a house or hotel, or the discard pile, and how many cards that leaves in the draw
 * pile and the others' hands.
 */
export function memory(obs: ReturnType<typeof observe>): number[] {
  const seen = Map.groupBy([...obs.hand, ...obs.pile, ...obs.table.flatMap((q) => [...q.bank, ...q.built.map((x) => x.card)])], unseen);
  return [...[...ACTIONS, "rent"].map((a) => TOTAL.get(a)!.length - (seen.get(a)?.length ?? 0)), obs.draw_size + obs.table.slice(1).reduce((s, q) => s + q.hand_size, 0)];
}
