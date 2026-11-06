import { around, CELLS, colOf, type Fleet, neighbors, pick, rowOf, SIZE, shipPlacements, SHIPS } from "./board.ts";

/** Ways to hide a fleet. Each returns a placement index per ship. */
export type Placer = (rng: () => number) => Fleet;

/** Tries random fleets from `candidates` until one has no overlaps and passes `ok`: uniform over those that do. */
function rejection(candidates: (ship: number) => number[], ok: (cells: number[][]) => boolean = () => true): Placer {
  const lists = SHIPS.map((_, ship) => candidates(ship));
  const taken = new Uint8Array(CELLS);
  return (rng) => {
    for (;;) {
      taken.fill(0);
      const fleet = lists.map((list) => pick(list, rng));
      const cells = fleet.map((p, ship) => shipPlacements(ship)[p]);
      let overlap = false;
      for (const cs of cells) for (const c of cs) overlap ||= taken[c]++ > 0;
      if (!overlap && ok(cells)) return fleet;
    }
  };
}

const all = (ship: number) => shipPlacements(ship).map((_, i) => i);
const onEdge = (c: number) => rowOf(c) === 0 || rowOf(c) === SIZE - 1 || colOf(c) === 0 || colOf(c) === SIZE - 1;

/** Every arrangement equally likely. */
export const uniform = rejection(all);

/** Each ship placed in turn, retrying only that ship when it overlaps: how most programs do it. */
export const naive: Placer = (rng) => {
  const taken = new Uint8Array(CELLS);
  return SHIPS.map((_, ship) => {
    for (;;) {
      const p = Math.floor(rng() * shipPlacements(ship).length);
      const cells = shipPlacements(ship)[p];
      if (cells.some((c) => taken[c])) continue;
      for (const c of cells) taken[c] = 1;
      return p;
    }
  });
};

/** Every ship along the outer ring. */
export const edges = rejection((ship) => all(ship).filter((p) => shipPlacements(ship)[p].every(onEdge)));

/** No two ships touching, not even diagonally. */
export const spread = rejection(all, (cells) => {
  const owner = new Int8Array(CELLS).fill(-1);
  cells.forEach((cs, ship) => cs.forEach((c) => (owner[c] = ship)));
  return cells.every((cs, ship) => cs.every((c) => around(c).every((n) => owner[n] === -1 || owner[n] === ship)));
});

/** The carrier anywhere, then each ship touching one already placed. */
export const clustered: Placer = (rng) => {
  const taken = new Uint8Array(CELLS);
  return SHIPS.map((_, ship) => {
    const options = all(ship).filter((p) => {
      const cs = shipPlacements(ship)[p];
      return !cs.some((c) => taken[c]) && (ship === 0 || cs.some((c) => neighbors(c).some((n) => taken[n])));
    });
    const p = pick(options, rng);
    for (const c of shipPlacements(ship)[p]) taken[c] = 1;
    return p;
  });
};

/**
 * The coldest of `tries` uniform fleets: the one whose cells are least often occupied, by the
 * exact heat map `heat` (a chance per cell). It hides where a density shooter looks last.
 */
export const cold = (heat: number[], tries = 100): Placer => (rng) => {
  let best: Fleet = [], low = Infinity;
  for (let i = 0; i < tries; i++) {
    const fleet = uniform(rng);
    const h = fleet.reduce((s, p, ship) => s + shipPlacements(ship)[p].reduce((t, c) => t + heat[c], 0), 0);
    if (h < low) (low = h), (best = fleet);
  }
  return best;
};

export const PLACERS = ["uniform", "edges", "spread", "clustered", "cold"] as const;
export type PlacerName = (typeof PLACERS)[number] | "naive";

export const placer = (name: PlacerName, heat: number[]): Placer =>
  ({ uniform, naive, edges, spread, clustered, cold: cold(heat) })[name];
