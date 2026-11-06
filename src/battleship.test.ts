import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangements } from "./arrangements.ts";
import { CELLS, fleetCells, LENGTHS, mulberry32, placements } from "./board.ts";
import { PLACERS, placer } from "./fleets.ts";
import { play, posterior, SHOOTERS, density, shooter } from "./shooters.ts";

test("a ship of length n has 2 × 10 × (11 − n) placements", () => {
  for (const n of [2, 3, 4, 5]) assert.equal(placements(n).length, 20 * (11 - n));
});

test("arrangements match brute force on a small board", () => {
  const size = 5, lengths = [3, 3, 2, 2];
  const ps = lengths.map((l) => placements(l, size));
  let total = 0;
  const cover = lengths.map(() => Array(size * size).fill(0));
  const go = (ship: number, taken: Set<number>, chosen: number[][]) => {
    if (ship === lengths.length) {
      total++;
      chosen.forEach((p, s) => p.forEach((c) => cover[s][c]++));
      return;
    }
    for (const p of ps[ship]) if (!p.some((c) => taken.has(c))) go(ship + 1, new Set([...taken, ...p]), [...chosen, p]);
  };
  go(0, new Set(), []);
  const exact = arrangements(lengths, size);
  assert.equal(exact.total, total);
  assert.deepEqual(exact.cover, cover);
});

test("every placer makes a legal fleet", () => {
  const rng = mulberry32(1);
  for (const name of [...PLACERS, "naive"] as const) {
    const make = placer(name, Array(CELLS).fill(0.17));
    for (let i = 0; i < 200; i++) {
      const cells = fleetCells(make(rng)).flat();
      assert.equal(new Set(cells).size, cells.length, name);
    }
  }
});

test("every shooter sinks the fleet without firing twice", () => {
  const rng = mulberry32(2);
  const makers = [...SHOOTERS.map((name) => [200, () => shooter(name, rng)] as const),
    ...(["hit", "info"] as const).map((goal) => [20, () => posterior(rng, goal, 50)] as const)];
  for (const [games, make] of makers)
    for (let i = 0; i < games; i++) {
      const { shots, sunkAt } = play(placer("uniform", [])(rng), make());
      assert.ok(shots.length <= CELLS);
      assert.equal(shots.filter((s) => s.hit).length, LENGTHS.reduce((a, b) => a + b));
      assert.equal(Math.max(...sunkAt), shots.length);
    }
});

test("density opens in the middle", () => {
  const first = density(mulberry32(3)).next();
  assert.ok([44, 45, 54, 55].includes(first), String(first));
});

test("better shooters take fewer shots", () => {
  const rng = mulberry32(4);
  const fleets = Array.from({ length: 300 }, () => placer("uniform", [])(rng));
  const mean = (name: (typeof SHOOTERS)[number]) => fleets.reduce((s, f) => s + play(f, shooter(name, rng)).shots.length, 0) / fleets.length;
  const [random, hunt, parity, best] = SHOOTERS.map(mean);
  assert.ok(random > hunt && hunt > parity && parity > best, String([random, hunt, parity, best]));
});
