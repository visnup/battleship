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
  const shot = new Int8Array(CELLS); // 0 unshot, 1 miss, 2 hit
  const state = new Int8Array(CELLS); // `shot`, with 3 for hits claimed by a sunk ship
  const order = new Int16Array(CELLS);
  const sinks: { ship: number; cell: number }[] = [];
  let shots = 0;
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
      state[cell] = shot[cell] = hit ? 2 : 1;
      order[cell] = shots++;
      if (sunk !== null) afloat.delete(sunk), sinks.push({ ship: sunk, cell });
      if (sinks.length) claim();
    },
  };

  /**
   * Which hits were each sunk ship: a line of hits through the cell that sank it, none shot after
   * it. When the lines could be chosen more than one way, choose them so every ship afloat still
   * has somewhere to be and every other hit still has a ship afloat that could explain it. Chosen
   * again after every shot, since later shots can rule a choice out.
   */
  function claim() {
    const options = sinks.map(({ ship, cell }) =>
      shipPlacements(ship).filter((cs) => cs.includes(cell) && cs.every((c) => shot[c] === 2 && order[c] <= order[cell])));
    const taken = new Uint8Array(CELLS);
    let best = Infinity, lines: number[][] = [];
    const chosen: number[][] = [];
    if (options.every((o) => o.length === 1)) lines = options.map((o) => o[0]);
    else (function choose(i: number) {
      if (!best) return;
      if (i === options.length) {
        const b = unexplained(taken);
        if (b < best) (best = b), (lines = chosen.slice());
        return;
      }
      for (const cs of options[i]) {
        if (cs.some((c) => taken[c])) continue;
        for (const c of cs) taken[c] = 1;
        chosen.push(cs);
        choose(i + 1);
        chosen.pop();
        for (const c of cs) taken[c] = 0;
      }
    })(0);
    state.set(shot);
    for (const c of lines.length ? lines.flat() : sinks.map((s) => s.cell)) state[c] = 3;
  }

  /** How badly claiming `taken` fits: a ship afloat with nowhere to be counts 100, a hit no ship afloat could cross 1. */
  function unexplained(taken: Uint8Array) {
    const covered = new Uint8Array(CELLS);
    let n = 0;
    for (const ship of afloat) {
      let fits = false;
      for (const cs of shipPlacements(ship)) {
        if (cs.some((c) => shot[c] === 1 || taken[c]) || cs.every((c) => shot[c] === 2)) continue;
        fits = true;
        for (const c of cs) covered[c] = 1;
      }
      if (!fits) n += 100;
    }
    for (let c = 0; c < CELLS; c++) if (shot[c] === 2 && !taken[c] && !covered[c]) n++;
    return n;
  }
}

/**
 * Keeps `n` fleets drawn uniformly, by rejection, from every arrangement consistent with the shots
 * so far: the exact posterior, sampled. `hit` fires where the most of them have a ship; `info` fires
 * where they disagree most, the cell whose answer (miss, hit, or which ship sank) has the most
 * entropy, and so takes a sure hit only once nothing is uncertain.
 */
export function posterior(rng: () => number, goal: "hit" | "info", n = 200): Shooter & { score: Float64Array; fits: boolean } {
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
    /** Whether any fleet fits the answers so far; none does after a mistaken one. */
    fits: true,
    next() {
      const possible = allowed.every((a) => a.length);
      for (let tries = 0; possible && pool.length < n && (tries < 1000 * n || (!pool.length && tries < 2_000_000)); tries++)
        if (draw()) pool.push({ owner: owner.slice(), fleet: fleet.slice() });
      if (!(this.fits = pool.length > 0)) return order.indexOf(-1);
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
 * the fleets with a ship on each cell, as a bit per fleet, and how often each placement of each ship is used relative to the average one, the weights a
 * density shooter tuned to them uses.
 */
export function model(name: string, fleets: ArrayLike<number>) {
  const n = fleets.length / SHIPS.length, words = Math.ceil(n / 32);
  const cover = new Uint32Array(CELLS * words);
  const counts = SHIPS.map((_, s) => shipPlacements(s).map(() => 1));
  for (let i = 0; i < n; i++)
    SHIPS.forEach((_, s) => {
      const p = fleets[i * SHIPS.length + s];
      counts[s][p]++;
      for (const c of shipPlacements(s)[p]) cover[c * words + (i >> 5)] |= 1 << (i & 31);
    });
  const weights = counts.map((cs) => {
    const mean = cs.reduce((a, b) => a + b) / cs.length;
    return cs.map((c) => c / mean);
  });
  return { name, n, words, cover, weights };
}
export type Model = ReturnType<typeof model>;

const entropy = (p: number) => (p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p));
const popcount = (x: number) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
};

/**
 * Doesn't know the opponent's habit, so works it out. It keeps each model's sample fleets that
 * fit every hit and miss so far; the share that fit, times the habit's `prior`, is how likely
 * that habit is. Which ship sank would say more, but so few sample fleets match it that the
 * estimate gets noisier, and it cost shots. It fires as a density shooter tuned to the mix of habits,
 * weighted by how likely each is. With `probe`, while no habit is 95% likely and there's no hit to
 * chase, it instead fires where the habits disagree most: the cell whose hit or miss says the most
 * about which habit it is.
 */
export function adaptive(rng: () => number, models: Model[], { probe = false, prior = models.map(() => 1) } = {}): Shooter & { score: Float64Array; belief: number[] } {
  const alive = models.map((m) => {
    const a = new Uint32Array(m.words).fill(~0);
    if (m.n % 32) a[m.words - 1] = (1 << m.n % 32) - 1;
    return a;
  });
  const belief = prior.map((p) => p / prior.reduce((a, b) => a + b));
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
        const a = alive[k], n = Math.max(1, a.reduce((t, w) => t + popcount(w), 0));
        return Array.from({ length: CELLS }, (_, c) => {
          let hits = 0;
          for (let w = 0; w < m.words; w++) hits += popcount(a[w] & m.cover[c * m.words + w]);
          return hits / n;
        });
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
      const next = models.map((m, k) => {
        const a = alive[k].slice(), cover = m.cover.subarray(cell * m.words, (cell + 1) * m.words);
        for (let w = 0; w < m.words; w++) a[w] &= hit ? cover[w] : ~cover[w];
        return a;
      });
      const counts = next.map((a) => a.reduce((n, w) => n + popcount(w), 0));
      // Once few sample fleets fit, their shares are mostly noise: keep the last belief.
      if (Math.max(...counts) < 20) return void (frozen = true);
      next.forEach((a, k) => (alive[k] = a));
      const shares = models.map((m, k) => (prior[k] * counts[k]) / m.n);
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
