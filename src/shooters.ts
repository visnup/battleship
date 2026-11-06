import { CELLS, colOf, type Fleet, fleetCells, LENGTHS, neighbors, pick, rowOf, shipPlacements, SHIPS } from "./board.ts";

/** A shooter picks the next cell, then hears the result: a miss, a hit, or a hit that sank `sunk`. */
export interface Shooter {
  next(): number;
  observe(cell: number, hit: boolean, sunk: number | null): void;
  /** How much the shooter liked each cell on its last `next()`, if it scores cells. */
  score?: Float64Array;
}

/** Fires anywhere it hasn't yet. */
export function random(rng: () => number): Shooter {
  const left = Array.from({ length: CELLS }, (_, i) => i);
  return {
    next: () => left.splice(Math.floor(rng() * left.length), 1)[0],
    observe() {},
  };
}

/**
 * Hunts at random, then after a hit fires at the hit's neighbors until it runs out of them.
 * With `parity` it hunts only on one color of a checkerboard, since every ship covers both.
 */
export function huntTarget(rng: () => number, parity = false): Shooter {
  const shot = new Uint8Array(CELLS);
  const stack: number[] = [];
  const hunt = Array.from({ length: CELLS }, (_, i) => i).filter((c) => !parity || (rowOf(c) + colOf(c)) % 2 === 0);
  return {
    next() {
      let cell: number;
      do cell = stack.length ? stack.pop()! : (hunt.length ? hunt.splice(Math.floor(rng() * hunt.length), 1)[0] : pick([...shot.keys()].filter((c) => !shot[c]), rng));
      while (shot[cell]);
      return cell;
    },
    observe(cell, hit) {
      shot[cell] = 1;
      if (hit) for (const n of neighbors(cell)) if (!shot[n]) stack.push(n);
    },
  };
}

/**
 * Fires where the most remaining placements of the remaining ships could be, after Jeremy Berry's
 * and DataGenetics' probability density. A placement can't cross a miss or a sunk ship's cells,
 * and while there are hits no sunk ship accounts for, placements through them count 100× per hit.
 * `weights[ship][placement]` weighs each placement by how often the opponent uses it; it's read
 * on every shot, so changing it in place retunes the shooter.
 */
export function density(rng: () => number, weights?: number[][]): Shooter & { score: Float64Array } {
  const state = new Int8Array(CELLS); // 0 unshot, 1 miss, 2 hit, 3 hit on a sunk ship
  const afloat = new Set(SHIPS.map((_, i) => i));
  const score = new Float64Array(CELLS);
  const fill = (target: boolean) => {
    score.fill(0);
    let total = 0;
    for (const ship of afloat) {
      shipPlacements(ship).forEach((cells, p) => {
        let hits = 0;
        for (const c of cells) {
          if (state[c] === 1 || state[c] === 3) return;
          if (state[c] === 2) hits++;
        }
        if (hits === cells.length || (target && !hits)) return;
        const w = (weights?.[ship][p] ?? 1) * 100 ** hits;
        for (const c of cells) if (!state[c]) (score[c] += w), (total += w);
      });
    }
    return total;
  };
  return {
    score,
    next() {
      if (!(state.includes(2) && fill(true))) fill(false);
      let best = -1;
      const ties: number[] = [];
      for (let c = 0; c < CELLS; c++) {
        if (state[c] || score[c] < best) continue;
        if (score[c] > best) (best = score[c]), (ties.length = 0);
        ties.push(c);
      }
      return ties.length ? pick(ties, rng) : state.indexOf(0);
    },
    observe(cell, hit, sunk) {
      state[cell] = hit ? 2 : 1;
      if (sunk === null) return;
      afloat.delete(sunk);
      // Which hits were the sunk ship: a line of unclaimed hits through `cell`. When there's more
      // than one, claim the one that leaves the fewest hits stranded with nothing to explain them.
      const lines = shipPlacements(sunk).filter((cs) => cs.includes(cell) && cs.every((c) => state[c] === 2));
      const line = lines.length > 1 ? lines.toSorted((a, b) => stranded(a) - stranded(b))[0] : lines[0];
      for (const c of line ?? [cell]) state[c] = 3;
    },
  };
  function stranded(claimed: number[]) {
    const s = state.slice();
    for (const c of claimed) s[c] = 3;
    let n = 0;
    for (let c = 0; c < CELLS; c++) if (s[c] === 2 && !neighbors(c).some((x) => s[x] === 0 || s[x] === 2)) n++;
    return n;
  }
}

/**
 * Keeps `n` fleets drawn uniformly, by rejection, from every arrangement consistent with the shots
 * so far: the exact posterior, sampled. `hit` fires where the most of them have a ship; `info` fires
 * where they disagree most, the cell whose answer (miss, hit, or which ship sank) has the most
 * entropy, and so takes a sure hit only once nothing is uncertain.
 */
export function posterior(rng: () => number, goal: "hit" | "info", n = 200): Shooter & { score: Float64Array } {
  const order = new Int16Array(CELLS).fill(-1);
  const hit = new Uint8Array(CELLS);
  const sunkAt = SHIPS.map(() => -1);
  const allowed = SHIPS.map((_, s) => shipPlacements(s).map((_, p) => p));
  const score = new Float64Array(CELLS);
  let ships = SHIPS.map((_, s) => s);
  let pool: { owner: Int8Array; fleet: number[] }[] = [];
  let shots = 0;
  const owner = new Int8Array(CELLS), fleet = SHIPS.map(() => 0);
  const draw = () => {
    owner.fill(-1);
    for (const s of ships) {
      const cells = shipPlacements(s)[(fleet[s] = pick(allowed[s], rng))];
      for (const c of cells) if (owner[c] >= 0) return false;
      for (const c of cells) owner[c] = s;
    }
    for (let c = 0; c < CELLS; c++) if (hit[c] && owner[c] < 0) return false;
    return true;
  };
  const sinks = (f: number[], s: number, cell: number) => shipPlacements(s)[f[s]].every((c) => c === cell || order[c] >= 0);
  return {
    score,
    next() {
      for (let tries = 0; pool.length < n && (tries < 1000 * n || !pool.length); tries++)
        if (draw()) pool.push({ owner: owner.slice(), fleet: fleet.slice() });
      let best = -Infinity;
      const ties: number[] = [];
      const counts = new Float64Array(SHIPS.length + 2);
      score.fill(0);
      for (let c = 0; c < CELLS; c++) {
        if (order[c] >= 0) continue;
        counts.fill(0);
        for (const { owner, fleet } of pool) counts[owner[c] < 0 ? 0 : sinks(fleet, owner[c], c) ? owner[c] + 2 : 1]++;
        const hits = pool.length - counts[0];
        score[c] = goal === "hit" ? hits : counts.reduce((h, k) => (k ? h - k * Math.log(k / pool.length) : h), 0) + hits * 1e-9;
        if (score[c] < best) continue;
        if (score[c] > best) (best = score[c]), (ties.length = 0);
        ties.push(c);
      }
      return pick(ties, rng);
    },
    observe(cell, h, sunk) {
      order[cell] = shots++;
      hit[cell] = +h;
      if (sunk !== null) sunkAt[sunk] = cell;
      pool = pool.filter(({ owner, fleet }) => (owner[cell] >= 0) === h && (!h || (sinks(fleet, owner[cell], cell) ? owner[cell] === sunk : sunk === null)));
      SHIPS.forEach((_, s) => {
        allowed[s] = allowed[s].filter((p) => {
          const cells = shipPlacements(s)[p];
          if (cells.some((c) => order[c] >= 0 && !hit[c])) return false;
          const all = cells.every((c) => hit[c]);
          return sunkAt[s] < 0 ? !all : all && cells.includes(sunkAt[s]) && Math.max(...cells.map((c) => order[c])) === order[sunkAt[s]];
        });
      });
      ships = ships.toSorted((a, b) => allowed[a].length - allowed[b].length);
    },
  };
}

/**
 * A model of an opponent from a sample of their fleets (`fleets`, a placement index per ship, flat):
 * which cells each fleet covers, and how often each placement of each ship is used relative to the
 * average one, the weights a density shooter tuned to them uses.
 */
export function model(name: string, fleets: ArrayLike<number>) {
  const n = fleets.length / SHIPS.length;
  const masks = new Uint32Array(n * 4);
  const counts = SHIPS.map((_, s) => shipPlacements(s).map(() => 1));
  for (let i = 0; i < n; i++)
    SHIPS.forEach((_, s) => {
      const p = fleets[i * SHIPS.length + s];
      counts[s][p]++;
      for (const c of shipPlacements(s)[p]) masks[i * 4 + (c >> 5)] |= 1 << (c & 31);
    });
  const weights = counts.map((cs) => {
    const mean = cs.reduce((a, b) => a + b) / cs.length;
    return cs.map((c) => c / mean);
  });
  return { name, n, masks, weights };
}
export type Model = ReturnType<typeof model>;

const entropy = (p: number) => (p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p));

/**
 * Doesn't know the opponent's habit, so works it out. It keeps each model's sample fleets that
 * fit every shot so far; the share that fit is how likely that habit is. It fires as a density
 * shooter tuned to the mix of habits, weighted by how likely each is. With `probe`, while no habit
 * is 95% likely and there's no hit to chase, it instead fires where the habits disagree most: the
 * cell whose hit or miss says the most about which habit it is.
 */
export function adaptive(rng: () => number, models: Model[], probe = false): Shooter & { score: Float64Array; belief: number[] } {
  const alive = models.map((m) => Int32Array.from({ length: m.n }, (_, i) => i));
  const belief = models.map(() => 1 / models.length);
  const mix = SHIPS.map((_, s) => shipPlacements(s).map(() => 1));
  const inner = density(rng, mix);
  const shot = new Uint8Array(CELLS);
  const score = new Float64Array(CELLS);
  let unresolved = 0, frozen = false;
  const retune = () =>
    mix.forEach((ps, s) => ps.forEach((_, p) => (ps[p] = models.reduce((w, m, k) => w + belief[k] * m.weights[s][p], 0))));
  retune();
  return {
    score,
    belief,
    next() {
      if (!probe || frozen || unresolved || Math.max(...belief) >= 0.95) {
        const cell = inner.next();
        score.set(inner.score);
        return cell;
      }
      const p = models.map((m, k) => {
        const counts = new Float64Array(CELLS);
        const take = Math.min(alive[k].length, 2000);
        for (let j = 0; j < take; j++) {
          const i = alive[k][j];
          for (let w = 0; w < 4; w++) for (let bits = m.masks[i * 4 + w]; bits; bits &= bits - 1) counts[w * 32 + 31 - Math.clz32(bits & -bits)]++;
        }
        return counts.map((x) => x / Math.max(take, 1));
      });
      let best = -1;
      const ties: number[] = [];
      for (let c = 0; c < CELLS; c++) {
        if (shot[c]) continue;
        const mixed = belief.reduce((s, b, k) => s + b * p[k][c], 0);
        score[c] = entropy(mixed) - belief.reduce((s, b, k) => s + b * entropy(p[k][c]), 0);
        if (score[c] < best) continue;
        if (score[c] > best) (best = score[c]), (ties.length = 0);
        ties.push(c);
      }
      return pick(ties, rng);
    },
    observe(cell, hit, sunk) {
      inner.observe(cell, hit, sunk);
      shot[cell] = 1;
      unresolved += +hit - (sunk === null ? 0 : LENGTHS[sunk]);
      if (frozen) return;
      const bit = 1 << (cell & 31), w = cell >> 5;
      const next = models.map((m, k) => alive[k].filter((i) => !(m.masks[i * 4 + w] & bit) === !hit));
      // Once few sample fleets fit, their shares are mostly noise: keep the last belief.
      if (Math.max(...next.map((a) => a.length)) < 20) return void (frozen = true);
      next.forEach((a, k) => (alive[k] = a));
      const shares = models.map((m, k) => alive[k].length / m.n);
      const total = shares.reduce((a, b) => a + b);
      shares.forEach((s, k) => (belief[k] = s / total));
      retune();
    },
  };
}

export const SHOOTERS = ["random", "hunt", "parity", "density"] as const;
export type ShooterName = (typeof SHOOTERS)[number];
export const shooter = (name: ShooterName, rng: () => number): Shooter =>
  ({ random: () => random(rng), hunt: () => huntTarget(rng), parity: () => huntTarget(rng, true), density: () => density(rng) })[name]();

/** The result of one shooter against one fleet: every shot in order, and the shot that sank each ship. */
export function play(fleet: Fleet, s: Shooter) {
  const owner = new Int8Array(CELLS).fill(-1);
  const left = [...LENGTHS];
  fleetCells(fleet).forEach((cells, ship) => cells.forEach((c) => (owner[c] = ship)));
  const shots: { cell: number; hit: boolean; sunk: number | null }[] = [];
  const sunkAt = SHIPS.map(() => 0);
  const fired = new Uint8Array(CELLS);
  let afloat = SHIPS.length;
  while (afloat) {
    const cell = s.next();
    if (fired[cell]++) throw new Error(`fired at ${cell} twice`);
    const ship = owner[cell];
    const sunk = ship >= 0 && --left[ship] === 0 ? ship : null;
    if (sunk !== null) (sunkAt[sunk] = shots.length + 1), afloat--;
    shots.push({ cell, hit: ship >= 0, sunk });
    s.observe(cell, ship >= 0, sunk);
  }
  return { shots, sunkAt };
}
