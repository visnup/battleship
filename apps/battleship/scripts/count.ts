import { CELLS, colOf, LENGTHS, rowOf, SHIPS, SIZE, shipPlacements } from "../src/board.ts";
import { parallel } from "../src/parallel.ts";
import { write } from "../src/results.ts";

/** Counts every legal arrangement of the fleet exactly, and how many put each ship on each cell. */
const { total, cover } = await parallel<{ total: number; cover: number[][] }>(
  new URL("../src/arrangements.ts", import.meta.url).href, "split", [LENGTHS, SIZE], shipPlacements(0).length);
console.log(`${total.toLocaleString()} arrangements`);
await write("arrangements", SHIPS.flatMap((ship, s) =>
  Array.from({ length: CELLS }, (_, cell) => ({ ship, cell, row: rowOf(cell), col: colOf(cell), arrangements: cover[s][cell] }))));
