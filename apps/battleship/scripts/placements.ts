import { CELLS, mulberry32, SHIPS } from "../src/board.ts";
import { type PlacerName, PLACERS, placer } from "../src/fleets.ts";
import { collect } from "../src/parallel.ts";
import { parquet, query, write } from "../src/results.ts";

/** The chance each cell holds a ship when every arrangement is equally likely, from `count.ts`. */
export async function heat() {
  const rows = await query<{ cell: number; p: number }>(`
    select cell, sum(arrangements) / (select sum(arrangements) / 5 from ${parquet("arrangements")}) p
    from ${parquet("arrangements")} group by cell order by cell`);
  return rows.map((r) => r.p);
}

/** The first `n` sampled fleets of each placer, flat: a placement index per ship. */
export async function library(n: number) {
  const rows = await query<Record<string, number>>(`
    select placer, ${SHIPS.join(", ")} from ${parquet("placements")} where placer != 'naive' and fleet < ${n} order by placer, fleet`);
  return Object.fromEntries(PLACERS.map((name) => [name, Uint8Array.from(rows.filter((r) => r.placer === name).flatMap((r) => SHIPS.map((s) => r[s])))]));
}

/** A task: `n` fleets from each placer, a row each. */
export function sample(heat: number[], seed: number, n: number) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () =>
    (["naive", ...PLACERS] as PlacerName[]).map((name) => ({ placer: name, ...Object.fromEntries(placer(name, heat)(rng).map((p, s) => [SHIPS[s], p])) })));
}

if (import.meta.main) {
  const h = await heat();
  if (h.length !== CELLS) throw new Error("run count.ts first");
  await write("placements", await collect(import.meta.url, "sample", [h], 200_000, "fleet"));
}
