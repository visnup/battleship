// Hilt's 97 cards, per the components list on its rule sheet: 15 force 1s, 8 each of force 2–6
// and 10, 15 Bait, 6 Fury, 3 Legend, 3 Winter, 3 Crows, 3 Doves, and the Favor card, which never
// goes in the deck.

export type Fate = "bait" | "fury" | "legend" | "winter" | "crows" | "doves";
export type Card = { kind: "force"; value: number } | { kind: Fate; value: number };

export const COLORS = ["pink", "orange", "white"] as const;
export type Color = (typeof COLORS)[number];

const times = (n: number, card: Card): Card[] => Array.from({ length: n }, () => card);

export const DECK: readonly Card[] = [
  ...times(15, { kind: "force", value: 1 }),
  ...[2, 3, 4, 5, 6, 10].flatMap((value) => times(8, { kind: "force", value })),
  ...times(15, { kind: "bait", value: 0 }),
  ...times(6, { kind: "fury", value: 0 }),
  ...times(3, { kind: "legend", value: 10 }),
  ...times(3, { kind: "winter", value: 0 }),
  ...times(3, { kind: "crows", value: 0 }),
  ...times(3, { kind: "doves", value: 0 }),
];

export const name = (c: Card) => (c.kind === "force" ? String(c.value) : c.kind);
