import assert from "node:assert/strict";
import { test } from "node:test";
import { moves } from "./game.ts";
import { replay, type Setup } from "./replay.ts";
import { review } from "./review.ts";

const setup: Setup = { players: 3, seed: 7, first: 0, bots: ["default", "default", "default"] };
const log = replay(setup, []).decisions.map((d) => d.choice);
const all = (...[game, p, left]: Parameters<typeof moves>) => [null, ...moves(game, p, left)];

test("a review plays out what the player chose and what the Hint would at each of their decisions", () => {
  const rows = [...review(setup, log, 1, all, { deals: 8, top: 3, cap: 4 })];
  assert.ok(rows.filter((r) => r.kind === "move").length > 5);
  assert.ok(rows.some((r) => r.kind === "pay"));
  for (const r of rows) {
    assert.deepEqual([log[r.n].seat, log[r.n].kind], [1, r.kind]);
    // a game the default player played: its choice is the Hint's
    assert.equal(r.chose, r.hint, `${r.kind} ${r.n}`);
    const keys = r.options.map((o) => o.key);
    assert.ok(keys.includes(r.chose) && (r.kind !== "move" || keys.includes(r.hard!)));
    assert.ok(r.options.length >= 2 && r.options.length <= 4 && r.options.every((o) => o.win >= 0 && o.win <= 1));
  }
});

test("workers sharing a review cover every play once, with the same numbers", () => {
  const whole = [...review(setup, log, 1, all, { deals: 8 })];
  const parts = [0, 1, 2].flatMap((i) => [...review(setup, log, 1, all, { deals: 8, part: [i, 3] })]).sort((a, b) => a.n - b.n);
  assert.deepEqual(parts, whole);
});
