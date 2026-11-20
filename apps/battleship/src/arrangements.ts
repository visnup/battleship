import { placements } from "./board.ts";

/**
 * Counts every arrangement of ships of `lengths` on a `size` board without overlaps, and for each
 * ship how many of them cover each cell. It lays every ship but the last two, then counts the last
 * two's non-overlapping pairs from how many placements of each cover each cell, so the ~30 billion
 * arrangements of the real fleet never have to be visited. `first` limits the first ship to one
 * placement, to split the work.
 */
export function arrangements(lengths: number[], size: number, first?: number) {
  const n = lengths.length;
  const cells = size * size;
  const ps = lengths.map((l) => placements(l, size));
  const [a, b] = [n - 2, n - 1];
  // Placements of one ship that share 2+ cells with one of the other's, and how many cells beyond
  // the first: what summing coverage over a placement's cells counts too often.
  const shared = (from: number[][], to: number[][]) =>
    from.map((p) => to.flatMap((q, j) => {
      const k = q.filter((c) => p.includes(c)).length;
      return k >= 2 ? [[j, k - 1]] : [];
    }));
  const sharedAB = shared(ps[a], ps[b]), sharedBA = shared(ps[b], ps[a]);
  const cover = lengths.map(() => new Float64Array(cells));
  const weight = ps.map((p) => new Float64Array(p.length));
  const taken = new Uint8Array(cells);
  const path: number[] = [];
  const freeA = new Uint8Array(ps[a].length), freeB = new Uint8Array(ps[b].length);
  const covA = new Float64Array(cells), covB = new Float64Array(cells);
  let total = 0;

  const free = (list: number[][], flags: Uint8Array, cov: Float64Array) => {
    cov.fill(0);
    let count = 0;
    list.forEach((p, i) => {
      flags[i] = +p.every((c) => !taken[c]);
      if (flags[i]) {
        count++;
        for (const c of p) cov[c]++;
      }
    });
    return count;
  };
  const pairs = (list: number[][], flags: Uint8Array, otherCount: number, otherCov: Float64Array, overlaps: number[][][], otherFlags: Uint8Array, into: Float64Array) => {
    let sum = 0;
    list.forEach((p, i) => {
      if (!flags[i]) return;
      let hit = 0;
      for (const c of p) hit += otherCov[c];
      for (const [j, extra] of overlaps[i]) if (otherFlags[j]) hit -= extra;
      const ok = otherCount - hit;
      sum += ok;
      for (const c of p) into[c] += ok;
    });
    return sum;
  };

  (function lay(ship: number) {
    if (ship === a) {
      const fa = free(ps[a], freeA, covA), fb = free(ps[b], freeB, covB);
      const count = pairs(ps[a], freeA, fb, covB, sharedAB, freeB, cover[a]);
      pairs(ps[b], freeB, fa, covA, sharedBA, freeA, cover[b]);
      path.forEach((p, s) => (weight[s][p] += count));
      total += count;
      return;
    }
    ps[ship].forEach((p, i) => {
      if ((ship === 0 && first !== undefined && i !== first) || p.some((c) => taken[c])) return;
      for (const c of p) taken[c] = 1;
      path[ship] = i;
      lay(ship + 1);
      for (const c of p) taken[c] = 0;
    });
  })(0);

  for (let s = 0; s < a; s++) ps[s].forEach((p, i) => p.forEach((c) => (cover[s][c] += weight[s][i])));
  return { total, cover: cover.map((c) => [...c]) };
}

/** A task for `parallel`: the arrangements with the first ship at placement `seed - 1`. */
export const split = (lengths: number[], size: number, seed: number) => arrangements(lengths, size, seed - 1);
