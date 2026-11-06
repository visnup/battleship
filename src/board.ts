/** The 10×10 board and the five ships of the Hasbro rules. A cell is `row * 10 + col`. */
export const SIZE = 10;
export const CELLS = SIZE * SIZE;
export const SHIPS = ["Carrier", "Battleship", "Cruiser", "Submarine", "Destroyer"] as const;
export const LENGTHS = [5, 4, 3, 3, 2];

export const rowOf = (cell: number) => Math.floor(cell / SIZE);
export const colOf = (cell: number) => cell % SIZE;
/** A cell as players call it: rows A–J, columns 1–10. */
export const label = (cell: number) => `${"ABCDEFGHIJ"[rowOf(cell)]}${colOf(cell) + 1}`;

/** Every way to lay a ship of `length` on a `size` board: horizontal ones first, then vertical. */
export function placements(length: number, size = SIZE): number[][] {
  const out: number[][] = [];
  for (const vertical of [false, true])
    for (let r = 0; r < (vertical ? size - length + 1 : size); r++)
      for (let c = 0; c < (vertical ? size : size - length + 1); c++)
        out.push(Array.from({ length }, (_, i) => (vertical ? (r + i) * size + c : r * size + c + i)));
  return out;
}

/** Placements by length, shared so a placement's index means the same thing everywhere. */
export const PLACEMENTS = new Map([...new Set(LENGTHS)].map((n) => [n, placements(n)]));
export const shipPlacements = (ship: number) => PLACEMENTS.get(LENGTHS[ship])!;

/** A fleet is a placement index per ship. */
export type Fleet = number[];
export const fleetCells = (fleet: Fleet) => fleet.map((p, ship) => shipPlacements(ship)[p]);

/** The orthogonal neighbors of `cell`. */
export function neighbors(cell: number, size = SIZE): number[] {
  const r = Math.floor(cell / size), c = cell % size;
  const out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

/** The up to eight cells around `cell`, diagonals included. */
export function around(cell: number, size = SIZE): number[] {
  const r = Math.floor(cell / size), c = cell % size;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if ((dr || dc) && r + dr >= 0 && r + dr < size && c + dc >= 0 && c + dc < size) out.push(cell + dr * size + dc);
  return out;
}

export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(xs: readonly T[], rng: () => number) => xs[Math.floor(rng() * xs.length)];
