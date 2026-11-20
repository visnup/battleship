// Fives' 52 cards, per the rule sheet's components: 1 to 13 in blue, green and silver, and 0 to 4
// and 6 to 13 in magenta. Every card's back is a magenta 5.

export const COLORS = ["blue", "green", "silver", "magenta"] as const;
export type Color = (typeof COLORS)[number];
/** A card, and its place in `DECK`. */
export type Card = { color: Color; value: number; id: number };

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const DECK: readonly Card[] = [
  ...(["blue", "green", "silver"] as const).flatMap((color) => range(1, 13).map((value) => ({ color, value }))),
  ...[...range(0, 4), ...range(6, 13)].map((value) => ({ color: "magenta" as const, value })),
].map((c, id) => ({ ...c, id }));

/** The cards dealt to `players`: all 52 at 4, and without the 10 to 13s at 3. */
const SHORT = DECK.filter((c) => c.value < 10);
export const deck = (players: number) => (players === 3 ? SHORT : DECK);

/** The magenta 5 on every card's back. */
export const BACK: Card = { color: "magenta", value: 5, id: -1 };

export const name = (c: Card) => `${c.color} ${c.value}`;
