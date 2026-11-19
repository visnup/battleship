import assert from "node:assert/strict";
import { test } from "node:test";
import { replay, type Setup } from "./replay.ts";
import { review } from "./review.ts";

test("a review plays out every option at each of a seat's decisions", () => {
  const setup: Setup = { players: 4, seed: 3, first: 0, bots: Array(4).fill("default") };
  const { decisions } = replay(setup, []);
  const reviewed = [...review(setup, decisions, 1, { deals: 8 })];
  assert.equal(reviewed.length, decisions.filter((c) => c.seat === 1).length);
  // workers sharing it cover every decision once
  const parts = [0, 1, 2].flatMap((i) => [...review(setup, decisions, 1, { deals: 8, part: [i, 3] })].map((r) => r.n));
  assert.deepEqual(
    parts.sort((a, b) => a - b),
    reviewed.map((r) => r.n),
  );
  for (const r of reviewed) {
    assert.ok(r.options.some((o) => o.label === r.chose));
    // a bot playing the default always takes the Hint
    assert.equal(r.chose, r.hint);
    for (const o of r.options) assert.ok(o.win >= 0 && o.win <= 1);
  }
});
