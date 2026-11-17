// The 106 playing cards of the 2014 US edition (B0965), per the contents list on its rule sheet.
// Values in $M. Rent by number of cards in the set; the last entry is the full set.

export const COLORS = {
  brown: { value: 1, rent: [1, 2] },
  lightBlue: { value: 1, rent: [1, 2, 3] },
  pink: { value: 2, rent: [1, 2, 4] },
  orange: { value: 2, rent: [1, 3, 5] },
  red: { value: 3, rent: [2, 3, 6] },
  yellow: { value: 3, rent: [2, 4, 6] },
  green: { value: 4, rent: [2, 4, 7] },
  darkBlue: { value: 4, rent: [3, 8] },
  railroad: { value: 2, rent: [1, 2, 3, 4] },
  utility: { value: 2, rent: [1, 2] },
} as const;

export type Color = keyof typeof COLORS;

export const HOUSE_RENT = 3;
export const HOTEL_RENT = 4;
export const DEBT = 5;
export const BIRTHDAY = 2;

export type Card =
  | { kind: "money"; value: number }
  | { kind: "property"; color: Color; value: number }
  | { kind: "wild"; colors: Color[] | "any"; value: number }
  | { kind: "rent"; colors: Color[] | "any"; value: number }
  | { kind: "action"; action: Action; value: number };

export type Action = "dealBreaker" | "justSayNo" | "slyDeal" | "forcedDeal" | "debtCollector" | "birthday" | "doubleRent" | "house" | "hotel" | "passGo";

const times = <T>(n: number, card: T): T[] => Array.from({ length: n }, () => card);

export const DECK: readonly Card[] = [
  ...[1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 10].map((value) => ({ kind: "money", value }) as const),
  ...(Object.keys(COLORS) as Color[]).flatMap((color) => times(COLORS[color].rent.length, { kind: "property", color, value: COLORS[color].value } as const)),
  ...(
    [
      [["lightBlue", "brown"], 1, 1],
      [["lightBlue", "railroad"], 4, 1],
      [["pink", "orange"], 2, 2],
      [["red", "yellow"], 3, 2],
      [["darkBlue", "green"], 4, 1],
      [["green", "railroad"], 4, 1],
      [["railroad", "utility"], 2, 1],
      ["any", 0, 2],
    ] as const
  ).flatMap(([colors, value, n]) => times(n, { kind: "wild", colors: colors as Color[] | "any", value } as const)),
  ...(
    [
      [["lightBlue", "brown"], 1, 2],
      [["pink", "orange"], 1, 2],
      [["red", "yellow"], 1, 2],
      [["darkBlue", "green"], 1, 2],
      [["railroad", "utility"], 1, 2],
      ["any", 3, 3],
    ] as const
  ).flatMap(([colors, value, n]) => times(n, { kind: "rent", colors: colors as Color[] | "any", value } as const)),
  ...(
    [
      ["dealBreaker", 5, 2],
      ["justSayNo", 4, 3],
      ["slyDeal", 3, 3],
      ["forcedDeal", 3, 3],
      ["debtCollector", 3, 3],
      ["birthday", 2, 3],
      ["doubleRent", 1, 2],
      ["house", 3, 3],
      ["hotel", 4, 2],
      ["passGo", 1, 10],
    ] as const
  ).flatMap(([action, value, n]) => times(n, { kind: "action", action, value } as const)),
];
