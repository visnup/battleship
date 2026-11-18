import type { Card, Color } from "./cards.ts";
import type { Game } from "./game.ts";

const STREETS: Record<Color, string[]> = {
  brown: ["Mediterranean Avenue", "Baltic Avenue"],
  lightBlue: ["Oriental Avenue", "Vermont Avenue", "Connecticut Avenue"],
  pink: ["St. Charles Place", "States Avenue", "Virginia Avenue"],
  orange: ["St. James Place", "Tennessee Avenue", "New York Avenue"],
  red: ["Kentucky Avenue", "Indiana Avenue", "Illinois Avenue"],
  yellow: ["Atlantic Avenue", "Ventnor Avenue", "Marvin Gardens"],
  green: ["Pacific Avenue", "North Carolina Avenue", "Pennsylvania Avenue"],
  darkBlue: ["Park Place", "Boardwalk"],
  railroad: ["Reading Railroad", "Pennsylvania Railroad", "B. & O. Railroad", "Short Line"],
  utility: ["Electric Company", "Water Works"],
};

const names = new WeakMap<Card, string>();

/** Gives each property in a freshly dealt `game` its own street, the same ones on every replay of a seed. */
export function nameStreets(game: Game) {
  const used: Partial<Record<Color, number>> = {};
  for (const c of [...game.players.flatMap((p) => p.hand), ...game.draw])
    if (c.kind === "property") {
      const i = (used[c.color] = (used[c.color] ?? -1) + 1);
      names.set(c, STREETS[c.color][i]);
    }
}

export const street = (c: Card) => names.get(c);

/** `c`, named for one street. */
export const onStreet = (c: Card, name: string) => (names.set(c, name), c);
